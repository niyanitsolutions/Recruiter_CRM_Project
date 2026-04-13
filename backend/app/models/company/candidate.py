"""
Candidate Model - Phase 3
Candidate profiles with AI resume parsing support
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field, EmailStr, field_validator
from enum import Enum
import re


class CandidateStatus(str, Enum):
    """Candidate global status — job-agnostic, person-level only"""
    ACTIVE = "active"
    BLACKLISTED = "blacklisted"


class CandidateSource(str, Enum):
    """How candidate was sourced"""
    DIRECT = "direct"           # Direct application
    PARTNER = "partner"         # Through partner
    REFERRAL = "referral"       # Employee referral
    JOB_PORTAL = "job_portal"   # Naukri, Indeed, etc.
    LINKEDIN = "linkedin"
    WALK_IN = "walk_in"
    CAMPUS = "campus"
    SOCIAL_MEDIA = "social_media"
    OTHER = "other"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class MaritalStatus(str, Enum):
    SINGLE = "single"
    MARRIED = "married"
    DIVORCED = "divorced"
    WIDOWED = "widowed"


class NoticePeriod(str, Enum):
    IMMEDIATE = "immediate"
    FIFTEEN_DAYS = "15_days"
    THIRTY_DAYS = "30_days"
    SIXTY_DAYS = "60_days"
    NINETY_DAYS = "90_days"
    MORE_THAN_90 = "more_than_90"


# ============== Sub-Models ==============

class SkillItem(BaseModel):
    """Skill with proficiency"""
    name: str
    proficiency: Optional[str] = None  # beginner, intermediate, advanced, expert
    years: Optional[float] = None


class EducationItem(BaseModel):
    """Education details"""
    degree: str
    field_of_study: Optional[str] = None
    institution: str
    university: Optional[str] = None
    from_year: Optional[int] = None        # Start year of study
    to_year: Optional[int] = None          # End / graduation year
    year_of_passing: Optional[int] = None  # Legacy alias for to_year
    percentage: Optional[float] = None
    grade: Optional[str] = None


class WorkExperienceItem(BaseModel):
    """Work experience details"""
    company_name: str
    designation: Optional[str] = None
    location: Optional[str] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None  # None = current
    is_current: bool = False
    responsibilities: Optional[str] = None
    reason_for_leaving: Optional[str] = None


class CertificationItem(BaseModel):
    """Certification details"""
    name: str
    issuing_organization: Optional[str] = None
    issue_date: Optional[date] = None
    expiry_date: Optional[date] = None
    credential_id: Optional[str] = None


class LanguageItem(BaseModel):
    """Language proficiency"""
    language: str
    proficiency: Optional[str] = None  # basic, conversational, fluent, native


class DocumentItem(BaseModel):
    """Document/attachment"""
    name: str
    file_url: str
    file_type: Optional[str] = None  # resume, photo, id_proof, certificate
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class CustomFieldValue(BaseModel):
    """Custom field value"""
    field_id: str
    field_name: str
    value: Any


# ============== Main Model ==============

class CandidateModel(BaseModel):
    """Candidate document model"""
    id: Optional[str] = Field(None, alias="_id")
    
    # ===== Basic Info =====
    first_name: str = Field(..., min_length=1, max_length=100)
    last_name: Optional[str] = Field(None, max_length=100)
    full_name: Optional[str] = None  # Auto-generated
    email: str = Field(..., max_length=255)
    mobile: str = Field(..., min_length=10, max_length=15)
    alternate_mobile: Optional[str] = None
    
    # ===== Personal Info =====
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    nationality: Optional[str] = Field(default="Indian")
    
    # ===== Address =====
    current_address: Optional[str] = None
    current_city: Optional[str] = None
    current_state: Optional[str] = None
    current_country: Optional[str] = Field(default="India")
    current_zip: Optional[str] = None
    permanent_address: Optional[str] = None
    permanent_city: Optional[str] = None
    permanent_state: Optional[str] = None
    permanent_country: Optional[str] = None
    
    # ===== Professional Info =====
    total_experience_years: Optional[float] = None
    total_experience_months: Optional[int] = None
    current_company: Optional[str] = None
    current_designation: Optional[str] = None
    current_ctc: Optional[float] = None  # In LPA or annual
    expected_ctc: Optional[float] = None
    ctc_currency: str = Field(default="INR")
    notice_period: Optional[str] = None
    available_from: Optional[date] = None
    
    # ===== Skills =====
    skills: List[SkillItem] = Field(default_factory=list)
    skill_tags: List[str] = Field(default_factory=list)  # For quick search
    
    # ===== Education =====
    education: List[EducationItem] = Field(default_factory=list)
    highest_qualification: Optional[str] = None
    
    # ===== Work Experience =====
    work_experience: List[WorkExperienceItem] = Field(default_factory=list)
    
    # ===== Certifications =====
    certifications: List[CertificationItem] = Field(default_factory=list)
    
    # ===== Languages =====
    languages: List[LanguageItem] = Field(default_factory=list)
    
    # ===== Documents =====
    documents: List[DocumentItem] = Field(default_factory=list)
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None
    
    # ===== AI Parsed Data =====
    resume_parsed: bool = Field(default=False)
    resume_parsed_at: Optional[datetime] = None
    parsed_data: Optional[Dict[str, Any]] = None  # Raw parsed JSON
    parse_confidence: Optional[float] = None  # 0-1 confidence score
    
    # ===== Source & Tracking =====
    source: str = Field(default=CandidateSource.DIRECT.value)
    source_details: Optional[str] = None  # e.g., "Naukri Job ID: 123"
    referred_by: Optional[str] = None  # User ID if referral
    partner_id: Optional[str] = None  # Partner user ID
    
    # ===== Global Status (person-level only) =====
    status: str = Field(default=CandidateStatus.ACTIVE.value)
    status_changed_at: Optional[datetime] = None
    status_changed_by: Optional[str] = None
    
    # ===== Assignment =====
    assigned_to: Optional[str] = None  # Coordinator user ID
    assigned_at: Optional[datetime] = None
    
    # ===== Current Application =====
    current_job_id: Optional[str] = None
    current_job_title: Optional[str] = None
    current_stage: Optional[str] = None
    
    # ===== Stats =====
    total_applications: int = Field(default=0)
    total_interviews: int = Field(default=0)
    
    # ===== Custom Fields =====
    custom_fields: List[CustomFieldValue] = Field(default_factory=list)
    
    # ===== Notes & Tags =====
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    
    # ===== Preferences =====
    preferred_locations: List[str] = Field(default_factory=list)
    willing_to_relocate: bool = Field(default=False)
    preferred_job_types: List[str] = Field(default_factory=list)  # full_time, contract, etc.
    
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

    def generate_full_name(self):
        """Generate full name from first and last name"""
        if self.last_name:
            return f"{self.first_name} {self.last_name}"
        return self.first_name


class CandidateCreate(BaseModel):
    """Schema for creating a candidate"""
    # Required
    first_name: str = Field(..., min_length=1, max_length=100)
    email: EmailStr
    mobile: str = Field(..., min_length=10, max_length=15)
    
    # Optional basic
    last_name: Optional[str] = None
    alternate_mobile: Optional[str] = None
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    
    # Address
    current_address: Optional[str] = None
    current_city: Optional[str] = None
    current_state: Optional[str] = None
    current_country: Optional[str] = Field(default="India")
    
    # Professional
    total_experience_years: Optional[float] = None
    total_experience_months: Optional[int] = None
    current_company: Optional[str] = None
    current_designation: Optional[str] = None
    current_ctc: Optional[float] = None
    expected_ctc: Optional[float] = None
    notice_period: Optional[str] = None

    # Skills & Education
    skills: List[SkillItem] = Field(default_factory=list)
    skill_tags: List[str] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    work_experience: List[WorkExperienceItem] = Field(default_factory=list)
    
    # Source
    source: Optional[str] = Field(default=CandidateSource.DIRECT.value)
    source_details: Optional[str] = None
    partner_id: Optional[str] = None
    
    # Documents
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None
    
    # Custom fields
    custom_fields: List[CustomFieldValue] = Field(default_factory=list)
    
    # Notes
    notes: Optional[str] = None
    tags: List[str] = Field(default_factory=list)
    
    # Preferences
    preferred_locations: List[str] = Field(default_factory=list)
    willing_to_relocate: bool = Field(default=False)

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned

    @field_validator('alternate_mobile')
    @classmethod
    def validate_alternate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Alternate mobile must start with 6–9 and be 10 digits')
        return cleaned


class CandidateUpdate(BaseModel):
    """Schema for updating a candidate"""
    first_name: Optional[str] = Field(None, min_length=1, max_length=100)
    last_name: Optional[str] = None
    email: Optional[EmailStr] = None
    mobile: Optional[str] = None
    alternate_mobile: Optional[str] = None
    
    date_of_birth: Optional[date] = None
    gender: Optional[str] = None
    marital_status: Optional[str] = None
    
    current_address: Optional[str] = None
    current_city: Optional[str] = None
    current_state: Optional[str] = None
    current_country: Optional[str] = None
    permanent_address: Optional[str] = None
    permanent_city: Optional[str] = None
    permanent_state: Optional[str] = None
    
    total_experience_years: Optional[float] = None
    total_experience_months: Optional[int] = None
    current_company: Optional[str] = None
    current_designation: Optional[str] = None
    current_ctc: Optional[float] = None
    expected_ctc: Optional[float] = None
    notice_period: Optional[str] = None
    available_from: Optional[date] = None
    
    skills: Optional[List[SkillItem]] = None
    skill_tags: Optional[List[str]] = None
    education: Optional[List[EducationItem]] = None
    work_experience: Optional[List[WorkExperienceItem]] = None
    certifications: Optional[List[CertificationItem]] = None
    languages: Optional[List[LanguageItem]] = None
    
    resume_url: Optional[str] = None
    photo_url: Optional[str] = None
    
    source: Optional[str] = None
    source_details: Optional[str] = None
    
    status: Optional[str] = None
    assigned_to: Optional[str] = None
    
    custom_fields: Optional[List[CustomFieldValue]] = None
    notes: Optional[str] = None
    tags: Optional[List[str]] = None
    
    preferred_locations: Optional[List[str]] = None
    willing_to_relocate: Optional[bool] = None

    @field_validator('mobile')
    @classmethod
    def validate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Mobile number must start with 6–9 and be 10 digits')
        return cleaned

    @field_validator('alternate_mobile')
    @classmethod
    def validate_alternate_mobile(cls, v):
        if not v:
            return v
        cleaned = re.sub(r'[^0-9]', '', v)
        if not re.match(r'^[6-9]\d{9}$', cleaned):
            raise ValueError('Alternate mobile must start with 6–9 and be 10 digits')
        return cleaned


class CandidateResponse(BaseModel):
    """Full candidate response"""
    id: str
    first_name: str
    last_name: Optional[str]
    full_name: Optional[str]
    email: str
    mobile: str
    alternate_mobile: Optional[str] = None

    date_of_birth: Optional[date]
    gender: Optional[str]
    current_city: Optional[str]
    current_state: Optional[str]

    total_experience_years: Optional[float]
    total_experience_months: Optional[int] = None
    current_company: Optional[str]
    current_designation: Optional[str]
    current_ctc: Optional[float]
    expected_ctc: Optional[float]
    notice_period: Optional[str]

    skills: List[SkillItem]
    skill_tags: List[str]
    education: List[EducationItem]
    work_experience: List[WorkExperienceItem]
    highest_qualification: Optional[str]
    percentage: Optional[float] = None

    preferred_locations: List[str] = Field(default_factory=list)
    willing_to_relocate: bool = False

    resume_url: Optional[str]
    photo_url: Optional[str]
    resume_parsed: bool

    linkedin_url: Optional[str] = None
    portfolio_url: Optional[str] = None
    notes: Optional[str] = None

    source: str
    partner_id: Optional[str]
    partner_name: Optional[str] = None
    status: str
    assigned_to: Optional[str]

    current_job_id: Optional[str]
    current_job_title: Optional[str]
    current_stage: Optional[str]

    total_applications: int
    total_interviews: int

    tags: List[str]
    created_at: datetime


class CandidateListResponse(BaseModel):
    """Simplified candidate for lists"""
    id: str
    full_name: str
    email: str
    mobile: str
    current_city: Optional[str]
    total_experience_years: Optional[float]
    current_company: Optional[str]
    current_designation: Optional[str]
    current_ctc: Optional[float]
    expected_ctc: Optional[float]
    notice_period: Optional[str]
    skill_tags: List[str]
    source: str
    status: str
    assigned_to: Optional[str]
    assigned_to_name: Optional[str] = None
    resume_url: Optional[str] = None
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    total_applications: int = 0
    current_job_title: Optional[str]
    current_stage: Optional[str]
    created_at: datetime


class CandidateSearchParams(BaseModel):
    """Search parameters for candidates"""
    keyword: Optional[str] = None  # Search in name, email, skills
    skills: Optional[List[str]] = None
    min_experience: Optional[float] = None
    max_experience: Optional[float] = None
    min_ctc: Optional[float] = None
    max_ctc: Optional[float] = None
    notice_period: Optional[List[str]] = None
    location: Optional[List[str]] = None
    status: Optional[List[str]] = None
    source: Optional[List[str]] = None
    assigned_to: Optional[str] = None
    partner_id: Optional[str] = None
    tags: Optional[List[str]] = None
    created_from: Optional[date] = None
    created_to: Optional[date] = None


class ResumeParseResult(BaseModel):
    """Result from AI resume parsing"""
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    email: Optional[str] = None
    mobile: Optional[str] = None
    
    total_experience_years: Optional[float] = None
    current_company: Optional[str] = None
    current_designation: Optional[str] = None
    
    skills: List[SkillItem] = Field(default_factory=list)
    education: List[EducationItem] = Field(default_factory=list)
    work_experience: List[WorkExperienceItem] = Field(default_factory=list)
    certifications: List[CertificationItem] = Field(default_factory=list)
    
    current_city: Optional[str] = None
    current_state: Optional[str] = None
    
    confidence_score: float = Field(default=0.0)
    raw_text: Optional[str] = None


# Display names — global (person-level) statuses only
CANDIDATE_STATUS_DISPLAY = {
    CandidateStatus.ACTIVE.value: "Active",
    CandidateStatus.BLACKLISTED.value: "Blacklisted",
}

CANDIDATE_SOURCE_DISPLAY = {
    CandidateSource.DIRECT.value: "Direct Application",
    CandidateSource.PARTNER.value: "Partner",
    CandidateSource.REFERRAL.value: "Employee Referral",
    CandidateSource.JOB_PORTAL.value: "Job Portal",
    CandidateSource.LINKEDIN.value: "LinkedIn",
    CandidateSource.WALK_IN.value: "Walk-in",
    CandidateSource.CAMPUS.value: "Campus",
    CandidateSource.SOCIAL_MEDIA.value: "Social Media",
    CandidateSource.OTHER.value: "Other"
}

NOTICE_PERIOD_DISPLAY = {
    NoticePeriod.IMMEDIATE.value: "Immediate",
    NoticePeriod.FIFTEEN_DAYS.value: "15 Days",
    NoticePeriod.THIRTY_DAYS.value: "30 Days",
    NoticePeriod.SIXTY_DAYS.value: "60 Days",
    NoticePeriod.NINETY_DAYS.value: "90 Days",
    NoticePeriod.MORE_THAN_90.value: "More than 90 Days"
}


def get_status_display(status: str) -> str:
    return CANDIDATE_STATUS_DISPLAY.get(status, status)


def get_source_display(source: str) -> str:
    return CANDIDATE_SOURCE_DISPLAY.get(source, source)


def get_notice_period_display(notice: str) -> str:
    return NOTICE_PERIOD_DISPLAY.get(notice, notice)