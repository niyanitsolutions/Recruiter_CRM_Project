"""
Candidates API - Phase 3
Handles candidate management with AI resume parsing and keyword search
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form, status as http_status
from fastapi.responses import FileResponse, RedirectResponse
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timezone, timedelta
import uuid

from app.models.company.candidate import (
    CandidateCreate, CandidateUpdate, CandidateResponse, CandidateListResponse,
    CandidateSearchParams, CandidateStatus, CandidateSource, NoticePeriod
)
from app.services.candidate_service import CandidateService
from app.services.notification_service import NotificationService
from app.models.company.notification import NotificationCreate, NotificationType, NotificationChannel
from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.core.database import get_master_db

import hashlib
import re as _re
import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidates", tags=["Candidates"])
public_router = APIRouter(prefix="/public", tags=["Public"])


# ─── Resume parse helpers ─────────────────────────────────────────────────────

# In-process cache: SHA-256(file bytes) → full parsed response dict.
# Avoids a second AI call when the exact same resume is re-uploaded.
_PARSE_CACHE: dict[str, dict] = {}
_PARSE_CACHE_MAX = 100


def _cache_key(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _cache_get(key: str) -> dict | None:
    return _PARSE_CACHE.get(key)


def _cache_set(key: str, value: dict) -> None:
    if len(_PARSE_CACHE) >= _PARSE_CACHE_MAX:
        del _PARSE_CACHE[next(iter(_PARSE_CACHE))]
    _PARSE_CACHE[key] = value


def _extract_text_from_content(content: bytes, ext: str, filename: str) -> str:
    """Extract raw text from file bytes. Shared by all resume endpoints."""
    import io
    if ext == ".txt":
        return content.decode("utf-8", errors="ignore")

    if ext == ".docx":
        try:
            import zipfile
            import xml.etree.ElementTree as ET
            with zipfile.ZipFile(io.BytesIO(content)) as z:
                with z.open("word/document.xml") as xml_file:
                    tree = ET.parse(xml_file)
                    ns = "{http://schemas.openxmlformats.org/wordprocessingml/2006/main}"
                    # Use <w:p> paragraph boundaries to preserve line structure
                    paragraphs = []
                    for para in tree.iter(f"{ns}p"):
                        texts = [node.text for node in para.iter(f"{ns}t") if node.text]
                        if texts:
                            paragraphs.append("".join(texts))
                    return "\n".join(paragraphs)
        except Exception as exc:
            logger.warning("docx_extract_failed filename=%s error=%s", filename, exc)
            return ""

    if ext == ".pdf":
        try:
            from pypdf import PdfReader
            import io as _io
            reader = PdfReader(_io.BytesIO(content))
            return "\n".join(page.extract_text() or "" for page in reader.pages)
        except ImportError:
            raise HTTPException(
                status_code=503,
                detail="PDF parsing library is not installed on the server. Please contact support.",
            )
        except Exception as exc:
            logger.error("pdf_extract_failed filename=%s error=%s", filename, exc)
            raise HTTPException(
                status_code=422,
                detail="Could not read the PDF file. Ensure it is not password-protected or corrupted.",
            )

    if ext == ".doc":
        return content.decode("utf-8", errors="ignore")

    return ""


def _clean_resume_text(text: str) -> str:
    """Normalise extracted text: collapse blanks, drop page numbers, remove duplicate lines."""
    lines = text.splitlines()
    out: list[str] = []
    prev = None
    for line in lines:
        s = line.strip()
        if _re.match(r'^\d{1,3}$', s):   # standalone page numbers
            continue
        if s == '' and prev == '':         # consecutive blank lines → one
            continue
        if s and s == prev:                # exact duplicate (running header/footer)
            continue
        out.append(s)
        prev = s
    result = '\n'.join(out).strip()
    result = _re.sub(r'\n{3,}', '\n\n', result)
    return result


def _extract_contact_fields(text: str) -> dict:
    """Regex-based deterministic extraction of contact fields — no AI required."""
    # Email
    email = ''
    m = _re.search(r'\b[A-Za-z0-9._%+\-]+@[A-Za-z0-9.\-]+\.[A-Za-z]{2,7}\b', text)
    if m:
        email = m.group(0).lower()

    # Phone — try Indian mobile first, then generic international
    mobile = ''
    for pat in (
        r'(?:\+?91[\s\-.]?)?[6-9]\d{9}\b',
        r'\+?\d[\d\s\-\.]{8,14}\d',
    ):
        pm = _re.search(pat, text)
        if pm:
            digits = _re.sub(r'\D', '', pm.group(0))
            if len(digits) >= 10:
                mobile = digits[-10:]
                break

    # LinkedIn
    linkedin = ''
    lm = _re.search(
        r'(?:https?://)?(?:www\.)?linkedin\.com/in/[\w%\-]+/?', text, _re.IGNORECASE
    )
    if lm:
        url = lm.group(0).rstrip('/')
        linkedin = url if url.startswith('http') else 'https://' + url

    # GitHub
    github = ''
    gm = _re.search(
        r'(?:https?://)?(?:www\.)?github\.com/[\w\-]+\b', text, _re.IGNORECASE
    )
    if gm:
        url = gm.group(0).rstrip('/')
        github = url if url.startswith('http') else 'https://' + url

    return {'email': email, 'mobile': mobile, 'linkedin_url': linkedin, 'github_url': github}


def _trim_resume_for_ai(text: str, max_chars: int = 5000) -> str:
    """Smart trim for large resumes: keep beginning (contact+skills) and end (education)."""
    if len(text) <= max_chars:
        return text
    head = int(max_chars * 0.65)
    tail = max_chars - head
    return text[:head] + '\n...\n' + text[-tail:]


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
    days: Optional[int] = Query(None, ge=0, description="Filter to last N days; 0 or omit = all time"),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get candidate statistics for dashboard"""
    from app.core.redis import get_cache, set_cache
    cache_key = f"candidates-dashboard-stats:{current_user.get('company_id', '')}:{current_user.get('id', '')}:{days or 0}"
    cached = await get_cache(cache_key)
    if cached:
        return cached

    start_date = None
    if days and days > 0:
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
    stats = await CandidateService.get_dashboard_stats(db, current_user, start_date=start_date)
    result = {"success": True, "data": stats}
    # Short TTL — this endpoint backs a 5s-polled dashboard widget, so keep it
    # fresh while still absorbing the repeated identical requests each poll tick.
    await set_cache(cache_key, result, ttl_seconds=30)
    return result


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
    import logging as _log
    import traceback
    from pydantic import ValidationError as _ValidationError

    # If partner, tag candidate to partner
    partner_id = None
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]

    try:
        candidate = await CandidateService.create_candidate(
            db=db,
            candidate_data=candidate_data,
            created_by=current_user["id"],
            partner_id=partner_id,
            company_id=current_user.get("company_id", ""),
            company_name=current_user.get("company_name", ""),
            recruiter_name=current_user.get("full_name", ""),
        )
    except HTTPException:
        raise
    except _ValidationError as ve:
        raise HTTPException(
            status_code=422,
            detail=str(ve)
        )
    except Exception as exc:
        _log.getLogger(__name__).error(
            "Candidate creation failed: %s\n%s",
            exc,
            traceback.format_exc()
        )
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create candidate: {exc}"
        )

    logger.info("Notification triggered: candidate_created id=%s by user=%s", candidate.id, current_user["id"])
    try:
        await NotificationService(db).create_notification(
            data=NotificationCreate(
                user_id=current_user["id"],
                type=NotificationType.SYSTEM_ALERT,
                title="Candidate Added",
                message=f"New candidate '{candidate_data.full_name}' was added successfully.",
                channels=[NotificationChannel.IN_APP],
            ),
            company_id=current_user.get("company_id", ""),
        )
    except Exception as _ne:
        logger.warning("Notification skipped (candidate create): %s", _ne)

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


@router.post("/extract-resume-local")
async def extract_resume_local(
    file: UploadFile = File(...),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """Fast regex-only contact extraction — no AI. Returns email/mobile/linkedin/github in <500ms."""
    import os
    ALLOWED = {".pdf", ".doc", ".docx", ".txt"}
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC, or TXT files are supported.")
    content = await file.read()
    raw_text = _extract_text_from_content(content, ext, file.filename)
    cleaned = _clean_resume_text(raw_text)
    fields = _extract_contact_fields(cleaned)
    logger.info("extract_resume_local filename=%s email=%r mobile=%r", file.filename, fields['email'], bool(fields['mobile']))
    return {"success": True, "data": fields}


@router.post("/extract-resume")
async def extract_resume_file(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """Upload a resume, extract text, parse with AI. Returns structured candidate fields."""
    import os
    ALLOWED = {".pdf", ".doc", ".docx", ".txt"}
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC, or TXT files are supported.")

    content = await file.read()
    logger.info("extract_resume filename=%s size=%d ext=%s", file.filename, len(content), ext)

    # Cache hit: return instantly without AI call
    ck = _cache_key(content)
    cached = _cache_get(ck)
    if cached:
        logger.info("extract_resume cache_hit filename=%s", file.filename)
        return cached

    raw_text = _extract_text_from_content(content, ext, file.filename)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from the uploaded file.")

    cleaned = _clean_resume_text(raw_text)
    logger.info("extract_resume filename=%s raw=%d cleaned=%d chars", file.filename, len(raw_text), len(cleaned))

    result = await _ai_parse_resume(cleaned)
    _cache_set(ck, result)
    return result


async def _ai_parse_resume(raw_text: str) -> dict:
    """Parse resume via the centralized AI provider service and return formatted candidate data."""
    import re
    from app.services.ai_service import AIService

    trimmed = _trim_resume_for_ai(raw_text, max_chars=5000)
    logger.info("ai_parse_resume text_chars=%d trimmed_chars=%d", len(raw_text), len(trimmed))
    parsed = await AIService.parse_resume(trimmed, get_master_db())
    logger.info("ai_parse_resume_done first_name=%r email=%r skills_count=%d",
                parsed.get("first_name"), parsed.get("email"), len(parsed.get("skills") or []))

    full_name = parsed.get("full_name", "")
    name_parts = full_name.split(" ", 1) if full_name else ["", ""]
    first_name = name_parts[0]
    last_name = name_parts[1] if len(name_parts) > 1 else ""

    # Normalise education
    education = []
    for edu in (parsed.get("education") or []):
        if not isinstance(edu, dict):
            continue
        education.append({
            "degree":         str(edu.get("degree") or ""),
            "field_of_study": str(edu.get("field_of_study") or ""),
            "institution":    str(edu.get("institution") or ""),
            "from_year":      str(edu.get("year_from") or ""),
            "to_year":        str(edu.get("year_to") or ""),
            "percentage":     str(edu.get("score") or ""),
            "score_type":     str(edu.get("score_type") or ""),
        })

    # Normalise experience
    experience = []
    for exp in (parsed.get("experience") or []):
        if not isinstance(exp, dict):
            continue
        experience.append({
            "company_name": str(exp.get("company_name") or ""),
            "designation":  str(exp.get("job_title") or ""),
            "start_date":   str(exp.get("start_date") or ""),
            "end_date":     str(exp.get("end_date") or ""),
            "is_current":   bool(exp.get("is_current", False)),
            "description":  str(exp.get("description") or ""),
        })

    # Strip non-digit characters from phone, keep last 10 digits
    import re
    phone_raw = str(parsed.get("phone") or "")
    phone_digits = re.sub(r"\D", "", phone_raw)
    mobile = phone_digits[-10:] if len(phone_digits) >= 10 else phone_digits

    return {
        "success": True,
        "data": {
            "first_name":             first_name,
            "last_name":              last_name,
            "email":                  str(parsed.get("email") or ""),
            "mobile":                 mobile,
            "current_city":           str(parsed.get("location") or ""),
            "linkedin_url":           str(parsed.get("linkedin") or ""),
            "current_designation":    str(parsed.get("current_role") or ""),
            "total_experience_years": float(parsed.get("total_experience_years") or 0),
            "skills":                 [str(s) for s in (parsed.get("skills") or []) if s],
            "education":              education,
            "experience":             experience,
        },
    }


@router.get("/{candidate_id}/resume")
async def view_candidate_resume(
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Stream or redirect to the candidate's resume file."""
    import os
    from app.core.config import settings

    candidate = await CandidateService.get_candidate(db, candidate_id)
    resume_url = candidate.resume_url
    if not resume_url:
        raise HTTPException(status_code=404, detail="No resume uploaded for this candidate")

    # S3 / external URL — redirect the browser directly to it
    if resume_url.startswith("http"):
        return RedirectResponse(url=resume_url, status_code=302)

    # Local disk file — serve from disk.
    # _save_to_local() (app/utils/s3.py) actually stores this as
    # "/api/v1/uploads/resumes/abc.pdf" (older records may have the plain
    # "/uploads/resumes/abc.pdf" form). `.lstrip("/uploads/")` strips leading
    # *characters* found in that string, not the literal prefix — "/api/v1/..."
    # stops at "i" (not in the strip set), producing a bogus path like
    # "i/v1/uploads/resumes/abc.pdf" that never exists on disk, so every local
    # resume 404'd even though the file was actually there. Strip the real
    # literal prefix instead.
    relative = resume_url
    for _prefix in ("/api/v1/uploads/", "/uploads/"):
        if relative.startswith(_prefix):
            relative = relative[len(_prefix):]
            break
    file_path = os.path.join(settings.UPLOAD_DIR, relative)  # "uploads/resumes/abc.pdf"
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Resume file not found on server")

    ext = os.path.splitext(file_path)[1].lower()
    media_types = {
        ".pdf":  "application/pdf",
        ".doc":  "application/msword",
        ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    }
    media_type = media_types.get(ext, "application/octet-stream")
    return FileResponse(file_path, media_type=media_type, filename=os.path.basename(file_path))


@router.post("/{candidate_id}/photo")
async def upload_candidate_photo(
    candidate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Upload or replace a candidate's profile photo (JPG, JPEG, PNG, WEBP — max 5 MB)"""
    import os

    ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, WEBP images are allowed")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Profile photo must be smaller than 5 MB")

    candidate = await db.candidates.find_one(
        {"_id": candidate_id, "is_deleted": False},
        {"_id": 1},
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    from app.utils.s3 import upload_file as s3_upload
    photo_url = await s3_upload(contents, file.filename or f"photo{ext}", folder="profiles", candidate_id=candidate_id)

    await db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "photo_url": photo_url}


@router.delete("/{candidate_id}/photo")
async def delete_candidate_photo(
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Remove a candidate's profile photo"""
    candidate = await db.candidates.find_one(
        {"_id": candidate_id, "is_deleted": False},
        {"_id": 1},
    )
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found")

    await db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"photo_url": None, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True}


@router.post("/{candidate_id}/resume")
async def upload_candidate_resume(
    candidate_id: str,
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Upload or replace a candidate's resume (PDF, DOC, DOCX — max 5 MB)"""
    try:
        candidate = await CandidateService.upload_resume(
            db=db,
            candidate_id=candidate_id,
            file=file,
            updated_by=current_user["id"]
        )
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("Resume upload failed for candidate %s: %s", candidate_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to upload resume. Please try again.")
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
        updated_by=current_user["id"],
        user_name=current_user.get("full_name", "")
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
        remarks=remarks,
        user_name=current_user.get("full_name", "")
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
        assigned_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )
    
    return {"success": True, "message": "Candidate assigned successfully", "data": candidate}



# ── Bulk import helpers (shared by preview + import endpoints) ───────────────

_IMPORT_FIELD_MAP = {
    # ── Name ──────────────────────────────────────────────────────────────────
    "first name": "first_name", "first_name": "first_name", "firstname": "first_name",
    "fname": "first_name",
    "last name": "last_name", "last_name": "last_name", "lastname": "last_name",
    "lname": "last_name", "surname": "last_name",
    "full name": "full_name", "full_name": "full_name", "name": "full_name",
    "candidate name": "full_name", "candidate_name": "full_name",
    # ── Contact ───────────────────────────────────────────────────────────────
    "email": "email", "email address": "email", "email id": "email",
    "email_id": "email", "e mail": "email", "e-mail": "email",
    "mobile": "mobile", "phone": "mobile", "contact": "mobile",
    "mobile number": "mobile", "mobile no": "mobile", "mobile_no": "mobile",
    "phone number": "mobile", "phone no": "mobile", "phone_no": "mobile",
    "contact number": "mobile", "contact no": "mobile", "contact_no": "mobile",
    "cell": "mobile", "cell number": "mobile", "cell no": "mobile",
    "alternate mobile": "alternate_mobile", "alternate_mobile": "alternate_mobile",
    "alt mobile": "alternate_mobile", "alternate phone": "alternate_mobile",
    "other mobile": "alternate_mobile", "other phone": "alternate_mobile",
    # ── Personal ──────────────────────────────────────────────────────────────
    "date of birth": "date_of_birth", "date_of_birth": "date_of_birth",
    "dob": "date_of_birth", "birth date": "date_of_birth", "birthdate": "date_of_birth",
    "gender": "gender", "sex": "gender",
    # ── Location ──────────────────────────────────────────────────────────────
    "current city": "current_city", "current_city": "current_city",
    "city": "current_city", "current location": "current_city",
    "current_location": "current_city", "location": "current_city",
    "base location": "current_city", "base_location": "current_city",
    "residing city": "current_city", "place": "current_city",
    "hometown": "current_city", "present location": "current_city",
    "current state": "current_state", "current_state": "current_state",
    "state": "current_state",
    "current country": "current_country", "current_country": "current_country",
    "country": "current_country",
    # ── Experience ────────────────────────────────────────────────────────────
    "experience": "total_experience_years",
    "total experience": "total_experience_years",
    "total_experience_years": "total_experience_years",
    "experience years": "total_experience_years",
    "years of experience": "total_experience_years",
    "work experience": "total_experience_years",
    "total exp": "total_experience_years",
    "relevant experience": "total_experience_years",
    "experience in years": "total_experience_years",
    "exp in years": "total_experience_years",
    "exp in yrs": "total_experience_years",
    "yrs of exp": "total_experience_years",
    "exp": "total_experience_years",
    # ── Company / Designation ─────────────────────────────────────────────────
    "current company": "current_company", "current_company": "current_company",
    "company": "current_company", "employer": "current_company",
    "current employer": "current_company", "company name": "current_company",
    "organization": "current_company", "organisation": "current_company",
    "current organization": "current_company", "current organisation": "current_company",
    "current designation": "current_designation", "current_designation": "current_designation",
    "designation": "current_designation", "job title": "current_designation",
    "position": "current_designation", "current position": "current_designation",
    "role": "current_designation", "current role": "current_designation",
    "title": "current_designation", "profile": "current_designation",
    # ── CTC / Salary ──────────────────────────────────────────────────────────
    "current ctc": "current_ctc", "current_ctc": "current_ctc",
    "ctc": "current_ctc", "current salary": "current_ctc",
    "salary": "current_ctc", "present ctc": "current_ctc",
    "present salary": "current_ctc", "annual salary": "current_ctc",
    "annual ctc": "current_ctc", "fixed ctc": "current_ctc",
    "gross salary": "current_ctc", "total ctc": "current_ctc",
    "expected ctc": "expected_ctc", "expected_ctc": "expected_ctc",
    "expected salary": "expected_ctc", "expectation": "expected_ctc",
    "ectc": "expected_ctc", "exp ctc": "expected_ctc",
    "desired ctc": "expected_ctc", "desired salary": "expected_ctc",
    # ── Notice Period ─────────────────────────────────────────────────────────
    "notice period": "notice_period", "notice_period": "notice_period",
    "notice": "notice_period", "np": "notice_period",
    "joining time": "notice_period", "availability": "notice_period",
    "serving notice": "notice_period", "notice period days": "notice_period",
    # ── Skills ────────────────────────────────────────────────────────────────
    "key skills": "skill_tags", "key_skills": "skill_tags",
    "skills": "skill_tags", "skill_tags": "skill_tags", "skill tags": "skill_tags",
    "technical skills": "skill_tags", "core skills": "skill_tags",
    "primary skills": "skill_tags", "skillset": "skill_tags",
    "expertise": "skill_tags", "skill set": "skill_tags",
    "technologies": "skill_tags", "tech stack": "skill_tags",
    "technologies known": "skill_tags", "tools": "skill_tags",
    "key competencies": "skill_tags", "competencies": "skill_tags",
    # ── Education ─────────────────────────────────────────────────────────────
    "degree": "edu_degree", "education": "edu_degree", "qualification": "edu_degree",
    "highest qualification": "edu_degree", "educational qualification": "edu_degree",
    "field of study": "edu_field", "field_of_study": "edu_field",
    "specialization": "edu_field", "stream": "edu_field", "branch": "edu_field",
    "institution": "edu_institution", "university": "edu_institution",
    "college": "edu_institution", "institute": "edu_institution",
    "from year": "edu_from_year", "from_year": "edu_from_year",
    "graduation from": "edu_from_year",
    "to year": "edu_to_year", "to_year": "edu_to_year",
    "graduation year": "edu_to_year", "year_of_passing": "edu_to_year",
    "passing year": "edu_to_year", "year of passing": "edu_to_year",
    "percentage": "edu_percentage", "academic percentage": "edu_percentage",
    "marks": "edu_percentage", "cgpa": "edu_percentage",
    # ── Preferences ───────────────────────────────────────────────────────────
    "willing to relocate": "willing_to_relocate",
    "willing_to_relocate": "willing_to_relocate",
    "relocation": "willing_to_relocate", "open to relocation": "willing_to_relocate",
    "preferred locations": "preferred_locations",
    "preferred_locations": "preferred_locations",
    "preferred location": "preferred_locations",
    # ── Source ────────────────────────────────────────────────────────────────
    "source": "source", "candidate source": "source", "sourced from": "source",
    # ── Links ─────────────────────────────────────────────────────────────────
    "linkedin": "linkedin_url", "linkedin_url": "linkedin_url",
    "linkedin profile": "linkedin_url", "linkedin url": "linkedin_url",
    # ── Notes ─────────────────────────────────────────────────────────────────
    "summary": "notes", "notes": "notes", "remarks": "notes",
    "comments": "notes", "profile summary": "notes", "about": "notes",
}

# Pre-built sorted list (longest key first) for partial / suffix-stripped matching
_IMPORT_MAP_SORTED = sorted(_IMPORT_FIELD_MAP.keys(), key=len, reverse=True)


def _normalize_header(raw_key: str) -> str:
    """
    Normalise an Excel/CSV column header for fuzzy matching:
      - lowercase + strip
      - remove parenthetical noise  e.g. "(LPA)", "(Yrs)", "(in years)"
      - replace punctuation with spaces
      - collapse consecutive spaces
    """
    import re as _re
    k = raw_key.lower().strip()
    k = _re.sub(r'\s*\([^)]*\)', '', k)   # strip "(…)"
    k = _re.sub(r'[^a-z0-9 ]', ' ', k)   # keep only letters, digits, spaces
    return _re.sub(r'\s+', ' ', k).strip()


def _parse_import_file(content: bytes, ext: str) -> list:
    """Parse uploaded file bytes into a list of raw dicts."""
    import io, csv
    rows = []
    if ext == ".csv":
        text = content.decode("utf-8-sig", errors="ignore")
        reader = csv.DictReader(io.StringIO(text))
        rows = [dict(r) for r in reader]
    elif ext in (".xlsx", ".xls"):
        try:
            import openpyxl
            import io as _io
            wb = openpyxl.load_workbook(_io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            headers = []
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(c).strip() if c is not None else "" for c in row]
                else:
                    if all(v is None for v in row):
                        continue
                    rows.append({headers[j]: (str(row[j]).strip() if row[j] is not None else "") for j in range(len(headers))})
        except ImportError:
            raise HTTPException(status_code=400, detail="openpyxl is not installed on the server. Please contact your administrator.")
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Failed to read Excel file: {exc}. Please save your file as .xlsx (Excel Workbook) and try again.")
    elif ext == ".pdf":
        try:
            from pypdf import PdfReader
            import io as _io
            reader = PdfReader(_io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            text = content.decode("utf-8", errors="ignore")
        current: dict = {}
        for line in text.splitlines():
            line = line.strip()
            if not line:
                if current:
                    rows.append(current)
                    current = {}
                continue
            if ":" in line:
                k, _, v = line.partition(":")
                current[k.strip()] = v.strip()
        if current:
            rows.append(current)
    return rows


def _map_import_row(raw: dict) -> dict:
    """
    Map raw Excel/CSV column headers to canonical field names.

    Resolution order per column header:
      1. Exact match against _IMPORT_FIELD_MAP (after lower+strip)
      2. Exact match after full normalization (strip parens/punct)
      3. Longest-prefix fuzzy match from _IMPORT_MAP_SORTED
    """
    mapped = {}
    for k, v in raw.items():
        # Pass 1 — exact match (cheap, handles already-clean headers)
        canon = _IMPORT_FIELD_MAP.get(k.lower().strip())

        if canon is None:
            # Pass 2 — exact match on normalized form
            norm = _normalize_header(k)
            canon = _IMPORT_FIELD_MAP.get(norm)

        if canon is None and norm:
            # Pass 3 — longest key that is a word-boundary substring of norm
            for candidate_key in _IMPORT_MAP_SORTED:
                # Accept if normalized key is contained in normalized header
                # (handles "current ctc (lpa)" → "current ctc", etc.)
                if candidate_key in norm or norm in candidate_key:
                    canon = _IMPORT_FIELD_MAP[candidate_key]
                    break

        if canon and canon not in mapped:
            # First match wins — prevents a shorter fuzzy match from overwriting
            # a better exact match that was already stored
            mapped[canon] = v
    return mapped


@router.post("/bulk-import/preview")
async def preview_bulk_import(
    file: UploadFile = File(...),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """
    Parse file and return a preview of rows with validation status.
    Does NOT insert anything into the database.
    """
    import os
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    raw_rows = _parse_import_file(content, ext)
    mapped_rows = [_map_import_row(r) for r in raw_rows]

    # Collect emails for a bulk duplicate check
    candidate_emails = [m["email"].strip().lower() for m in mapped_rows if m.get("email")]
    existing_emails: set = set()
    if candidate_emails:
        cursor = db["candidates"].find(
            {"email": {"$in": candidate_emails}, "is_deleted": False},
            {"email": 1}
        )
        async for doc in cursor:
            existing_emails.add(doc["email"])

    preview_rows = []
    for idx, m in enumerate(mapped_rows, start=2):
        errors = []
        if not m.get("email"):
            errors.append("Missing email")
        if not m.get("mobile"):
            errors.append("Missing mobile")

        email = m.get("email", "").strip().lower()
        is_duplicate = bool(email and email in existing_emails)

        first = m.get("first_name", "").strip()
        last = m.get("last_name", "").strip()
        full = m.get("full_name", "").strip() or f"{first} {last}".strip()

        preview_rows.append({
            "row": idx,
            "fields": {
                "full_name": full,
                "email": m.get("email", ""),
                "mobile": m.get("mobile", ""),
                "current_company": m.get("current_company", ""),
                "current_designation": m.get("current_designation", ""),
                "total_experience_years": m.get("total_experience_years", ""),
                "current_city": m.get("current_city", ""),
                "current_ctc": m.get("current_ctc", ""),
                "expected_ctc": m.get("expected_ctc", ""),
                "notice_period": m.get("notice_period", ""),
                "skill_tags": m.get("skill_tags", ""),
                "source": m.get("source", ""),
            },
            "errors": errors,
            "is_duplicate": is_duplicate,
            "valid": len(errors) == 0 and not is_duplicate,
        })

    valid_count = sum(1 for r in preview_rows if r["valid"])
    return {
        "success": True,
        "total": len(preview_rows),
        "valid": valid_count,
        "rows": preview_rows,
    }


@router.post("/bulk-import")
async def bulk_import_candidates(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """
    Bulk import candidates from Excel (.xlsx/.xls), CSV, or PDF.
    Produces documents structurally identical to manually created candidates.
    Returns inserted count, skipped duplicates, and failed rows with reasons.
    """
    import os
    import re as _re
    from datetime import datetime, timezone
    from bson import ObjectId as _ObjectId

    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    rows = _parse_import_file(content, ext)

    # ── Helpers ──────────────────────────────────────────────────────────────

    def _to_float(v):
        """Convert any value to float, handling text like '3 Yrs', '3.5 years'."""
        if v is None:
            return None
        s = str(v).strip()
        if not s:
            return None
        try:
            return float(s)
        except (ValueError, TypeError):
            # Extract first numeric substring (handles "3 Yrs", "3.5 years", "~5", etc.)
            m = _re.search(r'\d+(?:\.\d+)?', s)
            return float(m.group()) if m else None

    def _clean_mobile(v):
        """Strip all non-digit characters; keep last 10 if >10 digits (Indian norm)."""
        if not v:
            return None
        digits = _re.sub(r'[^0-9]', '', str(v))
        if len(digits) < 7:
            return None
        return digits[-10:] if len(digits) > 10 else digits

    def _valid_source(raw: str) -> str:
        """Return raw source if it matches a known CandidateSource, else 'excel_import'."""
        from app.models.company.candidate import CandidateSource
        known = {s.value for s in CandidateSource}
        val = (raw or "").strip().lower()
        return val if val in known else "excel_import"

    # ── Insert rows ──────────────────────────────────────────────────────────
    inserted = 0
    skipped_duplicates = []
    failed = []
    inserted_names: list = []
    now = datetime.now(timezone.utc)
    company_id = current_user.get("company_id", "")
    partner_id = current_user["id"] if current_user.get("role") == "partner" else None

    for idx, raw_row in enumerate(rows, start=2):  # start=2 → data begins at row 2
        m = _map_import_row(raw_row)

        # Mandatory fields check
        if not m.get("email") or not m.get("mobile"):
            failed.append({"row": idx, "reason": "Missing required fields: email and mobile"})
            continue

        email = m["email"].strip().lower()
        mobile = _clean_mobile(m.get("mobile"))
        if not mobile:
            failed.append({"row": idx, "reason": "Invalid mobile number"})
            continue

        # Duplicate check (by email)
        existing = await db["candidates"].find_one({"email": email, "is_deleted": False})
        if existing:
            skipped_duplicates.append(email)
            continue

        # Build name — exactly as CandidateService.create_candidate does
        if m.get("full_name") and not m.get("first_name"):
            parts = m["full_name"].split(None, 1)
            first_name = parts[0].strip()
            last_name = parts[1].strip() if len(parts) > 1 else None
        else:
            first_name = (m.get("first_name") or "").strip() or email.split("@")[0]
            last_name = (m.get("last_name") or "").strip() or None

        full_name = f"{first_name} {last_name}".strip() if last_name else first_name

        # Skills — identical to create_candidate: skill_tags = lowercased names
        raw_skills = m.get("skill_tags", "")
        skill_tags_raw = [s.strip() for s in raw_skills.split(",") if s.strip()] if raw_skills else []
        skill_tags = [s.lower() for s in skill_tags_raw]
        skills = [{"name": s, "proficiency": None, "years": None} for s in skill_tags_raw]

        # Education
        education = []
        if m.get("edu_degree"):
            edu = {
                "degree": str(m["edu_degree"]).strip(),
                "institution": str(m.get("edu_institution") or "").strip(),
            }
            if m.get("edu_field"):
                edu["field_of_study"] = str(m["edu_field"]).strip()
            if m.get("edu_from_year"):
                try:
                    edu["from_year"] = int(float(str(m["edu_from_year"]).strip()))
                except (ValueError, TypeError):
                    pass
            if m.get("edu_to_year"):
                try:
                    yr = int(float(str(m["edu_to_year"]).strip()))
                    edu["to_year"] = yr
                    edu["year_of_passing"] = yr
                except (ValueError, TypeError):
                    pass
            if m.get("edu_percentage"):
                pct = _to_float(m["edu_percentage"])
                if pct is not None:
                    edu["percentage"] = pct
            education.append(edu)

        # Preferred locations
        raw_locs = m.get("preferred_locations", "")
        preferred_locations = [l.strip() for l in raw_locs.split(",") if l.strip()] if raw_locs else []

        # Willing to relocate
        wtr_raw = str(m.get("willing_to_relocate", "")).lower()
        willing_to_relocate = wtr_raw in ("yes", "true", "1", "y")

        # Source — default to excel_import when not specified or unknown
        source = _valid_source(m.get("source", ""))
        if partner_id:
            source = "partner"

        # Build document — identical structure to CandidateService.create_candidate
        doc = {
            "_id": str(_ObjectId()),          # Same format as manual creation
            "first_name": first_name,
            "last_name": last_name,
            "full_name": full_name,
            "email": email,
            "mobile": mobile,                 # Cleaned digits, same as create_candidate
            "alternate_mobile": _clean_mobile(m.get("alternate_mobile")),
            "date_of_birth": None,            # Not imported (requires careful date parsing)
            "gender": (m.get("gender") or "").strip().lower() or None,
            "marital_status": None,
            "nationality": "Indian",
            "current_city": m.get("current_city") or None,
            "current_state": m.get("current_state") or None,
            "current_country": m.get("current_country") or "India",
            "current_address": None,
            "permanent_address": None,
            "total_experience_years": _to_float(m.get("total_experience_years")),
            "total_experience_months": None,
            "current_company": m.get("current_company") or None,
            "current_designation": m.get("current_designation") or None,
            "current_ctc": _to_float(m.get("current_ctc")),
            "expected_ctc": _to_float(m.get("expected_ctc")),
            "ctc_currency": "INR",
            "notice_period": m.get("notice_period") or None,
            "available_from": None,
            "skills": skills,
            "skill_tags": skill_tags,
            "education": education,
            "highest_qualification": None,
            "work_experience": [],
            "certifications": [],
            "languages": [],
            "documents": [],
            "resume_url": None,
            "photo_url": None,
            "linkedin_url": m.get("linkedin_url") or None,
            "portfolio_url": None,
            "percentage": None,
            "resume_parsed": False,
            "resume_parsed_at": None,
            "parsed_data": None,
            "parse_confidence": None,
            "source": source,
            "source_details": None,
            "referred_by": None,
            "partner_id": partner_id,
            "status": "active",
            "status_changed_at": None,
            "status_changed_by": None,
            "assigned_to": None,
            "assigned_at": None,
            "current_job_id": None,
            "current_job_title": None,
            "current_stage": None,
            "total_applications": 0,
            "total_interviews": 0,
            "custom_fields": [],
            "notes": m.get("notes") or None,
            "tags": [],
            "preferred_locations": preferred_locations,
            "willing_to_relocate": willing_to_relocate,
            "preferred_job_types": [],
            "company_id": company_id,         # Required for visibility scoping
            "created_by": current_user["id"],
            "created_at": now,
            "updated_by": None,
            "updated_at": now,
            "is_deleted": False,
            "deleted_at": None,
            "deleted_by": None,
        }

        try:
            await db["candidates"].insert_one(doc)
            inserted_names.append(full_name)
            inserted += 1
        except Exception as e:
            failed.append({"row": idx, "email": email, "reason": str(e)})

    # Send one summary email for the entire bulk import
    try:
        from app.services.email_service import send_bulk_import_summary_email, _fire_email
        team_cursor = db["users"].find(
            {"role": {"$in": ["candidate_coordinator", "hr", "admin"]}, "status": "active",
             "is_deleted": False, "email": {"$exists": True, "$ne": ""}},
            {"email": 1},
        )
        team_emails = [u["email"] async for u in team_cursor if u.get("email")]
        if team_emails and inserted > 0:
            _fire_email(send_bulk_import_summary_email(
                to_emails=team_emails,
                import_type="Candidate",
                total=len(rows),
                inserted=inserted,
                failed=len(failed),
                imported_by=current_user.get("full_name", current_user.get("username", "Unknown")),
                imported_at=now.strftime("%Y-%m-%d %H:%M UTC"),
                records=inserted_names,
                company_id=company_id,
            ))
    except Exception:
        pass

    return {
        "success": True,
        "inserted": inserted,
        "skipped_duplicates": len(skipped_duplicates),
        "duplicate_emails": skipped_duplicates,
        "failed": len(failed),
        "failed_rows": failed,
        "message": f"Import complete: {inserted} inserted, {len(skipped_duplicates)} duplicates skipped, {len(failed)} failed.",
    }


class BulkDeleteRequest(BaseModel):
    candidate_ids: list[str]


@router.post("/bulk-delete")
async def bulk_delete_candidates(
    body: BulkDeleteRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:delete"]))
):
    """
    Soft-delete multiple candidates in one request.
    Skips candidates with active applications rather than failing the entire batch.
    Returns deleted_count, failed_count, and details for any failures.
    """
    from datetime import datetime, timezone

    if not body.candidate_ids:
        raise HTTPException(status_code=400, detail="candidate_ids must not be empty")
    if len(body.candidate_ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 candidates per bulk delete request")

    now = datetime.now(timezone.utc)
    deleted_by = current_user["id"]

    deleted_count = 0
    failed_ids: list[dict] = []

    for cid in body.candidate_ids:
        # Verify the candidate exists and belongs to this tenant DB
        existing = await db["candidates"].find_one({"_id": cid, "is_deleted": False})
        if not existing:
            failed_ids.append({"id": cid, "reason": "Not found or already deleted"})
            continue

        # Block deletion when active applications exist
        from app.models.company.application import ACTIVE_APPLICATION_STATUSES
        active_apps = await db["applications"].count_documents({
            "candidate_id": cid,
            "status": {"$in": ACTIVE_APPLICATION_STATUSES},
            "is_deleted": False,
        })
        if active_apps > 0:
            failed_ids.append({"id": cid, "reason": f"Has {active_apps} active application(s)"})
            continue

        await db["candidates"].update_one(
            {"_id": cid},
            {"$set": {
                "is_deleted": True,
                "deleted_at": now,
                "deleted_by": deleted_by,
            }},
        )
        deleted_count += 1

    return {
        "success": True,
        "deleted_count": deleted_count,
        "failed_count": len(failed_ids),
        "failed_ids": failed_ids,
        "message": f"Deleted {deleted_count} candidate(s)."
            + (f" {len(failed_ids)} could not be deleted." if failed_ids else ""),
    }


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
        deleted_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )

    logger.info("Notification triggered: candidate_deleted id=%s by user=%s", candidate_id, current_user["id"])
    try:
        await NotificationService(db).create_notification(
            data=NotificationCreate(
                user_id=current_user["id"],
                type=NotificationType.SYSTEM_ALERT,
                title="Candidate Deleted",
                message=f"Candidate record was moved to trash.",
                channels=[NotificationChannel.IN_APP],
            ),
            company_id=current_user.get("company_id", ""),
        )
    except Exception as _ne:
        logger.warning("Notification skipped (candidate delete): %s", _ne)

    return {"success": True, "message": "Candidate deleted successfully"}


# ── Candidate Form Link (Method 2) ────────────────────────────────────────────

class FormLinkRequest(BaseModel):
    email: Optional[str] = None  # If provided, send the link via email
    frontend_base_url: Optional[str] = None  # e.g. https://app.example.com


@router.post("/generate-form-link")
async def generate_candidate_form_link(
    background_tasks: BackgroundTasks,
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

    base = (body.frontend_base_url or "").rstrip("/")
    form_url = f"{base}/apply/{token}"

    if body.email:
        if not email_enabled:
            # EMAIL_ENABLED=False — log clearly, still return the link
            import logging as _log
            _log.getLogger(__name__).warning(
                "[CANDIDATE FORM] Email not sent (EMAIL_ENABLED=False). "
                "to=%s token=%s", body.email, token
            )
        else:
            from app.services.email_service import send_candidate_form_link_email
            background_tasks.add_task(
                send_candidate_form_link_email,
                to_email=body.email,
                form_url=form_url,
                sent_by_name=current_user.get("full_name", "The Recruitment Team"),
                company_name=current_user.get("company_name", ""),
                company_id=current_user.get("company_id", ""),
            )
            email_sent = True

    if email_sent:
        msg = "Form link sent successfully"
    elif body.email and email_enabled:
        msg = "Form link generated — email queued for delivery"
    else:
        msg = "Form link generated"

    return {
        "success": True,
        "token": token,
        "form_url": form_url,
        "email_sent": email_sent,
        "email_enabled": email_enabled,
        "message": msg,
    }


# ── Public endpoints (no auth) ────────────────────────────────────────────────

@public_router.post("/extract-resume-local")
async def public_extract_resume_local(file: UploadFile = File(...)):
    """Public fast contact extraction — no auth, no AI. Returns in <500ms."""
    import os
    ALLOWED = {".pdf", ".doc", ".docx", ".txt"}
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC, or TXT files are supported.")
    content = await file.read()
    raw_text = _extract_text_from_content(content, ext, file.filename)
    cleaned = _clean_resume_text(raw_text)
    fields = _extract_contact_fields(cleaned)
    logger.info("public_extract_resume_local filename=%s email=%r mobile=%r", file.filename, fields['email'], bool(fields['mobile']))
    return {"success": True, "data": fields}


@public_router.post("/extract-resume")
async def public_extract_resume_file(file: UploadFile = File(...)):
    """Public AI resume parsing — no auth. Returns structured candidate fields."""
    import os
    ALLOWED = {".pdf", ".doc", ".docx", ".txt"}
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOCX, DOC, or TXT files are supported.")

    content = await file.read()
    logger.info("public_extract_resume filename=%s size=%d ext=%s", file.filename, len(content), ext)

    ck = _cache_key(content)
    cached = _cache_get(ck)
    if cached:
        logger.info("public_extract_resume cache_hit filename=%s", file.filename)
        return cached

    raw_text = _extract_text_from_content(content, ext, file.filename)
    if not raw_text.strip():
        raise HTTPException(status_code=422, detail="Could not extract text from the uploaded file.")

    cleaned = _clean_resume_text(raw_text)
    logger.info("public_extract_resume filename=%s raw=%d cleaned=%d chars", file.filename, len(raw_text), len(cleaned))

    result = await _ai_parse_resume(cleaned)
    _cache_set(ck, result)
    return result


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
    await company_db.candidate_form_tokens.update_one(
        {"_id": token},
        {"$set": {"used": True, "used_at": now, "candidate_id": candidate_id}},
    )

    return {
        "success": True,
        "message": "Thank you! Your details have been submitted.",
        "candidate_id": candidate_id,
    }


@public_router.post("/candidate-form/{token}/resume")
async def public_upload_candidate_resume(token: str, candidate_id: str, file: UploadFile = File(...)):
    """
    Public endpoint — no auth.
    Upload a resume file for a candidate created via a form link.
    Validates that the token was used and the candidate_id matches.
    """
    import os

    from app.core.database import get_master_db as _master, get_company_db as _cdb

    master_db = _master()
    tenants = await master_db.tenants.find({}, {"company_id": 1}).to_list(length=500)
    company_db = None
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        cdb = _cdb(cid)
        doc = await cdb.candidate_form_tokens.find_one({"_id": token})
        if doc:
            if not doc.get("used") or doc.get("candidate_id") != candidate_id:
                raise HTTPException(status_code=403, detail="Invalid upload request.")
            company_db = cdb
            break

    if not company_db:
        raise HTTPException(status_code=404, detail="Invalid token.")

    ALLOWED = {".pdf", ".doc", ".docx"}
    MAX_SIZE = 5 * 1024 * 1024
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only PDF, DOC, DOCX files are allowed.")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5 MB.")

    try:
        from app.utils.s3 import upload_file as s3_upload
        resume_url = await s3_upload(
            content,
            file.filename or f"resume{ext}",
            folder="resumes",
            candidate_id=candidate_id,
        )
    except ValueError as ve:
        raise HTTPException(status_code=400, detail=str(ve))
    except Exception as exc:
        import logging as _log
        _log.getLogger(__name__).error("Resume upload failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail="File upload failed. Please try again.")

    await company_db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"resume_url": resume_url}},
    )

    return {"success": True, "resume_url": resume_url}


@public_router.post("/candidate-form/{token}/photo")
async def public_upload_candidate_photo(token: str, candidate_id: str, file: UploadFile = File(...)):
    """
    Public endpoint — no auth.
    Upload a profile photo for a candidate created via a form link.
    Validates that the token was used and the candidate_id matches.
    """
    import os
    from app.core.database import get_master_db as _master, get_company_db as _cdb

    master_db = _master()
    tenants = await master_db.tenants.find({}, {"company_id": 1}).to_list(length=500)
    company_db = None
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        cdb = _cdb(cid)
        doc = await cdb.candidate_form_tokens.find_one({"_id": token})
        if doc:
            if not doc.get("used") or doc.get("candidate_id") != candidate_id:
                raise HTTPException(status_code=403, detail="Invalid upload request.")
            company_db = cdb
            break

    if not company_db:
        raise HTTPException(status_code=404, detail="Invalid token.")

    ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}
    MAX_SIZE = 5 * 1024 * 1024
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, PNG, WEBP images are allowed.")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=400, detail="Profile photo must be smaller than 5 MB.")

    from app.utils.s3 import upload_file as s3_upload
    photo_url = await s3_upload(content, file.filename or f"photo{ext}", folder="profiles", candidate_id=candidate_id)

    await company_db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"photo_url": photo_url}},
    )

    return {"success": True, "photo_url": photo_url}