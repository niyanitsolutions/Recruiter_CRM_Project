"""
Authentication API Endpoints
Login, registration, and token management
"""

from fastapi import APIRouter, BackgroundTasks, HTTPException, status, Depends, Request
from typing import Optional
from pydantic import BaseModel, Field
import logging
import re

from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    MessageResponse,
    TokenResponse,
    TenantLoginRequest,
)
from app.schemas.tenant import CompleteRegistration, RegistrationResponse, TrialSetupRequest, TrialSetupResponse
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
    payment_type: str = "renewal"  # renewal | seat_upgrade


class RenewalVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/login")   # response_model omitted: returns LoginResponse OR TenantSelectionResponse
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
    result, error = await auth_service.login(
        data.identifier, data.password, request=request, company_code=data.company_code,
        force_login=data.force_login,
    )

    if error:
        if "ACTIVE_SESSION" in error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"active_session": True, "message": error.split("|", 1)[1]},
            )
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


@router.post("/login-with-tenant")
async def login_with_tenant(data: TenantLoginRequest, request: Request):
    """
    Second-step login after tenant selection.

    Called when /auth/login returns tenant_selection_required=true.
    The user picks a company from the list and re-submits credentials
    with the chosen company_id.  Returns the same token response as /login.
    """
    result, error = await auth_service.login_with_tenant(
        identifier=data.identifier,
        password=data.password,
        company_id=data.company_id,
        request=request,
        force_login=data.force_login,
    )

    if error:
        if "ACTIVE_SESSION" in error:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"active_session": True, "message": error.split("|", 1)[1]},
            )
        if "SUBSCRIPTION_EXPIRED" in error:
            is_owner = error.startswith("SUBSCRIPTION_EXPIRED_OWNER")
            parts = error.split("|", 2)
            plan_expiry_str = parts[1] if len(parts) > 1 and parts[1] != "None" else None
            message = parts[2] if len(parts) > 2 else "Your subscription has expired."
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail={
                    "subscription_expired": True,
                    "is_owner": is_owner,
                    "user_type": "tenant",
                    "message": message,
                    "plan_expiry": plan_expiry_str,
                    "company_id": data.company_id,
                },
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error)

    return result


@router.post("/trial-setup", response_model=TrialSetupResponse)
async def trial_setup(request: TrialSetupRequest):
    """
    Single-page trial onboarding.

    Creates a company + first user (Owner or Admin) in one call.
    No plan selection required — automatically assigns the active trial plan.

    Validations enforced:
    - designation must be "Owner" or "Admin" (rejects "Select", empty, null)
    - password == confirm_password
    - password meets complexity rules (uppercase, lowercase, digit, ≥8 chars)
    - contact_number must be a valid 10-digit Indian mobile
    - company_name, email, username, contact_number must be unique
    - no_website=true → website stored as null
    """
    result, error = await tenant_service.setup_trial(
        company_name=request.company_name,
        company_contact=request.company_contact,
        website=request.website,
        no_website=request.no_website,
        person_name=request.person_name,
        username=request.username,
        email=str(request.email),
        contact_number=request.contact_number,
        password=request.password,
        designation=request.designation,
    )

    if error:
        logger.warning("Trial setup failed | reason=%s", error)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

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


class ForceLogoutAndLoginRequest(BaseModel):
    identifier: str = Field(..., min_length=3, description="Username, email, or mobile number")
    password: str   = Field(..., min_length=1)
    company_code: Optional[str] = None


@router.post("/force-logout-and-login")
async def force_logout_and_login(data: ForceLogoutAndLoginRequest, request: Request):
    """
    Force-logout any existing session and immediately log in on the current device.

    Called when the user clicks "Logout Other Device and Continue" on the
    concurrent-session conflict modal.  Internally identical to a normal login
    with force_login=True — verifies credentials, clears the existing
    active_session_token on the user document, then issues fresh tokens.
    """
    result, error = await auth_service.login(
        data.identifier, data.password,
        request=request,
        company_code=data.company_code,
        force_login=True,
    )

    if error:
        if "ACTIVE_SESSION" in error:
            # Should not normally reach here with force_login=True, but guard anyway
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={"active_session": True, "message": error.split("|", 1)[1]},
            )
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=error)

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
async def forgot_password(request: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    """
    Initiate password reset process.

    Responds immediately (<1 s). Token generation and email delivery happen in the
    background so SMTP latency never delays the HTTP response.
    Account existence is never revealed (anti-enumeration).
    """
    background_tasks.add_task(auth_service.initiate_password_reset, request.email)
    return {
        "message": "If an account exists with this email, reset instructions have been sent",
        "success": True,
    }


@router.post("/reset-password", response_model=MessageResponse)
async def reset_password(request: ResetPasswordRequest):
    """
    Reset password using token from email.
    """
    from app.core.database import get_master_db as _get_master_db
    from app.core.security import hash_password
    from datetime import datetime, timezone

    master_db = _get_master_db()
    now = datetime.now(timezone.utc)
    token = request.token
    new_password = request.new_password

    # Check super_admins
    sa = await master_db.super_admins.find_one({
        "reset_token": token,
        "reset_token_expiry": {"$gt": now},
        "is_deleted": False,
    })
    if sa:
        await master_db.super_admins.update_one(
            {"_id": sa["_id"]},
            {"$set": {
                "password_hash": hash_password(new_password),
                "reset_token": None,
                "reset_token_expiry": None,
                "updated_at": now,
            }}
        )
        return {"message": "Password reset successfully. Please log in.", "success": True}

    # Check tenant owner
    tenant = await master_db.tenants.find_one({
        "owner.reset_token": token,
        "owner.reset_token_expiry": {"$gt": now},
        "is_deleted": False,
    })
    if tenant:
        await master_db.tenants.update_one(
            {"_id": tenant["_id"]},
            {"$set": {
                "owner.password_hash": hash_password(new_password),
                "owner.reset_token": None,
                "owner.reset_token_expiry": None,
            }}
        )
        return {"message": "Password reset successfully. Please log in.", "success": True}

    # Check company users
    from app.core.database import get_company_db as _get_company_db
    tenants_cursor = master_db.tenants.find({"is_deleted": {"$ne": True}})
    async for t in tenants_cursor:
        company_db = _get_company_db(t["company_id"])
        user = await company_db.users.find_one({
            "reset_token": token,
            "reset_token_expiry": {"$gt": now},
            "is_deleted": False,
        })
        if user:
            await company_db.users.update_one(
                {"_id": user["_id"]},
                {"$set": {
                    "password_hash": hash_password(new_password),
                    "reset_token": None,
                    "reset_token_expiry": None,
                    # Clear the forced-change flag so the user is not redirected
                    # to /change-password again after using the forgot-password link.
                    "must_change_password": False,
                    "password_changed_at": now,
                    "updated_at": now,
                }}
            )
            return {"message": "Password reset successfully. Please log in.", "success": True}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset token"
    )


@router.post("/change-password", response_model=MessageResponse)
async def change_password(
    request: ChangePasswordRequest,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Change password for authenticated user.
    """
    from app.core.database import get_master_db as _get_master_db, get_company_db as _get_company_db
    from app.core.security import verify_password, hash_password
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    current_password = request.current_password
    new_password = request.new_password

    if auth.is_super_admin:
        master_db = _get_master_db()
        sa = await master_db.super_admins.find_one({"_id": auth.user_id, "is_deleted": False})
        if not sa or not verify_password(current_password, sa.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        await master_db.super_admins.update_one(
            {"_id": auth.user_id},
            {"$set": {"password_hash": hash_password(new_password), "updated_at": now}}
        )
        return {"message": "Password changed successfully.", "success": True}

    if auth.is_owner and auth.company_id:
        master_db = _get_master_db()
        tenant = await master_db.tenants.find_one({"company_id": auth.company_id})
        if not tenant or not verify_password(current_password, tenant.get("owner", {}).get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        await master_db.tenants.update_one(
            {"company_id": auth.company_id},
            {"$set": {"owner.password_hash": hash_password(new_password)}}
        )
        # Also clear must_change_password in company_db if the owner doc exists there
        company_db = _get_company_db(auth.company_id)
        await company_db.users.update_one(
            {"_id": auth.user_id},
            {"$set": {"must_change_password": False, "password_changed_at": now}}
        )
        return {"message": "Password changed successfully.", "success": True}

    if auth.company_id:
        company_db = _get_company_db(auth.company_id)
        user = await company_db.users.find_one({"_id": auth.user_id, "is_deleted": False})
        if not user or not verify_password(current_password, user.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        await company_db.users.update_one(
            {"_id": auth.user_id},
            {"$set": {
                "password_hash": hash_password(new_password),
                "must_change_password": False,
                "password_changed_at": now,
                "updated_at": now,
            }}
        )
        return {"message": "Password changed successfully.", "success": True}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to change password")


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
        return {"permissions": auth.permissions}

    perms, error = await auth_service.get_effective_permissions(
        auth.user_id, auth.company_id
    )
    if error:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=error
        )
    return {"permissions": perms}


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
        tenant["_id"], data.plan_id, data.billing_cycle, data.user_count,
        payment_type=data.payment_type,
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


@router.get("/login-activity")
async def get_login_activity(
    page: int = 1,
    page_size: int = 50,
    auth: AuthContext = Depends(get_current_user),
):
    """Return paginated login activity logs for the current tenant."""
    from app.core.database import get_company_db as _get_company_db
    company_db = _get_company_db(auth.company_id)
    skip = (page - 1) * page_size
    cursor = company_db.login_logs.find({}).sort("login_time", -1).skip(skip).limit(page_size)
    logs = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        if doc.get("login_time"):
            doc["login_time"] = doc["login_time"].isoformat()
        logs.append(doc)
    total = await company_db.login_logs.count_documents({})
    return {"data": logs, "total": total, "page": page, "page_size": page_size}