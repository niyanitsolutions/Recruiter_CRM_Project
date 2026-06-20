"""HRM — Work Mode Request API Routes"""
import logging
import re as _re
from datetime import date
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import (
    get_company_db, require_hrm_module, require_non_partner,
    require_any_permission,
)
from app.models.company.work_mode_request import WorkModeRequestCreate, WorkModeRequestAction
from app.services.work_mode_request_service import WorkModeRequestService
from app.api.v1.hrm_attendance import _resolve_emp_id, _resolve_emp_id_optional

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/hrm/work-mode", tags=["HRM - Work Mode Requests"])


# ── Employee: submit a request ─────────────────────────────────────────────────

@router.post("/requests")
async def create_work_mode_request(
    data: WorkModeRequestCreate,
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Employee submits a WFH / Hybrid / Field Work request for approval."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        raise HTTPException(status_code=422, detail="No employee profile found. Please ask HR to create your profile.")

    try:
        return await WorkModeRequestService(db).create_request(
            company_id=cu["company_id"],
            employee_id=emp_id,
            crm_user_id=cu["id"],
            work_mode=data.work_mode.value,
            from_date=data.from_date,
            to_date=data.to_date,
            reason=data.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Employee: view own requests ────────────────────────────────────────────────

@router.get("/requests/me")
async def list_my_work_mode_requests(
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Return paginated list of the calling employee's work mode requests."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size, "pages": 1}
    return await WorkModeRequestService(db).list_requests(
        company_id=cu["company_id"],
        employee_id=emp_id,
        status=status,
        page=page,
        page_size=page_size,
    )


# ── Employee: cancel own request ───────────────────────────────────────────────

@router.post("/requests/{request_id}/cancel")
async def cancel_work_mode_request(
    request_id: str,
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Employee cancels their own pending or approved work mode request."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        raise HTTPException(status_code=422, detail="No employee profile found.")
    try:
        return await WorkModeRequestService(db).cancel_request(
            request_id=request_id,
            company_id=cu["company_id"],
            employee_id=emp_id,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── Employee: get active work mode for today ───────────────────────────────────

@router.get("/me/active")
async def get_my_active_work_mode(
    cu: dict = Depends(require_non_partner),
    db=Depends(get_company_db),
):
    """Return the approved work mode request active for today (if any)."""
    emp_id = await _resolve_emp_id_optional(cu, db)
    if not emp_id:
        return {"active": None}
    active = await WorkModeRequestService(db).get_active_work_mode(
        employee_id=emp_id,
        company_id=cu["company_id"],
    )
    return {"active": active}


# ── HR / Owner: list all requests ─────────────────────────────────────────────

@router.get("/requests")
async def list_work_mode_requests(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:manage"]])),
):
    """HR/Owner: paginated list of all work mode requests for this company."""
    return await WorkModeRequestService(db).list_requests(
        company_id=cu["company_id"],
        employee_id=employee_id,
        status=status,
        page=page,
        page_size=page_size,
    )


# ── HR / Owner: approve ────────────────────────────────────────────────────────

@router.post("/requests/{request_id}/approve")
async def approve_work_mode_request(
    request_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:manage"]])),
):
    """HR/Owner approves a pending work mode request."""
    try:
        approver_name = cu.get("full_name") or cu.get("username") or cu["id"]
        return await WorkModeRequestService(db).approve_request(
            request_id=request_id,
            company_id=cu["company_id"],
            approved_by=cu["id"],
            approved_by_name=approver_name,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


# ── HR / Owner: reject ─────────────────────────────────────────────────────────

@router.post("/requests/{request_id}/reject")
async def reject_work_mode_request(
    request_id: str,
    data: WorkModeRequestAction,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:attendance:team"], ["hrm:attendance:manage"]])),
):
    """HR/Owner rejects a pending work mode request."""
    try:
        rejector_name = cu.get("full_name") or cu.get("username") or cu["id"]
        return await WorkModeRequestService(db).reject_request(
            request_id=request_id,
            company_id=cu["company_id"],
            rejected_by=cu["id"],
            rejected_by_name=rejector_name,
            reason=data.reason,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
