"""
Payment Service
Handles Razorpay integration and payment processing
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple, List
import asyncio
import hashlib
import hmac
import logging
import uuid

from pymongo.errors import DuplicateKeyError

from app.core.database import get_master_db
from app.models.master.payment import PaymentStatus, PaymentMethod
from app.models.master.tenant import TenantStatus
from app.services.payment_provider_service import PaymentProviderService
from app.services.tenant_service import tenant_service

logger = logging.getLogger(__name__)


# ── Billing-cycle reference tables (single source of truth) ────────────────────
CYCLE_DAYS = {"monthly": 30, "quarterly": 90, "half_yearly": 180, "yearly": 365}
CYCLE_MONTHS = {"monthly": 1, "quarterly": 3, "half_yearly": 6, "yearly": 12}


def cycle_price_per_seat(plan: dict, billing_cycle: str) -> int:
    """Full-cycle price for ONE seat on the given billing cycle.

    Monthly/quarterly/half-yearly bill at the monthly per-user rate × months.
    Yearly uses the (discounted) yearly per-user rate × 12.
    """
    monthly_rate = plan.get("price_per_user_monthly", plan.get("price_monthly", 0))
    if billing_cycle == "yearly":
        yearly_rate = plan.get("price_per_user_yearly", plan.get("price_yearly", monthly_rate))
        return int(yearly_rate * 12)
    return int(monthly_rate * CYCLE_MONTHS.get(billing_cycle, 1))


def remaining_validity_days(tenant: dict, now: Optional[datetime] = None) -> Tuple[int, int]:
    """(remaining_days, total_cycle_days) of the tenant's CURRENT subscription.

    remaining = ceil days from now to plan_expiry (0 when expired).
    total     = actual current cycle length (plan_expiry − plan_start_date) when
                both dates are stored; falls back to the standard days for the
                tenant's billing_cycle. Deterministic for leap years and
                month-end because it uses the real stored dates.
    """
    now = now or datetime.now(timezone.utc)
    expiry = tenant.get("plan_expiry")
    start = tenant.get("plan_start_date")

    def _aware(dt):
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

    expiry = _aware(expiry)
    start = _aware(start)

    fallback_total = CYCLE_DAYS.get(tenant.get("billing_cycle", "monthly"), 30)
    if not expiry:
        return 0, fallback_total

    remaining_secs = (expiry - now).total_seconds()
    remaining = max(0, -(-int(remaining_secs) // 86400))  # ceil to whole days

    total = fallback_total
    if start and expiry > start:
        actual = (expiry - start).days
        if actual > 0:
            total = actual

    return remaining, max(total, 1)


def prorated_seat_amount(plan: dict, tenant: dict, seats: int, now: Optional[datetime] = None) -> Tuple[int, int, int]:
    """Prorated charge for adding `seats` for the REMAINDER of the current cycle.

    charge = full_cycle_price_per_seat ÷ total_cycle_days × remaining_days × seats

    Returns (amount, remaining_days, total_days). amount is 0 when nothing
    remains (caller must reject the upgrade and ask for a renewal first).
    """
    remaining, total = remaining_validity_days(tenant, now)
    if remaining <= 0:
        return 0, remaining, total
    cycle = tenant.get("billing_cycle", "monthly")
    per_seat_full = cycle_price_per_seat(plan, cycle)
    amount = int(round(per_seat_full / total * remaining)) * max(int(seats), 1)
    return max(amount, 0), remaining, total


class PaymentService:
    """
    Payment Processing Service
    
    Handles:
    - Razorpay order creation
    - Payment verification
    - Payment history
    - Refunds
    """
    
    @staticmethod
    async def _get_active_provider_config() -> Tuple[Optional[dict], str]:
        """
        Return the active payment provider's decrypted credentials from DB.
        All payment operations call this first — never reads env vars for credentials.
        """
        master_db = get_master_db()
        config = await PaymentProviderService.get_active_config(master_db)
        if not config:
            return None, (
                "Payments are disabled or not configured. "
                "Contact Super Admin to enable a payment provider."
            )
        return config, ""

    @staticmethod
    def _event_key(provider: str, event: str, entity_id: str) -> str:
        """Build a stable deduplication key for a webhook delivery."""
        return f"{provider}:{event}:{entity_id}"

    @staticmethod
    async def _record_webhook_event(
        event_key: str,
        *,
        provider: str,
        event: str,
        entity_id: str,
        razorpay_order_id: str = "",
        razorpay_payment_id: str = "",
        internal_payment_id: str = "",
        tenant_id: str = "",
        company_id: str = "",
        webhook_amount: int = 0,
        db_amount: int = 0,
    ) -> bool:
        """
        Insert a webhook_events record keyed by event_key (_id).
        Returns False on duplicate key — caller should skip processing.
        """
        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        try:
            await master_db.webhook_events.insert_one({
                "_id": event_key,
                "provider": provider,
                "event": event,
                "entity_id": entity_id,
                "razorpay_order_id": razorpay_order_id,
                "razorpay_payment_id": razorpay_payment_id,
                "internal_payment_id": internal_payment_id,
                "tenant_id": tenant_id,
                "company_id": company_id,
                "webhook_amount": webhook_amount,
                "db_amount": db_amount,
                "amount_matched": (webhook_amount == db_amount) if (webhook_amount and db_amount) else None,
                "status": "processing",
                "result": "",
                "received_at": now,
                "processed_at": None,
            })
            return True  # First time seeing this event
        except DuplicateKeyError:
            return False  # Already seen this event — idempotent skip
        except Exception:
            logger.error(f"Failed to record webhook event {event_key}", exc_info=True)
            raise  # Propagate — webhook handler returns 500 so Razorpay retries

    @staticmethod
    async def _update_webhook_event(event_key: str, *, status: str, result: str) -> None:
        """Update processing status of a stored webhook event."""
        master_db = get_master_db()
        await master_db.webhook_events.update_one(
            {"_id": event_key},
            {"$set": {"status": status, "result": result, "processed_at": datetime.now(timezone.utc)}},
        )

    @staticmethod
    async def create_razorpay_order(
        tenant_id: str,
        plan_id: str,
        billing_cycle: str = "monthly",
        user_count: int = 1,
        payment_type: str = "new_subscription",
        # payment_type options:
        #   new_subscription    — fresh subscription, sets both seats and expiry
        #   renewal             — renew expired sub, sets both seats and expiry
        #   seat_upgrade        — add seats only, PRESERVES current expiry
        #   extend_duration     — extend expiry only, PRESERVES current seats
        #   seat_upgrade_extend — add seats AND extend expiry together
        extend_months: int = 0,  # used for extend_duration and seat_upgrade_extend
        company_id_guard: str = "",  # when set, verified against tenant.company_id (auth check)
    ) -> Tuple[Optional[dict], str]:
        """
        Create a Razorpay order for subscription payment.

        Pricing model: price_per_user × user_count (× 12 for yearly).
        For reseller tenants the reseller discount is applied on the subtotal.
        For extend_duration: price = price_per_user × existing_seats × extend_months.
        For seat_upgrade: prorated to the remaining validity of the current cycle.
        For plan_change_queued: full next-cycle price; activates when current plan ends.
        """
        _VALID_PAYMENT_TYPES = {
            "new_subscription", "renewal", "seat_upgrade",
            "extend_duration", "seat_upgrade_extend", "plan_change_queued",
        }
        if payment_type not in _VALID_PAYMENT_TYPES:
            return None, f"Invalid payment type '{payment_type}'"
        if billing_cycle not in CYCLE_DAYS:
            return None, f"Invalid billing cycle '{billing_cycle}'"

        master_db = get_master_db()

        # Load active payment provider credentials from centralised DB config (Super Admin)
        provider_config, provider_err = await PaymentService._get_active_provider_config()
        if provider_err:
            return None, provider_err

        provider = provider_config.get("provider", "razorpay")
        if provider != "razorpay":
            return None, f"Active payment provider '{provider}' does not support this subscription flow yet."

        key_id = provider_config.get("key_id", "")
        key_secret = provider_config.get("key_secret", "")
        if not key_id or not key_secret:
            return None, (
                "Razorpay Key ID and Key Secret are not configured. "
                "Go to Super Admin → Payment Provider → Razorpay and enter your credentials."
            )

        tenant = await master_db.tenants.find_one({"_id": tenant_id})
        if not tenant:
            return None, "Company not found"

        if company_id_guard and tenant.get("company_id") != company_id_guard:
            logger.warning(
                f"Unauthorized order attempt: company_id_guard={company_id_guard} "
                f"does not match tenant.company_id={tenant.get('company_id')}"
            )
            return None, "You are not authorized to create payment orders for this company"

        plan = await master_db.plans.find_one({"_id": plan_id})
        if not plan:
            return None, "Plan not found"

        # Guard against double-click / retry storms creating duplicate pending orders.
        # If a PENDING order for the same intent was created within the last 15 min, reuse it.
        recent_pending = await master_db.payments.find_one({
            "tenant_id": tenant_id,
            "plan_id": plan_id,
            "payment_type": payment_type,
            "status": PaymentStatus.PENDING,
            "created_at": {"$gte": datetime.now(timezone.utc) - timedelta(minutes=15)},
        })
        if recent_pending:
            logger.info(
                f"Duplicate-order guard: returning existing pending order "
                f"{recent_pending.get('razorpay_order_id')} for tenant {tenant_id}"
            )
            return {
                "success": True,
                "order_id": recent_pending["_id"],
                "razorpay_order_id": recent_pending.get("razorpay_order_id", ""),
                "razorpay_key_id": key_id,
                "amount": recent_pending.get("total_amount", 0),
                "currency": recent_pending.get("currency", "INR"),
                "company_name": recent_pending.get("company_name"),
                "plan_name": recent_pending.get("plan_display_name") or recent_pending.get("plan_name"),
                "plan_display_name": recent_pending.get("plan_display_name"),
                "billing_cycle": recent_pending.get("billing_cycle"),
                "user_count": recent_pending.get("user_count"),
                "price_per_user": recent_pending.get("price_per_user"),
                "reseller_discount_percent": recent_pending.get("reseller_discount_percent", 0),
            }, ""

        price_per_user = plan.get("price_per_user_monthly", plan.get("price_monthly", 0))
        existing_seats = int(tenant.get("max_users", 1))
        # A scheduled seat reduction becomes the licensed base for the NEXT cycle
        scheduled_reduction = tenant.get("scheduled_seat_reduction")
        next_cycle_seats = (
            int(scheduled_reduction) if scheduled_reduction and int(scheduled_reduction) > 0
            else existing_seats
        )

        # Proration metadata (populated only for prorated seat upgrades)
        proration_info: dict = {}

        # ── Amount and days calculation per payment type ───────────────────────
        if payment_type == "extend_duration":
            months = max(int(extend_months), 1)
            # 12-month extension uses yearly (discounted) per-user rate
            pu_ext = (
                plan.get("price_per_user_yearly", plan.get("price_yearly", price_per_user))
                if months >= 12 else price_per_user
            )
            base_amount = pu_ext * existing_seats * months
            days = 30 * months
            user_count = 0  # no seat change
        elif payment_type == "seat_upgrade":
            # Permanent licensed-seat increase, billed ONLY for the remaining
            # validity of the current subscription (never a full cycle again).
            user_count = max(int(user_count), 1)
            base_amount, remaining_days, total_days = prorated_seat_amount(
                plan, tenant, user_count
            )
            if remaining_days <= 0:
                return None, (
                    "Your subscription has expired — renew it first, "
                    "then add seats to the active subscription."
                )
            days = remaining_days
            proration_info = {
                "prorated": True,
                "proration_remaining_days": remaining_days,
                "proration_total_days": total_days,
                "proration_cycle": tenant.get("billing_cycle", "monthly"),
            }
        elif payment_type == "seat_upgrade_extend":
            user_count = max(int(user_count), 1)
            months = max(int(extend_months), 1)
            # 12-month extensions use yearly rate; shorter ones use monthly rate
            pu_ext = (
                plan.get("price_per_user_yearly", plan.get("price_yearly", price_per_user))
                if months >= 12 else price_per_user
            )
            # Charge: new_seats × monthly + existing_seats × rate × months
            base_amount = (price_per_user * user_count) + (pu_ext * existing_seats * months)
            days = 30 * months
        elif payment_type == "plan_change_queued":
            # Full next-cycle purchase that activates when the current plan ends.
            # Seats default to the tenant's licensed count (after any scheduled
            # reduction) unless explicitly overridden with a larger count.
            user_count = max(int(user_count), 0) or next_cycle_seats or 1
            per_seat = cycle_price_per_seat(plan, billing_cycle)
            base_amount = per_seat * user_count
            days = CYCLE_DAYS.get(billing_cycle, 30)
        elif payment_type == "renewal":
            # Same-plan renewal: the licensed seat count is derived SERVER-SIDE —
            # purchased seats persist across renewals until explicitly reduced.
            user_count = next_cycle_seats if next_cycle_seats > 0 else max(int(user_count), 1)
            per_seat = cycle_price_per_seat(plan, billing_cycle)
            base_amount = per_seat * user_count
            days = CYCLE_DAYS.get(billing_cycle, 30)
        else:
            # new_subscription (first purchase or "activate now" plan change).
            # Never silently drop licensed seats on a plan change: seats stay at
            # the current licensed count unless a HIGHER count is requested.
            requested = max(int(user_count), 1)
            user_count = max(requested, next_cycle_seats) if next_cycle_seats > 0 else requested
            per_seat = cycle_price_per_seat(plan, billing_cycle)
            base_amount = per_seat * user_count
            days = CYCLE_DAYS.get(billing_cycle, 30)

        if base_amount == 0:
            return None, "This plan is free and doesn't require payment"

        # Reseller discount
        reseller_discount = 0
        seller_id = tenant.get("seller_id")
        if seller_id:
            reseller_discount = int(plan.get("reseller_discount_percent", 0))

        amount = int(base_amount * (100 - reseller_discount) / 100) if reseller_discount > 0 else base_amount

        # 18% GST
        tax_amount = int(amount * 0.18)
        total_amount = amount + tax_amount

        subscription_end = datetime.now(timezone.utc) + timedelta(days=days)

        payment_id = str(uuid.uuid4())

        # Create a real Razorpay order via the API
        # razorpay SDK is synchronous — run in a thread pool to avoid blocking the event loop
        try:
            import razorpay as _rzp_sdk
            _rzp_client = _rzp_sdk.Client(auth=(key_id, key_secret))
            _rzp_order = await asyncio.to_thread(
                _rzp_client.order.create,
                {
                    "amount": total_amount,
                    "currency": provider_config.get("currency", "INR"),
                    "receipt": f"rcpt_{payment_id[:12]}",
                    "payment_capture": 1,
                }
            )
            razorpay_order_id = _rzp_order["id"]
        except Exception as _rzp_exc:
            logger.exception(
                "Razorpay order creation failed | "
                "exception_type=%s | "
                "payload: amount=%s currency=%s receipt=rcpt_%s payment_capture=1 | "
                "key_id_prefix=%s",
                type(_rzp_exc).__name__,
                total_amount,
                provider_config.get("currency", "INR"),
                payment_id[:12],
                (key_id[:8] + "…") if key_id else "MISSING",
            )
            return None, "Payment gateway error. Please try again or contact support."

        payment_data = {
            "_id": payment_id,
            "transaction_id": f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}{str(uuid.uuid4()).replace('-', '')[:8].upper()}",
            "tenant_id": tenant_id,
            "company_id": tenant.get("company_id"),
            "company_name": tenant.get("company_name"),
            "seller_id": seller_id,
            "seller_name": tenant.get("seller_name"),
            "plan_id": plan_id,
            "plan_name": plan.get("name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "user_count": user_count,
            "price_per_user": price_per_user,
            "base_amount": base_amount,
            "amount": amount,
            "reseller_discount_percent": reseller_discount,
            "currency": "INR",
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "razorpay_order_id": razorpay_order_id,
            "payment_method": PaymentMethod.RAZORPAY,
            "payment_type": payment_type,
            "extend_months": extend_months,
            **proration_info,
            "status": PaymentStatus.PENDING,
            "subscription_start": datetime.now(timezone.utc),
            "subscription_end": subscription_end,
            "invoice_number": f"INV{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }

        await master_db.payments.insert_one(payment_data)

        return {
            "success": True,
            "order_id": payment_id,
            "razorpay_order_id": razorpay_order_id,
            "razorpay_key_id": key_id,
            "amount": total_amount,
            "currency": "INR",
            "company_name": tenant.get("company_name"),
            "plan_name": plan.get("display_name"),
            "plan_display_name": plan.get("display_name"),
            "billing_cycle": billing_cycle,
            "user_count": user_count,
            "price_per_user": price_per_user,
            "reseller_discount_percent": reseller_discount,
        }, ""
    
    @staticmethod
    async def verify_payment(
        razorpay_order_id: str,
        razorpay_payment_id: str,
        razorpay_signature: str
    ) -> Tuple[Optional[dict], str]:
        """
        Verify Razorpay payment signature and activate subscription
        
        Returns:
            Tuple of (verification_result, error_message)
        """
        master_db = get_master_db()
        
        # Find payment by order ID — PENDING only for the normal path
        payment = await master_db.payments.find_one({
            "razorpay_order_id": razorpay_order_id,
            "status": PaymentStatus.PENDING
        })

        if not payment:
            # Webhook may have processed this while the frontend was redirecting back.
            # Return success so the user sees the correct outcome.
            completed = await master_db.payments.find_one({
                "razorpay_order_id": razorpay_order_id,
                "status": PaymentStatus.COMPLETED,
            })
            if completed:
                logger.info(f"verify_payment: already activated by webhook for order {razorpay_order_id}")
                _expiry = completed.get("subscription_end")
                return {
                    "success": True,
                    "message": "Payment verified successfully",
                    "transaction_id": completed.get("transaction_id"),
                    "invoice_number": completed.get("invoice_number"),
                    "plan_activated": True,
                    "plan_expiry": _expiry.isoformat() if _expiry else None,
                }, ""
            return None, "Payment not found or already processed"
        
        # Verify Razorpay payment signature using key_secret from centralised provider config
        prov_cfg, _ = await PaymentService._get_active_provider_config()
        key_secret = (prov_cfg or {}).get("key_secret", "")
        if key_secret:
            expected_sig = hmac.new(
                key_secret.encode("utf-8"),
                f"{razorpay_order_id}|{razorpay_payment_id}".encode("utf-8"),
                hashlib.sha256
            ).hexdigest()
            if not hmac.compare_digest(expected_sig, razorpay_signature):
                logger.warning(f"Payment signature mismatch for order {razorpay_order_id}")
                return None, "Payment verification failed — invalid signature"
        else:
            logger.warning("key_secret not configured in payment provider — signature check skipped")

        return await PaymentService._activate_payment(payment, razorpay_payment_id, razorpay_signature)

    @staticmethod
    async def _activate_payment(
        payment: dict,
        razorpay_payment_id: str,
        razorpay_signature: str = ""
    ) -> Tuple[Optional[dict], str]:
        """Core subscription activation — shared by verify_payment() and webhook handlers."""
        master_db = get_master_db()
        payment_time = datetime.now(timezone.utc)
        billing_cycle = payment.get("billing_cycle", "monthly")
        payment_type  = payment.get("payment_type", "renewal")
        extend_months = int(payment.get("extend_months", 0))

        # ── Fetch current tenant state (needed for seat/expiry preservation) ──
        current_tenant = await master_db.tenants.find_one({"_id": payment["tenant_id"]})
        existing_seats = int((current_tenant or {}).get("max_users", 0))
        current_expiry = (current_tenant or {}).get("plan_expiry")
        if current_expiry and getattr(current_expiry, "tzinfo", None) is None:
            current_expiry = current_expiry.replace(tzinfo=timezone.utc)

        # ── Calculate new expiry and seat totals per payment type ─────────────
        newly_purchased = int(payment.get("user_count", 0))
        scheduled_reduction = (current_tenant or {}).get("scheduled_seat_reduction")
        reduction_target = int(scheduled_reduction) if scheduled_reduction and int(scheduled_reduction) > 0 else 0

        if payment_type == "seat_upgrade":
            # Add seats only — KEEP current expiry unchanged
            new_subscription_end = current_expiry  # preserve
            new_total_seats = existing_seats + newly_purchased

        elif payment_type == "extend_duration":
            # Extend expiry only — KEEP current seat count unchanged
            base = (current_expiry if current_expiry and current_expiry > payment_time else payment_time)
            months = max(extend_months, 1)
            new_subscription_end = base + timedelta(days=30 * months)
            new_total_seats = existing_seats  # preserve

        elif payment_type == "seat_upgrade_extend":
            # Add seats AND extend expiry
            base = (current_expiry if current_expiry and current_expiry > payment_time else payment_time)
            months = max(extend_months, 1)
            new_subscription_end = base + timedelta(days=30 * months)
            new_total_seats = existing_seats + newly_purchased

        elif payment_type == "plan_change_queued":
            # Payment completes now; the plan activates only when the current
            # subscription ends. Tenant plan/seats/expiry stay untouched here.
            planned_start = (current_expiry if current_expiry and current_expiry > payment_time else payment_time)
            new_subscription_end = planned_start + timedelta(days=CYCLE_DAYS.get(billing_cycle, 30))
            new_total_seats = existing_seats  # unchanged until activation

        elif payment_type == "renewal":
            # Same-plan renewal EXTENDS the subscription: remaining validity is
            # never lost when renewing early. Licensed seats persist across
            # renewals; a scheduled seat reduction takes effect on this new cycle.
            base = (current_expiry if current_expiry and current_expiry > payment_time else payment_time)
            new_subscription_end = base + timedelta(days=CYCLE_DAYS.get(billing_cycle, 30))
            if reduction_target:
                new_total_seats = reduction_target
            elif newly_purchased > 0:
                new_total_seats = newly_purchased  # server-derived at order time
            else:
                new_total_seats = max(existing_seats, 1)

        else:
            # new_subscription (first purchase or "activate now" plan change):
            # current plan ends immediately, new plan starts now.
            new_subscription_end = payment_time + timedelta(days=CYCLE_DAYS.get(billing_cycle, 30))
            new_total_seats = max(newly_purchased, 1)

        # ── Atomically transition PENDING → COMPLETED ─────────────────────────
        # The status: PENDING guard in the filter is the race-condition lock.
        # If webhook + verify_payment arrive concurrently, only ONE update wins
        # (modified_count == 1). The loser returns an idempotent success response.
        _update_result = await master_db.payments.update_one(
            {"_id": payment["_id"], "status": PaymentStatus.PENDING},
            {
                "$set": {
                    "razorpay_payment_id": razorpay_payment_id,
                    "razorpay_signature": razorpay_signature,
                    "status": PaymentStatus.COMPLETED,
                    "payment_date": payment_time,
                    "subscription_start": payment_time,
                    "subscription_end": new_subscription_end,
                    "updated_at": payment_time
                }
            }
        )
        if _update_result.modified_count == 0:
            # Another concurrent call (webhook or verify_payment) already activated this payment.
            logger.info(f"Payment {payment['_id']} already activated by concurrent request — skipping")
            _already = await master_db.payments.find_one({"_id": payment["_id"]})
            _expiry = (_already or {}).get("subscription_end")
            return {
                "success": True,
                "message": "Payment verified successfully",
                "transaction_id": (_already or payment).get("transaction_id"),
                "invoice_number": (_already or payment).get("invoice_number"),
                "plan_activated": True,
                "plan_expiry": _expiry.isoformat() if _expiry else None,
                "idempotent": True,
            }, ""

        # ── Secondary operations: tenant activation + commission ──────────────
        # The payment record is already marked COMPLETED above.
        # These secondary writes are wrapped in try/except so a transient failure
        # does NOT roll back the COMPLETED status — the payment was captured by
        # the gateway and is real money. Instead we flag the payment for manual
        # reconciliation and log the error so ops can fix it.
        _secondary_error: str = ""
        try:
            if payment_type == "plan_change_queued":
                # No tenant mutation — create the queued subscription entry only.
                from app.services.subscription_queue_service import SubscriptionQueueService
                planned_start = (
                    current_expiry if current_expiry and current_expiry > payment_time
                    else payment_time
                )
                await SubscriptionQueueService.create_queued_entry(
                    payment=payment,
                    seats=newly_purchased if newly_purchased > 0 else max(existing_seats, 1),
                    activation_date=planned_start,
                    expiry_date=new_subscription_end,
                )
            else:
                # Activate tenant subscription (updates expiry in tenants collection)
                if payment_type != "seat_upgrade":
                    success, error = await tenant_service.activate_tenant(
                        payment["tenant_id"],
                        new_subscription_end
                    )
                    if not success:
                        logger.error(f"activate_tenant failed: {error}")

                # Build and apply tenant update payload
                tenant_update: dict = {
                    "max_users": new_total_seats,
                    "is_trial": False,
                    "status": TenantStatus.ACTIVE,
                    "updated_at": payment_time,
                    "reminder_sent": False,
                }
                tenant_unset: dict = {}

                if payment_type in ("renewal", "new_subscription"):
                    tenant_update["plan_id"] = payment["plan_id"]
                    tenant_update["plan_name"] = payment["plan_name"]
                    tenant_update["plan_display_name"] = payment.get("plan_display_name", payment["plan_name"])
                    tenant_update["billing_cycle"] = billing_cycle
                    tenant_update["plan_start_date"] = payment_time
                    tenant_update["plan_expiry"] = new_subscription_end
                    # A new billing cycle consumes any scheduled seat reduction
                    if reduction_target:
                        tenant_unset["scheduled_seat_reduction"] = ""
                elif payment_type == "extend_duration":
                    tenant_update["plan_expiry"] = new_subscription_end
                elif payment_type == "seat_upgrade_extend":
                    tenant_update["plan_expiry"] = new_subscription_end

                # Permanent seat purchases also raise any scheduled-reduction
                # target and pending queued plans by the same amount, so the
                # newly licensed seats survive the next cycle.
                if payment_type in ("seat_upgrade", "seat_upgrade_extend") and newly_purchased > 0:
                    if reduction_target:
                        tenant_update["scheduled_seat_reduction"] = reduction_target + newly_purchased
                    try:
                        await master_db.subscription_queue.update_many(
                            {"tenant_id": payment["tenant_id"], "status": "queued"},
                            {"$inc": {"seats": newly_purchased},
                             "$set": {"updated_at": payment_time}},
                        )
                    except Exception as _q_exc:
                        logger.warning(f"Queued-plan seat sync failed: {_q_exc}")

                tenant_ops: dict = {"$set": tenant_update}
                if tenant_unset:
                    tenant_ops["$unset"] = tenant_unset
                await master_db.tenants.update_one(
                    {"_id": payment["tenant_id"]},
                    tenant_ops
                )

            # Commission record for reseller tenants
            seller_id = payment.get("seller_id")
            reseller_discount = int(payment.get("reseller_discount_percent", 0))
            if seller_id and reseller_discount > 0:
                base_amount = int(payment.get("base_amount", payment.get("amount", 0)))
                paid_amount = int(payment.get("amount", 0))
                commission_amount = base_amount - paid_amount
                if commission_amount > 0:
                    seller = await master_db.sellers.find_one({"_id": seller_id})
                    await master_db.commissions.insert_one({
                        "_id": str(uuid.uuid4()),
                        "seller_id": seller_id,
                        "seller_name": payment.get("seller_name") or (seller.get("seller_name") if seller else ""),
                        "tenant_id": payment["tenant_id"],
                        "tenant_name": payment.get("company_name", ""),
                        "payment_id": payment["_id"],
                        "plan_id": payment["plan_id"],
                        "plan_name": payment.get("plan_name", ""),
                        "billing_cycle": payment.get("billing_cycle", "monthly"),
                        "base_amount": base_amount,
                        "reseller_amount": paid_amount,
                        "commission_amount": commission_amount,
                        "reseller_discount_percent": reseller_discount,
                        "status": "pending",
                        "created_at": datetime.now(timezone.utc),
                        "updated_at": datetime.now(timezone.utc),
                    })
                    logger.info(f"Commission created: seller={seller_id}, amount={commission_amount}")

            # Send payment confirmation email to tenant owner.
            # Wrapped in its own try/except: SMTP failure must not mark the
            # payment for reconciliation — the subscription is already active.
            try:
                owner = (current_tenant or {}).get("owner", {})
                owner_email = owner.get("email", "")
                if owner_email:
                    from app.services.email_service import send_payment_confirmation_email
                    await send_payment_confirmation_email(
                        to_email=owner_email,
                        admin_name=owner.get("full_name", "Admin"),
                        company_name=payment.get("company_name", ""),
                        plan_name=payment.get("plan_display_name") or payment.get("plan_name", ""),
                        billing_cycle=billing_cycle,
                        amount_paise=int(payment.get("total_amount", 0)),
                        currency=payment.get("currency", "INR"),
                        invoice_number=payment.get("invoice_number", ""),
                        transaction_id=payment.get("transaction_id", ""),
                        expiry_date=new_subscription_end,
                    )
                    logger.info(f"Payment confirmation email sent to {owner_email}")
                else:
                    logger.warning(f"No owner email for tenant {payment.get('tenant_id')} — confirmation email skipped")
            except Exception as _email_exc:
                logger.error(
                    f"Failed to send payment confirmation email for payment {payment['_id']}: {_email_exc}",
                    exc_info=True,
                )

        except Exception as _sec_exc:
            _secondary_error = str(_sec_exc)
            logger.error(
                f"Secondary activation failed for payment {payment['_id']} "
                f"(payment is COMPLETED but tenant/commission may need manual fix): {_sec_exc}",
                exc_info=True,
            )
            # Flag for reconciliation — ops can query {activation_status: "needs_reconciliation"}
            try:
                await master_db.payments.update_one(
                    {"_id": payment["_id"]},
                    {"$set": {
                        "activation_status": "needs_reconciliation",
                        "activation_error": _secondary_error,
                        "updated_at": datetime.now(timezone.utc),
                    }},
                )
            except Exception:
                pass  # best-effort flag

        logger.info(f"Payment activated: {payment['transaction_id']}" + (
            f" (reconciliation needed: {_secondary_error})" if _secondary_error else ""
        ))

        return {
            "success": True,
            "message": "Payment verified successfully",
            "transaction_id": payment["transaction_id"],
            "invoice_number": payment["invoice_number"],
            "plan_activated": True,
            "plan_expiry": new_subscription_end.isoformat() if new_subscription_end else None,
        }, ""

    @staticmethod
    async def handle_webhook_captured(
        razorpay_order_id: str,
        razorpay_payment_id: str,
        amount: int = 0,
        currency: str = "INR",
        event_key: str = "",
        event: str = "payment.captured",
    ) -> Tuple[Optional[dict], str]:
        """
        Process payment.captured / order.paid webhook event.

        Idempotency is two-layered:
          1. webhook_events._id dedup — blocks duplicate Razorpay deliveries at event level
          2. payment.status == COMPLETED check — blocks reprocessing at payment level

        Security: validates webhook amount/currency against our DB record before activating.
        """
        master_db = get_master_db()

        # ── Fetch payment record (single round-trip used for both dedup log and processing) ──
        payment = await master_db.payments.find_one({"razorpay_order_id": razorpay_order_id})

        # ── Layer 1: event-level idempotency ─────────────────────────────────
        if event_key:
            is_new = await PaymentService._record_webhook_event(
                event_key,
                provider="razorpay",
                event=event,
                entity_id=razorpay_payment_id or razorpay_order_id,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
                internal_payment_id=(payment or {}).get("_id", ""),
                tenant_id=(payment or {}).get("tenant_id", ""),
                company_id=(payment or {}).get("company_id", ""),
                webhook_amount=amount,
                db_amount=(payment or {}).get("total_amount", 0),
            )
            if not is_new:
                logger.info(f"Webhook duplicate delivery ignored — event_key={event_key}")
                return {"idempotent": True, "event_key": event_key}, ""
        if not payment:
            msg = f"Payment not found for order: {razorpay_order_id}"
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="ignored", result=msg)
            return None, msg

        # ── Layer 2: payment-level idempotency ────────────────────────────────
        if payment.get("status") == PaymentStatus.COMPLETED:
            msg = "Payment already completed"
            logger.info(f"Webhook idempotent — order={razorpay_order_id} {msg}")
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="duplicate", result=msg)
            return {"idempotent": True, "transaction_id": payment.get("transaction_id")}, ""

        if payment.get("status") != PaymentStatus.PENDING:
            msg = f"Payment in unexpected state: {payment.get('status')}"
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="ignored", result=msg)
            return None, msg

        # ── Security: validate amount and currency against our DB record ───────
        db_amount = int(payment.get("total_amount", 0))
        db_currency = payment.get("currency", "INR").upper()

        if amount and amount != db_amount:
            logger.warning(
                f"Webhook amount mismatch order={razorpay_order_id} "
                f"webhook={amount} db={db_amount}"
            )
        if currency and currency.upper() != db_currency:
            logger.warning(
                f"Webhook currency mismatch order={razorpay_order_id} "
                f"webhook={currency} db={db_currency}"
            )
        # Hard reject if Razorpay captured significantly less than our order (> ₹1 shortfall)
        if amount and db_amount and amount < db_amount - 100:
            msg = (
                f"Security reject: webhook amount {amount} is less than expected {db_amount} "
                f"for order {razorpay_order_id}"
            )
            logger.error(msg)
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="failed", result=msg)
            return None, msg

        logger.info(
            f"Webhook captured: order={razorpay_order_id} payment={razorpay_payment_id} "
            f"amount={amount}/{db_amount} currency={currency}"
        )

        result, error = await PaymentService._activate_payment(payment, razorpay_payment_id)

        if event_key:
            if error:
                await PaymentService._update_webhook_event(event_key, status="failed", result=error)
            else:
                await PaymentService._update_webhook_event(
                    event_key, status="processed", result="Payment activated"
                )

        return result, error

    @staticmethod
    async def handle_webhook_failed(
        razorpay_order_id: str,
        error_code: str = "",
        error_description: str = "",
        event_key: str = "",
        razorpay_payment_id: str = "",
    ) -> Tuple[bool, str]:
        """Process payment.failed webhook event with event-level idempotency and structured logging."""
        master_db = get_master_db()

        # ── Event-level idempotency ────────────────────────────────────────────
        if event_key:
            _pmt_log = await master_db.payments.find_one(
                {"razorpay_order_id": razorpay_order_id},
                {"_id": 1, "tenant_id": 1, "company_id": 1},
            )
            is_new = await PaymentService._record_webhook_event(
                event_key,
                provider="razorpay",
                event="payment.failed",
                entity_id=razorpay_payment_id or razorpay_order_id,
                razorpay_order_id=razorpay_order_id,
                razorpay_payment_id=razorpay_payment_id,
                internal_payment_id=(_pmt_log or {}).get("_id", ""),
                tenant_id=(_pmt_log or {}).get("tenant_id", ""),
                company_id=(_pmt_log or {}).get("company_id", ""),
            )
            if not is_new:
                logger.info(f"Webhook duplicate delivery ignored — event_key={event_key}")
                return True, "Duplicate event — already processed"

        payment = await master_db.payments.find_one({"razorpay_order_id": razorpay_order_id})
        if not payment:
            msg = f"Payment not found for order: {razorpay_order_id}"
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="ignored", result=msg)
            return False, msg

        if payment.get("status") == PaymentStatus.FAILED:
            msg = "Already marked as failed"
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="duplicate", result=msg)
            return True, msg

        if payment.get("status") == PaymentStatus.COMPLETED:
            msg = "Payment already completed — ignoring failure event"
            logger.warning(f"Webhook payment.failed for completed order {razorpay_order_id}")
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="ignored", result=msg)
            return True, msg

        failure_reason = f"{error_code}: {error_description}".strip(": ")
        await master_db.payments.update_one(
            {"_id": payment["_id"]},
            {
                "$set": {
                    "status": PaymentStatus.FAILED,
                    "failure_reason": failure_reason,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        result_msg = f"Marked as failed: {failure_reason}"
        logger.warning(f"Payment marked failed: {payment.get('transaction_id')} — {failure_reason}")
        if event_key:
            await PaymentService._update_webhook_event(event_key, status="processed", result=result_msg)
        return True, "Payment marked as failed"

    @staticmethod
    async def handle_webhook_refund(
        razorpay_payment_id: str,
        refund_id: str,
        amount: int,
        event: str,
        event_key: str = "",
    ) -> Tuple[bool, str]:
        """Process refund.created / refund.processed webhook events with idempotency and logging."""
        master_db = get_master_db()

        # ── Event-level idempotency ────────────────────────────────────────────
        if event_key:
            _pmt_log = await master_db.payments.find_one(
                {"razorpay_payment_id": razorpay_payment_id},
                {"_id": 1, "tenant_id": 1, "company_id": 1},
            )
            is_new = await PaymentService._record_webhook_event(
                event_key,
                provider="razorpay",
                event=event,
                entity_id=refund_id,
                razorpay_payment_id=razorpay_payment_id,
                internal_payment_id=(_pmt_log or {}).get("_id", ""),
                tenant_id=(_pmt_log or {}).get("tenant_id", ""),
                company_id=(_pmt_log or {}).get("company_id", ""),
                webhook_amount=amount,
            )
            if not is_new:
                logger.info(f"Webhook duplicate delivery ignored — event_key={event_key}")
                return True, "Duplicate event — already processed"

        payment = await master_db.payments.find_one({"razorpay_payment_id": razorpay_payment_id})
        if not payment:
            msg = f"Payment not found for razorpay_payment_id: {razorpay_payment_id}"
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="ignored", result=msg)
            return False, msg

        # ── Refund validation ──────────────────────────────────────────────────
        db_total = int(payment.get("total_amount", 0))
        already_refunded = int(payment.get("refund_amount", 0))
        cumulative_refund = already_refunded + amount

        if db_total > 0 and amount > db_total:
            msg = (
                f"Security reject: refund amount {amount} exceeds original payment "
                f"{db_total} for razorpay_payment_id={razorpay_payment_id}"
            )
            logger.error(msg)
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="failed", result=msg)
            return False, msg

        if db_total > 0 and cumulative_refund > db_total:
            msg = (
                f"Security reject: cumulative refund {cumulative_refund} exceeds original "
                f"payment {db_total} for razorpay_payment_id={razorpay_payment_id}"
            )
            logger.error(msg)
            if event_key:
                await PaymentService._update_webhook_event(event_key, status="failed", result=msg)
            return False, msg

        # Full refund if cumulative equals total; otherwise partial
        new_status = (
            PaymentStatus.REFUNDED
            if (db_total == 0 or cumulative_refund >= db_total)
            else PaymentStatus.PARTIALLY_REFUNDED
        )

        await master_db.payments.update_one(
            {"_id": payment["_id"]},
            {
                "$set": {
                    "status": new_status,
                    "refund_id": refund_id,
                    "refund_amount": cumulative_refund,
                    "last_refund_amount": amount,
                    "refund_event": event,
                    "updated_at": datetime.now(timezone.utc),
                }
            },
        )
        result_msg = f"Refund recorded ({new_status}): refund_id={refund_id} amount={amount} cumulative={cumulative_refund}"
        logger.info(f"Refund: payment={payment.get('transaction_id')} refund_id={refund_id} amount={amount} status={new_status}")
        if event_key:
            await PaymentService._update_webhook_event(event_key, status="processed", result=result_msg)
        return True, "Refund recorded"

    # ── Scheduled seat reduction ───────────────────────────────────────────────

    @staticmethod
    async def schedule_seat_reduction(
        tenant_id: str,
        target_seats: int,
        company_id_guard: str = "",
    ) -> Tuple[Optional[dict], str]:
        """Schedule a licensed-seat reduction for the NEXT billing cycle.

        Never touches max_users immediately (active users must not be
        deactivated mid-cycle). The target is applied when the next renewal /
        plan purchase / queued-plan activation starts a new cycle.
        A zero-amount entry is appended to billing history for the audit trail.
        """
        master_db = get_master_db()
        tenant = await master_db.tenants.find_one({"_id": tenant_id, "is_deleted": {"$ne": True}})
        if not tenant:
            return None, "Company not found"
        if company_id_guard and tenant.get("company_id") != company_id_guard:
            return None, "You are not authorized to manage this company's subscription"

        current_seats = int(tenant.get("max_users", 1))
        target_seats = int(target_seats)
        if target_seats < 1:
            return None, "Seat count must be at least 1"
        if target_seats >= current_seats:
            return None, (
                f"Target ({target_seats}) must be lower than the current licensed "
                f"seats ({current_seats}). To add seats, purchase a seat upgrade."
            )

        now = datetime.now(timezone.utc)
        await master_db.tenants.update_one(
            {"_id": tenant_id},
            {"$set": {"scheduled_seat_reduction": target_seats, "updated_at": now}},
        )

        # Immutable billing-history entry (zero amount — no charge for reductions)
        history_id = str(uuid.uuid4())
        await master_db.payments.insert_one({
            "_id": history_id,
            "transaction_id": f"TXN{now.strftime('%Y%m%d%H%M%S')}{str(uuid.uuid4()).replace('-', '')[:8].upper()}",
            "tenant_id": tenant_id,
            "company_id": tenant.get("company_id"),
            "company_name": tenant.get("company_name"),
            "plan_id": tenant.get("plan_id"),
            "plan_name": tenant.get("plan_name"),
            "plan_display_name": tenant.get("plan_display_name") or tenant.get("plan_name"),
            "billing_cycle": tenant.get("billing_cycle", "monthly"),
            "user_count": target_seats,
            "seats_before": current_seats,
            "seats_after_next_renewal": target_seats,
            "price_per_user": 0,
            "base_amount": 0,
            "amount": 0,
            "tax_amount": 0,
            "total_amount": 0,
            "currency": "INR",
            "payment_method": "system",
            "payment_type": "seat_reduction",
            "status": PaymentStatus.COMPLETED,
            "payment_date": now,
            "invoice_number": f"INV{now.strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}",
            "created_at": now,
            "updated_at": now,
        })

        return {
            "success": True,
            "current_seats": current_seats,
            "seats_after_next_renewal": target_seats,
            "effective": "next_renewal",
            "history_id": history_id,
        }, ""

    @staticmethod
    async def cancel_seat_reduction(tenant_id: str, company_id_guard: str = "") -> Tuple[bool, str]:
        """Remove a pending scheduled seat reduction (before it takes effect)."""
        master_db = get_master_db()
        tenant = await master_db.tenants.find_one({"_id": tenant_id, "is_deleted": {"$ne": True}})
        if not tenant:
            return False, "Company not found"
        if company_id_guard and tenant.get("company_id") != company_id_guard:
            return False, "You are not authorized to manage this company's subscription"
        if not tenant.get("scheduled_seat_reduction"):
            return False, "No scheduled seat reduction to cancel"
        await master_db.tenants.update_one(
            {"_id": tenant_id},
            {"$unset": {"scheduled_seat_reduction": ""},
             "$set": {"updated_at": datetime.now(timezone.utc)}},
        )
        return True, ""

    @staticmethod
    async def get_payment_history(
        tenant_id: str = None,
        company_id: str = None,
        status: str = None,
        page: int = 1,
        limit: int = 20
    ) -> Tuple[List[dict], int]:
        """
        Get payment history
        
        Returns:
            Tuple of (payments_list, total_count)
        """
        master_db = get_master_db()
        
        query = {}
        
        if tenant_id:
            query["tenant_id"] = tenant_id
        
        if company_id:
            query["company_id"] = company_id
        
        if status:
            query["status"] = status
        
        total = await master_db.payments.count_documents(query)
        
        skip = (page - 1) * limit
        payments = await master_db.payments.find(query).sort(
            "created_at", -1
        ).skip(skip).limit(limit).to_list(limit)
        
        return payments, total
    
    @staticmethod
    async def get_revenue_stats() -> dict:
        """Get revenue statistics for SuperAdmin dashboard"""
        master_db = get_master_db()

        now = datetime.now(timezone.utc)
        month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)

        # All four queries are independent — run them concurrently.
        # success_rate denominator uses COMPLETED+FAILED (attempted) not all records.
        totals_pipeline = [
            {"$match": {"status": PaymentStatus.COMPLETED}},
            {"$group": {"_id": None, "total_revenue": {"$sum": "$total_amount"}, "transaction_count": {"$sum": 1}}}
        ]
        monthly_pipeline = [
            {"$match": {"status": PaymentStatus.COMPLETED, "payment_date": {"$gte": month_start}}},
            {"$group": {"_id": None, "amount": {"$sum": "$total_amount"}}}
        ]
        pending_pipeline = [
            {"$match": {"status": PaymentStatus.PENDING}},
            {"$group": {"_id": None, "amount": {"$sum": "$total_amount"}}}
        ]

        totals_coro   = master_db.payments.aggregate(totals_pipeline).to_list(1)
        monthly_coro  = master_db.payments.aggregate(monthly_pipeline).to_list(1)
        pending_coro  = master_db.payments.aggregate(pending_pipeline).to_list(1)
        attempted_coro = master_db.payments.count_documents(
            {"status": {"$in": [PaymentStatus.COMPLETED, PaymentStatus.FAILED]}}
        )

        totals_result, monthly_result, pending_result, attempted_count = await asyncio.gather(
            totals_coro, monthly_coro, pending_coro, attempted_coro
        )

        total_revenue    = totals_result[0]["total_revenue"]    if totals_result else 0
        transaction_count = totals_result[0]["transaction_count"] if totals_result else 0
        monthly_revenue  = monthly_result[0]["amount"]           if monthly_result else 0
        pending_amount   = pending_result[0]["amount"]           if pending_result else 0
        success_rate     = (transaction_count / attempted_count * 100) if attempted_count > 0 else 0

        return {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
            "pending_amount": pending_amount,
            "transaction_count": transaction_count,
            "success_rate": round(success_rate, 2)
        }
    
    @staticmethod
    async def get_payment_by_id(payment_id: str) -> Optional[dict]:
        """Get payment by ID"""
        master_db = get_master_db()
        return await master_db.payments.find_one({"_id": payment_id})


# Singleton instance
payment_service = PaymentService()