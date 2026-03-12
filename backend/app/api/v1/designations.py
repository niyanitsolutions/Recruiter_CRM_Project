"""
Designations API - Phase 2
Handles designation/job title management within a company
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional

from app.models.company.designation import DesignationCreate, DesignationUpdate, LEVEL_NAMES
from app.services.designation_service import DesignationService
from app.core.dependencies import (
    get_current_user, get_company_db, require_permissions
)

router = APIRouter(prefix="/designations", tags=["Designations"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/")
async def list_designations(
    include_inactive: bool = Query(False),
    department_id: Optional[str] = None,
    level: Optional[int] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:view"]))
):
    """List all designations"""
    desig_service = DesignationService(db)
    designations = await desig_service.list_designations(
        include_inactive=include_inactive,
        department_id=department_id,
        level=level
    )
    
    return {
        "success": True,
        "data": designations
    }


@router.get("/levels")
async def get_designation_levels(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["designations:view"]))
):
    """Get all designation levels for dropdown"""
    levels = [
        {"value": level, "label": name}
        for level, name in LEVEL_NAMES.items()
    ]
    
    return {
        "success": True,
        "data": levels
    }


@router.get("/by-level")
async def get_designations_by_level(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:view"]))
):
    """Get designations grouped by level"""
    desig_service = DesignationService(db)
    by_level = await desig_service.get_designations_by_level()
    
    return {
        "success": True,
        "data": by_level
    }


@router.post("/")
async def create_designation(
    request: Request,
    desig_data: DesignationCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:create"]))
):
    """Create a new designation"""
    desig_service = DesignationService(db)
    
    success, message, designation = await desig_service.create_designation(
        desig_data=desig_data,
        created_by_id=current_user["id"],
        created_by_name=current_user["full_name"],
        created_by_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message,
        "data": designation
    }


@router.get("/{desig_id}")
async def get_designation(
    desig_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:view"]))
):
    """Get designation by ID"""
    desig_service = DesignationService(db)
    designation = await desig_service.get_designation(desig_id)
    
    if not designation:
        raise HTTPException(status_code=404, detail="Designation not found")
    
    return {
        "success": True,
        "data": designation
    }


@router.put("/{desig_id}")
async def update_designation(
    request: Request,
    desig_id: str,
    update_data: DesignationUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:edit"]))
):
    """Update a designation"""
    desig_service = DesignationService(db)
    
    success, message, designation = await desig_service.update_designation(
        desig_id=desig_id,
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
        "data": designation
    }


@router.delete("/{desig_id}")
async def delete_designation(
    request: Request,
    desig_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["designations:delete"]))
):
    """Delete a designation"""
    desig_service = DesignationService(db)
    
    success, message = await desig_service.delete_designation(
        desig_id=desig_id,
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