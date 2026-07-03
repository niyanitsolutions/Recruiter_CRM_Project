"""HRM — Attendance API Routes"""
import csv
import io
import logging
import re as _re
from datetime import datetime, date, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from bson import ObjectId

from app.core.dependencies import (
    get_company_db, require_hrm_module, require_permissions, require_non_partner,
    require_any_permission,
)
from app.models.company.attendance import (
    CheckInRequest, CheckOutRequest, ManualAttendanceUpdate, BreakRequest,
    RecoverAttendanceRequest,
)
from app.services.attendance_service import AttendanceService, recover_missed_punch_outs

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hrm/attendance", tags=["HRM - Attendance"])


# ── Settings models ───────────────────────────────────────────────────────────

class AttendanceSettingsUpdate(BaseModel):
    office_start_time: str = Field("09:00", pattern=r"^\d{2}:\d{2}$")
    office_end_time:   str = Field("18:00", pattern=r"^\d{2}:\d{2}$")
    grace_minutes:          int   = Field(15,   ge=0,   le=120)
    half_day_hours:         float = Field(4.5,  ge=0.5, le=12.0)
    full_day_hours:         float = Field(8.0,  ge=1.0, le=24.0)
    max_break_minutes:      int   = Field(90,   ge=0,   le=480)
    max_breaks:             int   = Field(5,    ge=0,   le=20)
    wfh_enabled:            bool  = True
    geo_fence_enabled:      bool  = False
    geo_fence_radius_meters: int  = Field(100,  ge=10,  le=10000)
    geo_fence_latitude:     Optional[float] = Field(None, ge=-90,  le=90)
    geo_fence_longitude:    Optional[float] = Field(None, ge=-180, le=180)
    ip_restriction_enabled: bool  = False
    approved_ips:           List[str] = Field(default_factory=list)
    # Working days: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
    working_days:           List[int] = Field(default_factory=lambda: [0, 1, 2, 3, 4])


class OfficeIPSettings(BaseModel):
    enabled: bool = False
    approved_ips: List[str] = []


# ── Employee ID resolution ─────────────────────────────────────────────────────

async def _resolve_emp_id(
    cu: dict,
    data_employee_id: Optional[str],
    db,
    auto_create: bool = False,
) -> str:
    """
    Resolve the employee ID for any attendance action.

    Priority:
      1. Explicitly passed in request body (admin marking for someone else).
      2. hrm_employee_id from JWT (fast path — most common after first login).
      3. hrm_employee_id from users collection (JWT stale but DB has it).
      4. Email match against hrm_employees (handles accounts not yet linked).
      5. Auto-create minimal employee profile (only when auto_create=True).

    On paths 3-5, the bidirectional link is backfilled so future requests
    hit path 2 without a DB round-trip.

    Raises HTTPException(422) only when auto_create=False and no profile found.
    """
    # 1. Explicit employee_id in request (admin use-case) — requires manage permission
    if data_employee_id:
        own_emp_id = cu.get("hrm_employee_id")
        if data_employee_id != own_emp_id:
            perms = set(cu.get("permissions") or [])
            if not (cu.get("is_owner") or cu.get("is_super_admin") or
                    perms & {"hrm:attendance:manage", "hrm:attendance:edit"}):
                raise HTTPException(status_code=403, detail="Cannot submit attendance for another employee")
        return data_employee_id

    # 2. JWT fast path
    emp_id = cu.get("hrm_employee_id")
    if emp_id:
        return emp_id

    # 3. Users collection (handles stale JWT after linking)
    user_doc = await db.users.find_one(
        {"_id": cu["id"]},
        {"hrm_employee_id": 1, "email": 1, "full_name": 1},
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

    # 5. Auto-create minimal employee profile so ALL internal users can punch in.
    #    Only runs on write operations (auto_create=True) to avoid creating profiles
    #    from read operations like get_me_today.  HR can fill in details later.
    if auto_create and cu.get("user_type", "internal") != "partner":
        now = datetime.utcnow()
        count = await db.hrm_employees.count_documents({"company_id": cu["company_id"]})
        new_emp_id = str(ObjectId())
        full_name = (
            (user_doc or {}).get("full_name")
            or cu.get("full_name")
            or cu.get("username")
            or "Employee"
        )
        email = (
            (user_doc or {}).get("email")
            or cu.get("email")
            or ""
        )
        emp_doc = {
            "_id": new_emp_id,
            "company_id": cu["company_id"],
            "employee_id": f"EMP{(count + 1):04d}",
            "full_name": full_name,
            "email": email,
            "role": cu.get("role", ""),
            "crm_user_id": cu["id"],
            "employment_status": "active",
            "is_deleted": False,
            "created_at": now,
            "updated_at": now,
        }
        await db.hrm_employees.insert_one(emp_doc)
        await db.users.update_one(
            {"_id": cu["id"]},
            {"$set": {"hrm_employee_id": new_emp_id}},
        )
        logger.info(
            "Auto-created employee profile | company=%s | user=%s | emp=%s",
            cu["company_id"], cu["id"], new_emp_id,
        )
        return new_emp_id

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
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Return today's attendance record plus context for the calling user.

    Extended response includes holiday / weekend / leave flags so the frontend
    can decide whether to show the punch-in modal without an extra round-trip.

    Returns {"employee_id": null, "awaiting_profile": true} when the user has
    no linked employee profile yet (profile is auto-created on first punch-in).
    """
    # Layer-2 auto punch-out recovery: closes any orphan attendance records left
    # open from a previous day (e.g. server was offline past shift end).
    # Throttled per-company internally so dashboard loads stay cheap.
    try:
        await recover_missed_punch_outs(db, cu["company_id"], source="dashboard_recovery")
    except Exception:
        pass

    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"employee_id": None, "awaiting_profile": True}

    svc = AttendanceService(db)

    try:
        record = await svc.get_today(emp_id, cu["company_id"])
    except Exception as e:
        logger.error("get_today failed for employee %s: %s", emp_id, e, exc_info=True)
        record = None

    try:
        context = await svc.get_today_context(emp_id, cu["company_id"])
    except Exception as e:
        logger.warning("get_today_context failed for employee %s: %s", emp_id, e)
        context = {"is_weekend": False, "is_holiday": False, "holiday_name": None,
                   "is_on_leave": False, "leave": None}

    return {
        "employee_id": emp_id,
        **context,
        **(record or {}),
    }


# ── Punch In ──────────────────────────────────────────────────────────────────

@router.post("/check-in")
async def check_in(
    data: CheckInRequest,
    request: Request,
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    # is_self = True when no employee_id provided (self punch-in)
    # is_self = False when HR/admin marks for a specific employee
    is_self = not bool(data.employee_id)
    is_owner = bool(cu.get("is_owner", False))
    emp_id = await _resolve_emp_id(cu, data.employee_id, db, auto_create=True)
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
            is_self=is_self,
            is_owner=is_owner,
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
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
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
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    try:
        rec = await AttendanceService(db).start_break(emp_id, cu["company_id"], data.reason or "")
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not rec:
        raise HTTPException(status_code=400, detail="Cannot start break — check in first")
    return rec


@router.post("/break/end")
async def end_break(
    data: BreakRequest,
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id(cu, data.employee_id, db)
    return await AttendanceService(db).end_break(emp_id, cu["company_id"])


# ── Read queries ──────────────────────────────────────────────────────────────

@router.get("/today/{employee_id}")
async def get_today(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    is_own = cu.get("hrm_employee_id") == employee_id
    if not is_own:
        perms = set(cu.get("permissions") or [])
        if not perms & {"hrm:attendance:team", "hrm:attendance:view"}:
            raise HTTPException(status_code=403, detail="Access denied")
    return await AttendanceService(db).get_today(employee_id, cu["company_id"])


@router.get("/monthly/{employee_id}")
async def get_monthly(
    employee_id: str,
    year: int,
    month: int,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    is_own = cu.get("hrm_employee_id") == employee_id
    if not is_own:
        perms = set(cu.get("permissions") or [])
        if not perms & {"hrm:attendance:team", "hrm:attendance:view"}:
            raise HTTPException(status_code=403, detail="Access denied")
    return await AttendanceService(db).get_monthly(employee_id, cu["company_id"], year, month)


@router.get("/team/today")
async def get_team_today(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:view"]])),
):
    return await AttendanceService(db).get_team_today(cu["company_id"])


# ── Today stats (summary counters) ───────────────────────────────────────────

@router.get("/stats/today")
async def get_stats_today(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:view"]])),
):
    """Return all attendance counters for today.

    Used by the Attendance page summary cards.  Requires team-view permission
    so managers and HR can see aggregated numbers.
    """
    svc = AttendanceService(db)
    stats = await svc.get_today_stats(cu["company_id"])

    total_employees = await db["hrm_employees"].count_documents({
        "company_id": cu["company_id"],
        "is_deleted": False,
        "employment_status": "active",
    })
    today_str = date.today().isoformat()
    on_leave = await db["hrm_leaves"].count_documents({
        "company_id": cu["company_id"],
        "status": "approved",
        "from_date": {"$lte": today_str},
        "to_date": {"$gte": today_str},
    })
    absent = max(0, total_employees - stats["present"] - on_leave)

    return {
        "total_employees":   total_employees,
        "on_leave":          on_leave,
        "absent":            absent,
        **stats,
    }


# ── Date-range helpers ────────────────────────────────────────────────────────

def _parse_date_param(s: str) -> datetime:
    """Parse YYYY-MM-DD string → naive midnight datetime for MongoDB queries."""
    d = date.fromisoformat(s)
    return datetime(d.year, d.month, d.day)


def _csv_response(rows: list, fieldnames: list, filename: str) -> StreamingResponse:
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=fieldnames, extrasaction="ignore")
    writer.writeheader()
    writer.writerows(rows)
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _flatten_row(r: dict, include_employee: bool = True) -> dict:
    # Use `or ""` so None values (e.g. check_in on leave records) render as
    # empty strings in the CSV instead of the literal word "None".
    row = {
        "Date":          r.get("date", ""),
        "Status":        (r.get("status") or "").replace("_", " ").title(),
        "Leave Type":    (r.get("leave_type") or "").replace("_", " ").title(),
        "Check In":      r.get("check_in") or "",
        "Check Out":     r.get("check_out") or "",
        "Work Hours":    r.get("work_hours") or "",
        "Break (min)":   round(r.get("total_break_minutes") or 0),
        "Overtime (h)":  r.get("overtime_hours") or "",
        "Late By (min)": r.get("late_by_minutes") or 0,
        "Is Half Day":   "Yes" if r.get("is_half_day") else "No",
        "Work Mode":     (r.get("work_mode") or "").title(),
        "Auto Checkout": "Yes" if r.get("auto_punched_out") else "No",
        "Notes":         r.get("notes", ""),
    }
    if include_employee:
        row = {"Employee": r.get("employee_name", ""), **row}
    return row


# ── Aggregated stats for any date range ──────────────────────────────────────

@router.get("/stats/range")
async def get_stats_range(
    start_date: str,
    end_date:   str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:view"]])),
):
    """Return aggregated attendance counters + daily trend for any date range."""
    try:
        sd = _parse_date_param(start_date)
        ed = _parse_date_param(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
    if (ed - sd).days > 366:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days.")
    return await AttendanceService(db).get_range_stats(cu["company_id"], sd, ed)


# ── Historical range — team view ──────────────────────────────────────────────

@router.get("/history")
async def get_history(
    start_date: str,
    end_date:   str,
    employee_id: Optional[str] = None,
    status:      Optional[str] = None,
    work_mode:   Optional[str] = None,
    search:      Optional[str] = None,
    page:      int = Query(1,  ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:view"]])),
):
    """Return paginated team attendance records for a date range."""
    try:
        sd = _parse_date_param(start_date)
        ed = _parse_date_param(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
    if (ed - sd).days > 366:
        raise HTTPException(status_code=422, detail="Date range cannot exceed 366 days.")
    return await AttendanceService(db).get_history(
        cu["company_id"], sd, ed, employee_id, status, work_mode, search, page, page_size,
    )


# ── Historical range — personal (self-service) ────────────────────────────────

@router.get("/me/history")
async def get_my_history(
    start_date: str,
    end_date:   str,
    page:      int = Query(1,  ge=1),
    page_size: int = Query(62, ge=1, le=200),
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Return paginated attendance history for the calling user."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}
    try:
        sd = _parse_date_param(start_date)
        ed = _parse_date_param(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid date format. Use YYYY-MM-DD.")
    return await AttendanceService(db).get_my_history(
        emp_id, cu["company_id"], sd, ed, page, page_size,
    )


# ── CSV exports ───────────────────────────────────────────────────────────────

_TEAM_FIELDS = [
    "Employee", "Date", "Status", "Leave Type", "Check In", "Check Out",
    "Work Hours", "Break (min)", "Overtime (h)", "Late By (min)",
    "Is Half Day", "Work Mode", "Auto Checkout", "Notes",
]
_MY_FIELDS = [
    "Date", "Status", "Leave Type", "Check In", "Check Out",
    "Work Hours", "Break (min)", "Overtime (h)", "Late By (min)",
    "Is Half Day", "Work Mode", "Notes",
]


@router.get("/export/csv")
async def export_team_csv(
    start_date: str,
    end_date:   str,
    employee_id: Optional[str] = None,
    status:      Optional[str] = None,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:view"]])),
):
    """Download team attendance as CSV for the specified date range."""
    try:
        sd = _parse_date_param(start_date)
        ed = _parse_date_param(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid date format.")
    rows = await AttendanceService(db).export_data(cu["company_id"], sd, ed, employee_id, status)
    flat = [_flatten_row(r, include_employee=True) for r in rows]
    return _csv_response(flat, _TEAM_FIELDS, f"attendance_{start_date}_{end_date}.csv")


@router.get("/me/export/csv")
async def export_my_csv(
    start_date: str,
    end_date:   str,
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Download personal attendance as CSV for the specified date range."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        raise HTTPException(status_code=404, detail="No employee profile found.")
    try:
        sd = _parse_date_param(start_date)
        ed = _parse_date_param(end_date)
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid date format.")
    rows = await AttendanceService(db).export_data(cu["company_id"], sd, ed, emp_id)
    flat = [_flatten_row(r, include_employee=False) for r in rows]
    return _csv_response(flat, _MY_FIELDS, f"my_attendance_{start_date}_{end_date}.csv")


# ── Auto punch-out (admin / scheduler trigger) ───────────────────────────────

@router.post("/auto-checkout")
async def trigger_auto_checkout(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
    """Punch out all employees who are still checked in. Idempotent — safe to call multiple times."""
    count = await AttendanceService(db).auto_checkout_all(cu["company_id"], source="manual_admin")
    return {"punched_out": count, "company_id": cu["company_id"]}


class MarkAbsencesRequest(BaseModel):
    target_date: date = Field(..., description="Date to back-fill absences/weekends for (YYYY-MM-DD)")


@router.post("/mark-absences")
async def mark_absences(
    data: MarkAbsencesRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:manage"])),
):
    """Back-fill attendance records for every active employee on a past date.
    Working days with no record → ABSENT; weekends → WEEKEND; holidays → HOLIDAY.
    Existing records are never modified. Safe to re-run multiple times."""
    stats = await AttendanceService(db).mark_absences_for_date(cu["company_id"], data.target_date)
    return {**stats, "date": data.target_date.isoformat(), "company_id": cu["company_id"]}


# ── Manual update ─────────────────────────────────────────────────────────────

@router.post("/manual")
async def manual_update(
    data: ManualAttendanceUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
    return await AttendanceService(db).manual_update(cu["company_id"], data.model_dump(exclude_none=True))


# ── Attendance Recovery ───────────────────────────────────────────────────

@router.post("/{attendance_id}/recover")
async def recover_attendance(
    attendance_id: str,
    data: RecoverAttendanceRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
    """Reopen an accidentally closed attendance record.

    The recovery gap (accidental punch-out → now) is stored as a break so
    the employee's total worked hours remain accurate at final punch-out.
    An audit trail (recovery_sessions) records who recovered and why.
    """
    if not data.recovery_reason or not data.recovery_reason.strip():
        raise HTTPException(status_code=422, detail="Recovery reason is required")

    recovered_by_name = cu.get("full_name") or cu.get("username") or cu["id"]

    try:
        result = await AttendanceService(db).recover_attendance(
            attendance_id=attendance_id,
            company_id=cu["company_id"],
            recovered_by=cu["id"],
            recovered_by_name=recovered_by_name,
            recovery_reason=data.recovery_reason.strip(),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not result:
        raise HTTPException(status_code=404, detail="Attendance record not found")

    return result


# ── Attendance Settings ───────────────────────────────────────────────────────

@router.get("/settings")
async def get_attendance_settings(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
    """Return the full attendance configuration for this company."""
    doc = await db["company_settings"].find_one({}) or {}

    # Geo fence is sourced from `geo_fence_locations[0]` — the same list that
    # Company Settings → Security edits — so both screens always agree.
    # Legacy `attendance_geo_fence_*` fields are used only as a fallback for
    # tenants that saved from this screen before the two were unified.
    locations = doc.get("geo_fence_locations") or []
    primary = locations[0] if locations else {}
    geo_enabled = doc.get("geo_fence_enabled")
    if geo_enabled is None:
        geo_enabled = doc.get("attendance_geo_fence_enabled", False)

    return {
        "office_start_time":      doc.get("attendance_office_start",          "09:00"),
        "office_end_time":        doc.get("attendance_office_end",            "18:00"),
        "grace_minutes":          int(doc.get("attendance_grace_minutes",     15)),
        "half_day_hours":         float(doc.get("attendance_half_day_hours",  4.5)),
        "full_day_hours":         float(doc.get("attendance_full_day_hours",  8.0)),
        "max_break_minutes":      int(doc.get("attendance_max_break_minutes", 90)),
        "max_breaks":             int(doc.get("attendance_max_breaks",        5)),
        "wfh_enabled":            bool(doc.get("attendance_wfh_enabled",      True)),
        "geo_fence_enabled":      bool(geo_enabled),
        "geo_fence_radius_meters": int(primary.get("radius") or doc.get("attendance_geo_fence_radius_meters", 100)),
        "geo_fence_latitude":     primary.get("latitude", doc.get("attendance_geo_fence_latitude")),
        "geo_fence_longitude":    primary.get("longitude", doc.get("attendance_geo_fence_longitude")),
        "ip_restriction_enabled": bool(doc.get("attendance_ip_restriction_enabled", False)),
        "approved_ips":           doc.get("approved_office_ips", []),
        "working_days":           doc.get("attendance_working_days", [0, 1, 2, 3, 4]),
    }


@router.put("/settings")
async def update_attendance_settings(
    data: AttendanceSettingsUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
    """Save attendance configuration for this company."""
    # Write geo fence into `geo_fence_locations[0]` — the same canonical list
    # Company Settings → Security edits — instead of a separate single-point
    # field set, so both screens stay perfectly in sync automatically.
    # `attendance_geo_fence_*` are also mirrored for backward compatibility
    # with any legacy reader that hasn't migrated to the unified fields.
    existing_doc = await db["company_settings"].find_one({}) or {}
    existing_locations = existing_doc.get("geo_fence_locations") or []
    primary = dict(existing_locations[0]) if existing_locations else {}
    primary["id"] = primary.get("id") or "primary"
    primary["name"] = primary.get("name") or "Office"
    if data.geo_fence_latitude is not None:
        primary["latitude"] = data.geo_fence_latitude
    else:
        primary.setdefault("latitude", 0.0)
    if data.geo_fence_longitude is not None:
        primary["longitude"] = data.geo_fence_longitude
    else:
        primary.setdefault("longitude", 0.0)
    primary["radius"] = data.geo_fence_radius_meters
    new_locations = [primary] + list(existing_locations[1:])

    await db["company_settings"].update_one(
        {},
        {"$set": {
            "attendance_office_start":           data.office_start_time,
            "attendance_office_end":             data.office_end_time,
            "attendance_grace_minutes":          data.grace_minutes,
            "attendance_half_day_hours":         data.half_day_hours,
            "attendance_full_day_hours":         data.full_day_hours,
            "attendance_max_break_minutes":      data.max_break_minutes,
            "attendance_max_breaks":             data.max_breaks,
            "attendance_wfh_enabled":            data.wfh_enabled,
            "geo_fence_enabled":                 data.geo_fence_enabled,
            "geo_fence_locations":               new_locations,
            "attendance_geo_fence_enabled":      data.geo_fence_enabled,
            "attendance_geo_fence_radius_meters": data.geo_fence_radius_meters,
            "attendance_geo_fence_latitude":     data.geo_fence_latitude,
            "attendance_geo_fence_longitude":    data.geo_fence_longitude,
            "attendance_ip_restriction_enabled": data.ip_restriction_enabled,
            "approved_office_ips":               data.approved_ips,
            "attendance_working_days":           data.working_days,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": cu["id"],
        }},
        upsert=True,
    )
    return {"ok": True, **data.model_dump()}


# ── Office IP Management (legacy — kept for backwards compat) ─────────────────

@router.get("/office-ips")
async def get_office_ips(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
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
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:edit"]])),
):
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


# ── Comp Off Credits (Phase 4) ────────────────────────────────────────────────

@router.get("/comp-off/me")
async def get_my_comp_off(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return available comp off credits for the calling employee."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"credits": [], "total_available": 0.0}
    cursor = db["hrm_comp_off_credits"].find({
        "company_id":  cu["company_id"],
        "employee_id": emp_id,
        "is_deleted":  False,
        "status":      "available",
    }).sort("created_at", -1)
    credits = []
    total = 0.0
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at"):
            if isinstance(doc.get(f), datetime):
                doc[f] = doc[f].strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        credits.append(doc)
        total += float(doc.get("credits", 1.0))
    return {"credits": credits, "total_available": round(total, 2)}


@router.get("/comp-off/{employee_id}")
async def get_employee_comp_off(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:manage"]])),
):
    cursor = db["hrm_comp_off_credits"].find({
        "company_id":  cu["company_id"],
        "employee_id": employee_id,
        "is_deleted":  False,
    }).sort("created_at", -1)
    credits = []
    total = 0.0
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at"):
            if isinstance(doc.get(f), datetime):
                doc[f] = doc[f].strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        credits.append(doc)
        if doc.get("status") == "available":
            total += float(doc.get("credits", 1.0))
    return {"credits": credits, "total_available": round(total, 2)}
