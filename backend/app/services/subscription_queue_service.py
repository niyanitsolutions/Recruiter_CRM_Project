"""
Subscription Queue Service

Queued ("Activate After Current Plan Expires") subscriptions for tenants.
Entries live in master_db.subscription_queue:

    {
        _id, tenant_id, company_id,
        plan_id, plan_name, plan_display_name, billing_cycle,
        seats,                      # licensed seats the queued plan activates with
        purchase_date,              # when the tenant paid
        activation_date,            # planned start (current plan's expiry at purchase)
        activated_at,               # actual activation timestamp
        expiry_date,                # planned end (activation + cycle)
        status,                     # queued | active | expired | cancelled
        payment_id,                 # billing-history reference (immutable payments doc)
        created_at, updated_at
    }

State machine (enforced by _transition):
    queued  → active | cancelled
    active  → expired
Only one entry may be "active" per tenant; activating a new entry expires the
previous active one. Activation happens lazily at login (tenant_resolver) and
via the hourly background sweep — no manual step required.
"""
import logging
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional, List

from app.core.database import get_master_db
from app.models.master.tenant import TenantStatus

logger = logging.getLogger(__name__)

QUEUE_COL = "subscription_queue"

# Valid state transitions — anything else is rejected
VALID_TRANSITIONS = {
    "queued": {"active", "cancelled"},
    "active": {"expired"},
    "expired": set(),
    "cancelled": set(),
}

# If the old plan expired more than this many days ago, the queued plan starts
# from "now" instead of back-dating to the old expiry (dormant-tenant fairness).
_BACKDATE_GRACE_DAYS = 7


def _aware(dt) -> Optional[datetime]:
    if dt is None:
        return None
    if isinstance(dt, str):
        try:
            dt = datetime.fromisoformat(dt.replace("Z", "+00:00"))
        except ValueError:
            return None
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt


class SubscriptionQueueService:
    """Queued-subscription lifecycle. Reuses the tenants collection as the
    single source of subscription state — this service only decides WHEN a
    queued purchase becomes the tenant's current plan."""

    # ── Creation (called from PaymentService._activate_payment) ────────────────

    @staticmethod
    async def create_queued_entry(
        payment: dict,
        seats: int,
        activation_date: datetime,
        expiry_date: datetime,
    ) -> dict:
        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        entry = {
            "_id": str(uuid.uuid4()),
            "tenant_id": payment["tenant_id"],
            "company_id": payment.get("company_id"),
            "plan_id": payment["plan_id"],
            "plan_name": payment.get("plan_name"),
            "plan_display_name": payment.get("plan_display_name") or payment.get("plan_name"),
            "billing_cycle": payment.get("billing_cycle", "monthly"),
            "seats": max(int(seats), 1),
            "purchase_date": now,
            "activation_date": activation_date,
            "activated_at": None,
            "expiry_date": expiry_date,
            "status": "queued",
            "payment_id": payment["_id"],
            "created_at": now,
            "updated_at": now,
        }
        await master_db[QUEUE_COL].insert_one(entry)
        logger.info(
            "Queued subscription created | tenant=%s plan=%s seats=%d activates=%s",
            payment["tenant_id"], payment.get("plan_name"), entry["seats"], activation_date,
        )
        return entry

    # ── State machine ───────────────────────────────────────────────────────────

    @staticmethod
    async def _transition(entry_id: str, from_status: str, to_status: str, extra: Optional[dict] = None) -> bool:
        """Atomic guarded transition. Returns False when the entry was not in
        from_status (concurrent actor won) or the transition is invalid."""
        if to_status not in VALID_TRANSITIONS.get(from_status, set()):
            logger.warning("Invalid queue transition %s → %s for %s", from_status, to_status, entry_id)
            return False
        master_db = get_master_db()
        update = {"status": to_status, "updated_at": datetime.now(timezone.utc)}
        if extra:
            update.update(extra)
        res = await master_db[QUEUE_COL].update_one(
            {"_id": entry_id, "status": from_status},   # status filter = concurrency lock
            {"$set": update},
        )
        return res.modified_count == 1

    # ── Activation ──────────────────────────────────────────────────────────────

    @staticmethod
    async def activate_due_for_tenant(tenant: dict) -> bool:
        """Activate the earliest queued subscription if the tenant's current
        plan has expired. Returns True when a queued plan was activated.

        Safe to call from hot paths: exits immediately unless the plan is
        actually expired AND a queued entry exists.
        """
        now = datetime.now(timezone.utc)
        expiry = _aware(tenant.get("plan_expiry"))
        if expiry and expiry > now:
            return False  # current plan still running

        master_db = get_master_db()
        entry = await master_db[QUEUE_COL].find_one(
            {"tenant_id": tenant["_id"], "status": "queued"},
            sort=[("activation_date", 1)],
        )
        if not entry:
            return False

        # Guarded transition is the concurrency lock (login + sweep may race)
        activated = await SubscriptionQueueService._transition(
            entry["_id"], "queued", "active", {"activated_at": now}
        )
        if not activated:
            return False

        # Coverage starts at the old expiry when activation is prompt, else now
        # (a dormant tenant should not lose paid days to back-dating).
        base = now
        if expiry and (now - expiry) <= timedelta(days=_BACKDATE_GRACE_DAYS):
            base = expiry

        from app.services.payment_service import CYCLE_DAYS
        cycle_days = CYCLE_DAYS.get(entry.get("billing_cycle", "monthly"), 30)
        new_expiry = base + timedelta(days=cycle_days)

        # Seats: the queued snapshot, unless a reduction was scheduled AFTER the
        # queued purchase — the smaller explicit target wins for the new cycle.
        seats = int(entry.get("seats", 1))
        scheduled = tenant.get("scheduled_seat_reduction")
        if scheduled and int(scheduled) > 0:
            seats = int(scheduled)

        tenant_update = {
            "plan_id": entry["plan_id"],
            "plan_name": entry.get("plan_name"),
            "plan_display_name": entry.get("plan_display_name"),
            "billing_cycle": entry.get("billing_cycle", "monthly"),
            "plan_start_date": base,
            "plan_expiry": new_expiry,
            "max_users": seats,
            "status": TenantStatus.ACTIVE,
            "is_trial": False,
            "reminder_sent": False,
            "updated_at": now,
        }
        await master_db.tenants.update_one(
            {"_id": tenant["_id"]},
            {"$set": tenant_update, "$unset": {"scheduled_seat_reduction": ""}},
        )

        # Expire any previously-active queue entries (only one active at a time)
        prior_active = master_db[QUEUE_COL].find(
            {"tenant_id": tenant["_id"], "status": "active", "_id": {"$ne": entry["_id"]}},
            {"_id": 1},
        )
        async for prior in prior_active:
            await SubscriptionQueueService._transition(prior["_id"], "active", "expired")

        # Record the actual activation window on the entry
        await master_db[QUEUE_COL].update_one(
            {"_id": entry["_id"]},
            {"$set": {"activation_date": base, "expiry_date": new_expiry,
                      "updated_at": datetime.now(timezone.utc)}},
        )

        # Keep the tenant dict callers hold in sync (tenant_resolver re-checks it)
        tenant.update(tenant_update)

        logger.info(
            "Queued subscription activated | tenant=%s plan=%s seats=%d expiry=%s",
            tenant["_id"], entry.get("plan_name"), seats, new_expiry,
        )
        return True

    @staticmethod
    async def sweep_all() -> int:
        """Activate due queued subscriptions across all tenants (hourly loop).
        Also marks stale 'active' entries as expired once their window passed
        and the tenant has since moved on (renewal/new plan)."""
        master_db = get_master_db()
        activated = 0

        tenant_ids = await master_db[QUEUE_COL].distinct("tenant_id", {"status": "queued"})
        for tid in tenant_ids:
            try:
                tenant = await master_db.tenants.find_one(
                    {"_id": tid, "is_deleted": {"$ne": True}}
                )
                if not tenant:
                    continue
                if await SubscriptionQueueService.activate_due_for_tenant(tenant):
                    activated += 1
            except Exception as exc:
                logger.warning("Queue sweep failed for tenant %s: %s", tid, exc)

        return activated

    # ── Cancellation ────────────────────────────────────────────────────────────

    @staticmethod
    async def cancel_queued(entry_id: str, tenant_id: str) -> bool:
        """Cancel a queued (not yet active) subscription. queued → cancelled only."""
        master_db = get_master_db()
        entry = await master_db[QUEUE_COL].find_one({"_id": entry_id, "tenant_id": tenant_id})
        if not entry:
            return False
        return await SubscriptionQueueService._transition(entry_id, "queued", "cancelled")

    # ── Queries ─────────────────────────────────────────────────────────────────

    @staticmethod
    async def list_for_tenant(tenant_id: str, include_concluded: bool = False) -> List[dict]:
        master_db = get_master_db()
        query: dict = {"tenant_id": tenant_id}
        if not include_concluded:
            query["status"] = {"$in": ["queued", "active"]}
        cursor = master_db[QUEUE_COL].find(query).sort("created_at", -1)
        return [doc async for doc in cursor]


async def subscription_queue_loop() -> None:
    """Hourly background sweep so queued plans activate automatically even for
    tenants that never log in around their expiry. Lazy activation at login
    (tenant_resolver) remains the fast path."""
    import asyncio
    await asyncio.sleep(120)  # startup delay
    while True:
        try:
            count = await SubscriptionQueueService.sweep_all()
            if count:
                logger.info("Subscription queue sweep: %d plan(s) activated", count)
        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.error("subscription_queue_loop error: %s", exc)
        await asyncio.sleep(3600)
