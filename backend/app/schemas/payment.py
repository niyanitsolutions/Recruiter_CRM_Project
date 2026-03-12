"""
Payment Schemas
Razorpay integration schemas
"""

from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field


class CreateOrderRequest(BaseModel):
    """Request to create Razorpay order"""
    tenant_id: str
    plan_id: str
    billing_cycle: str = "monthly"


class CreateOrderResponse(BaseModel):
    """Razorpay order creation response"""
    success: bool
    order_id: str
    razorpay_order_id: str
    razorpay_key_id: str
    amount: int  # In paise
    currency: str = "INR"
    company_name: str
    plan_name: str
    billing_cycle: str


class VerifyPaymentRequest(BaseModel):
    """Verify Razorpay payment"""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class VerifyPaymentResponse(BaseModel):
    """Payment verification response"""
    success: bool
    message: str
    transaction_id: Optional[str] = None
    invoice_number: Optional[str] = None
    
    # If successful, include activation details
    plan_activated: bool = False
    plan_expiry: Optional[datetime] = None


class PaymentHistoryItem(BaseModel):
    """Single payment in history"""
    id: str
    transaction_id: str
    plan_name: str
    billing_cycle: str
    amount: int
    total_amount: int
    status: str
    payment_date: Optional[datetime]
    invoice_number: str
    created_at: datetime


class PaymentHistoryResponse(BaseModel):
    """Payment history response"""
    payments: list[PaymentHistoryItem]
    total_count: int
    page: int
    limit: int


class InvoiceResponse(BaseModel):
    """Invoice details response"""
    invoice_number: str
    transaction_id: str
    company_name: str
    company_address: str
    gst_number: Optional[str]
    plan_name: str
    billing_cycle: str
    amount: int
    tax_amount: int
    total_amount: int
    payment_date: datetime
    payment_method: str
    status: str


class RefundRequest(BaseModel):
    """Request payment refund"""
    payment_id: str
    reason: str
    amount: Optional[int] = None  # Partial refund amount, None for full


class RefundResponse(BaseModel):
    """Refund response"""
    success: bool
    message: str
    refund_id: Optional[str] = None
    refund_amount: Optional[int] = None