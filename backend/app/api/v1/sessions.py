"""
Session Management API
---------------------
Endpoints for active-session listing, revoking individual sessions,
revoking all other sessions, a heartbeat (keep-alive + pending-request
polling), and a WebSocket channel for real-time session events.

All endpoints (except WS) require a valid access token.
"""

import asyncio
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect, status, Query
from pydantic import BaseModel

from app.core.database import get_master_db, get_company_db
from app.core.ws_manager import ws_manager
from app.core.security import verify_access_token
from app.middleware.auth import get_current_user, AuthContext

logger = logging.getLogger(__name__)
router = APIRouter()

# ── Pydantic models ────────────────────────────────────────────────────────────

class SessionOut(BaseModel):
    session_id:   str
    device_info:  str
    ip_address:   str
    login_time:   Optional[str]
    last_active:  Optional[str]
    is_current:   bool
    expires_at:   Optional[str]


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
        sessions.append(SessionOut(
            session_id  = str(doc["_id"]),
            device_info = doc.get("device_info",  "Unknown device"),
            ip_address  = doc.get("ip_address",   "Unknown"),
            login_time  = _fmt(doc.get("created_at")),
            last_active = _fmt(doc.get("last_active_at") or doc.get("created_at")),
            is_current  = str(doc["_id"]) == auth.jti,
            expires_at  = _fmt(doc.get("expires_at")),
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

    await master_db.sessions.update_one(
        {"_id": session_id},
        {"$set": {"is_active": False, "revoked_at": datetime.now(timezone.utc)}}
    )

    # Notify the affected connection via WebSocket so the device gets the
    # "Session ended by another device" modal immediately.
    if session_id != auth.jti:
        await ws_manager.send_to_user(auth.user_id, {
            "type":    "session_revoked",
            "session_id": session_id,
            "message": "Your session on another device has been terminated.",
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
            "user_id":  auth.user_id,
            "is_active": True,
            "_id":      {"$ne": auth.jti},
        },
        {"$set": {"is_active": False, "revoked_at": now}}
    )

    # Notify connected other devices
    await ws_manager.send_to_user(auth.user_id, {
        "type":    "all_sessions_revoked",
        "except":  auth.jti,
        "message": "You have been logged out by the account owner.",
    })

    return {
        "success": True,
        "revoked_count": result.modified_count,
        "message": f"Revoked {result.modified_count} other session(s).",
    }


# ── POST /sessions/heartbeat — keep-alive + pending notification poll ─────────

@router.post("/sessions/heartbeat")
async def session_heartbeat(auth: AuthContext = Depends(get_current_user)):
    """
    Called periodically by the frontend (~every 5 min).
    Extends the current session's expires_at by 24 h from now and updates
    last_active_at.  Returns any pending login requests so the frontend can
    show the approval modal even without WebSocket.
    """
    master_db = get_master_db()
    now       = datetime.now(timezone.utc)

    # Extend session
    await master_db.sessions.update_one(
        {"_id": auth.jti, "is_active": True},
        {"$set": {
            "last_active_at": now,
            "expires_at":     now + timedelta(hours=24),
        }}
    )

    # Check for pending login requests targeting this user
    pending = await master_db.login_requests.find_one({
        "target_user_id": auth.user_id,
        "status":         "pending",
        "expires_at":     {"$gt": now},
    })

    return {
        "ok":      True,
        "pending_request": {
            "request_id":  str(pending["_id"]),
            "device_info": pending.get("requester_device", ""),
            "ip_address":  pending.get("requester_ip",     ""),
            "requested_at": _fmt(pending.get("created_at")),
        } if pending else None,
    }


# ── POST /sessions/request-access — Device B asks Device A for permission ─────

class AccessRequestBody(BaseModel):
    identifier: str
    password:   str
    company_code: Optional[str] = None


@router.post("/sessions/request-access")
async def request_access(
    body: AccessRequestBody,
    request_obj = None,
):
    """
    Device B received a 409 (active session).  Instead of force-logging-in,
    it submits credentials here to create a "pending" login_request document
    and immediately pushes a real-time notification to Device A via WebSocket.

    Returns a request_id so Device B can poll / listen for the result.
    """
    from app.services.auth_service import auth_service
    from app.core.tenant_resolver import tenant_resolver
    from app.core.security import verify_password
    from app.core.database import get_master_db as _master

    master_db = _master()

    # Lightweight credential check — we need the user_id without creating a session
    result, error = await auth_service.login(
        body.identifier, body.password,
        company_code=body.company_code,
        force_login=False,
    )

    # Either success (shouldn't happen if the session is still active) or ACTIVE_SESSION
    if error and "ACTIVE_SESSION" not in error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials.")

    # Resolve user_id from the ACTIVE_SESSION error (or from a fresh result dict)
    import json as _json
    import re as _re

    user_id = None
    session_info = {}
    if error and "ACTIVE_SESSION" in error:
        _raw = error.split("|", 1)[1] if "|" in error else "{}"
        try:
            session_info = _json.loads(_raw)
        except Exception:
            pass

        # Fetch user_id from master_db.sessions based on device_info/ip
        # Simpler: find the user via the global_users or tenants lookup
        identifier_lower = body.identifier.lower().strip()
        gu = await master_db.global_users.find_one({"$or": [{"email": identifier_lower}, {"mobile": body.identifier}]})
        if gu:
            # find the active session to get user_id
            active_sess = await master_db.sessions.find_one({
                "is_active":  True,
                "expires_at": {"$gt": datetime.now(timezone.utc)},
            }, sort=[("created_at", -1)])
            # We can't easily get user_id without re-resolving, so just use the login result user_id
            # For now, look up via global user map
            mapping = await master_db.user_company_map.find_one({"global_user_id": gu["_id"], "status": "active"})
            if mapping:
                user_id = str(mapping["local_user_id"])
    elif result:
        user_id = result.get("user_id")

    if not user_id:
        raise HTTPException(status_code=400, detail="Could not identify active session owner.")

    # Create login_requests document with 5-minute TTL
    now        = datetime.now(timezone.utc)
    request_id = str(uuid.uuid4())
    ip_address = ""
    device_info = ""

    await master_db.login_requests.insert_one({
        "_id":             request_id,
        "target_user_id":  user_id,
        "requester_device": device_info,
        "requester_ip":    ip_address,
        "status":          "pending",
        "created_at":      now,
        "expires_at":      now + timedelta(minutes=5),
        "identifier":      body.identifier,
    })

    # Push real-time notification to Device A
    notified = await ws_manager.send_to_user(user_id, {
        "type":        "login_request",
        "request_id":  request_id,
        "device_info": device_info,
        "ip_address":  ip_address,
        "requested_at": now.isoformat(),
        "message":     "Someone is requesting access to your account from another device.",
    })

    return {
        "request_id":   request_id,
        "status":       "pending",
        "notified_ws":  notified,
        "expires_in":   300,  # seconds
        "message":      "Login request sent. Waiting for approval from the active device.",
    }


# ── POST /sessions/approve-request ───────────────────────────────────────────

class ApproveBody(BaseModel):
    request_id: str


@router.post("/sessions/approve-request")
async def approve_request(body: ApproveBody, auth: AuthContext = Depends(get_current_user)):
    """
    Device A approves Device B's login request.
    - Marks the request as approved
    - Notifies Device B via WebSocket
    - Device A's session will be revoked on the next heartbeat/auth call
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
    await master_db.login_requests.update_one(
        {"_id": body.request_id},
        {"$set": {"status": "approved", "responded_at": now}}
    )

    # Revoke Device A's own session so the forced login on Device B proceeds
    await master_db.sessions.update_one(
        {"_id": auth.jti},
        {"$set": {"is_active": False, "revoked_at": now}}
    )

    # Notify Device B (the requester) — it will now call /auth/force-logout-and-login
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
# Public endpoint — no auth token required. Device B has no session yet while
# it waits for approval, so it cannot use the authenticated heartbeat endpoint.

@router.get("/sessions/request-status/{request_id}")
async def get_request_status(request_id: str):
    """
    Return the current status of a login_request document.
    Called by Device B while polling for Device A's approval or denial.

    Returns { status: 'pending' | 'approved' | 'denied' | 'expired' }
    """
    master_db = get_master_db()
    now = datetime.now(timezone.utc)

    req = await master_db.login_requests.find_one({"_id": request_id})
    if not req:
        raise HTTPException(status_code=404, detail="Request not found.")

    # Check if TTL has passed even if DB still says 'pending'
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

    Authentication: pass `?token=<access_token>` as a query parameter.
    The connection is rejected (close 4001) if the token is invalid.

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
    if not user_id:
        await websocket.close(code=4001, reason="Invalid token payload")
        return

    await ws_manager.connect(user_id, websocket)
    logger.info("WS session opened | user=%s", user_id)

    try:
        while True:
            # Send a keepalive ping every 30 seconds.
            # The client should ignore unknown messages gracefully.
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
        logger.info("WS session closed | user=%s", user_id)
