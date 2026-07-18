"""HRM — Company Calendar Event (additive; new collection hrm_calendar_events).

Separate from Holidays and Leave — a new, self-contained event type surfaced in
the same aggregated calendar. Nothing in the existing holiday/leave flow changes.
"""
from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
import uuid

from pydantic import BaseModel, Field, ConfigDict


class EventVisibility(str, Enum):
    ONLY_ME = "only_me"
    SELECTED_EMPLOYEES = "selected_employees"
    SELECTED_DEPARTMENTS = "selected_departments"
    SELECTED_DESIGNATIONS = "selected_designations"
    EVERYONE = "everyone"


class EventRepeat(str, Enum):
    NONE = "none"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    YEARLY = "yearly"


class CompanyEventModel(BaseModel):
    """A company calendar event — company_db.hrm_calendar_events"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    event_name: str
    description: Optional[str] = None
    start_date: str                         # YYYY-MM-DD
    end_date: str                           # YYYY-MM-DD (>= start_date)
    all_day: bool = True
    start_time: Optional[str] = None        # HH:MM (when not all-day)
    end_time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    color: str = "#6366f1"
    repeat: EventRepeat = EventRepeat.NONE

    visibility: EventVisibility = EventVisibility.EVERYONE
    visible_employee_ids: List[str] = Field(default_factory=list)
    visible_department_ids: List[str] = Field(default_factory=list)
    visible_designation_ids: List[str] = Field(default_factory=list)

    created_by: str = ""                    # CRM user id
    created_by_name: Optional[str] = None
    created_by_role: Optional[str] = None
    created_by_employee_id: Optional[str] = None   # creator's HRM employee id (for only_me / manager scope)

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class CompanyEventCreate(BaseModel):
    event_name: str
    description: Optional[str] = None
    start_date: str
    end_date: str
    all_day: bool = True
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    color: str = "#6366f1"
    repeat: EventRepeat = EventRepeat.NONE
    visibility: EventVisibility = EventVisibility.EVERYONE
    visible_employee_ids: List[str] = Field(default_factory=list)
    visible_department_ids: List[str] = Field(default_factory=list)
    visible_designation_ids: List[str] = Field(default_factory=list)


class CompanyEventUpdate(BaseModel):
    event_name: Optional[str] = None
    description: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    all_day: Optional[bool] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    location: Optional[str] = None
    meeting_link: Optional[str] = None
    color: Optional[str] = None
    repeat: Optional[EventRepeat] = None
    visibility: Optional[EventVisibility] = None
    visible_employee_ids: Optional[List[str]] = None
    visible_department_ids: Optional[List[str]] = None
    visible_designation_ids: Optional[List[str]] = None
