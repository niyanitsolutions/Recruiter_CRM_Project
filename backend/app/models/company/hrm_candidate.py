"""HRM — Internal Hiring Candidate"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from enum import Enum
import uuid


class HiringStage(str, Enum):
    APPLIED = "applied"
    SCREENING = "screening"
    INTERVIEW = "interview"
    OFFER = "offer"
    ONBOARDING = "onboarding"
    HIRED = "hired"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"


class HRMCandidateSource(str, Enum):
    DIRECT = "direct"
    REFERRAL = "referral"
    JOB_PORTAL = "job_portal"
    LINKEDIN = "linkedin"
    CAMPUS = "campus"
    AGENCY = "agency"
    PUBLIC_LINK = "public_link"   # Self-applied via the job's public apply form
    OTHER = "other"


class HRMCandidateModel(BaseModel):
    """Candidate in the HRM hiring pipeline — company_db.hrm_candidates"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    job_id: Optional[str] = None    # Linked HRM job opening
    job_title: Optional[str] = None

    full_name: str
    email: EmailStr
    phone: str
    current_designation: Optional[str] = None
    current_company: Optional[str] = None
    total_experience_years: Optional[float] = None
    skills: List[str] = Field(default_factory=list)
    source: HRMCandidateSource = HRMCandidateSource.DIRECT
    referral_by: Optional[str] = None
    resume_url: Optional[str] = None

    current_stage: HiringStage = HiringStage.APPLIED
    stage_history: List[dict] = Field(default_factory=list)

    expected_salary: Optional[float] = None
    notice_period_days: Optional[int] = None
    location: Optional[str] = None

    notes: Optional[str] = None

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class HRMCandidateCreate(BaseModel):
    job_id: Optional[str] = None
    job_title: Optional[str] = None
    full_name: str
    email: EmailStr
    phone: str
    current_designation: Optional[str] = None
    current_company: Optional[str] = None
    total_experience_years: Optional[float] = None
    skills: Optional[List[str]] = None
    source: HRMCandidateSource = HRMCandidateSource.DIRECT
    referral_by: Optional[str] = None
    resume_url: Optional[str] = None
    expected_salary: Optional[float] = None
    notice_period_days: Optional[int] = None
    location: Optional[str] = None
    notes: Optional[str] = None


class HRMCandidateUpdate(BaseModel):
    current_stage: Optional[HiringStage] = None
    current_designation: Optional[str] = None
    expected_salary: Optional[float] = None
    notes: Optional[str] = None
    resume_url: Optional[str] = None
    skills: Optional[List[str]] = None
