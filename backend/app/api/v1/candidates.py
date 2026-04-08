"""
Candidates API - Phase 3
Handles candidate management with AI resume parsing and keyword search
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timezone, timedelta
import uuid, asyncio

from app.models.company.candidate import (
    CandidateCreate, CandidateUpdate, CandidateResponse, CandidateListResponse,
    CandidateSearchParams, CandidateStatus, CandidateSource, NoticePeriod
)
from app.services.candidate_service import CandidateService
from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.core.database import get_master_db

router = APIRouter(prefix="/candidates", tags=["Candidates"])
public_router = APIRouter(prefix="/public", tags=["Public"])


@router.get("/")
async def list_candidates(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    skills: Optional[str] = None,  # Comma-separated
    min_experience: Optional[float] = None,
    max_experience: Optional[float] = None,
    min_ctc: Optional[float] = None,
    max_ctc: Optional[float] = None,
    notice_period: Optional[str] = None,  # Comma-separated
    location: Optional[str] = None,  # Comma-separated
    status: Optional[str] = None,  # Comma-separated
    source: Optional[str] = None,  # Comma-separated
    assigned_to: Optional[str] = None,
    partner_id: Optional[str] = None,
    tags: Optional[str] = None,  # Comma-separated
    created_from: Optional[date] = None,
    created_to: Optional[date] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """List candidates with advanced filters"""
    search_params = CandidateSearchParams(
        keyword=keyword,
        skills=skills.split(",") if skills else None,
        min_experience=min_experience,
        max_experience=max_experience,
        min_ctc=min_ctc,
        max_ctc=max_ctc,
        notice_period=notice_period.split(",") if notice_period else None,
        location=location.split(",") if location else None,
        status=status.split(",") if status else None,
        source=source.split(",") if source else None,
        assigned_to=assigned_to,
        partner_id=partner_id,
        tags=tags.split(",") if tags else None,
        created_from=created_from,
        created_to=created_to
    )
    
    result = await CandidateService.list_candidates(
        db=db,
        page=page,
        page_size=page_size,
        search_params=search_params,
        current_user=current_user
    )

    return {"success": True, **result}


@router.get("/search")
async def search_candidates_by_keywords(
    q: str = Query(..., min_length=2, description="Search query like 'Python 3+ years Bangalore'"),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """
    Advanced keyword search
    Examples:
    - "Python 3+ years Bangalore"
    - "React Node remote"
    - "Java senior developer"
    """
    result = await CandidateService.search_by_keywords(
        db=db,
        keywords=q,
        page=page,
        page_size=page_size
    )
    
    return {"success": True, **result}


@router.get("/dashboard-stats")
async def get_candidate_stats(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get candidate statistics for dashboard"""
    # If coordinator, show their assigned candidates only
    user_id = None
    if current_user.get("role") in ["candidate_coordinator", "client_coordinator"]:
        user_id = current_user["id"]
    
    stats = await CandidateService.get_dashboard_stats(db, user_id)
    return {"success": True, "data": stats}


@router.get("/statuses")
async def get_candidate_statuses(
    current_user: dict = Depends(get_current_user)
):
    """Get available candidate statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in CandidateStatus]
    return {"success": True, "data": statuses}


@router.get("/sources")
async def get_candidate_sources(
    current_user: dict = Depends(get_current_user)
):
    """Get available candidate sources"""
    sources = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in CandidateSource]
    return {"success": True, "data": sources}


@router.get("/notice-periods")
async def get_notice_periods(
    current_user: dict = Depends(get_current_user)
):
    """Get available notice periods"""
    from app.models.company.candidate import NOTICE_PERIOD_DISPLAY
    periods = [{"value": k, "label": v} for k, v in NOTICE_PERIOD_DISPLAY.items()]
    return {"success": True, "data": periods}


@router.post("/")
async def create_candidate(
    candidate_data: CandidateCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """Create a new candidate"""
    # If partner, tag candidate to partner
    partner_id = None
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    candidate = await CandidateService.create_candidate(
        db=db,
        candidate_data=candidate_data,
        created_by=current_user["id"],
        partner_id=partner_id,
        company_id=current_user.get("company_id", ""),
        company_name=current_user.get("company_name", ""),
        recruiter_name=current_user.get("full_name", ""),
    )
    
    return {"success": True, "message": "Candidate created successfully", "data": candidate}


@router.post("/parse-resume")
async def parse_resume(
    candidate_id: Optional[str] = Form(None),
    resume_text: str = Form(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """
    Parse resume text using AI and extract candidate details.
    If candidate_id is provided, updates the candidate with parsed data.
    """
    result = await CandidateService.parse_resume(
        db=db,
        candidate_id=candidate_id,
        resume_text=resume_text,
        updated_by=current_user["id"]
    )
    
    return {
        "success": True,
        "message": "Resume parsed successfully",
        "data": result
    }


@router.post("/extract-resume")
async def extract_resume_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """
    Upload a resume file (PDF/DOCX/TXT), extract text, and return parsed candidate fields.
    Used for auto-filling the candidate creation form.
    """
    import io, re, os

    ALLOWED = {".pdf", ".doc", ".docx", ".txt"}
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC, or TXT files are supported.")

    content = await file.read()
    text = ""

    if ext == ".txt":
        text = content.decode("utf-8", errors="ignore")

    elif ext == ".docx":
        try:
            import zipfile, xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                with z.open("word/document.xml") as xml_file:
                    tree = ET.parse(xml_file)
                    texts = [node.text for node in tree.iter("{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t") if node.text]
                    text = " ".join(texts)
        except Exception:
            text = ""

    elif ext in (".pdf", ".doc"):
        try:
            from pypdf import PdfReader
            reader = PdfReader(io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            text = content.decode("utf-8", errors="ignore")

    # ── Parse extracted text ──────────────────────────────────────────────────
    email_m = re.search(r"[\w.\-+]+@[\w.\-]+\.\w{2,}", text)
    email = email_m.group() if email_m else None

    phone_m = re.search(r"(?:\+91[-\s]?)?[6-9]\d{9}", re.sub(r"\s", "", text))
    mobile = phone_m.group() if phone_m else None

    # Simple name extraction: first non-empty line that looks like a name
    name = ""
    for line in text.splitlines():
        line = line.strip()
        if 2 <= len(line.split()) <= 5 and line.replace(" ", "").isalpha():
            name = line
            break
    first_name = name.split()[0] if name else ""
    last_name = " ".join(name.split()[1:]) if len(name.split()) > 1 else ""

    # Skills
    COMMON_SKILLS = [
        "python", "java", "javascript", "typescript", "react", "vue", "angular",
        "node", "nodejs", "sql", "mysql", "postgresql", "mongodb", "redis",
        "aws", "azure", "gcp", "docker", "kubernetes", "git", "agile", "scrum",
        "django", "flask", "fastapi", "spring", "laravel", "php", "ruby", "go",
        "rust", "c++", "c#", ".net", "swift", "kotlin", "flutter", "dart",
        "machine learning", "deep learning", "tensorflow", "pytorch", "nlp",
    ]
    text_lower = text.lower()
    found_skills = [s.title() for s in COMMON_SKILLS if s in text_lower]

    return {
        "success": True,
        "data": {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "mobile": re.sub(r"\D", "", mobile)[-10:] if mobile else None,
            "skills": found_skills,
            "raw_text": text[:3000],
        }
    }


@router.post("/{candidate_id}/resume")
async def upload_candidate_resume(
    candidate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Upload or replace a candidate's resume (PDF, DOC, DOCX — max 5 MB)"""
    candidate = await CandidateService.upload_resume(
        db=db,
        candidate_id=candidate_id,
        file=file,
        updated_by=current_user["id"]
    )
    return {"success": True, "message": "Resume uploaded successfully", "data": candidate}


@router.get("/{candidate_id}/eligible-jobs")
async def get_candidate_eligible_jobs(
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get open jobs with eligibility scores for a specific candidate."""
    from app.services.application_service import ApplicationService
    results = await ApplicationService.get_eligible_jobs_for_candidate(db, candidate_id)
    return {"success": True, "data": results}


@router.get("/{candidate_id}")
async def get_candidate(
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get candidate by ID"""
    candidate = await CandidateService.get_candidate(db, candidate_id)
    return {"success": True, "data": candidate}


@router.put("/{candidate_id}")
async def update_candidate(
    candidate_id: str,
    update_data: CandidateUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Update a candidate"""
    candidate = await CandidateService.update_candidate(
        db=db,
        candidate_id=candidate_id,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Candidate updated successfully", "data": candidate}


@router.put("/{candidate_id}/status")
async def update_candidate_status(
    candidate_id: str,
    status: str = Query(...),
    remarks: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Update candidate status"""
    candidate = await CandidateService.update_candidate_status(
        db=db,
        candidate_id=candidate_id,
        new_status=status,
        updated_by=current_user["id"],
        remarks=remarks
    )
    
    return {"success": True, "message": f"Status updated to {status}", "data": candidate}


@router.put("/{candidate_id}/assign")
async def assign_candidate(
    candidate_id: str,
    assigned_to: str = Query(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:assign"]))
):
    """Assign candidate to a coordinator"""
    candidate = await CandidateService.assign_candidate(
        db=db,
        candidate_id=candidate_id,
        assigned_to=assigned_to,
        assigned_by=current_user["id"]
    )
    
    return {"success": True, "message": "Candidate assigned successfully", "data": candidate}


@router.delete("/{candidate_id}")
async def delete_candidate(
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:delete"]))
):
    """Soft delete a candidate"""
    await CandidateService.delete_candidate(
        db=db,
        candidate_id=candidate_id,
        deleted_by=current_user["id"]
    )
    
    return {"success": True, "message": "Candidate deleted successfully"}


# ── Candidate Form Link (Method 2) ────────────────────────────────────────────

class FormLinkRequest(BaseModel):
    email: Optional[str] = None  # If provided, send the link via email
    frontend_base_url: Optional[str] = None  # e.g. https://app.example.com


@router.post("/generate-form-link")
async def generate_candidate_form_link(
    body: FormLinkRequest = FormLinkRequest(),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"])),
):
    """
    Generate a unique one-time URL that an external candidate can use to
    self-register (expires in 7 days).
    Token generation ALWAYS succeeds. Email is sent only when EMAIL_ENABLED=True.
    """
    from app.core.config import settings as _settings

    token = uuid.uuid4().hex
    now = datetime.now(timezone.utc)
    await db.candidate_form_tokens.insert_one({
        "_id": token,
        "candidate_email": body.email,
        "created_by": current_user["id"],
        "created_at": now,
        "expires_at": now + timedelta(days=7),
        "used": False,
    })

    email_sent = False
    email_enabled = _settings.EMAIL_ENABLED

    if body.email and email_enabled:
        base = (body.frontend_base_url or "").rstrip("/")
        form_url = f"{base}/apply/{token}"
        try:
            from app.services.email_service import EmailService
            html = (
                f"<p>Hello,</p>"
                f"<p>You have been invited to complete a candidate registration form. "
                f"Please click the link below to submit your details:</p>"
                f"<p><a href='{form_url}'>{form_url}</a></p>"
                f"<p>This link expires in 7 days.</p>"
                f"<p>Regards,<br/>{current_user.get('full_name', 'The Recruitment Team')}</p>"
            )
            text = f"Candidate Registration Form\n\n{form_url}\n\nThis link expires in 7 days."
            email_sent = await asyncio.to_thread(
                EmailService._send_smtp, body.email, "Candidate Registration Form", html, text
            )
        except Exception:
            pass  # Email failure is never fatal

    return {
        "success": True,
        "token": token,
        "email_sent": email_sent,
        "email_enabled": email_enabled,
        "message": "Form link sent successfully" if email_sent else "Form link generated",
    }


# ── Public endpoints (no auth) ────────────────────────────────────────────────

@public_router.get("/candidate-form/{token}")
async def get_candidate_form_meta(token: str):
    """Validate a form token and return minimal metadata (used by the public form page)."""
    from app.core.database import get_master_db as _master
    master_db = _master()
    # Find the token across all company DBs via the master tenants list
    tenants = await master_db.tenants.find({}, {"company_id": 1}).to_list(length=500)
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        from app.core.database import get_company_db as _cdb
        cdb = _cdb(cid)
        doc = await cdb.candidate_form_tokens.find_one({"_id": token})
        if doc:
            if doc.get("used"):
                raise HTTPException(status_code=410, detail="This link has already been used.")
            if doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
                raise HTTPException(status_code=410, detail="This link has expired.")
            return {"success": True, "token": token, "company_id": cid}
    raise HTTPException(status_code=404, detail="Invalid or expired form link.")


@public_router.post("/candidate-form/{token}")
async def submit_candidate_form(token: str, data: dict):
    """
    Public endpoint — no auth.  Accepts candidate details submitted via the
    form link and creates a candidate record in the correct company DB.
    """
    from app.core.database import get_master_db as _master, get_company_db as _cdb
    master_db = _master()
    tenants = await master_db.tenants.find({}, {"company_id": 1}).to_list(length=500)
    company_db = None
    token_doc = None
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        cdb = _cdb(cid)
        doc = await cdb.candidate_form_tokens.find_one({"_id": token})
        if doc:
            token_doc = doc
            company_db = cdb
            break

    if not token_doc:
        raise HTTPException(status_code=404, detail="Invalid or expired form link.")
    if token_doc.get("used"):
        raise HTTPException(status_code=410, detail="This link has already been used.")
    if token_doc["expires_at"].replace(tzinfo=timezone.utc) < datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="This link has expired.")

    # Build candidate document from full public form payload
    now = datetime.now(timezone.utc)
    candidate_id = uuid.uuid4().hex

    first_name = data.get("first_name", "").strip()
    email = data.get("email", "").strip().lower()

    if not first_name or not email:
        raise HTTPException(status_code=422, detail="first_name and email are required.")

    candidate = {
        "_id": candidate_id,
        "first_name": first_name,
        "last_name": (data.get("last_name") or "").strip() or None,
        "email": email,
        "mobile": (data.get("mobile") or "").strip() or None,
        "alternate_mobile": (data.get("alternate_mobile") or "").strip() or None,
        "date_of_birth": data.get("date_of_birth") or None,
        "gender": data.get("gender") or None,
        "current_city": data.get("current_city") or None,
        "current_state": data.get("current_state") or None,
        "total_experience_years": data.get("total_experience_years"),
        "current_company": data.get("current_company") or None,
        "current_designation": data.get("current_designation") or None,
        "current_ctc": data.get("current_ctc"),
        "expected_ctc": data.get("expected_ctc"),
        "notice_period": data.get("notice_period") or None,
        "skills": data.get("skills", []),
        "skill_tags": data.get("skill_tags", [s.get("name", s) if isinstance(s, dict) else s for s in data.get("skills", [])]),
        "education": data.get("education", []),
        "percentage": data.get("percentage"),
        "preferred_locations": data.get("preferred_locations", []),
        "willing_to_relocate": bool(data.get("willing_to_relocate", False)),
        "linkedin_url": data.get("linkedin_url") or None,
        "portfolio_url": data.get("portfolio_url") or None,
        "notes": data.get("summary") or None,
        "source": "form_link",
        "status": "active",
        "is_deleted": False,
        "created_by": token_doc.get("created_by"),
        "created_at": now,
        "updated_at": now,
    }

    # Check for duplicate email
    existing = await company_db.candidates.find_one({"email": candidate["email"], "is_deleted": False})
    if existing:
        raise HTTPException(status_code=409, detail="A candidate with this email already exists.")

    await company_db.candidates.insert_one(candidate)
    # Mark token as used
    await company_db.candidate_form_tokens.update_one({"_id": token}, {"$set": {"used": True, "used_at": now}})

    return {"success": True, "message": "Thank you! Your details have been submitted."}