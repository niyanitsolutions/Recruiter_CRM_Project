"""
Audit API Routes - Phase 5
Advanced audit logging, session tracking, and security monitoring endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List
from datetime import datetime, date, timedelta, timezone

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.audit_advanced import (
    AuditAction, AuditSeverity, SessionStatus, AlertType,
    AuditLogSearchRequest,
    AuditLogResponse, AuditLogListResponse, AuditTimelineResponse,
    SessionResponse, SessionListResponse,
    SecurityAlertResponse, SecurityAlertListResponse,
    AuditSummaryResponse, UserActivityResponse, ChangeHistoryResponse,
    RevokeSessionRequest, RevokeAllSessionsRequest, ResolveAlertRequest,
    AUDIT_ACTION_DISPLAY, AUDIT_SEVERITY_DISPLAY
)
from app.services.audit_service import AuditService

router = APIRouter(prefix="/audit", tags=["Audit"])


# ============== Audit Logs ==============

@router.get("/logs", response_model=AuditLogListResponse)
async def search_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user_id: Optional[str] = None,
    action: Optional[AuditAction] = None,
    severity: Optional[AuditSeverity] = None,
    entity_type: Optional[str] = None,
    entity_id: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    search: Optional[str] = None,
    sort_by: str = "timestamp",
    sort_order: str = "desc",
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Search audit logs"""
    service = AuditService(db)
    
    request = AuditLogSearchRequest(
        user_id=user_id,
        action=action,
        severity=severity,
        entity_type=entity_type,
        entity_id=entity_id,
        start_date=start_date,
        end_date=end_date,
        search=search,
        page=page,
        page_size=page_size,
        sort_by=sort_by,
        sort_order=sort_order
    )
    
    return await service.search_logs(
        company_id=current_user["company_id"],
        request=request
    )


@router.get("/logs/actions")
async def get_audit_actions(
    current_user: dict = Depends(require_permissions(["audit:view"]))
):
    """Get available audit actions"""
    return {
        "actions": [
            {"value": a.value, "label": AUDIT_ACTION_DISPLAY.get(a, a.value)}
            for a in AuditAction
        ]
    }


@router.get("/logs/severities")
async def get_audit_severities(
    current_user: dict = Depends(require_permissions(["audit:view"]))
):
    """Get audit severity levels"""
    return {
        "severities": [
            {"value": s.value, "label": AUDIT_SEVERITY_DISPLAY.get(s, s.value)}
            for s in AuditSeverity
        ]
    }


@router.get("/timeline", response_model=List[AuditTimelineResponse])
async def get_audit_timeline(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Get audit timeline grouped by date"""
    service = AuditService(db)
    
    if not start_date:
        start_date = date.today() - timedelta(days=7)
    if not end_date:
        end_date = date.today()
    
    return await service.get_timeline(
        company_id=current_user["company_id"],
        start_date=start_date,
        end_date=end_date
    )


@router.get("/entity/{entity_type}/{entity_id}/history", response_model=ChangeHistoryResponse)
async def get_entity_history(
    entity_type: str,
    entity_id: str,
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Get change history for an entity"""
    service = AuditService(db)
    
    return await service.get_entity_history(
        company_id=current_user["company_id"],
        entity_type=entity_type,
        entity_id=entity_id
    )


@router.get("/summary", response_model=AuditSummaryResponse)
async def get_audit_summary(
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Get audit activity summary"""
    service = AuditService(db)
    
    if not start_date:
        start_date = datetime.now(timezone.utc) - timedelta(days=30)
    if not end_date:
        end_date = datetime.now(timezone.utc)
    
    return await service.get_audit_summary(
        company_id=current_user["company_id"],
        start_date=start_date,
        end_date=end_date
    )


# ============== Sessions ==============

@router.get("/sessions", response_model=SessionListResponse)
async def list_sessions(
    user_id: Optional[str] = None,
    include_expired: bool = False,
    current_user: dict = Depends(require_permissions(["audit:sessions"])),
    db = Depends(get_company_db)
):
    """List user sessions"""
    service = AuditService(db)
    
    return await service.list_user_sessions(
        user_id=user_id or current_user["id"],
        company_id=current_user["company_id"],
        include_expired=include_expired
    )


@router.get("/sessions/my", response_model=SessionListResponse)
async def list_my_sessions(
    include_expired: bool = False,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """List current user's sessions"""
    service = AuditService(db)
    
    return await service.list_user_sessions(
        user_id=current_user["id"],
        company_id=current_user.get("company_id"),
        include_expired=include_expired
    )


@router.get("/sessions/{session_id}", response_model=SessionResponse)
async def get_session(
    session_id: str,
    current_user: dict = Depends(require_permissions(["audit:sessions"])),
    db = Depends(get_company_db)
):
    """Get session details"""
    service = AuditService(db)
    
    session = await service.get_session(session_id)
    
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return session


@router.post("/sessions/{session_id}/revoke")
async def revoke_session(
    session_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["audit:sessions"])),
    db = Depends(get_company_db)
):
    """Revoke a session"""
    service = AuditService(db)
    
    success = await service.revoke_session(
        session_id=session_id,
        user_id=current_user["id"],
        reason=reason
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found"
        )
    
    return {"message": "Session revoked successfully"}


@router.post("/sessions/revoke-all")
async def revoke_all_sessions(
    data: RevokeAllSessionsRequest,
    current_user: dict = Depends(require_permissions(["audit:sessions"])),
    db = Depends(get_company_db)
):
    """Revoke all sessions for a user"""
    service = AuditService(db)
    
    count = await service.revoke_all_sessions(
        user_id=data.user_id,
        except_session_id=None,  # Could pass current session if needed
        reason=data.reason
    )
    
    return {
        "message": f"Revoked {count} sessions",
        "revoked_count": count
    }


@router.post("/sessions/revoke-my-other")
async def revoke_my_other_sessions(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Revoke all other sessions for current user"""
    service = AuditService(db)
    
    # Get current session ID from request context (would need to be passed)
    current_session_id = current_user.get("session_id")
    
    count = await service.revoke_all_sessions(
        user_id=current_user["id"],
        except_session_id=current_session_id,
        reason="User requested"
    )
    
    return {
        "message": f"Revoked {count} other sessions",
        "revoked_count": count
    }


# ============== Security Alerts ==============

@router.get("/alerts", response_model=SecurityAlertListResponse)
async def list_security_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    unresolved_only: bool = False,
    severity: Optional[AuditSeverity] = None,
    current_user: dict = Depends(require_permissions(["audit:alerts"])),
    db = Depends(get_company_db)
):
    """List security alerts"""
    service = AuditService(db)
    
    return await service.list_security_alerts(
        company_id=current_user["company_id"],
        unresolved_only=unresolved_only,
        severity=severity,
        page=page,
        page_size=page_size
    )


@router.get("/alerts/unresolved-count")
async def get_unresolved_alert_count(
    current_user: dict = Depends(require_permissions(["audit:alerts"])),
    db = Depends(get_company_db)
):
    """Get count of unresolved alerts"""
    service = AuditService(db)
    
    result = await service.list_security_alerts(
        company_id=current_user["company_id"],
        unresolved_only=True,
        page=1,
        page_size=1
    )
    
    return {"unresolved_count": result.unresolved_count}


@router.post("/alerts/{alert_id}/resolve")
async def resolve_alert(
    alert_id: str,
    data: ResolveAlertRequest,
    current_user: dict = Depends(require_permissions(["audit:alerts"])),
    db = Depends(get_company_db)
):
    """Resolve a security alert"""
    service = AuditService(db)
    
    success = await service.resolve_alert(
        alert_id=alert_id,
        company_id=current_user["company_id"],
        user_id=current_user["id"],
        resolution_notes=data.resolution_notes
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Alert not found"
        )
    
    return {"message": "Alert resolved successfully"}


# ============== User Activity ==============

@router.get("/activity/user/{user_id}", response_model=UserActivityResponse)
async def get_user_activity(
    user_id: str,
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Get activity summary for a user"""
    service = AuditService(db)
    
    return await service.get_user_activity(
        user_id=user_id,
        company_id=current_user["company_id"]
    )


@router.get("/activity/me", response_model=UserActivityResponse)
async def get_my_activity(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get activity summary for current user"""
    service = AuditService(db)
    
    return await service.get_user_activity(
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )


@router.get("/login-history/{user_id}")
async def get_login_history(
    user_id: str,
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db = Depends(get_company_db)
):
    """Get login history for a user"""
    service = AuditService(db)
    
    history = await service.get_login_history(
        user_id=user_id,
        limit=limit
    )
    
    return {"login_history": history}


@router.get("/login-history/me")
async def get_my_login_history(
    limit: int = Query(50, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get login history for current user"""
    service = AuditService(db)
    
    history = await service.get_login_history(
        user_id=current_user["id"],
        limit=limit
    )
    
    return {"login_history": history}


# ============== Cleanup ==============

@router.post("/cleanup/sessions")
async def cleanup_expired_sessions(
    current_user: dict = Depends(require_permissions(["audit:admin"])),
    db = Depends(get_company_db)
):
    """Cleanup expired sessions (admin only)"""
    service = AuditService(db)
    
    count = await service.cleanup_expired_sessions()
    
    return {
        "message": f"Cleaned up {count} expired sessions",
        "cleaned_count": count
    }