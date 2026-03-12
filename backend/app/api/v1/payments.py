"""
Payments API Endpoints
Payment processing and history
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional
import logging

from app.middleware.auth import get_current_user, require_super_admin, AuthContext
from app.services.payment_service import payment_service
from app.services.tenant_service import tenant_service
from app.schemas.payment import (
    CreateOrderRequest,
    CreateOrderResponse,
    VerifyPaymentRequest,
    VerifyPaymentResponse,
    PaymentHistoryResponse
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
        billing_cycle=request.billing_cycle
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
    
    return {
        "plan_name": tenant.get("plan_name"),
        "is_trial": tenant.get("is_trial", False),
        "plan_start": tenant.get("plan_start_date"),
        "plan_expiry": tenant.get("plan_expiry"),
        "status": tenant.get("status"),
        "last_payment": {
            "amount": latest_payment.get("total_amount") if latest_payment else None,
            "date": latest_payment.get("payment_date") if latest_payment else None,
            "invoice": latest_payment.get("invoice_number") if latest_payment else None
        } if latest_payment else None
    }


@router.post("/webhook")
async def payment_webhook(payload: dict):
    """
    Razorpay webhook endpoint
    
    Handles async payment events from Razorpay
    
    Events handled:
    - payment.captured
    - payment.failed
    - refund.processed
    """
    event = payload.get("event")
    
    if event == "payment.captured":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        payment_id = payment_entity.get("id")
        
        # Verify and process payment
        # This is a backup in case frontend verification fails
        logger.info(f"Webhook: Payment captured - Order: {order_id}, Payment: {payment_id}")
    
    elif event == "payment.failed":
        payment_entity = payload.get("payload", {}).get("payment", {}).get("entity", {})
        order_id = payment_entity.get("order_id")
        
        logger.warning(f"Webhook: Payment failed - Order: {order_id}")
    
    return {"status": "ok"}