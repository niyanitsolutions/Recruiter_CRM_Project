"""HRM — Payroll API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.payroll import GeneratePayrollRequest, UpdatePayslipStatus, UpdatePayslipData, UpsertPayrollStructure
from app.services.payroll_service import PayrollService, PayrollStructureService

router = APIRouter(prefix="/hrm/payroll", tags=["HRM - Payroll"])


# ── Static / sub-path routes FIRST to avoid /{payslip_id} swallowing them ──

@router.post("/generate", status_code=201)
async def generate_payroll(
    data: GeneratePayrollRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    return await PayrollService(db).generate(cu["company_id"], data.month, data.year, data.employee_ids, cu["id"])


@router.get("/structure")
async def get_payroll_structure(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    return await PayrollStructureService(db).get_or_create(cu["company_id"])


@router.put("/structure")
async def upsert_payroll_structure(
    data: UpsertPayrollStructure,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    components = [c.model_dump() for c in data.components]
    return await PayrollStructureService(db).upsert(cu["company_id"], components)


@router.get("/self")
async def list_own_payslips(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:view_self"])),
):
    # hrm_employee_id is injected into the JWT at login/refresh.
    # If missing (older token), look up the employee by linked crm_user_id.
    employee_id = cu.get("hrm_employee_id")
    if not employee_id:
        emp_doc = await db["hrm_employees"].find_one(
            {"crm_user_id": cu["id"], "is_deleted": False},
            {"_id": 1},
        )
        employee_id = str(emp_doc["_id"]) if emp_doc else None

    if not employee_id:
        return {"items": [], "total": 0, "page": page, "page_size": page_size}

    return await PayrollService(db).list(cu["company_id"], month, year, employee_id, None, page, page_size)


@router.get("")
async def list_payslips(
    month: Optional[int] = Query(None, ge=1, le=12),
    year: Optional[int] = Query(None, ge=2000, le=2100),
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    return await PayrollService(db).list(cu["company_id"], month, year, employee_id, status, page, page_size)


# ── Parameterised routes AFTER static routes ────────────────────────────────

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
    # Ownership check: employee can only view own payslip unless they have manage permission.
    # Fall back to DB lookup for stale JWTs that don't carry hrm_employee_id.
    caller_emp_id = cu.get("hrm_employee_id")
    if not caller_emp_id:
        emp_doc = await db["hrm_employees"].find_one(
            {"crm_user_id": cu["id"], "is_deleted": False}, {"_id": 1}
        )
        caller_emp_id = str(emp_doc["_id"]) if emp_doc else None
    is_own = caller_emp_id and caller_emp_id == ps.get("employee_id")
    if not is_own:
        perms = set(cu.get("permissions") or [])
        if "hrm:payroll:manage" not in perms:
            raise HTTPException(status_code=403, detail="Access denied")
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


@router.patch("/{payslip_id}")
async def update_payslip(
    payslip_id: str,
    data: UpdatePayslipData,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:payroll:manage"])),
):
    payload = {k: v for k, v in data.model_dump().items() if v is not None}
    ps = await PayrollService(db).update_payslip(payslip_id, cu["company_id"], payload)
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
