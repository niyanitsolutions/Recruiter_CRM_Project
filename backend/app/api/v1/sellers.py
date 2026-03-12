"""
Sellers API (Super Admin only)
CRUD for seller / reseller accounts.
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional

from app.middleware.auth import require_super_admin, get_current_user, AuthContext
from app.middleware.tenant import get_master_database
from app.services.seller_service import SellerService
from app.models.master.seller import SellerCreate, SellerUpdate, SellerSubscriptionUpdate

router = APIRouter()


@router.get("/")
async def list_sellers(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List all sellers with optional filters."""
    sellers, total = await SellerService.list_sellers(
        master_db, status=status_filter, search=search, page=page, limit=limit
    )
    return {
        "sellers": sellers,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


# ── Static paths MUST come before parameterized /{seller_id} routes ───────────

@router.get("/me/seat-status")
async def get_my_seat_status(
    auth: AuthContext = Depends(get_current_user),
    master_db=Depends(get_master_database),
):
    """
    Seller: get own subscription & seat status.
    Used by the seller dashboard to show plan info and seat usage.
    """
    if not auth.is_seller:
        raise HTTPException(status_code=403, detail="Seller access required")
    data = await SellerService.get_seat_status(master_db, auth.seller_id)
    if not data:
        raise HTTPException(status_code=404, detail="Seller not found")
    return {"success": True, "data": data}


@router.get("/{seller_id}/stats")
async def get_seller_stats(
    seller_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Get revenue and tenant stats for a specific seller."""
    seller = await SellerService.get_seller(master_db, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    stats = await SellerService.get_seller_stats(master_db, seller_id)
    return {"success": True, "data": stats}


@router.get("/{seller_id}")
async def get_seller(
    seller_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Get seller details by ID."""
    seller = await SellerService.get_seller(master_db, seller_id)
    if not seller:
        raise HTTPException(status_code=404, detail="Seller not found")
    return {"success": True, "data": seller}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_seller(
    data: SellerCreate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Create a new seller account."""
    try:
        seller = await SellerService.create_seller(master_db, data, created_by=auth.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "message": "Seller created successfully", "data": seller}


@router.put("/{seller_id}")
async def update_seller(
    seller_id: str,
    data: SellerUpdate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Update seller details."""
    ok, message, updated = await SellerService.update_seller(
        master_db, seller_id, data, updated_by=auth.user_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    return {"success": True, "message": message, "data": updated}


@router.delete("/{seller_id}")
async def delete_seller(
    seller_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Soft-delete a seller."""
    ok, message = await SellerService.delete_seller(master_db, seller_id, deleted_by=auth.user_id)
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    return {"success": True, "message": message}



# ── Subscription / Seat Endpoints ──────────────────────────────────────────────

@router.get("/{seller_id}/seat-status")
async def get_seller_seat_status(
    seller_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Super Admin: get any seller's subscription & seat status."""
    data = await SellerService.get_seat_status(master_db, seller_id)
    if not data:
        raise HTTPException(status_code=404, detail="Seller not found")
    return {"success": True, "data": data}


@router.post("/{seller_id}/extend-subscription")
async def extend_seller_subscription(
    seller_id: str,
    data: SellerSubscriptionUpdate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """
    Super Admin: extend a seller's subscription and optionally add seats.
    Seats are additive — never resets existing users.
    """
    ok, message, updated = await SellerService.extend_subscription(
        master_db,
        seller_id=seller_id,
        additional_seats=data.additional_seats,
        extension_days=data.extension_days,
        plan_name=data.plan_name,
        plan_display_name=data.plan_display_name,
        billing_cycle=data.billing_cycle,
    )
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    return {"success": True, "message": message, "data": updated}
