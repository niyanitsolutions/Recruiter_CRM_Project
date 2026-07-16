"""HRM — Hiring Pipeline API Routes (Jobs, Candidates, Interviews, Offers, Onboarding)"""
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, File, UploadFile
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions, require_any_permission
from app.models.company.hrm_job import HRMJobCreate, HRMJobUpdate
from app.models.company.hrm_candidate import HRMCandidateCreate, HRMCandidateUpdate
from app.models.company.hrm_interview import HRMInterviewCreate, HRMInterviewFeedback
from app.models.company.hrm_offer import HRMOfferCreate, HRMOfferRespond
from app.models.company.hrm_onboarding import HRMOnboardingCreate, HRMOnboardingUpdate
from app.models.company.hrm_candidate_invitation import HRMCandidateInvitationCreate
from app.services.hrm_hiring_service import HRMHiringService

router = APIRouter(prefix="/hrm/hiring", tags=["HRM - Hiring"])

# Public router — internal-hiring job apply page (no auth). Registered
# separately in main.py, same convention as public_forms.py / hrm_employee_onboarding.py.
public_router = APIRouter(prefix="/public/internal-hiring", tags=["HRM - Hiring (Public)"])


class InvitationRequest(HRMCandidateInvitationCreate):
    frontend_base_url: Optional[str] = None


class PublicLinkRequest(BaseModel):
    frontend_base_url: Optional[str] = None


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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
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


# ── PUBLIC APPLY LINK ───────────────────────────────────────────────────────────

@router.post("/jobs/{job_id}/public-link")
async def get_job_public_link(
    job_id: str,
    body: PublicLinkRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    """Get-or-create this job's permanent public apply link (idempotent)."""
    result = await HRMHiringService(db).get_or_create_job_public_slug(job_id, cu["company_id"])
    base = (body.frontend_base_url or "").rstrip("/")
    result["apply_url"] = f"{base}/internal/jobs/{result['public_slug']}/apply"
    return result


# ── INVITATIONS ("Send Application Link") ───────────────────────────────────────

@router.post("/invitations", status_code=201)
async def send_application_invitation(
    body: InvitationRequest,
    background_tasks: BackgroundTasks,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    data = body.model_dump(exclude={"frontend_base_url"})
    result = await HRMHiringService(db).send_application_invitation(
        cu["company_id"], data, cu["id"], cu.get("full_name", "HR Team")
    )
    base = (body.frontend_base_url or "").rstrip("/")
    apply_url = f"{base}/internal/jobs/{result['public_slug']}/apply"

    from app.core.config import settings as _settings
    if _settings.EMAIL_ENABLED:
        from app.services.email_service import send_hrm_hiring_invitation_email
        background_tasks.add_task(
            send_hrm_hiring_invitation_email,
            to_email=body.email,
            form_url=apply_url,
            candidate_name=body.candidate_name,
            job_title=result.get("job_title", ""),
            sent_by_name=cu.get("full_name", "HR Team"),
            company_name=cu.get("company_name", ""),
            message=body.message,
            company_id=cu.get("company_id", ""),
        )
    return {**result, "apply_url": apply_url}


@router.get("/invitations")
async def list_invitations(
    job_id: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    return await HRMHiringService(db).list_invitations(cu["company_id"], job_id, page, page_size)


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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
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
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
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
    result = await HRMHiringService(db).complete_onboarding(
        onb_id, cu["company_id"], company_name=cu.get("company_name", "")
    )
    if not result:
        raise HTTPException(status_code=404, detail="Onboarding not found")
    return result


# ── PUBLIC (no-auth): internal job apply page ────────────────────────────────────

@public_router.get("/apply/{slug}")
async def get_public_job(slug: str):
    """Public — no auth. Returns job meta for the apply page to render."""
    job = await HRMHiringService(None).get_public_job_by_slug(slug)
    return {"success": True, "job": job}


@public_router.post("/apply/{slug}")
async def submit_public_job_application(slug: str, data: dict):
    """Public — no auth. Creates an Internal Hiring applicant (hrm_candidates),
    never a Recruitment candidate."""
    result = await HRMHiringService(None).submit_public_application(slug, data)
    return {
        "success": True,
        "message": "Thank you! Your application has been submitted successfully.",
        **result,
    }


@public_router.post("/apply/{slug}/resume")
async def upload_public_resume(slug: str, candidate_id: str, file: UploadFile = File(...)):
    """Public — no auth. Attach a resume to the applicant just created via
    the public submit above (mirrors public_forms.py's resume upload step)."""
    from app.core.database import DatabaseManager
    from datetime import datetime, timezone

    job_meta = await HRMHiringService(None).get_public_job_by_slug(slug)
    company_id = job_meta["company_id"]
    cdb = DatabaseManager.get_company_db(company_id)
    candidate = await cdb["hrm_candidates"].find_one({"_id": candidate_id, "company_id": company_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in {".pdf", ".doc", ".docx"}:
        raise HTTPException(status_code=422, detail="Only PDF, DOC, or DOCX resumes are allowed.")

    content = await file.read()
    if len(content) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Resume must be smaller than 10 MB.")

    from app.core.config import settings as _cfg
    upload_dir = os.path.join(_cfg.UPLOAD_DIR, company_id, "hrm_hiring_resumes")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{candidate_id}_resume{ext}"
    with open(os.path.join(upload_dir, safe_name), "wb") as fh:
        fh.write(content)

    resume_url = f"/uploads/{company_id}/hrm_hiring_resumes/{safe_name}"
    await cdb["hrm_candidates"].update_one(
        {"_id": candidate_id},
        {"$set": {"resume_url": resume_url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "resume_url": resume_url}
