"""
Seller / Reseller Model (master_db)
Represents a reseller who manages a set of tenant companies.
"""

from datetime import datetime, timedelta, timezone
from typing import Optional
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field
import uuid


class SellerStatus(str, Enum):
    ACTIVE = "active"
    SUSPENDED = "suspended"


def _default_expiry() -> datetime:
    return datetime.now(timezone.utc) + timedelta(days=30)


class SellerModel(BaseModel):
    """
    Seller document.

    Stored in: master_db.sellers
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")

    seller_name: str = Field(..., min_length=2, max_length=100)
    company_name: str = Field(..., min_length=2, max_length=200)
    email: str
    phone: str
    address: Optional[str] = None

    status: SellerStatus = Field(default=SellerStatus.ACTIVE)

    # Auth
    username: str = Field(..., min_length=3, max_length=50)
    password_hash: str

    # ── Subscription / Plan ───────────────────────────────────────────────────
    # plan_expiry_date is calculated ONCE at purchase:
    #   plan_expiry_date = plan_start_date + plan_duration
    # It is stored permanently and NEVER recalculated dynamically.
    plan_name: str = Field(default="trial")
    plan_display_name: str = Field(default="Trial")
    plan_start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_expiry_date: datetime = Field(default_factory=_default_expiry)
    is_trial: bool = Field(default=True)
    billing_cycle: Optional[str] = None   # monthly | yearly

    # ── Commission Margin ─────────────────────────────────────────────────────
    # Per-seller commission margin percentage.
    # When set, overrides the global DEFAULT_SELLER_MARGIN.
    # Commission = plan_price × margin_percentage / 100
    margin_percentage: Optional[float] = Field(default=None, ge=0, le=100)

    # ── Email Verification ────────────────────────────────────────────────────
    email_verified: bool = Field(default=True)   # Admin-created sellers start verified
    email_verification_token: Optional[str] = None
    email_verification_expiry: Optional[datetime] = None

    # ── User Seat Control ─────────────────────────────────────────────────────
    # total_user_seats : how many internal users this seller account may have.
    # Increases on upgrade purchase — existing users are NEVER reset.
    # Rule: current_active_users must never exceed total_user_seats.
    total_user_seats: int = Field(default=1)

    # Denormalized stats (updated lazily)
    total_tenants: int = Field(default=0)
    active_tenants: int = Field(default=0)

    # Timestamps
    last_login: Optional[datetime] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None

    # Soft delete
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class SellerCreate(BaseModel):
    """Schema for creating a new seller"""
    seller_name: str = Field(..., min_length=2, max_length=100)
    company_name: str = Field(..., min_length=2, max_length=200)
    email: str
    phone: str
    address: Optional[str] = None
    username: str = Field(..., min_length=3, max_length=50)
    password: str = Field(..., min_length=8)
    # Optional subscription fields (defaults to 30-day trial with 1 seat)
    plan_name: str = Field(default="trial")
    plan_display_name: str = Field(default="Trial")
    total_user_seats: int = Field(default=1, ge=1)
    trial_days: int = Field(default=30, ge=1)
    # Commission margin — None means use platform default
    margin_percentage: Optional[float] = Field(default=None, ge=0, le=100)


class SellerUpdate(BaseModel):
    """Schema for updating seller details"""
    seller_name: Optional[str] = None
    company_name: Optional[str] = None
    email: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None
    status: Optional[str] = None
    # Super-admin can extend subscription / add seats
    plan_name: Optional[str] = None
    plan_display_name: Optional[str] = None
    plan_expiry_date: Optional[datetime] = None
    total_user_seats: Optional[int] = None
    # Commission margin
    margin_percentage: Optional[float] = Field(default=None, ge=0, le=100)


class SellerSubscriptionUpdate(BaseModel):
    """Schema for super-admin updating seller subscription"""
    plan_name: str
    plan_display_name: str
    billing_cycle: str = "monthly"          # monthly | yearly
    additional_seats: int = Field(default=0, ge=0)
    extension_days: int = Field(default=30, ge=1)


class SellerResponse(BaseModel):
    """Public seller response (no password_hash)"""
    id: str
    seller_name: str
    company_name: str
    email: str
    phone: str
    address: Optional[str]
    status: str
    username: str
    total_tenants: int
    active_tenants: int
    # Subscription info
    plan_name: str
    plan_display_name: str
    plan_start_date: datetime
    plan_expiry_date: datetime
    is_trial: bool
    total_user_seats: int
    last_login: Optional[datetime]
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


SELLER_STATUS_DISPLAY = {
    SellerStatus.ACTIVE.value: "Active",
    SellerStatus.SUSPENDED.value: "Suspended",
}
