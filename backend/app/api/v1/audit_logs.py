"""
Audit Logs API - Phase 2
Handles viewing audit trail and activity history
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional
from datetime import datetime

from app.models.company.audit_log import AuditLogFilter, AuditAction, EntityType
from app.services.audit_service import AuditService
from app.core.dependencies import (
    get_current_user, get_company_db, require_permissions
)

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("/")
async def list_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    action: Optional[str] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    user_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """List audit logs with filters and pagination"""
    audit_service = AuditService(db)
    
    filter_params = AuditLogFilter(
        action=action,
        entity_type=entity_type,
        entity_id=entity_id,
        user_id=user_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        page_size=page_size
    )
    
    logs, total = await audit_service.list_logs(filter_params)
    
    return {
        "success": True,
        "data": logs,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/recent")
async def get_recent_activity(
    limit: int = Query(10, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get most recent audit logs"""
    audit_service = AuditService(db)
    logs = await audit_service.get_recent_activity(limit=limit)
    
    return {
        "success": True,
        "data": logs
    }


@router.get("/stats")
async def get_activity_stats(
    days: int = Query(7, ge=1, le=90),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get activity statistics for dashboard"""
    audit_service = AuditService(db)
    stats = await audit_service.get_activity_stats(days=days)
    
    return {
        "success": True,
        "data": stats
    }


@router.get("/actions")
async def get_available_actions(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get list of available audit actions for filtering"""
    actions = [
        {"value": action.value, "label": action.value.replace("_", " ").title()}
        for action in AuditAction
    ]
    
    return {
        "success": True,
        "data": actions
    }


@router.get("/entity-types")
async def get_available_entity_types(
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get list of available entity types for filtering"""
    entity_types = [
        {"value": et.value, "label": et.value.replace("_", " ").title()}
        for et in EntityType
    ]
    
    return {
        "success": True,
        "data": entity_types
    }


@router.get("/entity/{entity_type}/{entity_id}")
async def get_entity_history(
    entity_type: str,
    entity_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get audit history for a specific entity"""
    audit_service = AuditService(db)
    logs, total = await audit_service.get_entity_history(
        entity_type=entity_type,
        entity_id=entity_id,
        page=page,
        page_size=page_size
    )
    
    return {
        "success": True,
        "data": logs,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/user/{user_id}")
async def get_user_activity(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get audit history for a specific user's actions"""
    audit_service = AuditService(db)
    logs, total = await audit_service.get_user_activity(
        user_id=user_id,
        page=page,
        page_size=page_size
    )
    
    return {
        "success": True,
        "data": logs,
        "pagination": {
            "page": page,
            "page_size": page_size,
            "total": total,
            "total_pages": (total + page_size - 1) // page_size
        }
    }


@router.get("/{log_id}")
async def get_audit_log(
    log_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["audit:view"]))
):
    """Get detailed audit log entry"""
    audit_service = AuditService(db)
    log = await audit_service.get_log(log_id)
    
    if not log:
        raise HTTPException(status_code=404, detail="Audit log not found")
    
    return {
        "success": True,
        "data": log
    }