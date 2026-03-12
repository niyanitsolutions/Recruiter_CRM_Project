"""
Tenant Resolver
Resolves and validates tenant context for multi-tenant isolation
"""

from typing import Optional, Tuple
from datetime import datetime, timezone
import logging
import re

from app.core.database import get_master_db, get_company_db
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
        # Check tenant status — only hard-block suspended/cancelled accounts
        status = tenant.get("status")
        if status == TenantStatus.SUSPENDED:
            return False, "Company account is suspended. Please contact support."
        if status == TenantStatus.CANCELLED:
            return False, "Company account has been cancelled. Please contact support."
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
        identifier: str
    ) -> Tuple[Optional[dict], Optional[dict], str]:
        """
        Full login resolution flow

        Steps:
        1. Single $or query in master_db for a tenant whose owner matches
           any of username / email / mobile.
        2. If not owner, single $or query per company database.
        3. Validate tenant access.

        Returns:
            Tuple of (tenant, user, error_message)
        """
        master_db = get_master_db()
        # Both username and email are case-insensitive; mobile is exact
        ci_pattern = re.compile(f"^{re.escape(identifier)}$", re.IGNORECASE)

        # ── Step 1: check tenant owners (single query, all three fields) ──────
        tenant = await master_db.tenants.find_one({
            "$or": [
                {"owner.username": ci_pattern},
                {"owner.email":    ci_pattern},
                {"owner.mobile":   identifier},
            ]
        })

        if tenant:
            is_valid, error = await TenantResolver.validate_tenant_access(tenant)
            if not is_valid:
                # Elevate to owner-specific code so the login endpoint can offer upgrade flow
                if error.startswith("SUBSCRIPTION_EXPIRED"):
                    error = "SUBSCRIPTION_EXPIRED_OWNER" + error[len("SUBSCRIPTION_EXPIRED"):]
                return tenant, None, error

            owner_basic = tenant.get("owner", {})
            company_id  = tenant.get("company_id")

            # Prefer the owner's full record from company_db.users so that any
            # permission overrides set via the admin UI are honoured at login time.
            # (master_db.tenants.owner only stores basic fields — no override_permissions.)
            user = None
            if company_id:
                company_db = get_company_db(company_id)
                owner_id   = str(owner_basic.get("_id", ""))
                if owner_id:
                    user = await company_db.users.find_one(
                        {"_id": owner_id, "is_deleted": False}
                    )

            if not user:
                # Fallback: construct from master_db owner dict
                user = dict(owner_basic)

            user["role"]     = "admin"   # owner is always admin
            user["is_owner"] = True
            return tenant, user, ""

        # ── Step 2: search company users (single $or query per tenant) ────────
        # Include expired/trial_expired tenants so we can return the right error.
        tenants_cursor = master_db.tenants.find(
            {"status": {"$nin": [TenantStatus.CANCELLED]}}
        )

        async for tenant in tenants_cursor:
            company_id = tenant.get("company_id")
            company_db = get_company_db(company_id)

            # Find user first — then check tenant validity
            user = await company_db.users.find_one({
                "is_deleted": False,
                "$or": [
                    {"username": ci_pattern},
                    {"email":    ci_pattern},
                    {"mobile":   identifier},
                ]
            })
            if not user:
                continue

            is_valid, error = await TenantResolver.validate_tenant_access(tenant)
            if not is_valid:
                return tenant, None, error

            return tenant, user, ""

        return None, None, "Invalid credentials"


# Singleton instance
tenant_resolver = TenantResolver()