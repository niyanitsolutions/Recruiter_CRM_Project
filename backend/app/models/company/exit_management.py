"""HRM — Exit Management Model"""
from datetime import datetime, date, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class ExitStatus(str, Enum):
    DRAFT      = "draft"
    SUBMITTED  = "submitted"
    IN_NOTICE  = "in_notice"
    CLEARED    = "cleared"
    COMPLETED  = "completed"
    CANCELLED  = "cancelled"


class ExitType(str, Enum):
    RESIGNATION  = "resignation"
    TERMINATION  = "termination"
    RETIREMENT   = "retirement"
    CONTRACT_END = "contract_end"
    ABSCONDING   = "absconding"


class ExitChecklistItem(BaseModel):
    item: str
    completed: bool = False
    completed_by: Optional[str] = None
    completed_at: Optional[datetime] = None


class ExitModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    employee_id: str
    employee_name: str
    employee_code: Optional[str] = None
    department_name: Optional[str] = None
    designation_name: Optional[str] = None

    exit_type: ExitType = ExitType.RESIGNATION
    status: ExitStatus = ExitStatus.DRAFT

    resignation_date: date
    last_working_date: Optional[date] = None
    notice_period_days: int = 30
    reason: str
    detailed_reason: Optional[str] = None

    # Manager acknowledgment
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    manager_acknowledged_at: Optional[datetime] = None
    manager_notes: Optional[str] = None

    # Clearance checklist
    checklist: List[ExitChecklistItem] = Field(default_factory=list)

    # Asset return reference
    assets_returned: bool = False
    assets_notes: Optional[str] = None

    # Full and final settlement
    settlement_amount: Optional[float] = None
    settlement_date: Optional[date] = None
    settlement_notes: Optional[str] = None

    # Exit interview
    exit_interview_done: bool = False
    exit_interview_notes: Optional[str] = None

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class ExitCreate(BaseModel):
    employee_id: str
    exit_type: ExitType = ExitType.RESIGNATION
    resignation_date: date
    notice_period_days: int = 30
    reason: str
    detailed_reason: Optional[str] = None
    manager_id: Optional[str] = None


class ExitUpdate(BaseModel):
    exit_type: Optional[ExitType] = None
    last_working_date: Optional[date] = None
    notice_period_days: Optional[int] = None
    reason: Optional[str] = None
    detailed_reason: Optional[str] = None
    manager_id: Optional[str] = None
    manager_notes: Optional[str] = None
    assets_returned: Optional[bool] = None
    assets_notes: Optional[str] = None
    settlement_amount: Optional[float] = None
    settlement_date: Optional[date] = None
    settlement_notes: Optional[str] = None
    exit_interview_done: Optional[bool] = None
    exit_interview_notes: Optional[str] = None


class ExitStatusUpdate(BaseModel):
    status: ExitStatus
    notes: Optional[str] = None
