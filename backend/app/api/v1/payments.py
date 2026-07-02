"""
Payments API Endpoints
Payment processing and history
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, Request, status, Depends, Query
from pydantic import BaseModel
import hashlib
import hmac
import json
import logging
import time

from app.core.config import settings
from app.core.database import get_master_db
from app.middleware.auth import get_current_user, AuthContext
from app.services.payment_provider_service import PaymentProviderService
from app.services.payment_service import PaymentService, payment_service
from app.services.tenant_service import tenant_service
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/create-order", response_model=CreateOrderResponse)
async def create_payment_order(
    request: CreateOrderRequest,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Create a Razorpay order for subscription payment
    
    Returns order details for frontend to initiate payment
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin cannot create payment orders"
        )
    
    result, error = await payment_service.create_razorpay_order(
        tenant_id=request.tenant_id,
        plan_id=request.plan_id,
        billing_cycle=request.billing_cycle,
        company_id_guard=auth.company_id,  # validates tenant_id belongs to this company
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return result


@router.post("/verify", response_model=VerifyPaymentResponse)
async def verify_payment(request: VerifyPaymentRequest):
    """
    Verify Razorpay payment after completion
    
    This endpoint is called by frontend after user completes payment on Razorpay
    
    Steps:
    1. Verify payment signature
    2. Update payment status
    3. Activate subscription
    """
    result, error = await payment_service.verify_payment(
        razorpay_order_id=request.razorpay_order_id,
        razorpay_payment_id=request.razorpay_payment_id,
        razorpay_signature=request.razorpay_signature
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return result


@router.get("/history")
async def get_payment_history(
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    auth: AuthContext = Depends(get_current_user)
):
    """
    Get payment history for current tenant
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Use /super-admin/payments for SuperAdmin"
        )
    
    payments, total = await payment_service.get_payment_history(
        company_id=auth.company_id,
        page=page,
        limit=limit
    )
    
    return {
        "payments": [
            {
                "id": p["_id"],
                "transaction_id": p.get("transaction_id"),
                "plan_name": p.get("plan_name"),
                "billing_cycle": p.get("billing_cycle"),
                "amount": p.get("amount"),
                "total_amount": p.get("total_amount"),
                "status": p.get("status"),
                "payment_date": p.get("payment_date"),
                "invoice_number": p.get("invoice_number"),
                "created_at": p.get("created_at")
            }
            for p in payments
        ],
        "total": total,
        "page": page,
        "limit": limit
    }


@router.get("/invoice/{payment_id}")
async def get_invoice(
    payment_id: str,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Get invoice details for a payment
    """
    payment = await payment_service.get_payment_by_id(payment_id)
    
    if not payment:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Payment not found"
        )
    
    # Verify access
    if not auth.is_super_admin and payment.get("company_id") != auth.company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    # Get tenant details for invoice
    tenant = await tenant_service.get_tenant(company_id=payment.get("company_id"))
    
    address = tenant.get("address", {}) if tenant else {}
    address_str = f"{address.get('street', '')}, {address.get('city', '')}, {address.get('state', '')} - {address.get('zip_code', '')}"
    
    return {
        "invoice_number": payment.get("invoice_number"),
        "transaction_id": payment.get("transaction_id"),
        "company_name": payment.get("company_name"),
        "company_address": address_str,
        "gst_number": tenant.get("gst_number") if tenant else None,
        "plan_name": payment.get("plan_name"),
        "billing_cycle": payment.get("billing_cycle"),
        "amount": payment.get("amount"),
        "tax_amount": payment.get("tax_amount"),
        "total_amount": payment.get("total_amount"),
        "payment_date": payment.get("payment_date"),
        "payment_method": payment.get("payment_method"),
        "status": payment.get("status"),
        "subscription_start": payment.get("subscription_start"),
        "subscription_end": payment.get("subscription_end")
    }


@router.get("/current-subscription")
async def get_current_subscription(auth: AuthContext = Depends(get_current_user)):
    """
    Get current subscription details
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin does not have a subscription"
        )
    
    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Get latest payment
    payments, _ = await payment_service.get_payment_history(
        company_id=auth.company_id,
        status="completed",
        page=1,
        limit=1
    )
    
    latest_payment = payments[0] if payments else None
    
    # Queued ("activate after expiry") subscriptions, if any
    from app.services.subscription_queue_service import SubscriptionQueueService
    queued_entries = await SubscriptionQueueService.list_for_tenant(tenant["_id"])

    return {
        "plan_name": tenant.get("plan_name"),
        "is_trial": tenant.get("is_trial", False),
        "plan_start": tenant.get("plan_start_date"),
        "plan_expiry": tenant.get("plan_expiry"),
        "status": tenant.get("status"),
        "billing_cycle": tenant.get("billing_cycle", "monthly"),
        "licensed_seats": tenant.get("max_users"),
        "scheduled_seat_reduction": tenant.get("scheduled_seat_reduction"),
        "queued_subscriptions": [
            {
                "id": q["_id"],
                "plan_name": q.get("plan_display_name") or q.get("plan_name"),
                "billing_cycle": q.get("billing_cycle"),
                "seats": q.get("seats"),
                "purchase_date": q.get("purchase_date"),
                "activation_date": q.get("activation_date"),
                "status": q.get("status"),
            }
            for q in queued_entries
        ],
        "last_payment": {
            "amount": latest_payment.get("total_amount") if latest_payment else None,
            "date": latest_payment.get("payment_date") if latest_payment else None,
            "invoice": latest_payment.get("invoice_number") if latest_payment else None
        } if latest_payment else None
    }


# ── Seat reduction (effective NEXT billing cycle) ──────────────────────────────

class SeatReductionRequest(BaseModel):
    target_seats: int


@router.post("/subscription/reduce-seats")
async def schedule_seat_reduction(
    body: SeatReductionRequest,
    auth: AuthContext = Depends(get_current_user),
):
    """Schedule a licensed-seat reduction for the next billing cycle.
    Never reduces immediately — active users are never deactivated mid-cycle."""
    if auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SuperAdmin has no subscription")
    if not (auth.is_owner or auth.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner or an admin can change seats")

    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    result, error = await payment_service.schedule_seat_reduction(
        tenant_id=tenant["_id"],
        target_seats=body.target_seats,
        company_id_guard=auth.company_id,
    )
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return result


@router.delete("/subscription/reduce-seats")
async def cancel_seat_reduction(auth: AuthContext = Depends(get_current_user)):
    """Cancel a pending scheduled seat reduction before it takes effect."""
    if auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SuperAdmin has no subscription")
    if not (auth.is_owner or auth.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner or an admin can change seats")

    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    ok, error = await payment_service.cancel_seat_reduction(
        tenant_id=tenant["_id"], company_id_guard=auth.company_id
    )
    if not ok:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return {"success": True}


@router.post("/subscription/queue/{entry_id}/cancel")
async def cancel_queued_subscription(
    entry_id: str,
    auth: AuthContext = Depends(get_current_user),
):
    """Cancel a queued (not yet active) subscription. queued → cancelled only —
    active/expired entries are immutable history."""
    if auth.is_super_admin:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="SuperAdmin has no subscription")
    if not (auth.is_owner or auth.role == "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only the owner or an admin can manage the plan queue")

    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    from app.services.subscription_queue_service import SubscriptionQueueService
    ok = await SubscriptionQueueService.cancel_queued(entry_id, tenant["_id"])
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Queued subscription not found or already active/cancelled",
        )
    return {"success": True}


async def _run_post_payment_hooks(event_key: str, order_id: str, payment_id: str) -> None:
    """
    Background task for slow post-payment work executed after the 200 is already sent.
    Wire in email receipts, PDF invoice generation, and CRM notifications here.
    """
    logger.debug(f"Post-payment hook: event_key={event_key} order={order_id} payment={payment_id}")
    # Future examples:
    #   await send_payment_confirmation_email(payment_id=payment_id)
    #   await generate_invoice_pdf(order_id=order_id)
    #   await sync_payment_to_accounting(payment_id=payment_id)


@router.post("/webhook")
async def payment_webhook(request: Request, background_tasks: BackgroundTasks):
    """
    Razorpay webhook endpoint — handles async payment events.

    Security: HMAC-SHA256 signature verified against RAZORPAY_WEBHOOK_SECRET
    before any payload is processed. Raw body is read so the signature check
    is performed over the exact bytes Razorpay signed.

    Events handled:
    - payment.captured / order.paid / payment.authorized
    - payment.failed
    - refund.created / refund.processed
    """
    raw_body = await request.body()

    razorpay_signature = request.headers.get("X-Razorpay-Signature", "")
    if not razorpay_signature:
        logger.warning("Webhook received without X-Razorpay-Signature header")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-Razorpay-Signature header"
        )

    # Look up Razorpay's own config for the webhook secret — intentionally provider-specific,
    # NOT active-provider lookup. This keeps verification working even if the admin later
    # switches to Stripe/Cashfree while historical Razorpay orders are still being settled.
    _master_db = get_master_db()
    _rzp_cfg = await PaymentProviderService.get_provider_config("razorpay", _master_db)
    webhook_secret = (_rzp_cfg or {}).get("webhook_secret", "")
    if not webhook_secret:
        webhook_secret = settings.RAZORPAY_WEBHOOK_SECRET
    if not webhook_secret:
        logger.error("Razorpay webhook secret not configured — set it in Super Admin → Payment Provider")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=(
                "Webhook secret not configured. "
                "Set it in Super Admin → Payment Provider → Razorpay → Webhook Secret."
            ),
        )

    expected_signature = hmac.new(
        webhook_secret.encode("utf-8"),
        raw_body,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(expected_signature, razorpay_signature):
        logger.warning("Webhook: invalid signature — request rejected")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid webhook signature"
        )

    try:
        payload = json.loads(raw_body)
    except json.JSONDecodeError:
        logger.error("Webhook: received non-JSON body after passing signature check")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid JSON payload"
        )

    # Replay protection: Razorpay includes created_at (Unix timestamp) in every payload.
    # Reject events older than 24 hours to block replayed or delayed webhooks.
    _webhook_ts = payload.get("created_at", 0)
    if _webhook_ts and (time.time() - _webhook_ts) > 86400:
        logger.warning(
            f"Webhook replay rejected: event is "
            f"{int((time.time() - _webhook_ts) / 3600)}h old — ignoring"
        )
        return {"status": "ok"}

    event = payload.get("event", "")
    logger.info(f"Razorpay webhook received: event={event}")

    # Warn if Razorpay is no longer the active provider; still process the event
    # because it relates to a payment created while Razorpay was active.
    _active_cfg = await PaymentProviderService.get_active_config(_master_db)
    _active_provider = (_active_cfg or {}).get("provider", "")
    if _active_provider and _active_provider != "razorpay":
        logger.warning(
            f"Razorpay webhook received while active provider is '{_active_provider}'. "
            "Processing event for historical Razorpay orders — disable the Razorpay webhook "
            "in the Razorpay dashboard once all outstanding orders are settled."
        )

    if event == "payment.authorized":
        # Authorization ≠ capture — money is reserved but not yet collected.
        # With auto-capture (payment_capture: 1), payment.captured fires within seconds
        # and activates the subscription. Activating here would cause double-activation.
        _auth_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        logger.info(
            f"Webhook payment.authorized for order={_auth_entity.get('order_id', '')} "
            f"— awaiting payment.captured before activating"
        )

    elif event in ("payment.captured", "order.paid"):
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id", "")
        razorpay_payment_id = payment_entity.get("id", "")
        amount = int(payment_entity.get("amount", 0))
        currency = payment_entity.get("currency", "INR")

        if not order_id:
            logger.error(f"Webhook {event}: missing order_id in payload")
            return {"status": "ok"}

        event_key = PaymentService._event_key("rzp", event, razorpay_payment_id or order_id)
        result, error = await payment_service.handle_webhook_captured(
            razorpay_order_id=order_id,
            razorpay_payment_id=razorpay_payment_id,
            amount=amount,
            currency=currency,
            event_key=event_key,
            event=event,
        )
        if error:
            logger.error(f"Webhook {event} error: {error}")
        else:
            logger.info(f"Webhook {event} processed: {result}")
            # Schedule slow post-payment work outside the request cycle.
            # Add email receipts, PDF invoice generation, CRM sync, etc. here.
            if not (result or {}).get("idempotent"):
                background_tasks.add_task(
                    _run_post_payment_hooks, event_key, order_id, razorpay_payment_id
                )

    elif event == "payment.failed":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id", "")
        razorpay_payment_id = payment_entity.get("id", "")
        error_code = payment_entity.get("error_code", "")
        error_description = payment_entity.get("error_description", "")

        if not order_id:
            logger.error("Webhook payment.failed: missing order_id in payload")
            return {"status": "ok"}

        event_key = PaymentService._event_key("rzp", "payment.failed", razorpay_payment_id or order_id)
        success, msg = await payment_service.handle_webhook_failed(
            razorpay_order_id=order_id,
            error_code=error_code,
            error_description=error_description,
            event_key=event_key,
            razorpay_payment_id=razorpay_payment_id,
        )
        if not success:
            logger.error(f"Webhook payment.failed error: {msg}")

    elif event in ("refund.created", "refund.processed"):
        refund_entity = payload.get("payload", {}).get("refund", {}).get("entity", {})
        razorpay_payment_id = refund_entity.get("payment_id", "")
        refund_id = refund_entity.get("id", "")
        amount = int(refund_entity.get("amount", 0))

        if not razorpay_payment_id:
            logger.error(f"Webhook {event}: missing payment_id in payload")
            return {"status": "ok"}

        event_key = PaymentService._event_key("rzp", event, refund_id or razorpay_payment_id)
        success, msg = await payment_service.handle_webhook_refund(
            razorpay_payment_id=razorpay_payment_id,
            refund_id=refund_id,
            amount=amount,
            event=event,
            event_key=event_key,
        )
        if not success:
            logger.error(f"Webhook {event} error: {msg}")

    else:
        logger.info(f"Webhook: unhandled event '{event}' — ignoring")

    return {"status": "ok"}


# ── Gateway-isolated webhook endpoints ────────────────────────────────────────
# Each gateway has its own route with its own signature verification and handler.
# This ensures Stripe webhooks never reach Razorpay logic and vice-versa.
# Configure the URL in each gateway's dashboard:
#   Razorpay  → /api/v1/payments/webhook          (above)
#   Stripe    → /api/v1/payments/webhook/stripe    (below)
#   Cashfree  → /api/v1/payments/webhook/cashfree  (below)

@router.post("/webhook/stripe")
async def stripe_webhook(request: Request):
    """
    Stripe webhook placeholder.
    Signature verification uses Stripe-Signature header + Stripe webhook secret.
    Implement when Stripe is enabled as a payment provider.
    """
    _sig = request.headers.get("Stripe-Signature", "")
    if not _sig:
        logger.warning("Stripe webhook received without Stripe-Signature — ignoring")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing Stripe-Signature header",
        )
    logger.info("Stripe webhook received — Stripe processing is not yet implemented")
    return {"status": "ok"}


@router.post("/webhook/cashfree")
async def cashfree_webhook(request: Request):
    """
    Cashfree webhook placeholder.
    Signature verification uses x-webhook-signature header + Cashfree client secret.
    Implement when Cashfree is enabled as a payment provider.
    """
    _sig = request.headers.get("x-webhook-signature", "")
    if not _sig:
        logger.warning("Cashfree webhook received without x-webhook-signature — ignoring")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing x-webhook-signature header",
        )
    logger.info("Cashfree webhook received — Cashfree processing is not yet implemented")
    return {"status": "ok"}


@router.post("/webhook/phonepe")
async def phonepe_webhook(request: Request):
    """
    PhonePe webhook placeholder.
    Signature uses X-VERIFY header + sha256(payload + salt_key).
    Implement when PhonePe is enabled as a payment provider.
    """
    _sig = request.headers.get("X-VERIFY", "")
    if not _sig:
        logger.warning("PhonePe webhook received without X-VERIFY — ignoring")
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing X-VERIFY header",
        )
    logger.info("PhonePe webhook received — PhonePe processing is not yet implemented")
    return {"status": "ok"}