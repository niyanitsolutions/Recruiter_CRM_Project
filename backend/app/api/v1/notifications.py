"""
Notifications API Routes - Phase 4
Handles notifications and reminders
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.notification import (
    NotificationCreate, NotificationResponse, NotificationListResponse,
    NotificationPreference, NotificationPreferenceUpdate,
    ScheduledReminderCreate, ScheduledReminderInDB
)
from app.services.notification_service import NotificationService

router = APIRouter(prefix="/notifications", tags=["Notifications"])


# ============== Notification Endpoints ==============

@router.get("", response_model=NotificationListResponse)
async def list_notifications(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    is_read: Optional[bool] = None,
    notification_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """List notifications for current user"""
    service = NotificationService(db)
    return await service.list_notifications(
        user_id=current_user["id"],
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        is_read=is_read,
        notification_type=notification_type
    )


@router.get("/unread-count")
async def get_unread_count(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get unread notification count"""
    service = NotificationService(db)
    result = await service.list_notifications(
        user_id=current_user["id"],
        company_id=current_user["company_id"],
        is_read=False,
        page_size=1
    )
    return {"unread_count": result.unread_count}


@router.get("/{notification_id}", response_model=NotificationResponse)
async def get_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get notification by ID"""
    service = NotificationService(db)
    notification = await service.get_notification_by_id(
        notification_id, current_user["company_id"]
    )
    
    if not notification:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    # Verify ownership
    if notification.user_id != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied"
        )
    
    return notification


@router.post("/{notification_id}/read")
async def mark_as_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Mark notification as read"""
    service = NotificationService(db)
    success = await service.mark_as_read(
        notification_id=notification_id,
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return {"message": "Notification marked as read"}


@router.post("/read-all")
async def mark_all_as_read(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Mark all notifications as read"""
    service = NotificationService(db)
    count = await service.mark_all_as_read(
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )
    return {"message": f"Marked {count} notifications as read"}


@router.delete("/{notification_id}")
async def delete_notification(
    notification_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Delete notification"""
    service = NotificationService(db)
    success = await service.delete_notification(
        notification_id=notification_id,
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Notification not found"
        )
    
    return {"message": "Notification deleted"}


# ============== Admin Endpoints ==============

@router.post("", response_model=NotificationResponse, status_code=status.HTTP_201_CREATED)
async def create_notification(
    data: NotificationCreate,
    current_user: dict = Depends(require_permissions(["notifications:create"])),
    db = Depends(get_company_db)
):
    """Create notification (Admin/System)"""
    service = NotificationService(db)
    return await service.create_notification(data, current_user["company_id"])


@router.post("/bulk", status_code=status.HTTP_201_CREATED)
async def create_bulk_notifications(
    notifications: list[NotificationCreate],
    current_user: dict = Depends(require_permissions(["notifications:create"])),
    db = Depends(get_company_db)
):
    """Create multiple notifications (Admin/System)"""
    service = NotificationService(db)
    results = await service.create_bulk_notifications(
        notifications, current_user["company_id"]
    )
    return {"created": len(results)}


# ============== Scheduled Reminders ==============

@router.post("/reminders", status_code=status.HTTP_201_CREATED)
async def create_scheduled_reminder(
    data: ScheduledReminderCreate,
    current_user: dict = Depends(require_permissions(["notifications:create"])),
    db = Depends(get_company_db)
):
    """Create scheduled reminder"""
    service = NotificationService(db)
    return await service.create_scheduled_reminder(
        data=data,
        company_id=current_user["company_id"],
        created_by=current_user["id"]
    )


@router.post("/reminders/process")
async def process_due_reminders(
    current_user: dict = Depends(require_permissions(["notifications:create"])),
    db = Depends(get_company_db)
):
    """Process and send all due reminders (scheduler/admin)"""
    service = NotificationService(db)
    count = await service.process_due_reminders(current_user["company_id"])
    return {"processed": count}


@router.delete("/reminders/{reminder_id}")
async def cancel_reminder(
    reminder_id: str,
    current_user: dict = Depends(require_permissions(["notifications:create"])),
    db = Depends(get_company_db)
):
    """Cancel scheduled reminder"""
    service = NotificationService(db)
    success = await service.cancel_reminder(reminder_id, current_user["company_id"])
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Reminder not found or already sent"
        )
    
    return {"message": "Reminder cancelled"}


# ============== Preferences ==============

@router.get("/preferences", response_model=NotificationPreference)
async def get_preferences(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Get current user's notification preferences"""
    service = NotificationService(db)
    return await service.get_user_preferences(
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )


@router.put("/preferences", response_model=NotificationPreference)
async def update_preferences(
    data: NotificationPreferenceUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db)
):
    """Update notification preferences"""
    service = NotificationService(db)
    return await service.update_user_preferences(
        user_id=current_user["id"],
        data=data,
        company_id=current_user["company_id"]
    )