"""
Pipelines API - ATS Upgrade
Job-specific interview pipeline management
"""
from fastapi import APIRouter, Depends, Query
from typing import Optional

from app.models.company.pipeline import PipelineCreate, PipelineUpdate
from app.services.pipeline_service import PipelineService
from app.core.dependencies import get_current_user, get_company_db, require_permissions, require_any_permission

router = APIRouter(prefix="/pipelines", tags=["Pipelines"])


@router.get("/")
async def list_pipelines(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    job_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:view"], ["jobs:view"]])),
):
    """List all pipelines"""
    return await PipelineService.list_pipelines(db, page=page, page_size=page_size, job_id=job_id)


@router.post("/")
async def create_pipeline(
    pipeline_data: PipelineCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:create"], ["jobs:create"]])),
):
    """Create a new pipeline"""
    return await PipelineService.create_pipeline(db, pipeline_data, created_by=current_user["id"])


@router.get("/job/{job_id}")
async def get_pipeline_for_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:view"], ["jobs:view"]])),
):
    """Get pipeline (and stages) attached to a job"""
    pipeline = await PipelineService.get_pipeline_by_job(db, job_id)
    if not pipeline:
        return {"data": None, "stages": []}
    return {"data": pipeline, "stages": pipeline.stages}


@router.get("/job/{job_id}/stages")
async def get_stages_for_job(
    job_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:view"], ["jobs:view"]])),
):
    """Get ordered stages for a job's pipeline (used when scheduling interviews)"""
    stages = await PipelineService.get_stages_for_job(db, job_id)
    return {"data": stages}


@router.get("/{pipeline_id}")
async def get_pipeline(
    pipeline_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:view"], ["jobs:view"]])),
):
    """Get pipeline by ID"""
    return await PipelineService.get_pipeline(db, pipeline_id)


@router.put("/{pipeline_id}")
async def update_pipeline(
    pipeline_id: str,
    update_data: PipelineUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:edit"], ["jobs:edit"]])),
):
    """Update a pipeline"""
    return await PipelineService.update_pipeline(db, pipeline_id, update_data, updated_by=current_user["id"])


@router.delete("/{pipeline_id}")
async def delete_pipeline(
    pipeline_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _: bool = Depends(require_any_permission([["interview_settings:delete"], ["jobs:delete"]])),
):
    """Delete a pipeline (soft delete)"""
    await PipelineService.delete_pipeline(db, pipeline_id, deleted_by=current_user["id"])
    return {"message": "Pipeline deleted successfully"}
