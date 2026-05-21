"""HRM Sync API — User ↔ Employee bidirectional linking"""
from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.core.dependencies import get_company_db, require_permissions
from app.services.hrm_sync_service import HRMSyncService

router = APIRouter(prefix="/hrm/sync", tags=["HRM - Sync"])


def _svc(db=Depends(get_company_db)) -> HRMSyncService:
    return HRMSyncService(db)


@router.get("/status")
async def sync_status(
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """Get counts of linked/unlinked users and employees."""
    svc = HRMSyncService(db)
    return await svc.get_sync_status(current_user["company_id"])


@router.get("/unlinked-preview")
async def unlinked_preview(
    limit: int = Query(5, ge=1, le=20),
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """Return first N names of unlinked users and employees for dashboard display."""
    svc = HRMSyncService(db)
    return await svc.get_unlinked_preview(current_user["company_id"], limit=limit)


@router.get("/unlinked-users")
async def unlinked_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """List CRM users without an employee record."""
    svc = HRMSyncService(db)
    return await svc.list_unlinked_users(current_user["company_id"], page, page_size)


@router.get("/unlinked-employees")
async def unlinked_employees(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """List employees without a CRM user account."""
    svc = HRMSyncService(db)
    return await svc.list_unlinked_employees(current_user["company_id"], page, page_size)


@router.post("/employee-to-user/{employee_id}")
async def employee_to_user(
    employee_id: str,
    role: str = Query("hr"),
    password: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["hrm:employees:manage", "users:create"])),
    db=Depends(get_company_db),
):
    """Create a CRM user from an employee record and link them."""
    svc = HRMSyncService(db)
    return await svc.sync_employee_to_user(
        employee_id=employee_id,
        company_id=current_user["company_id"],
        created_by=current_user["id"],
        password=password,
        role=role,
    )


@router.post("/user-to-employee/{user_id}")
async def user_to_employee(
    user_id: str,
    current_user: dict = Depends(require_permissions(["hrm:employees:manage", "users:view"])),
    db=Depends(get_company_db),
):
    """Create an employee record from a CRM user and link them."""
    svc = HRMSyncService(db)
    return await svc.sync_user_to_employee(
        user_id=user_id,
        company_id=current_user["company_id"],
        created_by=current_user["id"],
    )


@router.post("/link")
async def manual_link(
    user_id: str,
    employee_id: str,
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """Manually link an existing user to an existing employee."""
    svc = HRMSyncService(db)
    return await svc.link(user_id, employee_id, current_user["company_id"])


@router.delete("/unlink/{user_id}")
async def manual_unlink(
    user_id: str,
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """Remove link between a user and their employee record."""
    svc = HRMSyncService(db)
    return await svc.unlink(user_id, current_user["company_id"])
