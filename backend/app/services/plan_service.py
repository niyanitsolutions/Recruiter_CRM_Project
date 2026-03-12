"""
Plan Service
Handles subscription plan management
"""

from datetime import datetime, timezone
from typing import Optional, List, Tuple
import logging
import uuid

from app.core.database import get_master_db
from app.models.master.plan import PlanStatus, DEFAULT_PLANS

logger = logging.getLogger(__name__)


class PlanService:
    """
    Plan Management Service
    
    Handles:
    - Plan CRUD operations
    - Plan seeding
    - Plan lookup
    """
    
    @staticmethod
    async def seed_default_plans() -> int:
        """
        Upsert canonical plans (Trial / Neon / Quantum) and deactivate any
        legacy plans (basic, pro, enterprise) that are no longer in use.

        Returns:
            Number of plans created or updated.
        """
        master_db = get_master_db()
        canonical_names = {p["name"] for p in DEFAULT_PLANS}
        upserted = 0

        for plan_data in DEFAULT_PLANS:
            existing = await master_db.plans.find_one({"name": plan_data["name"]})
            if existing:
                await master_db.plans.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {**plan_data, "status": PlanStatus.ACTIVE, "updated_at": datetime.now(timezone.utc)}}
                )
                logger.info(f"✅ Plan updated: {plan_data['name']}")
            else:
                plan = {
                    "_id": str(uuid.uuid4()),
                    **plan_data,
                    "status": PlanStatus.ACTIVE,
                    "features": [],
                    "created_at": datetime.now(timezone.utc),
                    "updated_at": datetime.now(timezone.utc),
                }
                await master_db.plans.insert_one(plan)
                logger.info(f"✅ Plan created: {plan_data['name']}")
            upserted += 1

        # Deactivate legacy plans no longer in the canonical set
        await master_db.plans.update_many(
            {"name": {"$nin": list(canonical_names)}, "status": PlanStatus.ACTIVE},
            {"$set": {"status": PlanStatus.INACTIVE, "updated_at": datetime.now(timezone.utc)}}
        )

        return upserted
    
    @staticmethod
    async def get_plan(plan_id: str = None, name: str = None) -> Optional[dict]:
        """Get plan by ID or name"""
        master_db = get_master_db()
        
        if plan_id:
            return await master_db.plans.find_one({"_id": plan_id})
        elif name:
            return await master_db.plans.find_one({"name": name})
        return None
    
    @staticmethod
    async def list_plans(
        include_inactive: bool = False,
        include_trial: bool = True
    ) -> List[dict]:
        """
        List all available plans
        
        Returns:
            List of plans sorted by sort_order
        """
        master_db = get_master_db()
        
        query = {}
        
        if not include_inactive:
            query["status"] = PlanStatus.ACTIVE
        
        if not include_trial:
            query["is_trial_plan"] = False
        
        plans = await master_db.plans.find(query).sort("sort_order", 1).to_list(100)
        return plans
    
    @staticmethod
    async def create_plan(
        name: str,
        display_name: str,
        description: str = "",
        price_monthly: int = 0,
        price_quarterly: int = 0,
        price_yearly: int = 0,
        max_users: int = 5,
        max_candidates: int = 100,
        max_jobs: int = 10,
        max_partners: int = 5,
        is_trial_plan: bool = False,
        trial_days: int = 14,
        is_popular: bool = False,
        reseller_discount_percent: int = 0
    ) -> Tuple[Optional[dict], str]:
        """
        Create a new plan
        
        Returns:
            Tuple of (plan_data, error_message)
        """
        master_db = get_master_db()
        
        # Check if name already exists
        existing = await master_db.plans.find_one({"name": name})
        if existing:
            return None, "Plan with this name already exists"
        
        # Get next sort order
        last_plan = await master_db.plans.find_one(sort=[("sort_order", -1)])
        sort_order = (last_plan.get("sort_order", 0) + 1) if last_plan else 0
        
        plan = {
            "_id": str(uuid.uuid4()),
            "name": name,
            "display_name": display_name,
            "description": description,
            "price_monthly": price_monthly,
            "price_quarterly": price_quarterly,
            "price_yearly": price_yearly,
            "discount_quarterly_percent": 10,
            "discount_yearly_percent": 20,
            "reseller_discount_percent": reseller_discount_percent,
            "max_users": max_users,
            "max_candidates": max_candidates,
            "max_jobs": max_jobs,
            "max_partners": max_partners,
            "features": [],
            "is_trial_plan": is_trial_plan,
            "trial_days": trial_days,
            "status": PlanStatus.ACTIVE,
            "is_popular": is_popular,
            "sort_order": sort_order,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await master_db.plans.insert_one(plan)
        
        return plan, ""
    
    @staticmethod
    async def update_plan(
        plan_id: str,
        **updates
    ) -> Tuple[bool, str]:
        """Update plan details"""
        master_db = get_master_db()
        
        # Remove None values
        updates = {k: v for k, v in updates.items() if v is not None}
        
        if not updates:
            return False, "No updates provided"
        
        updates["updated_at"] = datetime.now(timezone.utc)
        
        result = await master_db.plans.update_one(
            {"_id": plan_id},
            {"$set": updates}
        )
        
        if result.modified_count == 0:
            return False, "Plan not found"
        
        return True, "Plan updated successfully"
    
    @staticmethod
    async def deactivate_plan(plan_id: str) -> Tuple[bool, str]:
        """Deactivate a plan (soft disable)"""
        master_db = get_master_db()
        
        # Check if any active tenants use this plan
        active_tenants = await master_db.tenants.count_documents({
            "plan_id": plan_id,
            "is_deleted": False,
            "status": {"$in": ["active", "pending"]}
        })
        
        if active_tenants > 0:
            return False, f"Cannot deactivate plan with {active_tenants} active tenants"
        
        result = await master_db.plans.update_one(
            {"_id": plan_id},
            {
                "$set": {
                    "status": PlanStatus.INACTIVE,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        if result.modified_count == 0:
            return False, "Plan not found"
        
        return True, "Plan deactivated successfully"
    
    @staticmethod
    async def get_plan_stats() -> dict:
        """Get plan statistics"""
        master_db = get_master_db()
        
        plans = await master_db.plans.find({"status": PlanStatus.ACTIVE}).to_list(100)
        
        stats = {
            "total_plans": len(plans),
            "plans_breakdown": []
        }
        
        for plan in plans:
            tenant_count = await master_db.tenants.count_documents({
                "plan_id": plan["_id"],
                "is_deleted": {"$ne": True}
            })
            
            stats["plans_breakdown"].append({
                "plan_name": plan["name"],
                "display_name": plan["display_name"],
                "tenant_count": tenant_count,
                "is_trial": plan.get("is_trial_plan", False)
            })
        
        return stats


# Singleton instance
plan_service = PlanService()