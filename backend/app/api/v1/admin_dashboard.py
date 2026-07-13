"""
Company Admin Dashboard API - Phase 2
Handles company admin dashboard data
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from datetime import datetime, timedelta, timezone
from typing import Optional, List
import asyncio

from app.services.user_service import UserService
from app.services.audit_service import AuditService
from app.services.candidate_service import CandidateService
from app.services.application_service import ApplicationService
from app.services.interview_service import InterviewService
from app.services.job_service import JobService
from app.services.client_service import ClientService
from app.core.dependencies import (
    get_company_db, require_permissions
)
from app.core.redis import get_cache, set_cache

DASHBOARD_CACHE_TTL = 300  # 5 minutes — safe for aggregate counts

router = APIRouter(prefix="/admin/dashboard", tags=["Admin Dashboard"])


async def _safe_count(collection, query: dict) -> int:
    """Count documents, returning 0 on any error."""
    try:
        return await collection.count_documents(query)
    except Exception:
        return 0


@router.get("/")
async def get_dashboard_data(
    days: Optional[int] = Query(None, ge=0, description="Filter stats to last N days; 0 or omit = all time"),
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get complete admin dashboard data"""
    # Compute start_date for period filtering (None = all time)
    start_date: Optional[datetime] = None
    if days and days > 0:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)

    # Serve from Redis cache per-user per-period to avoid 15 parallel DB queries.
    cache_key = f"dashboard:{current_user.get('company_id', '')}:{current_user.get('id', '')}:{days or 0}"
    cached = await get_cache(cache_key)
    if cached:
        return cached

    user_service = UserService(db)
    audit_service = AuditService(db)

    # User stats + activity in parallel
    user_stats, activity_stats, recent_activity = await asyncio.gather(
        user_service.get_dashboard_stats(current_user.get("company_id")),
        audit_service.get_activity_stats(days=7),
        audit_service.get_recent_activity(limit=10),
    )

    # Company-wide counts (no per-user ownership concept for these modules)
    (
        departments_count,
        designations_count,
        roles_count,
        onboards_count,
        partners_count,
        targets_count,
        payouts_count,
    ) = await asyncio.gather(
        _safe_count(db.departments,   {"is_deleted": False}),
        _safe_count(db.designations,  {"is_deleted": False}),
        _safe_count(db.roles,         {"is_deleted": False}),
        _safe_count(db.onboards,      {"is_deleted": False}),
        _safe_count(db.users,         {"is_deleted": False, "role": "partner"}),
        _safe_count(db.targets,       {"is_deleted": False}),
        _safe_count(db.payouts,       {"is_deleted": False}),
    )

    # Candidates/applications/interviews/jobs/clients — use the EXACT SAME
    # scoped queries as their respective module list pages (Task 3) so the
    # dashboard never shows a different count than the module itself for
    # non-admin roles (recruiter/coordinator/etc. with restricted visibility).
    cand_stats, app_stats, iv_stats, job_stats, client_stats = await asyncio.gather(
        CandidateService.get_dashboard_stats(db, current_user, start_date=start_date),
        ApplicationService.get_dashboard_stats(db, current_user, start_date=start_date),
        InterviewService.get_dashboard_stats(db, current_user, start_date=start_date),
        JobService.get_dashboard_stats(db, current_user, start_date=start_date),
        ClientService.get_dashboard_stats(db, current_user, start_date=start_date),
    )
    candidates_count = cand_stats.get("total", 0)
    rejected_candidates_count = app_stats.get("rejected", 0)
    active_clients_count = client_stats.get("active", 0)
    active_jobs_count = job_stats.get("open", 0)
    interviews_count = iv_stats.get("total", 0)

    result = {
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
    await set_cache(cache_key, result, ttl_seconds=DASHBOARD_CACHE_TTL)
    return result


@router.get("/users-summary")
async def get_users_summary(
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Get users summary for dashboard cards"""
    user_service = UserService(db)
    stats = await user_service.get_dashboard_stats(current_user.get("company_id"))

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
        {"is_deleted": False},
        {"_id": 1, "full_name": 1, "email": 1, "role": 1, "status": 1, "created_at": 1}
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
    
    _internal = {"is_deleted": False, "user_type": "internal"}

    # The 4 counts below are independent (different filters, 2 different
    # collections) so they run concurrently instead of one at a time.
    new_users_week, active_today, actions_today, suspended_users = await asyncio.gather(
        # Users created this week (internal only — partners don't count against seats)
        db.users.count_documents({**_internal, "created_at": {"$gte": week_ago}}),
        # Active users today
        db.users.count_documents({**_internal, "last_login": {"$gte": day_ago}}),
        # Total actions today
        db.audit_logs.count_documents({"created_at": {"$gte": day_ago}}),
        # Suspended users
        db.users.count_documents({**_internal, "status": "suspended"}),
    )
    
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


@router.get("/insights")
async def get_dashboard_insights(
    user_ids: Optional[str] = Query(None, description="Comma-separated user ids to enrich (e.g. top recruiters)"),
    current_user: dict = Depends(require_permissions(["dashboard:view"])),
    db = Depends(get_company_db),
):
    """Small additive dashboard-only aggregation — recruiter avatar/department
    lookup plus a few cross-domain counts (jobs without applications, overdue
    tasks, targets due soon, pending document/WFH approvals) that don't belong
    to any single existing dashboard-stats endpoint. Read-only, does not call
    into or change any existing service's behavior."""
    today_dt = datetime.now(timezone.utc)
    today_iso = today_dt.date().isoformat()
    soon_iso = (today_dt + timedelta(days=7)).date().isoformat()

    ids: List[str] = [u.strip() for u in (user_ids or "").split(",") if u.strip()]

    async def _recruiter_meta():
        meta = {}
        if not ids:
            return meta
        async for u in db.users.find({"_id": {"$in": ids}}, {"_id": 1, "department": 1, "avatar_url": 1}):
            meta[u["_id"]] = {"department": u.get("department"), "avatar_url": u.get("avatar_url")}
        return meta

    async def _jobs_without_applications():
        try:
            applied_job_ids = await db.applications.distinct("job_id")
            return await db.jobs.count_documents({
                "_id": {"$nin": applied_job_ids},
                "status": "open",
                "is_deleted": False,
            })
        except Exception:
            return 0

    (
        recruiter_meta,
        jobs_without_applications,
        overdue_tasks,
        targets_due_soon,
        document_approvals_pending,
        wfh_requests_pending,
    ) = await asyncio.gather(
        _recruiter_meta(),
        _jobs_without_applications(),
        _safe_count(db.tasks, {
            "due_date": {"$lt": today_dt},
            "status": {"$nin": ["completed", "cancelled"]},
            "is_deleted": False,
        }),
        _safe_count(db.targets, {
            "end_date": {"$gte": today_iso, "$lte": soon_iso},
            "status": {"$nin": ["achieved", "exceeded"]},
            "is_deleted": False,
        }),
        _safe_count(db.doc_approvals, {"status": "pending"}),
        _safe_count(db.hrm_work_mode_requests, {"status": "pending"}),
    )

    return {
        "success": True,
        "data": {
            "recruiter_meta": recruiter_meta,
            "jobs_without_applications": jobs_without_applications,
            "overdue_tasks": overdue_tasks,
            "targets_due_soon": targets_due_soon,
            "document_approvals_pending": document_approvals_pending,
            "wfh_requests_pending": wfh_requests_pending,
        }
    }