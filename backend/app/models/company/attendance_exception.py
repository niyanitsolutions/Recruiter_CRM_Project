"""HRM — Attendance Exception Model"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
import uuid


class AttendanceException(BaseModel):
    """Temporary attendance access exception — company_db.hrm_attendance_exceptions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None

    reason: str
    from_datetime: datetime   # naive UTC
    to_datetime: datetime     # naive UTC

    allow_login: bool = True
    bypass_geo_fence: bool = False
    bypass_ip_restriction: bool = False

    created_by: str
    created_by_name: Optional[str] = None

    is_deleted: bool = False

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class AttendanceExceptionCreate(BaseModel):
    employee_id: str
    reason: str
    from_datetime: datetime
    to_datetime: datetime
    allow_login: bool = True
    bypass_geo_fence: bool = False
    bypass_ip_restriction: bool = False


class AttendanceExceptionUpdate(BaseModel):
    reason: Optional[str] = None
    from_datetime: Optional[datetime] = None
    to_datetime: Optional[datetime] = None
    allow_login: Optional[bool] = None
    bypass_geo_fence: Optional[bool] = None
    bypass_ip_restriction: Optional[bool] = None
