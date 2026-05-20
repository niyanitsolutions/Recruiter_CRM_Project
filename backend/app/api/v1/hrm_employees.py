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
    return await EmployeeService(db).create(
        data, cu["company_id"], cu["id"],
        crm_enabled=cu.get("crm_enabled", False),
        hrm_enabled=cu.get("hrm_enabled", True),
    )


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


@router.get("/org-chart/tree")
async def get_org_chart(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    """Return all active employees structured as a hierarchy tree."""
    cursor = db.hrm_employees.find(
        {"company_id": cu["company_id"], "is_deleted": False, "employment_status": "active"},
        {"_id": 1, "full_name": 1, "designation_name": 1, "department_name": 1,
         "reporting_manager_id": 1, "photo_url": 1, "employment_type": 1, "employee_id": 1},
    )
    employees = await cursor.to_list(length=None)

    # Build id → node dict
    nodes = {}
    for e in employees:
        nodes[e["_id"]] = {
            "id": e["_id"],
            "employee_id": e.get("employee_id", ""),
            "name": e.get("full_name", ""),
            "designation": e.get("designation_name", ""),
            "department": e.get("department_name", ""),
            "photo_url": e.get("photo_url"),
            "employment_type": e.get("employment_type", ""),
            "reporting_manager_id": e.get("reporting_manager_id"),
            "children": [],
        }

    roots = []
    for node in nodes.values():
        mgr_id = node["reporting_manager_id"]
        if mgr_id and mgr_id in nodes:
            nodes[mgr_id]["children"].append(node)
        else:
            roots.append(node)

    return {"tree": roots, "total": len(nodes)}
