"""
Client Model - Phase 3
Companies that hire candidates (Hiring Clients)
"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field, EmailStr, field_validator
from enum import Enum
import re


class ClientStatus(str, Enum):
    """Client status options"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_HOLD = "on_hold"
    BLACKLISTED = "blacklisted"
    REJECTED = "rejected"


class ClientType(str, Enum):
    """Client type options"""
    DIRECT = "direct"           # Direct client
    VENDOR = "vendor"           # Through vendor
    RECRUITMENT = "recruitment" # Recruitment agency


class ContactPerson(BaseModel):
    """Contact person details"""
    name: str
    designation: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    is_primary: bool = False

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned


class ClientModel(BaseModel):
    """Client document model"""
    id: Optional[str] = Field(None, alias="_id")
    
    # Basic Info
    name: str = Field(..., min_length=2, max_length=200)
    code: Optional[str] = Field(None, max_length=50)  # Client code
    client_type: str = Field(default=ClientType.DIRECT.value)
    industry: Optional[str] = None
    website: Optional[str] = None
    
    # Address
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = Field(default="India")
    zip_code: Optional[str] = None
    
    # Contact
    email: Optional[str] = None
    phone: Optional[str] = None
    contact_persons: List[ContactPerson] = Field(default_factory=list)
    
    # Business Details
    gstin: Optional[str] = None  # GST Number
    pan: Optional[str] = None    # PAN Number
    
    # Agreement
    agreement_start: Optional[datetime] = None
    agreement_end: Optional[datetime] = None
    commission_percentage: float = Field(default=8.33)  # Default 8.33%
    payment_terms: Optional[int] = None  # Payment terms in days, e.g., 30
    
    # Stats (auto-updated)
    total_jobs: int = Field(default=0)
    active_jobs: int = Field(default=0)
    total_placements: int = Field(default=0)
    
    # Status
    status: str = Field(default=ClientStatus.ACTIVE.value)
    rejection_reason: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    notes: Optional[str] = None
    
    # Timestamps
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    # Soft Delete
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class ClientCreate(BaseModel):
    """Schema for creating a client"""
    name: str = Field(..., min_length=2, max_length=200)
    code: Optional[str] = None
    client_type: Optional[str] = Field(default=ClientType.DIRECT.value)
    industry: Optional[str] = None
    website: Optional[str] = None
    
    # Address
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = Field(default="India")
    zip_code: Optional[str] = None
    
    # Contact
    email: Optional[EmailStr] = None
    phone: Optional[str] = None
    contact_persons: List[ContactPerson] = Field(default_factory=list)
    
    # Business
    gstin: Optional[str] = None
    pan: Optional[str] = None
    
    # Agreement
    agreement_start: Optional[datetime] = None
    agreement_end: Optional[datetime] = None
    commission_percentage: Optional[float] = Field(default=8.33)
    payment_terms: Optional[int] = None  # Payment terms in days, e.g., 30

    notes: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned


class ClientUpdate(BaseModel):
    """Schema for updating a client"""
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    code: Optional[str] = None
    client_type: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None

    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None

    email: Optional[str] = None
    phone: Optional[str] = None
    contact_persons: Optional[List[ContactPerson]] = None

    gstin: Optional[str] = None
    pan: Optional[str] = None

    agreement_start: Optional[datetime] = None
    agreement_end: Optional[datetime] = None
    commission_percentage: Optional[float] = None
    payment_terms: Optional[int] = None  # Payment terms in days, e.g., 30
    
    status: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None

    @field_validator('phone')
    @classmethod
    def validate_phone(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned


class ClientResponse(BaseModel):
    """Client response schema"""
    id: str
    name: str
    code: Optional[str]
    client_type: str
    industry: Optional[str]
    website: Optional[str]
    
    city: Optional[str]
    state: Optional[str]
    country: Optional[str]
    
    email: Optional[str]
    phone: Optional[str]
    contact_persons: List[ContactPerson]
    
    commission_percentage: float

    total_jobs: int
    active_jobs: int
    total_placements: int

    status: str
    rejection_reason: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    created_at: datetime


class ClientListResponse(BaseModel):
    """Simplified client for lists"""
    id: str
    name: str
    code: Optional[str]
    client_type: str
    industry: Optional[str]
    city: Optional[str]
    active_jobs: int
    total_placements: int
    status: str


# Client type display names
CLIENT_TYPE_DISPLAY = {
    ClientType.DIRECT.value: "Direct Client",
    ClientType.VENDOR.value: "Vendor",
    ClientType.RECRUITMENT.value: "Recruitment Agency"
}


def get_client_type_display(client_type: str) -> str:
    return CLIENT_TYPE_DISPLAY.get(client_type, client_type)