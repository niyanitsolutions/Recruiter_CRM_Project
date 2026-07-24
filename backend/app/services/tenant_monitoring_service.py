"""
Super Admin Tenant Activity Monitoring & Business Notification Service
────────────────────────────────────────────────────────────────────────
Purely additive module. Observes tenant lifecycle/business events (new
registration, subscription purchased/renewed, trial expired, payment failed)
and per-tenant inactivity, and surfaces them to the Super Admin only via:

  - master_db.super_admin_notifications  (in-app feed)
  - Email (via new functions in email_service.py)
  - Audit trail (via the EXISTING AuditService, scoped to the tenant's own
    company DB — no new audit engine)

Every public "fire_*" function swallows its own exceptions — a failure here
must never affect tenant registration, payment activation, or any other
primary business flow that calls into this module.

Does not modify TenantModel, NotificationModel, AuditService, or any
existing collection/schema.
"""

from __future__ import annotations

import asyncio
import logging
import time
from datetime import datetime, timedelta, timezone
from typing import Optional

from app.core.database import get_master_db, get_company_db
from app.models.master.super_admin import SuperAdminStatus
from app.models.master.tenant_monitoring import (
    SuperAdminNotificationType,
    SuperAdminNotificationModel,
    TenantActivityStatusModel,
)
from app.services import platform_settings_service

logger = logging.getLogger(__name__)

STARTUP_DELAY_SECONDS = 90
SCAN_INTERVAL_SECONDS = 24 * 60 * 60

# In-memory debounce for activity writes: company_id -> last write (monotonic seconds).
# Prevents a DB write on every single authenticated request.
_ACTIVITY_DEBOUNCE_SECONDS = 5 * 60
_last_activity_write: dict[str, float] = {}


# ─────────────────────────────────────────────────────────────────────────────
#  Shared helpers
# ─────────────────────────────────────────────────────────────────────────────

async def get_super_admin_emails(master_db=None) -> list[str]:
    """Active Super Admin email addresses — the only recipients for this feature's emails."""
    try:
        db = master_db or get_master_db()
        emails: list[str] = []
        cursor = db.super_admins.find({
            "status": SuperAdminStatus.ACTIVE.value,
            "is_deleted": {"$ne": True},
        })
        async for doc in cursor:
            email = doc.get("email")
            if email:
                emails.append(email)
        return emails
    except Exception as exc:
        logger.error("[TenantMonitoring] get_super_admin_emails failed: %s", exc, exc_info=True)
        return []


async def record_super_admin_notification(
    type_: SuperAdminNotificationType,
    title: str,
    message: str,
    company_id: Optional[str] = None,
    company_name: Optional[str] = None,
    data: Optional[dict] = None,
    master_db=None,
) -> None:
    """Insert one row into master_db.super_admin_notifications. Never raises."""
    try:
        db = master_db or get_master_db()
        doc = SuperAdminNotificationModel(
            type=type_,
            title=title,
            message=message,
            company_id=company_id,
            company_name=company_name,
            data=data,
        )
        await db.super_admin_notifications.insert_one(doc.to_dict())
    except Exception as exc:
        logger.error("[TenantMonitoring] record_super_admin_notification failed: %s", exc, exc_info=True)


async def audit_tenant_event(
    company_id: Optional[str],
    action: str,
    description: str,
    entity_name: Optional[str] = None,
    details: Optional[dict] = None,
) -> None:
    """
    Record this event in the TENANT'S OWN audit trail (company_db.audit_logs)
    using the existing AuditService — no new audit engine, only a new
    plain-string action value (audit_log.py's AuditAction enum is not
    modified; action/entity_type are unvalidated strings at the DB layer).
    """
    if not company_id:
        return
    try:
        from app.services.audit_service import AuditService
        company_db = get_company_db(company_id)
        audit = AuditService(company_db)
        await audit.log(
            action=action,
            entity_type="tenant",
            user_id="system",
            user_name="System Monitor",
            user_role="system",
            description=description,
            entity_id=company_id,
            entity_name=entity_name,
            details=details,
        )
    except Exception as exc:
        logger.error("[TenantMonitoring] audit_tenant_event failed for company_id=%s: %s", company_id, exc, exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
#  Event firers — one per lifecycle event, all additive call-sites use these
# ─────────────────────────────────────────────────────────────────────────────

async def fire_tenant_registered_event(tenant_data: dict) -> None:
    """Call right after a tenant document + company DB have been created."""
    try:
        if not await platform_settings_service.is_notification_enabled("new_tenant"):
            return
        master_db = get_master_db()
        company_id = tenant_data.get("company_id")
        company_name = tenant_data.get("company_name", "")
        owner = tenant_data.get("owner", {}) or {}
        owner_name = owner.get("full_name", "")
        owner_email = owner.get("email", "")
        plan_label = tenant_data.get("plan_display_name") or tenant_data.get("plan_name", "")
        registered_at = tenant_data.get("created_at")

        await record_super_admin_notification(
            SuperAdminNotificationType.TENANT_REGISTERED,
            "New Tenant Registered",
            f"{company_name} registered on the {plan_label} plan.",
            company_id=company_id,
            company_name=company_name,
            data={"owner_name": owner_name, "owner_email": owner_email, "plan": plan_label},
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:tenant_registered",
            f"Tenant '{company_name}' registered (plan: {plan_label})",
            entity_name=company_name,
        )

        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_new_tenant_email
        await send_super_admin_new_tenant_email(
            emails, company_name, owner_name, owner_email, plan_label, registered_at,
        )
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_tenant_registered_event failed: %s", exc, exc_info=True)


async def fire_subscription_purchased_event(
    company_id: str,
    company_name: str,
    plan_label: str,
    users: int,
    amount: float,
    currency: str,
    period_label: str,
    purchase_date: datetime,
) -> None:
    try:
        if not await platform_settings_service.is_notification_enabled("payment_received"):
            return
        master_db = get_master_db()
        await record_super_admin_notification(
            SuperAdminNotificationType.SUBSCRIPTION_PURCHASED,
            "Subscription Purchased",
            f"{company_name} purchased the {plan_label} plan ({currency} {amount:,.2f}).",
            company_id=company_id,
            company_name=company_name,
            data={"plan": plan_label, "users": users, "amount": amount, "currency": currency, "period": period_label},
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:subscription_purchased",
            f"Subscription purchased: {plan_label} ({currency} {amount:,.2f})",
            entity_name=company_name,
        )
        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_subscription_purchased_email
        await send_super_admin_subscription_purchased_email(
            emails, company_name, plan_label, users, amount, currency, period_label, purchase_date,
        )
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_subscription_purchased_event failed: %s", exc, exc_info=True)


async def fire_subscription_renewed_event(
    company_id: str,
    company_name: str,
    plan_label: str,
    amount: float,
    currency: str,
    new_expiry: datetime,
) -> None:
    try:
        if not await platform_settings_service.is_notification_enabled("subscription_renewed"):
            return
        master_db = get_master_db()
        await record_super_admin_notification(
            SuperAdminNotificationType.SUBSCRIPTION_RENEWED,
            "Subscription Renewed",
            f"{company_name} renewed the {plan_label} plan ({currency} {amount:,.2f}).",
            company_id=company_id,
            company_name=company_name,
            data={"plan": plan_label, "amount": amount, "currency": currency, "new_expiry": new_expiry.isoformat() if new_expiry else None},
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:subscription_renewed",
            f"Subscription renewed: {plan_label} ({currency} {amount:,.2f})",
            entity_name=company_name,
        )
        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_subscription_renewed_email
        await send_super_admin_subscription_renewed_email(
            emails, company_name, plan_label, amount, currency, new_expiry,
        )
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_subscription_renewed_event failed: %s", exc, exc_info=True)


async def fire_payment_failed_event(
    company_id: Optional[str],
    company_name: str,
    amount: float,
    currency: str,
    reason: Optional[str],
) -> None:
    try:
        if not await platform_settings_service.is_notification_enabled("payment_failed"):
            return
        master_db = get_master_db()
        await record_super_admin_notification(
            SuperAdminNotificationType.PAYMENT_FAILED,
            "Payment Failed",
            f"Payment of {currency} {amount:,.2f} failed for {company_name}.",
            company_id=company_id,
            company_name=company_name,
            data={"amount": amount, "currency": currency, "reason": reason},
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:payment_failed",
            f"Payment failed: {currency} {amount:,.2f}" + (f" — {reason}" if reason else ""),
            entity_name=company_name,
        )
        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_payment_failed_email
        await send_super_admin_payment_failed_email(emails, company_name, amount, currency, reason)
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_payment_failed_event failed: %s", exc, exc_info=True)


async def fire_trial_expired_event(tenant_doc: dict) -> None:
    try:
        if not await platform_settings_service.is_notification_enabled("trial_expiring"):
            return
        master_db = get_master_db()
        company_id = tenant_doc.get("company_id")
        company_name = tenant_doc.get("company_name", "")
        owner_email = (tenant_doc.get("owner") or {}).get("email", "")
        trial_started = tenant_doc.get("trial_start_date") or tenant_doc.get("plan_start_date")
        trial_expired_on = tenant_doc.get("trial_end_date") or tenant_doc.get("plan_expiry")

        await record_super_admin_notification(
            SuperAdminNotificationType.TRIAL_EXPIRED,
            "Trial Expired",
            f"The free trial for {company_name} has expired.",
            company_id=company_id,
            company_name=company_name,
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:trial_expired",
            f"Free trial expired for '{company_name}'",
            entity_name=company_name,
        )
        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_trial_expired_email
        await send_super_admin_trial_expired_email(emails, company_name, owner_email, trial_started, trial_expired_on)
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_trial_expired_event failed: %s", exc, exc_info=True)


async def fire_tenant_inactive_event(tenant_doc: dict, inactive_days: int, last_activity_at: Optional[datetime]) -> None:
    try:
        if not await platform_settings_service.is_notification_enabled("tenant_inactive"):
            return
        master_db = get_master_db()
        company_id = tenant_doc.get("company_id")
        company_name = tenant_doc.get("company_name", "")
        owner_email = (tenant_doc.get("owner") or {}).get("email", "")

        await record_super_admin_notification(
            SuperAdminNotificationType.TENANT_INACTIVE,
            "Tenant Inactive",
            f"No activity from any user of {company_name} for {inactive_days}+ days.",
            company_id=company_id,
            company_name=company_name,
            data={"inactive_days": inactive_days, "last_activity_at": last_activity_at.isoformat() if last_activity_at else None},
            master_db=master_db,
        )
        await audit_tenant_event(
            company_id, "super_admin_alert:tenant_inactive",
            f"Tenant flagged inactive — no activity for {inactive_days}+ days",
            entity_name=company_name,
        )
        emails = await get_super_admin_emails(master_db)
        from app.services.email_service import send_super_admin_tenant_inactive_email
        await send_super_admin_tenant_inactive_email(emails, company_name, owner_email, inactive_days, last_activity_at)
    except Exception as exc:
        logger.error("[TenantMonitoring] fire_tenant_inactive_event failed: %s", exc, exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
#  Activity tracking (called by TenantActivityTrackerMiddleware)
# ─────────────────────────────────────────────────────────────────────────────

async def touch_tenant_activity(company_id: str) -> None:
    """
    Debounced upsert of last_activity_at for a tenant. Fire-and-forget —
    called via asyncio.ensure_future from the middleware, never awaited
    inline on the request path.
    """
    if not company_id:
        return
    now_mono = time.monotonic()
    last = _last_activity_write.get(company_id, 0.0)
    if (now_mono - last) < _ACTIVITY_DEBOUNCE_SECONDS:
        return
    _last_activity_write[company_id] = now_mono
    try:
        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        await master_db.tenant_activity_status.update_one(
            {"company_id": company_id},
            {"$set": {"company_id": company_id, "last_activity_at": now, "updated_at": now},
             "$setOnInsert": {"_id": company_id}},
            upsert=True,
        )
    except Exception as exc:
        logger.error("[TenantMonitoring] touch_tenant_activity failed for company_id=%s: %s", company_id, exc, exc_info=True)


# ─────────────────────────────────────────────────────────────────────────────
#  Daily scan — inactivity + trial expiry
# ─────────────────────────────────────────────────────────────────────────────

async def run_daily_activity_scan() -> None:
    """
    Body of the daily monitoring job. Evaluates only tenants that are
    ACTIVE and not soft-deleted (skips suspended/cancelled/trial_expired/
    deleted), scanning on already-indexed fields.
    """
    try:
        if not await platform_settings_service.is_tenant_activity_monitoring_enabled():
            return
        master_db = get_master_db()
        inactivity_days = await platform_settings_service.get_inactivity_days()
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=inactivity_days)

        cursor = master_db.tenants.find({
            "status": "active",
            "is_deleted": {"$ne": True},
        })
        async for tenant in cursor:
            company_id = tenant.get("company_id")
            if not company_id:
                continue
            try:
                await _scan_one_tenant(master_db, tenant, cutoff, inactivity_days, now)
            except Exception as _tenant_exc:
                logger.error(
                    "[TenantMonitoring] daily scan failed for company_id=%s: %s",
                    company_id, _tenant_exc, exc_info=True,
                )
    except Exception as exc:
        logger.error("[TenantMonitoring] run_daily_activity_scan failed: %s", exc, exc_info=True)


async def _scan_one_tenant(master_db, tenant: dict, cutoff: datetime, inactivity_days: int, now: datetime) -> None:
    company_id = tenant["company_id"]
    status_doc = await master_db.tenant_activity_status.find_one({"company_id": company_id})

    last_activity_at = (status_doc or {}).get("last_activity_at")
    if last_activity_at is None:
        # No activity recorded yet — fall back to registration date so a
        # brand-new tenant isn't immediately flagged inactive.
        last_activity_at = tenant.get("created_at")
    if last_activity_at and last_activity_at.tzinfo is None:
        last_activity_at = last_activity_at.replace(tzinfo=timezone.utc)

    # ── Inactivity check ────────────────────────────────────────────────────
    if last_activity_at and last_activity_at < cutoff:
        inactive_alert_sent_at = (status_doc or {}).get("inactive_alert_sent_at")
        inactive_since = (status_doc or {}).get("inactive_since")
        if inactive_since and inactive_since.tzinfo is None:
            inactive_since = inactive_since.replace(tzinfo=timezone.utc)

        already_alerted_for_this_streak = bool(inactive_alert_sent_at) and inactive_since == last_activity_at
        if not already_alerted_for_this_streak:
            await fire_tenant_inactive_event(tenant, inactivity_days, last_activity_at)
            await master_db.tenant_activity_status.update_one(
                {"company_id": company_id},
                {"$set": {
                    "company_id": company_id,
                    "inactive_alert_sent_at": now,
                    "inactive_since": last_activity_at,
                    "updated_at": now,
                }, "$setOnInsert": {"_id": company_id}},
                upsert=True,
            )

    # ── Trial expiry check ──────────────────────────────────────────────────
    if tenant.get("is_trial"):
        plan_expiry = tenant.get("plan_expiry")
        if plan_expiry and plan_expiry.tzinfo is None:
            plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
        if plan_expiry and plan_expiry < now:
            trial_expired_alert_sent = bool((status_doc or {}).get("trial_expired_alert_sent"))
            if not trial_expired_alert_sent:
                await fire_trial_expired_event(tenant)
                await master_db.tenant_activity_status.update_one(
                    {"company_id": company_id},
                    {"$set": {"company_id": company_id, "trial_expired_alert_sent": True, "updated_at": now},
                     "$setOnInsert": {"_id": company_id}},
                    upsert=True,
                )


async def tenant_activity_monitor_loop() -> None:
    """Runs once daily on exactly one worker via the existing SchedulerLeader (see main.py)."""
    await asyncio.sleep(STARTUP_DELAY_SECONDS)
    while True:
        try:
            await run_daily_activity_scan()
        except Exception as exc:
            logger.error("[TenantMonitoring] tenant_activity_monitor_loop iteration failed: %s", exc, exc_info=True)
        await asyncio.sleep(SCAN_INTERVAL_SECONDS)
