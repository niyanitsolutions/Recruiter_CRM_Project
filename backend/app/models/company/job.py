"""
Job Model - Phase 3
Job postings with eligibility criteria and custom fields
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class JobStatus(str, Enum):
    """Job status options"""
    DRAFT = "draft"
    OPEN = "open"
    ON_HOLD = "on_hold"
    CLOSED = "closed"
    FILLED = "filled"
    CANCELLED = "cancelled"


class JobType(str, Enum):
    """Employment type"""
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERNSHIP = "internship"
    FREELANCE = "freelance"


class WorkMode(str, Enum):
    """Work mode"""
    ONSITE = "onsite"
    REMOTE = "remote"
    HYBRID = "hybrid"


class Priority(str, Enum):
    """Job priority"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    URGENT = "urgent"


# ============== Sub-Models ==============

class SalaryRange(BaseModel):
    """Salary range details"""
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    currency: str = Field(default="INR")
    is_negotiable: bool = Field(default=True)
    salary_type: str = Field(default="annual")  # annual, monthly, hourly


class ExperienceRange(BaseModel):
    """Experience requirement"""
    min_years: float = Field(default=0)
    max_years: Optional[float] = None


class SkillRequirement(BaseModel):
    """Required skill"""
    skill_name: str
    is_mandatory: bool = Field(default=True)
    min_years: Optional[float] = None


class EducationRequirement(BaseModel):
    """Education requirement"""
    degree: str
    field_of_study: Optional[str] = None
    is_mandatory: bool = Field(default=False)


class EligibilityCriteria(BaseModel):
    """Auto-matching criteria"""
    min_experience_years: Optional[float] = None
    max_experience_years: Optional[float] = None
    required_skills: List[str] = Field(default_factory=list)  # Any of these
    mandatory_skills: List[str] = Field(default_factory=list)  # All of these
    min_education_level: Optional[str] = None  # graduation, post_graduation, etc.
    preferred_locations: List[str] = Field(default_factory=list)
    max_notice_period_days: Optional[int] = None
    min_ctc: Optional[float] = None
    max_ctc: Optional[float] = None


class CustomFieldValue(BaseModel):
    """Custom field value"""
    field_id: str
    field_name: str
    value: Any


# ============== Main Model ==============

class JobModel(BaseModel):
    """Job document model"""
    id: Optional[str] = Field(None, alias="_id")
    
    # ===== Basic Info =====
    title: str = Field(..., min_length=2, max_length=200)
    job_code: Optional[str] = None  # Auto-generated or manual
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    
    # ===== Client =====
    client_id: str
    client_name: Optional[str] = None  # Denormalized for quick access
    
    # ===== Job Details =====
    job_type: str = Field(default=JobType.FULL_TIME.value)
    work_mode: str = Field(default=WorkMode.ONSITE.value)
    
    # ===== Location =====
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: str = Field(default="India")
    remote_allowed: bool = Field(default=False)
    
    # ===== Positions =====
    total_positions: int = Field(default=1, ge=1)
    filled_positions: int = Field(default=0, ge=0)
    
    # ===== Compensation =====
    salary: Optional[SalaryRange] = None
    benefits: Optional[str] = None
    
    # ===== Requirements =====
    experience: Optional[ExperienceRange] = None
    skills_required: List[SkillRequirement] = Field(default_factory=list)
    education_required: List[EducationRequirement] = Field(default_factory=list)
    
    # ===== Eligibility for Auto-Matching =====
    eligibility: Optional[EligibilityCriteria] = None
    auto_match_enabled: bool = Field(default=False)
    min_percentage: Optional[float] = Field(None, ge=0, le=100)  # Minimum academic %

    # ===== Pipeline =====
    pipeline_id: Optional[str] = None  # Attached interview pipeline
    
    # ===== Priority & Timeline =====
    priority: str = Field(default=Priority.MEDIUM.value)
    posted_date: Optional[date] = None
    target_date: Optional[date] = None  # Expected closure date
    closed_date: Optional[date] = None
    
    # ===== Assignment =====
    assigned_coordinators: List[str] = Field(default_factory=list)  # User IDs
    primary_coordinator: Optional[str] = None
    
    # ===== Stats (auto-updated) =====
    total_applications: int = Field(default=0)
    shortlisted_count: int = Field(default=0)
    interview_count: int = Field(default=0)
    offered_count: int = Field(default=0)
    rejected_count: int = Field(default=0)
    
    # ===== Status =====
    status: str = Field(default=JobStatus.DRAFT.value)
    status_changed_at: Optional[datetime] = None
    status_changed_by: Optional[str] = None
    closure_reason: Optional[str] = None
    
    # ===== Custom Fields =====
    custom_fields: List[CustomFieldValue] = Field(default_factory=list)
    
    # ===== Notes & Tags =====
    internal_notes: Optional[str] = None  # Not visible to partners
    tags: List[str] = Field(default_factory=list)
    
    # ===== Partner Access =====
    visible_to_partners: bool = Field(default=True)
    partner_commission: Optional[float] = None  # Override client commission
    
    # ===== Timestamps =====
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    # ===== Soft Delete =====
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class JobCreate(BaseModel):
    """Schema for creating a job"""
    title: str = Field(..., min_length=2, max_length=200)
    job_code: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    
    client_id: str
    
    job_type: Optional[str] = Field(default=JobType.FULL_TIME.value)
    work_mode: Optional[str] = Field(default=WorkMode.ONSITE.value)
    
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = Field(default="India")
    remote_allowed: bool = Field(default=False)
    
    total_positions: int = Field(default=1, ge=1)
    
    salary: Optional[SalaryRange] = None
    benefits: Optional[str] = None
    
    experience: Optional[ExperienceRange] = None
    skills_required: List[SkillRequirement] = Field(default_factory=list)
    education_required: List[EducationRequirement] = Field(default_factory=list)
    
    eligibility: Optional[EligibilityCriteria] = None
    auto_match_enabled: bool = Field(default=False)
    min_percentage: Optional[float] = Field(None, ge=0, le=100)
    pipeline_id: Optional[str] = None

    priority: Optional[str] = Field(default=Priority.MEDIUM.value)
    target_date: Optional[date] = None
    
    assigned_coordinators: List[str] = Field(default_factory=list)
    primary_coordinator: Optional[str] = None
    
    status: Optional[str] = Field(default=JobStatus.DRAFT.value)
    
    custom_fields: List[CustomFieldValue] = Field(default_factory=list)
    internal_notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    
    visible_to_partners: bool = Field(default=True)
    partner_commission: Optional[float] = None


class JobUpdate(BaseModel):
    """Schema for updating a job"""
    title: Optional[str] = Field(None, min_length=2, max_length=200)
    job_code: Optional[str] = None
    description: Optional[str] = None
    responsibilities: Optional[str] = None
    requirements: Optional[str] = None
    
    job_type: Optional[str] = None
    work_mode: Optional[str] = None
    
    location: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    remote_allowed: Optional[bool] = None
    
    total_positions: Optional[int] = Field(None, ge=1)
    
    salary: Optional[SalaryRange] = None
    benefits: Optional[str] = None
    
    experience: Optional[ExperienceRange] = None
    skills_required: Optional[List[SkillRequirement]] = None
    education_required: Optional[List[EducationRequirement]] = None
    
    eligibility: Optional[EligibilityCriteria] = None
    auto_match_enabled: Optional[bool] = None
    min_percentage: Optional[float] = Field(None, ge=0, le=100)
    pipeline_id: Optional[str] = None

    priority: Optional[str] = None
    target_date: Optional[date] = None
    
    assigned_coordinators: Optional[List[str]] = None
    primary_coordinator: Optional[str] = None
    
    status: Optional[str] = None
    closure_reason: Optional[str] = None
    
    custom_fields: Optional[List[CustomFieldValue]] = None
    internal_notes: Optional[str] = None
    tags: Optional[List[str]] = None
    
    visible_to_partners: Optional[bool] = None
    partner_commission: Optional[float] = None


class JobResponse(BaseModel):
    """Full job response"""
    id: str
    title: str
    job_code: Optional[str]
    description: Optional[str]
    responsibilities: Optional[str]
    requirements: Optional[str]
    
    client_id: str
    client_name: Optional[str]
    
    job_type: str
    job_type_display: str = ""
    work_mode: str
    work_mode_display: str = ""
    
    location: Optional[str]
    city: Optional[str]
    state: Optional[str]
    country: str
    remote_allowed: bool
    
    total_positions: int
    filled_positions: int
    remaining_positions: int = 0
    
    salary: Optional[SalaryRange]
    experience: Optional[ExperienceRange]
    skills_required: List[SkillRequirement]
    education_required: List[EducationRequirement]
    
    eligibility: Optional[EligibilityCriteria] = None
    auto_match_enabled: bool = False
    min_percentage: Optional[float] = None
    pipeline_id: Optional[str] = None

    priority: str
    priority_display: str = ""
    posted_date: Optional[date]
    target_date: Optional[date]
    
    assigned_coordinators: List[str]
    primary_coordinator: Optional[str]
    
    total_applications: int
    shortlisted_count: int
    interview_count: int
    offered_count: int
    
    status: str
    status_display: str = ""
    
    tags: List[str]
    visible_to_partners: bool
    partner_commission: Optional[float]
    
    created_at: datetime
    updated_at: Optional[datetime]


class JobListResponse(BaseModel):
    """Simplified job for lists"""
    id: str
    title: str
    job_code: Optional[str]
    client_name: Optional[str]
    
    job_type: str
    work_mode: str
    city: Optional[str]
    
    total_positions: int
    filled_positions: int
    
    salary_min: Optional[float] = None
    salary_max: Optional[float] = None
    
    experience_min: Optional[float] = None
    experience_max: Optional[float] = None
    
    priority: str
    target_date: Optional[date]
    
    total_applications: int
    shortlisted_count: int
    
    status: str
    status_display: str = ""
    
    created_at: datetime


class JobSearchParams(BaseModel):
    """Search parameters for jobs"""
    keyword: Optional[str] = None
    client_id: Optional[str] = None
    status: Optional[List[str]] = None
    job_type: Optional[List[str]] = None
    work_mode: Optional[List[str]] = None
    city: Optional[List[str]] = None
    priority: Optional[List[str]] = None
    assigned_to: Optional[str] = None
    min_salary: Optional[float] = None
    max_salary: Optional[float] = None
    skills: Optional[List[str]] = None
    posted_from: Optional[date] = None
    posted_to: Optional[date] = None
    target_from: Optional[date] = None
    target_to: Optional[date] = None
    tags: Optional[List[str]] = None
    visible_to_partners: Optional[bool] = None


# Display names
JOB_STATUS_DISPLAY = {
    JobStatus.DRAFT.value: "Draft",
    JobStatus.OPEN.value: "Open",
    JobStatus.ON_HOLD.value: "On Hold",
    JobStatus.CLOSED.value: "Closed",
    JobStatus.FILLED.value: "Filled",
    JobStatus.CANCELLED.value: "Cancelled"
}

JOB_TYPE_DISPLAY = {
    JobType.FULL_TIME.value: "Full Time",
    JobType.PART_TIME.value: "Part Time",
    JobType.CONTRACT.value: "Contract",
    JobType.INTERNSHIP.value: "Internship",
    JobType.FREELANCE.value: "Freelance"
}

WORK_MODE_DISPLAY = {
    WorkMode.ONSITE.value: "On-site",
    WorkMode.REMOTE.value: "Remote",
    WorkMode.HYBRID.value: "Hybrid"
}

PRIORITY_DISPLAY = {
    Priority.LOW.value: "Low",
    Priority.MEDIUM.value: "Medium",
    Priority.HIGH.value: "High",
    Priority.URGENT.value: "Urgent"
}


def get_job_status_display(status: str) -> str:
    return JOB_STATUS_DISPLAY.get(status, status)


def get_job_type_display(job_type: str) -> str:
    return JOB_TYPE_DISPLAY.get(job_type, job_type)


def get_work_mode_display(work_mode: str) -> str:
    return WORK_MODE_DISPLAY.get(work_mode, work_mode)


def get_priority_display(priority: str) -> str:
    return PRIORITY_DISPLAY.get(priority, priority)