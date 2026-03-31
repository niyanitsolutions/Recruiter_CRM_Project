"""
Company Admin Dashboard API - Phase 2
Handles company admin dashboard data
"""
from fastapi import APIRouter, Depends, HTTPException
from datetime import datetime, timedelta, timezone
import asyncio

from app.services.user_service import UserService
from app.services.audit_service import AuditService
from app.core.dependencies import (
    get_company_db, require_permissions
)

router = APIRouter(prefix="/admin/dashboard", tags=["Admin Dashboard"])


async def _safe_count(collection, query: dict) -> int:
    """Count documents, returning 0 on any error."""
    try:
        return await collection.count_documents(query)
    except Exception:
        return 0


@router.get("/")
async def get_dashboard_data(
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get complete admin dashboard data"""
    user_service = UserService(db)
    audit_service = AuditService(db)

    # User stats + activity in parallel
    user_stats, activity_stats, recent_activity = await asyncio.gather(
        user_service.get_dashboard_stats(),
        audit_service.get_activity_stats(days=7),
        audit_service.get_recent_activity(limit=10),
    )

    # All quick counts in parallel
    (
        departments_count,
        designations_count,
        roles_count,
        candidates_count,
        rejected_candidates_count,
        active_clients_count,
        active_jobs_count,
        interviews_count,
        onboards_count,
        partners_count,
        targets_count,
        payouts_count,
    ) = await asyncio.gather(
        _safe_count(db.departments,   {"is_deleted": False}),
        _safe_count(db.designations,  {"is_deleted": False}),
        _safe_count(db.roles,         {"is_deleted": False}),
        _safe_count(db.candidates,    {"is_deleted": False}),
        _safe_count(db.applications,  {"is_deleted": False, "status": "rejected"}),
        _safe_count(db.clients,       {"is_deleted": False, "status": "active"}),
        _safe_count(db.jobs,          {"is_deleted": False, "status": {"$in": ["open", "active"]}}),
        _safe_count(db.interviews,    {"is_deleted": False}),
        _safe_count(db.onboards,      {"is_deleted": False}),
        _safe_count(db.users,         {"is_deleted": False, "role": "partner"}),
        _safe_count(db.targets,       {"is_deleted": False}),
        _safe_count(db.payouts,       {"is_deleted": False}),
    )

    return {
        "success": True,
        "data": {
            "user_stats": user_stats,
            "activity_stats": activity_stats,
            "recent_activity": recent_activity,
            "quick_stats": {
                "departments":          departments_count,
                "designations":         designations_count,
                "roles":                roles_count,
                "candidates":           candidates_count,
                "rejected_candidates":  rejected_candidates_count,
                "clients":              active_clients_count,
                "jobs":                 active_jobs_count,
                "interviews":           interviews_count,
                "onboards":             onboards_count,
                "partners":             partners_count,
                "targets":              targets_count,
                "payouts":              payouts_count,
            }
        }
    }


@router.get("/users-summary")
async def get_users_summary(
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get users summary for dashboard cards"""
    user_service = UserService(db)
    stats = await user_service.get_dashboard_stats()
    
    return {
        "success": True,
        "data": stats
    }


@router.get("/recent-users")
async def get_recent_users(
    limit: int = 5,
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get recently added users"""
    cursor = db.users.find(
        {"is_deleted": False}
    ).sort("created_at", -1).limit(limit)
    
    users = []
    async for user in cursor:
        users.append({
            "id": user["_id"],
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "status": user.get("status"),
            "created_at": user.get("created_at")
        })
    
    return {
        "success": True,
        "data": users
    }


@router.get("/recently-active")
async def get_recently_active_users(
    limit: int = 5,
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get recently active (logged in) users"""
    cursor = db.users.find(
        {"is_deleted": False, "last_login": {"$ne": None}}
    ).sort("last_login", -1).limit(limit)
    
    users = []
    async for user in cursor:
        users.append({
            "id": user["_id"],
            "full_name": user.get("full_name"),
            "email": user.get("email"),
            "role": user.get("role"),
            "last_login": user.get("last_login")
        })
    
    return {
        "success": True,
        "data": users
    }


@router.get("/activity-chart")
async def get_activity_chart_data(
    days: int = 7,
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get activity data for charts"""
    audit_service = AuditService(db)
    stats = await audit_service.get_activity_stats(days=days)
    
    return {
        "success": True,
        "data": {
            "daily_activity": stats.get("daily_activity", []),
            "actions_by_type": stats.get("actions_by_type", {}),
            "top_users": stats.get("top_users", [])
        }
    }


@router.get("/system-health")
async def get_system_health(
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get system health indicators"""
    now = datetime.now(timezone.utc)
    day_ago = now - timedelta(days=1)
    week_ago = now - timedelta(days=7)
    
    # Users created this week
    new_users_week = await db.users.count_documents({
        "is_deleted": False,
        "created_at": {"$gte": week_ago}
    })
    
    # Active users today
    active_today = await db.users.count_documents({
        "is_deleted": False,
        "last_login": {"$gte": day_ago}
    })
    
    # Total actions today
    actions_today = await db.audit_logs.count_documents({
        "created_at": {"$gte": day_ago}
    })
    
    # Suspended users
    suspended_users = await db.users.count_documents({
        "is_deleted": False,
        "status": "suspended"
    })
    
    return {
        "success": True,
        "data": {
            "new_users_this_week": new_users_week,
            "active_users_today": active_today,
            "actions_today": actions_today,
            "suspended_users": suspended_users,
            "last_checked": now.isoformat()
        }
    }