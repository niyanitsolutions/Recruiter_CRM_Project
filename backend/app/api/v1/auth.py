"""
Authentication API Endpoints
Login, registration, and token management
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, Request, status
from typing import Optional
from pydantic import BaseModel
import logging
import re

from app.core.limiter import limiter

from app.schemas.auth import (
    LoginRequest,
    RefreshTokenRequest,
    ForgotPasswordRequest,
    ForgotPasswordLookupRequest,
    ResetPasswordRequest,
    ChangePasswordRequest,
    VerifyPasswordRequest,
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
    billing_cycle: str = "monthly"  # monthly | quarterly | half_yearly | yearly
    user_count: int = 1
    # renewal | seat_upgrade | extend_duration | seat_upgrade_extend
    # | new_subscription (activate a different plan NOW)
    # | plan_change_queued (activate a different plan AFTER current expiry)
    payment_type: str = "renewal"
    extend_months: int = 0         # months to extend for extend_duration / seat_upgrade_extend


class RenewalVerifyRequest(BaseModel):
    razorpay_order_id: str
    razorpay_payment_id: str
    razorpay_signature: str


@router.post("/login")   # response_model omitted: returns LoginResponse OR TenantSelectionResponse
@limiter.limit("10/minute")
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
    # ── Maintenance mode check ────────────────────────────────────────────────
    from app.services.platform_settings_service import get_maintenance_settings
    _maint = await get_maintenance_settings()
    if _maint.get("maintenance_mode"):
        # Super admins can still log in when allow_super_admin_access is True.
        # We check the identity against super_admins before blocking.
        _allow_sa = _maint.get("allow_super_admin_access", True)
        _is_sa_login = False
        _maint_master_db = get_master_db()
        if _allow_sa:
            _ident_lower_maint = data.identifier.strip().lower()
            _sa_doc = await _maint_master_db.super_admins.find_one({
                "$or": [
                    {"username": _ident_lower_maint},
                    {"email": _ident_lower_maint},
                ],
                "is_deleted": False,
            })
            _is_sa_login = bool(_sa_doc)
        if not _is_sa_login:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={
                    "maintenance_mode": True,
                    "message": _maint.get(
                        "maintenance_message",
                        "The platform is currently under maintenance. Please try again later.",
                    ),
                },
            )

    # Block unverified trial registrants before attempting login
    _master_db = get_master_db()
    _ident = data.identifier.strip()
    _ident_lower = _ident.lower()
    _pending_reg = await _master_db.pending_registrations.find_one({
        "$or": [
            {"email": _ident_lower},
            {"username": _ident_lower},
            {"contact_number": _ident},
        ],
        "status": "pending_verification",
    })
    if _pending_reg:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={
                "email_not_verified": True,
                "email": _pending_reg.get("email", ""),
                "message": "Please verify your email before logging in. Check your inbox for the verification link.",
            },
        )

    result, error = await auth_service.login(
        data.identifier, data.password, request=request, company_code=data.company_code,
        force_login=data.force_login, device_fingerprint=data.device_fingerprint or "",
        latitude=data.latitude, longitude=data.longitude,
        accuracy=data.accuracy, timezone_str=data.timezone,
        browser=data.browser, os_name=data.os, device_type=data.device_type,
    )

    # A validation failure must never surface as a bare 200/null response —
    # guard on `not result` too, not just a truthy `error` string, so a denial
    # with an empty/falsy reason still produces a proper error response
    # instead of a body the frontend can't parse ("unexpected response").
    if error or not result:
        if not error:
            error = "Login failed. Please try again."
        if error.startswith("LOCATION_REQUIRED"):
            message = error.split("|", 1)[1] if "|" in error else "Location access is required by your organization to sign in."
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"location_required": True, "message": message},
            )
        if "ACTIVE_SESSION" in error:
            import json as _json
            _raw = error.split("|", 1)[1] if "|" in error else "{}"
            try:
                _session_info = _json.loads(_raw)
            except Exception:
                _session_info = {}
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "active_session": True,
                    "message": "This account is currently active on another device.",
                    "session_info": _session_info,
                    "company_id": _session_info.get("company_id") or data.company_code,
                },
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
        device_fingerprint=data.device_fingerprint or "",
        latitude=data.latitude,
        longitude=data.longitude,
        accuracy=data.accuracy, timezone_str=data.timezone,
        browser=data.browser, os_name=data.os, device_type=data.device_type,
    )

    # See /login above — never let a falsy error + no result fall through as
    # a bare 200/null response.
    if error or not result:
        if not error:
            error = "Login failed. Please try again."
        if error.startswith("LOCATION_REQUIRED"):
            message = error.split("|", 1)[1] if "|" in error else "Location access is required by your organization to sign in."
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail={"location_required": True, "message": message},
            )
        if "ACTIVE_SESSION" in error:
            import json as _json
            _raw = error.split("|", 1)[1] if "|" in error else "{}"
            try:
                _session_info = _json.loads(_raw)
            except Exception:
                _session_info = {}
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail={
                    "active_session": True,
                    "message": "This account is currently active on another device.",
                    "session_info": _session_info,
                    "company_id": _session_info.get("company_id") or data.company_id,
                },
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
    Trial onboarding — Step 1: initiate registration with email verification.

    Creates a pending_registration record and sends a verification email.
    Does NOT provision any tenant, database, or user yet — that happens when
    the user clicks the verification link (GET /auth/verify-email?token=...&type=trial).

    Validations enforced:
    - designation must be "Owner" or "Admin" (rejects "Select", empty, null)
    - password == confirm_password
    - password meets complexity rules (uppercase, lowercase, digit, ≥ configured min length)
    - contact_number must be a valid 10-digit Indian mobile
    - company_name, email, username, contact_number must be unique
    - no_website=true → website stored as null
    """
    # ── Platform controls: self-registration ─────────────────────────────────
    from app.services.platform_settings_service import is_self_registration_allowed, get_password_min_length
    if not await is_self_registration_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-registration is currently disabled. Please contact the platform administrator.",
        )

    # ── Password min length from platform settings ────────────────────────────
    _pw_min = await get_password_min_length()
    if len(request.password) < _pw_min:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {_pw_min} characters long.",
        )

    logger.info(
        "[TRIAL-SETUP ENDPOINT] Payload received | email=%s username=%s company=%s designation=%s",
        request.email, request.username, request.company_name, request.designation,
    )
    module = getattr(request, "module", "crm_hrm")
    crm_enabled = module in ("crm_only", "crm_hrm")
    hrm_enabled = module in ("hrm_only", "crm_hrm")

    import traceback as _tb
    try:
        result, error = await tenant_service.initiate_trial_registration(
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
            crm_enabled=crm_enabled,
            hrm_enabled=hrm_enabled,
            module=module,
        )
    except Exception as _exc:
        _trace = _tb.format_exc()
        logger.error("[TRIAL-SETUP ENDPOINT EXCEPTION] %s\n%s", _exc, _trace)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"[DEBUG] {type(_exc).__name__}: {_exc}",
        )

    if error:
        logger.warning("Trial registration initiation failed | reason=%s", error)
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=error)

    return result


@router.post("/register", response_model=RegistrationResponse)
@limiter.limit("5/minute")
async def register(request: Request, payload: CompleteRegistration):
    """
    Company registration endpoint

    Creates:
    1. Tenant record in master_db
    2. Company database (c_{company_id_no_hyphens})
    3. Owner user account

    For paid plans, returns Razorpay order details
    """
    # ── Platform controls: self-registration ─────────────────────────────────
    from app.services.platform_settings_service import is_self_registration_allowed as _is_reg_allowed, get_password_min_length as _get_pw_min
    if not await _is_reg_allowed():
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Self-registration is currently disabled. Please contact the platform administrator.",
        )
    _reg_pw_min = await _get_pw_min()
    if len(payload.owner_password) < _reg_pw_min:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Password must be at least {_reg_pw_min} characters long.",
        )

    result, error = await tenant_service.register_company(
        # Company details
        company_name=payload.company_name,
        industry=payload.industry,
        phone=payload.phone,
        city=payload.city,
        state=payload.state,
        zip_code=payload.zip_code,
        website=payload.website,
        gst_number=payload.gst_number,
        street=payload.street,
        country=payload.country,
        location=payload.location,
        company_email=payload.company_email,
        # Owner details
        owner_name=payload.owner_name,
        owner_email=payload.owner_email,
        owner_mobile=payload.owner_mobile,
        owner_username=payload.owner_username,
        owner_password=payload.owner_password,
        owner_designation=payload.owner_designation,
        # Plan
        plan_id=payload.plan_id,
        billing_cycle=payload.billing_cycle,
        user_count=payload.user_count,
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return result


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("20/minute")
async def refresh_token(request: Request, body: RefreshTokenRequest):
    """
    Refresh access token using refresh token
    """
    payload = verify_refresh_token(body.refresh_token)
    
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


async def _bg_password_reset_scoped(
    email: str, reset_scope: str = "auto", company_id: Optional[str] = None
) -> None:
    """
    Background wrapper for scoped password reset.
    Exceptions are logged here so they are visible in the app logger rather than
    being silently swallowed by Starlette.
    """
    try:
        logger.info(
            "[FORGOT-PWD] bg task STARTED email=%s scope=%s company=%s",
            email, reset_scope, company_id,
        )
        result = await auth_service.initiate_scoped_password_reset(email, reset_scope, company_id)
        logger.info("[FORGOT-PWD] bg task FINISHED email=%s result=%s", email, result)
    except Exception:
        logger.exception(
            "[FORGOT-PWD] UNHANDLED EXCEPTION in bg task email=%s", email
        )


@router.post("/forgot-password/lookup")
@limiter.limit("10/minute")
async def forgot_password_lookup(request: Request, body: ForgotPasswordLookupRequest):
    """
    Return the list of companies associated with an email address.
    Used by the frontend to decide whether to show scope-selection UI.
    Returns an empty list when the email belongs to no company accounts
    (super-admin accounts are excluded — their reset path is automatic).
    """
    email = str(body.email).lower().strip()
    logger.info("[FORGOT-PWD-LOOKUP] email=%s", email)
    companies = await auth_service.lookup_accounts_for_reset(email)
    return {"companies": companies}


@router.post("/forgot-password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def forgot_password(request: Request, body: ForgotPasswordRequest, background_tasks: BackgroundTasks):
    """
    Initiate password reset.

    Responds immediately (<1 s). Token generation and email delivery happen in the
    background — SMTP latency never blocks the HTTP response.
    Account existence is never revealed by this endpoint (anti-enumeration).

    reset_scope values:
      "auto"   — legacy / single-company callers; picks the first account found
      "single" — reset password for one specific company (company_id required)
      "all"    — reset password across every company the email belongs to
    """
    logger.info(
        "[FORGOT-PWD] endpoint hit — email=%s scope=%s company=%s",
        body.email, body.reset_scope, body.company_id,
    )
    background_tasks.add_task(
        _bg_password_reset_scoped, str(body.email), body.reset_scope, body.company_id
    )
    return {
        "message": "If an account exists with this email, reset instructions have been sent",
        "success": True,
    }


@router.post("/reset-password", response_model=MessageResponse)
@limiter.limit("5/minute")
async def reset_password(request: Request, payload: ResetPasswordRequest):
    """
    Reset password using the token from the reset email.

    Lookup order:
    1. master_db.password_reset_tokens  — new centralised system (supports scope)
    2. master_db.super_admins           — backward compat
    3. master_db.tenants.owner          — backward compat
    4. company_db.users (all tenants)   — backward compat
    """
    from app.core.database import get_master_db as _get_master_db, DatabaseManager as _DB
    from app.core.security import hash_password
    from app.models.master.global_user import sync_global_password as _sync_global
    from datetime import datetime, timezone

    master_db = _get_master_db()
    now = datetime.now(timezone.utc)
    token = payload.token
    new_password = payload.new_password
    new_hash = hash_password(new_password)

    # ── 1. Centralised password_reset_tokens (new scoped system) ─────────────
    reset_record = await master_db.password_reset_tokens.find_one({
        "_id": token,
        "expires_at": {"$gt": now},
    })

    if reset_record:
        _email = reset_record["email"]
        _scope = reset_record.get("reset_scope", "single")
        _cid = reset_record.get("company_id")
        logger.info(
            "[RESET] centralised token found — email=%s scope=%s company=%s",
            _email, _scope, _cid,
        )

        async def _update_company_password(cid: str) -> bool:
            """Update password in one company's DB (owner + users). Returns True on success."""
            try:
                t = await master_db.tenants.find_one(
                    {"company_id": cid, "is_deleted": {"$ne": True}}
                )
                owner = t.get("owner", {}) if t else {}
                is_owner = owner.get("email", "").lower() == _email.lower()

                if is_owner:
                    await master_db.tenants.update_one(
                        {"company_id": cid},
                        {"$set": {
                            "owner.password_hash": new_hash,
                            "owner.logout_at": now,
                            "owner.active_session_token": None,
                            "owner.active_session_at": None,
                        }},
                    )
                    owner_id = owner.get("_id")
                    if owner_id:
                        await master_db.user_active_sessions.delete_one({"_id": str(owner_id)})

                cdb = await _DB.resolve_and_get_company_db(cid)
                res = await cdb.users.update_one(
                    {"email": _email, "is_deleted": {"$ne": True}},
                    {"$set": {
                        "password_hash": new_hash,
                        "must_change_password": False,
                        "password_changed_at": now,
                        "logout_at": now,
                        "active_session_token": None,
                        "active_session_at": None,
                        "updated_at": now,
                    }},
                )
                # Revoke company user session
                u = await cdb.users.find_one({"email": _email})
                if u:
                    await master_db.user_active_sessions.delete_one({"_id": str(u["_id"])})

                # Verify hash was actually written
                updated = await cdb.users.find_one({"email": _email})
                if updated and updated.get("password_hash") != new_hash:
                    logger.error("[RESET] hash verification FAILED company=%s email=%s", cid, _email)
                    return False

                return res.modified_count > 0 or is_owner
            except Exception as exc:
                logger.error("[RESET] company update error company=%s | %s", cid, exc, exc_info=True)
                return False

        if _scope == "all":
            accounts = await auth_service.lookup_accounts_for_reset(_email)
            if not accounts:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="No accounts found for this reset token.",
                )
            failures = []
            for acct in accounts:
                ok = await _update_company_password(acct["company_id"])
                if not ok:
                    failures.append(acct["company_id"])
            if failures:
                logger.error("[RESET] all-scope: failed companies=%s email=%s", failures, _email)
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Password update failed for one or more companies. Please try again.",
                )
            await master_db.password_reset_tokens.delete_one({"_id": token})
            # Sync the new hash into global_users so the O(1) no-company-code
            # login path immediately uses the updated credentials.
            await _sync_global(master_db, email=_email, new_password_hash=new_hash)
            logger.info(
                "[RESET] all-scope SUCCESS email=%s companies=%d", _email, len(accounts)
            )
            return {
                "message": "Password reset successfully for all companies. Please log in.",
                "success": True,
            }

        else:  # single
            if not _cid:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Invalid reset token — missing company information.",
                )
            ok = await _update_company_password(_cid)
            if not ok:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Account not found or password update failed.",
                )
            await master_db.password_reset_tokens.delete_one({"_id": token})
            # Sync the new hash into global_users so the O(1) no-company-code
            # login path immediately uses the updated credentials.
            await _sync_global(master_db, email=_email, new_password_hash=new_hash)
            logger.info("[RESET] single-scope SUCCESS email=%s company=%s", _email, _cid)
            return {"message": "Password reset successfully. Please log in.", "success": True}

    # ── 2. Backward compat: super_admins.reset_token ──────────────────────────
    sa = await master_db.super_admins.find_one({
        "reset_token": token,
        "reset_token_expiry": {"$gt": now},
        "is_deleted": False,
    })
    if sa:
        sa_id = sa["_id"]
        await master_db.super_admins.update_one(
            {"_id": sa_id},
            {"$set": {
                "password_hash": new_hash,
                "reset_token": None,
                "reset_token_expiry": None,
                "logout_at": now,
                "updated_at": now,
            }},
        )
        await master_db.user_active_sessions.delete_one({"_id": str(sa_id)})
        return {"message": "Password reset successfully. Please log in.", "success": True}

    # ── 3. Backward compat: tenant owner.reset_token ──────────────────────────
    tenant = await master_db.tenants.find_one({
        "owner.reset_token": token,
        "owner.reset_token_expiry": {"$gt": now},
        "is_deleted": False,
    })
    if tenant:
        await master_db.tenants.update_one(
            {"_id": tenant["_id"]},
            {"$set": {
                "owner.password_hash": new_hash,
                "owner.reset_token": None,
                "owner.reset_token_expiry": None,
                "owner.logout_at": now,
                "owner.active_session_token": None,
                "owner.active_session_at": None,
            }},
        )
        owner_id = tenant.get("owner", {}).get("_id")
        cid = tenant.get("company_id")
        if cid and owner_id:
            # Sync to company_db.users so the auth refresh path also sees the new hash
            cdb = await _DB.resolve_and_get_company_db(cid)
            await cdb.users.update_one(
                {"_id": owner_id},
                {"$set": {
                    "password_hash": new_hash,
                    "reset_token": None,
                    "reset_token_expiry": None,
                    "logout_at": now,
                    "active_session_token": None,
                    "active_session_at": None,
                    "updated_at": now,
                }},
            )
            await master_db.user_active_sessions.delete_one({"_id": str(owner_id)})
        # Sync to global_users so the O(1) no-company-code login path uses the new hash
        _owner_email = tenant.get("owner", {}).get("email", "")
        if _owner_email:
            await _sync_global(master_db, email=_owner_email, new_password_hash=new_hash)
        return {"message": "Password reset successfully. Please log in.", "success": True}

    # ── 4. Backward compat: company user reset_token (scan all tenants) ───────
    async for t in master_db.tenants.find({"is_deleted": {"$ne": True}}):
        cid = t.get("company_id", "")
        if not cid:
            continue
        cdb = await _DB.resolve_and_get_company_db(cid)
        user = await cdb.users.find_one({
            "reset_token": token,
            "reset_token_expiry": {"$gt": now},
            "is_deleted": False,
        })
        if user:
            user_id = user["_id"]
            await cdb.users.update_one(
                {"_id": user_id},
                {"$set": {
                    "password_hash": new_hash,
                    "reset_token": None,
                    "reset_token_expiry": None,
                    "must_change_password": False,
                    "password_changed_at": now,
                    "logout_at": now,
                    "active_session_token": None,
                    "active_session_at": None,
                    "updated_at": now,
                }},
            )
            await master_db.user_active_sessions.delete_one({"_id": str(user_id)})
            # Sync to global_users so the O(1) no-company-code login path uses the new hash
            _user_email = user.get("email", "")
            if _user_email:
                await _sync_global(master_db, email=_user_email, new_password_hash=new_hash)
            return {"message": "Password reset successfully. Please log in.", "success": True}

    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Invalid or expired reset token",
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
        _new_hash = hash_password(new_password)
        await master_db.tenants.update_one(
            {"company_id": auth.company_id},
            {"$set": {"owner.password_hash": _new_hash}}
        )
        # Sync password + clear must_change_password in company_db.users
        company_db = _get_company_db(auth.company_id)
        await company_db.users.update_one(
            {"_id": auth.user_id},
            {"$set": {
                "password_hash": _new_hash,
                "must_change_password": False,
                "password_changed_at": now,
                "updated_at": now,
            }}
        )
        # Sync to global_users so no-company-code login uses the new hash immediately
        from app.models.master.global_user import sync_global_password as _sync_global_pw
        _owner_email = tenant.get("owner", {}).get("email", "")
        if _owner_email:
            await _sync_global_pw(master_db, email=_owner_email, new_password_hash=_new_hash)
        return {"message": "Password changed successfully.", "success": True}

    if auth.company_id:
        company_db = _get_company_db(auth.company_id)
        user = await company_db.users.find_one({"_id": auth.user_id, "is_deleted": False})
        if not user or not verify_password(current_password, user.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Current password is incorrect")
        _new_hash = hash_password(new_password)
        await company_db.users.update_one(
            {"_id": auth.user_id},
            {"$set": {
                "password_hash": _new_hash,
                "must_change_password": False,
                "password_changed_at": now,
                "updated_at": now,
            }}
        )
        # Sync to global_users so no-company-code login uses the new hash immediately
        from app.models.master.global_user import sync_global_password as _sync_global_pw
        _user_email = user.get("email", "")
        if _user_email:
            await _sync_global_pw(_get_master_db(), email=_user_email, new_password_hash=_new_hash)
        return {"message": "Password changed successfully.", "success": True}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to change password")


@router.post("/verify-password", response_model=MessageResponse)
async def verify_password_endpoint(
    request: VerifyPasswordRequest,
    auth: AuthContext = Depends(get_current_user)
):
    """
    Verify the authenticated user's current password without changing it.
    Used to unlock a locked session (Task 4 — session lock/unlock by password).
    """
    from app.core.database import get_master_db as _get_master_db, get_company_db as _get_company_db
    from app.core.security import verify_password

    password = request.password

    if auth.is_super_admin:
        master_db = _get_master_db()
        sa = await master_db.super_admins.find_one({"_id": auth.user_id, "is_deleted": False})
        if not sa or not verify_password(password, sa.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
        return {"message": "Password verified.", "success": True}

    if auth.is_owner and auth.company_id:
        master_db = _get_master_db()
        tenant = await master_db.tenants.find_one({"company_id": auth.company_id})
        if not tenant or not verify_password(password, tenant.get("owner", {}).get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
        return {"message": "Password verified.", "success": True}

    if auth.company_id:
        company_db = _get_company_db(auth.company_id)
        user = await company_db.users.find_one({"_id": auth.user_id, "is_deleted": False})
        if not user or not verify_password(password, user.get("password_hash", "")):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Incorrect password")
        return {"message": "Password verified.", "success": True}

    raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Unable to verify password")


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
        extend_months=data.extend_months,
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

    For type=trial: validates the token, provisions the tenant + DB + user, and
    returns workspace details (company_name, email, trial_days).

    For type=tenant (default): sets email_verified=True on the existing tenant record.
    """
    logger.info(
        "[VERIFY-EMAIL] Received | type=%s token_prefix=%s...",
        type, token[:8] if len(token) >= 8 else token,
    )

    if type == "trial":
        try:
            result, error = await tenant_service.verify_and_provision_trial(token)
        except Exception as _exc:
            logger.error("[VERIFY-EMAIL] Unexpected error in verify_and_provision_trial | error=%s", _exc, exc_info=True)
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"message": "Verification failed due to a server error. Please try again.", "verified": False},
            )
        if error:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail={"message": error, "verified": False},
            )
        return result

    success, message = await auth_service.verify_email(token=token, account_type=type)
    if not success:
        # Fallback: maybe the email client dropped &type=trial; try the trial path
        try:
            trial_result, trial_error = await tenant_service.verify_and_provision_trial(token)
            if not trial_error:
                logger.info("[VERIFY-EMAIL] Tenant path failed but trial path succeeded — type param likely missing from URL")
                return trial_result
        except Exception:
            pass
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail={"message": message, "verified": False}
        )
    return {"verified": True, "message": message}


@router.post("/resend-verification")
async def resend_verification_email(data: ResendVerificationRequest):
    """
    Resend email-verification link to the given email address.

    Checks pending_registrations first (trial flow); falls back to tenant records.
    Always returns success to avoid revealing whether an account exists.
    """
    _master_db = get_master_db()
    _email = data.email.lower().strip()

    # Check if this is a pending trial registration (also handles expired tokens)
    pending = await _master_db.pending_registrations.find_one({
        "email": _email,
        "status": {"$in": ["pending_verification", "expired"]},
    })
    if pending:
        await tenant_service.resend_trial_verification(data.email)
        return {"success": True, "message": "If an unverified registration exists, a new email has been sent."}

    # Existing tenant email verification resend
    success, message = await auth_service.resend_verification_email(data.email)
    return {"success": success, "message": message}


@router.get("/login-activity")
async def get_login_activity(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    auth: AuthContext = Depends(get_current_user),
):
    """Return paginated login activity logs for the current tenant."""
    from datetime import timezone
    from app.core.database import get_company_db as _get_company_db
    company_db = _get_company_db(auth.company_id)
    skip = (page - 1) * page_size
    cursor = company_db.login_logs.find({}).sort("login_time", -1).skip(skip).limit(page_size)
    logs = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        if doc.get("login_time"):
            dt = doc["login_time"]
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            doc["login_time"] = dt.isoformat()
        logs.append(doc)
    total = await company_db.login_logs.count_documents({})
    return {"data": logs, "total": total, "page": page, "page_size": page_size}


@router.get("/login-summary")
async def get_login_summary(
    auth: AuthContext = Depends(get_current_user),
):
    """
    Per-user aggregated login summary for the enterprise dashboard.
    Groups login_logs by user, computes today / week / month counts,
    last login time, last IP, and last device.
    """
    from datetime import datetime, timezone, timedelta
    from app.core.database import get_company_db as _get_company_db
    from app.core.database import get_master_db as _get_master_db
    from app.services.presence_service import get_online_user_ids

    company_db = _get_company_db(auth.company_id)
    now = datetime.now(timezone.utc)
    # Resolve tenant timezone for day-boundary calculations
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    _settings_doc = await company_db["company_settings"].find_one({}) or {}
    _tz_name = _settings_doc.get("timezone", "UTC")
    try:
        _tz = ZoneInfo(_tz_name)
    except (ZoneInfoNotFoundError, Exception):
        _tz = timezone.utc
    local_now = now.astimezone(_tz)
    today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_local.astimezone(timezone.utc).replace(tzinfo=None)
    week_start_utc  = today_start_utc - timedelta(days=6)
    month_start_utc = today_start_utc - timedelta(days=29)

    pipeline = [
        {"$sort": {"login_time": -1}},
        {"$group": {
            "_id": "$user_id",
            "full_name":    {"$first": "$full_name"},
            "role":         {"$first": "$role"},
            "last_login":   {"$first": "$login_time"},
            "last_ip":      {"$first": "$ip_address"},
            "last_device":  {"$first": "$device"},
            "total_all":    {"$sum": 1},
            "total_today":  {"$sum": {"$cond": [{"$gte": ["$login_time", today_start_utc]}, 1, 0]}},
            "total_week":   {"$sum": {"$cond": [{"$gte": ["$login_time", week_start_utc]},  1, 0]}},
            "total_month":  {"$sum": {"$cond": [{"$gte": ["$login_time", month_start_utc]}, 1, 0]}},
        }},
        {"$sort": {"last_login": -1}},
    ]

    def _iso(dt):
        if not dt:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    rows = []
    async for doc in company_db.login_logs.aggregate(pipeline):
        # Check if user has an active session in master_db
        rows.append({
            "user_id":     doc["_id"],
            "full_name":   doc.get("full_name") or "Unknown",
            "role":        doc.get("role") or "—",
            "last_login":  _iso(doc.get("last_login")),
            "last_ip":     doc.get("last_ip") or "—",
            "last_device": doc.get("last_device") or "—",
            "total_all":   doc.get("total_all", 0),
            "total_today": doc.get("total_today", 0),
            "total_week":  doc.get("total_week", 0),
            "total_month": doc.get("total_month", 0),
        })

    master_db = _get_master_db()
    user_ids = [r["user_id"] for r in rows]

    # Last Login must always agree with what the Users page shows — that page
    # reads `users.last_login` (or the tenant owner's `owner.last_login`, which
    # is updated separately and never lands in `company_db.users`) directly, so
    # override the login_logs-derived value here with those same canonical
    # fields wherever available, keeping the login_logs-derived value only as a
    # fallback (e.g. a user deleted after logging in).
    canonical_last_login = {}
    async for u in company_db.users.find(
        {"_id": {"$in": user_ids}}, {"_id": 1, "last_login": 1}
    ):
        canonical_last_login[u["_id"]] = _iso(u.get("last_login"))

    tenant_doc = await master_db.tenants.find_one(
        {"company_id": auth.company_id}, {"owner": 1}
    )
    owner = (tenant_doc or {}).get("owner") or {}
    owner_id = str(owner.get("_id", ""))
    if owner_id:
        canonical_last_login[owner_id] = _iso(owner.get("last_login"))

    for row in rows:
        canonical = canonical_last_login.get(row["user_id"])
        if canonical is not None:
            row["last_login"] = canonical

    # Online status must also agree everywhere — same "truly active" session
    # definition used by the dashboard's Online Users KPI (presence_service).
    active_sessions = await get_online_user_ids(auth.company_id)

    for row in rows:
        row["is_active"] = row["user_id"] in active_sessions

    return {"data": rows, "total": len(rows)}


@router.get("/login-analytics")
async def get_login_analytics(
    days: int = 30,
    auth: AuthContext = Depends(get_current_user),
):
    """
    KPI cards + chart data for the audit analytics dashboard.
    Returns: today counts, unique users, hourly distribution,
    daily trend, role breakdown.
    """
    from datetime import datetime, timezone, timedelta
    from app.core.database import get_company_db as _get_company_db
    from app.core.database import get_master_db as _get_master_db

    company_db = _get_company_db(auth.company_id)
    master_db  = _get_master_db()
    now = datetime.now(timezone.utc)

    # Resolve tenant timezone for day-boundary calculations
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
    _settings_doc = await company_db["company_settings"].find_one({}) or {}
    _tz_name = _settings_doc.get("timezone", "UTC")
    try:
        _tz = ZoneInfo(_tz_name)
    except (ZoneInfoNotFoundError, Exception):
        _tz = timezone.utc
        _tz_name = "UTC"  # keep in sync with `_tz` — also passed to Mongo as the aggregation timezone below
    local_now = now.astimezone(_tz)
    today_start_local = local_now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_start_utc = today_start_local.astimezone(timezone.utc).replace(tzinfo=None)
    range_start_utc = today_start_utc - timedelta(days=days - 1)

    base_match = {"login_time": {"$gte": range_start_utc}}
    today_match = {"login_time": {"$gte": today_start_utc}}

    # KPI: total today
    total_today = await company_db.login_logs.count_documents(today_match)

    # KPI: unique users today
    unique_today_pipeline = [
        {"$match": today_match},
        {"$group": {"_id": "$user_id"}},
        {"$count": "count"},
    ]
    unique_today = 0
    async for doc in company_db.login_logs.aggregate(unique_today_pipeline):
        unique_today = doc.get("count", 0)

    # KPI: total in range
    total_range = await company_db.login_logs.count_documents(base_match)

    # KPI: active sessions
    active_sessions = await master_db.sessions.count_documents(
        {"company_id": auth.company_id, "is_active": True}
    )

    # Daily trend — bucketed in the tenant's configured timezone (MongoDB's
    # date aggregation operators accept an IANA zone name directly), not a
    # hardcoded IST offset, so this is correct for every tenant.
    daily_pipeline = [
        {"$match": base_match},
        {"$group": {
            "_id": {
                "y": {"$year":       {"date": "$login_time", "timezone": _tz_name}},
                "m": {"$month":      {"date": "$login_time", "timezone": _tz_name}},
                "d": {"$dayOfMonth": {"date": "$login_time", "timezone": _tz_name}},
            },
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id.y": 1, "_id.m": 1, "_id.d": 1}},
    ]
    daily_trend = []
    async for doc in company_db.login_logs.aggregate(daily_pipeline):
        d = doc["_id"]
        daily_trend.append({
            "date": f"{d['y']}-{d['m']:02d}-{d['d']:02d}",
            "count": doc["count"],
        })

    # Hourly distribution, bucketed in the tenant's configured timezone
    hourly_pipeline = [
        {"$match": base_match},
        {"$group": {
            "_id": {"$hour": {"date": "$login_time", "timezone": _tz_name}},
            "count": {"$sum": 1},
        }},
        {"$sort": {"_id": 1}},
    ]
    hourly = [{"hour": h, "count": 0} for h in range(24)]
    async for doc in company_db.login_logs.aggregate(hourly_pipeline):
        h = doc["_id"]
        if 0 <= h < 24:
            hourly[h]["count"] = doc["count"]

    # Role breakdown
    role_pipeline = [
        {"$match": base_match},
        {"$group": {"_id": "$role", "count": {"$sum": 1}}},
        {"$sort": {"count": -1}},
    ]
    role_breakdown = []
    async for doc in company_db.login_logs.aggregate(role_pipeline):
        role_breakdown.append({"role": doc["_id"] or "unknown", "count": doc["count"]})

    return {
        "kpi": {
            "total_today":     total_today,
            "unique_today":    unique_today,
            "active_sessions": active_sessions,
            "total_range":     total_range,
            "days":            days,
        },
        "daily_trend":    daily_trend,
        "hourly_dist":    hourly,
        "role_breakdown": role_breakdown,
    }


@router.get("/login-history-by-user/{user_id}")
async def get_login_history_by_user(
    user_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    auth: AuthContext = Depends(get_current_user),
):
    """Return paginated login history for a specific user (newest first)."""
    from datetime import timezone
    from app.core.database import get_company_db as _get_company_db

    company_db = _get_company_db(auth.company_id)
    query = {"user_id": user_id}
    skip = (page - 1) * page_size
    total = await company_db.login_logs.count_documents(query)
    cursor = company_db.login_logs.find(query).sort("login_time", -1).skip(skip).limit(page_size)
    logs = []
    async for doc in cursor:
        doc["id"] = str(doc.pop("_id", ""))
        if doc.get("login_time"):
            dt = doc["login_time"]
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            doc["login_time"] = dt.isoformat()
        logs.append(doc)
    return {
        "data": logs,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size,
    }