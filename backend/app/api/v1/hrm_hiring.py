"""HRM — Hiring Pipeline API Routes (Jobs, Candidates, Interviews, Offers, Onboarding)"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions, require_any_permission
from app.models.company.hrm_job import HRMJobCreate, HRMJobUpdate
from app.models.company.hrm_candidate import HRMCandidateCreate, HRMCandidateUpdate
from app.models.company.hrm_interview import HRMInterviewCreate, HRMInterviewFeedback
from app.models.company.hrm_offer import HRMOfferCreate, HRMOfferRespond
from app.models.company.hrm_onboarding import HRMOnboardingCreate, HRMOnboardingUpdate
from app.services.hrm_hiring_service import HRMHiringService

router = APIRouter(prefix="/hrm/hiring", tags=["HRM - Hiring"])


# ── JOBS ──────────────────────────────────────────────────────────────────────

@router.post("/jobs", status_code=201)
async def create_job(
    data: HRMJobCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    return await HRMHiringService(db).create_job(cu["company_id"], data.model_dump(exclude_none=True), cu["id"])


@router.get("/jobs")
async def list_jobs(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_jobs(cu["company_id"], status, page, page_size)


@router.get("/jobs/{job_id}")
async def get_job(
    job_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    job = await HRMHiringService(db).get_job(job_id, cu["company_id"])
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.put("/jobs/{job_id}")
async def update_job(
    job_id: str,
    data: HRMJobUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    job = await HRMHiringService(db).update_job(job_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.delete("/jobs/{job_id}", status_code=204)
async def delete_job(
    job_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    deleted = await HRMHiringService(db).delete_job(job_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Job not found")


# ── CANDIDATES ────────────────────────────────────────────────────────────────

@router.post("/candidates", status_code=201)
async def create_candidate(
    data: HRMCandidateCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    return await HRMHiringService(db).create_candidate(cu["company_id"], data.model_dump(exclude_none=True), cu["id"])


@router.get("/candidates")
async def list_candidates(
    job_id: Optional[str] = None,
    stage: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_candidates(cu["company_id"], job_id, stage, page, page_size)


@router.get("/candidates/{cand_id}")
async def get_candidate(
    cand_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    cand = await HRMHiringService(db).get_candidate(cand_id, cu["company_id"])
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return cand


@router.put("/candidates/{cand_id}")
async def update_candidate(
    cand_id: str,
    data: HRMCandidateUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    cand = await HRMHiringService(db).update_candidate(cand_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not cand:
        raise HTTPException(status_code=404, detail="Candidate not found")
    return cand


# ── INTERVIEWS ────────────────────────────────────────────────────────────────

@router.post("/interviews", status_code=201)
async def create_interview(
    data: HRMInterviewCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    return await HRMHiringService(db).create_interview(cu["company_id"], data.model_dump(exclude_none=True), cu["id"])


@router.get("/interviews")
async def list_interviews(
    candidate_id: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_interviews(cu["company_id"], candidate_id, page, page_size)


@router.post("/interviews/{interview_id}/feedback")
async def submit_feedback(
    interview_id: str,
    data: HRMInterviewFeedback,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).submit_feedback(interview_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Interview not found")
    return result


# ── OFFERS ────────────────────────────────────────────────────────────────────

@router.post("/offers", status_code=201)
async def create_offer(
    data: HRMOfferCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    return await HRMHiringService(db).create_offer(cu["company_id"], data.model_dump(exclude_none=True), cu["id"])


@router.get("/offers")
async def list_offers(
    candidate_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_offers(cu["company_id"], candidate_id, status, page, page_size)


@router.get("/offers/{offer_id}")
async def get_offer(
    offer_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    offer = await HRMHiringService(db).get_offer(offer_id, cu["company_id"])
    if not offer:
        raise HTTPException(status_code=404, detail="Offer not found")
    return offer


@router.post("/offers/{offer_id}/respond")
async def respond_offer(
    offer_id: str,
    data: HRMOfferRespond,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).respond_offer(offer_id, cu["company_id"], data.action, data.rejection_reason)
    if not result:
        raise HTTPException(status_code=404, detail="Offer not found")
    return result


# ── ONBOARDING ────────────────────────────────────────────────────────────────

@router.post("/onboarding", status_code=201)
async def create_onboarding(
    data: HRMOnboardingCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    return await HRMHiringService(db).create_onboarding(cu["company_id"], data.model_dump(exclude_none=True), cu["id"])


@router.get("/onboarding")
async def list_onboardings(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_onboardings(cu["company_id"], status, page, page_size)


@router.get("/onboarding/{onb_id}")
async def get_onboarding(
    onb_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    onb = await HRMHiringService(db).get_onboarding(onb_id, cu["company_id"])
    if not onb:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    return onb


@router.put("/onboarding/{onb_id}")
async def update_onboarding(
    onb_id: str,
    data: HRMOnboardingUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).update_onboarding(onb_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    return result


@router.post("/onboarding/{onb_id}/complete")
async def complete_onboarding(
    onb_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).complete_onboarding(onb_id, cu["company_id"])
    if not result:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    return result
