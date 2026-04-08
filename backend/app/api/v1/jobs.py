"""
Jobs API - Phase 3
Handles job management with eligibility criteria and candidate matching
"""
from fastapi import APIRouter, Depends, HTTPException, Query
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
        visible_to_partner=visible_to_partner
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
        )
        return {"success": True, "message": "Job created successfully", "data": job}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


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
        updated_by=current_user["id"]
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
        deleted_by=current_user["id"]
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