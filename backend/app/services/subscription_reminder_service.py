"""
Subscription Reminder Service

Scans tenants and sellers tables daily for accounts expiring within 3 days
and sends a one-time reminder email per expiry cycle.

Duplicate-send prevention: each record has a `reminder_sent` boolean field.
It is set to True after the reminder is sent and reset to False whenever
a subscription is renewed/extended (see seller_service + payment_service).
"""

import asyncio
import logging
from datetime import datetime, timedelta, timezone

from app.core.database import get_master_db

logger = logging.getLogger(__name__)

# ── Configuration ──────────────────────────────────────────────────────────────
REMINDER_DAYS_BEFORE = 3          # Send reminder N days before expiry
STARTUP_DELAY_SECONDS = 60        # Wait after startup before first run
INTERVAL_SECONDS = 24 * 60 * 60  # Run every 24 hours


class SubscriptionReminderService:
    """Checks for expiring subscriptions and sends reminder emails."""

    @staticmethod
    async def send_tenant_reminders() -> int:
        """
        Find active tenants whose subscription expires within REMINDER_DAYS_BEFORE
        days and who have not yet received a reminder for this cycle.
        Returns the count of reminders successfully sent.
        """
        from app.services.email_service import EmailService

        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        warning_threshold = now + timedelta(days=REMINDER_DAYS_BEFORE)

        cursor = master_db.tenants.find({
            "is_deleted": {"$ne": True},
            "status": "active",
            # Only send to verified tenants — unverified accounts can't log in anyway
            "email_verified": {"$ne": False},
            "plan_expiry": {"$gte": now, "$lte": warning_threshold},
            # Skip if reminder was already sent for this cycle
            "reminder_sent": {"$ne": True},
        })
        tenants = await cursor.to_list(length=200)

        sent = 0
        for tenant in tenants:
            owner = tenant.get("owner", {})
            email = owner.get("email", "")
            full_name = owner.get("full_name", "")
            company = tenant.get("company_name", "")
            plan_expiry = tenant.get("plan_expiry")

            if not email:
                continue

            try:
                ok = await EmailService.send_subscription_reminder_email(
                    to_email=email,
                    full_name=full_name,
                    company_name=company,
                    plan_expiry=plan_expiry,
                    account_type="tenant",
                )
                if ok:
                    await master_db.tenants.update_one(
                        {"_id": tenant["_id"]},
                        {"$set": {"reminder_sent": True}}
                    )
                    sent += 1
                    logger.info(
                        f"[REMINDER] Tenant '{company}' <{email}> — "
                        f"expires {plan_expiry}"
                    )
            except Exception as exc:
                logger.error(f"[REMINDER ERROR] Tenant {tenant['_id']}: {exc}")

        return sent

    @staticmethod
    async def send_seller_reminders() -> int:
        """
        Find active sellers whose subscription expires within REMINDER_DAYS_BEFORE
        days and who have not yet received a reminder for this cycle.
        Returns the count of reminders successfully sent.
        """
        from app.services.email_service import EmailService

        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        warning_threshold = now + timedelta(days=REMINDER_DAYS_BEFORE)

        cursor = master_db.sellers.find({
            "is_deleted": {"$ne": True},
            "status": "active",
            "plan_expiry_date": {"$gte": now, "$lte": warning_threshold},
            "reminder_sent": {"$ne": True},
        })
        sellers = await cursor.to_list(length=200)

        sent = 0
        for seller in sellers:
            email = seller.get("email", "")
            full_name = seller.get("seller_name", "")
            company = seller.get("company_name", "")
            plan_expiry = seller.get("plan_expiry_date")

            if not email:
                continue

            try:
                ok = await EmailService.send_subscription_reminder_email(
                    to_email=email,
                    full_name=full_name,
                    company_name=company,
                    plan_expiry=plan_expiry,
                    account_type="seller",
                )
                if ok:
                    await master_db.sellers.update_one(
                        {"_id": seller["_id"]},
                        {"$set": {"reminder_sent": True}}
                    )
                    sent += 1
                    logger.info(
                        f"[REMINDER] Seller '{company}' <{email}> — "
                        f"expires {plan_expiry}"
                    )
            except Exception as exc:
                logger.error(f"[REMINDER ERROR] Seller {seller['_id']}: {exc}")

        return sent

    @staticmethod
    async def run_once() -> None:
        """Run both tenant and seller reminder scans once."""
        logger.info("[REMINDER JOB] Starting subscription reminder scan...")
        try:
            tenant_count = await SubscriptionReminderService.send_tenant_reminders()
            seller_count = await SubscriptionReminderService.send_seller_reminders()
            logger.info(
                f"[REMINDER JOB] Done — "
                f"{tenant_count} tenant reminder(s), "
                f"{seller_count} seller reminder(s) sent."
            )
        except Exception as exc:
            logger.error(f"[REMINDER JOB] Unhandled error: {exc}")


async def reminder_background_loop() -> None:
    """
    Asyncio background task launched from main.py lifespan.

    Waits STARTUP_DELAY_SECONDS after app start, then runs every
    INTERVAL_SECONDS (24 h). Runs forever until the task is cancelled
    during application shutdown.
    """
    logger.info(
        f"[REMINDER] Background loop started — "
        f"first run in {STARTUP_DELAY_SECONDS}s, then every "
        f"{INTERVAL_SECONDS // 3600}h."
    )
    await asyncio.sleep(STARTUP_DELAY_SECONDS)

    while True:
        await SubscriptionReminderService.run_once()
        await asyncio.sleep(INTERVAL_SECONDS)
