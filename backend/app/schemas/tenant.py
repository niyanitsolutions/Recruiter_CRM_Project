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


class Step2OwnerDetails(BaseModel):
    """
    Step 2: Owner/Admin Information
    """
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: EmailStr
    owner_mobile: str = Field(..., min_length=10)
    owner_username: str = Field(..., min_length=3, max_length=50)
    owner_designation: str = Field(default="Owner")
    owner_password: str = Field(..., min_length=8)
    confirm_password: str = Field(..., min_length=8)
    
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
    street: str = Field(default="")
    city: str = Field(..., min_length=2, max_length=100)
    state: str = Field(..., min_length=2, max_length=100)
    zip_code: str = Field(..., min_length=4, max_length=20)
    country: str = Field(default="India")
    
    # Step 2
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_email: EmailStr
    owner_mobile: str = Field(..., min_length=10)
    owner_username: str = Field(..., min_length=3, max_length=50)
    owner_designation: str = Field(default="Owner")
    owner_password: str = Field(..., min_length=8)
    
    # Step 3
    plan_id: str = Field(...)
    billing_cycle: str = Field(default="monthly")
    user_count: int = Field(default=3, ge=1)


class RegistrationResponse(BaseModel):
    """Registration response with payment info"""
    success: bool
    message: str
    tenant_id: str
    company_id: str
    company_name: str
    
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