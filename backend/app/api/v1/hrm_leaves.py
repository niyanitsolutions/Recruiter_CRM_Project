"""HRM — Leave API Routes"""
from typing import Optional
from datetime import date
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.leave import LeaveApply, LeaveApproveReject
from app.services.leave_service import LeaveService

router = APIRouter(prefix="/hrm/leaves", tags=["HRM - Leaves"])


@router.post("", status_code=201)
async def apply_leave(
    data: LeaveApply,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    employee_name = cu.get("full_name") or cu.get("username", "")
    result = await LeaveService(db).apply(data.model_dump(), cu["id"], employee_name, cu["company_id"])
    try:
        from app.services.notification_service import NotificationService
        await NotificationService(db).notify_leave_applied(
            company_id=cu["company_id"],
            employee_user_id=cu["id"],
            employee_hrm_id=cu.get("hrm_employee_id"),
            employee_name=employee_name,
            leave_type=data.leave_type.value if hasattr(data.leave_type, "value") else str(data.leave_type),
            from_date=str(data.from_date),
            to_date=str(data.to_date),
            leave_id=result.get("id", ""),
        )
    except Exception:
        pass
    return result


@router.get("")
async def list_leaves(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    return await LeaveService(db).list(cu["company_id"], employee_id, status, page, page_size)


@router.get("/balance/{employee_id}")
async def get_balance(
    employee_id: str,
    year: Optional[int] = None,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    return await LeaveService(db).get_balance(employee_id, cu["company_id"], year or date.today().year)


@router.get("/{leave_id}")
async def get_leave(
    leave_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    leave = await LeaveService(db).get(leave_id, cu["company_id"])
    if not leave:
        raise HTTPException(status_code=404, detail="Leave not found")
    return leave


@router.post("/{leave_id}/action")
async def approve_reject(
    leave_id: str,
    data: LeaveApproveReject,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:team_approve"])),
):
    result = await LeaveService(db).approve_reject(
        leave_id, data.action, cu["id"], cu.get("username", ""),
        cu["company_id"], data.rejection_reason
    )
    if not result:
        raise HTTPException(status_code=404, detail="Leave not found")
    try:
        from app.services.notification_service import NotificationService
        leave_type = result.get("leave_type", "")
        if hasattr(leave_type, "value"):
            leave_type = leave_type.value
        await NotificationService(db).notify_leave_actioned(
            company_id=cu["company_id"],
            employee_user_id=result.get("employee_id", ""),
            action=data.action,
            leave_type=str(leave_type),
            from_date=str(result.get("from_date", "")),
            to_date=str(result.get("to_date", "")),
            leave_id=leave_id,
        )
    except Exception:
        pass
    return result
