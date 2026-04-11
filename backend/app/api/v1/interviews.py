"""
Interviews API - Phase 3
Handles interview scheduling, feedback, and management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List
from datetime import date, timezone

from app.models.company.interview import (
    InterviewCreate, InterviewUpdate, InterviewReschedule, InterviewFeedbackSubmit,
    RoundResultSubmit,
    InterviewResponse, InterviewListResponse, InterviewStatus, InterviewMode, InterviewResult
)
from app.services.interview_service import InterviewService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/interviews", tags=["Interviews"])


@router.get("/")
async def list_interviews(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    application_id: Optional[str] = None,
    candidate_id: Optional[str] = None,
    job_id: Optional[str] = None,
    status: Optional[str] = None,  # Comma-separated
    interviewer_id: Optional[str] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """List interviews with filters"""
    status_list = status.split(",") if status else None
    
    # If interviewer, default to their interviews
    if current_user.get("role") not in ["admin", "candidate_coordinator", "client_coordinator"]:
        interviewer_id = current_user["id"]
    
    result = await InterviewService.list_interviews(
        db=db,
        page=page,
        page_size=page_size,
        application_id=application_id,
        candidate_id=candidate_id,
        job_id=job_id,
        status_filter=status_list,
        interviewer_id=interviewer_id,
        date_from=date_from,
        date_to=date_to
    )
    
    return {"success": True, **result}


@router.get("/today")
async def get_today_interviews(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """Get today's scheduled interviews"""
    user_id = None
    # Only show own interviews for non-coordinators
    if current_user.get("role") not in ["admin", "candidate_coordinator", "client_coordinator"]:
        user_id = current_user["id"]
    
    interviews = await InterviewService.get_today_interviews(db, user_id)
    return {"success": True, "data": interviews, "count": len(interviews)}


@router.get("/pending-feedback")
async def get_pending_feedback(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """Get interviews pending feedback submission"""
    interviews = await InterviewService.get_pending_feedback(db, current_user["id"])
    return {"success": True, "data": interviews, "count": len(interviews)}


@router.get("/dashboard-stats")
async def get_interview_stats(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """Get interview statistics"""
    user_id = None
    if current_user.get("role") not in ["admin", "candidate_coordinator", "client_coordinator"]:
        user_id = current_user["id"]
    
    stats = await InterviewService.get_dashboard_stats(db, user_id)
    return {"success": True, "data": stats}


@router.get("/statuses")
async def get_interview_statuses(current_user: dict = Depends(get_current_user)):
    """Get available interview statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in InterviewStatus]
    return {"success": True, "data": statuses}


@router.get("/modes")
async def get_interview_modes(current_user: dict = Depends(get_current_user)):
    """Get available interview modes"""
    modes = [{"value": m.value, "label": m.value.replace("_", " ").title()} for m in InterviewMode]
    return {"success": True, "data": modes}


@router.get("/results")
async def get_interview_results(current_user: dict = Depends(get_current_user)):
    """Get available interview results"""
    results = [{"value": r.value, "label": r.value.title()} for r in InterviewResult]
    return {"success": True, "data": results}


@router.post("/")
async def schedule_interview(
    interview_data: InterviewCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:schedule"]))
):
    """Schedule a new interview"""
    interview = await InterviewService.schedule_interview(
        db=db,
        interview_data=interview_data,
        scheduled_by=current_user["id"],
        company_id=current_user.get("company_id", ""),
        company_name=current_user.get("company_name", ""),
        scheduler_name=current_user.get("full_name", ""),
    )
    return {"success": True, "message": "Interview scheduled successfully", "data": interview}


@router.get("/{interview_id}")
async def get_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """Get interview by ID"""
    interview = await InterviewService.get_interview(db, interview_id)
    return {"success": True, "data": interview}


@router.put("/{interview_id}")
async def update_interview(
    interview_id: str,
    update_data: InterviewUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:schedule"]))
):
    """Update interview details"""
    # Get interview collection and update
    collection = db["interviews"]
    
    existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
    if not existing:
        raise HTTPException(status_code=404, detail="Interview not found")
    
    update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
    if update_dict:
        from datetime import datetime
        update_dict["updated_by"] = current_user["id"]
        update_dict["updated_at"] = datetime.now(timezone.utc)
        await collection.update_one({"_id": interview_id}, {"$set": update_dict})
    
    interview = await InterviewService.get_interview(db, interview_id)
    return {"success": True, "message": "Interview updated successfully", "data": interview}


@router.put("/{interview_id}/reschedule")
async def reschedule_interview(
    interview_id: str,
    reschedule_data: InterviewReschedule,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:schedule"]))
):
    """Reschedule an interview"""
    interview = await InterviewService.reschedule_interview(
        db=db,
        interview_id=interview_id,
        reschedule_data=reschedule_data,
        rescheduled_by=current_user["id"],
        company_id=current_user.get("company_id", ""),
        company_name=current_user.get("company_name", ""),
    )
    return {"success": True, "message": "Interview rescheduled successfully", "data": interview}


@router.post("/{interview_id}/feedback")
async def submit_feedback(
    interview_id: str,
    feedback_data: InterviewFeedbackSubmit,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:update_status"]))
):
    """Submit interview feedback"""
    interview = await InterviewService.submit_feedback(
        db=db,
        interview_id=interview_id,
        feedback_data=feedback_data,
        submitted_by=current_user["id"]
    )
    
    return {"success": True, "message": "Feedback submitted successfully", "data": interview}


@router.put("/{interview_id}/round-result")
async def submit_round_result(
    interview_id: str,
    result_data: RoundResultSubmit,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:update_status"]))
):
    """Submit Pass / Fail / On Hold for the current active round"""
    interview = await InterviewService.submit_round_result(
        db=db,
        interview_id=interview_id,
        result_data=result_data,
        submitted_by=current_user["id"],
    )
    return {"success": True, "message": "Round result saved", "data": interview}


@router.put("/{interview_id}/cancel")
async def cancel_interview(
    interview_id: str,
    reason: str = Query(..., min_length=5),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:schedule"]))
):
    """Cancel an interview"""
    interview = await InterviewService.cancel_interview(
        db=db,
        interview_id=interview_id,
        reason=reason,
        cancelled_by=current_user["id"]
    )
    
    return {"success": True, "message": "Interview cancelled", "data": interview}


@router.put("/{interview_id}/confirm")
async def confirm_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:schedule"]))
):
    """Mark interview as confirmed"""
    collection = db["interviews"]
    
    from datetime import datetime
    await collection.update_one(
        {"_id": interview_id, "is_deleted": False},
        {
            "$set": {
                "status": InterviewStatus.CONFIRMED.value,
                "updated_by": current_user["id"],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    interview = await InterviewService.get_interview(db, interview_id)
    return {"success": True, "message": "Interview confirmed", "data": interview}


@router.put("/{interview_id}/start")
async def start_interview(
    interview_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:update_status"]))
):
    """Mark interview as in progress"""
    collection = db["interviews"]
    
    from datetime import datetime
    await collection.update_one(
        {"_id": interview_id, "is_deleted": False},
        {
            "$set": {
                "status": InterviewStatus.IN_PROGRESS.value,
                "updated_by": current_user["id"],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    interview = await InterviewService.get_interview(db, interview_id)
    return {"success": True, "message": "Interview started", "data": interview}


@router.put("/{interview_id}/no-show")
async def mark_no_show(
    interview_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:update_status"]))
):
    """Mark interview as no-show"""
    collection = db["interviews"]
    
    from datetime import datetime
    await collection.update_one(
        {"_id": interview_id, "is_deleted": False},
        {
            "$set": {
                "status": InterviewStatus.NO_SHOW.value,
                "result": InterviewResult.FAILED.value,
                "updated_by": current_user["id"],
                "updated_at": datetime.now(timezone.utc)
            }
        }
    )
    
    interview = await InterviewService.get_interview(db, interview_id)
    return {"success": True, "message": "Marked as no-show", "data": interview}