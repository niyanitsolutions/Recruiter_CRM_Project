"""HRM — Hiring Pipeline API Routes (Jobs, Candidates, Interviews, Offers, Onboarding)"""
import os
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks, File, UploadFile
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions, require_any_permission
from app.models.company.hrm_job import HRMJobCreate, HRMJobUpdate
from app.models.company.hrm_candidate import HRMCandidateCreate, HRMCandidateUpdate
from app.models.company.hrm_interview import HRMInterviewCreate, HRMInterviewFeedback, HRMInterviewUpdate
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

@router.get("/candidates/{cand_id}/next-round")
async def get_next_round(
    cand_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:hiring:view"])),
):
    """Read-only preview for the Schedule Interview screen's auto-populated
    Current Round / Next Round / Stage fields — HR never picks these manually."""
    return await HRMHiringService(db).get_next_round(cand_id, cu["company_id"])


@router.post("/interviews", status_code=201)
async def create_interview(
    data: HRMInterviewCreate,
    background_tasks: BackgroundTasks,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).create_interview(
        cu["company_id"], data.model_dump(exclude_none=True), cu["id"], cu.get("full_name", "HR Team")
    )
    from app.core.config import settings as _settings
    if _settings.EMAIL_ENABLED:
        if data.wants_candidate_email():
            candidate = await HRMHiringService(db).get_candidate(data.candidate_id, cu["company_id"])
            if candidate and candidate.get("email"):
                from app.services.email_service import send_hrm_interview_invitation_email
                background_tasks.add_task(
                    send_hrm_interview_invitation_email,
                    to_email=candidate["email"],
                    candidate_name=result.get("candidate_name", ""),
                    job_title=result.get("job_title") or "",
                    round_name=result.get("round_name", ""),
                    scheduled_at=result.get("scheduled_at"),
                    duration_minutes=result.get("duration_minutes", 60),
                    mode=result.get("mode", ""),
                    location_or_link=result.get("location_or_link"),
                    company_name=cu.get("company_name", ""),
                    company_id=cu.get("company_id", ""),
                )
        # Each assigned interviewer with an email on file.
        if data.wants_interviewer_email():
            _mail_interviewers(background_tasks, result, cu)
    return result


def _mail_interviewers(background_tasks: BackgroundTasks, result: dict, cu: dict) -> None:
    """Fire an 'Interview Assignment' email to each interviewer with an email."""
    from datetime import datetime
    from app.services.email_service import send_interviewer_assigned_email
    sched = result.get("scheduled_at")
    date_str, time_str = "", ""
    try:
        dt = sched if isinstance(sched, datetime) else datetime.fromisoformat(str(sched).replace("Z", "+00:00"))
        date_str = dt.strftime("%d %b %Y")
        time_str = dt.strftime("%I:%M %p")
    except Exception:
        date_str = str(sched or "")
    for iv in (result.get("interviewers") or []):
        email = (iv.get("email") or "").strip()
        if not email:
            continue
        background_tasks.add_task(
            send_interviewer_assigned_email,
            to_email=email,
            interviewer_name=iv.get("name", "") or "Interviewer",
            candidate_name=result.get("candidate_name", ""),
            job_title=result.get("job_title") or "",
            company_name=cu.get("company_name", ""),
            interview_date=date_str,
            interview_time=time_str,
            interview_mode=result.get("mode", ""),
            venue_or_link=result.get("location_or_link") or "",
            duration_minutes=result.get("duration_minutes", 60),
            company_id=cu.get("company_id", ""),
            round_name=result.get("round_name", ""),
        )


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
    background_tasks: BackgroundTasks,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    svc = HRMHiringService(db)
    result = await svc.submit_feedback(interview_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Interview not found")

    if data.notify_candidate and data.result in ("passed", "failed"):
        from app.core.config import settings as _settings
        if _settings.EMAIL_ENABLED:
            candidate = await svc.get_candidate(result["candidate_id"], cu["company_id"])
            if candidate and candidate.get("email"):
                if data.result == "passed":
                    from app.services.email_service import send_hrm_interview_passed_email
                    background_tasks.add_task(
                        send_hrm_interview_passed_email,
                        to_email=candidate["email"],
                        candidate_name=result.get("candidate_name", ""),
                        job_title=result.get("job_title") or "",
                        round_name=result.get("round_name", ""),
                        has_next_round=bool(result.get("next_round")),
                        company_name=cu.get("company_name", ""),
                        company_id=cu.get("company_id", ""),
                    )
                else:
                    from app.services.email_service import send_hrm_interview_rejected_email
                    background_tasks.add_task(
                        send_hrm_interview_rejected_email,
                        to_email=candidate["email"],
                        candidate_name=result.get("candidate_name", ""),
                        job_title=result.get("job_title") or "",
                        company_name=cu.get("company_name", ""),
                        company_id=cu.get("company_id", ""),
                    )
    return result


@router.put("/interviews/{interview_id}")
async def update_interview(
    interview_id: str,
    data: HRMInterviewUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    """Edit Interview / Reschedule Interview — same endpoint, the frontend
    just shows a different subset of fields for each action."""
    result = await HRMHiringService(db).update_interview(interview_id, cu["company_id"], data.model_dump(exclude_none=True))
    if not result:
        raise HTTPException(status_code=404, detail="Interview not found")
    return result


@router.post("/interviews/{interview_id}/cancel")
async def cancel_interview(
    interview_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    result = await HRMHiringService(db).cancel_interview(interview_id, cu["company_id"])
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


class GenerateOfferLetterRequest(BaseModel):
    template_id: str
    field_values: Optional[dict] = None


@router.post("/offers/{offer_id}/generate-letter")
async def generate_offer_letter(
    offer_id: str,
    body: GenerateOfferLetterRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    """Generates the offer letter via Document Center's own existing template
    engine (called as a library function — Document Center itself is
    untouched) and attaches the resulting PDF to this offer."""
    return await HRMHiringService(db).generate_offer_letter_via_doc_center(
        offer_id, cu["company_id"], body.template_id, cu["id"], cu.get("full_name", "HR Team"),
        extra_field_values=body.field_values,
    )


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


async def _store_candidate_resume(cdb, company_id: str, candidate_id: str, file: UploadFile) -> dict:
    """Single implementation of HRM hiring resume storage — shared by the public
    apply flow and the authenticated Add/Edit Candidate flow. Same validation,
    same directory, same URL shape, so there is only one upload implementation.
    Also records the original filename so downloads can restore it."""
    from datetime import datetime, timezone

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
        {"$set": {
            "resume_url": resume_url,
            "resume_filename": os.path.basename(file.filename or "") or None,
            "updated_at": datetime.now(timezone.utc),
        }},
    )
    return {"resume_url": resume_url, "resume_filename": os.path.basename(file.filename or "") or None}


@router.post("/candidates/{cand_id}/resume")
async def upload_candidate_resume(
    cand_id: str,
    file: UploadFile = File(...),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:hiring:manage"], ["hrm:hiring:create"], ["hrm:hiring:edit"]])),
):
    """Attach/replace a resume on an existing applicant (Add / Edit Candidate).
    Reuses the same storage helper as the public apply flow."""
    candidate = await db["hrm_candidates"].find_one({"_id": cand_id, "company_id": cu["company_id"]})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")
    stored = await _store_candidate_resume(db, cu["company_id"], cand_id, file)
    return {"success": True, **stored}


@public_router.post("/apply/{slug}/resume")
async def upload_public_resume(slug: str, candidate_id: str, file: UploadFile = File(...)):
    """Public — no auth. Attach a resume to the applicant just created via
    the public submit above (mirrors public_forms.py's resume upload step)."""
    from app.core.database import DatabaseManager

    job_meta = await HRMHiringService(None).get_public_job_by_slug(slug)
    company_id = job_meta["company_id"]
    cdb = DatabaseManager.get_company_db(company_id)
    candidate = await cdb["hrm_candidates"].find_one({"_id": candidate_id, "company_id": company_id})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    stored = await _store_candidate_resume(cdb, company_id, candidate_id, file)
    return {"success": True, **stored}
