"""HRM — Payroll API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.payroll import GeneratePayrollRequest, UpdatePayslipStatus
from app.services.payroll_service import PayrollService

router = APIRouter(prefix="/hrm/payroll", tags=["HRM - Payroll"])


@router.post("/generate", status_code=201)
async def generate_payroll(
    data: GeneratePayrollRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    return await PayrollService(db).generate(cu["company_id"], data.month, data.year, data.employee_ids, cu["id"])


@router.get("")
async def list_payslips(
    month: Optional[int] = None,
    year: Optional[int] = None,
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    return await PayrollService(db).list(cu["company_id"], month, year, employee_id, status, page, page_size)


@router.get("/self")
async def list_own_payslips(
    month: Optional[int] = None,
    year: Optional[int] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:view_self"])),
):
    return await PayrollService(db).list(cu["company_id"], month, year, cu["id"], None, page, page_size)


@router.get("/{payslip_id}")
async def get_payslip(
    payslip_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:view_self"])),
):
    ps = await PayrollService(db).get(payslip_id, cu["company_id"])
    if not ps:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return ps


@router.patch("/{payslip_id}/status")
async def update_status(
    payslip_id: str,
    data: UpdatePayslipStatus,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    ps = await PayrollService(db).update_status(payslip_id, cu["company_id"], data.status, data.payment_reference, data.paid_on)
    if not ps:
        raise HTTPException(status_code=404, detail="Payslip not found")
    return ps


@router.delete("/{payslip_id}", status_code=204)
async def delete_payslip(
    payslip_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    deleted = await PayrollService(db).delete(payslip_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Payslip not found or not in draft status")
