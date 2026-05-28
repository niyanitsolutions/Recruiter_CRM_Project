"""HRM — Leave Policy Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class LeavePolicyType(str, Enum):
    SICK = "sick"
    CASUAL = "casual"
    EARNED = "earned"
    ANNUAL = "annual"
    MATERNITY = "maternity"
    PATERNITY = "paternity"
    MARRIAGE = "marriage"
    BEREAVEMENT = "bereavement"
    COMP_OFF = "comp_off"
    WFH = "wfh"
    CUSTOM = "custom"


class ApprovalLevel(str, Enum):
    NONE = "none"              # no approval needed
    MANAGER = "manager"        # reporting manager
    HR = "hr"                  # HR only
    MANAGER_THEN_HR = "manager_then_hr"  # manager first, then HR


class LeavePolicy(BaseModel):
    """Configurable leave type policy — company_db.hrm_leave_policies"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    leave_type: LeavePolicyType = LeavePolicyType.CASUAL
    name: str                  # "Sick Leave", "Casual Leave", etc.
    code: str                  # SL, CL, EL, AL, etc.
    color: str = "#3b82f6"     # UI badge color
    annual_allocation: float = 12.0
    carry_forward_allowed: bool = False
    max_carry_forward: Optional[float] = None     # days limit for carry-forward
    encashment_allowed: bool = False
    negative_balance_allowed: bool = False
    approval_level: ApprovalLevel = ApprovalLevel.MANAGER
    document_required: bool = False               # medical cert, etc.
    min_days: float = 0.5                         # minimum leave duration
    max_days: Optional[float] = None              # per-application max
    max_consecutive_days: Optional[float] = None  # max stretch of days
    gender_restriction: Optional[str] = None      # "male" | "female" | None
    applicable_departments: List[str] = Field(default_factory=list)   # empty = all
    applicable_designations: List[str] = Field(default_factory=list)  # empty = all
    probation_restriction: bool = False           # not allowed during probation
    notice_period_restriction: bool = False       # not allowed during notice period
    is_active: bool = True
    is_system_default: bool = False               # seeded default, cannot be deleted
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class LeavePolicyCreate(BaseModel):
    leave_type: LeavePolicyType = LeavePolicyType.CASUAL
    name: str
    code: str
    color: str = "#3b82f6"
    annual_allocation: float = 12.0
    carry_forward_allowed: bool = False
    max_carry_forward: Optional[float] = None
    encashment_allowed: bool = False
    negative_balance_allowed: bool = False
    approval_level: ApprovalLevel = ApprovalLevel.MANAGER
    document_required: bool = False
    min_days: float = 0.5
    max_days: Optional[float] = None
    max_consecutive_days: Optional[float] = None
    gender_restriction: Optional[str] = None
    applicable_departments: List[str] = Field(default_factory=list)
    applicable_designations: List[str] = Field(default_factory=list)
    probation_restriction: bool = False
    notice_period_restriction: bool = False


class LeavePolicyUpdate(BaseModel):
    name: Optional[str] = None
    code: Optional[str] = None
    color: Optional[str] = None
    annual_allocation: Optional[float] = None
    carry_forward_allowed: Optional[bool] = None
    max_carry_forward: Optional[float] = None
    encashment_allowed: Optional[bool] = None
    negative_balance_allowed: Optional[bool] = None
    approval_level: Optional[ApprovalLevel] = None
    document_required: Optional[bool] = None
    min_days: Optional[float] = None
    max_days: Optional[float] = None
    max_consecutive_days: Optional[float] = None
    gender_restriction: Optional[str] = None
    applicable_departments: Optional[List[str]] = None
    applicable_designations: Optional[List[str]] = None
    probation_restriction: Optional[bool] = None
    notice_period_restriction: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Default policies seeded on first company setup ──────────────────────────

DEFAULT_LEAVE_POLICIES = [
    {
        "leave_type": "sick",     "name": "Sick Leave",        "code": "SL",
        "annual_allocation": 12.0, "carry_forward_allowed": False,
        "document_required": True, "approval_level": "manager",
        "color": "#ef4444", "is_system_default": True,
    },
    {
        "leave_type": "casual",   "name": "Casual Leave",      "code": "CL",
        "annual_allocation": 12.0, "carry_forward_allowed": False,
        "approval_level": "manager", "color": "#f59e0b", "is_system_default": True,
    },
    {
        "leave_type": "earned",   "name": "Earned Leave",      "code": "EL",
        "annual_allocation": 18.0, "carry_forward_allowed": True, "max_carry_forward": 30.0,
        "encashment_allowed": True, "approval_level": "manager_then_hr",
        "color": "#10b981", "is_system_default": True,
    },
    {
        "leave_type": "maternity", "name": "Maternity Leave",  "code": "ML",
        "annual_allocation": 180.0, "carry_forward_allowed": False,
        "gender_restriction": "female", "approval_level": "hr",
        "color": "#ec4899", "is_system_default": True,
    },
    {
        "leave_type": "paternity", "name": "Paternity Leave",  "code": "PL",
        "annual_allocation": 15.0,  "carry_forward_allowed": False,
        "gender_restriction": "male", "approval_level": "hr",
        "color": "#3b82f6", "is_system_default": True,
    },
    {
        "leave_type": "marriage",  "name": "Marriage Leave",   "code": "MAL",
        "annual_allocation": 5.0,  "carry_forward_allowed": False,
        "approval_level": "hr", "color": "#8b5cf6", "is_system_default": True,
    },
    {
        "leave_type": "bereavement", "name": "Bereavement Leave", "code": "BL",
        "annual_allocation": 5.0,  "carry_forward_allowed": False,
        "approval_level": "manager", "color": "#6b7280", "is_system_default": True,
    },
    {
        "leave_type": "comp_off",  "name": "Compensatory Off",  "code": "CO",
        "annual_allocation": 0.0,  "carry_forward_allowed": True, "max_carry_forward": 5.0,
        "approval_level": "manager", "color": "#0ea5e9", "is_system_default": True,
    },
    {
        "leave_type": "wfh",       "name": "Work From Home",   "code": "WFH",
        "annual_allocation": 48.0, "carry_forward_allowed": False,
        "approval_level": "manager", "color": "#06b6d4", "is_system_default": True,
    },
]
