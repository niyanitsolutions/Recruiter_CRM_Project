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
from app.api.v1.hrm_leaves import _resolve_hrm_employee_id

router = APIRouter(prefix="/hrm/calendar", tags=["HRM - Calendar"])


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
