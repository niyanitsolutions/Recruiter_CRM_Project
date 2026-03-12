"""
Applications API - Phase 3
Handles candidate applications (candidate-job mapping and workflow)
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List

from app.models.company.application import (
    ApplicationCreate, ApplicationUpdate, ApplicationStatusUpdate,
    ApplicationResponse, ApplicationListResponse, ApplicationStatus, RejectionReason
)
from app.services.application_service import ApplicationService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/applications", tags=["Applications"])


@router.get("/")
async def list_applications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    job_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    status: Optional[str] = None,  # Comma-separated
    partner_id: Optional[str] = None,
    assigned_to: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """List applications with filters"""
    status_list = status.split(",") if status else None
    
    # Partners only see their own applications
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    result = await ApplicationService.list_applications(
        db=db,
        page=page,
        page_size=page_size,
        job_id=job_id,
        candidate_id=candidate_id,
        status_filter=status_list,
        partner_id=partner_id,
        assigned_to=assigned_to
    )
    
    return {"success": True, **result}


@router.get("/dashboard-stats")
async def get_application_stats(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get application statistics"""
    user_id = None
    if current_user.get("role") in ["candidate_coordinator", "client_coordinator"]:
        user_id = current_user["id"]
    elif current_user.get("role") == "partner":
        # Partners see their own stats (handled differently)
        pass
    
    stats = await ApplicationService.get_dashboard_stats(db, user_id)
    return {"success": True, "data": stats}


@router.get("/statuses")
async def get_application_statuses(current_user: dict = Depends(get_current_user)):
    """Get available application statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in ApplicationStatus]
    return {"success": True, "data": statuses}


@router.get("/rejection-reasons")
async def get_rejection_reasons(current_user: dict = Depends(get_current_user)):
    """Get available rejection reasons"""
    reasons = [{"value": r.value, "label": r.value.replace("_", " ").title()} for r in RejectionReason]
    return {"success": True, "data": reasons}


@router.post("/")
async def create_application(
    application_data: ApplicationCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """
    Create a new application (apply candidate to job)
    Can be done by coordinators or partners
    """
    partner_id = None
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    application = await ApplicationService.create_application(
        db=db,
        application_data=application_data,
        created_by=current_user["id"],
        partner_id=partner_id
    )
    
    return {"success": True, "message": "Application created successfully", "data": application}


@router.get("/{application_id}")
async def get_application(
    application_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:view"]))
):
    """Get application by ID"""
    application = await ApplicationService.get_application(db, application_id)
    
    # Partners can only view their own applications
    if current_user.get("role") == "partner" and application.partner_id != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    return {"success": True, "data": application}


@router.put("/{application_id}/status")
async def update_application_status(
    application_id: str,
    status_update: ApplicationStatusUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Update application status (move through workflow)"""
    application = await ApplicationService.update_application_status(
        db=db,
        application_id=application_id,
        status_update=status_update,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": f"Status updated to {status_update.status}", "data": application}


@router.put("/{application_id}/assign")
async def assign_application(
    application_id: str,
    assigned_to: str = Query(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:assign"]))
):
    """Assign application to a coordinator"""
    application = await ApplicationService.assign_application(
        db=db,
        application_id=application_id,
        assigned_to=assigned_to,
        assigned_by=current_user["id"]
    )
    
    return {"success": True, "message": "Application assigned successfully", "data": application}


@router.delete("/{application_id}")
async def delete_application(
    application_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:delete"]))
):
    """Soft delete an application"""
    await ApplicationService.delete_application(
        db=db,
        application_id=application_id,
        deleted_by=current_user["id"]
    )
    
    return {"success": True, "message": "Application deleted successfully"}


# ============== Bulk Operations ==============

@router.post("/bulk-apply")
async def bulk_apply_candidates(
    job_id: str = Query(...),
    candidate_ids: List[str] = Query(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:create"]))
):
    """Apply multiple candidates to a job at once"""
    results = {"success": [], "failed": []}
    
    for candidate_id in candidate_ids:
        try:
            application_data = ApplicationCreate(
                candidate_id=candidate_id,
                job_id=job_id
            )
            await ApplicationService.create_application(
                db=db,
                application_data=application_data,
                created_by=current_user["id"]
            )
            results["success"].append(candidate_id)
        except HTTPException as e:
            results["failed"].append({"candidate_id": candidate_id, "error": e.detail})
        except Exception as e:
            results["failed"].append({"candidate_id": candidate_id, "error": str(e)})
    
    return {
        "success": True,
        "message": f"Applied {len(results['success'])} candidates, {len(results['failed'])} failed",
        "data": results
    }


@router.put("/bulk-status")
async def bulk_update_status(
    application_ids: List[str] = Query(...),
    status: str = Query(...),
    remarks: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["candidates:edit"]))
):
    """Update status for multiple applications"""
    results = {"success": [], "failed": []}
    
    status_update = ApplicationStatusUpdate(status=status, remarks=remarks)
    
    for app_id in application_ids:
        try:
            await ApplicationService.update_application_status(
                db=db,
                application_id=app_id,
                status_update=status_update,
                updated_by=current_user["id"]
            )
            results["success"].append(app_id)
        except Exception as e:
            results["failed"].append({"application_id": app_id, "error": str(e)})
    
    return {
        "success": True,
        "message": f"Updated {len(results['success'])} applications, {len(results['failed'])} failed",
        "data": results
    }