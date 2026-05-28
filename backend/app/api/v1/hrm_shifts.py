"""HRM — Shift Management API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_shift import ShiftCreate, ShiftUpdate
from app.services.hrm_shift_service import ShiftService

router = APIRouter(prefix="/hrm/shifts", tags=["HRM - Shifts"])

_MANAGE = Depends(require_permissions(["hrm:attendance:manage"]))
_VIEW   = Depends(require_permissions(["hrm:attendance:self"]))


class AssignShiftRequest(BaseModel):
    employee_id: str
    shift_id: str


# ── Seed defaults ─────────────────────────────────────────────────────────────

@router.post("/seed-defaults", status_code=201)
async def seed_defaults(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    count = await ShiftService(db).seed_defaults(cu["company_id"], cu["id"])
    return {"seeded": count, "message": f"{count} default shifts created" if count else "Already seeded"}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_shifts(
    include_inactive: bool = Query(False),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    return await ShiftService(db).list(cu["company_id"], include_inactive)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_shift(
    data: ShiftCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await ShiftService(db).create(data.model_dump(), cu["company_id"], cu["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{shift_id}")
async def get_shift(
    shift_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    s = await ShiftService(db).get(shift_id, cu["company_id"])
    if not s:
        raise HTTPException(status_code=404, detail="Shift not found")
    s["employee_count"] = await ShiftService(db).get_employee_count(shift_id, cu["company_id"])
    return s


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{shift_id}")
async def update_shift(
    shift_id: str,
    data: ShiftUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        s = await ShiftService(db).update(
            shift_id, data.model_dump(exclude_none=True), cu["company_id"], cu["id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not s:
        raise HTTPException(status_code=404, detail="Shift not found")
    return s


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{shift_id}")
async def delete_shift(
    shift_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        ok = await ShiftService(db).delete(shift_id, cu["company_id"], cu["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Shift not found")
    return {"ok": True}


# ── Assign shift to employee ──────────────────────────────────────────────────

@router.post("/assign")
async def assign_shift(
    data: AssignShiftRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        ok = await ShiftService(db).assign_to_employee(
            data.shift_id, data.employee_id, cu["company_id"], cu["id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"ok": True}
