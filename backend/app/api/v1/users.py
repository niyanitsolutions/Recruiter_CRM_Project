"""
Users API - Phase 2
Handles user management within a company
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional, List

from app.models.company.user import (
    UserCreate, UserUpdate, UserProfileUpdate,
    UserResponse, UserListResponse, UserStatus, UserRole,
    ChangePasswordRequest, ResetPasswordByAdmin
)
from pydantic import BaseModel, Field, field_validator
import re as _re

class ForceChangePasswordRequest(BaseModel):
    """Schema for the first-login forced password reset (no current_password required)."""
    new_password: str = Field(..., min_length=8, max_length=100)
    confirm_password: str

    @field_validator('new_password')
    @classmethod
    def validate_new_password(cls, v):
        if not _re.search(r'[A-Z]', v):
            raise ValueError('Must contain at least one uppercase letter')
        if not _re.search(r'[a-z]', v):
            raise ValueError('Must contain at least one lowercase letter')
        if not _re.search(r'\d', v):
            raise ValueError('Must contain at least one digit')
        return v
from app.services.user_service import UserService
from app.core.dependencies import (
    get_current_user, get_company_db, require_permissions
)

router = APIRouter(prefix="/users", tags=["Users"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/")
async def list_users(
    request: Request,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    role: Optional[str] = None,
    department_id: Optional[str] = None,
    status: Optional[str] = None,
    reporting_to: Optional[str] = None,
    sort_by: str = "created_at",
    sort_order: int = -1,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """List internal users only (user_type=internal). Partners are managed via /partners."""
    user_service = UserService(db)

    users, total = await user_service.list_users(
        page=page,
        page_size=page_size,
        search=search,
        role=role,
        user_type="internal",
        department_id=department_id,
        status=status,
        reporting_to=reporting_to,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    return {
        "success": True,
        "data": users,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/dashboard-stats")
async def get_dashboard_stats(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """Get user statistics for admin dashboard"""
    user_service = UserService(db)
    stats = await user_service.get_dashboard_stats()
    
    return {
        "success": True,
        "data": stats
    }


@router.get("/roles")
async def get_available_roles(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """
    Get all roles available for the Add/Edit User dropdown.
    Returns system roles first, then any custom roles created by the admin.
    """
    # System roles (always present)
    system_role_values = {r.value for r in UserRole}
    roles = [
        {"value": r.value, "label": r.value.replace("_", " ").title(), "is_system": True}
        for r in UserRole
    ]

    # Custom roles from the DB (exclude system roles to avoid duplicates)
    cursor = db.roles.find({"is_deleted": False, "is_active": True})
    async for role_doc in cursor:
        if role_doc.get("name") not in system_role_values:
            roles.append({
                "value": role_doc["name"],
                "label": role_doc.get("display_name", role_doc["name"]),
                "is_system": False,
            })

    return {"success": True, "data": roles}


@router.get("/statuses")
async def get_available_statuses(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """Get list of available statuses for dropdown"""
    statuses = [
        {"value": status.value, "label": status.value.title()}
        for status in UserStatus
    ]
    
    return {
        "success": True,
        "data": statuses
    }


@router.get("/org-tree")
async def get_org_tree(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """Return the full hierarchical org tree for the company"""
    user_service = UserService(db)
    tree = await user_service.get_org_tree()
    return {"success": True, "data": tree}


@router.get("/validate-field")
async def validate_field(
    field: str = Query(..., pattern="^(username|email|mobile)$"),
    value: str = Query(..., min_length=1),
    exclude_user_id: Optional[str] = None,
    _: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Validate if a field value is unique"""
    user_service = UserService(db)
    is_valid, message = await user_service.validate_field(field, value, exclude_user_id)
    
    return {
        "success": True,
        "valid": is_valid,
        "message": message
    }


@router.post("/")
async def create_user(
    request: Request,
    user_data: UserCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:create"]))
):
    """Create a new user (enforces seat-limit before creation)"""
    user_service = UserService(db)

    success, message, user = await user_service.create_user(
        user_data=user_data,
        created_by_id=current_user["id"],
        created_by_name=current_user["full_name"],
        created_by_role=current_user["role"],
        ip_address=get_client_ip(request),
        company_id=current_user.get("company_id"),
    )

    if not success:
        # Seat-limit error carries structured data encoded in the message string
        if message.startswith("SEAT_LIMIT_REACHED|"):
            parts = message.split("|")
            total   = int(parts[1]) if len(parts) > 1 else 0
            current = int(parts[2]) if len(parts) > 2 else 0
            remaining = int(parts[3]) if len(parts) > 3 else 0
            raise HTTPException(
                status_code=402,
                detail={
                    "seat_limit_reached": True,
                    "message": "User limit reached. You have used all purchased user seats.",
                    "total_user_seats": total,
                    "current_active_users": current,
                    "remaining_seats": remaining,
                }
            )
        # Duplicate-field error: return structured data so the frontend can show
        # the exact duplicate fields without string-parsing heuristics.
        if message.startswith("DUPLICATE|"):
            parts = message.split("|")[1:]   # e.g. ["username:john", "email:j@x.com"]
            fields = {}
            for part in parts:
                if ":" in part:
                    k, v = part.split(":", 1)
                    fields[k] = v
            raise HTTPException(
                status_code=409,
                detail={
                    "duplicate": True,
                    "fields": fields,   # {"username": "john", "email": "j@x.com"}
                    "message": "A user with these details already exists.",
                }
            )
        raise HTTPException(status_code=400, detail=message)

    return {
        "success": True,
        "message": message,
        "data": user
    }


@router.get("/seat-status")
async def get_seat_status(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
):
    """
    Return current seat usage for the authenticated tenant.
    Used by the frontend to decide whether to enable/disable 'Add User'.
    """
    from app.core.database import get_master_db
    master_db = get_master_db()
    company_id = current_user.get("company_id")
    tenant = await master_db.tenants.find_one({"company_id": company_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Company not found")

    total_seats = int(tenant.get("max_users", 0))
    current_count = await db.users.count_documents({
        "is_deleted": False,
        "user_type": {"$ne": "partner"},
    })
    remaining = max(0, total_seats - current_count) if total_seats > 0 else 9999

    from datetime import datetime, timezone
    plan_expiry = tenant.get("plan_expiry")
    if plan_expiry and plan_expiry.tzinfo is None:
        plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
    is_expired = bool(plan_expiry and datetime.now(timezone.utc) > plan_expiry)

    return {
        "success": True,
        "data": {
            "total_user_seats": total_seats,
            "current_active_users": current_count,
            "remaining_seats": remaining,
            "seat_limit_reached": total_seats > 0 and current_count >= total_seats,
            "plan_name": tenant.get("plan_name", "trial"),
            "plan_display_name": tenant.get("plan_display_name", "Trial"),
            "plan_expiry": plan_expiry.isoformat() if plan_expiry else None,
            "is_trial": tenant.get("is_trial", True),
            "is_expired": is_expired,
        }
    }


@router.get("/me")
async def get_current_user_profile(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get current user's profile"""
    user_service = UserService(db)
    user = await user_service.get_user(current_user["id"])
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "success": True,
        "data": user
    }


@router.put("/me")
async def update_own_profile(
    request: Request,
    update_data: UserProfileUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Update current user's own profile (limited fields)"""
    user_service = UserService(db)
    
    success, message, user = await user_service.update_profile(
        user_id=current_user["id"],
        update_data=update_data,
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": user
    }


@router.post("/me/change-password")
async def change_own_password(
    request: Request,
    password_data: ChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Change current user's password"""
    user_service = UserService(db)
    
    success, message = await user_service.change_password(
        user_id=current_user["id"],
        password_data=password_data,
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message
    }


@router.post("/me/force-change-password")
async def force_change_own_password(
    password_data: ForceChangePasswordRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
):
    """
    First-login forced password reset — no current_password required.
    Only valid when must_change_password=True on the user record.
    Clears must_change_password on success.
    """
    import bcrypt
    from datetime import datetime, timezone
    from app.models.master.global_user import sync_global_password
    from app.core.database import get_master_db

    if password_data.new_password != password_data.confirm_password:
        raise HTTPException(status_code=400, detail="Passwords do not match")

    user_id = current_user["id"]
    user = await db.users.find_one({"_id": user_id, "is_deleted": False})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    new_hash = bcrypt.hashpw(
        password_data.new_password.encode("utf-8"),
        bcrypt.gensalt(rounds=12),
    ).decode("utf-8")

    await db.users.update_one(
        {"_id": user_id},
        {"$set": {
            "password_hash":      new_hash,
            "must_change_password": False,
            "password_changed_at": datetime.now(timezone.utc),
            "updated_at":         datetime.now(timezone.utc),
        }},
    )

    # Sync to global identity layer (best-effort)
    try:
        master_db = get_master_db()
        await sync_global_password(master_db, email=user["email"], new_password_hash=new_hash)
    except Exception:
        pass

    return {"success": True, "message": "Password updated successfully"}


@router.get("/{user_id}")
async def get_user(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """Get user by ID"""
    user_service = UserService(db)
    user = await user_service.get_user(user_id)
    
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    return {
        "success": True,
        "data": user
    }


@router.put("/{user_id}")
async def update_user(
    request: Request,
    user_id: str,
    update_data: UserUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:edit"]))
):
    """Update a user (Admin operation)"""
    user_service = UserService(db)
    
    success, message, user = await user_service.update_user(
        user_id=user_id,
        update_data=update_data,
        updated_by_id=current_user["id"],
        updated_by_name=current_user["full_name"],
        updated_by_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": user
    }


@router.put("/{user_id}/status")
async def update_user_status(
    request: Request,
    user_id: str,
    status: str = Query(..., pattern="^(active|inactive|suspended)$"),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:edit"]))
):
    """Update user status (activate/deactivate/suspend)"""
    user_service = UserService(db)
    
    success, message = await user_service.update_status(
        user_id=user_id,
        status=status,
        updated_by_id=current_user["id"],
        updated_by_name=current_user["full_name"],
        updated_by_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message
    }


@router.post("/{user_id}/reset-password")
async def reset_user_password(
    request: Request,
    user_id: str,
    password_data: ResetPasswordByAdmin,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:edit"]))
):
    """Reset user's password (Admin operation)"""
    user_service = UserService(db)
    
    success, message = await user_service.reset_password_by_admin(
        user_id=user_id,
        password_data=password_data,
        admin_id=current_user["id"],
        admin_name=current_user["full_name"],
        admin_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message
    }


@router.delete("/{user_id}")
async def delete_user(
    request: Request,
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:delete"]))
):
    """Soft delete a user"""
    user_service = UserService(db)
    
    success, message = await user_service.delete_user(
        user_id=user_id,
        deleted_by_id=current_user["id"],
        deleted_by_name=current_user["full_name"],
        deleted_by_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message
    }


@router.get("/{user_id}/reports")
async def get_user_reports(
    user_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:view"]))
):
    """Get direct reports of a user (reporting hierarchy)"""
    user_service = UserService(db)
    reports = await user_service.get_reporting_hierarchy(user_id)
    
    return {
        "success": True,
        "data": reports
    }