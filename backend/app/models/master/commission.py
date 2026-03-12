"""
Commission Model (master_db)
Tracks reseller/seller commissions from tenant subscription payments.
"""

from datetime import datetime, timezone
from typing import Optional
from enum import Enum
from pydantic import BaseModel, Field
import uuid


class CommissionStatus(str, Enum):
    PENDING = "pending"
    PAID = "paid"


class CommissionModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    seller_id: str
    seller_name: str
    tenant_id: str
    tenant_name: str
    payment_id: str
    plan_id: str
    plan_name: str
    billing_cycle: str
    # Amounts in paise (INR × 100)
    base_amount: int          # Full plan price before reseller discount
    reseller_amount: int      # Discounted amount actually paid
    commission_amount: int    # base_amount - reseller_amount (seller's margin)
    reseller_discount_percent: int
    status: CommissionStatus = CommissionStatus.PENDING
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
