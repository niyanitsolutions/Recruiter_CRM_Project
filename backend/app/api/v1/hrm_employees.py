"""HRM — Employee API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.employee import EmployeeCreate, EmployeeUpdate
from app.services.employee_service import EmployeeService

router = APIRouter(prefix="/hrm/employees", tags=["HRM - Employees"])


@router.post("", status_code=201)
async def create_employee(
    data: EmployeeCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:manage"])),
):
    return await EmployeeService(db).create(data, cu["company_id"], cu["id"])


@router.get("")
async def list_employees(
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    return await EmployeeService(db).list(cu["company_id"], status, department_id, search, page, page_size)


@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    emp = await EmployeeService(db).get(employee_id, cu["company_id"])
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.put("/{employee_id}")
async def update_employee(
    employee_id: str,
    data: EmployeeUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:manage"])),
):
    emp = await EmployeeService(db).update(employee_id, data, cu["company_id"])
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:manage"])),
):
    deleted = await EmployeeService(db).delete(employee_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Employee not found")
