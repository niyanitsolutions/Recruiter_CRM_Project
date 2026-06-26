"""Master DB model for Super Admin Communication Center announcements.

Backward-compatible: existing documents still work because new fields
have defaults and old fields (type, tenant_ids, roles) are preserved.
"""
from __future__ import annotations
from datetime import datetime
from enum import Enum
from typing import Any, Optional
from pydantic import BaseModel, Field
import uuid


class AnnouncementType(str, Enum):
    marquee           = "marquee"
    popup             = "popup"
    dashboard_banner  = "dashboard_banner"
    release_notes     = "release_notes"
    maintenance_alert = "maintenance_alert"


class AnnouncementPriority(str, Enum):
    critical = "critical"
    high     = "high"
    medium   = "medium"
    low      = "low"


class AnnouncementStatus(str, Enum):
    draft     = "draft"
    published = "published"
    expired   = "expired"


class DisplayLocation(str, Enum):
    login               = "login"
    dashboard           = "dashboard"
    top_marquee         = "top_marquee"
    notification_center = "notification_center"
    popup               = "popup"


class CtaTarget(str, Enum):
    same_tab = "same_tab"
    new_tab  = "new_tab"


# ─── Target Audience ──────────────────────────────────────────────────────────

# Kept for backward compatibility
class TargetAudienceType(str, Enum):
    all                = "all"
    trial              = "trial"
    active_subscriber  = "active_subscriber"
    expired            = "expired"
    enterprise         = "enterprise"
    professional       = "professional"
    starter            = "starter"
    specific           = "specific"


class TargetRoleType(str, Enum):
    owner          = "owner"
    admin          = "admin"
    hr             = "hr"
    recruiter      = "recruiter"
    hiring_manager = "hiring_manager"
    interviewer    = "interviewer"
    employee       = "employee"
    all            = "all"


class AudienceGroup(str, Enum):
    everyone         = "everyone"
    tenant_based     = "tenant_based"
    user_based       = "user_based"
    department_based = "department_based"
    role_based       = "role_based"


class TargetAudience(BaseModel):
    # ── Legacy fields (backward compat) ──
    type:       str = "all"           # TargetAudienceType value
    tenant_ids: list[str] = Field(default_factory=list)
    roles:      list[str] = Field(default_factory=list)

    # ── Extended targeting ──
    audience_groups:    list[str] = Field(default_factory=lambda: ["everyone"])
    tenant_filter:      str = "all"   # same values as TargetAudienceType
    user_roles:         list[str] = Field(default_factory=list)   # owner/admin/hr/recruiter/...
    specific_user_ids:  list[str] = Field(default_factory=list)
    departments:        list[str] = Field(default_factory=list)
    role_slugs:         list[str] = Field(default_factory=list)   # role slugs in tenant


class AnnouncementAnalytics(BaseModel):
    views:         int = 0
    dismiss_count: int = 0
    cta_clicks:    int = 0


# ─── Main models ──────────────────────────────────────────────────────────────

class SuperAnnouncementCreate(BaseModel):
    title:             str
    description:       str = ""
    rich_text:         str = ""
    image_url:         str = ""      # backward compat URL field
    image_path:        str = ""      # uploaded image path
    announcement_type: AnnouncementType
    display_locations: list[DisplayLocation] = Field(default_factory=list)
    target_audience:   TargetAudience = Field(default_factory=TargetAudience)
    priority:          AnnouncementPriority = AnnouncementPriority.medium
    status:            AnnouncementStatus = AnnouncementStatus.published
    cta_button_text:   str = ""
    cta_url:           str = ""
    cta_target:        CtaTarget = CtaTarget.new_tab
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    never_expire:      bool = False
    timezone:          str = "UTC"
    is_active:         bool = True

    model_config = {"use_enum_values": True}


class SuperAnnouncementUpdate(BaseModel):
    title:             Optional[str] = None
    description:       Optional[str] = None
    rich_text:         Optional[str] = None
    image_url:         Optional[str] = None
    image_path:        Optional[str] = None
    announcement_type: Optional[AnnouncementType] = None
    display_locations: Optional[list[DisplayLocation]] = None
    target_audience:   Optional[TargetAudience] = None
    priority:          Optional[AnnouncementPriority] = None
    status:            Optional[AnnouncementStatus] = None
    cta_button_text:   Optional[str] = None
    cta_url:           Optional[str] = None
    cta_target:        Optional[CtaTarget] = None
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    never_expire:      Optional[bool] = None
    timezone:          Optional[str] = None
    is_active:         Optional[bool] = None

    model_config = {"use_enum_values": True}


class SuperAnnouncement(BaseModel):
    id:                str = Field(default_factory=lambda: str(uuid.uuid4()))
    title:             str
    description:       str = ""
    rich_text:         str = ""
    image_url:         str = ""
    image_path:        str = ""
    announcement_type: AnnouncementType
    display_locations: list[DisplayLocation] = Field(default_factory=list)
    target_audience:   TargetAudience = Field(default_factory=TargetAudience)
    priority:          AnnouncementPriority = AnnouncementPriority.medium
    status:            AnnouncementStatus = AnnouncementStatus.published
    cta_button_text:   str = ""
    cta_url:           str = ""
    cta_target:        CtaTarget = CtaTarget.new_tab
    start_date:        Optional[datetime] = None
    end_date:          Optional[datetime] = None
    never_expire:      bool = False
    timezone:          str = "UTC"
    is_active:         bool = True
    analytics:         AnnouncementAnalytics = Field(default_factory=AnnouncementAnalytics)
    created_at:        datetime = Field(default_factory=datetime.utcnow)
    updated_at:        datetime = Field(default_factory=datetime.utcnow)
    created_by:        str = ""

    model_config = {"use_enum_values": True}
