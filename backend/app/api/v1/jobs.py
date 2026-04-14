"""
Jobs API - Phase 3
Handles job management with eligibility criteria and candidate matching
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List
from datetime import date

from app.models.company.job import (
    JobCreate, JobUpdate, JobResponse, JobListResponse,
    JobSearchParams, JobStatus, JobType, WorkMode, Priority
)
from app.services.job_service import JobService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

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
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["jobs:view"]))
):
    """Get job statistics for dashboard"""
    user_id = None
    if current_user.get("role") in ["candidate_coordinator", "client_coordinator"]:
        user_id = current_user["id"]
    
    stats = await JobService.get_dashboard_stats(db, user_id)
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
        return {"success": True, "message": "Job created successfully", "data": job}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))



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
    # compensation
    "salary_min": "salary_min", "min salary": "salary_min", "minimum salary": "salary_min",
    "salary_max": "salary_max", "max salary": "salary_max", "maximum salary": "salary_max",
    "salary": "salary_max",
    "currency": "currency", "salary currency": "currency",
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
    """Bulk import jobs from Excel / CSV / PDF."""
    import os, uuid as _uuid
    from datetime import datetime, timezone

    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(status_code=400, detail="Only .xlsx, .xls, .csv, or .pdf files are supported.")

    content = await file.read()
    rows = _parse_jobs_file(content, ext)

    # Build client lookup
    client_map: dict = {}
    cursor = db["clients"].find({"is_deleted": {"$ne": True}}, {"_id": 1, "name": 1})
    async for doc in cursor:
        if doc.get("name"):
            client_map[doc["name"].strip().lower()] = str(doc["_id"])

    inserted = 0
    failed = []
    now = datetime.now(timezone.utc)

    def _float(v):
        try: return float(v) if v else None
        except (ValueError, TypeError): return None

    def _int(v):
        try: return int(v) if v else None
        except (ValueError, TypeError): return None

    for idx, raw_row in enumerate(rows, start=2):
        m = _map_jobs_row(raw_row)

        title = m.get("title", "").strip()
        if not title:
            failed.append({"row": idx, "reason": "Missing job title"})
            continue

        client_name = m.get("client_name", "").strip()
        client_id = client_map.get(client_name.lower()) if client_name else None
        if not client_id:
            failed.append({"row": idx, "title": title, "reason": f"Client '{client_name}' not found" if client_name else "Missing client name"})
            continue

        skills_raw = m.get("skills", "")
        skills = [s.strip() for s in skills_raw.split(",") if s.strip()] if skills_raw else []
        mandatory_raw = m.get("mandatory_skills", "")
        mandatory = [s.strip() for s in mandatory_raw.split(",") if s.strip()] if mandatory_raw else []

        tags_raw = m.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if tags_raw else []

        salary_min = _float(m.get("salary_min"))
        salary_max = _float(m.get("salary_max"))
        exp_min = _float(m.get("experience_min")) or 0.0
        exp_max = _float(m.get("experience_max"))
        total_positions = _int(m.get("total_positions")) or 1

        job_type_val = m.get("job_type", "full_time").lower().replace(" ", "_")
        work_mode_val = m.get("work_mode", "onsite").lower().replace(" ", "_")
        priority_val = m.get("priority", "medium").lower()
        status_val = m.get("status", "draft").lower().replace(" ", "_")
        gender_val = m.get("gender_eligibility", "all").lower()

        doc = {
            "_id": str(_uuid.uuid4()),
            "title": title,
            "client_id": client_id,
            "client_name": client_name,
            "description": m.get("description") or None,
            "requirements": m.get("requirements") or None,
            "responsibilities": m.get("responsibilities") or None,
            "job_type": job_type_val,
            "work_mode": work_mode_val,
            "city": m.get("city") or None,
            "state": m.get("state") or None,
            "country": m.get("country") or "India",
            "total_positions": total_positions,
            "filled_positions": 0,
            "salary": {"min_salary": salary_min, "max_salary": salary_max, "currency": m.get("currency") or "INR", "is_negotiable": True, "salary_type": "annual"} if (salary_min or salary_max) else None,
            "experience": {"min_years": exp_min, "max_years": exp_max},
            "skills_required": [{"skill_name": s, "is_mandatory": False} for s in skills],
            "eligibility": {
                "min_experience_years": exp_min,
                "max_experience_years": exp_max,
                "required_skills": skills,
                "mandatory_skills": mandatory,
                "preferred_locations": [m.get("city")] if m.get("city") else [],
                "min_ctc": salary_min,
                "max_ctc": salary_max,
            },
            "priority": priority_val,
            "status": status_val,
            "gender_eligibility": gender_val,
            "internal_notes": m.get("internal_notes") or None,
            "tags": tags,
            "total_applications": 0,
            "shortlisted_count": 0,
            "interview_count": 0,
            "offered_count": 0,
            "rejected_count": 0,
            "auto_match_enabled": False,
            "created_by": current_user["id"],
            "created_at": now,
            "is_deleted": False,
        }

        try:
            await db["jobs"].insert_one(doc)
            inserted += 1
        except Exception as e:
            failed.append({"row": idx, "title": title, "reason": str(e)})

    return {
        "success": True,
        "inserted": inserted,
        "failed": len(failed),
        "failed_rows": failed,
        "message": f"Import complete: {inserted} inserted, {len(failed)} failed.",
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
    
    return {"success": True, "message": "Job deleted successfully"}


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