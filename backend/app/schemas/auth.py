"""
Authentication Schemas
Request/Response schemas for authentication endpoints
"""

from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr


class LoginRequest(BaseModel):
    """
    Login request schema

    Supports login with username, email, or mobile number.

    company_code is optional but strongly recommended for non-owner users.
    When provided, login is scoped strictly to that company's database,
    preventing any cross-tenant credential match.
    When omitted, the system falls back to the global identifier search
    (owner-first, then all active tenants) for backward compatibility.
    """
    identifier: str = Field(
        ...,
        min_length=3,
        description="Username, email, or mobile number"
    )
    password: str = Field(..., min_length=1)
    company_code: Optional[str] = Field(
        None,
        description="Company code for tenant-scoped login (recommended for non-owners)"
    )
    force_login: bool = Field(
        False,
        description="If True, revoke any existing session and log in on this device"
    )


class SuperAdminLoginRequest(BaseModel):
    """SuperAdmin login request"""
    username: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class TokenResponse(BaseModel):
    """JWT token response"""
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int  # Seconds until expiration


class LoginResponse(BaseModel):
    """
    Login response with user context

    Includes:
    - JWT tokens
    - User information
    - Company context (for tenant users)
    - Permissions
    - Subscription / plan info
    """
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int

    # User Info
    user_id: str
    username: str
    full_name: str
    email: str
    role: str
    permissions: List[str]
    designation: Optional[str] = None
    department_id: Optional[str] = None
    reporting_to: Optional[str] = None

    # Company Context (null for SuperAdmin / Seller)
    company_id: Optional[str] = None
    company_name: Optional[str] = None

    # Flags
    is_super_admin: bool = False
    is_owner: bool = False
    is_seller: bool = False
    seller_id: Optional[str] = None
    user_type: Optional[str] = None

    # Subscription / plan info (tenant users only)
    plan_name: Optional[str] = None
    plan_display_name: Optional[str] = None
    plan_expiry: Optional[str] = None
    total_user_seats: Optional[int] = None
    is_trial: Optional[bool] = None

    # Onboarding flags
    must_change_password: bool = False
    profile_completed: bool = True


class RefreshTokenRequest(BaseModel):
    """Request to refresh access token"""
    refresh_token: str


class ForgotPasswordRequest(BaseModel):
    """Forgot password request"""
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    """Reset password with token"""
    token: str
    new_password: str = Field(..., min_length=8)


class ChangePasswordRequest(BaseModel):
    """Change password (authenticated user)"""
    current_password: str
    new_password: str = Field(..., min_length=8)


class VerifyEmailRequest(BaseModel):
    """Email verification request"""
    token: str


class MessageResponse(BaseModel):
    """Generic message response"""
    message: str
    success: bool = True


class ErrorResponse(BaseModel):
    """Error response schema"""
    detail: str
    error_code: Optional[str] = None
    success: bool = False


class TenantLoginRequest(BaseModel):
    """
    Second-step login request used after the tenant-selection screen.
    The user picks one company from the list returned by /auth/login,
    then calls /auth/login-with-tenant with their credentials + that company_id.
    """
    identifier: str = Field(..., min_length=3, description="Username, email, or mobile")
    password: str   = Field(..., min_length=1)
    company_id: str = Field(..., description="The company_id the user selected")
    force_login: bool = Field(False, description="If True, revoke any existing session")


class TenantSelectionResponse(BaseModel):
    """
    Returned by /auth/login when the same password matches user accounts in
    multiple companies (e.g. a partner registered with two clients).
    The frontend renders a company picker; the user then calls /auth/login-with-tenant.
    """
    tenant_selection_required: bool = True
    message: str
    tenants: List[dict]   # [{company_id, company_name, role}, ...]