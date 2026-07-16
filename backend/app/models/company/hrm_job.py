"""HRM — Internal Job Opening (Hiring Pipeline)"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class HRMJobStatus(str, Enum):
    OPEN = "open"
    ON_HOLD = "on_hold"
    CLOSED = "closed"
    CANCELLED = "cancelled"


class HRMJobModel(BaseModel):
    """Internal job opening for HRM hiring — company_db.hrm_jobs"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    job_title: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    num_positions: int = 1
    status: HRMJobStatus = HRMJobStatus.OPEN

    hiring_manager_id: Optional[str] = None
    hiring_manager_name: Optional[str] = None

    job_description: Optional[str] = None
    required_skills: List[str] = Field(default_factory=list)
    min_experience_years: Optional[float] = None
    max_experience_years: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    location: Optional[str] = None
    is_remote: bool = False

    target_date: Optional[str] = None   # ISO date string

    # Public apply link — lazily generated on first request (get-or-create),
    # None for jobs that never had a link requested. See hrm_hiring_service.py
    # get_or_create_job_public_slug().
    public_slug: Optional[str] = None

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class HRMJobCreate(BaseModel):
    job_title: str
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    num_positions: int = 1
    hiring_manager_id: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    job_description: Optional[str] = None
    required_skills: Optional[List[str]] = None
    min_experience_years: Optional[float] = None
    max_experience_years: Optional[float] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    location: Optional[str] = None
    is_remote: bool = False
    target_date: Optional[str] = None


class HRMJobUpdate(BaseModel):
    job_title: Optional[str] = None
    status: Optional[HRMJobStatus] = None
    num_positions: Optional[int] = None
    hiring_manager_id: Optional[str] = None
    hiring_manager_name: Optional[str] = None
    job_description: Optional[str] = None
    required_skills: Optional[List[str]] = None
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    target_date: Optional[str] = None
