"""
Authentication API Endpoints
Login, registration, and token management
"""

from fastapi import APIRouter, HTTPException, status, Depends, Request
from typing import Optional
from pydantic import BaseModel
import logging
import re

from app.schemas.auth import (
    LoginRequest,
    LoginResponse,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    MessageResponse,
    TokenResponse
)
from app.schemas.tenant import CompleteRegistration, RegistrationResponse
from app.services.auth_service import auth_service
from app.services.tenant_service import tenant_service
from app.services.plan_service import plan_service
from app.services.payment_service import payment_service
from app.core.security import verify_refresh_token
from app.core.database import get_master_db
from app.middleware.auth import get_current_user, AuthContext

logger = logging.getLogger(__name__)

router = APIRouter()


class RenewalOrderRequest(BaseModel):
    tenant_id: str
    plan_id: str
    billing_cycle: str = "monthly"
    user_count: int = 1


class RenewalVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/login", response_model=LoginResponse)
async def login(data: LoginRequest, request: Request):
    """
    User login endpoint

    Supports login with:
    - Username
    - Email
    - Mobile number
    - Full name

    Returns JWT tokens and user context.
    Any existing active session for the user is automatically terminated
    and replaced by the new session (new device always wins).
    """
    result, error = await auth_service.login(data.identifier, data.password, request=request)

    if error:
        if "EMAIL_NOT_VERIFIED" in error:
            # Format: "EMAIL_NOT_VERIFIED|{email}|{message}"
            parts = error.split("|", 2)
            email = parts[1] if len(parts) > 1 else ""
            message = parts[2] if len(parts) > 2 else "Please verify your email."
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={
                    "email_not_verified": True,
                    "email": email,
                    "message": message,
                }
            )
        if "SUBSCRIPTION_EXPIRED" in error:
            is_owner = error.startswith("SUBSCRIPTION_EXPIRED_OWNER")
            # Format: "SUBSCRIPTION_EXPIRED[_OWNER]|{expiry_iso_or_None}|{message}"
            parts = error.split("|", 2)
            plan_expiry_str = parts[1] if len(parts) > 1 and parts[1] != "None" else None
            message = parts[2] if len(parts) > 2 else "Your subscription has expired."

            # Determine if this is a seller expiry (sellers are not in the tenants table)
            master_db = get_master_db()
            ci = re.compile(f"^{re.escape(data.identifier)}$", re.IGNORECASE)

            # Check sellers table first
            seller_doc = await master_db.sellers.find_one({
                "$or": [{"username": ci}, {"email": ci}],
                "is_deleted": False,
            })

            tenant_id = None
            company_id = None
            user_type = "seller" if seller_doc else "tenant"

            # Only look up tenant details for tenant owners (not sellers)
            if is_owner and not seller_doc:
                tenant = await master_db.tenants.find_one({
                    "$or": [
                        {"owner.username": ci},
                        {"owner.email": ci},
                        {"owner.mobile": data.identifier},
                    ]
                })
                if tenant:
                    tenant_id = str(tenant.get("_id", ""))
                    company_id = tenant.get("company_id")

            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "subscription_expired": True,
                    "is_owner": is_owner,
                    "user_type": user_type,
                    "message": message,
                    "plan_expiry": plan_expiry_str,
                    "tenant_id": tenant_id,
                    "company_id": company_id,
                }
            )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error
        )

    return result


@router.post("/register", response_model=RegistrationResponse)
async def register(request: CompleteRegistration):
    """
    Company registration endpoint
    
    Creates:
    1. Tenant record in master_db
    2. Company database (company_<id>_db)
    3. Owner user account
    
    For paid plans, returns Razorpay order details
    """
    result, error = await tenant_service.register_company(
        # Company details
        company_name=request.company_name,
        industry=request.industry,
        phone=request.phone,
        city=request.city,
        state=request.state,
        zip_code=request.zip_code,
        website=request.website,
        gst_number=request.gst_number,
        street=request.street,
        country=request.country,
        location=request.location,
        company_email=request.company_email,
        # Owner details
        owner_name=request.owner_name,
        owner_email=request.owner_email,
        owner_mobile=request.owner_mobile,
        owner_username=request.owner_username,
        owner_password=request.owner_password,
        owner_designation=request.owner_designation,
        # Plan
        plan_id=request.plan_id,
        billing_cycle=request.billing_cycle,
        user_count=request.user_count,
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return result


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: RefreshTokenRequest):
    """
    Refresh access token using refresh token
    """
    payload = verify_refresh_token(request.refresh_token)
    
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired refresh token"
        )
    
    result, error = await auth_service.refresh_tokens(payload)
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=error
        )
    
    return result


@router.post("/logout", response_model=MessageResponse)
async def logout(auth: AuthContext = Depends(get_current_user)):
    """
    Invalidate the current session.

    Records a logout timestamp on the user document so that any refresh
    token issued before this moment is treated as revoked.  The frontend
    is responsible for discarding its own tokens.
    """
    await auth_service.logout_user(
        user_id=auth.user_id,
        company_id=auth.company_id,
        is_super_admin=auth.is_super_admin,
        is_owner=auth.is_owner,
        is_seller=auth.is_seller,
        session_id=auth.session_id,
    )
    return {"message": "Logged out successfully", "success": True}


@router.post("/forgot-password", response_model=MessageResponse)
async def forgot_password(request: ForgotPasswordRequest):
    """
    Initiate password reset process
    
    Sends reset instructions to email
    """
    success, message = await auth_service.initiate_password_reset(request.email)
    
    # Always return success to prevent email enumeration
    return {"message": message, "success": True}


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(request: ResetPasswordRequest):
    """
    Reset password using token from email
    """
    # TODO: Implement password reset with token
    return {"message": "Password reset functionality coming soon", "success": False}


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Change password for authenticated user
    """
    # TODO: Implement password change
    return {"message": "Password change functionality coming soon", "success": False}


@router.get("/me")
async def get_current_user_info(auth: AuthContext = Depends(get_current_user)):
    """
    Get current authenticated user information
    """
    return {
        "user_id": auth.user_id,
        "username": auth.username,
        "full_name": auth.full_name,
        "role": auth.role,
        "permissions": auth.permissions,
        "company_id": auth.company_id,
        "is_super_admin": auth.is_super_admin,
        "is_owner": auth.is_owner
    }


@router.get("/me/permissions")
async def get_my_effective_permissions(auth: AuthContext = Depends(get_current_user)):
    """
    Return the caller's effective permissions — always freshly computed from the
    database.  Call this after the admin changes your permissions so the frontend
    can pick up the new set without requiring a full logout / login cycle.
    """
    if auth.is_super_admin or auth.is_owner:
        # Owners / super-admins bypass the DB lookup
        return {"permissions": auth.permissions, "override_permissions": False}

    perms, error = await auth_service.get_effective_permissions(
        auth.user_id, auth.company_id
    )
    if error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error
        )
    return {"permissions": perms, "override_permissions": True}


@router.post("/validate-field")
async def validate_field(field: str, value: str):
    """
    Validate individual registration field
    
    Used for real-time validation during registration
    """
    is_valid = True
    message = ""
    
    if field == "company_name":
        is_unique, error = await tenant_service.check_unique_fields(company_name=value)
        is_valid = is_unique
        message = error
    
    elif field == "email":
        is_unique, error = await tenant_service.check_unique_fields(email=value)
        is_valid = is_unique
        message = error
    
    elif field == "mobile":
        is_unique, error = await tenant_service.check_unique_fields(mobile=value)
        is_valid = is_unique
        message = error
    
    elif field == "username":
        is_unique, error = await tenant_service.check_unique_fields(username=value)
        is_valid = is_unique
        message = error
    
    return {
        "field": field,
        "is_valid": is_valid,
        "message": message
    }


@router.get("/plans")
async def get_available_plans(company_id: Optional[str] = None):
    """
    Get available subscription plans.

    Pass ?company_id=<id> to auto-filter out the Trial plan for companies
    that have already used their trial (has_used_trial = True).
    """
    # Determine whether to show the trial plan
    show_trial = True
    if company_id:
        master_db = get_master_db()
        tenant = await master_db.tenants.find_one({"company_id": company_id})
        if tenant and tenant.get("has_used_trial"):
            show_trial = False

    plans = await plan_service.list_plans(include_trial=show_trial)

    return {
        "plans": [
            {
                "id": plan["_id"],
                "name": plan["name"],
                "display_name": plan["display_name"],
                "description": plan.get("description", ""),
                # Per-user pricing fields
                "price_per_user_monthly": plan.get("price_per_user_monthly", plan.get("price_monthly", 0)),
                "price_per_user_yearly": plan.get("price_per_user_yearly", plan.get("price_yearly", 0)),
                "original_price_monthly": plan.get("original_price_monthly", 0),
                # Platform
                "has_desktop": plan.get("has_desktop", True),
                "has_mobile": plan.get("has_mobile", False),
                # Misc
                "is_trial": plan.get("is_trial_plan", False),
                "trial_days": plan.get("trial_days", 30),
                "is_popular": plan.get("is_popular", False),
            }
            for plan in plans
        ]
    }


@router.post("/renew/create-order")
async def create_renewal_order(data: RenewalOrderRequest):
    """
    Create a Razorpay payment order for an expired subscription.
    No authentication required — accessible to owners whose subscription has expired.
    Verifies that the subscription is actually expired before creating the order.
    """
    master_db = get_master_db()
    tenant = await master_db.tenants.find_one({"_id": data.tenant_id, "is_deleted": {"$ne": True}})
    if not tenant:
        tenant = await master_db.tenants.find_one({"company_id": data.tenant_id, "is_deleted": {"$ne": True}})
    if not tenant:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tenant not found")

    result, error = await payment_service.create_razorpay_order(
        tenant["_id"], data.plan_id, data.billing_cycle, data.user_count
    )
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return result


@router.post("/renew/verify-payment")
async def verify_renewal_payment(data: RenewalVerifyRequest):
    """
    Verify and complete a renewal payment.
    No authentication required — accessible to owners completing subscription renewal.
    """
    result, error = await payment_service.verify_payment(
        data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature
    )
    if error:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)
    return result


# ── Email Verification Endpoints ──────────────────────────────────────────────

class ResendVerificationRequest(BaseModel):
    email: str


@router.get("/verify-email")
async def verify_email(token: str, type: str = "tenant"):
    """
    Verify email address using the token from the verification link.

    Called when the user clicks the link in the verification email.
    Sets email_verified = True on the account.
    """
    success, message = await auth_service.verify_email(token=token, account_type=type)
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": message, "verified": False}
        )
    return {"verified": True, "message": message}


@router.post("/resend-verification")
async def resend_verification_email(data: ResendVerificationRequest):
    """
    Resend email-verification link to the given email address.

    Always returns success to avoid revealing whether an account exists.
    """
    success, message = await auth_service.resend_verification_email(data.email)
    return {"success": success, "message": message}