"""
Super Admin — Tenant Activity Monitoring & Business Notifications (additive)
─────────────────────────────────────────────────────────────────────────────
New, fully isolated router — does not modify app/api/v1/super_admin.py.
Mounted under the same `/super-admin` prefix as the other Super Admin
extension routers (communication, payment-provider, telephony, AI provider).

Every endpoint here is gated by require_super_admin() and only ever reads/
writes the new master_db collections introduced for this feature
(`super_admin_notifications`, `tenant_activity_status`) plus the new
`tenant_activity_monitoring` key inside the existing `platform_settings`
document. No tenant-facing route can reach any of this.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field

from app.core.dependencies import get_master_db, require_super_admin
from app.services.platform_settings_service import (
    get_tenant_activity_monitoring_settings,
    get_inactivity_days,
    invalidate_cache,
)

router = APIRouter()


def _aware(dt: Optional[datetime]) -> Optional[datetime]:
    if dt and dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class ActivityMonitorSettingsUpdate(BaseModel):
    enabled: Optional[bool] = None
    inactivity_days: Optional[int] = Field(default=None, ge=1, le=90)


@router.get("/activity-monitor/dashboard")
async def get_activity_monitor_dashboard(
    _: dict = Depends(require_super_admin()),
    master_db=Depends(get_master_db),
):
    """Tenant Monitoring stat cards: registrations, trial state, active/inactive, subscriptions, failures."""
    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    month_ago = now - timedelta(days=30)
    inactivity_days = await get_inactivity_days()
    inactive_cutoff = now - timedelta(days=inactivity_days)

    base = {"is_deleted": {"$ne": True}}

    new_registrations = await master_db.tenants.count_documents({**base, "created_at": {"$gte": week_ago}})
    trial_active = await master_db.tenants.count_documents({
        **base, "status": "active", "is_trial": True, "plan_expiry": {"$gte": now},
    })
    trial_expired = await master_db.tenants.count_documents({
        **base, "is_trial": True, "plan_expiry": {"$lt": now},
    })
    active_tenants = await master_db.tenants.count_documents({**base, "status": "active"})

    # Inactive = active tenants whose last known activity predates the cutoff.
    # Tracked via tenant_activity_status; tenants never tracked yet fall back
    # to their registration date so brand-new signups aren't flagged.
    stale_company_ids = await master_db.tenant_activity_status.distinct(
        "company_id", {"last_activity_at": {"$lt": inactive_cutoff}}
    )
    tracked_company_ids = await master_db.tenant_activity_status.distinct("company_id", {})
    inactive_tenants = await master_db.tenants.count_documents({
        **base, "status": "active",
        "$or": [
            {"company_id": {"$in": stale_company_ids or ["__none__"]}},
            {"company_id": {"$nin": tracked_company_ids or ["__none__"]}, "created_at": {"$lt": inactive_cutoff}},
        ],
    })

    subs_purchased = await master_db.super_admin_notifications.count_documents({
        "type": "subscription_purchased", "created_at": {"$gte": month_ago},
    })
    subs_renewed = await master_db.super_admin_notifications.count_documents({
        "type": "subscription_renewed", "created_at": {"$gte": month_ago},
    })
    payment_failures = await master_db.super_admin_notifications.count_documents({
        "type": "payment_failed", "created_at": {"$gte": month_ago},
    })

    return {
        "new_registrations": new_registrations,
        "trial_active": trial_active,
        "trial_expired": trial_expired,
        "active_tenants": active_tenants,
        "inactive_tenants": inactive_tenants,
        "subscriptions_purchased": subs_purchased,
        "subscriptions_renewed": subs_renewed,
        "payment_failures": payment_failures,
        "inactivity_days": inactivity_days,
    }


@router.get("/activity-monitor/tenants")
async def list_activity_monitor_tenants(
    filter: str = Query("all", description="all|trial|paid|expired|inactive|active|payment_failed"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: dict = Depends(require_super_admin()),
    master_db=Depends(get_master_db),
):
    now = datetime.now(timezone.utc)
    inactivity_days = await get_inactivity_days()
    inactive_cutoff = now - timedelta(days=inactivity_days)

    query: dict = {"is_deleted": {"$ne": True}}
    if filter == "trial":
        query["is_trial"] = True
    elif filter == "paid":
        query["is_trial"] = False
    elif filter == "expired":
        query["plan_expiry"] = {"$lt": now}
    elif filter == "active":
        query["status"] = "active"
    elif filter == "payment_failed":
        ids = await master_db.super_admin_notifications.distinct("company_id", {"type": "payment_failed"})
        query["company_id"] = {"$in": ids or ["__none__"]}
    elif filter not in ("all", "inactive"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid filter")

    is_inactive_filter = filter == "inactive"
    if is_inactive_filter:
        query["status"] = "active"

    cursor = master_db.tenants.find(query).sort("created_at", -1)
    if not is_inactive_filter:
        total = await master_db.tenants.count_documents(query)
        cursor = cursor.skip((page - 1) * limit).limit(limit)
        tenants = await cursor.to_list(length=limit)
    else:
        # Inactive status depends on the activity join, so filter after fetch.
        tenants = await cursor.to_list(length=5000)

    company_ids = [t.get("company_id") for t in tenants if t.get("company_id")]
    activity_map: dict = {}
    if company_ids:
        async for doc in master_db.tenant_activity_status.find({"company_id": {"$in": company_ids}}):
            activity_map[doc["company_id"]] = doc

    items = []
    for t in tenants:
        cid = t.get("company_id")
        status_doc = activity_map.get(cid, {})
        last_activity_at = _aware(status_doc.get("last_activity_at")) or _aware(t.get("created_at"))
        is_inactive = bool(last_activity_at and last_activity_at < inactive_cutoff)

        if is_inactive_filter and not is_inactive:
            continue

        owner = t.get("owner") or {}
        items.append({
            "company_id": cid,
            "company_name": t.get("company_name"),
            "owner_name": owner.get("full_name"),
            "owner_email": owner.get("email"),
            "plan_name": t.get("plan_display_name") or t.get("plan_name"),
            "users": t.get("max_users"),
            "registered_at": t.get("created_at"),
            "last_activity_at": last_activity_at,
            "inactive_since": status_doc.get("inactive_since"),
            "is_trial": t.get("is_trial"),
            "status": t.get("status"),
            "plan_expiry": t.get("plan_expiry"),
            "is_inactive": is_inactive,
        })

    if is_inactive_filter:
        total = len(items)
        start = (page - 1) * limit
        items = items[start:start + limit]

    return {
        "tenants": items,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit if total else 0,
    }


@router.get("/activity-monitor/notifications")
async def list_activity_monitor_notifications(
    unread_only: bool = Query(False),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    _: dict = Depends(require_super_admin()),
    master_db=Depends(get_master_db),
):
    query: dict = {}
    if unread_only:
        query["is_read"] = False

    total = await master_db.super_admin_notifications.count_documents(query)
    unread_count = await master_db.super_admin_notifications.count_documents({"is_read": False})
    cursor = (
        master_db.super_admin_notifications.find(query)
        .sort("created_at", -1)
        .skip((page - 1) * limit)
        .limit(limit)
    )
    items = []
    async for doc in cursor:
        doc["id"] = doc.pop("_id")
        items.append(doc)

    return {
        "notifications": items,
        "total": total,
        "unread_count": unread_count,
        "page": page,
        "limit": limit,
    }


@router.put("/activity-monitor/notifications/{notification_id}/read")
async def mark_activity_monitor_notification_read(
    notification_id: str,
    _: dict = Depends(require_super_admin()),
    master_db=Depends(get_master_db),
):
    result = await master_db.super_admin_notifications.update_one(
        {"_id": notification_id},
        {"$set": {"is_read": True, "read_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return {"success": True}


@router.get("/activity-monitor/settings")
async def get_activity_monitor_settings(
    _: dict = Depends(require_super_admin()),
):
    return await get_tenant_activity_monitoring_settings()


@router.put("/activity-monitor/settings")
async def update_activity_monitor_settings(
    payload: ActivityMonitorSettingsUpdate,
    _: dict = Depends(require_super_admin()),
    master_db=Depends(get_master_db),
):
    update: dict = {}
    if payload.enabled is not None:
        update["tenant_activity_monitoring.enabled"] = payload.enabled
    if payload.inactivity_days is not None:
        update["tenant_activity_monitoring.inactivity_days"] = payload.inactivity_days

    if update:
        update["updated_at"] = datetime.now(timezone.utc)
        await master_db.platform_settings.update_one(
            {"_id": "global"}, {"$set": update}, upsert=True,
        )
        invalidate_cache()

    return await get_tenant_activity_monitoring_settings()
