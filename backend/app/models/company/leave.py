"""HRM — Leave Model"""
from datetime import datetime, date, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class LeaveType(str, Enum):
    CASUAL = "casual"           # CL
    SICK = "sick"               # SL
    EARNED = "earned"           # EL / PL
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    COMPENSATORY = "compensatory"
    UNPAID = "unpaid"
    OTHER = "other"


class LeaveDuration(str, Enum):
    FULL_DAY = "full_day"
    HALF_DAY_MORNING = "half_day_morning"
    HALF_DAY_AFTERNOON = "half_day_afternoon"


class LeaveStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    WITHDRAWN = "withdrawn"


class LeaveApplication(BaseModel):
    """Leave application — company_db.hrm_leaves"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None

    leave_type: LeaveType
    duration: LeaveDuration = LeaveDuration.FULL_DAY
    from_date: date
    to_date: date
    total_days: float = 1.0
    reason: str
    status: LeaveStatus = LeaveStatus.PENDING

    # Approval chain
    approver_id: Optional[str] = None
    approver_name: Optional[str] = None
    approved_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None

    # Supporting document
    attachment_url: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class LeaveBalance(BaseModel):
    """Annual leave balance per employee — company_db.hrm_leave_balances"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    year: int

    casual_total: float = 12.0
    casual_used: float = 0.0
    casual_pending: float = 0.0

    sick_total: float = 12.0
    sick_used: float = 0.0
    sick_pending: float = 0.0

    earned_total: float = 15.0
    earned_used: float = 0.0
    earned_pending: float = 0.0

    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class LeaveApply(BaseModel):
    leave_type: LeaveType
    duration: LeaveDuration = LeaveDuration.FULL_DAY
    from_date: date
    to_date: date
    reason: str
    attachment_url: Optional[str] = None


class LeaveApproveReject(BaseModel):
    action: str                          # "approve" | "reject"
    rejection_reason: Optional[str] = None
