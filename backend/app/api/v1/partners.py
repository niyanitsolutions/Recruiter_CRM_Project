"""
Partners API
Manages partner accounts (user_type='partner') as a first-class resource,
completely separate from internal users (/users).

Permissions used:
  partners:view   — list / get
  partners:create — create
  partners:edit   — update, status change, reset password
  partners:delete — delete
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional

from pydantic import BaseModel, Field, field_validator, EmailStr
import re

from app.models.company.user import UserCreate, UserUpdate, UserStatus, ResetPasswordByAdmin
from app.services.user_service import UserService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/partners", tags=["Partners"])


def get_client_ip(request: Request) -> str:
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


# ── Schemas ────────────────────────────────────────────────────────────────────

class PartnerCreate(BaseModel):
    """Simplified create schema for partners — no role or permissions selection."""
    username:  str      = Field(..., min_length=3, max_length=50)
    email:     EmailStr
    full_name: str      = Field(..., min_length=2, max_length=100)
    mobile:    str      = Field(..., min_length=10, max_length=15)
    password:  str      = Field(..., min_length=8, max_length=100)

    designation:    Optional[str] = None
    designation_id: Optional[str] = None
    status:         Optional[str] = "active"

    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        cleaned = re.sub(r'[^0-9]', '', v)
        if len(cleaned) < 10:
            raise ValueError('Mobile number must be at least 10 digits')
        return cleaned

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class PartnerUpdate(BaseModel):
    """Fields an admin can update on a partner account (no role/permissions change)."""
    full_name:      Optional[str] = None
    mobile:         Optional[str] = None
    designation:    Optional[str] = None
    designation_id: Optional[str] = None
    status:         Optional[str] = None


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/statuses")
async def get_partner_statuses(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["partners:view"]))
):
    """Available status values for partner dropdowns."""
    statuses = [{"value": s.value, "label": s.value.title()} for s in UserStatus]
    return {"success": True, "data": statuses}


@router.get("/validate-field")
async def validate_partner_field(
    field:           str           = Query(..., pattern="^(username|email|mobile)$"),
    value:           str           = Query(..., min_length=1),
    exclude_user_id: Optional[str] = None,
    db                             = Depends(get_company_db),
):
    """Check uniqueness of username / email / mobile before submitting a partner form."""
    user_service = UserService(db)
    is_valid, message = await user_service.validate_field(field, value, exclude_user_id)
    return {"success": True, "valid": is_valid, "message": message}


@router.get("/")
async def list_partners(
    page:       int           = Query(1, ge=1),
    page_size:  int           = Query(20, ge=1, le=100),
    search:     Optional[str] = None,
    status:     Optional[str] = None,
    sort_by:    str           = "created_at",
    sort_order: int           = -1,
    current_user: dict        = Depends(get_current_user),
    db                        = Depends(get_company_db),
    _: bool                   = Depends(require_permissions(["partners:view"]))
):
    """List all partner accounts (role=partner)."""
    user_service = UserService(db)
    partners, total = await user_service.list_users(
        page=page, page_size=page_size,
        search=search, role="partner",
        status=status, sort_by=sort_by, sort_order=sort_order
    )
    return {
        "success": True,
        "data": partners,
        "pagination": {
            "page": page, "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size,
        },
    }


@router.post("/")
async def create_partner(
    request:      Request,
    partner_data: PartnerCreate,
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:create"]))
):
    """Create a new partner account. role=partner and user_type=partner are auto-assigned."""
    user_service = UserService(db)

    # Build a UserCreate with partner-fixed fields
    user_data = UserCreate(
        username       = partner_data.username,
        email          = str(partner_data.email),
        full_name      = partner_data.full_name,
        mobile         = partner_data.mobile,
        password       = partner_data.password,
        role           = "partner",
        user_type      = "partner",
        designation    = partner_data.designation,
        designation_id = partner_data.designation_id,
        status         = partner_data.status or "active",
        override_permissions = False,
        send_welcome_email   = False,
    )

    success, message, partner = await user_service.create_user(
        user_data       = user_data,
        created_by_id   = current_user["id"],
        created_by_name = current_user["full_name"],
        created_by_role = current_user["role"],
        ip_address      = get_client_ip(request),
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "data": partner}


@router.get("/{partner_id}")
async def get_partner(
    partner_id:   str,
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:view"]))
):
    """Get a single partner by ID."""
    user_service = UserService(db)
    partner = await user_service.get_user(partner_id)
    if not partner or partner.get("user_type") != "partner":
        raise HTTPException(status_code=404, detail="Partner not found")
    return {"success": True, "data": partner}


@router.put("/{partner_id}")
async def update_partner(
    request:      Request,
    partner_id:   str,
    update_data:  PartnerUpdate,
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:edit"]))
):
    """Update a partner's basic details (no role or permission changes allowed)."""
    user_service = UserService(db)

    existing = await user_service.get_user(partner_id)
    if not existing or existing.get("user_type") != "partner":
        raise HTTPException(status_code=404, detail="Partner not found")

    user_update = UserUpdate(
        full_name      = update_data.full_name,
        mobile         = update_data.mobile,
        designation    = update_data.designation,
        designation_id = update_data.designation_id,
        status         = update_data.status,
    )
    success, message, partner = await user_service.update_user(
        user_id         = partner_id,
        update_data     = user_update,
        updated_by_id   = current_user["id"],
        updated_by_name = current_user["full_name"],
        updated_by_role = current_user["role"],
        ip_address      = get_client_ip(request),
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "data": partner}


@router.put("/{partner_id}/status")
async def update_partner_status(
    request:    Request,
    partner_id: str,
    status:     str  = Query(..., pattern="^(active|inactive|suspended)$"),
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:edit"]))
):
    """Activate / deactivate / suspend a partner account."""
    user_service = UserService(db)

    existing = await user_service.get_user(partner_id)
    if not existing or existing.get("user_type") != "partner":
        raise HTTPException(status_code=404, detail="Partner not found")

    success, message = await user_service.update_status(
        user_id         = partner_id,
        status          = status,
        updated_by_id   = current_user["id"],
        updated_by_name = current_user["full_name"],
        updated_by_role = current_user["role"],
        ip_address      = get_client_ip(request),
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@router.post("/{partner_id}/reset-password")
async def reset_partner_password(
    request:       Request,
    partner_id:    str,
    password_data: ResetPasswordByAdmin,
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:edit"]))
):
    """Reset a partner's password (admin operation)."""
    user_service = UserService(db)

    existing = await user_service.get_user(partner_id)
    if not existing or existing.get("user_type") != "partner":
        raise HTTPException(status_code=404, detail="Partner not found")

    success, message = await user_service.reset_password_by_admin(
        user_id    = partner_id,
        password_data = password_data,
        admin_id   = current_user["id"],
        admin_name = current_user["full_name"],
        admin_role = current_user["role"],
        ip_address = get_client_ip(request),
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}


@router.delete("/{partner_id}")
async def delete_partner(
    request:    Request,
    partner_id: str,
    current_user: dict = Depends(get_current_user),
    db                 = Depends(get_company_db),
    _: bool            = Depends(require_permissions(["partners:delete"]))
):
    """Soft-delete a partner account."""
    user_service = UserService(db)

    existing = await user_service.get_user(partner_id)
    if not existing or existing.get("user_type") != "partner":
        raise HTTPException(status_code=404, detail="Partner not found")

    success, message = await user_service.delete_user(
        user_id         = partner_id,
        deleted_by_id   = current_user["id"],
        deleted_by_name = current_user["full_name"],
        deleted_by_role = current_user["role"],
        ip_address      = get_client_ip(request),
    )
    if not success:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}
