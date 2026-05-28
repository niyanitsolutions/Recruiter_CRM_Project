"""HRM — Leave Policy API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_leave_policy import LeavePolicyCreate, LeavePolicyUpdate
from app.services.hrm_leave_policy_service import LeavePolicyService

router = APIRouter(prefix="/hrm/leave-policies", tags=["HRM - Leave Policies"])

_MANAGE = Depends(require_permissions(["hrm:attendance:manage"]))
_VIEW   = Depends(require_permissions(["hrm:attendance:self"]))


# ── Seed defaults (idempotent) ────────────────────────────────────────────────

@router.post("/seed-defaults", status_code=201)
async def seed_defaults(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    """Insert default leave policies if none exist (idempotent)."""
    count = await LeavePolicyService(db).seed_defaults(cu["company_id"], cu["id"])
    return {"seeded": count, "message": f"{count} default policies created" if count else "Already seeded"}


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_policies(
    include_inactive: bool = Query(False),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """List all leave policies. Any authenticated HRM user can view."""
    return await LeavePolicyService(db).list(cu["company_id"], include_inactive)


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_policy(
    data: LeavePolicyCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await LeavePolicyService(db).create(data.model_dump(), cu["company_id"], cu["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{policy_id}")
async def get_policy(
    policy_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    p = await LeavePolicyService(db).get(policy_id, cu["company_id"])
    if not p:
        raise HTTPException(status_code=404, detail="Leave policy not found")
    return p


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{policy_id}")
async def update_policy(
    policy_id: str,
    data: LeavePolicyUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        p = await LeavePolicyService(db).update(
            policy_id, data.model_dump(exclude_none=True), cu["company_id"], cu["id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not p:
        raise HTTPException(status_code=404, detail="Leave policy not found")
    return p


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{policy_id}")
async def delete_policy(
    policy_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        ok = await LeavePolicyService(db).delete(policy_id, cu["company_id"], cu["id"])
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not ok:
        raise HTTPException(status_code=404, detail="Leave policy not found")
    return {"ok": True}
