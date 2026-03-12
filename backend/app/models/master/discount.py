"""
Discount / Promo Code model for SaaS platform.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class DiscountType(str, Enum):
    PERCENTAGE = "percentage"
    FLAT = "flat"


class DiscountStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"


class DiscountCreate(BaseModel):
    name: str
    code: str                           # Uppercase, unique promo code
    type: DiscountType
    value: float                        # Percentage (0-100) or flat amount in smallest unit
    applicable_plans: List[str] = []    # Plan IDs; empty list = all plans
    usage_limit: Optional[int] = None   # None = unlimited
    valid_from: datetime
    valid_until: datetime


class DiscountUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    type: Optional[DiscountType] = None
    value: Optional[float] = None
    applicable_plans: Optional[List[str]] = None
    usage_limit: Optional[int] = None
    valid_from: Optional[datetime] = None
    valid_until: Optional[datetime] = None
    status: Optional[DiscountStatus] = None
