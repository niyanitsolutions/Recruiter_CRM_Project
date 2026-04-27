"""HRM — Attendance API Routes"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.attendance import CheckInRequest, CheckOutRequest, ManualAttendanceUpdate
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/hrm/attendance", tags=["HRM - Attendance"])


@router.post("/check-in")
async def check_in(
    data: CheckInRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = data.employee_id or cu["id"]
    return await AttendanceService(db).check_in(emp_id, cu["company_id"], cu["id"], data.notes or "")


@router.post("/check-out")
async def check_out(
    data: CheckOutRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = data.employee_id or cu["id"]
    rec = await AttendanceService(db).check_out(emp_id, cu["company_id"], cu["id"], data.notes or "")
    if not rec:
        raise HTTPException(status_code=404, detail="No check-in record found for today")
    return rec


@router.get("/today/{employee_id}")
async def get_today(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    return await AttendanceService(db).get_today(employee_id, cu["company_id"]) or {}


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
