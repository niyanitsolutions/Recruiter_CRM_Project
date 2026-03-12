"""
Discounts API (Super Admin only)
CRUD for promotional / discount codes.
"""
from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.services.discount_service import DiscountService
from app.models.master.discount import DiscountCreate, DiscountUpdate

router = APIRouter()


@router.get("/")
async def list_discounts(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
    status_filter: Optional[str] = Query(None, alias="status"),
    search: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
):
    """List all discount codes with optional filters."""
    discounts, total = await DiscountService.list_discounts(
        master_db, status=status_filter, search=search, page=page, limit=limit
    )
    return {
        "discounts": discounts,
        "total": total,
        "page": page,
        "limit": limit,
        "pages": (total + limit - 1) // limit,
    }


@router.get("/validate")
async def validate_discount_code(
    code: str,
    plan_id: Optional[str] = Query(None),
    plan_price: Optional[float] = Query(None),
    master_db=Depends(get_master_database),
):
    """
    Validate a discount code (public endpoint — no auth required).
    Returns discount details and final price if plan_price is provided.
    """
    result = await DiscountService.validate_code(master_db, code, plan_id, plan_price)
    return result


@router.get("/{discount_id}")
async def get_discount(
    discount_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    d = await DiscountService.get_discount(master_db, discount_id)
    if not d:
        raise HTTPException(status_code=404, detail="Discount not found")
    return {"success": True, "data": d}


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_discount(
    data: DiscountCreate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    try:
        discount = await DiscountService.create_discount(master_db, data, created_by=auth.user_id)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    return {"success": True, "message": "Discount created successfully", "data": discount}


@router.put("/{discount_id}")
async def update_discount(
    discount_id: str,
    data: DiscountUpdate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    ok, message, updated = await DiscountService.update_discount(
        master_db, discount_id, data, updated_by=auth.user_id
    )
    if not ok:
        raise HTTPException(status_code=400, detail=message)
    return {"success": True, "message": message, "data": updated}


@router.delete("/{discount_id}")
async def delete_discount(
    discount_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    ok, message = await DiscountService.delete_discount(
        master_db, discount_id, deleted_by=auth.user_id
    )
    if not ok:
        raise HTTPException(status_code=404, detail=message)
    return {"success": True, "message": message}
