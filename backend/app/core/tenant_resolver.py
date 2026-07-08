"""
Tenant Resolver
Resolves and validates tenant context for multi-tenant isolation
"""

from typing import Optional, Tuple
from datetime import datetime, timezone
import logging
import re

from app.core.database import get_master_db, get_company_db, DatabaseManager
from app.models.master.tenant import TenantStatus

logger = logging.getLogger(__name__)


class TenantResolver:
    """
    Tenant Resolution Service
    
    Responsibilities:
    1. Resolve company from user credentials
    2. Validate plan status
    3. Block access if plan expired
    4. Provide correct database connection
    """
    
    @staticmethod
    async def resolve_by_user_identifier(
        identifier: str,
        identifier_type: str = "username"
    ) -> Optional[dict]:
        """
        Resolve tenant by user identifier
        
        Args:
            identifier: Username, email, mobile, or full name
            identifier_type: Type of identifier (username, email, mobile, full_name)
        
        Returns:
            Tenant document if found and valid, None otherwise
        """
        master_db = get_master_db()
        
        # Search in tenants collection for users matching the identifier
        # First, we need to find which tenant this user belongs to
        query = {}
        
        if identifier_type == "username":
            query = {"owner.username": identifier}
        elif identifier_type == "email":
            query = {"owner.email": identifier}
        elif identifier_type == "mobile":
            query = {"owner.mobile": identifier}
        elif identifier_type == "full_name":
            query = {"owner.full_name": {"$regex": f"^{identifier}$", "$options": "i"}}
        
        tenant = await master_db.tenants.find_one(query)
        return tenant
    
    @staticmethod
    async def resolve_by_company_id(company_id: str) -> Optional[dict]:
        """
        Resolve tenant by company ID
        
        Args:
            company_id: The unique company identifier
        
        Returns:
            Tenant document if found, None otherwise
        """
        master_db = get_master_db()
        tenant = await master_db.tenants.find_one({"company_id": company_id})
        return tenant
    
    @staticmethod
    async def validate_tenant_access(tenant: dict) -> Tuple[bool, str]:
        """
        Validate if tenant can access the system
        
        Checks:
        1. Tenant status is active
        2. Plan is not expired
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        # Check tenant status — only hard-block suspended/cancelled/deleted accounts
        status = tenant.get("status")
        if status == TenantStatus.SUSPENDED:
            return False, "Company account is suspended. Please contact support."
        if status == TenantStatus.CANCELLED:
            return False, "Company account has been cancelled. Please contact support."
        if status == TenantStatus.DELETED:
            return False, "Company account has been deleted. Please contact support to restore it."
        if status == TenantStatus.TRIAL_EXPIRED:
            return False, "SUBSCRIPTION_EXPIRED|None|Your trial has expired. Please subscribe to a plan to continue."

        # Check plan expiry
        plan_expiry = tenant.get("plan_expiry")
        if plan_expiry:
            if isinstance(plan_expiry, str):
                plan_expiry = datetime.fromisoformat(plan_expiry.replace('Z', '+00:00'))
            # MongoDB may return naive datetimes — treat as UTC
            if plan_expiry.tzinfo is None:
                plan_expiry = plan_expiry.replace(tzinfo=timezone.utc)

            if plan_expiry < datetime.now(timezone.utc):
                # Lazy queue activation: a queued "activate after expiry" plan
                # takes over automatically the moment the tenant is validated.
                # activate_due_for_tenant mutates the tenant dict in place on
                # success, so re-checking plan_expiry below sees the new plan.
                try:
                    from app.services.subscription_queue_service import SubscriptionQueueService
                    if await SubscriptionQueueService.activate_due_for_tenant(tenant):
                        new_expiry = tenant.get("plan_expiry")
                        if new_expiry and new_expiry.tzinfo is None:
                            new_expiry = new_expiry.replace(tzinfo=timezone.utc)
                        if new_expiry and new_expiry > datetime.now(timezone.utc):
                            return True, ""
                except Exception as _queue_exc:
                    # Queue activation must never break login validation
                    import logging
                    logging.getLogger(__name__).warning(
                        "Queued-plan activation failed during login validation: %s", _queue_exc
                    )

                expiry_iso = plan_expiry.isoformat()
                return False, f"SUBSCRIPTION_EXPIRED|{expiry_iso}|Your subscription has expired. Please renew your plan to continue."

        return True, ""
    
    @staticmethod
    async def get_tenant_database(company_id: str):
        """
        Get the database connection for a specific tenant
        
        This is the main entry point for tenant-isolated database access
        """
        return get_company_db(company_id)
    
    @staticmethod
    async def find_user_in_company(
        company_id: str,
        identifier: str,
        identifier_type: str = "any"
    ) -> Optional[dict]:
        """
        Find a user within a specific company's database.

        When identifier_type is "any" (default), a single $or query checks
        username, email (case-insensitive), and mobile simultaneously.
        A specific type can still be passed for targeted lookups.
        """
        company_db = get_company_db(company_id)

        if identifier_type == "any":
            email_pattern = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)
            query = {
                "is_deleted": False,
                "$or": [
                    {"username": identifier},
                    {"email":    email_pattern},
                    {"mobile":   identifier},
                ]
            }
        else:
            query = {"is_deleted": False}
            if identifier_type == "username":
                query["username"] = identifier
            elif identifier_type == "email":
                query["email"] = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)
            elif identifier_type == "mobile":
                query["mobile"] = identifier
            elif identifier_type == "full_name":
                query["full_name"] = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)

        return await company_db.users.find_one(query)
    
    @staticmethod
    def _identifier_query(identifier: str) -> dict:
        """
        Build a single $or query that matches any of the three identifier
        fields (username, email, mobile) simultaneously.

        Email comparison is case-insensitive; username and mobile are exact.
        Using one query instead of three sequential ones avoids partial
        failures (e.g. a suspended tenant matching on username prevents
        the correct tenant from being found via email).
        """
        email_pattern = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)
        return {
            "$or": [
                {"username": identifier},
                {"email": email_pattern},
                {"mobile": identifier},
            ]
        }

    @staticmethod
    async def resolve_login_context(
        identifier: str,
        company_code: Optional[str] = None,
    ) -> Tuple[Optional[dict], Optional[dict], str]:
        """
        Full login resolution flow.

        `identifier` must be an email address or mobile number — username is
        not an accepted login credential on the global login page. A username
        can legitimately collide across different tenants in this multi-tenant
        CRM, so it must never resolve identity here (usernames remain fully
        supported everywhere else in the system — user profiles, employee
        records, etc. — this restriction is login-only).

        When company_code is provided (recommended path):
          1. Look up the tenant by company_code — fail immediately if not found.
          2. Validate tenant access (status, expiry).
          3. Search ONLY that company's DB for the user.
          This prevents any cross-tenant credential match.

        When company_code is omitted (backward-compatible fallback):
          1. Single $or query in master_db for a tenant whose owner matches
             email / mobile.
          2. If no owner match, single $or query per company database.
          3. Validate tenant access at each step.

        Returns:
            Tuple of (tenant, user, error_message)
        """
        master_db = get_master_db()
        ci_pattern = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)

        # ── Fast path: company_code provided → single-tenant scope ───────────
        if company_code:
            tenant = await master_db.tenants.find_one(
                {"company_id": company_code.strip(), "is_deleted": {"$ne": True}}
            )
            if not tenant:
                logger.warning(
                    "Login attempt with unknown company_code=%s identifier=%s",
                    company_code, identifier
                )
                return None, None, "Invalid credentials"

            is_valid, error = await TenantResolver.validate_tenant_access(tenant)
            if not is_valid:
                if error.startswith("SUBSCRIPTION_EXPIRED"):
                    # Check if this is the owner to set the right error prefix.
                    # Username is not an accepted login credential (see below) —
                    # only email/mobile identify the owner here.
                    owner = tenant.get("owner", {})
                    owner_ci = re.compile(
                        f"^{re.escape(identifier)}$", re.IGNORECASE
                    )
                    is_owner_login = (
                        owner_ci.match(owner.get("email", ""))
                        or owner.get("mobile") == identifier
                    )
                    if is_owner_login:
                        error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                return tenant, None, error

            company_id = tenant.get("company_id")
            company_db = await DatabaseManager.resolve_and_get_company_db(company_id)

            # Check if the identifier matches the owner first. Username is not
            # an accepted login credential — only email or mobile authenticate
            # (a username can collide across tenants in this multi-tenant CRM,
            # so it must never resolve identity on the global login page).
            owner_basic = tenant.get("owner", {})
            owner_ci = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)
            is_owner_match = (
                owner_ci.match(owner_basic.get("email", ""))
                or owner_basic.get("mobile") == identifier
            )

            if is_owner_match:
                owner_id = str(owner_basic.get("_id", ""))
                user = None
                if owner_id:
                    user = await company_db.users.find_one(
                        {"_id": owner_id, "is_deleted": False}
                    )
                if not user:
                    user = dict(owner_basic)
                user["role"]     = "admin"
                user["is_owner"] = True
                return tenant, user, ""

            # Not the owner — search company users. Username is not an accepted
            # login credential (see class docstring / resolve_login_context
            # docstring) — only email or mobile authenticate.
            user = await company_db.users.find_one({
                "is_deleted": False,
                "$or": [
                    {"email":  ci_pattern},
                    {"mobile": identifier},
                ],
            })
            if not user:
                logger.warning(
                    "Login failed: user not found in company_code=%s identifier=%s",
                    company_code, identifier
                )
                return None, None, "Invalid credentials"

            return tenant, user, ""

        # ── Fallback: global search (backward-compatible, no company_code) ────
        # Step 1: check tenant owners (email/mobile only — username is not an
        # accepted login credential, see resolve_login_context docstring)
        tenant = await master_db.tenants.find_one({
            "$or": [
                {"owner.email":  ci_pattern},
                {"owner.mobile": identifier},
            ]
        })

        if tenant:
            is_valid, error = await TenantResolver.validate_tenant_access(tenant)
            if not is_valid:
                if error.startswith("SUBSCRIPTION_EXPIRED"):
                    error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                return tenant, None, error

            owner_basic = tenant.get("owner", {})
            company_id  = tenant.get("company_id")

            user = None
            if company_id:
                company_db = await DatabaseManager.resolve_and_get_company_db(company_id)
                owner_id   = str(owner_basic.get("_id", ""))
                if owner_id:
                    user = await company_db.users.find_one(
                        {"_id": owner_id, "is_deleted": False}
                    )

            if not user:
                user = dict(owner_basic)

            user["role"]     = "admin"
            user["is_owner"] = True
            return tenant, user, ""

        # Step 2: search company users across all active tenants
        tenants_cursor = master_db.tenants.find(
            {"status": {"$nin": [TenantStatus.CANCELLED]}}
        )

        async for tenant in tenants_cursor:
            company_id = tenant.get("company_id")
            company_db = await DatabaseManager.resolve_and_get_company_db(company_id)

            # Username is not an accepted login credential — only email/mobile.
            user = await company_db.users.find_one({
                "is_deleted": False,
                "$or": [
                    {"email":  ci_pattern},
                    {"mobile": identifier},
                ]
            })
            if not user:
                continue

            is_valid, error = await TenantResolver.validate_tenant_access(tenant)
            if not is_valid:
                return tenant, None, error

            return tenant, user, ""

        return None, None, "Invalid credentials"


    @staticmethod
    async def find_all_company_user_matches(identifier: str) -> list:
        """
        Scan every non-cancelled tenant DB and return ALL (tenant, user) pairs
        whose user document matches identifier (email / mobile — username is
        not an accepted login credential on the global login page).

        Unlike resolve_login_context, this returns every match so the caller
        can verify passwords independently and detect same-password multi-tenant
        scenarios (e.g. a partner registered in two companies).

        Returns:
            List of (tenant_doc, user_doc) tuples — may be empty.
        """
        master_db = get_master_db()
        ci_pattern = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)

        matches: list = []
        tenants_cursor = master_db.tenants.find(
            {"status": {"$nin": [TenantStatus.CANCELLED]}}
        )
        async for tenant in tenants_cursor:
            company_id = tenant.get("company_id")
            if not company_id:
                continue
            company_db = await DatabaseManager.resolve_and_get_company_db(company_id)
            user = await company_db.users.find_one({
                "is_deleted": False,
                "$or": [
                    {"email":  ci_pattern},
                    {"mobile": identifier},
                ],
            })
            if user:
                matches.append((tenant, user))

        return matches


# Singleton instance
tenant_resolver = TenantResolver()