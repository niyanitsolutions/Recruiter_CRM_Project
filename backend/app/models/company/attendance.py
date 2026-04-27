"""HRM — Attendance Model"""
from datetime import datetime, date, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class AttendanceStatus(str, Enum):
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LATE = "late"          # Present but arrived late
    ON_LEAVE = "on_leave"
    HOLIDAY = "holiday"
    WEEKEND = "weekend"
    WORK_FROM_HOME = "wfh"


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

    # Computed
    work_hours: float = 0.0          # Hours worked
    is_late: bool = False            # Arrived after shift_start_time + grace_minutes
    late_by_minutes: int = 0
    overtime_hours: float = 0.0

    # Leave ref (if on_leave)
    leave_id: Optional[str] = None

    notes: Optional[str] = None
    marked_by: Optional[str] = None  # "self" | user_id of admin

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class CheckInRequest(BaseModel):
    employee_id: Optional[str] = None  # Admin marking for someone else; None = self
    notes: Optional[str] = None


class CheckOutRequest(BaseModel):
    employee_id: Optional[str] = None
    notes: Optional[str] = None


class ManualAttendanceUpdate(BaseModel):
    employee_id: str
    date: date
    status: AttendanceStatus
    check_in: Optional[datetime] = None
    check_out: Optional[datetime] = None
    notes: Optional[str] = None
