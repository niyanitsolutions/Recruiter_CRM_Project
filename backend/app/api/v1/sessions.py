"""
Session Management API
---------------------
Endpoints for active-session listing, revoking individual sessions,
revoking all other sessions, a heartbeat (keep-alive + pending-request
polling), and a WebSocket channel for real-time session events.

All endpoints (except WS and request-status) require a valid access token.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket, WebSocketDisconnect, status, Query
from pydantic import BaseModel

from app.core.database import get_master_db, get_company_db
from app.core.ws_manager import ws_manager
from app.core.security import verify_access_token
from app.middleware.auth import get_current_user, AuthContext

logger = logging.getLogger(__name__)
router = APIRouter()

# A session is treated as TRULY ACTIVE only if a heartbeat arrived within this window.
# Must match SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS in auth_service.py.
_TRULY_ACTIVE_THRESHOLD_SECONDS = 120

# Cleanup sweep: how often to run + how long without heartbeat = idle
_CLEANUP_INTERVAL_SECONDS = 300       # sweep every 5 minutes
_IDLE_MARK_THRESHOLD_SECONDS = 300    # no heartbeat for 5 min → mark IDLE (not terminated)


# ── Pydantic models ────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    session_id:     str
    device_info:    str
    ip_address:     str
    login_time:     Optional[str]
    last_active:    Optional[str]
    is_current:     bool
    expires_at:     Optional[str]
    session_status: str
    ws_connected:   bool


class RevokeRequest(BaseModel):
    session_id: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _fmt(dt: Optional[datetime]) -> Optional[str]:
    if dt is None:
        return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.isoformat()


# ── GET /sessions — list active sessions for the current user ─────────────────

@router.get("/sessions")
async def list_sessions(auth: AuthContext = Depends(get_current_user)):
    """Return all active sessions for the authenticated user, newest first."""
    master_db = get_master_db()
    now       = datetime.now(timezone.utc)

    cursor = master_db.sessions.find(
        {
            "user_id":    auth.user_id,
            "is_active":  True,
            "expires_at": {"$gt": now},
        },
        sort=[("created_at", -1)]
    )
    docs = await cursor.to_list(length=50)

    sessions = []
    for doc in docs:
        last_act = doc.get("last_activity_at") or doc.get("last_active_at") or doc.get("created_at")
        sessions.append(SessionOut(
            session_id     = str(doc["_id"]),
            device_info    = doc.get("device_info",  "Unknown device"),
            ip_address     = doc.get("ip_address",   "Unknown"),
            login_time     = _fmt(doc.get("created_at")),
            last_active    = _fmt(last_act),
            is_current     = str(doc["_id"]) == auth.jti,
            expires_at     = _fmt(doc.get("expires_at")),
            session_status = doc.get("session_status", "active"),
            ws_connected   = ws_manager.is_connected(auth.user_id),
        ))

    return {"sessions": [s.model_dump() for s in sessions]}


# ── DELETE /sessions/{session_id} — revoke a specific session ────────────────

@router.delete("/sessions/{session_id}")
async def revoke_session(session_id: str, auth: AuthContext = Depends(get_current_user)):
    """
    Revoke a specific session by its ID.
    Users may only revoke their own sessions.
    """
    master_db = get_master_db()
    doc = await master_db.sessions.find_one({"_id": session_id})
    if not doc or doc.get("user_id") != auth.user_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found.")

    now = datetime.now(timezone.utc)
    await master_db.sessions.update_one(
        {"_id": session_id},
        {"$set": {
            "is_active":      False,
            "session_status": "terminated",
            "ended_at":       now,
            "revoked_at":     now,
        }}
    )

    if session_id != auth.jti:
        await ws_manager.send_to_user(auth.user_id, {
            "type":       "session_revoked",
            "session_id": session_id,
            "message":    "Your session on another device has been terminated.",
        })

    return {"success": True, "message": "Session revoked."}


# ── DELETE /sessions — revoke all sessions except the current one ─────────────

@router.delete("/sessions")
async def revoke_all_sessions(auth: AuthContext = Depends(get_current_user)):
    """
    Revoke all sessions for the authenticated user EXCEPT the current one.
    Useful for "Logout all other devices."
    """
    master_db = get_master_db()
    now       = datetime.now(timezone.utc)

    result = await master_db.sessions.update_many(
        {
            "user_id":   auth.user_id,
            "is_active": True,
            "_id":       {"$ne": auth.jti},
        },
        {"$set": {
            "is_active":      False,
            "session_status": "terminated",
            "ended_at":       now,
            "revoked_at":     now,
        }}
    )

    await ws_manager.send_to_user(auth.user_id, {
        "type":    "all_sessions_revoked",
        "except":  auth.jti,
        "message": "You have been logged out by the account owner.",
    })

    return {
        "success":       True,
        "revoked_count": result.modified_count,
        "message":       f"Revoked {result.modified_count} other session(s).",
    }


# ── POST /sessions/heartbeat — keep-alive + pending notification poll ─────────

class HeartbeatBody(BaseModel):
    ws_connected: bool = False


@router.post("/sessions/heartbeat")
async def session_heartbeat(
    body: HeartbeatBody = HeartbeatBody(),
    auth: AuthContext = Depends(get_current_user),
):
    """
    Called every 30 seconds by the frontend.
    Updates last_activity_at and session_status.
    Does NOT blindly extend expires_at — the 24-hour window from login is absolute.
    Returns any pending login requests so the frontend can show the approval modal
    even without a live WebSocket.
    """
    master_db = get_master_db()
    now       = datetime.now(timezone.utc)

    await master_db.sessions.update_one(
        {"_id": auth.jti, "is_active": True},
        {"$set": {
            "last_activity_at": now,
            "session_status":   "active",
        }}
    )

    pending = await master_db.login_requests.find_one({
        "target_user_id": auth.user_id,
        "status":         "pending",
        "expires_at":     {"$gt": now},
    })

    return {
        "ok": True,
        "pending_request": {
            "request_id":   str(pending["_id"]),
            "device_info":  pending.get("requester_device", ""),
            "ip_address":   pending.get("requester_ip",     ""),
            "requested_at": _fmt(pending.get("created_at")),
        } if pending else None,
    }


# ── POST /sessions/request-access — Device B asks Device A for permission ─────

class AccessRequestBody(BaseModel):
    identifier:   str
    password:     str
    company_code: Optional[str] = None


@router.post("/sessions/request-access")
async def request_access(body: AccessRequestBody, request: Request):
    """
    Device B received a 409 (active session). Instead of force-logging-in,
    it submits credentials here to create a pending login_request document
    and immediately pushes a real-time notification to Device A via WebSocket.

    Uses the same user-lookup path as /auth/login (resolve_login_context) so
    that target_user_id in login_requests always matches the JWT sub stored in
    the sessions collection.  This fixes the heartbeat fallback: Device A's
    heartbeat queries login_requests by auth.user_id (== JWT sub) and will now
    find the pending request even when the WebSocket push was missed.

    Returns a request_id so Device B can poll for the result.
    Raises 400 "NO_ACTIVE_SESSION" if the session died between the 409 and now,
    allowing Device B to retry a direct login immediately.
    """
    from app.core.tenant_resolver import tenant_resolver as _resolver
    from app.core.security import verify_password as _verify_pw

    master_db = get_master_db()
    now = datetime.now(timezone.utc)

    # ── Step 1: Resolve user via the same path as /auth/login ───────────────
    # company_code is the short tenant key (e.g. "abc") forwarded from the
    # 409 ACTIVE_SESSION response.  When provided it scopes the lookup to a
    # single tenant (no cross-tenant risk).  When absent the global search
    # across all tenants is used as a fallback.
    tenant, user, resolve_error = await _resolver.resolve_login_context(
        identifier=body.identifier.strip(),
        company_code=body.company_code,
    )

    if resolve_error or not user or not tenant:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    if not _verify_pw(body.password, user.get("password_hash", "")):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    user_id    = str(user.get("_id") or user.get("id", ""))
    company_id = tenant.get("company_id", "")

    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify account.")

    # ── Step 2: Verify there is still a truly active session ────────────────
    active_session = await master_db.sessions.find_one({
        "user_id":    user_id,
        "is_active":  True,
        "expires_at": {"$gt": now},
    })
    if not active_session:
        raise HTTPException(status_code=400, detail="NO_ACTIVE_SESSION")

    last_act = active_session.get("last_activity_at") or active_session.get("created_at")
    if last_act and last_act.tzinfo is None:
        last_act = last_act.replace(tzinfo=timezone.utc)
    heartbeat_alive = bool(
        last_act and (now - last_act).total_seconds() < _TRULY_ACTIVE_THRESHOLD_SECONDS
    )
    ws_alive = ws_manager.is_connected(user_id)

    if not heartbeat_alive and not ws_alive:
        raise HTTPException(status_code=400, detail="NO_ACTIVE_SESSION")

    # ── Step 3: Capture Device B info from the HTTP request ─────────────────
    forwarded_for = request.headers.get("x-forwarded-for", "")
    device_info   = (request.headers.get("user-agent", "") or "")[:200]
    ip_address    = (
        forwarded_for.split(",")[0].strip()
        if forwarded_for
        else (request.client.host if request.client else "")
    )

    # ── Step 4: Create login_request document ───────────────────────────────
    request_id = str(uuid.uuid4())
    await master_db.login_requests.insert_one({
        "_id":              request_id,
        "target_user_id":   user_id,
        "company_id":       company_id,
        "requester_device": device_info,
        "requester_ip":     ip_address,
        "status":           "pending",
        "created_at":       now,
        "expires_at":       now + timedelta(minutes=5),
        "identifier":       body.identifier,
    })

    # ── Step 5: Push real-time notification to Device A ──────────────────────
    notified = await ws_manager.send_to_user(user_id, {
        "type":         "login_request",
        "request_id":   request_id,
        "device_info":  device_info,
        "ip_address":   ip_address,
        "requested_at": now.isoformat(),
        "message":      "Someone is requesting access to your account from another device.",
    })

    logger.info(
        "[request_access] request_id=%s user_id=%s company_id=%s notified_ws=%s",
        request_id, user_id, company_id, notified,
    )

    return {
        "request_id":  request_id,
        "status":      "pending",
        "notified_ws": notified,
        "expires_in":  300,
        "message":     "Login request sent. Waiting for approval from the active device.",
    }


# ── POST /sessions/approve-request ───────────────────────────────────────────

class ApproveBody(BaseModel):
    request_id: str


@router.post("/sessions/approve-request")
async def approve_request(body: ApproveBody, auth: AuthContext = Depends(get_current_user)):
    """
    Device A approves Device B's login request.
    - Marks the request as approved
    - Sets Device A's own session status to REPLACED
    - Notifies Device B via WebSocket so it can proceed to login
    """
    master_db = get_master_db()
    req = await master_db.login_requests.find_one({"_id": body.request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.get("target_user_id") != auth.user_id:
        raise HTTPException(status_code=403, detail="Not authorized.")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

    now = datetime.now(timezone.utc)

    # ── Step 1: Mark Device A's session REPLACED before touching the request ──
    # This order is critical: Device B polls request-status and retries login
    # as soon as status == 'approved'. If we update status first, Device B may
    # attempt login before the session is marked inactive → hits a live session
    # → gets 409 ACTIVE_SESSION again. Marking the session first closes that
    # race window entirely.
    await master_db.sessions.update_one(
        {"_id": auth.jti},
        {"$set": {
            "is_active":      False,
            "session_status": "replaced",
            "ended_at":       now,
        }}
    )

    # ── Step 2: Clear active_session_token on the user document ───────────────
    # Belt-and-suspenders: even if Device B polls just after step 1, the login
    # liveness check `if user.get("active_session_token"):` returns falsy and is
    # skipped entirely — no session lookup needed. Handles both company_db users
    # and owner docs stored only in master_db.tenants.
    if auth.company_id:
        try:
            cdb = get_company_db(auth.company_id)
            await cdb.users.update_one(
                {"_id": auth.user_id},
                {"$set": {"active_session_token": None}}
            )
        except Exception as _e:
            logger.warning("[approve_request] active_session_token clear failed: %s", _e)

    # ── Step 3: Mark the login request approved ────────────────────────────────
    # Session is already cleared — Device B can now login successfully.
    await master_db.login_requests.update_one(
        {"_id": body.request_id},
        {"$set": {"status": "approved", "responded_at": now}}
    )

    # ── Step 4: Notify Device B via WebSocket ─────────────────────────────────
    await ws_manager.send_to_user(auth.user_id, {
        "type":       "login_approved",
        "request_id": body.request_id,
        "message":    "Login request approved. You can now sign in.",
    })

    return {"success": True, "message": "Access approved. Your current session has been ended."}


# ── POST /sessions/deny-request ──────────────────────────────────────────────

@router.post("/sessions/deny-request")
async def deny_request(body: ApproveBody, auth: AuthContext = Depends(get_current_user)):
    """Device A denies Device B's login request."""
    master_db = get_master_db()
    req = await master_db.login_requests.find_one({"_id": body.request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")
    if req.get("target_user_id") != auth.user_id:
        raise HTTPException(status_code=403, detail="Not authorized.")
    if req.get("status") != "pending":
        raise HTTPException(status_code=400, detail=f"Request is already {req['status']}.")

    await master_db.login_requests.update_one(
        {"_id": body.request_id},
        {"$set": {"status": "denied", "responded_at": datetime.now(timezone.utc)}}
    )

    await ws_manager.send_to_user(auth.user_id, {
        "type":       "login_denied",
        "request_id": body.request_id,
        "message":    "Login request denied by the active session.",
    })

    return {"success": True, "message": "Access denied."}


# ── GET /sessions/request-status/{request_id} — Device B polls for result ────

@router.get("/sessions/request-status/{request_id}")
async def get_request_status(request_id: str):
    """
    Return the current status of a login_request document.
    Public endpoint — Device B has no session while waiting for approval.

    Returns { status: 'pending' | 'approved' | 'denied' | 'expired' }
    """
    master_db = get_master_db()
    now = datetime.now(timezone.utc)

    req = await master_db.login_requests.find_one({"_id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    if req.get("status") == "pending" and req.get("expires_at"):
        expires_at = req["expires_at"]
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=timezone.utc)
        if now > expires_at:
            return {"status": "expired"}

    return {"status": req.get("status", "pending")}


# ── WebSocket /ws/session — real-time session events ─────────────────────────

@router.websocket("/ws/session")
async def session_websocket(
    websocket: WebSocket,
    token: str = Query(..., description="JWT access token for authentication"),
):
    """
    Persistent WebSocket connection for real-time session events.

    Authentication: pass ?token=<access_token> as a query parameter.
    The connection is rejected (close 4001) if the token is invalid.

    On disconnect the session is marked 'disconnected' (not terminated) so the
    next heartbeat or login can distinguish a normal tab close from a real logout.

    Events pushed to the client:
      session_revoked      — admin or user revoked this session
      all_sessions_revoked — "logout all other devices" triggered
      login_request        — another device is requesting access
      login_approved       — this device's request was approved
      login_denied         — this device's request was denied
      ping                 — keepalive (client should respond with pong)
    """
    payload = verify_access_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid or expired token")
        return

    user_id = payload.get("sub")
    jti     = payload.get("jti")
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token payload")
        return

    await ws_manager.connect(user_id, websocket)
    logger.info("WS session opened | user=%s jti=%s", user_id, jti)

    # Mark session as active + ws_connected when WS connects
    if jti:
        _mdb = get_master_db()
        await _mdb.sessions.update_one(
            {"_id": jti, "is_active": True},
            {"$set": {"session_status": "active", "last_activity_at": datetime.now(timezone.utc)}}
        )

    try:
        while True:
            await asyncio.sleep(30)
            try:
                await websocket.send_json({"type": "ping"})
            except Exception:
                break
    except WebSocketDisconnect:
        pass
    except asyncio.CancelledError:
        pass
    finally:
        ws_manager.disconnect(user_id, websocket)
        # Mark session as disconnected only if no other WS connection remains for this user
        if jti and not ws_manager.is_connected(user_id):
            try:
                _mdb = get_master_db()
                await _mdb.sessions.update_one(
                    {"_id": jti, "is_active": True},
                    {"$set": {
                        "session_status":  "disconnected",
                        "disconnected_at": datetime.now(timezone.utc),
                    }}
                )
            except Exception as _e:
                logger.warning("WS disconnect session update failed: %s", _e)
        logger.info("WS session closed | user=%s jti=%s", user_id, jti)


# ── Background cleanup loop ───────────────────────────────────────────────────

async def session_cleanup_loop() -> None:
    """
    Periodic background task that sweeps stale sessions.

    Every _CLEANUP_INTERVAL_SECONDS:
    - Marks EXPIRED any session where expires_at < now
    - Marks IDLE any active session with no heartbeat for > _IDLE_MARK_THRESHOLD_SECONDS
      (idle sessions still allow authenticated requests but will not block new logins)

    Imported and started in main.py lifespan.
    """
    while True:
        try:
            await asyncio.sleep(_CLEANUP_INTERVAL_SECONDS)
            master_db = get_master_db()
            now        = datetime.now(timezone.utc)
            idle_cutoff = now - timedelta(seconds=_IDLE_MARK_THRESHOLD_SECONDS)

            # Hard-expire sessions whose token window has closed
            expired = await master_db.sessions.update_many(
                {"is_active": True, "expires_at": {"$lt": now}},
                {"$set": {"is_active": False, "session_status": "expired", "ended_at": now}}
            )

            # Soft-mark sessions that haven't heartbeated recently as idle
            idle = await master_db.sessions.update_many(
                {
                    "is_active":        True,
                    "session_status":   {"$in": ["active", "disconnected"]},
                    "last_activity_at": {"$lt": idle_cutoff},
                },
                {"$set": {"session_status": "idle"}}
            )

            if expired.modified_count or idle.modified_count:
                logger.info(
                    "[session_cleanup] expired=%d  idle=%d",
                    expired.modified_count, idle.modified_count
                )
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.error("[session_cleanup] sweep error: %s", e)
