"""
Seller Portal API
Endpoints for the logged-in seller: dashboard, tenants, subscriptions, revenue, profile.
"""

from datetime import datetime, timezone, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends, Query
from pydantic import BaseModel, Field

from app.middleware.auth import require_seller, AuthContext
from app.middleware.tenant import get_master_database
from app.services.seller_service import SellerService
from app.services.tenant_service import TenantService

router = APIRouter()


# ── Request schemas ───────────────────────────────────────────────────────────

class SellerTenantCreate(BaseModel):
    """Simplified tenant creation form for sellers."""
    company_name: str
    industry: str = "IT"
    phone: str = ""
    address: str = ""
    city: str = ""
    state: str = ""
    zip_code: str = ""
    country: str = "India"
    owner_name: str
    owner_email: str
    owner_mobile: str = ""
    owner_username: str
    owner_password: str = Field(..., min_length=8)
    plan_id: str = ""
    billing_cycle: str = "monthly"
    user_count: int = Field(default=1, ge=1)


class SellerProfileUpdate(BaseModel):
    seller_name: Optional[str] = None
    company_name: Optional[str] = None
    phone: Optional[str] = None
    address: Optional[str] = None


class SellerPasswordChange(BaseModel):
    old_password: str
    new_password: str = Field(..., min_length=8)


# ── Dashboard ─────────────────────────────────────────────────────────────────

@router.get("/dashboard")
async def get_dashboard(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """Seller dashboard: tenant counts + revenue stats."""
    stats = await SellerService.get_seller_stats(master_db, auth.seller_id)
    return {"success": True, "data": stats}


# ── Tenants ───────────────────────────────────────────────────────────────────

@router.get("/tenants")
async def list_my_tenants(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List tenants that belong to this seller."""
    query: dict = {"seller_id": auth.seller_id, "is_deleted": {"$ne": True}}
    if status_filter:
        query["status"] = status_filter
    if search:
        query["$or"] = [
            {"company_name": {"$regex": search, "$options": "i"}},
            {"owner.email": {"$regex": search, "$options": "i"}},
        ]

    total = await master_db.tenants.count_documents(query)
    skip = (page - 1) * limit
    cursor = master_db.tenants.find(query).sort("created_at", -1).skip(skip).limit(limit)
    tenants = await cursor.to_list(length=limit)

    result = []
    for t in tenants:
        owner = t.get("owner", {})
        result.append({
            "id": t.get("_id"),
            "company_id": t.get("company_id"),
            "company_name": t.get("company_name"),
            "owner_name": owner.get("full_name"),
            "owner_email": owner.get("email"),
            "plan_name": t.get("plan_name"),
            "status": t.get("status"),
            "is_trial": t.get("is_trial"),
            "plan_expiry": t.get("plan_expiry"),
            "created_at": t.get("created_at"),
        })

    return {
        "tenants": result,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.post("/tenants", status_code=status.HTTP_201_CREATED)
async def create_tenant(
    data: SellerTenantCreate,
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """Create a new tenant under this seller."""
    # Fetch seller to get seller_name for denormalization
    seller = await master_db.sellers.find_one({"_id": auth.seller_id, "is_deleted": {"$ne": True}})
    if not seller:
        raise HTTPException(status_code=404, detail="Seller account not found")

    result, error = await TenantService.register_company(
        company_name=data.company_name,
        industry=data.industry,
        phone=data.phone,
        city=data.city,
        state=data.state,
        zip_code=data.zip_code,
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        owner_mobile=data.owner_mobile,
        owner_username=data.owner_username,
        owner_password=data.owner_password,
        plan_id=data.plan_id if data.plan_id else None,
        billing_cycle=data.billing_cycle,
        user_count=data.user_count,
        country=data.country,
    )

    if error:
        raise HTTPException(status_code=400, detail=error)

    # Attach seller_id and seller_name to the new tenant
    tenant_id = result.get("tenant_id") or result.get("id") or result.get("_id")
    if tenant_id:
        await master_db.tenants.update_one(
            {"_id": tenant_id},
            {"$set": {
                "seller_id": auth.seller_id,
                "seller_name": seller.get("seller_name"),
            }}
        )
        # Refresh seller's tenant counts
        await SellerService.refresh_seller_tenant_counts(master_db, auth.seller_id)

    return {
        "success": True,
        "message": "Tenant created successfully",
        "data": result,
    }


# ── Plans (seller pricing) ────────────────────────────────────────────────────

@router.get("/plans")
async def get_seller_plans(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """
    Return active non-trial plans with seller-discounted pricing pre-computed.
    Fields returned per plan:
      - id, name, display_name, has_mobile
      - price_per_user_monthly / yearly  (full tenant price, in paise)
      - seller_price_monthly / yearly    (after reseller_discount, in paise)
      - reseller_discount_percent        (e.g. 20)
      - seller_margin_monthly / yearly   (paise earned per user per month)
    """
    plans = await master_db.plans.find(
        {"status": "active", "is_trial_plan": False}
    ).sort("sort_order", 1).to_list(100)

    result = []
    for p in plans:
        discount = int(p.get("reseller_discount_percent", 0))
        ppu_mo  = p.get("price_per_user_monthly", p.get("price_monthly", 0))
        ppu_yr  = p.get("price_per_user_yearly",  p.get("price_yearly",  0))
        seller_mo = int(ppu_mo * (100 - discount) / 100) if discount else ppu_mo
        seller_yr = int(ppu_yr * (100 - discount) / 100) if discount else ppu_yr
        result.append({
            "id":                         str(p["_id"]),
            "name":                       p["name"],
            "display_name":               p.get("display_name", p["name"]),
            "description":                p.get("description", ""),
            "has_mobile":                 p.get("has_mobile", False),
            "is_popular":                 p.get("is_popular", False),
            # Full (tenant) pricing
            "price_per_user_monthly":     ppu_mo,
            "price_per_user_yearly":      ppu_yr,
            "original_price_monthly":     p.get("original_price_monthly", 0),
            # Seller pricing (after reseller discount)
            "seller_price_monthly":       seller_mo,
            "seller_price_yearly":        seller_yr,
            "reseller_discount_percent":  discount,
            # Margin per user per month
            "seller_margin_monthly":      ppu_mo - seller_mo,
            "seller_margin_yearly":       ppu_yr - seller_yr,
        })

    return {"success": True, "plans": result}


# ── Subscriptions ─────────────────────────────────────────────────────────────

@router.get("/subscriptions")
async def list_subscriptions(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Subscription view for seller's tenants (derived from tenant plan fields)."""
    query: dict = {"seller_id": auth.seller_id, "is_deleted": {"$ne": True}}
    if status_filter:
        if status_filter == "active":
            query["status"] = "active"
        elif status_filter == "trial":
            query["is_trial"] = True
        elif status_filter == "expired":
            query["plan_expiry"] = {"$lt": datetime.now(timezone.utc)}
        else:
            query["status"] = status_filter

    total = await master_db.tenants.count_documents(query)
    skip = (page - 1) * limit
    cursor = master_db.tenants.find(query).sort("plan_expiry", 1).skip(skip).limit(limit)
    tenants = await cursor.to_list(length=limit)

    now = datetime.now(timezone.utc)
    result = []
    for t in tenants:
        expiry = t.get("plan_expiry")
        # Motor returns naive datetimes; normalize to UTC-aware for comparison
        expiry_utc = expiry.replace(tzinfo=timezone.utc) if expiry and expiry.tzinfo is None else expiry
        days_left = (expiry_utc - now).days if expiry_utc and expiry_utc > now else 0
        sub_status = "trial" if t.get("is_trial") else (
            "expired" if expiry_utc and expiry_utc < now else t.get("status", "active")
        )
        result.append({
            "tenant_id": t.get("_id"),
            "company_name": t.get("company_name"),
            "plan_name": t.get("plan_name"),
            "status": sub_status,
            "plan_start_date": t.get("plan_start_date"),
            "plan_expiry": expiry,
            "days_left": max(days_left, 0),
            "is_trial": t.get("is_trial"),
        })

    return {
        "subscriptions": result,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


# ── Revenue ───────────────────────────────────────────────────────────────────

@router.get("/revenue")
async def get_revenue(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Payment history for this seller's tenants."""
    query = {"seller_id": auth.seller_id}
    total = await master_db.payments.count_documents(query)
    skip = (page - 1) * limit
    cursor = master_db.payments.find(query).sort("payment_date", -1).skip(skip).limit(limit)
    payments = await cursor.to_list(length=limit)

    # Compute totals
    pipeline = [
        {"$match": {"seller_id": auth.seller_id, "status": "completed"}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
    ]
    result = await master_db.payments.aggregate(pipeline).to_list(1)
    total_revenue = result[0]["total"] / 100 if result else 0

    now = datetime.now(timezone.utc)
    month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    monthly_pipeline = [
        {"$match": {"seller_id": auth.seller_id, "status": "completed", "payment_date": {"$gte": month_start}}},
        {"$group": {"_id": None, "total": {"$sum": "$total_amount"}}},
    ]
    monthly_result = await master_db.payments.aggregate(monthly_pipeline).to_list(1)
    monthly_revenue = monthly_result[0]["total"] / 100 if monthly_result else 0

    for p in payments:
        p["id"] = p.pop("_id", p.get("id", ""))
        p["amount_display"] = (p.get("total_amount", 0) or 0) / 100

    return {
        "payments": payments,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
        "summary": {
            "total_revenue": total_revenue,
            "monthly_revenue": monthly_revenue,
        },
    }


# ── Commissions ───────────────────────────────────────────────────────────────

@router.get("/commissions")
async def get_commissions(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """Commission history for this seller."""
    query: dict = {"seller_id": auth.seller_id}
    if status_filter:
        query["status"] = status_filter

    total = await master_db.commissions.count_documents(query)
    skip = (page - 1) * limit
    cursor = master_db.commissions.find(query).sort("created_at", -1).skip(skip).limit(limit)
    commissions = await cursor.to_list(length=limit)

    for c in commissions:
        c["id"] = c.pop("_id", c.get("id", ""))
        c["commission_amount_display"] = (c.get("commission_amount", 0) or 0) / 100
        c["base_amount_display"] = (c.get("base_amount", 0) or 0) / 100
        c["reseller_amount_display"] = (c.get("reseller_amount", 0) or 0) / 100

    return {
        "commissions": commissions,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


# ── Notifications ─────────────────────────────────────────────────────────────

@router.get("/notifications")
async def get_notifications(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """
    Generate smart notifications for the seller based on:
    - Subscriptions expiring within 7 days
    - Recent payments (last 7 days)
    - New tenants created (last 7 days)
    """
    now = datetime.now(timezone.utc)
    notifications = []

    # 1. Expiring subscriptions (within 7 days)
    expiry_threshold = now + timedelta(days=7)
    expiring = await master_db.tenants.find({
        "seller_id": auth.seller_id,
        "is_deleted": {"$ne": True},
        "is_trial": {"$ne": True},
        "plan_expiry": {"$gte": now, "$lte": expiry_threshold},
    }).to_list(length=50)
    for t in expiring:
        expiry = t.get("plan_expiry")
        expiry_utc = expiry.replace(tzinfo=timezone.utc) if expiry and expiry.tzinfo is None else expiry
        days_left = (expiry_utc - now).days if expiry_utc else 0
        notifications.append({
            "type": "expiry_warning",
            "title": "Subscription Expiring Soon",
            "message": f"{t.get('company_name')} subscription expires in {days_left} day(s).",
            "created_at": expiry,
            "tenant_id": t.get("_id"),
            "company_name": t.get("company_name"),
        })

    # 2. Recent payments (last 7 days)
    week_ago = now - timedelta(days=7)
    recent_payments = await master_db.payments.find({
        "seller_id": auth.seller_id,
        "status": "completed",
        "payment_date": {"$gte": week_ago},
    }).sort("payment_date", -1).to_list(length=20)
    for p in recent_payments:
        amount = (p.get("total_amount", 0) or 0) / 100
        notifications.append({
            "type": "payment_received",
            "title": "Payment Received",
            "message": f"Payment of ₹{amount:.0f} received from {p.get('company_name', p.get('tenant_id', ''))}.",
            "created_at": p.get("payment_date"),
            "tenant_id": p.get("tenant_id"),
            "company_name": p.get("company_name", ""),
        })

    # 3. New tenants (last 7 days)
    new_tenants = await master_db.tenants.find({
        "seller_id": auth.seller_id,
        "is_deleted": {"$ne": True},
        "created_at": {"$gte": week_ago},
    }).sort("created_at", -1).to_list(length=20)
    for t in new_tenants:
        notifications.append({
            "type": "new_tenant",
            "title": "New Tenant Onboarded",
            "message": f"{t.get('company_name')} has been successfully onboarded.",
            "created_at": t.get("created_at"),
            "tenant_id": t.get("_id"),
            "company_name": t.get("company_name"),
        })

    # Sort by created_at descending
    notifications.sort(key=lambda x: x.get("created_at") or now, reverse=True)

    return {
        "success": True,
        "notifications": notifications,
        "total": len(notifications),
    }


# ── Profile ───────────────────────────────────────────────────────────────────

@router.get("/profile")
async def get_profile(
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """Get current seller's profile."""
    seller = await SellerService.get_seller(master_db, auth.seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return {"success": True, "data": seller}


@router.put("/profile")
async def update_profile(
    data: SellerProfileUpdate,
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """Update seller's own profile (name, phone, address)."""
    from app.models.master.seller import SellerUpdate
    update_data = SellerUpdate(**data.model_dump(exclude_none=True))
    ok, message, updated = await SellerService.update_seller(
        master_db, auth.seller_id, update_data, updated_by=auth.seller_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    return {"success": True, "message": message, "data": updated}


@router.put("/profile/password")
async def change_password(
    data: SellerPasswordChange,
    auth: AuthContext = Depends(require_seller),
    master_db=Depends(get_master_database),
):
    """Change seller's own password."""
    ok, message = await SellerService.change_password(
        master_db, auth.seller_id, data.old_password, data.new_password
    )
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message}
