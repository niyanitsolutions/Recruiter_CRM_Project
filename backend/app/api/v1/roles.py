"""
Roles API - Phase 2
Handles role and permission management within a company
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional

from app.models.company.role import RoleCreate, RoleUpdate, Permission
from app.services.role_service import RoleService
from app.core.dependencies import (
    get_current_user, get_company_db, require_permissions
)

router = APIRouter(prefix="/roles", tags=["Roles"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/")
async def list_roles(
    include_system: bool = Query(True),
    include_inactive: bool = Query(False),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:view"]))
):
    """List all roles"""
    role_service = RoleService(db)
    roles = await role_service.list_roles(
        include_system=include_system,
        include_inactive=include_inactive
    )
    
    return {
        "success": True,
        "data": roles
    }


@router.get("/permissions")
async def get_all_permissions(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["roles:view"]))
):
    """Get all available permissions grouped by category"""
    # Group permissions by prefix
    categories = {}
    for perm in Permission:
        category = perm.value.split(":")[0]
        if category not in categories:
            categories[category] = []
        categories[category].append({
            "value": perm.value,
            "name": perm.name,
            "display": perm.value.replace(":", " - ").replace("_", " ").title()
        })
    
    result = []
    for category, perms in categories.items():
        result.append({
            "category": category.title(),
            "permissions": perms
        })
    
    return {
        "success": True,
        "data": result
    }


@router.post("/initialize")
async def initialize_system_roles(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:create"]))
):
    """Initialize system roles (one-time setup)"""
    role_service = RoleService(db)
    await role_service.initialize_system_roles()
    
    return {
        "success": True,
        "message": "System roles initialized"
    }


@router.post("/")
async def create_role(
    request: Request,
    role_data: RoleCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:create"]))
):
    """Create a new custom role"""
    role_service = RoleService(db)
    
    success, message, role = await role_service.create_role(
        role_data=role_data,
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
        "data": role
    }


@router.get("/{role_id}")
async def get_role(
    role_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:view"]))
):
    """Get role by ID"""
    role_service = RoleService(db)
    role = await role_service.get_role(role_id)
    
    if not role:
        raise HTTPException(status_code=404, detail="Role not found")
    
    return {
        "success": True,
        "data": role
    }


@router.put("/{role_id}")
async def update_role(
    request: Request,
    role_id: str,
    update_data: RoleUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:edit"]))
):
    """Update a role"""
    role_service = RoleService(db)
    
    success, message, role = await role_service.update_role(
        role_id=role_id,
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
        "data": role
    }


@router.delete("/{role_id}")
async def delete_role(
    request: Request,
    role_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["roles:delete"]))
):
    """Delete a custom role"""
    role_service = RoleService(db)
    
    success, message = await role_service.delete_role(
        role_id=role_id,
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


@router.post("/assign")
async def assign_role_to_user(
    request: Request,
    user_id: str = Query(...),
    role_name: str = Query(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["users:manage_roles"]))
):
    """Assign a role to a user"""
    role_service = RoleService(db)
    
    success, message = await role_service.assign_role_to_user(
        user_id=user_id,
        role_name=role_name,
        assigned_by_id=current_user["id"],
        assigned_by_name=current_user["full_name"],
        assigned_by_role=current_user["role"],
        ip_address=get_client_ip(request)
    )
    
    if not success:
        raise HTTPException(status_code=400, detail=message)
    
    return {
        "success": True,
        "message": message
    }