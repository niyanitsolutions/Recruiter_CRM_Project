"""
Payment Model (master_db)
Tracks all payment transactions
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field
import uuid


class PaymentStatus(str, Enum):
    """Payment status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    REFUNDED = "refunded"
    CANCELLED = "cancelled"


class PaymentMethod(str, Enum):
    """Payment methods"""
    RAZORPAY = "razorpay"
    BANK_TRANSFER = "bank_transfer"
    CHEQUE = "cheque"
    CASH = "cash"


class PaymentType(str, Enum):
    """Type of payment"""
    NEW_SUBSCRIPTION = "new_subscription"
    RENEWAL = "renewal"
    UPGRADE = "upgrade"
    DOWNGRADE = "downgrade"


class PaymentModel(BaseModel):
    """
    Payment Transaction Model
    
    Stored in: master_db.payments
    
    Tracks:
    - All payment transactions
    - Razorpay order & payment IDs
    - Invoice details
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    
    # Transaction Reference
    transaction_id: str = Field(default_factory=lambda: f"TXN{datetime.now().strftime('%Y%m%d%H%M%S')}{str(uuid.uuid4())[:4].upper()}")
    
    # Tenant Reference
    tenant_id: str = Field(...)
    company_id: str = Field(...)
    company_name: str = Field(...)

    # Seller Reference (optional — null for direct tenants)
    seller_id: Optional[str] = None

    # Seller Commission (populated when a seller is involved)
    seller_margin: Optional[float] = None          # percentage, e.g. 20.0
    seller_commission: Optional[int] = None        # in paise
    company_revenue: Optional[int] = None          # total_amount - seller_commission (in paise)
    payment_status_note: Optional[str] = None      # e.g. "manual_by_admin"
    created_by_admin: bool = False                 # True when Super Admin recorded payment

    # Plan Details
    plan_id: str = Field(...)
    plan_name: str = Field(...)
    billing_cycle: str = Field(...)  # monthly, quarterly, yearly
    
    # Amount (in paise)
    amount: int = Field(...)
    currency: str = Field(default="INR")
    tax_amount: int = Field(default=0)  # GST
    total_amount: int = Field(...)
    
    # Payment Gateway Details (Razorpay)
    razorpay_order_id: Optional[str] = None
    razorpay_payment_id: Optional[str] = None
    razorpay_signature: Optional[str] = None
    
    # Payment Info
    payment_method: PaymentMethod = Field(default=PaymentMethod.RAZORPAY)
    payment_type: PaymentType = Field(default=PaymentType.NEW_SUBSCRIPTION)
    status: PaymentStatus = Field(default=PaymentStatus.PENDING)
    
    # Dates
    payment_date: Optional[datetime] = None
    subscription_start: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    subscription_end: datetime
    
    # Invoice
    invoice_number: str = Field(default_factory=lambda: f"INV{datetime.now().strftime('%Y%m%d')}{str(uuid.uuid4())[:6].upper()}")
    invoice_url: Optional[str] = None
    
    # Metadata
    notes: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    
    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(default="system")
    
    model_config = ConfigDict(populate_by_name=True)
    
    def to_dict(self) -> dict:
        """Convert model to dictionary for MongoDB insertion"""
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data


class PaymentCreate(BaseModel):
    """Schema for creating a payment"""
    tenant_id: str
    company_id: str
    company_name: str
    plan_id: str
    plan_name: str
    billing_cycle: str
    amount: int
    tax_amount: int = 0
    total_amount: int
    subscription_end: datetime


class PaymentVerify(BaseModel):
    """Schema for verifying Razorpay payment"""
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


class PaymentResponse(BaseModel):
    """Schema for payment API responses"""
    id: str
    transaction_id: str
    company_name: str
    plan_name: str
    amount: int
    total_amount: int
    status: str
    payment_date: Optional[datetime]
    invoice_number: str
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class RevenueStats(BaseModel):
    """Revenue statistics for SuperAdmin dashboard"""
    total_revenue: int
    monthly_revenue: int
    quarterly_revenue: int
    yearly_revenue: int
    pending_amount: int
    refunded_amount: int
    transaction_count: int
    success_rate: float