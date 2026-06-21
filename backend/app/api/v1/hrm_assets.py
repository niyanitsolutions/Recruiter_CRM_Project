"""HRM — Asset Management API"""
import re as _re
import secrets
from datetime import datetime, timezone
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.asset import AssetCreate, AssetUpdate, AssetAssignRequest, AssetReturnRequest

router = APIRouter(prefix="/hrm/assets", tags=["HRM - Assets"])


def _serial(doc: dict) -> dict:
    """Convert MongoDB doc to JSON-safe dict."""
    if doc:
        doc["id"] = doc.pop("_id", doc.get("id"))
    return doc


@router.post("", status_code=201)
async def create_asset(
    data: AssetCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:manage"])),
):
    existing = await db.hrm_assets.find_one({"asset_tag": data.asset_tag, "company_id": cu["company_id"], "is_deleted": False})
    if existing:
        raise HTTPException(status_code=400, detail="Asset tag already exists")

    now = datetime.now(timezone.utc)
    payload = data.model_dump(exclude_none=True)
    # Auto-generate a public token for QR code (Phase 14 — no internal ID exposure)
    payload["public_token"] = secrets.token_urlsafe(20)
    doc = {
        "_id": str(uuid.uuid4()),
        "company_id": cu["company_id"],
        "status": "available",
        "assignment_history": [],
        "created_by": cu["id"],
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
        **payload,
    }
    await db.hrm_assets.insert_one(doc)
    return _serial(doc)


@router.get("")
async def list_assets(
    status: Optional[str] = None,
    asset_type: Optional[str] = None,
    assigned_to_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:view"])),
):
    query = {"company_id": cu["company_id"], "is_deleted": False}
    if status:        query["status"] = status
    if asset_type:    query["asset_type"] = asset_type
    if assigned_to_id: query["assigned_to_id"] = assigned_to_id
    if search:
        query["$or"] = [
            {"asset_tag": {"$regex": search, "$options": "i"}},
            {"brand": {"$regex": search, "$options": "i"}},
            {"model_name": {"$regex": search, "$options": "i"}},
            {"serial_number": {"$regex": search, "$options": "i"}},
        ]

    total = await db.hrm_assets.count_documents(query)
    skip  = (page - 1) * page_size
    cursor = db.hrm_assets.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(length=page_size)
    return {"items": [_serial(i) for i in items], "total": total, "page": page, "page_size": page_size}


@router.get("/me")
async def get_my_assets(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return assets assigned to the calling user's linked employee record.
    No extra permission required beyond authentication — any logged-in user
    can view their own assets.
    """
    emp_id = cu.get("hrm_employee_id")
    if not emp_id:
        user_doc = await db.users.find_one(
            {"_id": cu["id"]}, {"hrm_employee_id": 1, "email": 1}
        )
        if user_doc:
            emp_id = user_doc.get("hrm_employee_id")
            if not emp_id:
                user_email = (user_doc.get("email") or "").strip()
                if user_email:
                    emp_doc = await db.hrm_employees.find_one(
                        {
                            "email": _re.compile(f"^{_re.escape(user_email)}$", _re.IGNORECASE),
                            "company_id": cu["company_id"],
                            "is_deleted": False,
                        },
                        {"_id": 1},
                    )
                    if emp_doc:
                        emp_id = str(emp_doc["_id"])
    if not emp_id:
        return {"items": [], "total": 0}
    query = {"company_id": cu["company_id"], "assigned_to_id": emp_id, "is_deleted": False}
    total = await db.hrm_assets.count_documents(query)
    cursor = db.hrm_assets.find(query).sort("created_at", -1)
    items = await cursor.to_list(length=100)
    return {"items": [_serial(i) for i in items], "total": total}


@router.get("/{asset_id}")
async def get_asset(
    asset_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:view"])),
):
    doc = await db.hrm_assets.find_one({"_id": asset_id, "company_id": cu["company_id"], "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serial(doc)


@router.put("/{asset_id}")
async def update_asset(
    asset_id: str,
    data: AssetUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:manage"])),
):
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.hrm_assets.find_one_and_update(
        {"_id": asset_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Asset not found")
    return _serial(result)


@router.post("/{asset_id}/assign")
async def assign_asset(
    asset_id: str,
    data: AssetAssignRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:manage"])),
):
    asset = await db.hrm_assets.find_one({"_id": asset_id, "company_id": cu["company_id"], "is_deleted": False})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.get("status") == "assigned":
        raise HTTPException(status_code=400, detail="Asset is already assigned. Return it first.")

    now = datetime.now(timezone.utc)
    history_entry = {
        "employee_id": data.employee_id,
        "employee_name": data.employee_name,
        "assigned_on": now,
        "returned_on": None,
        "notes": data.notes,
    }
    result = await db.hrm_assets.find_one_and_update(
        {"_id": asset_id},
        {
            "$set": {
                "status": "assigned",
                "assigned_to_id": data.employee_id,
                "assigned_to_name": data.employee_name,
                "assigned_on": now,
                "updated_at": now,
            },
            "$push": {"assignment_history": history_entry},
        },
        return_document=True,
    )
    return _serial(result)


@router.post("/{asset_id}/return")
async def return_asset(
    asset_id: str,
    data: AssetReturnRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:manage"])),
):
    asset = await db.hrm_assets.find_one({"_id": asset_id, "company_id": cu["company_id"], "is_deleted": False})
    if not asset:
        raise HTTPException(status_code=404, detail="Asset not found")
    if asset.get("status") != "assigned":
        raise HTTPException(status_code=400, detail="Asset is not currently assigned")

    now = datetime.now(timezone.utc)
    updates = {
        "status": "available",
        "assigned_to_id": None,
        "assigned_to_name": None,
        "assigned_on": None,
        "updated_at": now,
    }
    if data.condition_on_return:
        updates["condition"] = data.condition_on_return

    # Update the most recent open history entry
    history = asset.get("assignment_history", [])
    for h in reversed(history):
        if h.get("returned_on") is None:
            h["returned_on"] = now
            h["condition_on_return"] = data.condition_on_return
            h["notes"] = (h.get("notes") or "") + (f" | Return: {data.notes}" if data.notes else "")
            break

    updates_cmd = {"$set": {**updates, "assignment_history": history}}
    result = await db.hrm_assets.find_one_and_update(
        {"_id": asset_id}, updates_cmd, return_document=True
    )
    return _serial(result)


@router.delete("/{asset_id}", status_code=204)
async def delete_asset(
    asset_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:assets:manage"])),
):
    result = await db.hrm_assets.update_one(
        {"_id": asset_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Asset not found")


# ── Public: QR scan — no authentication required (Phase 13 & 14) ─────────────

from fastapi import Request as _Request
from app.core.database import get_company_db as _get_any_company_db_by_id

_public_router = APIRouter(prefix="/hrm/assets/public", tags=["HRM - Assets (Public)"])


@_public_router.get("/{public_token}")
async def get_asset_by_public_token(public_token: str):
    """
    Public endpoint — no authentication required.
    Returns safe asset information for QR code scanning.
    Searches across all tenant databases for the given public_token.
    """
    from app.core.database import DatabaseManager, get_master_db as _get_master
    master = _get_master()
    # Use company_id (short key) — not _id (UUID) — because get_company_db resolves via company_id.
    company_ids = await master.tenants.distinct("company_id", {"is_deleted": {"$ne": True}})
    for cid in company_ids:
        if not cid:
            continue
        try:
            db = DatabaseManager.get_company_db(str(cid))
        except Exception:
            continue
        # Search by public_token first; fall back to _id for assets created
        # before public_token field was added (QR URL uses asset.id as fallback).
        try:
            doc = await db.hrm_assets.find_one(
                {"$or": [{"public_token": public_token}, {"_id": public_token}],
                 "is_deleted": False},
            )
        except Exception:
            continue
        if doc:
            purchase_date = doc.get("purchase_date")
            warranty_expiry = doc.get("warranty_expiry")
            return {
                "asset_tag":        doc.get("asset_tag"),
                "asset_type":       doc.get("asset_type"),
                "brand":            doc.get("brand"),
                "model_name":       doc.get("model_name"),
                "serial_number":    doc.get("serial_number"),
                "status":           doc.get("status"),
                "condition":        doc.get("condition"),
                "location":         doc.get("location"),
                "purchase_date":    str(purchase_date)  if purchase_date  else None,
                "warranty_expiry":  str(warranty_expiry) if warranty_expiry else None,
                "assigned_to_name": doc.get("assigned_to_name"),
                "assigned_on":      doc.get("assigned_on"),
            }
    raise HTTPException(status_code=404, detail="Asset not found")
