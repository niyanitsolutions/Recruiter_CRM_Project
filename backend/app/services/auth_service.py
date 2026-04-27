"""
Authentication Service
Handles login, registration, and token management
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import logging
import uuid

from app.core.database import get_master_db, get_company_db
from app.core.security import (
    verify_password,
    create_access_token,
    create_refresh_token,
    generate_reset_token
)
from app.core.config import settings
from app.core.tenant_resolver import tenant_resolver
from app.models.master.tenant import TenantStatus
from app.models.master.super_admin import SuperAdminStatus
from app.models.company.user import UserStatus, ROLE_PERMISSIONS
from app.models.company.role import SystemRole, ROLE_DEFAULT_PERMISSIONS

logger = logging.getLogger(__name__)

async def _resolve_effective_permissions(user: dict, role_doc: Optional[dict], db=None) -> list:
    """
    Single source of truth for computing effective permissions.

    Priority order:
      1. override_permissions == True  → user.permissions (individual override, even if [])
      2. Role document in DB           → role_doc.permissions (role-based, always fresh)
      3. Hardcoded ROLE_PERMISSIONS    → last-resort fallback

    After the base permissions are resolved:
      4. If user has assigned_departments → merge permissions from all those role docs (union)
      5. Subtract any restricted_modules → remove all "module:*" permissions for each module

    dashboard:view is always preserved so navigation never breaks.
    This function is used at both login and token-refresh time.
    """
    # ── Step 1-3: resolve base permissions ────────────────────────────────────

    # SAFEGUARD: owners MUST NOT use override_permissions.
    # The is_owner flag provides full API bypass via require_permissions(); the
    # JWT permissions list only drives the frontend sidebar — which also checks
    # isOwner independently.  Honouring override_permissions for an owner could
    # silently restrict their JWT to a partial list, confusing the UI.
    is_owner = bool(user.get("is_owner"))

    if bool(user.get("override_permissions")) and not is_owner:
        # Individual override: use exactly what's stored.
        # SAFETY: guarantee dashboard:view is always present so the sidebar
        # never ends up completely empty even if an empty list was stored.
        stored = set(user.get("permissions") or [])
        perms  = stored if stored else set()
    elif role_doc and role_doc.get("permissions"):
        # Role document in DB — base permission set
        perms = set(role_doc["permissions"])
        # For system roles: merge with the current code-defined defaults so that
        # new permissions added to ROLE_DEFAULT_PERMISSIONS take effect immediately
        # without requiring the DB role doc to be re-initialized.
        # This is additive only — permissions in the role doc are always preserved.
        role_name = user.get("role", "")
        try:
            system_role_enum = SystemRole(role_name)
            code_defaults = {p.value for p in ROLE_DEFAULT_PERMISSIONS.get(system_role_enum, [])}
            perms = perms | code_defaults
        except ValueError:
            pass  # custom role — use role_doc as the sole source
    else:
        # Hardcoded fallback (role not in DB yet, or role has no permissions set)
        role_name = user.get("role", "")
        perms = set(ROLE_PERMISSIONS.get(role_name, []))

    # ── Step 4: merge assigned_departments (multi-role support) ───────────────
    # Each entry is a role/department slug (e.g. "hr", "accounts"). We fetch the
    # role doc for each and union its permissions into the base set.
    assigned_departments = user.get("assigned_departments") or []
    if assigned_departments and db is not None and not bool(user.get("override_permissions")):
        for dept_slug in assigned_departments:
            if not dept_slug:
                continue
            # Treat the slug as a role name (primary_department == role slug pattern)
            dept_role_doc = await db.roles.find_one(
                {"name": dept_slug, "is_deleted": False}
            )
            if dept_role_doc and dept_role_doc.get("permissions"):
                perms.update(dept_role_doc["permissions"])
            else:
                # Fall back to hardcoded defaults for that role
                perms.update(ROLE_PERMISSIONS.get(dept_slug, []))

    # ── Step 5: subtract restricted_modules ───────────────────────────────────
    # restricted_modules contains module slugs like "jobs", "candidates".
    # Remove all permissions whose prefix matches a restricted module.
    restricted_modules = user.get("restricted_modules") or []
    if restricted_modules:
        perms = {
            p for p in perms
            if not any(p == m or p.startswith(f"{m}:") for m in restricted_modules)
        }

    # dashboard:view is always preserved — navigation must always be accessible
    perms.add("dashboard:view")
    return list(perms)


class AuthService:
    """
    Authentication Service

    Handles:
    - User login (company users)
    - SuperAdmin login
    - Token generation
    - Password reset
    """

    @staticmethod
    async def login(identifier: str, password: str, request=None, company_code: Optional[str] = None, force_login: bool = False) -> Tuple[Optional[dict], str]:
        """
        Authenticate user and return tokens.

        Supports login with: username / email / mobile / full name.

        Permission resolution order:
          1. User's stored permissions list (pre-computed by frontend).
          2. Role document in company DB   → role's current permissions.
          3. Hardcoded ROLE_PERMISSIONS    → last-resort defaults.

        Session policy: If force_login=False and an active session exists for
        the user, returns an ACTIVE_SESSION error so the frontend can prompt the
        user to confirm taking over the session.  If force_login=True the
        existing session is revoked and the new login proceeds normally.

        Returns:
            Tuple of (login_response, error_message)
        """
        ip_address = ""
        device_info = ""
        if request:
            ip_address = request.client.host if request.client else ""
            device_info = request.headers.get("user-agent", "")

        # First, try to find as SuperAdmin
        super_admin, sa_err = await AuthService._authenticate_super_admin(
            identifier, password, ip_address=ip_address, device_info=device_info
        )
        if sa_err:
            return None, sa_err
        if super_admin:
            return super_admin, ""

        # Second, try to find as Seller/Reseller
        seller, sl_err = await AuthService._authenticate_seller(
            identifier, password, ip_address=ip_address, device_info=device_info
        )
        if sl_err:
            return None, sl_err
        if seller:
            return seller, ""

        # ── Company user / owner login ─────────────────────────────────────────
        if company_code:
            # FAST PATH: caller specified a company — scope strictly to that DB.
            # resolve_login_context already handles owner + user lookup for this case.
            tenant, user, error = await tenant_resolver.resolve_login_context(
                identifier, company_code=company_code
            )
            if error:
                return None, error
            if not tenant or not user:
                return None, "Invalid credentials"

            ph = (
                tenant.get("owner", {}).get("password_hash", "")
                if user.get("is_owner")
                else user.get("password_hash", "")
            )
            if not verify_password(password, ph):
                await AuthService._increment_failed_attempts(
                    tenant["company_id"],
                    user.get("_id") or user.get("id"),
                    user.get("is_owner", False),
                )
                logger.warning("Login failed (wrong password) | company=%s | identifier=%s", company_code, identifier)
                return None, "Invalid credentials"

            return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login)

        # GLOBAL PATH (no company_code)
        # ── Fast path: global_users index (O(1), no per-tenant scanning) ─────
        import re as _re
        master_db = get_master_db()
        identifier_normalized = identifier.lower().strip()

        global_user = await master_db.global_users.find_one({
            "$or": [
                {"email": identifier_normalized},
                {"mobile": identifier},
            ]
        })

        if global_user:
            if not global_user.get("is_active", True):
                return None, "Your account has been deactivated. Please contact support."

            if not verify_password(password, global_user.get("password_hash", "")):
                await master_db.global_users.update_one(
                    {"_id": global_user["_id"]},
                    {"$inc": {"failed_login_attempts": 1}},
                )
                logger.warning("Login failed (wrong password, global path) | identifier=%s", identifier)
                return None, "Invalid credentials"

            # Fetch all active company memberships for this global identity
            mappings = await master_db.user_company_map.find(
                {"global_user_id": global_user["_id"], "status": "active"}
            ).to_list(None)

            if mappings:
                valid_matches = []
                last_error = ""
                for mapping in mappings:
                    cid = mapping["company_id"]
                    tenant = await master_db.tenants.find_one(
                        {"company_id": cid, "is_deleted": {"$ne": True}}
                    )
                    if not tenant:
                        continue
                    is_valid, error = await tenant_resolver.validate_tenant_access(tenant)
                    if not is_valid:
                        if mapping.get("is_owner") and error.startswith("SUBSCRIPTION_EXPIRED"):
                            error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                        last_error = error
                        continue
                    company_db = get_company_db(cid)
                    company_user = await company_db.users.find_one(
                        {"_id": mapping["local_user_id"], "is_deleted": False}
                    )
                    if not company_user:
                        continue
                    if mapping.get("is_owner"):
                        company_user["is_owner"] = True
                        company_user["role"] = "admin"
                    valid_matches.append((tenant, company_user))

                if not valid_matches:
                    return None, last_error or "No valid company access found. Please check your subscription."

                # Reset failed-attempt counter on successful auth
                await master_db.global_users.update_one(
                    {"_id": global_user["_id"]},
                    {"$set": {"failed_login_attempts": 0, "last_login": datetime.now(timezone.utc)}},
                )

                if len(valid_matches) > 1:
                    logger.info(
                        "Login (global path): multiple tenant matches | identifier=%s | count=%d",
                        identifier, len(valid_matches),
                    )
                    return {
                        "tenant_selection_required": True,
                        "message": "Multiple companies found. Please select one to continue.",
                        "tenants": [
                            {
                                "company_id":   t["company_id"],
                                "company_name": t.get("company_name", ""),
                                "role":         u.get("role", ""),
                            }
                            for t, u in valid_matches
                        ],
                    }, ""

                tenant, user = valid_matches[0]
                return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login)

        # ── Legacy fallback: O(N) scan for users not yet in global_users ─────
        # Covers tenants registered before the global_users migration was run.
        ci = _re.compile(f"^{_re.escape(identifier)}$", _re.IGNORECASE)

        # Step 1 — owner lookup (single-pass across master_db.tenants)
        owner_tenant = await master_db.tenants.find_one({
            "$or": [
                {"owner.username": ci},
                {"owner.email":    ci},
                {"owner.mobile":   identifier},
            ]
        })

        if owner_tenant:
            is_valid, error = await tenant_resolver.validate_tenant_access(owner_tenant)
            if not is_valid:
                if error.startswith("SUBSCRIPTION_EXPIRED"):
                    error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                return None, error

            owner_basic = owner_tenant.get("owner", {})
            company_id  = owner_tenant.get("company_id")

            # Prefer full owner record from company_db (has override_permissions, etc.)
            user = None
            if company_id:
                company_db = get_company_db(company_id)
                owner_id   = str(owner_basic.get("_id", ""))
                if owner_id:
                    user = await company_db.users.find_one({"_id": owner_id, "is_deleted": False})
            if not user:
                user = dict(owner_basic)
            user["role"]     = "admin"
            user["is_owner"] = True

            ph = owner_tenant.get("owner", {}).get("password_hash", "")
            if not verify_password(password, ph):
                await AuthService._increment_failed_attempts(
                    company_id, str(owner_basic.get("_id", "")), True
                )
                logger.warning("Login failed (wrong password) owner | identifier=%s", identifier)
                return None, "Invalid credentials"

            return await AuthService._complete_company_login(owner_tenant, user, ip_address, device_info, force_login=force_login)

        # Step 2 — scan all company DBs (O(N) — only reached for unmigrated tenants)
        all_matches = await tenant_resolver.find_all_company_user_matches(identifier)

        if not all_matches:
            logger.warning("Login failed (user not found) | identifier=%s", identifier)
            return None, "Invalid credentials"

        # Verify password for each match — collect every tenant where it succeeds
        valid_matches = []
        for t, u in all_matches:
            if verify_password(password, u.get("password_hash", "")):
                is_valid, _ = await tenant_resolver.validate_tenant_access(t)
                if is_valid:
                    valid_matches.append((t, u))

        if not valid_matches:
            first_t, first_u = all_matches[0]
            await AuthService._increment_failed_attempts(
                first_t["company_id"], str(first_u.get("_id", "")), False
            )
            logger.warning("Login failed (wrong password) | identifier=%s", identifier)
            return None, "Invalid credentials"

        if len(valid_matches) > 1:
            logger.info(
                "Login: multiple tenant matches | identifier=%s | count=%d",
                identifier, len(valid_matches),
            )
            return {
                "tenant_selection_required": True,
                "message": "Multiple companies found. Please select one to continue.",
                "tenants": [
                    {
                        "company_id":   t["company_id"],
                        "company_name": t.get("company_name", ""),
                        "role":         u.get("role", ""),
                    }
                    for t, u in valid_matches
                ],
            }, ""

        tenant, user = valid_matches[0]
        return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login)

    @staticmethod
    async def login_with_tenant(
        identifier: str,
        password: str,
        company_id: str,
        request=None,
        force_login: bool = False,
    ) -> Tuple[Optional[dict], str]:
        """
        Scoped login after the user has selected a tenant from the picker.

        Delegates directly to login() with company_code=company_id so every
        existing check (status, expiry, permissions, session) is reused without
        duplication.
        """
        return await AuthService.login(
            identifier, password, request=request, company_code=company_id, force_login=force_login
        )

    @staticmethod
    async def _check_active_session(user_id: str) -> bool:
        """Return True if the user has an active unexpired session."""
        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        session = await master_db.sessions.find_one({
            "user_id": user_id,
            "is_active": True,
            "expires_at": {"$gt": now},
        })
        return session is not None

    @staticmethod
    async def _complete_company_login(
        tenant: dict,
        user: dict,
        ip_address: str = "",
        device_info: str = "",
        force_login: bool = False,
    ) -> Tuple[Optional[dict], str]:
        """
        Shared finalization for every company-user login path.

        Called AFTER tenant + user are resolved and the password has been
        verified by the caller.  Handles:
          - User status check (suspended / inactive)
          - Subscription expiry
          - Permission resolution
          - Session + JWT creation
          - last_login update + activity log
        """
        # ── Status check ──────────────────────────────────────────────────────
        if user.get("status") == UserStatus.SUSPENDED:
            return None, "Your account has been suspended. Please contact your administrator."
        if user.get("status") == UserStatus.INACTIVE:
            return None, "Your account is inactive. Please contact your administrator."

        # ── Concurrent session check ──────────────────────────────────────────
        # Check active_session_token directly on the user document. If it is
        # set, another device currently holds an active session for this user.
        # force_login=True skips this check and takes over the session.
        if not force_login and user.get("active_session_token"):
            return None, "ACTIVE_SESSION|This account is already active on another device."

        # ── Subscription expiry ───────────────────────────────────────────────
        plan_expiry = tenant.get("plan_expiry")
        if plan_expiry:
            if plan_expiry.tzinfo is None:
                plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > plan_expiry:
                is_owner  = user.get("is_owner", False)
                expiry_str = plan_expiry.isoformat()
                prefix = "SUBSCRIPTION_EXPIRED_OWNER" if is_owner else "SUBSCRIPTION_EXPIRED_USER"
                return None, f"{prefix}|{expiry_str}|Your subscription has expired. Please upgrade your plan to continue."

        # ── Permission resolution ─────────────────────────────────────────────
        company_id  = tenant.get("company_id")
        company_db  = get_company_db(company_id)
        role_name   = user.get("role", "admin")

        role_doc = await company_db.roles.find_one({"name": role_name, "is_deleted": False})
        effective_perms = await _resolve_effective_permissions(user, role_doc, db=company_db)

        user_id    = str(user.get("_id") or user.get("id", ""))
        _user_type = "partner" if role_name == "partner" else user.get("user_type", "internal")

        # ── Session + tokens ──────────────────────────────────────────────────
        await AuthService._revoke_sessions(user_id)

        token_data = {
            "sub":          user_id,
            "company_id":   company_id,
            "role":         role_name,
            "user_type":    _user_type,
            "permissions":  effective_perms,
            "is_super_admin": False,
            "is_owner":     user.get("is_owner", False),
            "username":     user.get("username", ""),
            "full_name":    user.get("full_name", ""),
            "designation":  user.get("designation", ""),
            "department_id": user.get("department_id"),
            "reporting_to": user.get("reporting_to"),
        }
        session_id = await AuthService._create_session(
            user_id, "company_user", company_id,
            ip_address=ip_address, device_info=device_info,
        )
        # Persist active session token on user document for concurrent login detection.
        # Cleared on logout so a fresh login is always allowed after logout.
        _raw_user_id = user.get("_id") or user.get("id")
        _now_st = datetime.now(timezone.utc)
        if user.get("is_owner", False):
            # Owners may be stored in company_db.users (primary) or master_db.tenants.owner
            _ores = await company_db.users.update_one(
                {"_id": _raw_user_id},
                {"$set": {"active_session_token": session_id, "active_session_at": _now_st}},
            )
            if _ores.matched_count == 0:
                # Owner only in master_db.tenants — update owner subdocument
                _mdb = get_master_db()
                await _mdb.tenants.update_one(
                    {"company_id": company_id},
                    {"$set": {"owner.active_session_token": session_id, "owner.active_session_at": _now_st}},
                )
        else:
            await company_db.users.update_one(
                {"_id": _raw_user_id},
                {"$set": {"active_session_token": session_id, "active_session_at": _now_st}},
            )
        token_data["jti"] = session_id
        access_token  = create_access_token(token_data)
        refresh_token = create_refresh_token(
            {"sub": user_id, "company_id": company_id, "jti": session_id}
        )

        # ── Post-login updates ────────────────────────────────────────────────
        await AuthService._update_last_login(company_id, user.get("_id") or user.get("id"), user.get("is_owner", False))
        await AuthService._log_login_activity(
            company_id=company_id, user_id=user_id,
            full_name=user.get("full_name", ""), role=role_name,
            ip_address=ip_address, device_info=device_info,
        )

        return {
            "access_token":   access_token,
            "refresh_token":  refresh_token,
            "token_type":     "bearer",
            "expires_in":     settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user_id":        user_id,
            "username":       user.get("username", ""),
            "full_name":      user.get("full_name", ""),
            "email":          user.get("email", ""),
            "role":           role_name,
            "user_type":      _user_type,
            "permissions":    effective_perms,
            "company_id":     company_id,
            "company_name":   tenant.get("company_name"),
            "is_super_admin": False,
            "is_owner":       user.get("is_owner", False),
            "designation":    user.get("designation", ""),
            "department_id":  user.get("department_id"),
            "reporting_to":   user.get("reporting_to"),
            # Subscription info
            "plan_name":         tenant.get("plan_name", "trial"),
            "plan_display_name": tenant.get("plan_display_name", "Trial"),
            "plan_expiry":       tenant.get("plan_expiry").isoformat() if tenant.get("plan_expiry") else None,
            "total_user_seats":  tenant.get("max_users", 3),
            "is_trial":          tenant.get("is_trial", True),
            # Onboarding flags
            "must_change_password": bool(user.get("must_change_password", False)),
            "profile_completed":    bool(user.get("profile_completed", True)),
        }, ""

    @staticmethod
    async def _authenticate_super_admin(
        identifier: str, password: str,
        ip_address: str = "", device_info: str = "",
    ) -> Tuple[Optional[dict], str]:
        """Authenticate SuperAdmin user"""
        master_db = get_master_db()

        super_admin = await master_db.super_admins.find_one({
            "$or": [
                {"username": identifier},
                {"email": identifier}
            ],
            "is_deleted": False,
            "status": SuperAdminStatus.ACTIVE
        })

        if not super_admin:
            return None, ""

        if not verify_password(password, super_admin.get("password_hash", "")):
            return None, ""

        user_id = str(super_admin.get("_id"))

        # Revoke any existing active sessions — new login always wins
        await AuthService._revoke_sessions(user_id)

        token_data = {
            "sub": user_id,
            "company_id": None,
            "role": "super_admin",
            "permissions": super_admin.get("permissions", []),
            "is_super_admin": True,
            "is_owner": False,
            "username": super_admin.get("username", ""),
            "full_name": super_admin.get("full_name", "")
        }

        session_id = await AuthService._create_session(
            user_id, "super_admin", ip_address=ip_address, device_info=device_info
        )
        token_data["jti"] = session_id  # embedded for per-request session validation
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token({"sub": user_id, "jti": session_id})

        await master_db.super_admins.update_one(
            {"_id": super_admin["_id"]},
            {
                "$set": {
                    "last_login": datetime.now(timezone.utc),
                    "failed_login_attempts": 0
                }
            }
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user_id": user_id,
            "username": super_admin.get("username", ""),
            "full_name": super_admin.get("full_name", ""),
            "email": super_admin.get("email", ""),
            "role": "super_admin",
            "permissions": token_data["permissions"],
            "company_id": None,
            "company_name": None,
            "is_super_admin": True,
            "is_owner": False
        }, ""

    @staticmethod
    async def _authenticate_seller(
        identifier: str, password: str,
        ip_address: str = "", device_info: str = "",
    ) -> Tuple[Optional[dict], str]:
        """Authenticate a Seller user from master_db.sellers."""
        master_db = get_master_db()
        seller = await master_db.sellers.find_one({
            "$or": [{"username": identifier}, {"email": identifier}],
            "is_deleted": False,
            "status": "active",
        })
        if not seller:
            return None, ""
        if not verify_password(password, seller.get("password_hash", "")):
            return None, ""

        seller_id = str(seller["_id"])

        # ── Seller subscription expiry check ─────────────────────────────────
        # plan_expiry_date stored permanently at purchase — never recalculated.
        plan_expiry = seller.get("plan_expiry_date")
        if plan_expiry:
            if plan_expiry.tzinfo is None:
                plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
            if datetime.now(timezone.utc) > plan_expiry:
                expiry_str = plan_expiry.isoformat()
                msg = "Your subscription has expired. Please upgrade your plan to continue."
                return None, f"SUBSCRIPTION_EXPIRED_OWNER|{expiry_str}|{msg}"

        # Revoke any existing active sessions — new login always wins
        await AuthService._revoke_sessions(seller_id)

        token_data = {
            "sub": seller_id,
            "company_id": None,
            "role": "seller",
            "user_type": "seller",
            "permissions": ["seller:dashboard", "seller:tenants", "seller:subscriptions", "seller:revenue"],
            "is_super_admin": False,
            "is_seller": True,
            "seller_id": seller_id,
            "is_owner": False,
            "username": seller.get("username", ""),
            "full_name": seller.get("seller_name", ""),
        }

        session_id = await AuthService._create_session(
            seller_id, "seller", ip_address=ip_address, device_info=device_info
        )
        token_data["jti"] = session_id  # embedded for per-request session validation
        access_token = create_access_token(token_data)
        refresh_token = create_refresh_token({"sub": seller_id, "is_seller": True, "jti": session_id})

        await master_db.sellers.update_one(
            {"_id": seller["_id"]},
            {"$set": {"last_login": datetime.now(timezone.utc)}}
        )

        return {
            "access_token": access_token,
            "refresh_token": refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60,
            "user_id": seller_id,
            "username": seller.get("username", ""),
            "full_name": seller.get("seller_name", ""),
            "email": seller.get("email", ""),
            "role": "seller",
            "user_type": "seller",
            "permissions": token_data["permissions"],
            "company_id": None,
            "company_name": None,
            "is_super_admin": False,
            "is_seller": True,
            "seller_id": seller_id,
            "is_owner": False,
            # Subscription info for the frontend dashboard
            "plan_name": seller.get("plan_name", "trial"),
            "plan_display_name": seller.get("plan_display_name", "Trial"),
            "plan_expiry_date": seller.get("plan_expiry_date").isoformat() if seller.get("plan_expiry_date") else None,
            "total_user_seats": seller.get("total_user_seats", 1),
            "is_trial": seller.get("is_trial", True),
        }, ""

    @staticmethod
    async def _increment_failed_attempts(company_id: str, user_id: str, is_owner: bool):
        """Increment failed login attempts"""
        if is_owner:
            master_db = get_master_db()
            await master_db.tenants.update_one(
                {"company_id": company_id},
                {"$inc": {"owner.failed_login_attempts": 1}}
            )
        else:
            company_db = get_company_db(company_id)
            await company_db.users.update_one(
                {"_id": user_id},
                {"$inc": {"failed_login_attempts": 1}}
            )

    @staticmethod
    async def _update_last_login(company_id: str, user_id: str, is_owner: bool):
        """Update last login timestamp"""
        now = datetime.now(timezone.utc)

        if is_owner:
            master_db = get_master_db()
            await master_db.tenants.update_one(
                {"company_id": company_id},
                {
                    "$set": {
                        "owner.last_login": now,
                        "owner.failed_login_attempts": 0
                    }
                }
            )
        else:
            company_db = get_company_db(company_id)
            await company_db.users.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "last_login": now,
                        "failed_login_attempts": 0
                    }
                }
            )

    @staticmethod
    async def _create_session(
        user_id: str,
        user_type: str,
        company_id: Optional[str] = None,
        ip_address: str = "",
        device_info: str = "",
    ) -> str:
        """Insert a new active session record and return its session_id (used as jti)."""
        master_db = get_master_db()
        session_id = str(uuid.uuid4())
        now = datetime.now(timezone.utc)
        await master_db.sessions.insert_one({
            "_id": session_id,
            "session_token": session_id,
            "user_id": user_id,
            "user_type": user_type,
            "company_id": company_id,
            "ip_address": ip_address,
            "device_info": device_info,
            "created_at": now,
            "expires_at": now + timedelta(hours=24),
            "is_active": True,
        })
        return session_id

    @staticmethod
    async def _log_login_activity(
        company_id: str,
        user_id: str,
        full_name: str,
        role: str,
        ip_address: str = "",
        device_info: str = "",
    ) -> None:
        """Insert a login_logs record into the company database."""
        try:
            company_db = get_company_db(company_id)
            await company_db.login_logs.insert_one({
                "user_id": user_id,
                "full_name": full_name,
                "role": role,
                "login_time": datetime.now(timezone.utc),
                "ip_address": ip_address,
                "device": device_info,
            })
        except Exception:
            pass  # Never block login due to logging failure

    @staticmethod
    async def _revoke_sessions(user_id: str) -> None:
        """Mark all active sessions for user_id as inactive and clear the active-session slot."""
        master_db = get_master_db()
        await master_db.sessions.update_many(
            {"user_id": user_id, "is_active": True},
            {"$set": {"is_active": False}},
        )
        # Clear the per-user active-session slot so force-login / logout
        # allows a fresh login from any device.
        await master_db.user_active_sessions.delete_one({"_id": user_id})

    @staticmethod
    def _is_token_revoked(token_iat, user_logout_at) -> bool:
        """
        Return True if the refresh token was issued before the user's last logout.
        token_iat  – Unix timestamp (int/float) from the JWT payload.
        user_logout_at – datetime stored in the DB, or None.
        """
        if not token_iat or not user_logout_at:
            return False
        try:
            logout_ts = (
                user_logout_at.timestamp()
                if hasattr(user_logout_at, "timestamp")
                else float(user_logout_at)
            )
            return float(token_iat) < logout_ts
        except Exception:
            return False

    @staticmethod
    async def logout_user(
        user_id: str,
        company_id: Optional[str],
        is_super_admin: bool,
        is_owner: bool,
        is_seller: bool = False,
        session_id: Optional[str] = None,
    ) -> None:
        """
        Revoke the current session and record a logout timestamp so refresh
        tokens issued before this moment are treated as revoked.
        """
        now = datetime.now(timezone.utc)

        # Revoke only the current session if known, otherwise revoke all
        master_db_s = get_master_db()
        if session_id:
            await master_db_s.sessions.update_one(
                {"_id": session_id, "user_id": user_id},
                {"$set": {"is_active": False}},
            )
        else:
            await AuthService._revoke_sessions(user_id)

        if is_seller:
            master_db = get_master_db()
            await master_db.sellers.update_one(
                {"_id": user_id},
                {"$set": {"logout_at": now}}
            )
        elif is_super_admin:
            master_db = get_master_db()
            await master_db.super_admins.update_one(
                {"_id": user_id},
                {"$set": {"logout_at": now}}
            )
        elif is_owner and company_id:
            master_db = get_master_db()
            await master_db.tenants.update_one(
                {"company_id": company_id},
                {"$set": {
                    "owner.logout_at": now,
                    "owner.active_session_token": None,
                    "owner.active_session_at": None,
                }}
            )
            # Clear the session token on the owner's record in company_db.users too
            # (owners are looked up from company_db.users on the next login)
            _co_db_owner = get_company_db(company_id)
            await _co_db_owner.users.update_one(
                {"_id": user_id},
                {"$set": {"active_session_token": None, "active_session_at": None}},
            )
        elif company_id:
            company_db = get_company_db(company_id)
            await company_db.users.update_one(
                {"_id": user_id},
                {"$set": {
                    "logout_at": now,
                    "active_session_token": None,
                    "active_session_at": None,
                }}
            )

    @staticmethod
    async def refresh_tokens(refresh_token_payload: dict) -> Tuple[Optional[dict], str]:
        """
        Generate a new access token from a refresh token.

        Re-fetches the user from DB and recomputes effective permissions
        so that any admin-made permission changes take effect immediately
        on the next token refresh (i.e. on every page reload / auto-refresh).
        """
        user_id = refresh_token_payload.get("sub")
        company_id = refresh_token_payload.get("company_id")
        token_iat  = refresh_token_payload.get("iat")
        jti        = refresh_token_payload.get("jti")

        # Verify the session is still active (single-session enforcement)
        if jti:
            _master_db = get_master_db()
            now = datetime.now(timezone.utc)
            session = await _master_db.sessions.find_one({"_id": jti, "is_active": True})
            if not session or session.get("expires_at", now) < now:
                return None, "Session expired. Please log in again."
            # Extend session expiry on each refresh (rolling window)
            await _master_db.sessions.update_one(
                {"_id": jti},
                {"$set": {"expires_at": now + timedelta(hours=24)}}
            )

        if not company_id and refresh_token_payload.get("is_seller"):
            # Seller refresh
            master_db = get_master_db()
            seller = await master_db.sellers.find_one({"_id": user_id, "is_deleted": False})

            if not seller:
                return None, "Seller account not found"

            if seller.get("status") != "active":
                return None, "Seller account is suspended"

            if AuthService._is_token_revoked(token_iat, seller.get("logout_at")):
                return None, "Session expired. Please log in again."

            seller_id = str(seller["_id"])
            token_data = {
                "sub": seller_id,
                "company_id": None,
                "role": "seller",
                "user_type": "seller",
                "permissions": ["seller:dashboard", "seller:tenants", "seller:subscriptions", "seller:revenue"],
                "is_super_admin": False,
                "is_seller": True,
                "seller_id": seller_id,
                "is_owner": False,
                "username": seller.get("username", ""),
                "full_name": seller.get("seller_name", ""),
            }

        elif not company_id:
            # SuperAdmin refresh
            master_db = get_master_db()
            super_admin = await master_db.super_admins.find_one({"_id": user_id})

            if not super_admin:
                return None, "User not found"

            if AuthService._is_token_revoked(token_iat, super_admin.get("logout_at")):
                return None, "Session expired. Please log in again."

            token_data = {
                "sub": str(super_admin.get("_id")),
                "company_id": None,
                "role": "super_admin",
                "permissions": super_admin.get("permissions", []),
                "is_super_admin": True,
                "is_owner": False,
                "username": super_admin.get("username", ""),
                "full_name": super_admin.get("full_name", "")
            }
        else:
            # Company user refresh
            master_db = get_master_db()
            tenant = await master_db.tenants.find_one({"company_id": company_id})

            if not tenant:
                return None, "Company not found"

            is_valid, error = await tenant_resolver.validate_tenant_access(tenant)
            if not is_valid:
                return None, error

            company_db = get_company_db(company_id)

            # Try to find in company users first
            user = await company_db.users.find_one({"_id": user_id, "is_deleted": False})

            if not user:
                # Check if it's the owner — match by user_id explicitly, not by username
                owner = tenant.get("owner", {})
                owner_id = str(owner.get("_id", ""))
                if owner_id and owner_id == user_id:
                    user = dict(owner)
                    user["is_owner"] = True
                    user["role"] = "admin"
                else:
                    return None, "User not found"

            if AuthService._is_token_revoked(token_iat, user.get("logout_at")):
                return None, "Session expired. Please log in again."

            # SAFEGUARD: for owners, force override_permissions=False before permission
            # resolution so a stale DB field can never restrict their JWT to a partial list.
            # _resolve_effective_permissions already skips the override branch for owners,
            # but clearing it here makes the intent explicit and guards against future changes.
            if user.get("is_owner"):
                user = {**user, "override_permissions": False}

            role_name = user.get("role", "admin")

            # Always fetch role doc — needed to merge base+override permissions correctly
            role_doc = await company_db.roles.find_one(
                {"name": role_name, "is_deleted": False}
            )

            effective_perms = await _resolve_effective_permissions(user, role_doc, db=company_db)

            _user_type = "partner" if role_name == "partner" else user.get("user_type", "internal")
            token_data = {
                "sub": str(user_id),
                "company_id": company_id,
                "role": role_name,
                "user_type": _user_type,
                "permissions": effective_perms,
                "is_super_admin": False,
                "is_owner": user.get("is_owner", False),
                "username": user.get("username", ""),
                "full_name": user.get("full_name", ""),
                "designation": user.get("designation", ""),
                "department_id": user.get("department_id"),
                "reporting_to": user.get("reporting_to"),
            }

        access_token = create_access_token(token_data)
        refresh_payload: dict = {"sub": user_id, "company_id": company_id}
        if token_data.get("is_seller"):
            refresh_payload["is_seller"] = True
        if jti:
            refresh_payload["jti"] = jti  # preserve same session
        new_refresh_token = create_refresh_token(refresh_payload)

        return {
            "access_token": access_token,
            "refresh_token": new_refresh_token,
            "token_type": "bearer",
            "expires_in": settings.JWT_ACCESS_TOKEN_EXPIRE_MINUTES * 60
        }, ""

    @staticmethod
    async def get_effective_permissions(user_id: str, company_id: str) -> Tuple[Optional[list], str]:
        """
        Fetch effective permissions for a user directly from the database.

        Used by the /auth/me/permissions endpoint so the frontend can always
        get fresh permissions without a full logout/login cycle.
        """
        company_db = get_company_db(company_id)

        user = await company_db.users.find_one({"_id": user_id, "is_deleted": False})
        if not user:
            # Check owner
            master_db = get_master_db()
            tenant = await master_db.tenants.find_one({"company_id": company_id})
            if not tenant:
                return None, "Company not found"
            owner = tenant.get("owner", {})
            if str(owner.get("_id", "")) == user_id:
                # Owner always has full admin permissions
                return list(ROLE_PERMISSIONS.get("admin", [])), ""
            return None, "User not found"

        role_name = user.get("role", "admin")
        role_doc = await company_db.roles.find_one(
            {"name": role_name, "is_deleted": False}
        )

        return await _resolve_effective_permissions(user, role_doc, db=company_db), ""

    @staticmethod
    async def verify_email(token: str, account_type: str = "tenant") -> Tuple[bool, str]:
        """
        Verify email using the token from the verification link.
        Sets email_verified = True on success.
        """
        master_db = get_master_db()
        now = datetime.now(timezone.utc)

        if account_type == "tenant":
            tenant = await master_db.tenants.find_one({
                "email_verification_token": token,
                "is_deleted": False,
            })
            if not tenant:
                return False, "Invalid or expired verification link"
            expiry = tenant.get("email_verification_expiry")
            if expiry:
                if expiry.tzinfo is None:
                    expiry = expiry.replace(tzinfo=timezone.utc)
                if now > expiry:
                    return False, "Verification link has expired. Please request a new one."
            await master_db.tenants.update_one(
                {"_id": tenant["_id"]},
                {"$set": {
                    "email_verified": True,
                    "email_verification_token": None,
                    "email_verification_expiry": None,
                    "updated_at": now,
                }}
            )
            return True, "Email verified successfully. You can now log in."

        # Seller account type (future use — sellers are admin-created so verified by default)
        return False, "Unknown account type"

    @staticmethod
    async def resend_verification_email(email: str) -> Tuple[bool, str]:
        """
        Resend verification email for a tenant whose email is not yet verified.
        """
        import secrets
        from app.core.config import settings as _settings
        master_db = get_master_db()
        now = datetime.now(timezone.utc)

        tenant = await master_db.tenants.find_one({
            "owner.email": email,
            "is_deleted": False,
        })
        if not tenant:
            # Do not reveal whether the account exists
            return True, "If an unverified account exists with this email, a new link has been sent."
        if tenant.get("email_verified"):
            return True, "Email is already verified. Please log in."

        token = secrets.token_urlsafe(32)
        expire_minutes = getattr(_settings, "EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES", 15)
        expiry = now + timedelta(minutes=expire_minutes)
        await master_db.tenants.update_one(
            {"_id": tenant["_id"]},
            {"$set": {
                "email_verification_token": token,
                "email_verification_expiry": expiry,
            }}
        )
        owner = tenant.get("owner", {})
        from app.services.email_service import send_verification_email, _fire_email
        _fire_email(send_verification_email(
            to_email=owner.get("email", ""),
            full_name=owner.get("full_name", ""),
            token=token,
            account_type="tenant",
        ))
        return True, "If an unverified account exists with this email, a new link has been sent."

    @staticmethod
    async def initiate_password_reset(email: str) -> Tuple[bool, str]:
        """
        Initiate password reset process.

        Returns (success, message).
        • Account found + email sent     → (True,  "Password reset instructions sent …")
        • Account found + email FAILED   → (False, "Email service unavailable …")
        • Account not found              → (True,  generic "if an account exists …")
          (generic message prevents email enumeration)
        """
        master_db = get_master_db()
        _EMAIL_UNAVAILABLE = (
            "Email service unavailable. Please try again later or contact support."
        )
        _EMAIL_OK = "Password reset instructions sent to your email"
        _NOT_FOUND = "If an account exists with this email, reset instructions have been sent"

        from app.services.email_service import send_password_reset_email as _send_reset

        # ── Super admin ───────────────────────────────────────────────────────
        super_admin = await master_db.super_admins.find_one(
            {"email": email, "is_deleted": False}
        )
        if super_admin:
            reset_token = generate_reset_token()
            await master_db.super_admins.update_one(
                {"_id": super_admin["_id"]},
                {"$set": {
                    "reset_token": reset_token,
                    "reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                }}
            )
            sent = await _send_reset(
                to_email=email,
                full_name=super_admin.get("full_name", "Admin"),
                reset_token=reset_token,
            )
            if not sent:
                logger.error(
                    "Password reset email FAILED for super_admin %s. "
                    "Token saved in DB — user can request again.", email
                )
                return False, _EMAIL_UNAVAILABLE
            return True, _EMAIL_OK

        # ── Tenant owner ──────────────────────────────────────────────────────
        tenant = await master_db.tenants.find_one({"owner.email": email})
        if tenant:
            reset_token = generate_reset_token()
            await master_db.tenants.update_one(
                {"_id": tenant["_id"]},
                {"$set": {
                    "owner.reset_token": reset_token,
                    "owner.reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                }}
            )
            owner = tenant.get("owner", {})
            sent = await _send_reset(
                to_email=email,
                full_name=owner.get("full_name", ""),
                reset_token=reset_token,
            )
            if not sent:
                logger.error(
                    "Password reset email FAILED for tenant owner %s. "
                    "Token saved in DB — user can request again.", email
                )
                return False, _EMAIL_UNAVAILABLE
            return True, _EMAIL_OK

        # ── Company users (global scan) ───────────────────────────────────────
        tenants_cursor = master_db.tenants.find({"status": TenantStatus.ACTIVE})
        async for tenant in tenants_cursor:
            company_db = get_company_db(tenant["company_id"])
            user = await company_db.users.find_one({"email": email, "is_deleted": False})
            if user:
                reset_token = generate_reset_token()
                await company_db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "reset_token": reset_token,
                        "reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                    }}
                )
                sent = await _send_reset(
                    to_email=email,
                    full_name=user.get("full_name", ""),
                    reset_token=reset_token,
                )
                if not sent:
                    logger.error(
                        "Password reset email FAILED for user %s in company %s. "
                        "Token saved in DB — user can request again.",
                        email, tenant["company_id"]
                    )
                    return False, _EMAIL_UNAVAILABLE
                return True, _EMAIL_OK

        # Account not found — return generic message (anti-enumeration)
        return True, _NOT_FOUND


# Singleton instance
auth_service = AuthService()
