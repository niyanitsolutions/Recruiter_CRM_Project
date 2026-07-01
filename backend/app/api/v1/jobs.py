"""
Jobs API - Phase 3
Handles job management with eligibility criteria and candidate matching
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List
from datetime import date
from pydantic import BaseModel as _BaseModel

from app.models.company.job import (
    JobCreate, JobUpdate, JobResponse, JobListResponse,
    JobSearchParams, JobStatus, JobType, WorkMode, Priority,
    SalaryRange, ExperienceRange, EligibilityCriteria,
)
from app.services.job_service import JobService
from app.services.notification_service import NotificationService
from app.models.company.notification import NotificationCreate, NotificationType, NotificationChannel
from app.core.dependencies import get_current_user, get_company_db, require_permissions

import logging
logger = logging.getLogger(__name__)

router = APIRouter(prefix="/jobs", tags=["Jobs"])


@router.get("/")
async def list_jobs(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    keyword: Optional[str] = None,
    client_id: Optional[str] = None,
    status: Optional[str] = None,  # Comma-separated
    job_type: Optional[str] = None,  # Comma-separated
    work_mode: Optional[str] = None,  # Comma-separated
    city: Optional[str] = None,  # Comma-separated
    priority: Optional[str] = None,  # Comma-separated
    assigned_to: Optional[str] = None,
    min_salary: Optional[float] = None,
    max_salary: Optional[float] = None,
    skills: Optional[str] = None,  # Comma-separated
    tags: Optional[str] = None,  # Comma-separated
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view"]))
):
    """List jobs with filters"""
    search_params = JobSearchParams(
        keyword=keyword,
        client_id=client_id,
        status=status.split(",") if status else None,
        job_type=job_type.split(",") if job_type else None,
        work_mode=work_mode.split(",") if work_mode else None,
        city=city.split(",") if city else None,
        priority=priority.split(",") if priority else None,
        assigned_to=assigned_to,
        min_salary=min_salary,
        max_salary=max_salary,
        skills=skills.split(",") if skills else None,
        tags=tags.split(",") if tags else None
    )
    
    # Partners only see jobs visible to them
    visible_to_partner = current_user.get("role") == "partner"
    
    result = await JobService.list_jobs(
        db=db,
        page=page,
        page_size=page_size,
        search_params=search_params,
        visible_to_partner=visible_to_partner,
        current_user=current_user
    )
    
    return {"success": True, **result}


@router.get("/dropdown")
async def get_jobs_dropdown(
    status: Optional[str] = Query(None, description="Comma-separated statuses (default: open)"),
    client_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view"]))
):
    """Get jobs for dropdown"""
    status_list = status.split(",") if status else None
    jobs = await JobService.get_jobs_dropdown(db, status_list, client_id)
    return {"success": True, "data": jobs}


@router.get("/dashboard-stats")
async def get_job_stats(
    days: Optional[int] = Query(None, ge=0, description="Filter to last N days; 0 or omit = all time"),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view"]))
):
    """Get job statistics for dashboard"""
    from datetime import datetime, timedelta, timezone as _tz
    start_date = None
    if days and days > 0:
        start_date = datetime.now(_tz.utc) - timedelta(days=days)
    stats = await JobService.get_dashboard_stats(db, current_user, start_date=start_date)
    return {"success": True, "data": stats}


@router.get("/statuses")
async def get_job_statuses(current_user: dict = Depends(get_current_user)):
    """Get available job statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in JobStatus]
    return {"success": True, "data": statuses}


@router.get("/types")
async def get_job_types(current_user: dict = Depends(get_current_user)):
    """Get available job types"""
    types = [{"value": t.value, "label": t.value.replace("_", " ").title()} for t in JobType]
    return {"success": True, "data": types}


@router.get("/work-modes")
async def get_work_modes(current_user: dict = Depends(get_current_user)):
    """Get available work modes"""
    modes = [{"value": m.value, "label": m.value.replace("_", " ").title()} for m in WorkMode]
    return {"success": True, "data": modes}


@router.get("/priorities")
async def get_priorities(current_user: dict = Depends(get_current_user)):
    """Get available priorities"""
    priorities = [{"value": p.value, "label": p.value.title()} for p in Priority]
    return {"success": True, "data": priorities}


@router.get("/branches")
async def get_branches(current_user: dict = Depends(get_current_user)):
    """Return the list of supported branch / specialization options."""
    from app.core.branch_utils import BRANCH_OPTIONS
    return {"success": True, "data": BRANCH_OPTIONS}


@router.post("/", status_code=201)
async def create_job(
    job_data: JobCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:create"]))
):
    """Create a new job"""
    try:
        job = await JobService.create_job(
            db=db,
            job_data=job_data,
            created_by=current_user["id"],
            company_id=current_user.get("company_id", ""),
            company_name=current_user.get("company_name", ""),
            created_by_name=current_user.get("full_name", ""),
            user_name=current_user.get("full_name", ""),
        )
        logger.info("Notification triggered: job_created id=%s by user=%s", job.id, current_user["id"])
        try:
            await NotificationService(db).create_notification(
                data=NotificationCreate(
                    user_id=current_user["id"],
                    type=NotificationType.SYSTEM_ALERT,
                    title="Job Posted",
                    message=f"New job '{job_data.title}' was posted successfully.",
                    channels=[NotificationChannel.IN_APP],
                ),
                company_id=current_user.get("company_id", ""),
            )
        except Exception as _ne:
            logger.warning("Notification skipped (job create): %s", _ne)

        return {"success": True, "message": "Job created successfully", "data": job}
    except HTTPException:
        raise
    except Exception:
        logger.exception(
            "Unexpected error during job creation | company_id=%s user_id=%s title=%r",
            current_user.get("company_id", ""),
            current_user.get("id", ""),
            job_data.title,
        )
        raise HTTPException(
            status_code=500,
            detail="An unexpected error occurred while creating the job. Please try again or contact support."
        )



# ── Jobs bulk import helpers ─────────────────────────────────────────────────

_JOBS_FIELD_MAP = {
    # title
    "title": "title", "job title": "title", "position": "title", "role": "title",
    "job_title": "title", "designation": "title",
    # client
    "client": "client_name", "client_name": "client_name", "client name": "client_name",
    "company": "client_name", "hiring company": "client_name",
    # description / requirements
    "description": "description", "job description": "description", "jd": "description",
    "requirements": "requirements", "requirement": "requirements",
    "responsibilities": "responsibilities", "responsibility": "responsibilities",
    # type / mode
    "job_type": "job_type", "job type": "job_type", "employment type": "job_type",
    "work_mode": "work_mode", "work mode": "work_mode", "remote": "work_mode",
    "location type": "work_mode",
    # location
    "city": "city", "location": "city", "work location": "city",
    "state": "state", "country": "country",
    # compensation — offered salary range (LPA variants are common in Indian HR templates)
    "salary_min": "salary_min", "min salary": "salary_min", "minimum salary": "salary_min",
    "min salary (lpa)": "salary_min", "minimum salary (lpa)": "salary_min",
    "salary min (lpa)": "salary_min", "salary_min (lpa)": "salary_min",
    "offered salary min": "salary_min", "offered salary min (lpa)": "salary_min",
    "salary range min": "salary_min", "salary range min (lpa)": "salary_min",
    "salary_max": "salary_max", "max salary": "salary_max", "maximum salary": "salary_max",
    "max salary (lpa)": "salary_max", "maximum salary (lpa)": "salary_max",
    "salary max (lpa)": "salary_max", "salary_max (lpa)": "salary_max",
    "offered salary max": "salary_max", "offered salary max (lpa)": "salary_max",
    "salary range max": "salary_max", "salary range max (lpa)": "salary_max",
    "salary": "salary_max",
    "currency": "currency", "salary currency": "currency", "salary_currency": "currency",
    # experience
    "experience_min": "experience_min", "min experience": "experience_min",
    "min exp": "experience_min", "minimum experience": "experience_min",
    "experience_max": "experience_max", "max experience": "experience_max",
    "max exp": "experience_max", "experience": "experience_max",
    # skills
    "skills": "skills", "required skills": "skills", "skill_tags": "skills",
    "mandatory skills": "mandatory_skills",
    # positions / priority / status
    "positions": "total_positions", "openings": "total_positions",
    "total positions": "total_positions", "headcount": "total_positions",
    "priority": "priority",
    "status": "status",
    # dates
    "posted_date": "posted_date", "posted date": "posted_date",
    "target_date": "target_date", "target date": "target_date",
    "deadline": "target_date", "closing date": "target_date",
    # gender
    "gender": "gender_eligibility", "gender eligibility": "gender_eligibility",
    # notes / tags
    "notes": "internal_notes", "internal notes": "internal_notes",
    "tags": "tags",
    # good to have / optional skills
    "good to have skills": "optional_skills", "good_to_have_skills": "optional_skills",
    "optional skills": "optional_skills", "optional_skills": "optional_skills",
    "good to have": "optional_skills",
    # max current CTC (separate from salary range)
    "max current ctc": "max_current_ctc", "max_current_ctc": "max_current_ctc",
    "maximum current ctc": "max_current_ctc", "max ctc": "max_current_ctc",
    "current ctc max": "max_current_ctc",
    # notice period → max_notice_period (stored as integer days)
    "notice period": "max_notice_period", "max notice period": "max_notice_period",
    "max_notice_period": "max_notice_period", "notice_period": "max_notice_period",
    "maximum notice period": "max_notice_period",
    # minimum match score
    "minimum match score": "minimum_match_score", "min match score": "minimum_match_score",
    "min_match_score": "minimum_match_score", "minimum_match_score": "minimum_match_score",
    "match score": "minimum_match_score",
    # branch / specialization
    "branch": "required_branches", "branches": "required_branches",
    "specialization": "required_branches", "specializations": "required_branches",
    "required branches": "required_branches", "branch specialization": "required_branches",
    "eligible branches": "required_branches",
}


def _parse_jobs_file(content: bytes, ext: str) -> list:
    import io, csv
    rows = []
    if ext == ".csv":
        text = content.decode("utf-8-sig", errors="ignore")
        reader = csv.DictReader(io.StringIO(text))
        rows = [dict(r) for r in reader]
    elif ext in (".xlsx", ".xls"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True, data_only=True)
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
            from pypdf import PdfReader  # type: ignore[import-untyped]
            reader = PdfReader(io.BytesIO(content))
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


def _map_jobs_row(raw: dict) -> dict:
    mapped = {}
    for k, v in raw.items():
        key = _JOBS_FIELD_MAP.get(k.lower().strip())
        if key:
            mapped[key] = v
    return mapped


@router.post("/bulk-import/preview")
async def preview_bulk_import_jobs(
    file: UploadFile = File(...),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:create"]))
):
    """Parse file and return preview rows with validation. Does NOT insert."""
    import os
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    raw_rows = _parse_jobs_file(content, ext)
    mapped_rows = [_map_jobs_row(r) for r in raw_rows]

    # Bulk client name lookup
    client_names = list({m["client_name"].strip().lower() for m in mapped_rows if m.get("client_name")})
    client_map: dict = {}  # lower_name -> client_id
    if client_names:
        cursor = db["clients"].find(
            {"is_deleted": {"$ne": True}},
            {"_id": 1, "name": 1}
        )
        async for doc in cursor:
            if doc.get("name"):
                client_map[doc["name"].strip().lower()] = str(doc["_id"])

    preview_rows = []
    for idx, m in enumerate(mapped_rows, start=2):
        errors = []
        if not m.get("title"):
            errors.append("Missing job title")
        client_name = m.get("client_name", "").strip()
        client_id = client_map.get(client_name.lower()) if client_name else None
        if not client_name:
            errors.append("Missing client name")
        elif not client_id:
            errors.append(f"Client '{client_name}' not found")

        preview_rows.append({
            "row": idx,
            "fields": {
                "title": m.get("title", ""),
                "client_name": client_name,
                "client_found": bool(client_id),
                "job_type": m.get("job_type", ""),
                "work_mode": m.get("work_mode", ""),
                "city": m.get("city", ""),
                "experience_min": m.get("experience_min", ""),
                "experience_max": m.get("experience_max", ""),
                "salary_min": m.get("salary_min", ""),
                "salary_max": m.get("salary_max", ""),
                "total_positions": m.get("total_positions", ""),
                "priority": m.get("priority", ""),
                "status": m.get("status", ""),
            },
            "errors": errors,
            "valid": len(errors) == 0,
        })

    valid_count = sum(1 for r in preview_rows if r["valid"])
    return {"success": True, "total": len(preview_rows), "valid": valid_count, "rows": preview_rows}


@router.post("/bulk-import")
async def bulk_import_jobs(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:create"]))
):
    """Bulk import jobs from Excel / CSV / PDF.
    Delegates to JobService.create_job so imported records are structurally
    identical to manually created jobs (same _id format, job_code, company_id,
    audit trail, etc.).
    """
    import os, re as _re

    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    rows = _parse_jobs_file(content, ext)

    # Build client lookup: normalised name → _id
    client_map: dict = {}
    cursor = db["clients"].find({"is_deleted": {"$ne": True}}, {"_id": 1, "name": 1})
    async for doc in cursor:
        if doc.get("name"):
            client_map[doc["name"].strip().lower()] = str(doc["_id"])

    # ── per-row helpers ──────────────────────────────────────────────────────
    def _to_float(v):
        """Float conversion with regex fallback for values like '8 LPA'."""
        if v is None: return None
        s = str(v).strip()
        if not s: return None
        try: return float(s)
        except (ValueError, TypeError):
            m = _re.search(r'\d+(?:\.\d+)?', s)
            return float(m.group()) if m else None

    def _to_int(v):
        if v is None: return None
        s = str(v).strip()
        if not s: return None
        try: return int(float(s))
        except (ValueError, TypeError):
            m = _re.search(r'\d+', s)
            return int(m.group()) if m else None

    _NOTICE_MAP = {"immediate": 0, "15_days": 15, "30_days": 30, "60_days": 60, "90_days": 90}

    def _parse_notice_period(v):
        """Convert notice-period string to integer days (0, 15, 30, 60, 90 …)."""
        if not v: return None
        s = str(v).strip().lower().replace(" ", "_")
        if s in _NOTICE_MAP: return _NOTICE_MAP[s]
        m = _re.search(r'(\d+)', s)
        return int(m.group(1)) if m else None

    def _split_skills(raw):
        return [s.strip().lower() for s in (raw or "").split(",") if s.strip()]

    # ── row loop ─────────────────────────────────────────────────────────────
    inserted = 0
    duplicates: list = []
    failed = []
    total_rows = len(rows)
    inserted_titles: list = []

    for idx, raw_row in enumerate(rows, start=2):
        m = _map_jobs_row(raw_row)

        title = m.get("title", "").strip()
        if not title:
            failed.append({"row": idx, "reason": "Missing job title"})
            continue

        client_name = m.get("client_name", "").strip()
        client_id = client_map.get(client_name.lower()) if client_name else None
        if not client_id:
            failed.append({
                "row": idx, "title": title,
                "reason": f"Client '{client_name}' not found" if client_name else "Missing client name",
            })
            continue

        # ── duplicate check (title + client, case-insensitive, tenant-scoped) ──
        existing = await db["jobs"].find_one(
            {
                "title": {"$regex": f"^{_re.escape(title)}$", "$options": "i"},
                "client_id": client_id,
                "is_deleted": False,
            },
            {"_id": 1},
        )
        if existing:
            duplicates.append({"row": idx, "title": title, "reason": "Duplicate job (same title and client already exists)"})
            continue

        # ── numeric conversions ──────────────────────────────────────────────
        salary_min          = _to_float(m.get("salary_min"))
        salary_max          = _to_float(m.get("salary_max"))
        exp_min             = _to_float(m.get("experience_min")) or 0.0
        exp_max             = _to_float(m.get("experience_max"))
        max_current_ctc     = _to_float(m.get("max_current_ctc"))
        max_notice_days     = _parse_notice_period(m.get("max_notice_period"))
        total_positions     = _to_int(m.get("total_positions")) or 1
        min_match_score     = _to_int(m.get("minimum_match_score")) or 70

        # ── skills ───────────────────────────────────────────────────────────
        mandatory_skills = _split_skills(m.get("mandatory_skills"))
        optional_skills  = _split_skills(m.get("optional_skills"))
        # "skills" column is a fallback source for mandatory skills
        if not mandatory_skills:
            mandatory_skills = _split_skills(m.get("skills"))

        tags = _split_skills(m.get("tags"))

        # Branch / Specialization — comma-separated slugs or display names
        # find_canonical() resolves abbreviations / full names to canonical slugs
        required_branches_raw = _split_skills(m.get("required_branches"))
        if required_branches_raw:
            from app.core.branch_utils import find_canonical as _fc
            required_branches_val = [c for b in required_branches_raw if (c := _fc(b))]
        else:
            required_branches_val = []

        # ── enum-like string normalisation ───────────────────────────────────
        job_type_val  = (m.get("job_type")         or "full_time").lower().replace(" ", "_")
        work_mode_val = (m.get("work_mode")         or "onsite").lower().replace(" ", "_")
        priority_val  = (m.get("priority")          or "medium").lower()
        status_val    = (m.get("status")            or "open").lower().replace(" ", "_")
        gender_val    = (m.get("gender_eligibility") or "all").lower()

        # ── build JobCreate — identical schema used by manual creation ───────
        try:
            job_data = JobCreate(
                title=title,
                client_id=client_id,
                description=m.get("description") or None,
                requirements=m.get("requirements") or None,
                responsibilities=m.get("responsibilities") or None,
                job_type=job_type_val,
                work_mode=work_mode_val,
                city=m.get("city") or None,
                state=m.get("state") or None,
                country=m.get("country") or "India",
                total_positions=total_positions,
                priority=priority_val,
                status=status_val,
                gender_eligibility=gender_val,
                internal_notes=m.get("internal_notes") or None,
                tags=tags,
                visible_to_partners=True,
                minimum_match_score=min_match_score,
                salary=SalaryRange(
                    min_salary=salary_min,
                    max_salary=salary_max,
                    currency=m.get("currency") or "INR",
                ) if (salary_min is not None or salary_max is not None) else None,
                experience=ExperienceRange(
                    min_years=exp_min,
                    max_years=exp_max,
                ),
                skills_required=[
                    *[{"skill_name": s, "is_mandatory": True}  for s in mandatory_skills],
                    *[{"skill_name": s, "is_mandatory": False} for s in optional_skills],
                ],
                eligibility=EligibilityCriteria(
                    min_experience_years=exp_min,
                    max_experience_years=exp_max,
                    mandatory_skills=mandatory_skills,
                    required_skills=optional_skills,
                    max_ctc=max_current_ctc,
                    max_notice_period_days=max_notice_days,
                    preferred_locations=[m["city"]] if m.get("city") else [],
                    required_branches=required_branches_val,
                ),
            )
            await JobService.create_job(
                db=db,
                job_data=job_data,
                created_by=current_user["id"],
                company_id=current_user.get("company_id", ""),
                user_name=current_user.get("full_name", ""),
                skip_email=True,
            )
            inserted_titles.append(title)
            inserted += 1
        except Exception as e:
            failed.append({"row": idx, "title": title, "reason": str(e)})

    # Send one summary email for the entire bulk import
    try:
        from datetime import datetime, timezone
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
                import_type="Job",
                total=total_rows,
                inserted=inserted,
                failed=len(failed),
                imported_by=current_user.get("full_name", current_user.get("username", "Unknown")),
                imported_at=datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
                records=inserted_titles,
                company_id=current_user.get("company_id", ""),
            ))
    except Exception:
        pass

    return {
        "success": True,
        "inserted": inserted,
        "duplicates": len(duplicates),
        "failed": len(failed),
        "total_rows": total_rows,
        "failed_rows": failed,
        "duplicate_rows": duplicates,
        "message": (
            f"Import complete: {inserted} inserted"
            + (f", {len(duplicates)} duplicate{'s' if len(duplicates) != 1 else ''} skipped" if duplicates else "")
            + (f", {len(failed)} failed" if failed else "")
            + "."
        ),
    }


@router.get("/{job_id}")
async def get_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view"]))
):
    """Get job by ID"""
    job = await JobService.get_job(db, job_id)
    return {"success": True, "data": job}


@router.put("/{job_id}")
async def update_job(
    job_id: str,
    update_data: JobUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:edit"]))
):
    """Update a job"""
    job = await JobService.update_job(
        db=db,
        job_id=job_id,
        update_data=update_data,
        updated_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )
    
    return {"success": True, "message": "Job updated successfully", "data": job}


@router.put("/{job_id}/status")
async def update_job_status(
    job_id: str,
    status: str = Query(...),
    closure_reason: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:edit"]))
):
    """Update job status"""
    job = await JobService.update_job_status(
        db=db,
        job_id=job_id,
        new_status=status,
        updated_by=current_user["id"],
        closure_reason=closure_reason
    )
    
    return {"success": True, "message": f"Job status updated to {status}", "data": job}


@router.delete("/{job_id}")
async def delete_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:delete"]))
):
    """Soft delete a job"""
    await JobService.delete_job(
        db=db,
        job_id=job_id,
        deleted_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )

    logger.info("Notification triggered: job_deleted id=%s by user=%s", job_id, current_user["id"])
    try:
        await NotificationService(db).create_notification(
            data=NotificationCreate(
                user_id=current_user["id"],
                type=NotificationType.SYSTEM_ALERT,
                title="Job Deleted",
                message=f"Job record was moved to trash.",
                channels=[NotificationChannel.IN_APP],
            ),
            company_id=current_user.get("company_id", ""),
        )
    except Exception as _ne:
        logger.warning("Notification skipped (job delete): %s", _ne)

    return {"success": True, "message": "Job deleted successfully"}


class _BulkDeleteRequest(_BaseModel):
    job_ids: List[str]


@router.post("/bulk-delete")
async def bulk_delete_jobs(
    body: _BulkDeleteRequest,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:delete"]))
):
    """
    Soft-delete multiple jobs in one request.
    Returns deleted_count, failed_count, and details for any failures.
    Maximum 500 jobs per request.
    """
    from datetime import datetime, timezone

    if not body.job_ids:
        raise HTTPException(status_code=400, detail="job_ids must not be empty")
    if len(body.job_ids) > 500:
        raise HTTPException(status_code=400, detail="Maximum 500 jobs per bulk delete request")

    now = datetime.now(timezone.utc)
    deleted_by = current_user["id"]
    deleted_count = 0
    failed_ids: list = []

    for jid in body.job_ids:
        job = await db["jobs"].find_one({"_id": jid, "is_deleted": False})
        if not job:
            failed_ids.append({"id": jid, "reason": "Not found or already deleted"})
            continue
        try:
            await db["jobs"].update_one(
                {"_id": jid},
                {"$set": {"is_deleted": True, "deleted_at": now, "deleted_by": deleted_by}},
            )
            deleted_count += 1
        except Exception as exc:
            failed_ids.append({"id": jid, "reason": str(exc)})

    noun = "job" if deleted_count == 1 else "jobs"
    return {
        "success": True,
        "deleted_count": deleted_count,
        "failed_count": len(failed_ids),
        "failed_ids": failed_ids,
        "message": f"Successfully deleted {deleted_count} {noun}.",
    }


# ============== Eligibility & Matching ==============

@router.get("/{job_id}/check-eligibility/{candidate_id}")
async def check_candidate_eligibility(
    job_id: str,
    candidate_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view", "candidates:view"]))
):
    """Check if a candidate meets job eligibility criteria"""
    result = await JobService.check_candidate_eligibility(db, job_id, candidate_id)
    return {"success": True, "data": result}


@router.get("/{job_id}/matching-candidates")
async def find_matching_candidates(
    job_id: str,
    limit: int = Query(20, ge=1, le=50),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view", "candidates:view"]))
):
    """Find candidates matching job eligibility criteria (legacy)"""
    candidates = await JobService.find_matching_candidates(db, job_id, limit)
    return {"success": True, "data": candidates, "count": len(candidates)}


# ============== New Naukri-style Matching Engine ==============

@router.post("/{job_id}/run-matching")
async def run_matching(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view", "candidates:view"]))
):
    """
    Compute (or refresh) match scores for ALL active candidates vs this job.
    Results are stored in matching_results collection and returned sorted by score.
    """
    from app.services.matching_service import MatchingService
    tenant_id = current_user.get("tenant_id")
    results = await MatchingService.run_matching(db, job_id, tenant_id=tenant_id)
    return {"success": True, "data": results, "count": len(results)}


@router.get("/{job_id}/matching-results")
async def get_matching_results(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view", "candidates:view"]))
):
    """Return stored matching results for a job (sorted by final_score desc)."""
    from app.services.matching_service import MatchingService
    results = await MatchingService.get_matching_results(db, job_id)
    return {"success": True, "data": results, "count": len(results)}


@router.post("/admin/migrate-minimum-match-score")
async def migrate_minimum_match_score(
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:edit"]))
):
    """
    One-time migration: set minimum_match_score = 70 on all jobs that don't have it yet.
    Safe to run multiple times (only updates documents where the field is absent).
    """
    result = await db.jobs.update_many(
        {"minimum_match_score": {"$exists": False}, "is_deleted": False},
        {"$set": {"minimum_match_score": 70}}
    )
    return {
        "success": True,
        "updated": result.modified_count,
        "message": f"Set minimum_match_score=70 on {result.modified_count} jobs"
    }


@router.get("/{job_id}/eligible-for-interview")
async def get_eligible_for_interview(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view", "interviews:view"]))
):
    """
    Return eligible candidates (from matching_results) who also have an application.
    Used to populate the candidate dropdown in the Interview scheduling form.
    """
    from app.services.matching_service import MatchingService
    results = await MatchingService.get_eligible_for_interview(db, job_id)
    return {"success": True, "data": results}