"""HRM — Shift Assignment & Change Request API (Phase 5 + Phase 7)"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_shift_assignment import (
    ShiftAssignmentCreate, ShiftAssignmentUpdate,
    ShiftChangeRequestCreate, ShiftChangeRequestAction,
)
from app.services.hrm_shift_assignment_service import ShiftAssignmentService
from app.api.v1.hrm_attendance import _resolve_emp_id, _resolve_emp_id_optional

router = APIRouter(prefix="/hrm/shifts", tags=["HRM - Shift Assignments"])

_MANAGE = Depends(require_permissions(["hrm:attendance:manage"]))
_TEAM   = Depends(require_permissions(["hrm:attendance:team"]))


# ── Shift Assignments ──────────────────────────────────────────────────────────

@router.post("/assignments", status_code=201)
async def create_shift_assignment(
    data: ShiftAssignmentCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await ShiftAssignmentService(db).create_assignment(
            employee_id=data.employee_id,
            shift_id=data.shift_id,
            company_id=cu["company_id"],
            effective_from=data.effective_from,
            effective_to=data.effective_to,
            is_temporary=data.is_temporary,
            reason=data.reason,
            assigned_by=cu["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.get("/assignments")
async def list_shift_assignments(
    employee_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_TEAM,
):
    return await ShiftAssignmentService(db).list_assignments(
        company_id=cu["company_id"],
        employee_id=employee_id,
        page=page,
        page_size=page_size,
    )


@router.get("/assignments/me")
async def list_my_shift_assignments(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"items": [], "total": 0, "page": 1, "pages": 1}
    return await ShiftAssignmentService(db).list_assignments(
        company_id=cu["company_id"],
        employee_id=emp_id,
        page=page,
        page_size=page_size,
    )


@router.put("/assignments/{assignment_id}")
async def update_shift_assignment(
    assignment_id: str,
    data: ShiftAssignmentUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        result = await ShiftAssignmentService(db).update_assignment(
            assignment_id=assignment_id,
            company_id=cu["company_id"],
            data=data.model_dump(exclude_none=True),
            updated_by=cu["id"],
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return result


@router.delete("/assignments/{assignment_id}")
async def delete_shift_assignment(
    assignment_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    ok = await ShiftAssignmentService(db).delete_assignment(assignment_id, cu["company_id"], cu["id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Assignment not found")
    return {"ok": True}


@router.get("/assignments/active/{employee_id}")
async def get_active_assignment(
    employee_id: str,
    on_date: Optional[str] = Query(None),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    result = await ShiftAssignmentService(db).get_active_assignment(employee_id, cu["company_id"], on_date)
    return result or {}


# ── Shift Change Requests ──────────────────────────────────────────────────────

@router.post("/change-requests", status_code=201)
async def submit_shift_change_request(
    data: ShiftChangeRequestCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id(cu, None, db)
    emp = await db["hrm_employees"].find_one({"_id": emp_id, "company_id": cu["company_id"]})
    emp_name = emp.get("full_name", "") if emp else ""
    try:
        return await ShiftAssignmentService(db).create_change_request(
            employee_id=emp_id,
            company_id=cu["company_id"],
            requested_shift_id=data.requested_shift_id,
            effective_from=data.effective_from,
            effective_to=data.effective_to,
            reason=data.reason,
            emp_name=emp_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))


@router.get("/change-requests/me")
async def list_my_change_requests(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"items": [], "total": 0, "page": 1, "pages": 1}
    return await ShiftAssignmentService(db).list_change_requests(
        company_id=cu["company_id"], employee_id=emp_id, status=status, page=page, page_size=page_size,
    )


@router.post("/change-requests/{request_id}/cancel")
async def cancel_shift_change_request(
    request_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    emp_id = await _resolve_emp_id(cu, None, db)
    try:
        return await ShiftAssignmentService(db).cancel_change_request(request_id, cu["company_id"], emp_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/change-requests")
async def list_all_change_requests(
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_TEAM,
):
    return await ShiftAssignmentService(db).list_change_requests(
        company_id=cu["company_id"], status=status, page=page, page_size=page_size,
    )


@router.post("/change-requests/{request_id}/approve")
async def approve_shift_change_request(
    request_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await ShiftAssignmentService(db).approve_change_request(request_id, cu["company_id"], cu["id"])
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.post("/change-requests/{request_id}/reject")
async def reject_shift_change_request(
    request_id: str,
    data: ShiftChangeRequestAction,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await ShiftAssignmentService(db).reject_change_request(
            request_id, cu["company_id"], cu["id"], data.review_reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
