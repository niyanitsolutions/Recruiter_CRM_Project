"""HRM — Attendance API Routes"""
import logging
import re as _re
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.attendance import (
    CheckInRequest, CheckOutRequest, ManualAttendanceUpdate, BreakRequest
)
from app.services.attendance_service import AttendanceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hrm/attendance", tags=["HRM - Attendance"])


class OfficeIPSettings(BaseModel):
    enabled: bool = False
    approved_ips: List[str] = []


async def _resolve_emp_id(cu: dict, data_employee_id: Optional[str], db) -> str:
    """
    Resolve the employee ID for any attendance action.

    Priority:
      1. Explicitly passed in request body (admin marking for someone else).
      2. hrm_employee_id from JWT (fast path — most common after first login).
      3. hrm_employee_id from users collection (JWT stale but DB has it).
      4. Email match against hrm_employees (handles accounts not yet linked).

    On path 3 or 4, the bidirectional link is backfilled so future requests
    hit path 2 without a DB round-trip.

    Raises HTTPException(422) if no employee profile can be found.
    """
    # 1. Explicit employee_id in request (admin use-case)
    if data_employee_id:
        return data_employee_id

    # 2. JWT fast path
    emp_id = cu.get("hrm_employee_id")
    if emp_id:
        return emp_id

    # 3. Users collection (handles stale JWT after linking)
    user_doc = await db.users.find_one(
        {"_id": cu["id"]},
        {"hrm_employee_id": 1, "email": 1},
    )
    if user_doc:
        emp_id = user_doc.get("hrm_employee_id")
        if emp_id:
            return emp_id

        # 4. Email-based match (handles accounts where auto-link never ran)
        user_email = (user_doc.get("email") or "").strip()
        if user_email:
            emp_doc = await db.hrm_employees.find_one(
                {
                    "email": _re.compile(f"^{_re.escape(user_email)}$", _re.IGNORECASE),
                    "company_id": cu["company_id"],
                    "is_deleted": False,
                },
                {"_id": 1},
            )
            if emp_doc:
                emp_id = str(emp_doc["_id"])
                # Backfill bidirectional link so next request uses path 2
                await db.users.update_one(
                    {"_id": cu["id"]},
                    {"$set": {"hrm_employee_id": emp_id}},
                )
                await db.hrm_employees.update_one(
                    {"_id": emp_id},
                    {"$set": {"crm_user_id": cu["id"]}},
                )
                return emp_id

    raise HTTPException(
        status_code=422,
        detail="No employee profile found for your account. Please ask HR to create your employee profile.",
    )


async def _resolve_emp_id_optional(cu: dict, db) -> Optional[str]:
    """Like _resolve_emp_id but returns None instead of raising when not found."""
    try:
        return await _resolve_emp_id(cu, None, db)
    except HTTPException:
        return None


# ── Self-service today endpoint (no employee_id in URL) ──────────────────────

@router.get("/me/today")
async def get_me_today(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    """Return today's attendance record for the calling user.

    Also exposes the resolved employee_id so the frontend can use it for
    subsequent punch-in/out calls even when it is absent from the JWT.

    Returns null when the user has no linked employee profile.
    Returns {"employee_id": "..."} (with no check_in) when linked but not yet punched in.
    Returns the full attendance record merged with employee_id when punched in.
    """
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return None
    try:
        record = await AttendanceService(db).get_today(emp_id, cu["company_id"])
    except Exception as e:
        logger.error("get_today failed for employee %s: %s", emp_id, e, exc_info=True)
        record = None
    return {"employee_id": emp_id, **(record or {})}


# ── Punch In ──────────────────────────────────────────────────────────────────

@router.post("/check-in")
async def check_in(
    data: CheckInRequest,
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    forwarded = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    client_ip = data.client_ip or forwarded or (request.client.host if request.client else None)
    try:
        return await AttendanceService(db).check_in(
            employee_id=emp_id,
            company_id=cu["company_id"],
            marked_by=cu["id"],
            notes=data.notes or "",
            work_mode=data.work_mode.value if hasattr(data.work_mode, "value") else str(data.work_mode),
            client_ip=client_ip,
            latitude=data.latitude,
            longitude=data.longitude,
            geo_city=data.geo_city,
            geo_country=data.geo_country,
        )
    except ValueError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except Exception as e:
        logger.error("Attendance check-in failed for employee %s: %s", emp_id, e, exc_info=True)
        raise HTTPException(status_code=500, detail="Attendance check-in failed. Please try again.")


# ── Punch Out ─────────────────────────────────────────────────────────────────

@router.post("/check-out")
async def check_out(
    data: CheckOutRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    rec = await AttendanceService(db).check_out(
        employee_id=emp_id,
        company_id=cu["company_id"],
        marked_by=cu["id"],
        notes=data.notes or "",
        latitude=data.latitude,
        longitude=data.longitude,
        geo_city=data.geo_city,
        geo_country=data.geo_country,
    )
    if not rec:
        raise HTTPException(status_code=404, detail="No check-in record found for today")
    return rec


# ── Breaks ────────────────────────────────────────────────────────────────────

@router.post("/break/start")
async def start_break(
    data: BreakRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    rec = await AttendanceService(db).start_break(emp_id, cu["company_id"], data.reason or "")
    if not rec:
        raise HTTPException(status_code=400, detail="Cannot start break — check in first")
    return rec


@router.post("/break/end")
async def end_break(
    data: BreakRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    return await AttendanceService(db).end_break(emp_id, cu["company_id"])


# ── Read queries ──────────────────────────────────────────────────────────────

@router.get("/today/{employee_id}")
async def get_today(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    return await AttendanceService(db).get_today(employee_id, cu["company_id"])


@router.get("/monthly/{employee_id}")
async def get_monthly(
    employee_id: str,
    year: int,
    month: int,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    return await AttendanceService(db).get_monthly(employee_id, cu["company_id"], year, month)


@router.get("/team/today")
async def get_team_today(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:team"])),
):
    return await AttendanceService(db).get_team_today(cu["company_id"])


@router.post("/manual")
async def manual_update(
    data: ManualAttendanceUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:manage"])),
):
    return await AttendanceService(db).manual_update(cu["company_id"], data.model_dump(exclude_none=True))


# ── Office IP Management ──────────────────────────────────────────────────────

@router.get("/office-ips")
async def get_office_ips(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:settings:view"])),
):
    """Get current office IP restriction settings."""
    doc = await db["company_settings"].find_one({}) or {}
    return {
        "enabled": bool(doc.get("attendance_ip_restriction_enabled", False)),
        "approved_ips": doc.get("approved_office_ips", []),
    }


@router.put("/office-ips")
async def update_office_ips(
    data: OfficeIPSettings,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:settings:edit"])),
):
    """Update office IP restriction settings."""
    from datetime import datetime, timezone
    await db["company_settings"].update_one(
        {},
        {"$set": {
            "attendance_ip_restriction_enabled": data.enabled,
            "approved_office_ips": data.approved_ips,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": cu["id"],
        }},
        upsert=True,
    )
    return {"enabled": data.enabled, "approved_ips": data.approved_ips}
