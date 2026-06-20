"""HRM — Attendance Exception API Routes"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import (
    get_company_db, require_hrm_module,
    require_any_permission,
)
from app.models.company.attendance_exception import AttendanceExceptionCreate, AttendanceExceptionUpdate
from app.services.attendance_exception_service import AttendanceExceptionService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hrm/attendance/exceptions", tags=["HRM - Attendance Exceptions"])


# ── Create ─────────────────────────────────────────────────────────────────────

@router.post("")
async def create_exception(
    data: AttendanceExceptionCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:team"]])),
):
    """HR/Owner creates a temporary attendance access exception for an employee."""
    try:
        creator_name = cu.get("full_name") or cu.get("username") or cu["id"]
        return await AttendanceExceptionService(db).create_exception(
            company_id=cu["company_id"],
            employee_id=data.employee_id,
            reason=data.reason,
            from_datetime=data.from_datetime,
            to_datetime=data.to_datetime,
            allow_login=data.allow_login,
            bypass_geo_fence=data.bypass_geo_fence,
            bypass_ip_restriction=data.bypass_ip_restriction,
            created_by=cu["id"],
            created_by_name=creator_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("")
async def list_exceptions(
    employee_id: Optional[str] = None,
    include_expired: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:team"]])),
):
    """HR/Owner: list attendance exceptions for this company."""
    return await AttendanceExceptionService(db).list_exceptions(
        company_id=cu["company_id"],
        employee_id=employee_id,
        include_expired=include_expired,
        page=page,
        page_size=page_size,
    )


# ── Update ─────────────────────────────────────────────────────────────────────

@router.put("/{exception_id}")
async def update_exception(
    exception_id: str,
    data: AttendanceExceptionUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:team"]])),
):
    """HR/Owner: update an existing attendance exception."""
    try:
        return await AttendanceExceptionService(db).update_exception(
            exception_id=exception_id,
            company_id=cu["company_id"],
            updates=data.model_dump(exclude_none=True),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{exception_id}")
async def delete_exception(
    exception_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:team"]])),
):
    """HR/Owner: soft-delete an attendance exception."""
    ok = await AttendanceExceptionService(db).delete_exception(
        exception_id=exception_id,
        company_id=cu["company_id"],
    )
    if not ok:
        raise HTTPException(status_code=404, detail="Exception not found.")
    return {"ok": True}


# ── Check active for employee ──────────────────────────────────────────────────

@router.get("/check/{employee_id}")
async def check_active_exception(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:manage"], ["hrm:attendance:team"]])),
):
    """Return the active exception for an employee at the current time, if any."""
    exc = await AttendanceExceptionService(db).get_active_exception(
        employee_id=employee_id,
        company_id=cu["company_id"],
    )
    return {"active": exc}
