"""HRM — Attendance Model"""
from datetime import datetime, date, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LATE = "late"
    ON_LEAVE = "on_leave"
    HOLIDAY = "holiday"
    WEEKEND = "weekend"
    WORK_FROM_HOME = "wfh"
    HYBRID = "hybrid"
    FIELD_WORK = "field_work"
    AUTO_CLOSED = "auto_closed"


class WorkMode(str, Enum):
    OFFICE = "office"
    WFH = "wfh"
    HYBRID = "hybrid"
    FIELD = "field"


class BreakRecord(BaseModel):
    start: datetime
    end: Optional[datetime] = None
    duration_minutes: Optional[float] = None
    reason: Optional[str] = None


class RecoverySession(BaseModel):
    recovered_at: datetime
    recovered_by: str          # user_id of the HR/admin who triggered recovery
    recovered_by_name: Optional[str] = None
    recovery_reason: str
    original_check_out: datetime     # the accidental punch-out time
    gap_start: datetime              # = original_check_out
    gap_end: datetime                # = recovered_at (when recovery happened)


class GeoLocation(BaseModel):
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    city: Optional[str] = None
    country: Optional[str] = None
    accuracy: Optional[float] = None  # meters


class AttendanceRecord(BaseModel):
    """Daily attendance record — company_db.hrm_attendance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    date: date
    status: AttendanceStatus = AttendanceStatus.ABSENT

    # Clock in/out
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None

    # Work mode
    work_mode: WorkMode = WorkMode.OFFICE

    # IP address capture
    check_in_ip: Optional[str] = None
    check_out_ip: Optional[str] = None

    # Geo-location capture
    check_in_geo: Optional[GeoLocation] = None
    check_out_geo: Optional[GeoLocation] = None

    # Breaks
    breaks: List[BreakRecord] = Field(default_factory=list)
    total_break_minutes: float = 0.0

    # Computed
    work_hours: float = 0.0       # Hours worked (excluding breaks)
    is_late: bool = False
    late_by_minutes: int = 0
    is_half_day: bool = False     # True when work_hours < half_day_threshold
    overtime_hours: float = 0.0
    auto_punched_out: bool = False  # True when auto-midnight punch-out ran

    # Leave ref (if on_leave)
    leave_id: Optional[str] = None

    # Recovery audit
    is_recovered: bool = False
    recovery_sessions: List[RecoverySession] = Field(default_factory=list)
    pre_recovery_work_hours: float = 0.0   # accumulated work_hours before recovery gaps

    notes: Optional[str] = None
    marked_by: Optional[str] = None  # "self" | user_id of admin

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class CheckInRequest(BaseModel):
    employee_id: Optional[str] = None  # Admin marking; None = self
    notes: Optional[str] = None
    work_mode: WorkMode = WorkMode.OFFICE
    # IP auto-captured server-side; can also be passed from client
    client_ip: Optional[str] = None
    # Geo from browser
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geo_city: Optional[str] = None
    geo_country: Optional[str] = None


class CheckOutRequest(BaseModel):
    employee_id: Optional[str] = None
    notes: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    geo_city: Optional[str] = None
    geo_country: Optional[str] = None


class BreakRequest(BaseModel):
    employee_id: Optional[str] = None
    reason: Optional[str] = None


class ManualAttendanceUpdate(BaseModel):
    employee_id: str
    date: date
    status: AttendanceStatus
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    notes: Optional[str] = None
    work_mode: Optional[WorkMode] = None


class RecoverAttendanceRequest(BaseModel):
    recovery_reason: str
