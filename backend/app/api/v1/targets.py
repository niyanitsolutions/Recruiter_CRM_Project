"""
Targets API Routes - Phase 5
Goals, targets, and performance tracking endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional
from datetime import date

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.target import (
    TargetType, TargetPeriod, TargetStatus, TargetScope,
    CreateTargetRequest, UpdateTargetRequest, BulkCreateTargetRequest,
    UpdateProgressRequest,
    TargetResponse, TargetListResponse,
    TargetSummaryResponse, LeaderboardResponse, TargetDashboardResponse,
    TARGET_TYPE_DISPLAY, TARGET_PERIOD_DISPLAY
)
from app.services.target_service import TargetService

router = APIRouter(prefix="/targets", tags=["Targets"])


# ============== Target Types & Config ==============

@router.get("/types")
async def get_target_types(
    current_user: dict = Depends(require_permissions(["targets:view"]))
):
    """Get available target types"""
    return {
        "types": [
            {"value": t.value, "label": TARGET_TYPE_DISPLAY.get(t, t.value)}
            for t in TargetType
        ]
    }


@router.get("/periods")
async def get_target_periods(
    current_user: dict = Depends(require_permissions(["targets:view"]))
):
    """Get available target periods"""
    return {
        "periods": [
            {"value": p.value, "label": TARGET_PERIOD_DISPLAY.get(p, p.value)}
            for p in TargetPeriod
        ]
    }


# ============== Target CRUD ==============

@router.post("", response_model=TargetResponse, status_code=status.HTTP_201_CREATED)
async def create_target(
    data: CreateTargetRequest,
    current_user: dict = Depends(require_permissions(["targets:create"])),
    db = Depends(get_company_db)
):
    """Create a new target"""
    service = TargetService(db)
    
    return await service.create_target(
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"],
        company_name=current_user.get("company_name", ""),
        creator_name=current_user.get("full_name", ""),
    )


@router.get("", response_model=TargetListResponse)
async def list_targets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    target_type: Optional[TargetType] = None,
    period: Optional[TargetPeriod] = None,
    scope: Optional[TargetScope] = None,
    assigned_to: Optional[str] = None,
    status: Optional[TargetStatus] = None,
    active_only: bool = False,
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """List targets with filters"""
    service = TargetService(db)
    
    return await service.list_targets(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        target_type=target_type,
        period=period,
        scope=scope,
        assigned_to=assigned_to,
        status=status,
        active_only=active_only
    )


@router.get("/my-targets", response_model=TargetListResponse)
async def get_my_targets(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    active_only: bool = True,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get current user's targets"""
    service = TargetService(db)
    
    return await service.list_targets(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        assigned_to=current_user["id"],
        active_only=active_only
    )


@router.get("/{target_id}", response_model=TargetResponse)
async def get_target(
    target_id: str,
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """Get target by ID"""
    service = TargetService(db)
    
    target = await service.get_target(
        target_id=target_id,
        company_id=current_user["company_id"]
    )
    
    if not target:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return target


@router.put("/{target_id}", response_model=TargetResponse)
async def update_target(
    target_id: str,
    data: UpdateTargetRequest,
    current_user: dict = Depends(require_permissions(["targets:edit"])),
    db = Depends(get_company_db)
):
    """Update a target"""
    service = TargetService(db)
    
    result = await service.update_target(
        target_id=target_id,
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return result


@router.delete("/{target_id}")
async def delete_target(
    target_id: str,
    current_user: dict = Depends(require_permissions(["targets:delete"])),
    db = Depends(get_company_db)
):
    """Delete a target"""
    service = TargetService(db)
    
    success = await service.delete_target(
        target_id=target_id,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return {"message": "Target deleted successfully"}


# ============== Bulk Operations ==============

@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def bulk_create_targets(
    data: BulkCreateTargetRequest,
    current_user: dict = Depends(require_permissions(["targets:create"])),
    db = Depends(get_company_db)
):
    """Create targets for multiple users"""
    service = TargetService(db)
    
    targets = await service.bulk_create_targets(
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )
    
    return {
        "message": f"Created {len(targets)} targets",
        "targets": targets
    }


# ============== Progress Management ==============

@router.put("/{target_id}/progress", response_model=TargetResponse)
async def update_progress(
    target_id: str,
    data: UpdateProgressRequest,
    current_user: dict = Depends(require_permissions(["targets:edit"])),
    db = Depends(get_company_db)
):
    """Manually update target progress"""
    service = TargetService(db)
    
    result = await service.update_progress(
        target_id=target_id,
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return result


@router.post("/{target_id}/increment", response_model=TargetResponse)
async def increment_progress(
    target_id: str,
    increment: float = Query(..., description="Amount to increment"),
    current_user: dict = Depends(require_permissions(["targets:edit"])),
    db = Depends(get_company_db)
):
    """Increment target progress by amount"""
    service = TargetService(db)
    
    result = await service.increment_progress(
        target_id=target_id,
        increment=increment,
        company_id=current_user["company_id"],
        user_id=current_user["id"],
        source="manual"
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Target not found"
        )
    
    return result


@router.post("/auto-update")
async def auto_update_targets(
    current_user: dict = Depends(require_permissions(["targets:admin"])),
    db = Depends(get_company_db)
):
    """Trigger auto-update of all targets (admin only)"""
    service = TargetService(db)
    
    updated_count = await service.auto_update_targets(
        company_id=current_user["company_id"]
    )
    
    return {
        "message": f"Updated {updated_count} targets",
        "updated_count": updated_count
    }


# ============== Dashboard & Summary ==============

@router.get("/summary/company", response_model=TargetSummaryResponse)
async def get_company_target_summary(
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """Get target summary for the company"""
    service = TargetService(db)
    
    return await service.get_target_summary(
        company_id=current_user["company_id"]
    )


@router.get("/summary/user/{user_id}", response_model=TargetSummaryResponse)
async def get_user_target_summary(
    user_id: str,
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """Get target summary for a specific user"""
    service = TargetService(db)
    
    return await service.get_target_summary(
        company_id=current_user["company_id"],
        user_id=user_id
    )


@router.get("/summary/me", response_model=TargetSummaryResponse)
async def get_my_target_summary(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get target summary for current user"""
    service = TargetService(db)
    
    return await service.get_target_summary(
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )


@router.get("/dashboard/me", response_model=TargetDashboardResponse)
async def get_my_target_dashboard(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get target dashboard for current user"""
    service = TargetService(db)
    
    return await service.get_user_target_dashboard(
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )


@router.get("/dashboard/user/{user_id}", response_model=TargetDashboardResponse)
async def get_user_target_dashboard(
    user_id: str,
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """Get target dashboard for a specific user"""
    service = TargetService(db)
    
    return await service.get_user_target_dashboard(
        user_id=user_id,
        company_id=current_user["company_id"]
    )


# ============== Leaderboard ==============

@router.get("/leaderboard/{target_type}", response_model=LeaderboardResponse)
async def get_leaderboard(
    target_type: TargetType,
    period: Optional[TargetPeriod] = None,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["targets:view"])),
    db = Depends(get_company_db)
):
    """Get leaderboard for a target type"""
    service = TargetService(db)
    
    return await service.get_leaderboard(
        company_id=current_user["company_id"],
        target_type=target_type,
        period=period,
        start_date=start_date,
        end_date=end_date
    )


@router.get("/leaderboard/{target_type}/my-rank")
async def get_my_leaderboard_rank(
    target_type: TargetType,
    period: Optional[TargetPeriod] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get current user's rank in leaderboard"""
    service = TargetService(db)
    
    leaderboard = await service.get_leaderboard(
        company_id=current_user["company_id"],
        target_type=target_type,
        period=period
    )
    
    my_rank = None
    my_entry = None
    
    for entry in leaderboard.entries:
        if entry.user_id == current_user["id"]:
            my_rank = entry.rank
            my_entry = entry
            break
    
    return {
        "rank": my_rank,
        "total_participants": leaderboard.total_participants,
        "entry": my_entry,
        "target_type": target_type.value,
        "period": leaderboard.period.value
    }