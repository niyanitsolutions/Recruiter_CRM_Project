"""
Notification Model - Phase 4
System notifications and auto-reminders
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class NotificationType(str, Enum):
    """Notification types"""
    OFFER_RELEASED = "offer_released"
    OFFER_ACCEPTED = "offer_accepted"
    OFFER_DECLINED = "offer_declined"
    DOJ_CONFIRMED = "doj_confirmed"
    DOJ_REMINDER = "doj_reminder"
    DOJ_EXTENDED = "doj_extended"
    CANDIDATE_JOINED = "candidate_joined"
    CANDIDATE_NO_SHOW = "candidate_no_show"
    DOCUMENT_PENDING = "document_pending"
    DOCUMENT_SUBMITTED = "document_submitted"
    DOCUMENT_VERIFIED = "document_verified"
    DOCUMENT_REJECTED = "document_rejected"
    PAYOUT_ELIGIBLE = "payout_eligible"
    INVOICE_RAISED = "invoice_raised"
    INVOICE_APPROVED = "invoice_approved"
    INVOICE_REJECTED = "invoice_rejected"
    PAYMENT_PROCESSED = "payment_processed"
    DAY_10_REMINDER = "day_10_reminder"
    DAY_30_REMINDER = "day_30_reminder"
    PAYOUT_DAY_REMINDER = "payout_day_reminder"
    SYSTEM_ALERT = "system_alert"
    TASK_ASSIGNED = "task_assigned"
    MENTION = "mention"


class NotificationChannel(str, Enum):
    """Notification delivery channels"""
    IN_APP = "in_app"
    EMAIL = "email"
    SMS = "sms"
    PUSH = "push"
    WHATSAPP = "whatsapp"


class NotificationPriority(str, Enum):
    """Notification priority"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


class NotificationStatus(str, Enum):
    """Notification status"""
    PENDING = "pending"
    SENT = "sent"
    DELIVERED = "delivered"
    READ = "read"
    FAILED = "failed"


class ScheduledReminderType(str, Enum):
    """Types of scheduled reminders"""
    DOJ_UPCOMING = "doj_upcoming"
    DAY_10_CHECK = "day_10_check"
    DAY_30_CHECK = "day_30_check"
    PAYOUT_ELIGIBLE = "payout_eligible"
    DOCUMENT_FOLLOW_UP = "document_follow_up"
    CUSTOM = "custom"


class ScheduledReminderStatus(str, Enum):
    """Reminder status"""
    SCHEDULED = "scheduled"
    SENT = "sent"
    CANCELLED = "cancelled"
    FAILED = "failed"


# ============== Display Names ==============

NOTIFICATION_TYPE_DISPLAY = {
    NotificationType.OFFER_RELEASED: "Offer Released",
    NotificationType.OFFER_ACCEPTED: "Offer Accepted",
    NotificationType.OFFER_DECLINED: "Offer Declined",
    NotificationType.DOJ_CONFIRMED: "DOJ Confirmed",
    NotificationType.DOJ_REMINDER: "DOJ Reminder",
    NotificationType.DOJ_EXTENDED: "DOJ Extended",
    NotificationType.CANDIDATE_JOINED: "Candidate Joined",
    NotificationType.CANDIDATE_NO_SHOW: "Candidate No Show",
    NotificationType.DOCUMENT_PENDING: "Document Pending",
    NotificationType.DOCUMENT_SUBMITTED: "Document Submitted",
    NotificationType.DOCUMENT_VERIFIED: "Document Verified",
    NotificationType.DOCUMENT_REJECTED: "Document Rejected",
    NotificationType.PAYOUT_ELIGIBLE: "Payout Eligible",
    NotificationType.INVOICE_RAISED: "Invoice Raised",
    NotificationType.INVOICE_APPROVED: "Invoice Approved",
    NotificationType.INVOICE_REJECTED: "Invoice Rejected",
    NotificationType.PAYMENT_PROCESSED: "Payment Processed",
    NotificationType.DAY_10_REMINDER: "Day 10 Reminder",
    NotificationType.DAY_30_REMINDER: "Day 30 Reminder",
    NotificationType.PAYOUT_DAY_REMINDER: "Payout Day Reminder",
    NotificationType.SYSTEM_ALERT: "System Alert",
    NotificationType.TASK_ASSIGNED: "Task Assigned",
    NotificationType.MENTION: "Mention"
}

NOTIFICATION_CHANNEL_DISPLAY = {
    NotificationChannel.IN_APP: "In-App",
    NotificationChannel.EMAIL: "Email",
    NotificationChannel.SMS: "SMS",
    NotificationChannel.PUSH: "Push Notification",
    NotificationChannel.WHATSAPP: "WhatsApp"
}

NOTIFICATION_PRIORITY_DISPLAY = {
    NotificationPriority.LOW: "Low",
    NotificationPriority.MEDIUM: "Medium",
    NotificationPriority.HIGH: "High",
    NotificationPriority.URGENT: "Urgent"
}


def get_notification_type_display(notification_type: NotificationType) -> str:
    return NOTIFICATION_TYPE_DISPLAY.get(notification_type, notification_type.value)


# ============== Main Models ==============

class NotificationModel(BaseModel):
    """Main notification model (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # Target
    user_id: str
    user_type: str = "user"
    
    # Content
    type: NotificationType
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    
    # Delivery
    channels: List[NotificationChannel] = [NotificationChannel.IN_APP]
    priority: NotificationPriority = NotificationPriority.MEDIUM
    
    # Status per channel
    channel_status: Dict[str, NotificationStatus] = {}
    
    # Scheduling
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    
    # Read status
    is_read: bool = False
    read_at: Optional[datetime] = None
    
    # Action
    action_url: Optional[str] = None
    action_taken: bool = False
    action_taken_at: Optional[datetime] = None
    
    # Audit Fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class ScheduledReminderModel(BaseModel):
    """Scheduled reminder model (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    reminder_type: ScheduledReminderType
    reference_id: str
    reference_type: str
    
    # Schedule
    scheduled_date: datetime
    
    # Recipients
    recipient_ids: List[str]
    recipient_types: List[str]
    
    # Content
    title: str
    message: str
    channels: List[NotificationChannel] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
    
    # Status
    status: ScheduledReminderStatus = ScheduledReminderStatus.SCHEDULED
    sent_at: Optional[datetime] = None
    failure_reason: Optional[str] = None
    
    # Recurrence
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None
    next_occurrence: Optional[datetime] = None
    
    # Audit Fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class NotificationCreate(BaseModel):
    """Create notification"""
    user_id: str
    user_type: str = "user"
    type: NotificationType
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    channels: List[NotificationChannel] = [NotificationChannel.IN_APP]
    priority: NotificationPriority = NotificationPriority.MEDIUM
    scheduled_at: Optional[datetime] = None
    action_url: Optional[str] = None


class ScheduledReminderCreate(BaseModel):
    """Create scheduled reminder"""
    reminder_type: ScheduledReminderType
    reference_id: str
    reference_type: str
    scheduled_date: datetime
    recipient_ids: List[str]
    recipient_types: List[str]
    title: str
    message: str
    channels: List[NotificationChannel] = [NotificationChannel.IN_APP, NotificationChannel.EMAIL]
    is_recurring: bool = False
    recurrence_pattern: Optional[str] = None


class NotificationResponse(BaseModel):
    """Notification response"""
    id: str
    company_id: str
    user_id: str
    user_type: str
    type: NotificationType
    type_display: Optional[str] = None
    title: str
    message: str
    data: Optional[Dict[str, Any]] = None
    channels: List[NotificationChannel]
    priority: NotificationPriority
    priority_display: Optional[str] = None
    channel_status: Dict[str, NotificationStatus] = {}
    scheduled_at: Optional[datetime] = None
    sent_at: Optional[datetime] = None
    is_read: bool = False
    read_at: Optional[datetime] = None
    action_url: Optional[str] = None
    action_taken: bool = False
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class NotificationListResponse(BaseModel):
    """List response"""
    items: List[NotificationResponse]
    total: int
    unread_count: int
    page: int
    page_size: int


# ============== Notification Preferences ==============

class NotificationPreference(BaseModel):
    """User notification preferences"""
    user_id: str
    company_id: Optional[str] = None
    
    # Channel preferences per notification type
    preferences: Dict[str, List[NotificationChannel]] = {
        "offer_released": [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        "candidate_joined": [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        "invoice_raised": [NotificationChannel.IN_APP, NotificationChannel.EMAIL],
        "payment_processed": [NotificationChannel.IN_APP, NotificationChannel.EMAIL, NotificationChannel.SMS],
        "system_alert": [NotificationChannel.IN_APP],
    }
    
    # Global settings
    email_enabled: bool = True
    sms_enabled: bool = True
    push_enabled: bool = True
    
    # Quiet hours
    quiet_hours_enabled: bool = False
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    
    # Digest
    daily_digest_enabled: bool = False
    weekly_digest_enabled: bool = True
    digest_time: str = "09:00"


class NotificationPreferenceUpdate(BaseModel):
    """Update notification preferences"""
    preferences: Optional[Dict[str, List[NotificationChannel]]] = None
    email_enabled: Optional[bool] = None
    sms_enabled: Optional[bool] = None
    push_enabled: Optional[bool] = None
    quiet_hours_enabled: Optional[bool] = None
    quiet_hours_start: Optional[str] = None
    quiet_hours_end: Optional[str] = None
    daily_digest_enabled: Optional[bool] = None
    weekly_digest_enabled: Optional[bool] = None
    digest_time: Optional[str] = None
# Aliases for backward compatibility
NotificationInDB = NotificationModel
ScheduledReminderInDB = ScheduledReminderModel
