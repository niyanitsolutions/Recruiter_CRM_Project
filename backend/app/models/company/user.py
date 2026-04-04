"""
User Model - Company Level (Enhanced for Phase 2)
Complete user management within a company
"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field, EmailStr, field_validator
from enum import Enum
import re


class UserStatus(str, Enum):
    """User status options"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"
    PENDING = "pending"  # Awaiting first login/email verification


class UserRole(str, Enum):
    """System-defined user roles"""
    ADMIN = "admin"
    CANDIDATE_COORDINATOR = "candidate_coordinator"
    CLIENT_COORDINATOR = "client_coordinator"
    HR = "hr"
    ACCOUNTS = "accounts"
    PARTNER = "partner"


class UserModel(BaseModel):
    """User document model for company database"""
    id: Optional[str] = Field(None, alias="_id")
    
    # Basic Info
    username: str = Field(..., min_length=3, max_length=50)
    email: str = Field(..., max_length=255)
    full_name: str = Field(..., min_length=2, max_length=100)
    mobile: str = Field(..., min_length=10, max_length=15)
    password_hash: str
    
    # Profile
    avatar_url: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None  # male, female, other, prefer_not_to_say
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: Optional[str] = Field(default="India")
    
    # Employment Info
    employee_id: Optional[str] = None  # Company's internal employee ID
    role: str = Field(default=UserRole.CANDIDATE_COORDINATOR.value)
    role_id: Optional[str] = None  # Reference to custom role if any
    permissions: List[str] = Field(default_factory=list)
    designation: Optional[str] = None
    designation_id: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[str] = None
    reporting_to: Optional[str] = None  # User ID of manager
    joining_date: Optional[datetime] = None

    # Permission configuration (source of truth for UI reconstruction)
    primary_department: Optional[str] = None   # e.g. "admin", "hr", "accounts"
    level: Optional[str] = None                # "executive" | "manager"
    assigned_departments: List[str] = Field(default_factory=list)
    restricted_modules: List[str] = Field(default_factory=list)
    
    # User type
    user_type: str = Field(default="internal")  # internal | partner

    # Status
    status: str = Field(default=UserStatus.ACTIVE.value)
    is_owner: bool = Field(default=False)  # Company owner flag
    
    # Login Info
    last_login: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    login_count: int = Field(default=0)
    failed_login_attempts: int = Field(default=0)
    locked_until: Optional[datetime] = None  # Account lockout
    
    # Password Management
    password_changed_at: Optional[datetime] = None
    must_change_password: bool = Field(default=False)  # Force password change on next login

    # Profile completion (shown as one-time popup for admin/owner on first login)
    profile_completed: bool = Field(default=True)  # default True for existing users
    
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


class UserCreate(BaseModel):
    """Schema for creating a new user"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    mobile: str = Field(..., min_length=10, max_length=15)
    password: str = Field(..., min_length=8, max_length=100)
    
    # Optional Profile
    employee_id: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    
    # Employment
    role: str = Field(default=UserRole.CANDIDATE_COORDINATOR.value)
    role_id: Optional[str] = None
    permissions: Optional[List[str]] = None  # Pre-computed permissions list
    user_type: Optional[str] = Field(default="internal")  # internal | partner
    designation: Optional[str] = None
    designation_id: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[str] = None
    reporting_to: Optional[str] = None
    joining_date: Optional[datetime] = None

    # Permission configuration (source of truth for UI reconstruction)
    primary_department: Optional[str] = None   # e.g. "admin", "hr", "accounts"
    level: Optional[str] = None                # "executive" | "manager"
    assigned_departments: Optional[List[str]] = None
    restricted_modules: Optional[List[str]] = None

    # Status
    status: Optional[str] = Field(default=UserStatus.ACTIVE.value)
    send_welcome_email: bool = Field(default=True)

    # When True, skip the username/email/mobile uniqueness check (admin override)
    override_duplicate: bool = Field(default=False)

    @field_validator('username')
    @classmethod
    def validate_username(cls, v):
        if not re.match(r'^[a-zA-Z0-9_]+$', v):
            raise ValueError('Username can only contain letters, numbers, and underscores')
        return v.lower()

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned

    @field_validator('password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class UserUpdate(BaseModel):
    """Schema for updating a user (Admin can edit all fields)"""
    full_name: Optional[str] = Field(None, min_length=2, max_length=100)
    mobile: Optional[str] = Field(None, min_length=10, max_length=15)

    # Profile
    avatar_url: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None

    # Employment (Admin only)
    employee_id: Optional[str] = None
    role: Optional[str] = None
    role_id: Optional[str] = None
    permissions: Optional[List[str]] = None  # Pre-computed permissions list
    user_type: Optional[str] = None  # internal | partner
    designation: Optional[str] = None
    designation_id: Optional[str] = None
    department: Optional[str] = None
    department_id: Optional[str] = None
    reporting_to: Optional[str] = None
    joining_date: Optional[datetime] = None

    # Permission configuration (source of truth for UI reconstruction)
    primary_department: Optional[str] = None
    level: Optional[str] = None
    assigned_departments: Optional[List[str]] = None
    restricted_modules: Optional[List[str]] = None

    # Status (Admin only)
    status: Optional[str] = None

    # Profile completion
    profile_completed: Optional[bool] = None

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned


class UserProfileUpdate(BaseModel):
    """Schema for user updating their own profile (limited fields)"""
    # Users CANNOT edit: username, email, name (as per requirements)
    mobile: Optional[str] = Field(None, min_length=10, max_length=15)
    avatar_url: Optional[str] = None
    date_of_birth: Optional[datetime] = None
    gender: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned


class UserResponse(BaseModel):
    """User response schema (excludes sensitive data)"""
    id: str
    username: str
    email: str
    full_name: str
    mobile: str
    
    # Profile
    avatar_url: Optional[str]
    date_of_birth: Optional[datetime]
    gender: Optional[str]
    address: Optional[str]
    city: Optional[str]
    state: Optional[str]
    zip_code: Optional[str]
    country: Optional[str]
    
    # Employment
    employee_id: Optional[str]
    role: str
    role_name: str = ""  # Human readable role name
    permissions: List[str]
    user_type: str = "internal"
    designation: Optional[str]
    designation_id: Optional[str]
    department: Optional[str]
    department_id: Optional[str]
    reporting_to: Optional[str]
    reporting_to_name: Optional[str] = None  # Manager's name
    joining_date: Optional[datetime]

    # Permission configuration (source of truth for UI reconstruction)
    primary_department: Optional[str] = None
    level: Optional[str] = None
    assigned_departments: List[str] = Field(default_factory=list)
    restricted_modules: List[str] = Field(default_factory=list)

    # Status
    status: str
    is_owner: bool
    last_login: Optional[datetime]

    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime]


class UserListResponse(BaseModel):
    """Simplified user response for lists"""
    id: str
    username: str
    email: str
    full_name: str
    mobile: str
    role: str
    role_name: str = ""
    user_type: str = "internal"
    designation: Optional[str]
    department: Optional[str]
    reporting_to_name: Optional[str]
    status: str
    is_owner: bool
    last_login: Optional[datetime]
    created_at: datetime


class ChangePasswordRequest(BaseModel):
    """Schema for changing password"""
    current_password: str
    new_password: str = Field(..., min_length=8, max_length=100)
    confirm_password: str

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


class ResetPasswordByAdmin(BaseModel):
    """Schema for admin resetting user's password"""
    new_password: str = Field(..., min_length=8, max_length=100)
    must_change_password: bool = Field(default=True)

    @field_validator('new_password')
    @classmethod
    def validate_password(cls, v):
        if len(v) < 8:
            raise ValueError('Password must be at least 8 characters')
        if not re.search(r'[A-Z]', v):
            raise ValueError('Password must contain at least one uppercase letter')
        if not re.search(r'[a-z]', v):
            raise ValueError('Password must contain at least one lowercase letter')
        if not re.search(r'\d', v):
            raise ValueError('Password must contain at least one digit')
        return v


# Default permissions for each role (used as fallback in auth tokens)
ROLE_PERMISSIONS = {
    "admin": [
        "dashboard:view",
        "users:view", "users:create", "users:edit", "users:delete", "users:manage_roles",
        "roles:view", "roles:create", "roles:edit", "roles:delete",
        "departments:view", "departments:create", "departments:edit", "departments:delete",
        "designations:view", "designations:create", "designations:edit", "designations:delete",
        "clients:view", "clients:create", "clients:edit", "clients:delete",
        "candidates:view", "candidates:create", "candidates:edit", "candidates:delete", "candidates:assign",
        "jobs:view", "jobs:create", "jobs:edit", "jobs:delete",
        "interviews:view", "interviews:schedule", "interviews:update_status",
        "partners:view", "partners:create", "partners:edit", "partners:delete",
        "onboards:view", "onboards:create", "onboards:edit",
        "accounts:view", "accounts:invoices", "accounts:payouts",
        "payouts:view", "payouts:edit",
        "invoices:view", "invoices:approve",
        "imports:view", "imports:create",
        "exports:view", "exports:create",
        "targets:view", "targets:create", "targets:edit", "targets:delete", "targets:admin",
        "analytics:view", "analytics:edit",
        "reports:view", "reports:export",
        "crm_settings:view", "crm_settings:edit",
        "interview_settings:view", "interview_settings:create",
        "interview_settings:edit", "interview_settings:delete",
        "audit:view", "audit:sessions", "audit:alerts", "audit:admin",
        "notifications:create",
    ],
    "candidate_coordinator": [
        "dashboard:view",
        "clients:view",
        "candidates:view", "candidates:create", "candidates:edit", "candidates:delete", "candidates:assign",
        "interviews:view", "interviews:schedule", "interviews:update_status",
        "interview_settings:view", "interview_settings:create",
        "interview_settings:edit", "interview_settings:delete",
        "jobs:view", "onboards:view", "reports:view",
    ],
    "client_coordinator": [
        "dashboard:view",
        "clients:view", "clients:create", "clients:edit", "clients:delete",
        "jobs:view", "jobs:create", "jobs:edit", "jobs:delete",
        "interviews:view", "interviews:schedule", "interviews:update_status",
        "interview_settings:view",
        "candidates:view", "onboards:view", "reports:view",
    ],
    "hr": [
        "dashboard:view",
        "users:view", "candidates:view",
        "onboards:view", "onboards:create", "onboards:edit",
        "reports:view",
    ],
    "accounts": [
        "dashboard:view",
        "accounts:view", "accounts:invoices", "accounts:payouts",
        "clients:view", "partners:view", "reports:view", "reports:export",
        "payouts:view", "payouts:edit", "invoices:view", "invoices:approve",
    ],
    "partner": [
        "dashboard:view",
        "candidates:view", "candidates:create",
        "jobs:view", "interviews:view",
        "accounts:view", "accounts:invoices",
    ],
}


# Role display names
ROLE_DISPLAY_NAMES = {
    UserRole.ADMIN.value: "Administrator",
    UserRole.CANDIDATE_COORDINATOR.value: "Candidate Coordinator",
    UserRole.CLIENT_COORDINATOR.value: "Client Coordinator",
    UserRole.HR.value: "HR",
    UserRole.ACCOUNTS.value: "Accounts",
    UserRole.PARTNER.value: "Partner"
}


def get_role_display_name(role: str) -> str:
    """Get human readable role name"""
    return ROLE_DISPLAY_NAMES.get(role, role.replace("_", " ").title())