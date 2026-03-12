"""
Plan Checker Middleware
Validates plan status and enforces limits
"""

from fastapi import HTTPException, status, Depends
from datetime import datetime, timezone
import logging

from app.core.database import get_master_db
from app.middleware.auth import AuthContext, get_current_user

logger = logging.getLogger(__name__)


class PlanChecker:
    """
    Plan validation service
    
    Responsibilities:
    1. Check plan expiry
    2. Enforce feature limits
    3. Block access for expired plans
    """
    
    @staticmethod
    async def check_plan_validity(company_id: str) -> tuple[bool, str]:
        """
        Check if company's plan is valid
        
        Returns:
            Tuple of (is_valid, error_message)
        """
        master_db = get_master_db()
        
        tenant = await master_db.tenants.find_one({"company_id": company_id})
        if not tenant:
            return False, "Company not found"
        
        plan_expiry = tenant.get("plan_expiry")
        if plan_expiry:
            if isinstance(plan_expiry, str):
                plan_expiry = datetime.fromisoformat(plan_expiry.replace('Z', '+00:00'))
            
            if plan_expiry < datetime.now(timezone.utc):
                return False, "Your subscription has expired. Please renew to continue."
        
        return True, ""
    
    @staticmethod
    async def get_plan_limits(company_id: str) -> dict:
        """
        Get current plan limits for a company
        
        Returns:
            Dictionary with limit values (-1 means unlimited)
        """
        master_db = get_master_db()
        
        tenant = await master_db.tenants.find_one({"company_id": company_id})
        if not tenant:
            return {}
        
        plan_id = tenant.get("plan_id")
        plan = await master_db.plans.find_one({"_id": plan_id})
        
        if not plan:
            return {}
        
        return {
            "max_users": plan.get("max_users", 5),
            "max_candidates": plan.get("max_candidates", 100),
            "max_jobs": plan.get("max_jobs", 10),
            "max_partners": plan.get("max_partners", 5)
        }
    
    @staticmethod
    async def check_limit(company_id: str, resource: str, current_count: int) -> tuple[bool, str]:
        """
        Check if adding one more resource would exceed the limit
        
        Args:
            company_id: Company identifier
            resource: Resource type (users, candidates, jobs, partners)
            current_count: Current count of the resource
        
        Returns:
            Tuple of (is_allowed, error_message)
        """
        limits = await PlanChecker.get_plan_limits(company_id)
        
        limit_key = f"max_{resource}"
        max_limit = limits.get(limit_key, -1)
        
        # -1 means unlimited
        if max_limit == -1:
            return True, ""
        
        if current_count >= max_limit:
            return False, f"You have reached the maximum limit of {max_limit} {resource}. Please upgrade your plan."
        
        return True, ""


async def validate_plan(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
    """
    Dependency to validate plan status
    
    Use this on endpoints that should be blocked for expired plans
    
    Usage:
        @router.post("/candidates")
        async def add_candidate(
            auth: AuthContext = Depends(validate_plan)
        ):
            ...
    """
    if auth.is_super_admin:
        return auth
    
    is_valid, error = await PlanChecker.check_plan_validity(auth.company_id)
    if not is_valid:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail=error
        )
    
    return auth


def check_resource_limit(resource: str):
    """
    Factory function to create resource limit checking dependency
    
    Usage:
        @router.post("/users")
        async def add_user(
            auth: AuthContext = Depends(check_resource_limit("users"))
        ):
            ...
    """
    async def limit_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if auth.is_super_admin:
            return auth
        
        from app.core.database import get_company_db
        db = get_company_db(auth.company_id)
        
        # Get current count
        collection_name = resource
        if resource == "partners":
            # Partners are users with role "partner"
            current_count = await db.users.count_documents({
                "role": "partner",
                "is_deleted": False
            })
        else:
            current_count = await db.get_collection(collection_name).count_documents({
                "is_deleted": False
            })
        
        is_allowed, error = await PlanChecker.check_limit(
            auth.company_id, resource, current_count
        )
        
        if not is_allowed:
            raise HTTPException(
                status_code=status.HTTP_402_PAYMENT_REQUIRED,
                detail=error
            )
        
        return auth
    
    return limit_checker