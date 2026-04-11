"""
Candidates API - Phase 3
Handles candidate management with AI resume parsing and keyword search
"""
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query, UploadFile, File, Form
from pydantic import BaseModel
from typing import Optional, List
from datetime import date, datetime, timezone, timedelta
import uuid

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
    return _parse_resume_text(text)


def _parse_resume_text(text: str) -> dict:
    """Shared resume text parser used by both auth and public extract endpoints."""
    import re

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

    # Education degree
    EDU_MAP = [
        ("ph.d", "phd"), ("phd", "phd"), ("doctorate", "phd"),
        ("m.tech", "masters"), ("m.e.", "masters"), ("mba", "masters"),
        ("m.sc", "masters"), ("m.s.", "masters"), ("master", "masters"),
        ("b.tech", "bachelors"), ("b.e.", "bachelors"), ("b.sc", "bachelors"),
        ("b.com", "bachelors"), ("b.a.", "bachelors"), ("btech", "bachelors"),
        ("bachelor", "bachelors"), ("be ", "bachelors"), ("b.e ", "bachelors"),
        ("diploma", "diploma"),
        ("12th", "high_school"), ("hsc", "high_school"), ("ssc", "high_school"),
        ("high school", "high_school"),
    ]
    education_degree = None
    for kw, val in EDU_MAP:
        if kw in text_lower:
            education_degree = val
            break

    # Institution name
    inst_m = re.search(
        r"([A-Z][A-Za-z ]{3,50}(?:University|College|Institute|School|IIT|NIT|BITS|VIT)(?:[A-Za-z ,]+)?)",
        text,
    )
    institution = inst_m.group(1).strip() if inst_m else None

    # Graduation year — take the most recent plausible year
    year_matches = re.findall(r"\b(19[7-9]\d|20[0-2]\d)\b", text)
    graduation_year = int(year_matches[-1]) if year_matches else None

    # Experience years
    exp_m = re.search(
        r"(\d+(?:\.\d+)?)\s*\+?\s*years?\s*(?:of\s*)?(?:experience|exp\.?)",
        text_lower,
    )
    experience_years = float(exp_m.group(1)) if exp_m else None

    # Current company — look for common patterns
    company_m = re.search(
        r"(?:currently\s+(?:working\s+at|employed\s+at)|working\s+at|employer)[:\s]+([A-Z][A-Za-z0-9 &.,]+)",
        text,
        re.IGNORECASE,
    )
    current_company = company_m.group(1).strip() if company_m else None

    # Current designation
    desig_m = re.search(
        r"(?:designation|position|role|title)[:\s]+([A-Z][A-Za-z0-9 ]+)",
        text,
        re.IGNORECASE,
    )
    current_designation = desig_m.group(1).strip() if desig_m else None

    # Current city — look for "Location:" or "City:" patterns
    city_m = re.search(
        r"(?:location|city|residing in|based in|address)[:\s]+([A-Z][a-zA-Z ]{2,30})",
        text,
        re.IGNORECASE,
    )
    current_city = city_m.group(1).strip() if city_m else None

    return {
        "success": True,
        "data": {
            "first_name": first_name,
            "last_name": last_name,
            "email": email,
            "mobile": re.sub(r"\D", "", mobile)[-10:] if mobile else None,
            "skills": found_skills,
            "education_degree": education_degree,
            "institution": institution,
            "graduation_year": graduation_year,
            "experience_years": experience_years,
            "current_company": current_company,
            "current_designation": current_designation,
            "current_city": current_city,
            "raw_text": text[:3000],
        },
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
    # name variations
    "first_name": "first_name", "first name": "first_name", "firstname": "first_name",
    "last_name": "last_name", "last name": "last_name", "lastname": "last_name",
    "full_name": "full_name", "full name": "full_name", "name": "full_name",
    # contact
    "email": "email", "email address": "email",
    "mobile": "mobile", "phone": "mobile", "contact": "mobile", "mobile number": "mobile",
    "alternate_mobile": "alternate_mobile", "alternate mobile": "alternate_mobile",
    # personal
    "date_of_birth": "date_of_birth", "dob": "date_of_birth", "date of birth": "date_of_birth",
    "gender": "gender",
    # location
    "current_city": "current_city", "city": "current_city", "current city": "current_city",
    "current_state": "current_state", "state": "current_state", "current state": "current_state",
    "current_country": "current_country", "country": "current_country",
    # professional
    "total_experience_years": "total_experience_years", "experience": "total_experience_years",
    "total experience": "total_experience_years", "experience years": "total_experience_years",
    "current_company": "current_company", "company": "current_company", "current company": "current_company",
    "current_designation": "current_designation", "designation": "current_designation",
    "current designation": "current_designation", "job title": "current_designation",
    "current_ctc": "current_ctc", "ctc": "current_ctc", "current ctc": "current_ctc",
    "expected_ctc": "expected_ctc", "expected ctc": "expected_ctc",
    "notice_period": "notice_period", "notice period": "notice_period",
    # skills
    "skills": "skill_tags", "skill_tags": "skill_tags", "skill tags": "skill_tags",
    # education (flat)
    "degree": "edu_degree", "education": "edu_degree", "qualification": "edu_degree",
    "field_of_study": "edu_field", "field of study": "edu_field", "specialization": "edu_field",
    "institution": "edu_institution", "university": "edu_institution", "college": "edu_institution",
    "from_year": "edu_from_year", "from year": "edu_from_year", "graduation from": "edu_from_year",
    "to_year": "edu_to_year", "to year": "edu_to_year", "graduation year": "edu_to_year",
    "year_of_passing": "edu_to_year", "passing year": "edu_to_year",
    "percentage": "edu_percentage", "academic percentage": "edu_percentage",
    # preferences
    "willing_to_relocate": "willing_to_relocate", "willing to relocate": "willing_to_relocate",
    "preferred_locations": "preferred_locations", "preferred locations": "preferred_locations",
    # source
    "source": "source",
    # misc
    "linkedin_url": "linkedin_url", "linkedin": "linkedin_url",
    "summary": "notes", "notes": "notes",
}


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
    mapped = {}
    for k, v in raw.items():
        key = _IMPORT_FIELD_MAP.get(k.lower().strip())
        if key:
            mapped[key] = v
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
    Returns inserted count, skipped duplicates, and failed rows with reasons.
    """
    import os
    from datetime import datetime, timezone

    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    rows = _parse_import_file(content, ext)

    # ── Insert rows ──────────────────────────────────────────────────────────
    inserted = 0
    skipped_duplicates = []
    failed = []
    now = datetime.now(timezone.utc)
    partner_id = current_user["id"] if current_user.get("role") == "partner" else None

    for idx, raw_row in enumerate(rows, start=2):  # start=2 → data begins at row 2
        m = _map_import_row(raw_row)

        # Mandatory fields check
        if not m.get("email") or not m.get("mobile"):
            failed.append({"row": idx, "reason": "Missing required fields: email and mobile"})
            continue

        email = m["email"].strip().lower()

        # Duplicate check
        existing = await db["candidates"].find_one({"email": email, "is_deleted": False})
        if existing:
            skipped_duplicates.append(email)
            continue

        # Build name
        if m.get("full_name") and not m.get("first_name"):
            parts = m["full_name"].split(None, 1)
            first_name = parts[0]
            last_name = parts[1] if len(parts) > 1 else None
        else:
            first_name = m.get("first_name", "").strip() or email.split("@")[0]
            last_name = m.get("last_name") or None

        # Skills
        raw_skills = m.get("skill_tags", "")
        skill_tags = [s.strip() for s in raw_skills.split(",") if s.strip()] if raw_skills else []

        # Education
        education = []
        if m.get("edu_degree"):
            edu = {"degree": m["edu_degree"], "institution": m.get("edu_institution", "")}
            if m.get("edu_field"): edu["field_of_study"] = m["edu_field"]
            if m.get("edu_from_year"):
                try: edu["from_year"] = int(m["edu_from_year"])
                except ValueError: pass
            if m.get("edu_to_year"):
                try: edu["to_year"] = int(m["edu_to_year"]); edu["year_of_passing"] = edu["to_year"]
                except ValueError: pass
            if m.get("edu_percentage"):
                try: edu["percentage"] = float(m["edu_percentage"])
                except ValueError: pass
            education.append(edu)

        # Numeric coercions
        def _float(v):
            try: return float(v) if v else None
            except (ValueError, TypeError): return None

        # Preferred locations
        raw_locs = m.get("preferred_locations", "")
        preferred_locations = [l.strip() for l in raw_locs.split(",") if l.strip()] if raw_locs else []

        # Willing to relocate
        wtr_raw = str(m.get("willing_to_relocate", "")).lower()
        willing_to_relocate = wtr_raw in ("yes", "true", "1", "y")

        import uuid as _uuid
        doc = {
            "_id": str(_uuid.uuid4()),
            "first_name": first_name,
            "last_name": last_name,
            "full_name": f"{first_name} {last_name}".strip() if last_name else first_name,
            "email": email,
            "mobile": m.get("mobile", "").strip(),
            "alternate_mobile": m.get("alternate_mobile") or None,
            "date_of_birth": m.get("date_of_birth") or None,
            "gender": m.get("gender") or None,
            "current_city": m.get("current_city") or None,
            "current_state": m.get("current_state") or None,
            "current_country": m.get("current_country") or "India",
            "total_experience_years": _float(m.get("total_experience_years")),
            "current_company": m.get("current_company") or None,
            "current_designation": m.get("current_designation") or None,
            "current_ctc": _float(m.get("current_ctc")),
            "expected_ctc": _float(m.get("expected_ctc")),
            "notice_period": m.get("notice_period") or None,
            "skill_tags": skill_tags,
            "skills": [{"name": s} for s in skill_tags],
            "education": education,
            "work_experience": [],
            "source": m.get("source") or "direct",
            "linkedin_url": m.get("linkedin_url") or None,
            "notes": m.get("notes") or None,
            "preferred_locations": preferred_locations,
            "willing_to_relocate": willing_to_relocate,
            "status": "active",
            "partner_id": partner_id,
            "created_by": current_user["id"],
            "created_at": now,
            "is_deleted": False,
            "total_applications": 0,
            "total_interviews": 0,
        }

        try:
            await db["candidates"].insert_one(doc)
            inserted += 1
        except Exception as e:
            failed.append({"row": idx, "email": email, "reason": str(e)})

    return {
        "success": True,
        "inserted": inserted,
        "skipped_duplicates": len(skipped_duplicates),
        "duplicate_emails": skipped_duplicates,
        "failed": len(failed),
        "failed_rows": failed,
        "message": f"Import complete: {inserted} inserted, {len(skipped_duplicates)} duplicates skipped, {len(failed)} failed.",
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

@public_router.post("/extract-resume")
async def public_extract_resume_file(file: UploadFile = File(...)):
    """
    Public endpoint — no auth.
    Upload a resume file, extract text, and return parsed candidate fields for form auto-fill.
    """
    import io, os

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

    return _parse_resume_text(text)


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

    upload_dir = "uploads/resumes"
    os.makedirs(upload_dir, exist_ok=True)
    unique_name = f"{candidate_id}_{uuid.uuid4().hex}{ext}"
    file_path = os.path.join(upload_dir, unique_name)
    with open(file_path, "wb") as f:
        f.write(content)

    resume_url = f"/uploads/resumes/{unique_name}"
    await company_db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"resume_url": resume_url}},
    )

    return {"success": True, "resume_url": resume_url}