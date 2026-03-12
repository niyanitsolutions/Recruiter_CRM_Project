"""
Tenant Model (master_db)
Represents a company/organization in the multi-tenant system
"""

from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field, EmailStr
import uuid


class TenantStatus(str, Enum):
    """Tenant account status"""
    PENDING = "pending"          # Registration started, payment pending
    ACTIVE = "active"            # Fully active and operational
    SUSPENDED = "suspended"      # Temporarily suspended (e.g., payment issue)
    CANCELLED = "cancelled"      # Account cancelled
    TRIAL_EXPIRED = "trial_expired"  # Trial period ended, needs upgrade


class Industry(str, Enum):
    """Industry types for companies"""
    IT_SERVICES = "it_services"
    HEALTHCARE = "healthcare"
    FINANCE = "finance"
    MANUFACTURING = "manufacturing"
    RETAIL = "retail"
    EDUCATION = "education"
    REAL_ESTATE = "real_estate"
    CONSULTING = "consulting"
    STAFFING = "staffing"
    OTHER = "other"


class OwnerInfo(BaseModel):
    """Owner/Admin information embedded in tenant"""
    full_name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    mobile: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$")
    username: str = Field(..., min_length=3, max_length=50)
    designation: str = Field(default="Owner")
    password_hash: str  # Stored hashed, never plain text


class AddressInfo(BaseModel):
    """Company address information"""
    street: str = Field(default="")
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    zip_code: str = Field(..., min_length=4, max_length=20)
    country: str = Field(default="India")


class TenantModel(BaseModel):
    """
    Tenant/Company Model
    
    Stored in: master_db.tenants
    
    Each tenant has:
    - Unique company_id used for database naming
    - Owner information (first admin user)
    - Plan and subscription details
    - Company metadata
    """
    
    # Identifiers
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str = Field(default_factory=lambda: str(uuid.uuid4())[:8])
    
    # Company Information
    company_name: str = Field(..., min_length=2, max_length=200)
    display_name: Optional[str] = None
    industry: Industry = Field(default=Industry.OTHER)
    website: Optional[str] = None
    gst_number: Optional[str] = None
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$")
    
    # Address
    address: AddressInfo
    
    # Owner (First Admin)
    owner: OwnerInfo
    
    # Plan & Subscription
    plan_id: str = Field(...)  # Reference to plans collection
    plan_name: str = Field(default="trial")
    plan_start_date: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    plan_expiry: datetime
    is_trial: bool = Field(default=True)

    # Seller Reference (optional — null when created directly by Super Admin)
    seller_id: Optional[str] = None
    seller_name: Optional[str] = None

    # Status
    status: TenantStatus = Field(default=TenantStatus.PENDING)

    # Email Verification
    # Self-registered tenants start unverified; admin-created tenants start verified.
    email_verified: bool = Field(default=False)
    email_verification_token: Optional[str] = None
    email_verification_expiry: Optional[datetime] = None

    # Payment / creation metadata
    payment_status: Optional[str] = None   # "manual_by_admin" | "paid" | None
    payment_mode: Optional[str] = None     # "upi" | "bank_transfer" | "cash" | "razorpay"

    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(default="system")
    
    # Soft Delete
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    
    model_config = ConfigDict(populate_by_name=True)
    
    def to_dict(self) -> dict:
        """Convert model to dictionary for MongoDB insertion"""
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data


class TenantCreate(BaseModel):
    """Schema for creating a new tenant"""
    
    # Step 1: Company Details
    company_name: str = Field(..., min_length=2, max_length=200)
    industry: Industry = Field(default=Industry.OTHER)
    website: Optional[str] = None
    gst_number: Optional[str] = None
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$")
    
    # Address
    street: str = Field(default="")
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    zip_code: str = Field(..., min_length=4, max_length=20)
    country: str = Field(default="India")
    
    # Step 2: Owner Details
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: EmailStr
    owner_mobile: str = Field(..., pattern=r"^\+?[1-9]\d{9,14}$")
    owner_username: str = Field(..., min_length=3, max_length=50)
    owner_designation: str = Field(default="Owner")
    owner_password: str = Field(..., min_length=8)
    
    # Step 3: Plan Selection
    plan_id: str


class TenantUpdate(BaseModel):
    """Schema for updating tenant details"""
    company_name: Optional[str] = None
    display_name: Optional[str] = None
    industry: Optional[Industry] = None
    website: Optional[str] = None
    gst_number: Optional[str] = None
    phone: Optional[str] = None
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None


class TenantAdminCreate(BaseModel):
    """
    Schema for Super Admin creating a tenant WITHOUT payment.
    Useful for demo accounts, manual onboarding, partner accounts.
    payment_status = 'manual_by_admin'
    email_verified = True  (admin vouches for the account)
    """
    company_name: str = Field(..., min_length=2, max_length=200)
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: str
    owner_password: str = Field(..., min_length=8)
    plan_id: str
    user_seats: int = Field(default=3, ge=1)
    plan_duration_days: int = Field(default=30, ge=1)
    # Optional
    industry: str = Field(default="other")
    phone: str = Field(default="0000000000")
    city: str = Field(default="NA")
    state: str = Field(default="NA")
    zip_code: str = Field(default="000000")
    seller_id: Optional[str] = None
    send_welcome_email: bool = True


class TenantAdminCreateWithPayment(BaseModel):
    """
    Schema for Super Admin creating a tenant WITH a recorded offline payment.
    payment_status = 'paid'
    plan_start_date = payment_date
    plan_expiry_date = payment_date + plan_duration_days
    """
    company_name: str = Field(..., min_length=2, max_length=200)
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: str
    owner_password: str = Field(..., min_length=8)
    plan_id: str
    user_seats: int = Field(default=3, ge=1)
    plan_duration_days: int = Field(default=30, ge=1)
    # Payment details
    amount_paid: float = Field(..., ge=0)
    payment_mode: str = Field(...)  # upi | bank_transfer | cash
    payment_date: datetime
    payment_reference: Optional[str] = None  # UTR / transaction ref
    # Optional
    industry: str = Field(default="other")
    phone: str = Field(default="0000000000")
    city: str = Field(default="NA")
    state: str = Field(default="NA")
    zip_code: str = Field(default="000000")
    seller_id: Optional[str] = None
    send_welcome_email: bool = True


class TenantResponse(BaseModel):
    """Schema for tenant API responses"""
    id: str
    company_id: str
    company_name: str
    display_name: Optional[str]
    industry: str
    status: str
    plan_name: str
    plan_expiry: datetime
    is_trial: bool
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
