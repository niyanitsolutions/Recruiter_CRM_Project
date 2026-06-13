"""HRM Sync API — User ↔ Employee bidirectional linking"""
from fastapi import APIRouter, Depends, Query
from typing import Optional
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_permissions
from app.services.hrm_sync_service import HRMSyncService


class UserToEmployeeBody(BaseModel):
    full_name: Optional[str] = None
    department: Optional[str] = None
    designation_name: Optional[str] = None
    phone: Optional[str] = None

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
    body: Optional[UserToEmployeeBody] = None,
    current_user: dict = Depends(require_permissions(["hrm:employees:manage", "users:view"])),
    db=Depends(get_company_db),
):
    """Create an employee record from a CRM user and link them."""
    svc = HRMSyncService(db)
    extra = body.model_dump(exclude_none=True) if body else None
    return await svc.sync_user_to_employee(
        user_id=user_id,
        company_id=current_user["company_id"],
        created_by=current_user["id"],
        extra_fields=extra or None,
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


@router.post("/migrate")
async def run_migration(
    current_user: dict = Depends(require_permissions(["hrm:employees:manage"])),
    db=Depends(get_company_db),
):
    """
    One-time migration: for every existing internal user without an employee
    profile, auto-create a linked employee shell.  Idempotent — safe to run
    multiple times (already-linked pairs are skipped).
    """
    svc = HRMSyncService(db)
    company_id = current_user["company_id"]
    created_by = current_user["id"]

    # Find all internal users with no hrm_employee_id
    unlinked = await svc.list_unlinked_users(company_id, page=1, page_size=1000)
    results = {"created": 0, "already_linked": 0, "errors": 0, "details": []}

    for user in unlinked.get("items", []):
        uid = user.get("id") or user.get("_id")
        if not uid:
            continue
        try:
            result = await svc.sync_user_to_employee(
                user_id=uid,
                company_id=company_id,
                created_by=created_by,
            )
            if result.get("success"):
                if "created" in result.get("message", "").lower():
                    results["created"] += 1
                else:
                    results["already_linked"] += 1
            else:
                results["errors"] += 1
                results["details"].append({"user_id": uid, "error": result.get("message")})
        except Exception as exc:
            results["errors"] += 1
            results["details"].append({"user_id": uid, "error": str(exc)})

    return {
        "success": True,
        "message": f"Migration complete: {results['created']} employee profiles created, "
                   f"{results['already_linked']} already linked, {results['errors']} errors.",
        **results,
    }
