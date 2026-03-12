"""
Plan Model (master_db)
Defines subscription plans for tenants
"""

from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field
import uuid


class PlanStatus(str, Enum):
    """Plan status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    DEPRECATED = "deprecated"


class BillingCycle(str, Enum):
    """Billing cycle options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"


class PlanFeature(BaseModel):
    """Feature included in a plan"""
    code: str
    name: str
    description: str
    limit: Optional[int] = None  # None means unlimited
    is_enabled: bool = True


class PlanModel(BaseModel):
    """
    Subscription Plan Model
    
    Stored in: master_db.plans
    
    Defines:
    - Plan pricing
    - Feature limits
    - Billing cycles
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    
    # Plan Identity
    name: str = Field(..., min_length=2, max_length=50)  # trial, basic, pro
    display_name: str = Field(..., min_length=2, max_length=100)
    description: str = Field(default="")
    
    # Per-user pricing (in INR paise — 100 paise = 1 INR)
    # price_per_user_monthly: monthly charge per user
    # price_per_user_yearly : per-user per-month charge when billed yearly
    # original_price_monthly: original/strikethrough price per user (for displaying discounts)
    price_per_user_monthly: int = Field(default=0)
    price_per_user_yearly: int = Field(default=0)
    original_price_monthly: int = Field(default=0)

    # Legacy flat-rate fields kept for backward compatibility with super-admin CRUD
    price_monthly: int = Field(default=0)
    price_yearly: int = Field(default=0)

    reseller_discount_percent: int = Field(default=0)

    # User limit (only meaningful limit — -1 = unlimited, controlled by purchased user_count)
    max_users: int = Field(default=-1)
    # Candidate and job limits removed; kept as -1 for backward compatibility
    max_candidates: int = Field(default=-1)
    max_jobs: int = Field(default=-1)
    max_partners: int = Field(default=-1)

    # Platform access
    has_desktop: bool = Field(default=True)
    has_mobile: bool = Field(default=False)

    # Features
    features: List[PlanFeature] = Field(default_factory=list)

    # Trial specific
    is_trial_plan: bool = Field(default=False)
    trial_days: int = Field(default=30)
    
    # Status
    status: PlanStatus = Field(default=PlanStatus.ACTIVE)
    is_popular: bool = Field(default=False)
    sort_order: int = Field(default=0)
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    
    model_config = ConfigDict(populate_by_name=True)
    
    def to_dict(self) -> dict:
        """Convert model to dictionary for MongoDB insertion"""
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data
    
    def get_price_per_user(self, cycle: BillingCycle) -> int:
        """Return per-user per-month price for the given billing cycle (in paise)."""
        if cycle == BillingCycle.YEARLY:
            return self.price_per_user_yearly
        return self.price_per_user_monthly


class PlanCreate(BaseModel):
    """Schema for creating a new plan"""
    name: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    description: str = Field(default="")
    price_monthly: int = Field(default=0)
    price_quarterly: int = Field(default=0)
    price_yearly: int = Field(default=0)
    max_users: int = Field(default=5)
    max_candidates: int = Field(default=100)
    max_jobs: int = Field(default=10)
    max_partners: int = Field(default=5)
    is_trial_plan: bool = Field(default=False)
    trial_days: int = Field(default=14)


class PlanResponse(BaseModel):
    """Schema for plan API responses"""
    id: str
    name: str
    display_name: str
    description: str
    price_monthly: int
    price_quarterly: int
    price_yearly: int
    max_users: int
    max_candidates: int
    max_jobs: int
    max_partners: int
    is_trial_plan: bool
    is_popular: bool
    status: str
    
    model_config = ConfigDict(from_attributes=True)


# Canonical plan definitions — Trial, Neon, Quantum
# All prices are in INR paise (100 paise = ₹1)
DEFAULT_PLANS = [
    {
        # ── Trial ──────────────────────────────────────────────────────────
        "name": "trial",
        "display_name": "Trial",
        "description": "30-day free trial — Desktop access",
        "price_per_user_monthly": 0,
        "price_per_user_yearly": 0,
        "original_price_monthly": 0,
        "price_monthly": 0,
        "price_yearly": 0,
        "max_users": 3,
        "max_candidates": -1,
        "max_jobs": -1,
        "max_partners": -1,
        "has_desktop": True,
        "has_mobile": False,
        "is_trial_plan": True,
        "trial_days": 30,
        "is_popular": False,
        "sort_order": 0,
    },
    {
        # ── Neon ────────────────────────────────────────────────────────────
        # Monthly : ₹149/user  (original ₹300)
        # Yearly  : ₹99/user/month billed yearly (₹1,188/user/year)
        "name": "neon",
        "display_name": "Neon",
        "description": "Desktop access for your recruitment team",
        "price_per_user_monthly": 14900,   # ₹149 per user per month
        "price_per_user_yearly": 9900,     # ₹99 per user per month (billed yearly)
        "original_price_monthly": 30000,   # ₹300 (strikethrough)
        "price_monthly": 14900,            # legacy flat field (per-user basis)
        "price_yearly": 9900,
        "max_users": -1,
        "max_candidates": -1,
        "max_jobs": -1,
        "max_partners": -1,
        "has_desktop": True,
        "has_mobile": False,
        "is_trial_plan": False,
        "trial_days": 0,
        "is_popular": False,
        "reseller_discount_percent": 20,
        "sort_order": 1,
    },
    {
        # ── Quantum ──────────────────────────────────────────────────────────
        # Monthly : ₹249/user  (original ₹500)
        # Yearly  : ₹149/user/month billed yearly (₹1,788/user/year)
        "name": "quantum",
        "display_name": "Quantum",
        "description": "Desktop + Mobile (Mobile Coming Soon)",
        "price_per_user_monthly": 24900,   # ₹249 per user per month
        "price_per_user_yearly": 14900,    # ₹149 per user per month (billed yearly)
        "original_price_monthly": 50000,   # ₹500 (strikethrough)
        "price_monthly": 24900,
        "price_yearly": 14900,
        "max_users": -1,
        "max_candidates": -1,
        "max_jobs": -1,
        "max_partners": -1,
        "has_desktop": True,
        "has_mobile": True,
        "is_trial_plan": False,
        "trial_days": 0,
        "is_popular": True,
        "reseller_discount_percent": 20,
        "sort_order": 2,
    },
]