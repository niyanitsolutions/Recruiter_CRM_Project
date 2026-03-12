"""
Departments API - Phase 2
Handles department management within a company
"""
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from typing import Optional

from app.models.company.department import DepartmentCreate, DepartmentUpdate
from app.services.department_service import DepartmentService
from app.core.dependencies import (
    get_current_user, get_company_db, require_permissions
)

router = APIRouter(prefix="/departments", tags=["Departments"])


def get_client_ip(request: Request) -> str:
    """Get client IP address from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.get("/")
async def list_departments(
    include_inactive: bool = Query(False),
    parent_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:view"]))
):
    """List all departments"""
    dept_service = DepartmentService(db)
    departments = await dept_service.list_departments(
        include_inactive=include_inactive,
        parent_id=parent_id
    )
    
    return {
        "success": True,
        "data": departments
    }


@router.get("/tree")
async def get_department_tree(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:view"]))
):
    """Get departments as a hierarchical tree"""
    dept_service = DepartmentService(db)
    tree = await dept_service.get_department_tree()
    
    return {
        "success": True,
        "data": tree
    }


@router.post("/")
async def create_department(
    request: Request,
    dept_data: DepartmentCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:create"]))
):
    """Create a new department"""
    dept_service = DepartmentService(db)
    
    success, message, department = await dept_service.create_department(
        dept_data=dept_data,
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
        "data": department
    }


@router.get("/{dept_id}")
async def get_department(
    dept_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:view"]))
):
    """Get department by ID"""
    dept_service = DepartmentService(db)
    department = await dept_service.get_department(dept_id)
    
    if not department:
        raise HTTPException(status_code=404, detail="Department not found")
    
    return {
        "success": True,
        "data": department
    }


@router.put("/{dept_id}")
async def update_department(
    request: Request,
    dept_id: str,
    update_data: DepartmentUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:edit"]))
):
    """Update a department"""
    dept_service = DepartmentService(db)
    
    success, message, department = await dept_service.update_department(
        dept_id=dept_id,
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
        "data": department
    }


@router.delete("/{dept_id}")
async def delete_department(
    request: Request,
    dept_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:delete"]))
):
    """Delete a department"""
    dept_service = DepartmentService(db)
    
    success, message = await dept_service.delete_department(
        dept_id=dept_id,
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


@router.get("/{dept_id}/users")
async def get_department_users(
    dept_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["departments:view"]))
):
    """Get all users in a department"""
    dept_service = DepartmentService(db)
    users, total = await dept_service.get_department_users(
        dept_id=dept_id,
        page=page,
        page_size=page_size
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