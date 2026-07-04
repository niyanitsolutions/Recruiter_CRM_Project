"""
Authentication Service
Handles login, registration, and token management
"""

from datetime import datetime, timedelta, timezone
from typing import Optional, Tuple
import asyncio
import logging
import uuid

from app.core.database import get_master_db, get_company_db, DatabaseManager
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

# A session is "truly active" only if a heartbeat was received within this window.
# Frontend heartbeat interval is 30 s; allow 4 missed beats (120 s) as grace.
SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS = 120

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

    if is_owner:
        # Owners are internally tagged role="admin" for login/role-doc plumbing,
        # but they must always resolve to the full OWNER permission set — never
        # the "admin" role_doc/hardcoded defaults, which are intentionally more
        # restricted (platform-admin only). Resolving via "admin" here would
        # silently shrink every owner's permissions whenever the admin role's
        # defaults are tightened.
        perms = {p.value for p in ROLE_DEFAULT_PERMISSIONS.get(SystemRole.OWNER, [])}
    elif bool(user.get("override_permissions")) and not is_owner:
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
    # Batch-fetch all department role docs with a single $in query instead of
    # one find_one per department — eliminates N round-trips to MongoDB.
    assigned_departments = [d for d in (user.get("assigned_departments") or []) if d]
    if assigned_departments and db is not None and not bool(user.get("override_permissions")):
        dept_docs = await db.roles.find(
            {"name": {"$in": assigned_departments}, "is_deleted": False},
            {"name": 1, "permissions": 1}
        ).to_list(length=len(assigned_departments))
        found_slugs = set()
        for dept_role_doc in dept_docs:
            found_slugs.add(dept_role_doc.get("name"))
            if dept_role_doc.get("permissions"):
                perms.update(dept_role_doc["permissions"])
        # Hardcoded fallback for any slugs not found in DB
        for dept_slug in assigned_departments:
            if dept_slug not in found_slugs:
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
    async def login(identifier: str, password: str, request=None, company_code: Optional[str] = None, force_login: bool = False, device_fingerprint: str = "", latitude: Optional[float] = None, longitude: Optional[float] = None) -> Tuple[Optional[dict], str]:
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

            # Lockout check (before password attempt)
            _lo_err = AuthService._get_lockout_error(
                tenant.get("owner", {}) if user.get("is_owner") else user
            )
            if _lo_err:
                return None, _lo_err

            ph = (
                tenant.get("owner", {}).get("password_hash", "")
                if user.get("is_owner")
                else user.get("password_hash", "")
            )
            if not await asyncio.to_thread(verify_password, password, ph):
                await AuthService._increment_failed_attempts(
                    tenant["company_id"],
                    user.get("_id") or user.get("id"),
                    user.get("is_owner", False),
                )
                logger.warning("Login failed (wrong password) | company=%s | identifier=%s", company_code, identifier)
                return None, "Invalid credentials"

            return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login, device_fingerprint=device_fingerprint, latitude=latitude, longitude=longitude)

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

        logger.info(
            "[LOGIN-DIAG] Global user lookup | identifier=%s | found=%s",
            identifier_normalized, bool(global_user),
        )

        if global_user:
            _gu_hash = global_user.get("password_hash", "")
            logger.info(
                "[LOGIN-DIAG] Global user found | id=%s | has_hash=%s | hash_prefix=%s",
                global_user.get("_id"), bool(_gu_hash), _gu_hash[:7] if _gu_hash else "NONE",
            )

            if not global_user.get("is_active", True):
                return None, "Your account has been deactivated. Please contact support."

            _lo_err = AuthService._get_lockout_error(global_user)
            if _lo_err:
                return None, _lo_err

            _pw_ok = await asyncio.to_thread(verify_password, password, _gu_hash)
            logger.info("[LOGIN-DIAG] Password verify (global path) | ok=%s", _pw_ok)

            if not _pw_ok:
                # ── FIX 4: apply lockout after threshold (global-users path) ──
                _gu_threshold, _gu_lockout_min = await AuthService._get_lockout_settings()
                _gu_new_count = (global_user.get("failed_login_attempts", 0) or 0) + 1
                _gu_upd: dict = {"$inc": {"failed_login_attempts": 1}}
                if _gu_new_count >= _gu_threshold:
                    _gu_upd["$set"] = {
                        "lockout_until": datetime.now(timezone.utc) + timedelta(minutes=_gu_lockout_min)
                    }
                await master_db.global_users.update_one({"_id": global_user["_id"]}, _gu_upd)
                logger.warning("Login failed (wrong password, global path) | identifier=%s", identifier)
                return None, "Invalid credentials"

            # Fetch all active company memberships for this global identity
            mappings = await master_db.user_company_map.find(
                {"global_user_id": global_user["_id"], "status": "active"}
            ).to_list(None)

            logger.info(
                "[LOGIN-DIAG] Mappings found | global_user_id=%s | count=%d",
                global_user.get("_id"), len(mappings),
            )

            if mappings:
                valid_matches = []
                last_error = ""
                for mapping in mappings:
                    cid = mapping["company_id"]
                    tenant = await master_db.tenants.find_one(
                        {"company_id": cid, "is_deleted": {"$ne": True}}
                    )
                    if not tenant:
                        logger.warning("[LOGIN-DIAG] Tenant not found for company_id=%s", cid)
                        continue
                    is_valid, error = await tenant_resolver.validate_tenant_access(tenant)
                    if not is_valid:
                        logger.warning("[LOGIN-DIAG] Tenant access invalid | company_id=%s | error=%s", cid, error)
                        if mapping.get("is_owner") and error.startswith("SUBSCRIPTION_EXPIRED"):
                            error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                        last_error = error
                        continue
                    company_db = await DatabaseManager.resolve_and_get_company_db(cid)
                    company_user = await company_db.users.find_one(
                        {"_id": mapping["local_user_id"], "is_deleted": False}
                    )
                    if not company_user:
                        logger.warning(
                            "[LOGIN-DIAG] company_user not found | company_id=%s | local_user_id=%s",
                            cid, mapping["local_user_id"],
                        )
                        continue
                    if mapping.get("is_owner"):
                        company_user["is_owner"] = True
                        company_user["role"] = "admin"
                    valid_matches.append((tenant, company_user))

                if not valid_matches:
                    logger.warning(
                        "[LOGIN-DIAG] No valid matches after checking %d mapping(s) | last_error=%s",
                        len(mappings), last_error,
                    )
                    return None, last_error or "No valid company access found. Please check your subscription."

                # Reset failed-attempt counter and clear any lockout on successful auth
                await master_db.global_users.update_one(
                    {"_id": global_user["_id"]},
                    {"$set": {"failed_login_attempts": 0, "lockout_until": None, "last_login": datetime.now(timezone.utc)}},
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
                return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login, device_fingerprint=device_fingerprint, latitude=latitude, longitude=longitude)

        # ── Legacy fallback: O(N) scan for users not yet in global_users ─────
        # Covers tenants registered before the global_users migration was run.
        if global_user:
            logger.warning(
                "[LOGIN-DIAG] Global user found but NO active mappings — falling through to legacy path | identifier=%s | global_user_id=%s",
                identifier_normalized, global_user.get("_id"),
            )
        else:
            logger.info("[LOGIN-DIAG] Global user not found — trying legacy path | identifier=%s", identifier_normalized)
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
                company_db = await DatabaseManager.resolve_and_get_company_db(company_id)
                owner_id   = str(owner_basic.get("_id", ""))
                if owner_id:
                    user = await company_db.users.find_one({"_id": owner_id, "is_deleted": False})
            if not user:
                user = dict(owner_basic)
            user["role"]     = "admin"
            user["is_owner"] = True

            # Lockout check (before password attempt)
            _lo_err = AuthService._get_lockout_error(owner_tenant.get("owner", {}))
            if _lo_err:
                return None, _lo_err

            ph = owner_tenant.get("owner", {}).get("password_hash", "")
            _legacy_pw_ok = await asyncio.to_thread(verify_password, password, ph)
            logger.info(
                "[LOGIN-DIAG] Legacy owner path | company_id=%s | has_ph=%s | pw_ok=%s",
                owner_tenant.get("company_id"), bool(ph), _legacy_pw_ok,
            )
            if not _legacy_pw_ok:
                await AuthService._increment_failed_attempts(
                    company_id, str(owner_basic.get("_id", "")), True
                )
                logger.warning("Login failed (wrong password) owner | identifier=%s", identifier)
                return None, "Invalid credentials"

            return await AuthService._complete_company_login(owner_tenant, user, ip_address, device_info, force_login=force_login, latitude=latitude, longitude=longitude)

        # Step 2 — scan all company DBs (O(N) — only reached for unmigrated tenants)
        all_matches = await tenant_resolver.find_all_company_user_matches(identifier)

        if not all_matches:
            logger.warning("Login failed (user not found) | identifier=%s", identifier)
            return None, "Invalid credentials"

        # Verify password for each match — collect every tenant where it succeeds
        valid_matches = []
        _last_lockout_err = ""
        for t, u in all_matches:
            _le = AuthService._get_lockout_error(u)
            if _le:
                _last_lockout_err = _le
                continue  # skip locked accounts; try other companies
            if await asyncio.to_thread(verify_password, password, u.get("password_hash", "")):
                is_valid, _ = await tenant_resolver.validate_tenant_access(t)
                if is_valid:
                    valid_matches.append((t, u))

        if not valid_matches:
            if _last_lockout_err and not any(
                not AuthService._get_lockout_error(u) for _, u in all_matches
            ):
                # ALL matches are locked — return lockout error
                return None, _last_lockout_err
            first_t, first_u = all_matches[0]
            if not AuthService._get_lockout_error(first_u):
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
        return await AuthService._complete_company_login(tenant, user, ip_address, device_info, force_login=force_login, device_fingerprint=device_fingerprint, latitude=latitude, longitude=longitude)

    @staticmethod
    async def login_with_tenant(
        identifier: str,
        password: str,
        company_id: str,
        request=None,
        force_login: bool = False,
        device_fingerprint: str = "",
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
    ) -> Tuple[Optional[dict], str]:
        """
        Scoped login after the user has selected a tenant from the picker.

        Delegates directly to login() with company_code=company_id so every
        existing check (status, expiry, permissions, session) is reused without
        duplication.
        """
        return await AuthService.login(
            identifier, password, request=request, company_code=company_id,
            force_login=force_login, device_fingerprint=device_fingerprint,
            latitude=latitude, longitude=longitude,
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
        device_fingerprint: str = "",
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
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
        # Only block login when the existing session is TRULY ACTIVE:
        #   - session document exists + is_active=True
        #   - token has not yet expired
        #   - a heartbeat was received recently (< SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS)
        #     OR the WebSocket connection is still live
        # Dead / idle / expired sessions are auto-invalidated so the user
        # can log in again without manual intervention.
        if not force_login and user.get("active_session_token"):
            import json as _json
            from app.core.ws_manager import ws_manager as _ws
            _master_db = get_master_db()
            _active_jti = user["active_session_token"]
            _session_doc = await _master_db.sessions.find_one(
                {"_id": _active_jti, "is_active": True}
            )
            if _session_doc:
                _now = datetime.now(timezone.utc)

                # Same-device recovery: if the incoming fingerprint matches the stored
                # session's fingerprint this is the same browser re-authenticating after
                # an idle/lock timeout — skip the liveness check and fall through to
                # normal session creation.  _revoke_sessions() below will cleanly end
                # the old session.
                _stored_fp   = _session_doc.get("device_fingerprint", "")
                _same_device = bool(
                    device_fingerprint and _stored_fp and device_fingerprint == _stored_fp
                )

                if _same_device:
                    logger.info(
                        "[SESSION] Same-device recovery | user=%s | fp=%.8s",
                        str(user.get("_id") or user.get("id", "")), device_fingerprint,
                    )
                    # Fall through — _revoke_sessions() below replaces the old session
                else:
                    # Different device (or fingerprint unavailable) — full liveness check
                    _expires = _session_doc.get("expires_at")
                    if _expires and _expires.tzinfo is None:
                        _expires = _expires.replace(tzinfo=timezone.utc)
                    _token_valid = bool(_expires and _expires > _now)

                    _last_act = _session_doc.get("last_activity_at") or _session_doc.get("created_at")
                    if _last_act and _last_act.tzinfo is None:
                        _last_act = _last_act.replace(tzinfo=timezone.utc)
                    _heartbeat_alive = bool(
                        _last_act and
                        (_now - _last_act).total_seconds() < SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS
                    )

                    _uid_str = str(user.get("_id") or user.get("id", ""))
                    _ws_connected = _ws.is_connected(_uid_str)

                    if _token_valid and (_heartbeat_alive or _ws_connected):
                        # Session is genuinely live on a different device — require approval
                        _session_info = {
                            "device_info":    _session_doc.get("device_info", ""),
                            "ip_address":     _session_doc.get("ip_address",  ""),
                            "login_time":     _session_doc["created_at"].isoformat() if _session_doc.get("created_at") else None,
                            "last_active":    _last_act.isoformat() if _last_act else None,
                            "session_status": _session_doc.get("session_status", "active"),
                            "ws_connected":   _ws_connected,
                            "company_id":     tenant.get("company_id", ""),
                        }
                        return None, f"ACTIVE_SESSION|{_json.dumps(_session_info)}"
                    else:
                        # Session is stale/dead — auto-invalidate and allow login
                        await _master_db.sessions.update_one(
                            {"_id": _active_jti},
                            {"$set": {
                                "is_active":      False,
                                "session_status": "expired",
                                "ended_at":       _now,
                            }}
                        )
            # active_session_token is stale or no session doc found — proceed

        # ── Subscription expiry ───────────────────────────────────────────────
        plan_expiry = tenant.get("plan_expiry")
        if plan_expiry:
            if plan_expiry.tzinfo is None:
                plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)
            now_utc = datetime.now(timezone.utc)
            if now_utc > plan_expiry:
                is_owner  = user.get("is_owner", False)
                expiry_str = plan_expiry.isoformat()
                prefix = "SUBSCRIPTION_EXPIRED_OWNER" if is_owner else "SUBSCRIPTION_EXPIRED_USER"
                return None, f"{prefix}|{expiry_str}|Your subscription has expired. Please upgrade your plan to continue."
            # Warn admins/owners when expiry is within 7 days
            days_left = (plan_expiry - now_utc).days
            if days_left <= 7 and (user.get("is_owner") or user.get("role") == "admin"):
                try:
                    company_id_early = tenant.get("company_id")
                    company_db_early = get_company_db(company_id_early)
                    from app.services.notification_service import NotificationService
                    ns = NotificationService(company_db_early)
                    await ns.notify_subscription_expiry(
                        company_id=company_id_early,
                        days_remaining=days_left,
                        plan_name=tenant.get("plan_display_name") or tenant.get("plan_name", "Current"),
                        admin_user_ids=[str(user.get("_id") or user.get("id", ""))],
                    )
                except Exception:
                    pass

        # ── Permission resolution ─────────────────────────────────────────────
        company_id  = tenant.get("company_id")
        company_db  = get_company_db(company_id)
        role_name   = user.get("role", "admin")

        # Layer-2 auto punch-out recovery: catches attendance records left open
        # from a previous day if the server was down/offline over shift end.
        # Throttled per-company and fire-and-forget so login is never delayed
        # or blocked by it.
        try:
            from app.services.attendance_service import recover_missed_punch_outs
            asyncio.create_task(recover_missed_punch_outs(company_db, company_id, source="login_recovery"))
        except Exception:
            pass

        role_doc = await company_db.roles.find_one({"name": role_name, "is_deleted": False})
        effective_perms = await _resolve_effective_permissions(user, role_doc, db=company_db)

        user_id    = str(user.get("_id") or user.get("id", ""))
        _user_type = "partner" if role_name == "partner" else user.get("user_type", "internal")

        # ── HRM employee link — auto-resolve if missing from user doc ─────────
        # Three-path resolution so the banner shows even when the link was never
        # written back to the user document (e.g. employee created before this fix,
        # or email mismatch during auto-link at employee creation time).
        hrm_employee_id = user.get("hrm_employee_id")
        if not hrm_employee_id and _user_type != "partner":
            import re as _re
            # Path 1: reverse lookup by crm_user_id field on employee doc
            linked_emp = await company_db.hrm_employees.find_one(
                {"crm_user_id": user_id, "is_deleted": False},
                {"_id": 1},
            )
            # Path 2: email-based match (handles employees with no crm_user_id set)
            if not linked_emp:
                _email = (user.get("email") or "").strip()
                if _email:
                    linked_emp = await company_db.hrm_employees.find_one(
                        {
                            "email": _re.compile(f"^{_re.escape(_email)}$", _re.IGNORECASE),
                            "is_deleted": False,
                        },
                        {"_id": 1},
                    )
            if linked_emp:
                hrm_employee_id = str(linked_emp["_id"])
                _raw_uid = user.get("_id") or user.get("id")
                await company_db.users.update_one(
                    {"_id": _raw_uid},
                    {"$set": {"hrm_employee_id": hrm_employee_id}},
                )
                await company_db.hrm_employees.update_one(
                    {"_id": hrm_employee_id},
                    {"$set": {"crm_user_id": user_id}},
                )

        # ── Step 14A: Attendance Login Access Validation ─────────────────────
        # Runs AFTER HRM auto-link (hrm_employee_id fully resolved) and
        # BEFORE session/JWT creation.  Owner and non-HRM users always pass.
        # Non-blocking: any unexpected exception is logged and login continues.
        try:
            from app.services.attendance_login_validator import validate_login_access as _val_login
            # Use resolved hrm_employee_id (may have been auto-linked just above)
            _user_for_14a = {**user, "hrm_employee_id": hrm_employee_id} if hrm_employee_id else user
            _allowed, _deny = await _val_login(
                user=_user_for_14a,
                company_id=company_id,
                company_db=company_db,
                ip_address=ip_address,
                latitude=latitude,
                longitude=longitude,
            )
            if not _allowed:
                return None, _deny
        except Exception as _14a_ex:
            logger.warning("[14A] Attendance login validator error (non-blocking): %s", _14a_ex)

        # ── Session + tokens ──────────────────────────────────────────────────
        await AuthService._revoke_sessions(user_id)

        token_data = {
            "sub":          user_id,
            "company_id":   company_id,
            "company_name": tenant.get("company_name", ""),
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
            "hrm_employee_id": hrm_employee_id,
            # Module flags — CRM + HRM always active for all tenants
            "crm_enabled":  True,
            "hrm_enabled":  True,
        }
        session_id = await AuthService._create_session(
            user_id, "company_user", company_id,
            ip_address=ip_address, device_info=device_info,
            device_fingerprint=device_fingerprint,
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
            full_name=user.get("full_name", ""),
            role="owner" if user.get("is_owner", False) else role_name,
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
            # HRM employee link
            "hrm_employee_id": hrm_employee_id,
            # Module flags — CRM + HRM always active for all tenants
            "crm_enabled": True,
            "hrm_enabled": True,
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

        # ── FIX 1: Lockout check before password attempt ──────────────────────
        _lo_err = AuthService._get_lockout_error(super_admin)
        if _lo_err:
            return None, _lo_err

        if not await asyncio.to_thread(verify_password, password, super_admin.get("password_hash", "")):
            # Increment failed attempts and apply lockout after threshold
            _sa_threshold, _sa_lockout_min = await AuthService._get_lockout_settings()
            _sa_new_count = (super_admin.get("failed_login_attempts", 0) or 0) + 1
            _sa_upd: dict = {"$inc": {"failed_login_attempts": 1}}
            if _sa_new_count >= _sa_threshold:
                _sa_upd["$set"] = {
                    "lockout_until": datetime.now(timezone.utc) + timedelta(minutes=_sa_lockout_min)
                }
            await master_db.super_admins.update_one({"_id": super_admin["_id"]}, _sa_upd)
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
                    "failed_login_attempts": 0,
                    "lockout_until": None,
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

        # ── FIX 2: Lockout check before password attempt ──────────────────────
        _sl_lo_err = AuthService._get_lockout_error(seller)
        if _sl_lo_err:
            return None, _sl_lo_err

        if not await asyncio.to_thread(verify_password, password, seller.get("password_hash", "")):
            _sl_threshold, _sl_lockout_min = await AuthService._get_lockout_settings()
            _sl_new_count = (seller.get("failed_login_attempts", 0) or 0) + 1
            _sl_upd: dict = {"$inc": {"failed_login_attempts": 1}}
            if _sl_new_count >= _sl_threshold:
                _sl_upd["$set"] = {
                    "lockout_until": datetime.now(timezone.utc) + timedelta(minutes=_sl_lockout_min)
                }
            await master_db.sellers.update_one({"_id": seller["_id"]}, _sl_upd)
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
            {"$set": {"last_login": datetime.now(timezone.utc), "failed_login_attempts": 0, "lockout_until": None}}
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

    # Default values — overridden at runtime by platform settings
    _LOCKOUT_THRESHOLD = 5
    _LOCKOUT_MINUTES   = 15

    @staticmethod
    async def _get_lockout_settings(company_id: str = "") -> tuple[int, int]:
        """
        Return (max_login_attempts, lockout_duration_minutes).

        When company_id is provided the config_resolution_service is consulted:
        if the tenant has enable_custom_security=True their values are used,
        otherwise falls through to platform settings.  Super-admin, seller, and
        global-user login paths pass company_id="" and always use platform settings.
        """
        try:
            from app.services.config_resolution_service import get_effective_lockout_settings
            return await get_effective_lockout_settings(company_id)
        except Exception:
            pass
        try:
            from app.services.platform_settings_service import get_max_login_attempts, get_lockout_duration_minutes
            threshold = await get_max_login_attempts()
            minutes   = await get_lockout_duration_minutes()
            return threshold, minutes
        except Exception:
            return AuthService._LOCKOUT_THRESHOLD, AuthService._LOCKOUT_MINUTES

    @staticmethod
    def _get_lockout_error(doc: dict) -> str:
        """
        Return a non-empty error string if doc has an active lockout window.
        doc may be a user dict (from company_db.users) or tenant.owner sub-dict.
        Returns "" if the user is not locked or the lockout has expired.
        """
        lockout_until = doc.get("lockout_until")
        if not lockout_until:
            return ""
        now = datetime.now(timezone.utc)
        if lockout_until.tzinfo is None:
            lockout_until = lockout_until.replace(tzinfo=timezone.utc)
        if lockout_until <= now:
            return ""  # lockout window has passed
        remaining = max(1, int((lockout_until - now).total_seconds() / 60) + 1)
        return (
            f"Account temporarily locked due to multiple failed login attempts. "
            f"Try again in {remaining} minute(s)."
        )

    @staticmethod
    async def _increment_failed_attempts(company_id: str, user_id: str, is_owner: bool):
        """Increment failed login attempts and apply a temporary lockout after threshold."""
        threshold, lockout_minutes = await AuthService._get_lockout_settings(company_id)
        now = datetime.now(timezone.utc)
        lockout_until = now + timedelta(minutes=lockout_minutes)

        if is_owner:
            master_db = get_master_db()
            await master_db.tenants.update_one(
                {"company_id": company_id},
                {"$inc": {"owner.failed_login_attempts": 1}},
            )
            doc = await master_db.tenants.find_one(
                {"company_id": company_id},
                {"owner.failed_login_attempts": 1},
            )
            if doc and doc.get("owner", {}).get("failed_login_attempts", 0) >= threshold:
                await master_db.tenants.update_one(
                    {"company_id": company_id},
                    {"$set": {"owner.lockout_until": lockout_until}},
                )
        else:
            company_db = get_company_db(company_id)
            await company_db.users.update_one(
                {"_id": user_id},
                {"$inc": {"failed_login_attempts": 1}},
            )
            doc = await company_db.users.find_one(
                {"_id": user_id},
                {"failed_login_attempts": 1},
            )
            if doc and doc.get("failed_login_attempts", 0) >= threshold:
                await company_db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"lockout_until": lockout_until}},
                )

    @staticmethod
    async def _update_last_login(company_id: str, user_id: str, is_owner: bool):
        """Update last login timestamp and clear any active lockout."""
        now = datetime.now(timezone.utc)

        if is_owner:
            master_db = get_master_db()
            await master_db.tenants.update_one(
                {"company_id": company_id},
                {
                    "$set": {
                        "owner.last_login": now,
                        "owner.failed_login_attempts": 0,
                        "owner.lockout_until": None,
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
                        "failed_login_attempts": 0,
                        "lockout_until": None,
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
        device_fingerprint: str = "",
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
            "device_fingerprint": device_fingerprint,
            "created_at": now,
            "last_activity_at": now,
            "expires_at": now + timedelta(hours=24),
            "is_active": True,
            "session_status": "active",
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
            try:
                from app.services.audit_service import AuditService
                await AuditService(company_db).log(
                    action="logout",
                    entity_type="user",
                    entity_id=user_id,
                    entity_name="",
                    user_id=user_id,
                    user_name="",
                    user_role="",
                    description="User logged out",
                )
            except Exception:
                pass

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
        _new_rtid: Optional[str] = None
        if jti:
            _master_db = get_master_db()
            now = datetime.now(timezone.utc)
            session = await _master_db.sessions.find_one({"_id": jti, "is_active": True})
            if not session:
                return None, "Session expired. Please log in again."
            # ── FIX 5: normalise naive datetimes from Motor before comparison ──
            _sess_exp = session.get("expires_at")
            if _sess_exp is not None and _sess_exp.tzinfo is None:
                _sess_exp = _sess_exp.replace(tzinfo=timezone.utc)
            if _sess_exp is not None and _sess_exp < now:
                return None, "Session expired. Please log in again."

            # ── Refresh token rotation ─────────────────────────────────────────
            # incoming_rtid is present only after the first rotation cycle.
            # Old tokens without rtid are accepted once (backward compatible),
            # then rotation is enforced on every subsequent refresh.
            incoming_rtid = refresh_token_payload.get("rtid")
            stored_rtid   = session.get("refresh_token_id")
            if incoming_rtid and stored_rtid and incoming_rtid != stored_rtid:
                # Replay attack: a previously used refresh token was re-submitted.
                logger.warning(
                    "[REFRESH] Token reuse detected | user=%s jti=%.8s", user_id, jti
                )
                return None, "Refresh token reuse detected. Please log in again."

            # Issue a new rotation ID and extend the rolling expiry window
            _new_rtid = str(uuid.uuid4())
            await _master_db.sessions.update_one(
                {"_id": jti},
                {"$set": {
                    "expires_at":       now + timedelta(hours=24),
                    "refresh_token_id": _new_rtid,
                    "last_activity_at": now,
                }},
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
            if jti:
                token_data["jti"] = jti  # preserve for session revocation

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
                "full_name": super_admin.get("full_name", ""),
            }
            # ── FIX 3: preserve jti so session revocation works for SuperAdmin ─
            if jti:
                token_data["jti"] = jti
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

            # ── Deactivated/suspended users must not be able to refresh tokens ──
            # Checks both the status field (set by admin deactivation / suspension)
            # and the legacy is_active boolean (older documents) so both paths block.
            if not user.get("is_owner") and (
                not user.get("is_active", True)
                or user.get("status") in ("inactive", "suspended")
            ):
                return None, "Your account has been deactivated. Please contact support."

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

            # Auto-resolve hrm_employee_id — three-path resolution (see _complete_company_login)
            hrm_employee_id = user.get("hrm_employee_id")
            if not hrm_employee_id and _user_type != "partner":
                import re as _re
                linked_emp = await company_db.hrm_employees.find_one(
                    {"crm_user_id": str(user_id), "is_deleted": False},
                    {"_id": 1},
                )
                if not linked_emp:
                    _email = (user.get("email") or "").strip()
                    if _email:
                        linked_emp = await company_db.hrm_employees.find_one(
                            {
                                "email": _re.compile(f"^{_re.escape(_email)}$", _re.IGNORECASE),
                                "is_deleted": False,
                            },
                            {"_id": 1},
                        )
                if linked_emp:
                    hrm_employee_id = str(linked_emp["_id"])
                    _raw_uid = user.get("_id") or user_id
                    await company_db.users.update_one(
                        {"_id": _raw_uid},
                        {"$set": {"hrm_employee_id": hrm_employee_id}},
                    )
                    await company_db.hrm_employees.update_one(
                        {"_id": hrm_employee_id},
                        {"$set": {"crm_user_id": str(user_id)}},
                    )

            token_data = {
                "sub": str(user_id),
                "company_id": company_id,
                "company_name": tenant.get("company_name", ""),
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
                "hrm_employee_id": hrm_employee_id,
            }

        access_token = create_access_token(token_data)
        refresh_payload: dict = {"sub": user_id, "company_id": company_id}
        if token_data.get("is_seller"):
            refresh_payload["is_seller"] = True
        if jti:
            refresh_payload["jti"] = jti  # preserve same session
        if _new_rtid:
            refresh_payload["rtid"] = _new_rtid  # rotation ID: reuse of old token rejected
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
                # Owner always has full permissions — use authoritative ROLE_DEFAULT_PERMISSIONS
                owner_perms = [p.value if hasattr(p, "value") else p
                               for p in ROLE_DEFAULT_PERMISSIONS.get(SystemRole.OWNER, [])]
                return owner_perms, ""
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
        logger.info("[RESET] initiate_password_reset called for email=%s", email)

        master_db = get_master_db()
        _EMAIL_UNAVAILABLE = (
            "Email service unavailable. Please try again later or contact support."
        )
        _EMAIL_OK = "Password reset instructions sent to your email"
        _NOT_FOUND = "If an account exists with this email, reset instructions have been sent"

        from app.services.email_service import send_password_reset_email as _send_reset

        # ── Super admin ───────────────────────────────────────────────────────
        logger.info("[RESET] checking super_admins collection for email=%s", email)
        super_admin = await master_db.super_admins.find_one(
            {"email": email, "is_deleted": {"$ne": True}}
        )
        logger.info("[RESET] super_admin lookup result: found=%s", super_admin is not None)
        if super_admin:
            logger.info("[RESET] user type=super_admin id=%s", super_admin.get("_id"))
            reset_token = generate_reset_token()
            logger.info("[RESET] token generated for super_admin email=%s token_prefix=%s...", email, reset_token[:8])
            await master_db.super_admins.update_one(
                {"_id": super_admin["_id"]},
                {"$set": {
                    "reset_token": reset_token,
                    "reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                }}
            )
            logger.info("[RESET] token saved to DB for super_admin email=%s", email)
            logger.info("[RESET] calling send_password_reset_email for email=%s", email)
            sent = await _send_reset(
                to_email=email,
                full_name=super_admin.get("full_name", "Admin"),
                reset_token=reset_token,
            )
            logger.info("[RESET] send_password_reset_email returned: sent=%s for email=%s", sent, email)
            if not sent:
                logger.error(
                    "[RESET] email FAILED for super_admin %s — token saved in DB", email
                )
                return False, _EMAIL_UNAVAILABLE
            logger.info("[RESET] SUCCESS — reset email sent to super_admin %s", email)
            return True, _EMAIL_OK

        # ── Tenant owner ──────────────────────────────────────────────────────
        logger.info("[RESET] checking master_db.tenants.owner.email for email=%s", email)
        tenant = await master_db.tenants.find_one({"owner.email": email})
        logger.info("[RESET] tenant owner lookup result: found=%s", tenant is not None)
        if tenant:
            logger.info(
                "[RESET] user type=tenant_owner company_id=%s tenant_id=%s",
                tenant.get("company_id"), tenant.get("_id"),
            )
            owner = tenant.get("owner", {})
            reset_token = generate_reset_token()
            logger.info("[RESET] token generated for tenant owner email=%s token_prefix=%s...", email, reset_token[:8])
            await master_db.tenants.update_one(
                {"_id": tenant["_id"]},
                {"$set": {
                    "owner.reset_token": reset_token,
                    "owner.reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                }}
            )
            logger.info("[RESET] token saved to DB for tenant owner email=%s", email)
            logger.info("[RESET] calling send_password_reset_email for email=%s full_name=%s", email, owner.get("full_name", ""))
            sent = await _send_reset(
                to_email=email,
                full_name=owner.get("full_name", ""),
                reset_token=reset_token,
            )
            logger.info("[RESET] send_password_reset_email returned: sent=%s for email=%s", sent, email)
            if not sent:
                logger.error(
                    "[RESET] email FAILED for tenant owner %s — token saved in DB", email
                )
                return False, _EMAIL_UNAVAILABLE
            logger.info("[RESET] SUCCESS — reset email sent to tenant owner %s", email)
            return True, _EMAIL_OK

        # ── Company users (global scan) ───────────────────────────────────────
        logger.info("[RESET] not found as super_admin or tenant owner — scanning company DBs for email=%s", email)
        tenant_count = await master_db.tenants.count_documents({"status": TenantStatus.ACTIVE})
        logger.info("[RESET] active tenants to scan: %d", tenant_count)

        tenants_cursor = master_db.tenants.find({"status": TenantStatus.ACTIVE})
        scanned = 0
        async for tenant in tenants_cursor:
            company_id = tenant.get("company_id", "")
            db_name = await DatabaseManager.resolve_company_db_name(company_id)
            logger.info("[RESET] scanning tenant company_id=%s resolved_db_name=%s", company_id, db_name)
            company_db = DatabaseManager.client[db_name]
            user = await company_db.users.find_one({"email": email, "is_deleted": {"$ne": True}})
            scanned += 1
            if user:
                logger.info(
                    "[RESET] user found in company_id=%s db_name=%s user_id=%s",
                    company_id, db_name, user.get("_id"),
                )
                reset_token = generate_reset_token()
                logger.info("[RESET] token generated for company user email=%s token_prefix=%s...", email, reset_token[:8])
                await company_db.users.update_one(
                    {"_id": user["_id"]},
                    {"$set": {
                        "reset_token": reset_token,
                        "reset_token_expiry": datetime.now(timezone.utc) + timedelta(hours=1),
                    }}
                )
                logger.info("[RESET] token saved to DB for company user email=%s company_id=%s", email, company_id)
                logger.info("[RESET] calling send_password_reset_email for email=%s full_name=%s", email, user.get("full_name", ""))
                sent = await _send_reset(
                    to_email=email,
                    full_name=user.get("full_name", ""),
                    reset_token=reset_token,
                )
                logger.info("[RESET] send_password_reset_email returned: sent=%s for email=%s", sent, email)
                if not sent:
                    logger.error(
                        "[RESET] email FAILED for company user %s in company %s — token saved in DB",
                        email, company_id,
                    )
                    return False, _EMAIL_UNAVAILABLE
                logger.info("[RESET] SUCCESS — reset email sent to company user %s", email)
                return True, _EMAIL_OK

        # Account not found — return generic message (anti-enumeration)
        logger.warning(
            "[RESET] email=%s NOT FOUND in any lookup (super_admin, tenant owner, or %d company DBs). "
            "No email sent. Returning generic message.",
            email, scanned,
        )
        return True, _NOT_FOUND

    # ──────────────────────────────────────────────────────────────────────────
    # Multi-company password reset helpers
    # ──────────────────────────────────────────────────────────────────────────

    @staticmethod
    async def lookup_accounts_for_reset(email: str) -> list:
        """
        Return all company accounts (owners + regular users) associated with email.
        Super-admin accounts are excluded — they use a separate reset path.
        Each entry: {company_id, company_name, user_type ("owner"|"user")}
        """
        from app.core.database import get_master_db, DatabaseManager

        master_db = get_master_db()
        _email = str(email).lower().strip()
        results = []
        seen_cids: set = set()

        # Tenant owners (same email can theoretically own multiple companies)
        async for tenant in master_db.tenants.find(
            {"owner.email": _email, "is_deleted": {"$ne": True}}
        ):
            cid = tenant.get("company_id", "")
            if cid:
                results.append({
                    "company_id": cid,
                    "company_name": tenant.get("company_name", ""),
                    "user_type": "owner",
                })
                seen_cids.add(cid)

        # Regular users across all company DBs
        async for tenant in master_db.tenants.find({"is_deleted": {"$ne": True}}):
            cid = tenant.get("company_id", "")
            if not cid or cid in seen_cids:
                continue
            try:
                company_db = await DatabaseManager.resolve_and_get_company_db(cid)
                user = await company_db.users.find_one(
                    {"email": _email, "is_deleted": {"$ne": True}}
                )
                if user:
                    results.append({
                        "company_id": cid,
                        "company_name": tenant.get("company_name", ""),
                        "user_type": "user",
                    })
                    seen_cids.add(cid)
            except Exception as exc:
                logger.warning("[RESET-LOOKUP] company_id=%s skipped: %s", cid, exc)

        return results

    @staticmethod
    async def initiate_scoped_password_reset(
        email: str,
        reset_scope: str = "auto",
        company_id: Optional[str] = None,
    ) -> Tuple[bool, str]:
        """
        Centralised, scope-aware password-reset initiator.

        reset_scope:
          "auto"   — detect from account count (1 company → single; 0 → generic msg)
          "single" — reset password for one specific company only
          "all"    — reset password across every company this email belongs to

        Stores a token in master_db.password_reset_tokens (new centralised collection).
        Super-admin accounts fall through to their own reset path (unchanged).
        """
        from app.core.database import get_master_db, DatabaseManager
        from app.core.security import generate_reset_token
        from app.services.email_service import send_password_reset_email as _send_reset

        master_db = get_master_db()
        _email = str(email).lower().strip()
        now = datetime.now(timezone.utc)

        _EMAIL_UNAVAILABLE = (
            "Email service unavailable. Please try again later or contact support."
        )
        _EMAIL_OK = "Password reset instructions sent to your email"
        _NOT_FOUND = (
            "If an account exists with this email, reset instructions have been sent"
        )

        logger.info(
            "[RESET-SCOPED] email=%s scope=%s company_id=%s", _email, reset_scope, company_id
        )

        # ── Super admin (unchanged path — token stored in super_admins collection) ──
        sa = await master_db.super_admins.find_one(
            {"email": _email, "is_deleted": {"$ne": True}}
        )
        if sa:
            token = generate_reset_token()
            await master_db.super_admins.update_one(
                {"_id": sa["_id"]},
                {"$set": {
                    "reset_token": token,
                    "reset_token_expiry": now + timedelta(hours=1),
                }},
            )
            sent = await _send_reset(
                to_email=_email,
                full_name=sa.get("full_name", "Admin"),
                reset_token=token,
            )
            if not sent:
                return False, _EMAIL_UNAVAILABLE
            logger.info("[RESET-SCOPED] super_admin reset sent: email=%s", _email)
            return True, _EMAIL_OK

        # ── Determine target company/companies ────────────────────────────────
        if reset_scope == "auto" or (reset_scope == "single" and not company_id):
            accounts = await AuthService.lookup_accounts_for_reset(_email)
            if not accounts:
                logger.warning("[RESET-SCOPED] no accounts found for email=%s", _email)
                return True, _NOT_FOUND
            reset_scope = "single"
            company_id = accounts[0]["company_id"]

        # ── Resolve full_name for the email in a given company ────────────────
        async def _get_full_name(cid: str) -> str:
            t = await master_db.tenants.find_one(
                {"company_id": cid, "is_deleted": {"$ne": True}}
            )
            if t and t.get("owner", {}).get("email", "").lower() == _email:
                return t.get("owner", {}).get("full_name", _email)
            try:
                cdb = await DatabaseManager.resolve_and_get_company_db(cid)
                u = await cdb.users.find_one({"email": _email, "is_deleted": {"$ne": True}})
                return u.get("full_name", _email) if u else _email
            except Exception:
                return _email

        # ── "all" scope — one token covers every company ──────────────────────
        if reset_scope == "all":
            accounts = await AuthService.lookup_accounts_for_reset(_email)
            if not accounts:
                return True, _NOT_FOUND
            full_name = await _get_full_name(accounts[0]["company_id"])
            token = generate_reset_token()
            await master_db.password_reset_tokens.insert_one({
                "_id": token,
                "email": _email,
                "reset_scope": "all",
                "company_id": None,
                "full_name": full_name,
                "created_at": now,
                "expires_at": now + timedelta(hours=1),
            })
            sent = await _send_reset(to_email=_email, full_name=full_name, reset_token=token)
            if not sent:
                await master_db.password_reset_tokens.delete_one({"_id": token})
                return False, _EMAIL_UNAVAILABLE
            logger.info(
                "[RESET-SCOPED] all-scope reset sent: email=%s companies=%d",
                _email, len(accounts),
            )
            return True, _EMAIL_OK

        # ── "single" scope — one token for one company ────────────────────────
        full_name = await _get_full_name(company_id)
        token = generate_reset_token()
        await master_db.password_reset_tokens.insert_one({
            "_id": token,
            "email": _email,
            "reset_scope": "single",
            "company_id": company_id,
            "full_name": full_name,
            "created_at": now,
            "expires_at": now + timedelta(hours=1),
        })
        sent = await _send_reset(to_email=_email, full_name=full_name, reset_token=token)
        if not sent:
            await master_db.password_reset_tokens.delete_one({"_id": token})
            return False, _EMAIL_UNAVAILABLE
        logger.info(
            "[RESET-SCOPED] single-scope reset sent: email=%s company=%s", _email, company_id
        )
        return True, _EMAIL_OK


# Singleton instance
auth_service = AuthService()
