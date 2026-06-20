"""HRM — Work Mode Request Model"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class WorkModeRequestType(str, Enum):
    WFH = "wfh"
    HYBRID = "hybrid"
    FIELD = "field"


class WorkModeRequestStatus(str, Enum):
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"
    EXPIRED = "expired"


class WorkModeRequest(BaseModel):
    """Work mode change request — company_db.hrm_work_mode_requests"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    crm_user_id: Optional[str] = None

    work_mode: WorkModeRequestType
    from_date: str   # ISO date YYYY-MM-DD
    to_date: str     # ISO date YYYY-MM-DD
    reason: str

    status: WorkModeRequestStatus = WorkModeRequestStatus.PENDING

    approved_by: Optional[str] = None
    approved_by_name: Optional[str] = None
    approved_at: Optional[datetime] = None

    rejected_by: Optional[str] = None
    rejected_by_name: Optional[str] = None
    rejected_reason: Optional[str] = None
    rejected_at: Optional[datetime] = None

    cancelled_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class WorkModeRequestCreate(BaseModel):
    work_mode: WorkModeRequestType
    from_date: str   # YYYY-MM-DD
    to_date: str     # YYYY-MM-DD
    reason: str


class WorkModeRequestAction(BaseModel):
    reason: Optional[str] = None  # used for rejection reason
