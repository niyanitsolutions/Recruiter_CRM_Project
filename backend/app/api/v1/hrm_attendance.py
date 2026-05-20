"""HRM — Attendance API Routes"""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.attendance import (
    CheckInRequest, CheckOutRequest, ManualAttendanceUpdate, BreakRequest
)
from app.services.attendance_service import AttendanceService

router = APIRouter(prefix="/hrm/attendance", tags=["HRM - Attendance"])


@router.post("/check-in")
async def check_in(
    data: CheckInRequest,
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = data.employee_id or cu.get("hrm_employee_id") or cu["id"]
    client_ip = data.client_ip or request.client.host
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


@router.post("/check-out")
async def check_out(
    data: CheckOutRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = data.employee_id or cu.get("hrm_employee_id") or cu["id"]
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


@router.post("/break/start")
async def start_break(
    data: BreakRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    emp_id = data.employee_id or cu.get("hrm_employee_id") or cu["id"]
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
    emp_id = data.employee_id or cu.get("hrm_employee_id") or cu["id"]
    return await AttendanceService(db).end_break(emp_id, cu["company_id"])


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
