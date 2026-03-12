"""
SuperAdmin API Endpoints
Global administration for tenants, plans, and analytics
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, List
from datetime import datetime, timezone
import logging
import uuid

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.services.tenant_service import tenant_service
from app.services.plan_service import plan_service
from app.services.payment_service import payment_service
from app.services.seller_service import SellerService
from app.core.security import hash_password
from app.models.master.super_admin import SuperAdminStatus
from app.models.master.tenant import TenantAdminCreate, TenantAdminCreateWithPayment

logger = logging.getLogger(__name__)

router = APIRouter()


@router.get("/dashboard")
async def get_dashboard(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """
    SuperAdmin dashboard data

    Returns:
    - Tenant statistics
    - Revenue statistics
    - Plan statistics
    - Seller statistics
    - Expiring subscription counts
    """
    tenant_stats = await tenant_service.get_tenant_stats()
    revenue_stats = await payment_service.get_revenue_stats()
    plan_stats = await plan_service.get_plan_stats()
    seller_stats = await SellerService.get_platform_seller_stats(master_db)

    # Expiring in next 30 days
    now = datetime.now(timezone.utc)
    expiring_soon = await master_db.tenants.count_documents({
        "is_deleted": {"$ne": True},
        "status": "active",
        "plan_expiry": {"$gte": now, "$lte": datetime.fromtimestamp(
            now.timestamp() + 30 * 86400, tz=timezone.utc
        )},
    })
    expired = await master_db.tenants.count_documents({
        "is_deleted": {"$ne": True},
        "plan_expiry": {"$lt": now},
    })

    return {
        "tenants": tenant_stats,
        "revenue": revenue_stats,
        "plans": plan_stats,
        "sellers": seller_stats,
        "subscriptions": {
            "expiring_soon": expiring_soon,
            "expired": expired,
        },
    }


@router.get("/tenants")
async def list_tenants(
    auth: AuthContext = Depends(require_super_admin),
    status: Optional[str] = Query(None, description="Filter by status"),
    is_trial: Optional[bool] = Query(None, description="Filter by trial status"),
    search: Optional[str] = Query(None, description="Search by company name or email"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    List all tenants with filters and pagination
    
    SuperAdmin only endpoint
    """
    tenants, total = await tenant_service.list_tenants(
        status=status,
        is_trial=is_trial,
        search=search,
        page=page,
        limit=limit
    )
    
    return {
        "tenants": tenants,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/tenants/{tenant_id}")
async def get_tenant(
    tenant_id: str,
    auth: AuthContext = Depends(require_super_admin)
):
    """
    Get tenant details by ID
    """
    tenant = await tenant_service.get_tenant(tenant_id=tenant_id)
    
    if not tenant:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Tenant not found"
        )
    
    # Remove sensitive data
    if "owner" in tenant:
        tenant["owner"].pop("password_hash", None)
    
    return tenant


@router.put("/tenants/{tenant_id}/status")
async def update_tenant_status(
    tenant_id: str,
    new_status: str,
    auth: AuthContext = Depends(require_super_admin)
):
    """
    Update tenant status
    
    Valid statuses: active, suspended, cancelled
    """
    valid_statuses = ["active", "suspended", "cancelled", "pending", "trial_expired"]
    
    if new_status not in valid_statuses:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}"
        )
    
    success, message = await tenant_service.update_tenant_status(
        tenant_id, new_status, auth.user_id
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"success": True, "message": message}


@router.post("/tenants/create", status_code=status.HTTP_201_CREATED)
async def create_tenant_without_payment(
    data: TenantAdminCreate,
    auth: AuthContext = Depends(require_super_admin),
):
    """
    Super Admin creates a tenant WITHOUT a recorded payment.

    - payment_status = 'manual_by_admin'
    - plan_start_date = now
    - plan_expiry = now + plan_duration_days
    - email_verified = True (admin vouches)
    - Tenant can login immediately

    Use for: demo accounts, manual onboarding, partner accounts.
    """
    result, error = await tenant_service.create_tenant_by_admin(
        data=data,
        created_by=auth.user_id,
        with_payment=False,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"success": True, "message": "Tenant created successfully", "data": result}


@router.post("/tenants/create-with-payment", status_code=status.HTTP_201_CREATED)
async def create_tenant_with_payment(
    data: TenantAdminCreateWithPayment,
    auth: AuthContext = Depends(require_super_admin),
):
    """
    Super Admin creates a tenant WITH a recorded offline payment.

    - payment_status = 'paid'
    - plan_start_date = payment_date
    - plan_expiry = payment_date + plan_duration_days
    - email_verified = True
    - Payment record created with seller commission breakdown
    - Seller tenant count updated if seller_id provided

    Payment modes: upi, bank_transfer, cash
    """
    result, error = await tenant_service.create_tenant_by_admin(
        data=data,
        created_by=auth.user_id,
        with_payment=True,
    )
    if error:
        raise HTTPException(status_code=400, detail=error)
    return {"success": True, "message": "Tenant created with payment recorded", "data": result}


@router.delete("/tenants/{tenant_id}")
async def delete_tenant(
    tenant_id: str,
    auth: AuthContext = Depends(require_super_admin)
):
    """
    Soft delete a tenant
    
    This will:
    - Mark tenant as deleted
    - Set status to cancelled
    - Block all users from logging in
    """
    success, message = await tenant_service.soft_delete_tenant(tenant_id, auth.user_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=message
        )
    
    return {"success": True, "message": message}


@router.get("/payments")
async def list_payments(
    auth: AuthContext = Depends(require_super_admin),
    tenant_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100)
):
    """
    List all payments with filters
    """
    payments, total = await payment_service.get_payment_history(
        tenant_id=tenant_id,
        status=status,
        page=page,
        limit=limit
    )
    
    return {
        "payments": payments,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit
    }


@router.get("/analytics")
async def get_analytics(auth: AuthContext = Depends(require_super_admin)):
    """
    Get detailed analytics for SuperAdmin
    
    Returns:
    - Growth metrics
    - Conversion rates
    - Revenue trends
    """
    from app.core.database import get_master_db
    master_db = get_master_db()
    
    # Get monthly signup trend (last 6 months)
    # This is a simplified version - in production, use proper aggregation
    
    return {
        "growth": {
            "new_tenants_this_month": 0,  # Implement actual calculation
            "growth_rate": 0,
            "churn_rate": 0
        },
        "conversion": {
            "trial_to_paid": 0,  # Implement actual calculation
            "signup_rate": 0
        },
        "revenue": {
            "mrr": 0,  # Monthly Recurring Revenue
            "arr": 0,  # Annual Recurring Revenue
            "average_revenue_per_tenant": 0
        }
    }


@router.post("/seed-plans")
async def seed_plans(auth: AuthContext = Depends(require_super_admin)):
    """
    Seed default plans into the database
    
    Use this to initialize plans on first setup
    """
    count = await plan_service.seed_default_plans()
    
    return {
        "success": True,
        "message": f"Created {count} plans",
        "plans_created": count
    }


@router.post("/create-super-admin")
async def create_super_admin(
    username: str,
    email: str,
    full_name: str,
    password: str,
    auth: AuthContext = Depends(require_super_admin)
):
    """
    Create a new SuperAdmin user
    
    Only existing SuperAdmins can create new ones
    """
    from app.core.database import get_master_db
    master_db = get_master_db()
    
    # Check if username or email already exists
    existing = await master_db.super_admins.find_one({
        "$or": [
            {"username": username},
            {"email": email}
        ],
        "is_deleted": {"$ne": True}
    })
    
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Username or email already exists"
        )
    
    super_admin = {
        "_id": str(uuid.uuid4()),
        "username": username,
        "email": email,
        "full_name": full_name,
        "password_hash": hash_password(password),
        "status": SuperAdminStatus.ACTIVE,
        "is_primary": False,
        "permissions": [
            "tenants:read",
            "tenants:write",
            "plans:read",
            "payments:read",
            "analytics:read"
        ],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "created_by": auth.user_id,
        "is_deleted": False
    }
    
    await master_db.super_admins.insert_one(super_admin)
    
    return {
        "success": True,
        "message": "SuperAdmin created successfully",
        "id": super_admin["_id"]
    }


@router.get("/super-admins")
async def list_super_admins(auth: AuthContext = Depends(require_super_admin)):
    """
    List all SuperAdmin users
    """
    from app.core.database import get_master_db
    master_db = get_master_db()

    admins = await master_db.super_admins.find({"is_deleted": {"$ne": True}}).to_list(100)

    # Remove sensitive data
    for admin in admins:
        admin.pop("password_hash", None)

    return {"super_admins": admins}


@router.get("/subscriptions")
async def list_subscriptions(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    seller_id: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """
    List all tenant subscriptions (derived from tenant plan fields).
    """
    query: dict = {"is_deleted": {"$ne": True}}
    if seller_id:
        query["seller_id"] = seller_id
    now = datetime.now(timezone.utc)
    if status_filter == "active":
        query["status"] = "active"
        query["plan_expiry"] = {"$gte": now}
    elif status_filter == "trial":
        query["is_trial"] = True
    elif status_filter == "expired":
        query["plan_expiry"] = {"$lt": now}
    elif status_filter == "expiring":
        query["status"] = "active"
        query["plan_expiry"] = {"$gte": now, "$lte": datetime.fromtimestamp(
            now.timestamp() + 30 * 86400, tz=timezone.utc
        )}
    elif status_filter:
        query["status"] = status_filter

    total = await master_db.tenants.count_documents(query)
    skip = (page - 1) * limit
    cursor = master_db.tenants.find(query).sort("plan_expiry", 1).skip(skip).limit(limit)
    tenants = await cursor.to_list(length=limit)

    result = []
    for t in tenants:
        expiry = t.get("plan_expiry")
        # Motor returns naive datetimes; normalize to UTC-aware for comparison
        expiry_utc = expiry.replace(tzinfo=timezone.utc) if expiry and expiry.tzinfo is None else expiry
        days_left = max((expiry_utc - now).days, 0) if expiry_utc and expiry_utc > now else 0
        sub_status = "trial" if t.get("is_trial") else (
            "expired" if expiry_utc and expiry_utc < now else t.get("status", "active")
        )
        result.append({
            "tenant_id": t.get("_id"),
            "company_name": t.get("company_name"),
            "plan_name": t.get("plan_name"),
            "seller_name": t.get("seller_name"),
            "seller_id": t.get("seller_id"),
            "status": sub_status,
            "plan_start_date": t.get("plan_start_date"),
            "plan_expiry": expiry,
            "days_left": days_left,
            "is_trial": t.get("is_trial"),
        })

    return {
        "subscriptions": result,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/reports")
async def get_reports(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
    report_type: str = Query("revenue"),
):
    """
    Platform-level reports.

    report_type options: revenue | seller_performance | tenant_growth | subscriptions
    """
    now = datetime.now(timezone.utc)

    if report_type == "revenue":
        # Monthly payment totals for last 12 months
        pipeline = [
            {"$match": {"status": "completed"}},
            {"$group": {
                "_id": {
                    "year": {"$year": "$payment_date"},
                    "month": {"$month": "$payment_date"},
                },
                "total": {"$sum": "$total_amount"},
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id.year": 1, "_id.month": 1}},
            {"$limit": 12},
        ]
        raw = await master_db.payments.aggregate(pipeline).to_list(12)
        data = [
            {
                "label": f"{r['_id']['year']}-{r['_id']['month']:02d}",
                "amount": r["total"] / 100,
                "count": r["count"],
            }
            for r in raw
        ]
        return {"success": True, "report_type": report_type, "data": data}

    elif report_type == "seller_performance":
        pipeline = [
            {"$match": {"is_deleted": {"$ne": True}, "seller_id": {"$exists": True, "$ne": None}}},
            {"$group": {
                "_id": "$seller_id",
                "seller_name": {"$first": "$seller_name"},
                "total_tenants": {"$sum": 1},
                "active_tenants": {"$sum": {"$cond": [{"$eq": ["$status", "active"]}, 1, 0]}},
            }},
            {"$sort": {"total_tenants": -1}},
        ]
        raw = await master_db.tenants.aggregate(pipeline).to_list(50)
        return {"success": True, "report_type": report_type, "data": raw}

    elif report_type == "tenant_growth":
        pipeline = [
            {"$match": {"is_deleted": {"$ne": True}}},
            {"$group": {
                "_id": {
                    "year": {"$year": "$created_at"},
                    "month": {"$month": "$created_at"},
                },
                "count": {"$sum": 1},
            }},
            {"$sort": {"_id.year": 1, "_id.month": 1}},
            {"$limit": 12},
        ]
        raw = await master_db.tenants.aggregate(pipeline).to_list(12)
        data = [
            {
                "label": f"{r['_id']['year']}-{r['_id']['month']:02d}",
                "count": r["count"],
            }
            for r in raw
        ]
        return {"success": True, "report_type": report_type, "data": data}

    elif report_type == "subscriptions":
        active = await master_db.tenants.count_documents(
            {"is_deleted": {"$ne": True}, "status": "active", "plan_expiry": {"$gte": now}}
        )
        trial = await master_db.tenants.count_documents(
            {"is_deleted": {"$ne": True}, "is_trial": True}
        )
        expired = await master_db.tenants.count_documents(
            {"is_deleted": {"$ne": True}, "plan_expiry": {"$lt": now}}
        )
        cancelled = await master_db.tenants.count_documents(
            {"is_deleted": {"$ne": True}, "status": "cancelled"}
        )
        return {
            "success": True,
            "report_type": report_type,
            "data": {
                "active": active,
                "trial": trial,
                "expired": expired,
                "cancelled": cancelled,
            },
        }

    raise HTTPException(status_code=400, detail=f"Unknown report_type: {report_type}")