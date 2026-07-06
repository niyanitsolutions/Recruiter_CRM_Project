"""
Onboard API Routes - Phase 4
Handles onboarding workflow endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from datetime import date

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.onboard import (
    OnboardCreate, OnboardUpdate, OnboardStatusUpdate,
    OnboardResponse, OnboardListResponse, OnboardDashboardStats,
    DOJExtension, DocumentUpdate, OnboardStatus, ReleaseOfferRequest
)
from app.services.onboard_service import OnboardService

router = APIRouter(prefix="/onboards", tags=["Onboards"])


# ============== CRUD Endpoints ==============

@router.post("", response_model=OnboardResponse, status_code=status.HTTP_201_CREATED)
async def create_onboard(
    data: OnboardCreate,
    current_user: dict = Depends(require_permissions(["onboards:create"])),
    db = Depends(get_company_db)
):
    """Create new onboard record (when offer is released)"""
    service = OnboardService(db)
    return await service.create(
        data=data,
        company_id=current_user["company_id"],
        created_by=current_user["id"]
    )


@router.get("", response_model=OnboardListResponse)
async def list_onboards(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    status: Optional[str] = None,
    client_id: Optional[str] = None,
    partner_id: Optional[str] = None,
    search: Optional[str] = None,
    from_date: Optional[date] = None,
    to_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """List onboards with filters"""
    service = OnboardService(db)
    
    # Partners can only see their own candidates
    if current_user.get("role") == "partner":
        partner_id = current_user["id"]
    
    return await service.list(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        status=status,
        client_id=client_id,
        partner_id=partner_id,
        search=search,
        from_date=from_date,
        to_date=to_date
    )


@router.get("/dashboard", response_model=OnboardDashboardStats)
async def get_dashboard_stats(
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """Get onboarding dashboard statistics"""
    service = OnboardService(db)
    return await service.get_dashboard_stats(current_user["company_id"])


@router.get("/reminders-due")
async def get_reminders_due(
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """Get onboards that need reminders today"""
    service = OnboardService(db)
    return await service.get_reminders_due(current_user["company_id"])


@router.get("/upcoming-doj")
async def get_upcoming_doj(
    days: int = Query(7, ge=1, le=30),
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """Get onboards with upcoming DOJ"""
    service = OnboardService(db)
    # Use reminders_due which includes upcoming_doj
    reminders = await service.get_reminders_due(current_user["company_id"])
    return reminders.get("upcoming_doj", [])


@router.get("/{onboard_id}", response_model=OnboardResponse)
async def get_onboard(
    onboard_id: str,
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """Get onboard by ID"""
    service = OnboardService(db)
    onboard = await service.get_by_id(onboard_id, current_user["company_id"])
    
    if not onboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    # Partners can only see their own candidates
    if current_user.get("role") == "partner" and onboard.partner_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return onboard


@router.put("/{onboard_id}", response_model=OnboardResponse)
async def update_onboard(
    onboard_id: str,
    data: OnboardUpdate,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Update onboard record"""
    service = OnboardService(db)
    result = await service.update(
        onboard_id=onboard_id,
        data=data,
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    return result


@router.delete("/{onboard_id}")
async def delete_onboard(
    onboard_id: str,
    current_user: dict = Depends(require_permissions(["onboards:delete"])),
    db = Depends(get_company_db)
):
    """Soft delete onboard record"""
    service = OnboardService(db)
    success = await service.delete(
        onboard_id=onboard_id,
        company_id=current_user["company_id"],
        deleted_by=current_user["id"]
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    return {"message": "Onboard record deleted successfully"}


# ============== Status Management ==============

@router.put("/{onboard_id}/status", response_model=OnboardResponse)
async def update_onboard_status(
    onboard_id: str,
    data: OnboardStatusUpdate,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Update onboard status"""
    service = OnboardService(db)
    
    # Validate status transition
    onboard = await service.get_by_id(onboard_id, current_user["company_id"])
    if not onboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    # Require actual_doj when marking as joined
    if data.status == OnboardStatus.JOINED and not data.actual_doj:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Actual DOJ is required when status is JOINED"
        )
    
    result = await service.update_status(
        onboard_id=onboard_id,
        data=data,
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )
    
    return result


@router.post("/{onboard_id}/accept-offer", response_model=OnboardResponse)
async def accept_offer(
    onboard_id: str,
    expected_doj: date = Query(..., description="Expected date of joining (YYYY-MM-DD)"),
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Accept offer and set expected DOJ"""
    service = OnboardService(db)
    
    # First update expected DOJ
    await service.update(
        onboard_id=onboard_id,
        data=OnboardUpdate(expected_doj=expected_doj),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )
    
    # Then update status
    return await service.update_status(
        onboard_id=onboard_id,
        data=OnboardStatusUpdate(
            status=OnboardStatus.OFFER_ACCEPTED,
            notes="Offer accepted"
        ),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )


@router.post("/{onboard_id}/decline-offer", response_model=OnboardResponse)
async def decline_offer(
    onboard_id: str,
    reason: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Decline offer"""
    service = OnboardService(db)
    return await service.update_status(
        onboard_id=onboard_id,
        data=OnboardStatusUpdate(
            status=OnboardStatus.OFFER_DECLINED,
            reason=reason
        ),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )


@router.post("/{onboard_id}/confirm-doj", response_model=OnboardResponse)
async def confirm_doj(
    onboard_id: str,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Confirm DOJ"""
    service = OnboardService(db)
    return await service.update_status(
        onboard_id=onboard_id,
        data=OnboardStatusUpdate(
            status=OnboardStatus.DOJ_CONFIRMED
        ),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )


@router.post("/{onboard_id}/extend-doj", response_model=OnboardResponse)
async def extend_doj(
    onboard_id: str,
    data: DOJExtension,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Extend DOJ"""
    service = OnboardService(db)
    return await service.extend_doj(
        onboard_id=onboard_id,
        data=data,
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )


@router.post("/{onboard_id}/mark-joined", response_model=OnboardResponse)
async def mark_joined(
    onboard_id: str,
    actual_doj: date = Query(..., description="Actual date of joining (YYYY-MM-DD)"),
    notify_email: bool = Query(True, description="Send onboarding confirmation email to the candidate"),
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Mark candidate as joined"""
    service = OnboardService(db)
    result = await service.update_status(
        onboard_id=onboard_id,
        data=OnboardStatusUpdate(
            status=OnboardStatus.JOINED,
            actual_doj=actual_doj
        ),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboard record not found")

    # Joining recorded successfully — send onboarding confirmation email (opt-in,
    # never blocks the response, never sent if the update above failed).
    if notify_email and result.candidate_email:
        try:
            from app.services.email_service import send_onboarding_confirmation_email, _fire_email
            _fire_email(send_onboarding_confirmation_email(
                to_email=result.candidate_email,
                candidate_name=result.candidate_name or "",
                job_title=result.job_title or "",
                company_name=current_user.get("company_name", ""),
                joining_date=str(actual_doj),
                company_id=current_user["company_id"],
            ))
        except Exception as _e:
            import logging as _log
            _log.getLogger(__name__).warning("Onboarding confirmation email failed: %s", _e)

    return result


@router.post("/{onboard_id}/mark-no-show", response_model=OnboardResponse)
async def mark_no_show(
    onboard_id: str,
    reason: Optional[str] = Query(None),
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Mark candidate as no-show"""
    service = OnboardService(db)
    return await service.update_status(
        onboard_id=onboard_id,
        data=OnboardStatusUpdate(
            status=OnboardStatus.NO_SHOW,
            reason=reason
        ),
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )


@router.post("/{onboard_id}/hold", response_model=OnboardResponse)
async def put_on_hold(
    onboard_id: str,
    reason: Optional[str] = Query(None),
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Pause a 'selected' candidate — moves them to 'hold'. Does not touch offer data or offer counts."""
    service = OnboardService(db)
    try:
        result = await service.put_on_hold(
            onboard_id=onboard_id,
            company_id=current_user["company_id"],
            updated_by=current_user["id"],
            reason=reason,
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboard record not found")
    return result


@router.post("/{onboard_id}/resume", response_model=OnboardResponse)
async def resume_candidate(
    onboard_id: str,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Resume a 'hold' candidate back to 'selected'."""
    service = OnboardService(db)
    try:
        result = await service.resume_from_hold(
            onboard_id=onboard_id,
            company_id=current_user["company_id"],
            updated_by=current_user["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboard record not found")
    return result


@router.post("/{onboard_id}/release-offer", response_model=OnboardResponse)
async def release_offer(
    onboard_id: str,
    data: ReleaseOfferRequest,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Release offer for a candidate in 'selected' status, filling in offer details."""
    service = OnboardService(db)
    try:
        result = await service.release_offer(
            onboard_id=onboard_id,
            data=data,
            company_id=current_user["company_id"],
            updated_by=current_user["id"],
        )
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc))
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboard record not found")

    # Offer saved successfully — send the offer email (opt-in, never blocks the
    # response, never sent if the update above failed).
    if data.notify_email and result.candidate_email:
        try:
            from app.services.email_service import send_offer_letter_email, _fire_email
            offer_details = (
                f"Designation: {data.offer_designation}\n"
                f"CTC: {data.offer_ctc}\n"
                f"Location: {data.offer_location}"
                + (f"\nDepartment: {data.department}" if data.department else "")
                + (f"\nEmployment Type: {data.employment_type}" if data.employment_type else "")
                + (f"\nVariable Pay: {data.variable_pay}" if data.variable_pay else "")
                + (f"\nJoining Bonus: {data.joining_bonus}" if data.joining_bonus else "")
                + (f"\nProbation Period: {data.probation_period_months} month(s)" if data.probation_period_months else "")
                + (f"\nExpected Date of Joining: {data.expected_doj}" if data.expected_doj else "")
            )
            _fire_email(send_offer_letter_email(
                to_email=result.candidate_email,
                candidate_name=result.candidate_name or "",
                job_title=result.job_title or "",
                company_name=current_user.get("company_name", ""),
                offer_details=offer_details,
                offer_deadline=str(data.offer_valid_until) if data.offer_valid_until else None,
                company_id=current_user["company_id"],
            ))
        except Exception as _e:
            import logging as _log
            _log.getLogger(__name__).warning("Offer email failed: %s", _e)

    return result


@router.post("/{onboard_id}/reject", response_model=OnboardResponse)
async def reject_onboard(
    onboard_id: str,
    rejection_reason: str,
    notes: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Reject a candidate at any onboarding stage (selected / offer / post-joining)."""
    service = OnboardService(db)
    result = await service.reject_onboard(
        onboard_id=onboard_id,
        rejection_reason=rejection_reason,
        company_id=current_user["company_id"],
        updated_by=current_user["id"],
        notes=notes,
    )
    if not result:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Onboard record not found")
    return result


# ============== Document Management ==============

@router.put("/{onboard_id}/documents", response_model=OnboardResponse)
async def update_document(
    onboard_id: str,
    data: DocumentUpdate,
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Update document status"""
    service = OnboardService(db)
    result = await service.update_document(
        onboard_id=onboard_id,
        data=data,
        company_id=current_user["company_id"],
        updated_by=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    return result


@router.get("/{onboard_id}/documents")
async def get_documents(
    onboard_id: str,
    current_user: dict = Depends(require_permissions(["onboards:view"])),
    db = Depends(get_company_db)
):
    """Get onboard documents"""
    service = OnboardService(db)
    onboard = await service.get_by_id(onboard_id, current_user["company_id"])
    
    if not onboard:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Onboard record not found"
        )
    
    return {
        "documents": onboard.documents,
        "documents_verified": onboard.documents_verified
    }


# ============== Day Counter & Reminders ==============

@router.post("/update-day-counters")
async def update_day_counters(
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Update day counters for all joined candidates (admin/scheduler only)"""
    service = OnboardService(db)
    count = await service.update_day_counters(current_user["company_id"])
    return {"message": f"Updated {count} onboard records"}


@router.post("/{onboard_id}/mark-reminder-sent")
async def mark_reminder_sent(
    onboard_id: str,
    reminder_type: str,
    recipients: list[str],
    channel: str = "email",
    current_user: dict = Depends(require_permissions(["onboards:edit"])),
    db = Depends(get_company_db)
):
    """Mark reminder as sent"""
    service = OnboardService(db)
    success = await service.mark_reminder_sent(
        onboard_id=onboard_id,
        reminder_type=reminder_type,
        company_id=current_user["company_id"],
        recipients=recipients,
        channel=channel
    )
    
    return {"success": success}