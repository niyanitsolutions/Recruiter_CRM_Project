"""HRM — Company Calendar API.

Aggregates Holidays, Approved Leave, Approved WFH, and Approved Shift-Change
requests into one event list for a bounded date range, with permission-based
visibility enforced entirely server-side. Used by both the HRM Attendance
"Calendar" tab and the Employee Self-Service "My Portal" Calendar section —
the same endpoint naturally scopes results differently per caller.
"""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_company_db, require_hrm_module
from app.services.hrm_calendar_service import HrmCalendarService, MAX_RANGE_DAYS
from app.services.hrm_calendar_event_service import CompanyEventService, is_hr_or_owner
from app.models.company.hrm_calendar_event import CompanyEventCreate, CompanyEventUpdate
from app.api.v1.hrm_leaves import _resolve_hrm_employee_id

router = APIRouter(prefix="/hrm/calendar", tags=["HRM - Calendar"])


async def _self_emp_id(cu, db):
    try:
        return await _resolve_hrm_employee_id(cu, db)
    except HTTPException:
        return None


@router.get("/events")
async def get_calendar_events(
    date_from: date = Query(..., alias="from"),
    date_to: date = Query(..., alias="to"),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    if date_to < date_from:
        raise HTTPException(status_code=400, detail="'to' must be on or after 'from'.")
    if (date_to - date_from).days > MAX_RANGE_DAYS:
        raise HTTPException(status_code=400, detail=f"Date range cannot exceed {MAX_RANGE_DAYS} days.")

    try:
        self_employee_id = await _resolve_hrm_employee_id(cu, db)
    except HTTPException:
        self_employee_id = None  # no HRM profile — still show holidays, no personal events

    events = await HrmCalendarService(db).get_events(
        company_id=cu["company_id"],
        date_from=date_from,
        date_to=date_to,
        cu=cu,
        self_employee_id=self_employee_id,
    )
    return {"success": True, "data": events}


# ── Company Events CRUD (Part 4) ──────────────────────────────────────────────

@router.get("/company-events")
async def list_company_events(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Events the current user can manage (HR/owner → all; others → own)."""
    svc = CompanyEventService(db)
    items = await svc.list_manageable(cu["company_id"], cu)
    hr = is_hr_or_owner(cu)
    # A plain employee is read-only; a manager (has direct reports) may create for
    # their team. HR/owner may always create.
    if hr:
        can_create = True
    else:
        self_emp_id = await _self_emp_id(cu, db)
        can_create = bool(await svc._direct_report_ids(cu["company_id"], self_emp_id))
    return {"success": True, "data": items, "can_manage_all": hr, "can_create": can_create}


@router.post("/company-events", status_code=201)
async def create_company_event(
    data: CompanyEventCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    self_employee_id = await _self_emp_id(cu, db)
    event = await CompanyEventService(db).create(cu["company_id"], data, cu, self_employee_id)
    return {"success": True, "data": event}


@router.put("/company-events/{event_id}")
async def update_company_event(
    event_id: str,
    data: CompanyEventUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    event = await CompanyEventService(db).update(event_id, cu["company_id"], data, cu)
    if not event:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"success": True, "data": event}


@router.delete("/company-events/{event_id}", status_code=204)
async def delete_company_event(
    event_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    ok = await CompanyEventService(db).delete(event_id, cu["company_id"], cu)
    if not ok:
        raise HTTPException(status_code=404, detail="Event not found")
