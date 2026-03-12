"""
Tenants API Endpoints
Company/tenant management
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional
import logging

from app.middleware.auth import get_current_user, AuthContext
from app.services.tenant_service import tenant_service
from app.schemas.tenant import ValidateFieldRequest, ValidateFieldResponse

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/current")
async def get_current_tenant(auth: AuthContext = Depends(get_current_user)):
    """
    Get current user's tenant/company details
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin does not belong to a tenant"
        )
    
    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Remove sensitive data
    if "owner" in tenant:
        tenant["owner"].pop("password_hash", None)
    
    return tenant


@router.get("/plan")
async def get_current_plan(auth: AuthContext = Depends(get_current_user)):
    """
    Get current tenant's plan details and usage
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin does not belong to a tenant"
        )
    
    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    from app.core.database import get_master_db, get_company_db
    master_db = get_master_db()
    company_db = get_company_db(auth.company_id)
    
    # Get plan details
    plan = await master_db.plans.find_one({"_id": tenant.get("plan_id")})
    
    # Get current usage
    user_count = await company_db.users.count_documents({"is_deleted": False})
    # These collections will be created in later phases
    # candidate_count = await company_db.candidates.count_documents({"is_deleted": False})
    # job_count = await company_db.jobs.count_documents({"is_deleted": False})
    
    return {
        "plan": {
            "name": plan.get("name") if plan else "unknown",
            "display_name": plan.get("display_name") if plan else "Unknown",
            "is_trial": tenant.get("is_trial", False),
            "expiry": tenant.get("plan_expiry"),
            "limits": {
                "max_users": plan.get("max_users", 5) if plan else 5,
                "max_candidates": plan.get("max_candidates", 100) if plan else 100,
                "max_jobs": plan.get("max_jobs", 10) if plan else 10,
                "max_partners": plan.get("max_partners", 5) if plan else 5
            }
        },
        "usage": {
            "users": user_count,
            "candidates": 0,  # Will be updated in Phase 2
            "jobs": 0,  # Will be updated in Phase 2
            "partners": 0  # Will be updated in Phase 2
        }
    }


@router.put("/update")
async def update_tenant(
    company_name: Optional[str] = None,
    display_name: Optional[str] = None,
    website: Optional[str] = None,
    gst_number: Optional[str] = None,
    phone: Optional[str] = None,
    street: Optional[str] = None,
    city: Optional[str] = None,
    state: Optional[str] = None,
    zip_code: Optional[str] = None,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Update tenant/company details
    
    Only company admin/owner can update
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin cannot update tenant details this way"
        )
    
    if auth.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only company admin can update tenant details"
        )
    
    from app.core.database import get_master_db
    from datetime import datetime, timezone
    
    master_db = get_master_db()
    
    updates = {}
    
    if company_name:
        # Check if name is unique
        existing = await master_db.tenants.find_one({
            "company_name": company_name,
            "company_id": {"$ne": auth.company_id},
            "is_deleted": False
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Company name already taken"
            )
        updates["company_name"] = company_name
    
    if display_name:
        updates["display_name"] = display_name
    if website:
        updates["website"] = website
    if gst_number:
        updates["gst_number"] = gst_number
    if phone:
        updates["phone"] = phone
    
    # Address updates
    if street:
        updates["address.street"] = street
    if city:
        updates["address.city"] = city
    if state:
        updates["address.state"] = state
    if zip_code:
        updates["address.zip_code"] = zip_code
    
    if not updates:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No updates provided"
        )
    
    updates["updated_at"] = datetime.now(timezone.utc)
    
    result = await master_db.tenants.update_one(
        {"company_id": auth.company_id},
        {"$set": updates}
    )
    
    if result.modified_count == 0:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to update tenant"
        )
    
    return {"success": True, "message": "Company details updated successfully"}


@router.post("/validate")
async def validate_registration_field(request: ValidateFieldRequest):
    """
    Validate registration field for uniqueness
    
    Used during registration to provide real-time feedback
    """
    is_valid = True
    message = ""
    
    if request.field == "company_name":
        is_unique, error = await tenant_service.check_unique_fields(company_name=request.value)
        is_valid = is_unique
        message = error if not is_unique else "Company name is available"
    
    elif request.field == "email":
        is_unique, error = await tenant_service.check_unique_fields(email=request.value)
        is_valid = is_unique
        message = error if not is_unique else "Email is available"
    
    elif request.field == "mobile":
        is_unique, error = await tenant_service.check_unique_fields(mobile=request.value)
        is_valid = is_unique
        message = error if not is_unique else "Mobile number is available"
    
    elif request.field == "username":
        is_unique, error = await tenant_service.check_unique_fields(username=request.value)
        is_valid = is_unique
        message = error if not is_unique else "Username is available"
    
    else:
        is_valid = True
        message = "Field validation not required"
    
    return ValidateFieldResponse(
        field=request.field,
        is_valid=is_valid,
        message=message
    )