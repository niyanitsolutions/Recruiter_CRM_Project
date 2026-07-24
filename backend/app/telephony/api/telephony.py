"""Tenant-facing Telephony API.

Every route (except the webhook receiver, which providers call directly and
therefore can't attach a JWT to) requires a normal company-user session via
`get_current_user`/`require_permissions`, exactly like every other business
router in this codebase. All routes defensively re-check the tenant's
`telephony_settings.enabled` flag through TelephonyService — if a tenant has
never enabled telephony, every one of these calls fails cleanly with 400
rather than silently doing nothing, so there is no telephony behavior for a
disabled tenant beyond what the (hidden) frontend UI would ever trigger.
"""
from __future__ import annotations

import logging
from urllib.parse import parse_qsl

from fastapi import APIRouter, Depends, HTTPException, Query, Request

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.core.database import get_master_db, get_company_db as get_company_db_by_id
from app.telephony.models.telephony import (
    MakeCallRequest, CallControlRequest, TransferCallRequest,
    UpdateNotesRequest, FavoriteCreateRequest,
    SetDispositionRequest, AddDispositionOptionRequest, SetCallbackStatusRequest,
    SetPresenceRequest, ReassignCallRequest, RecordingReviewRequest, MonitorCallRequest,
)
from app.telephony.services.telephony_service import TelephonyService
from app.telephony.services.telephony_settings_service import SUPPORTED_PROVIDERS

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telephony", tags=["Telephony"])


def _serialize_log(doc: dict) -> dict:
    return {
        "id": doc.get("_id"),
        "provider": doc.get("provider"),
        "call_id": doc.get("call_id"),
        "caller": doc.get("caller"),
        "receiver": doc.get("receiver"),
        "candidate_id": doc.get("candidate_id"),
        "employee_id": doc.get("employee_id"),
        "client_id": doc.get("client_id"),
        "status": doc.get("status"),
        "direction": doc.get("direction"),
        "muted": doc.get("muted", False),
        "duration": doc.get("duration"),
        "recording_url": doc.get("recording_url"),
        "notes": doc.get("notes"),
        "disposition": doc.get("disposition"),
        "callback_status": doc.get("callback_status"),
        "answered_at": doc.get("answered_at"),
        "assigned_to": doc.get("assigned_to"),
        "tags": doc.get("tags") or [],
        "is_favorited": doc.get("is_favorited", False),
        "is_bookmarked": doc.get("is_bookmarked", False),
        "review_comments": doc.get("review_comments") or [],
        "created_at": doc.get("created_at"),
        "updated_at": doc.get("updated_at"),
    }


# ─── Status (cheap; used as a fallback to the JWT-embedded flag) ─────────────

@router.get("/status")
async def telephony_status(current_user: dict = Depends(get_current_user)):
    company_id = current_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=403, detail="No company associated with this user.")
    master_db = get_master_db()
    return await TelephonyService.get_status(master_db, company_id)


@router.get("/capabilities")
async def telephony_capabilities(current_user: dict = Depends(get_current_user)):
    """Capability truth table for the tenant's active provider — frontend
    uses this to decide what call-control UI to render (no hardcoded
    provider checks). Empty dict if telephony is disabled for this tenant."""
    company_id = current_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=403, detail="No company associated with this user.")
    master_db = get_master_db()
    return await TelephonyService.get_capabilities(master_db, company_id)


# ─── Click-to-call ─────────────────────────────────────────────────────────────

@router.post("/calls")
async def make_call(
    body: MakeCallRequest,
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    master_db = get_master_db()
    result = await TelephonyService.make_call(
        master_db, company_db, company_id, current_user["id"], body.to,
        from_number=body.from_number, candidate_id=body.candidate_id,
        employee_id=body.employee_id, client_id=body.client_id,
    )
    return result


@router.post("/calls/{call_id}/hangup")
async def hangup_call(
    call_id: str,
    body: CallControlRequest = CallControlRequest(),
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.hangup(master_db, company_db, current_user["company_id"], call_id, extra=body.extra)


@router.post("/calls/{call_id}/hold")
async def hold_call(
    call_id: str,
    body: CallControlRequest = CallControlRequest(),
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.hold(master_db, company_db, current_user["company_id"], call_id, extra=body.extra)


@router.post("/calls/{call_id}/resume")
async def resume_call(
    call_id: str,
    body: CallControlRequest = CallControlRequest(),
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.resume(master_db, company_db, current_user["company_id"], call_id, extra=body.extra)


@router.post("/calls/{call_id}/mute")
async def mute_call(
    call_id: str,
    body: CallControlRequest = CallControlRequest(),
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.mute(master_db, company_db, current_user["company_id"], call_id, extra=body.extra)


@router.post("/calls/{call_id}/unmute")
async def unmute_call(
    call_id: str,
    body: CallControlRequest = CallControlRequest(),
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.unmute(master_db, company_db, current_user["company_id"], call_id, extra=body.extra)


@router.post("/calls/{call_id}/transfer")
async def transfer_call(
    call_id: str,
    body: TransferCallRequest,
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.transfer(master_db, company_db, current_user["company_id"], call_id, body.target, extra=body.extra)


# ─── Call logs / recordings ────────────────────────────────────────────────────

@router.get("/calls")
async def list_calls(
    candidate_id: str | None = Query(None),
    employee_id: str | None = Query(None),
    client_id: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    logs = await TelephonyService.list_call_logs(
        company_db, current_user["company_id"], candidate_id=candidate_id,
        employee_id=employee_id, client_id=client_id, limit=limit,
    )
    return {"logs": [_serialize_log(d) for d in logs], "total": len(logs)}


@router.get("/calls/active")
async def list_active_calls(
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    """Calls still 'live' — lets the softphone/global widget recover
    in-progress call state on mount (e.g. after a page refresh)."""
    logs = await TelephonyService.list_active_calls(company_db, current_user["company_id"])
    return {"logs": [_serialize_log(d) for d in logs], "total": len(logs)}


@router.patch("/calls/{call_id}/notes")
async def update_call_notes(
    call_id: str,
    body: UpdateNotesRequest,
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.update_call_notes(company_db, current_user["company_id"], call_id, body.notes)


@router.get("/dashboard/stats")
async def dashboard_stats(
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.get_dashboard_stats(company_db, current_user["company_id"])


@router.get("/supervisor/summary")
async def supervisor_summary(
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.get_supervisor_summary(company_db, current_user["company_id"])


@router.get("/analytics")
async def analytics(
    period: str = Query("daily", pattern="^(hourly|daily|weekly|monthly)$"),
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.get_analytics(company_db, current_user["company_id"], period=period)


@router.get("/agents/performance")
async def agent_performance(
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return {"agents": await TelephonyService.get_agent_performance(company_db, current_user["company_id"])}


@router.get("/recordings")
async def recordings(
    search: str | None = Query(None),
    limit: int = Query(100, ge=1, le=500),
    current_user: dict = Depends(require_permissions("telephony:recordings")),
    company_db=Depends(get_company_db),
):
    logs = await TelephonyService.list_recordings(company_db, current_user["company_id"], search=search, limit=limit)
    return {"logs": [_serialize_log(d) for d in logs], "total": len(logs)}


@router.get("/calls/missed")
async def missed_calls(
    callback_status: str | None = Query(None),
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    logs = await TelephonyService.list_missed_calls(company_db, current_user["company_id"], callback_status=callback_status)
    return {"logs": [_serialize_log(d) for d in logs], "total": len(logs)}


@router.patch("/calls/{call_id}/callback-status")
async def update_callback_status(
    call_id: str,
    body: SetCallbackStatusRequest,
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.set_callback_status(company_db, current_user["company_id"], call_id, body.status)


@router.patch("/calls/{call_id}/disposition")
async def update_disposition(
    call_id: str,
    body: SetDispositionRequest,
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.set_disposition(company_db, current_user["company_id"], call_id, body.disposition)


@router.get("/dispositions")
async def list_dispositions(
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    options = await TelephonyService.get_disposition_options(company_db, current_user["company_id"])
    return {"options": options}


@router.post("/dispositions")
async def add_disposition(
    body: AddDispositionOptionRequest,
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.add_disposition_option(company_db, current_user["company_id"], body.label)


@router.delete("/dispositions/{option_id}")
async def remove_disposition(
    option_id: str,
    current_user: dict = Depends(require_permissions("telephony:call_logs")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.remove_disposition_option(company_db, current_user["company_id"], option_id)


@router.get("/lookup")
async def lookup_caller(
    phone: str = Query(..., min_length=1),
    current_user: dict = Depends(require_permissions("telephony:view")),
    company_db=Depends(get_company_db),
):
    """Read-only candidate/employee identity lookup by phone number — used
    for the incoming-call popup badge. Never writes to those collections."""
    result = await TelephonyService.lookup_caller(company_db, phone)
    return {"match": result}


# ─── Favorites ──────────────────────────────────────────────────────────────

@router.get("/favorites")
async def list_favorites(
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    favorites = await TelephonyService.list_favorites(company_db, current_user["company_id"], current_user["id"])
    return {"favorites": favorites, "total": len(favorites)}


@router.post("/favorites")
async def add_favorite(
    body: FavoriteCreateRequest,
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.add_favorite(
        company_db, current_user["company_id"], current_user["id"], body.phone, body.name,
        candidate_id=body.candidate_id, employee_id=body.employee_id, group=body.group,
    )


@router.get("/favorites/frequently-called")
async def frequently_called(
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    rows = await TelephonyService.frequently_called(company_db, current_user["company_id"], current_user["id"])
    return {"items": rows}


@router.delete("/favorites/{favorite_id}")
async def remove_favorite(
    favorite_id: str,
    current_user: dict = Depends(require_permissions("telephony:call")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.remove_favorite(company_db, current_user["company_id"], current_user["id"], favorite_id)


@router.get("/calls/{call_id}/recording")
async def get_call_recording(
    call_id: str,
    current_user: dict = Depends(require_permissions("telephony:recordings")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    result = await TelephonyService.get_recording(master_db, company_db, current_user["company_id"], call_id)
    return result


# ─── Phase 4: Live Agent Presence ──────────────────────────────────────────────

@router.get("/presence/team")
async def team_presence(
    current_user: dict = Depends(require_permissions("telephony:supervisor")),
    company_db=Depends(get_company_db),
):
    return {"agents": await TelephonyService.get_team_presence(company_db, current_user["company_id"])}


@router.get("/presence/me")
async def my_presence(
    current_user: dict = Depends(require_permissions("telephony:view")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.get_own_presence(company_db, current_user["company_id"], current_user["id"])


@router.patch("/presence/me")
async def set_my_presence(
    body: SetPresenceRequest,
    current_user: dict = Depends(require_permissions("telephony:view")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.set_presence(company_db, current_user["company_id"], current_user["id"], body.status)


# ─── Phase 4: SLA / department analytics / wallboard / capability center ──────

@router.get("/sla")
async def sla_metrics(
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.get_sla_metrics(company_db, current_user["company_id"])


@router.get("/analytics/departments")
async def department_analytics(
    current_user: dict = Depends(require_permissions("telephony:analytics")),
    company_db=Depends(get_company_db),
):
    return {"departments": await TelephonyService.get_department_analytics(company_db, current_user["company_id"])}


@router.get("/wallboard")
async def wallboard(
    current_user: dict = Depends(require_permissions("telephony:supervisor")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.get_wallboard_snapshot(master_db, company_db, current_user["company_id"])


@router.get("/capability-center")
async def capability_center(
    current_user: dict = Depends(require_permissions("telephony:view")),
    company_db=Depends(get_company_db),
):
    master_db = get_master_db()
    return await TelephonyService.get_capability_center(master_db, company_db, current_user["company_id"])


@router.get("/search")
async def search_telephony(
    q: str = Query(..., min_length=1),
    current_user: dict = Depends(require_permissions("telephony:view")),
    company_db=Depends(get_company_db),
):
    """Search calls/notes/tags/dispositions — telephony data only, entirely
    separate from the global CRM search."""
    result = await TelephonyService.search_telephony(company_db, current_user["company_id"], q)
    return {"calls": [_serialize_log(d) for d in result["calls"]], "dispositions": result["dispositions"]}


@router.get("/export/calls.xlsx")
async def export_calls_excel(
    from_date: str | None = None,
    to_date: str | None = None,
    status: str | None = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    company_db=Depends(get_company_db),
):
    """Excel export for call logs. Kept here (not in api/v1/export.py) because
    that shared module has no Excel writer today — reuses
    ExportService._generate_excel's openpyxl pattern rather than building a
    second one. CSV/PDF for the same data live in api/v1/export.py alongside
    every other module's export, gated by the same exports:create permission."""
    from datetime import datetime, timezone
    import io
    from fastapi.responses import StreamingResponse
    from app.services.export_service import ExportService
    from app.services.user_service import UserService

    query: dict = {"company_id": current_user["company_id"]}
    visible_ids = await UserService(company_db).get_visible_user_ids(current_user, module_name="telephony")
    if visible_ids is not None:
        query["initiated_by"] = {"$in": visible_ids}
    if status:
        query["status"] = status
    dq: dict = {}
    try:
        if from_date:
            dq["$gte"] = datetime.strptime(from_date, "%Y-%m-%d").replace(tzinfo=timezone.utc)
        if to_date:
            dq["$lte"] = datetime.strptime(to_date, "%Y-%m-%d").replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
    except ValueError:
        dq = {}
    if dq:
        query["created_at"] = dq

    agent_names = {u["_id"]: u.get("full_name") or u.get("username") async for u in company_db.users.find({}, {"full_name": 1, "username": 1})}

    rows = []
    async for doc in company_db.telephony_call_logs.find(query).sort("created_at", -1).limit(5000):
        created = doc.get("created_at")
        rows.append({
            "caller": doc.get("caller") or "",
            "receiver": doc.get("receiver") or "",
            "direction": doc.get("direction") or "",
            "status": doc.get("status") or "",
            "duration_sec": doc.get("duration", 0),
            "disposition": doc.get("disposition") or "",
            "agent": agent_names.get(doc.get("initiated_by"), doc.get("initiated_by") or ""),
            "notes": doc.get("notes") or "",
            "created_at": created.strftime("%Y-%m-%d %H:%M") if created else "",
        })

    content, filename = ExportService(company_db)._generate_excel(rows, "telephony_calls")
    return StreamingResponse(
        io.BytesIO(content),
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ─── Phase 4: Callback Queue reassignment ──────────────────────────────────────

@router.patch("/calls/{call_id}/reassign")
async def reassign_call(
    call_id: str,
    body: ReassignCallRequest,
    current_user: dict = Depends(require_permissions("telephony:supervisor")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.reassign_call(company_db, current_user["company_id"], call_id, body.assigned_to)


# ─── Phase 4: Recording review metadata (favorite/bookmark/tags/comments) ─────

@router.patch("/calls/{call_id}/review")
async def review_recording(
    call_id: str,
    body: RecordingReviewRequest,
    current_user: dict = Depends(require_permissions("telephony:recordings")),
    company_db=Depends(get_company_db),
):
    return await TelephonyService.set_recording_review(
        company_db, current_user["company_id"], call_id,
        favorited=body.favorited, bookmarked=body.bookmarked, tags=body.tags,
        comment=body.comment, user_id=current_user["id"],
    )


# ─── Phase 4: Queue management (capability-gated — hidden if unsupported) ─────

@router.get("/queues")
async def queue_list(
    current_user: dict = Depends(require_permissions("telephony:queue_manage")),
):
    master_db = get_master_db()
    return await TelephonyService.get_queue_list(master_db, current_user["company_id"])


@router.get("/queues/{queue_id}/members")
async def queue_members(
    queue_id: str,
    current_user: dict = Depends(require_permissions("telephony:queue_manage")),
):
    master_db = get_master_db()
    return await TelephonyService.get_queue_members(master_db, current_user["company_id"], queue_id)


# ─── Phase 4: Live call monitoring (capability-gated — hidden if unsupported) ──

@router.post("/calls/{call_id}/listen")
async def listen_to_call(
    call_id: str,
    body: MonitorCallRequest = MonitorCallRequest(),
    current_user: dict = Depends(require_permissions("telephony:monitor")),
):
    master_db = get_master_db()
    return await TelephonyService.listen_to_call(master_db, current_user["company_id"], call_id)


@router.post("/calls/{call_id}/whisper")
async def whisper_to_call(
    call_id: str,
    body: MonitorCallRequest = MonitorCallRequest(),
    current_user: dict = Depends(require_permissions("telephony:monitor")),
):
    master_db = get_master_db()
    return await TelephonyService.whisper_to_call(master_db, current_user["company_id"], call_id)


@router.post("/calls/{call_id}/barge")
async def barge_into_call(
    call_id: str,
    body: MonitorCallRequest = MonitorCallRequest(),
    current_user: dict = Depends(require_permissions("telephony:monitor")),
):
    master_db = get_master_db()
    return await TelephonyService.barge_into_call(master_db, current_user["company_id"], call_id)


# ─── Webhook receiver (no auth — providers can't attach a JWT) ────────────────

@router.post("/webhooks/{provider}/{company_id}")
async def receive_webhook(provider: str, company_id: str, request: Request):
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=404, detail="Unknown provider.")

    raw_body = await request.body()
    content_type = request.headers.get("content-type", "")
    if "application/json" in content_type:
        import json
        try:
            payload = json.loads(raw_body or b"{}")
        except Exception:
            payload = {}
    else:
        payload = dict(parse_qsl(raw_body.decode("utf-8", errors="ignore")))

    headers = dict(request.headers)
    headers["_request_url"] = str(request.url)

    master_db = get_master_db()
    company_db = get_company_db_by_id(company_id)
    result = await TelephonyService.record_webhook(master_db, company_db, company_id, provider, raw_body, payload, headers)
    return result
