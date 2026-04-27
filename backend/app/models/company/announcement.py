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


class AnnouncementModel(BaseModel):
    """Company announcement — company_db.hrm_announcements"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    title: str
    body: str
    announcement_type: AnnouncementType = AnnouncementType.GENERAL

    # Audience targeting (empty list = all employees)
    target_department_ids: List[str] = Field(default_factory=list)

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
    target_department_ids: Optional[List[str]] = None
    publish_at: Optional[datetime] = None
    expires_at: Optional[datetime] = None
    attachment_url: Optional[str] = None


class AnnouncementUpdate(BaseModel):
    title: Optional[str] = None
    body: Optional[str] = None
    announcement_type: Optional[AnnouncementType] = None
    target_department_ids: Optional[List[str]] = None
    expires_at: Optional[datetime] = None
    is_active: Optional[bool] = None
