"""HRM — Performance API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.performance import CreateReview, SubmitSelfReview, SubmitManagerReview
from app.services.performance_service import PerformanceService

router = APIRouter(prefix="/hrm/performance", tags=["HRM - Performance"])


@router.post("", status_code=201)
async def create_review(
    data: CreateReview,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:manage"])),
):
    return await PerformanceService(db).create(
        cu["company_id"], data.model_dump(), cu["id"], company_name=cu.get("company_name") or ""
    )


@router.get("")
async def list_reviews(
    employee_id: Optional[str] = None,
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:manage"])),
):
    return await PerformanceService(db).list(cu["company_id"], employee_id, year, page, page_size)


@router.get("/self")
async def list_own_reviews(
    year: Optional[int] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:self"])),
):
    return await PerformanceService(db).list(cu["company_id"], cu["id"], year, page, page_size)


@router.get("/{review_id}")
async def get_review(
    review_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:self"])),
):
    review = await PerformanceService(db).get(review_id, cu["company_id"])
    if not review:
        raise HTTPException(status_code=404, detail="Review not found")
    return review


@router.post("/{review_id}/self-review")
async def submit_self_review(
    review_id: str,
    data: SubmitSelfReview,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:self"])),
):
    result = await PerformanceService(db).submit_self(review_id, cu["company_id"], data.model_dump())
    if not result:
        raise HTTPException(status_code=404, detail="Review not found")
    return result


@router.post("/{review_id}/manager-review")
async def submit_manager_review(
    review_id: str,
    data: SubmitManagerReview,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:team"])),
):
    result = await PerformanceService(db).submit_manager(
        review_id, cu["company_id"], data.model_dump(), cu["id"], cu.get("username", "")
    )
    if not result:
        raise HTTPException(status_code=404, detail="Review not found")
    return result


@router.delete("/{review_id}", status_code=204)
async def delete_review(
    review_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:performance:manage"])),
):
    deleted = await PerformanceService(db).delete(review_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Review not found or already finalized")
