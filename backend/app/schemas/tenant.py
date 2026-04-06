"""
Tenant Registration Schemas
Multi-step company registration flow
"""

from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr, field_validator
import re


class Step1CompanyDetails(BaseModel):
    """
    Step 1: Company Information
    """
    company_name: str = Field(..., min_length=2, max_length=200)
    industry: str = Field(default="other")
    website: Optional[str] = None
    gst_number: Optional[str] = None
    phone: str = Field(..., min_length=10)
    
    # Address
    street: str = Field(default="")
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    zip_code: str = Field(..., min_length=4, max_length=20)
    country: str = Field(default="India")
    
    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        # Remove any spaces or dashes
        cleaned = re.sub(r'[\s\-]', '', v)
        if not re.match(r'^\+?[1-9]\d{9,14}$', cleaned):
            raise ValueError('Invalid phone number format')
        return cleaned
    
    @field_validator('gst_number')
    @classmethod
    def validate_gst(cls, v):
        if v and len(v) > 0:
            # Basic GST format validation for India
            if not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v.upper()):
                raise ValueError('Invalid GST number format')
            return v.upper()
        return v


_ALLOWED_DESIGNATIONS = {"Owner", "Admin"}
_REJECTED_DESIGNATIONS = {"", "select", "none", "null"}


def _validate_designation_value(v: str) -> str:
    """Shared designation validator used by all registration schemas."""
    if not v or v.strip().lower() in _REJECTED_DESIGNATIONS:
        raise ValueError("Designation is required. Please select Owner or Admin.")
    stripped = v.strip()
    if stripped not in _ALLOWED_DESIGNATIONS:
        raise ValueError("Designation must be either 'Owner' or 'Admin'.")
    return stripped


class Step2OwnerDetails(BaseModel):
    """
    Step 2: Owner/Admin Information
    """
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: EmailStr
    owner_mobile: str = Field(..., min_length=10)
    owner_username: str = Field(..., min_length=3, max_length=50)
    owner_designation: str = Field(...)
    owner_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)

    @field_validator('owner_designation')
    @classmethod
    def validate_designation(cls, v):
        return _validate_designation_value(v)

    @field_validator('owner_mobile')
    @classmethod
    def validate_mobile(cls, v):
        cleaned = re.sub(r'[\s\-]', '', v)
        if not re.match(r'^\+?[1-9]\d{9,14}$', cleaned):
            raise ValueError('Invalid mobile number format')
        return cleaned

    @field_validator('owner_username')
    @classmethod
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v, info):
        if 'owner_password' in info.data and v != info.data['owner_password']:
            raise ValueError('Passwords do not match')
        return v


class Step3PlanSelection(BaseModel):
    """
    Step 3: Plan Selection
    """
    plan_id: str = Field(...)
    billing_cycle: str = Field(default="monthly")  # monthly, quarterly, yearly
    
    @field_validator('billing_cycle')
    @classmethod
    def validate_billing_cycle(cls, v):
        valid_cycles = ['monthly', 'yearly']
        if v not in valid_cycles:
            raise ValueError(f'Billing cycle must be one of: {", ".join(valid_cycles)}')
        return v


class CompleteRegistration(BaseModel):
    """
    Complete registration with all steps
    """
    # Step 1
    company_name: str = Field(..., min_length=2, max_length=200)
    industry: str = Field(default="other")
    website: Optional[str] = None
    gst_number: Optional[str] = None
    phone: str = Field(..., min_length=10)
    company_email: Optional[EmailStr] = None
    # Free-text location (trial flow)
    location: Optional[str] = None
    # Structured address (subscription flow) — optional when location is used
    street: str = Field(default="")
    city: str = Field(default="")
    state: str = Field(default="")
    zip_code: str = Field(default="")
    country: str = Field(default="India")

    # Step 2
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: EmailStr
    owner_mobile: str = Field(..., min_length=10)
    owner_username: str = Field(..., min_length=3, max_length=50)
    owner_designation: str = Field(...)   # must be "Owner" or "Admin" — no default
    owner_password: str = Field(..., min_length=8)

    # Step 3
    plan_id: str = Field(...)
    billing_cycle: str = Field(default="monthly")
    user_count: int = Field(default=3, ge=1)

    @field_validator('owner_designation')
    @classmethod
    def validate_designation(cls, v):
        return _validate_designation_value(v)


class RegistrationResponse(BaseModel):
    """Registration response with payment info"""
    success: bool
    message: str
    tenant_id: str
    company_id: str
    company_name: str
    
    is_trial: bool = False

    # Payment Info (for non-trial plans)
    requires_payment: bool = False
    razorpay_order_id: Optional[str] = None
    razorpay_key_id: Optional[str] = None
    amount: Optional[int] = None
    currency: str = "INR"


class ValidateFieldRequest(BaseModel):
    """Validate individual field during registration"""
    field: str
    value: str


class ValidateFieldResponse(BaseModel):
    """Field validation response"""
    field: str
    is_valid: bool
    message: str = ""


# ── Trial Setup ───────────────────────────────────────────────────────────────

class TrialSetupRequest(BaseModel):
    """
    Single-page trial onboarding payload.
    Creates company + first user in one call — no plan_id required.
    """
    # Company
    company_name: str = Field(..., min_length=2, max_length=200)
    company_contact: Optional[str] = Field(None, max_length=20)
    website: Optional[str] = Field(None, max_length=255)
    no_website: bool = Field(default=False)

    # User
    person_name: str = Field(..., min_length=2, max_length=100)
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    contact_number: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=8, max_length=100)
    confirm_password: str = Field(..., min_length=8, max_length=100)
    designation: str = Field(...)

    # ── Validators ────────────────────────────────────────────────────────────

    @field_validator('designation')
    @classmethod
    def validate_designation(cls, v: str) -> str:
        return _validate_designation_value(v)

    @field_validator('username')
    @classmethod
    def validate_username(cls, v: str) -> str:
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()

    @field_validator('contact_number')
    @classmethod
    def validate_contact_number(cls, v: str) -> str:
        cleaned = re.sub(r'[\s\-\+]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError(
                'Contact number must be a valid 10-digit Indian mobile starting with 6–9'
            )
        return cleaned

    @field_validator('password')
    @classmethod
    def validate_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v

    @field_validator('confirm_password')
    @classmethod
    def passwords_match(cls, v: str, info) -> str:
        if 'password' in info.data and v != info.data['password']:
            raise ValueError('Passwords do not match')
        return v


class TrialSetupResponse(BaseModel):
    """Response returned after a successful trial setup."""
    success: bool
    message: str
    data: dict