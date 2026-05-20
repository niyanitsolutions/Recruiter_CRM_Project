"""HRM — Announcement Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class AnnouncementType(str, Enum):
    GENERAL = "general"
    HOLIDAY = "holiday"
    POLICY = "policy"
    BIRTHDAY = "birthday"
    ANNIVERSARY = "anniversary"
    EVENT = "event"
    URGENT = "urgent"


class AnnouncementPriority(str, Enum):
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class ReadRecord(BaseModel):
    employee_id: str
    employee_name: Optional[str] = None
    read_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class AnnouncementModel(BaseModel):
    """Company announcement — company_db.hrm_announcements"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    title: str
    body: str
    announcement_type: AnnouncementType = AnnouncementType.GENERAL
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL

    # Audience targeting (empty list = all employees)
    target_department_ids: List[str] = Field(default_factory=list)
    target_employee_ids: List[str] = Field(default_factory=list)

    # Read tracking
    read_by: List[ReadRecord] = Field(default_factory=list)
    requires_acknowledgement: bool = False

    # Email broadcast
    send_email: bool = False
    email_sent_at: Optional[datetime] = None

    # Auto-generated for birthdays/anniversaries
    is_auto: bool = False
    linked_employee_id: Optional[str] = None

    # Scheduling
    publish_at: Optional[datetime] = None   # None = publish immediately
    expires_at: Optional[datetime] = None

    # Attachments
    attachment_url: Optional[str] = None

    is_active: bool = True
    created_by: Optional[str] = None
    created_by_name: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    announcement_type: AnnouncementType = AnnouncementType.GENERAL
    priority: AnnouncementPriority = AnnouncementPriority.NORMAL
    target_department_ids: Optional[List[str]] = None
    target_employee_ids: Optional[List[str]] = None
    requires_acknowledgement: bool = False
    send_email: bool = False
    publish_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    attachment_url: Optional[str] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    announcement_type: Optional[AnnouncementType] = None
    priority: Optional[AnnouncementPriority] = None
    target_department_ids: Optional[List[str]] = None
    target_employee_ids: Optional[List[str]] = None
    requires_acknowledgement: Optional[bool] = None
    send_email: Optional[bool] = None
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None
