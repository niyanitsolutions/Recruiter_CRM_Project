"""
Plans API Endpoints
Subscription plan management
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional
import logging
from pydantic import BaseModel

from app.middleware.auth import get_current_user, require_super_admin, AuthContext
from app.services.plan_service import plan_service
from app.models.master.plan import PlanStatus


class PlanCreateRequest(BaseModel):
    name: str
    display_name: str
    description: str = ""
    price_monthly: int = 0
    price_quarterly: int = 0
    price_yearly: int = 0
    max_users: int = 5
    max_candidates: int = 100
    max_jobs: int = 10
    max_partners: int = 5
    is_trial_plan: bool = False
    trial_days: int = 14
    is_popular: bool = False
    reseller_discount_percent: int = 0


class PlanUpdateRequest(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    price_monthly: Optional[int] = None
    price_quarterly: Optional[int] = None
    price_yearly: Optional[int] = None
    max_users: Optional[int] = None
    max_candidates: Optional[int] = None
    max_jobs: Optional[int] = None
    max_partners: Optional[int] = None
    is_popular: Optional[bool] = None
    reseller_discount_percent: Optional[int] = None

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/")
async def list_plans(
    include_inactive: bool = Query(False, description="Include inactive plans"),
    include_trial: bool = Query(True, description="Include trial plans")
):
    """
    List all available subscription plans

    Public endpoint - used during registration
    """
    plans = await plan_service.list_plans(
        include_inactive=include_inactive,
        include_trial=include_trial
    )

    return {
        "plans": [
            {
                "id": plan["_id"],
                "name": plan["name"],
                "display_name": plan["display_name"],
                "description": plan.get("description", ""),
                "price_monthly": plan.get("price_monthly", 0),
                "price_quarterly": plan.get("price_quarterly", 0),
                "price_yearly": plan.get("price_yearly", 0),
                "max_users": plan.get("max_users", 5),
                "max_candidates": plan.get("max_candidates", 100),
                "max_jobs": plan.get("max_jobs", 10),
                "max_partners": plan.get("max_partners", 5),
                "is_trial": plan.get("is_trial_plan", False),
                "trial_days": plan.get("trial_days", 14),
                "is_popular": plan.get("is_popular", False),
                "status": plan.get("status", "active"),
                "reseller_discount_percent": plan.get("reseller_discount_percent", 0)
            }
            for plan in plans
        ]
    }


@router.get("/{plan_id}")
async def get_plan(plan_id: str):
    """
    Get plan details by ID
    
    Public endpoint
    """
    plan = await plan_service.get_plan(plan_id=plan_id)
    
    if not plan:
        plan = await plan_service.get_plan(name=plan_id)
    
    if not plan:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Plan not found"
        )
    
    return {
        "id": plan["_id"],
        "name": plan["name"],
        "display_name": plan["display_name"],
        "description": plan.get("description", ""),
        "price_monthly": plan.get("price_monthly", 0),
        "price_quarterly": plan.get("price_quarterly", 0),
        "price_yearly": plan.get("price_yearly", 0),
        "max_users": plan.get("max_users", 5),
        "max_candidates": plan.get("max_candidates", 100),
        "max_jobs": plan.get("max_jobs", 10),
        "max_partners": plan.get("max_partners", 5),
        "features": plan.get("features", []),
        "is_trial": plan.get("is_trial_plan", False),
        "trial_days": plan.get("trial_days", 14),
        "is_popular": plan.get("is_popular", False),
        "status": plan.get("status", "active"),
        "reseller_discount_percent": plan.get("reseller_discount_percent", 0)
    }


@router.post("/", dependencies=[Depends(require_super_admin)])
async def create_plan(data: PlanCreateRequest):
    """
    Create a new subscription plan

    SuperAdmin only endpoint
    """
    plan, error = await plan_service.create_plan(
        name=data.name,
        display_name=data.display_name,
        description=data.description,
        price_monthly=data.price_monthly,
        price_quarterly=data.price_quarterly,
        price_yearly=data.price_yearly,
        max_users=data.max_users,
        max_candidates=data.max_candidates,
        max_jobs=data.max_jobs,
        max_partners=data.max_partners,
        is_trial_plan=data.is_trial_plan,
        trial_days=data.trial_days,
        is_popular=data.is_popular,
        reseller_discount_percent=data.reseller_discount_percent,
    )

    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )

    return {
        "success": True,
        "message": "Plan created successfully",
        "plan_id": plan["_id"]
    }


@router.put("/{plan_id}", dependencies=[Depends(require_super_admin)])
async def update_plan(plan_id: str, data: PlanUpdateRequest):
    """
    Update plan details

    SuperAdmin only endpoint
    """
    success, message = await plan_service.update_plan(
        plan_id,
        **{k: v for k, v in data.model_dump().items() if v is not None},
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )

    return {"success": True, "message": message}


@router.patch("/{plan_id}/toggle", dependencies=[Depends(require_super_admin)])
async def toggle_plan(plan_id: str):
    """
    Toggle plan active/inactive status

    SuperAdmin only endpoint
    """
    plan = await plan_service.get_plan(plan_id=plan_id)
    if not plan:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Plan not found")

    if plan.get("status") == PlanStatus.ACTIVE:
        success, message = await plan_service.deactivate_plan(plan_id)
    else:
        success, message = await plan_service.update_plan(plan_id, status=PlanStatus.ACTIVE)

    if not success:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    return {"success": True, "message": message}


@router.delete("/{plan_id}", dependencies=[Depends(require_super_admin)])
async def deactivate_plan(plan_id: str):
    """
    Deactivate a plan (soft disable)
    
    SuperAdmin only endpoint
    """
    success, message = await plan_service.deactivate_plan(plan_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"success": True, "message": message}


@router.get("/stats/overview", dependencies=[Depends(require_super_admin)])
async def get_plan_stats():
    """
    Get plan statistics
    
    SuperAdmin only endpoint
    """
    stats = await plan_service.get_plan_stats()
    return stats


@router.post("/upgrade")
async def upgrade_plan(
    plan_id: str,
    billing_cycle: str = "monthly",
    auth: AuthContext = Depends(get_current_user)
):
    """
    Initiate plan upgrade for current tenant
    
    Returns Razorpay order details for payment
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="SuperAdmin cannot upgrade plans"
        )
    
    from app.services.payment_service import payment_service
    from app.services.tenant_service import tenant_service
    
    tenant = await tenant_service.get_tenant(company_id=auth.company_id)
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    result, error = await payment_service.create_razorpay_order(
        tenant_id=tenant["_id"],
        plan_id=plan_id,
        billing_cycle=billing_cycle
    )
    
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=error
        )
    
    return result