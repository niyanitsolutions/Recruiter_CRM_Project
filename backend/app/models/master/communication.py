"""Master DB model for Super Admin Communication Center announcements."""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Optional
from pydantic import BaseModel, Field
import uuid


class AnnouncementType(str, Enum):
    marquee          = "marquee"           # scrolling ticker at top
    popup            = "popup"             # shown immediately after login
    dashboard_banner = "dashboard_banner"  # banner inside tenant dashboard
    release_notes    = "release_notes"     # version/release info
    maintenance_alert = "maintenance_alert" # downtime / maintenance


class AnnouncementPriority(str, Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


class DisplayLocation(str, Enum):
    login               = "login"
    dashboard           = "dashboard"
    top_marquee         = "top_marquee"
    notification_center = "notification_center"
    popup               = "popup"


class TargetAudienceType(str, Enum):
    all                = "all"
    trial              = "trial"
    active_subscriber  = "active_subscriber"
    expired            = "expired"
    enterprise         = "enterprise"
    professional       = "professional"
    starter            = "starter"
    specific           = "specific"   # specific tenant IDs


class TargetRoleType(str, Enum):
    owner     = "owner"
    admin     = "admin"
    hr        = "hr"
    recruiter = "recruiter"
    all       = "all"


class TargetAudience(BaseModel):
    type:        TargetAudienceType = TargetAudienceType.all
    tenant_ids:  list[str] = Field(default_factory=list)
    roles:       list[TargetRoleType] = Field(default_factory=lambda: [TargetRoleType.all])


class SuperAnnouncement(BaseModel):
    id:                str = Field(default_factory=lambda: str(uuid.uuid4()))
    title:             str
    description:       str = ""
    rich_text:         str = ""       # HTML/rich-text body
    image_url:         str = ""
    announcement_type: AnnouncementType
    display_locations: list[DisplayLocation] = Field(default_factory=list)
    target_audience:   TargetAudience = Field(default_factory=TargetAudience)
    priority:          AnnouncementPriority = AnnouncementPriority.medium
    cta_button_text:   str = ""
    cta_url:           str = ""
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    is_active:         bool = True
    created_at:        datetime = Field(default_factory=datetime.utcnow)
    updated_at:        datetime = Field(default_factory=datetime.utcnow)
    created_by:        str = ""

    model_config = {"use_enum_values": True}


class SuperAnnouncementCreate(BaseModel):
    title:             str
    description:       str = ""
    rich_text:         str = ""
    image_url:         str = ""
    announcement_type: AnnouncementType
    display_locations: list[DisplayLocation] = Field(default_factory=list)
    target_audience:   TargetAudience = Field(default_factory=TargetAudience)
    priority:          AnnouncementPriority = AnnouncementPriority.medium
    cta_button_text:   str = ""
    cta_url:           str = ""
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    is_active:         bool = True

    model_config = {"use_enum_values": True}


class SuperAnnouncementUpdate(BaseModel):
    title:             Optional[str] = None
    description:       Optional[str] = None
    rich_text:         Optional[str] = None
    image_url:         Optional[str] = None
    announcement_type: Optional[AnnouncementType] = None
    display_locations: Optional[list[DisplayLocation]] = None
    target_audience:   Optional[TargetAudience] = None
    priority:          Optional[AnnouncementPriority] = None
    cta_button_text:   Optional[str] = None
    cta_url:           Optional[str] = None
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    is_active:         Optional[bool] = None

    model_config = {"use_enum_values": True}
