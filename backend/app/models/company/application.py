"""
Application Model - Phase 3
Candidate applications to jobs (Candidate-Job mapping)
"""
from datetime import datetime
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class ApplicationStatus(str, Enum):
    """Application status"""
    APPLIED = "applied"
    ELIGIBLE = "eligible"       # Passed auto-eligibility check
    SCREENING = "screening"
    SHORTLISTED = "shortlisted"
    INTERVIEW = "interview"
    NEXT_ROUND = "next_round"
    SELECTED = "selected"
    OFFERED = "offered"
    OFFER_ACCEPTED = "offer_accepted"
    OFFER_DECLINED = "offer_declined"
    JOINED = "joined"
    REJECTED = "rejected"
    WITHDRAWN = "withdrawn"
    ON_HOLD = "on_hold"


class RejectionReason(str, Enum):
    """Rejection reasons"""
    NOT_QUALIFIED = "not_qualified"
    OVERQUALIFIED = "overqualified"
    SALARY_MISMATCH = "salary_mismatch"
    NOTICE_PERIOD = "notice_period"
    LOCATION_ISSUE = "location_issue"
    FAILED_INTERVIEW = "failed_interview"
    BACKGROUND_CHECK = "background_check"
    OFFER_DECLINED = "offer_declined"
    NO_SHOW = "no_show"
    POSITION_CLOSED = "position_closed"
    DUPLICATE = "duplicate"
    OTHER = "other"


class StageHistory(BaseModel):
    """Stage change history"""
    from_stage: Optional[str] = None
    to_stage: str
    changed_by: str
    changed_by_name: Optional[str] = None
    changed_at: datetime = Field(default_factory=datetime.utcnow)
    remarks: Optional[str] = None


class ApplicationModel(BaseModel):
    """Application document model - tracks candidate's journey for a specific job"""
    id: Optional[str] = Field(None, alias="_id")
    
    # ===== References =====
    candidate_id: str
    candidate_name: Optional[str] = None  # Denormalized
    candidate_email: Optional[str] = None
    candidate_mobile: Optional[str] = None
    
    job_id: str
    job_title: Optional[str] = None  # Denormalized
    job_code: Optional[str] = None
    
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    
    # ===== Source =====
    applied_by: Optional[str] = None  # User who added (coordinator/partner)
    applied_by_name: Optional[str] = None
    source: Optional[str] = None  # direct, partner, referral
    partner_id: Optional[str] = None
    partner_name: Optional[str] = None
    
    # ===== Current Status =====
    status: str = Field(default=ApplicationStatus.APPLIED.value)
    current_stage: Optional[str] = None  # Interview stage ID
    current_stage_name: Optional[str] = None
    
    # ===== Stage History =====
    stage_history: List[StageHistory] = Field(default_factory=list)
    
    # ===== Interview Tracking =====
    total_interviews: int = Field(default=0)
    completed_interviews: int = Field(default=0)
    pending_interviews: int = Field(default=0)
    
    # ===== Offer Details =====
    offered_ctc: Optional[float] = None
    offered_ctc_currency: str = Field(default="INR")
    offered_designation: Optional[str] = None
    offered_location: Optional[str] = None
    offer_date: Optional[datetime] = None
    offer_valid_until: Optional[datetime] = None
    offer_letter_url: Optional[str] = None
    
    # ===== Joining Details =====
    expected_joining_date: Optional[datetime] = None
    actual_joining_date: Optional[datetime] = None
    
    # ===== Rejection =====
    rejection_reason: Optional[str] = None
    rejection_remarks: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejected_by: Optional[str] = None
    rejected_at_stage: Optional[str] = None
    
    # ===== Withdrawal =====
    withdrawal_reason: Optional[str] = None
    withdrawn_at: Optional[datetime] = None
    
    # ===== Assignment =====
    assigned_to: Optional[str] = None  # Coordinator handling this application
    assigned_to_name: Optional[str] = None
    
    # ===== Match Score =====
    eligibility_score: Optional[float] = None  # 0-100 match %
    eligibility_details: Optional[dict] = None
    
    # ===== Notes =====
    notes: Optional[str] = None
    internal_remarks: Optional[str] = None  # Not visible to partners
    
    # ===== Timestamps =====
    applied_at: datetime = Field(default_factory=datetime.utcnow)
    status_changed_at: Optional[datetime] = None
    
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    # ===== Soft Delete =====
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class ApplicationCreate(BaseModel):
    """Schema for creating an application"""
    candidate_id: str
    job_id: str

    source: Optional[str] = None
    partner_id: Optional[str] = None

    # Manual override: skip auto-eligibility and force-apply
    bypass_eligibility: bool = Field(default=False)

    notes: Optional[str] = None


class ApplicationUpdate(BaseModel):
    """Schema for updating an application"""
    status: Optional[str] = None
    current_stage: Optional[str] = None
    
    assigned_to: Optional[str] = None
    
    # Offer
    offered_ctc: Optional[float] = None
    offered_designation: Optional[str] = None
    offered_location: Optional[str] = None
    offer_date: Optional[datetime] = None
    offer_valid_until: Optional[datetime] = None
    offer_letter_url: Optional[str] = None
    
    # Joining
    expected_joining_date: Optional[datetime] = None
    actual_joining_date: Optional[datetime] = None
    
    # Rejection
    rejection_reason: Optional[str] = None
    rejection_remarks: Optional[str] = None
    
    notes: Optional[str] = None
    internal_remarks: Optional[str] = None


class ApplicationStatusUpdate(BaseModel):
    """Schema for updating application status"""
    status: str
    stage_id: Optional[str] = None
    remarks: Optional[str] = None
    
    # For rejection
    rejection_reason: Optional[str] = None
    
    # For offer
    offered_ctc: Optional[float] = None
    offered_designation: Optional[str] = None
    
    # For joining
    expected_joining_date: Optional[datetime] = None
    actual_joining_date: Optional[datetime] = None


class ApplicationResponse(BaseModel):
    """Full application response"""
    id: str
    
    candidate_id: str
    candidate_name: Optional[str]
    candidate_email: Optional[str]
    candidate_mobile: Optional[str]
    
    job_id: str
    job_title: Optional[str]
    job_code: Optional[str]
    client_name: Optional[str]
    
    source: Optional[str]
    partner_name: Optional[str]
    
    status: str
    status_display: str = ""
    current_stage: Optional[str]
    current_stage_name: Optional[str]
    
    stage_history: List[StageHistory]
    
    total_interviews: int
    completed_interviews: int
    pending_interviews: int
    
    offered_ctc: Optional[float]
    offer_date: Optional[datetime]
    expected_joining_date: Optional[datetime]
    actual_joining_date: Optional[datetime]
    
    rejection_reason: Optional[str]
    rejection_remarks: Optional[str]
    
    assigned_to: Optional[str]
    assigned_to_name: Optional[str]
    
    eligibility_score: Optional[float]
    
    applied_at: datetime
    status_changed_at: Optional[datetime] = None


class ApplicationListResponse(BaseModel):
    """Simplified application for lists"""
    id: str

    candidate_id: str
    candidate_name: Optional[str]
    candidate_email: Optional[str]

    job_id: str
    job_title: Optional[str]
    client_name: Optional[str]

    source: Optional[str]
    partner_name: Optional[str]

    status: str
    status_display: str = ""
    current_stage_name: Optional[str]

    total_interviews: int

    eligibility_score: Optional[float]

    assigned_to_name: Optional[str]

    applied_at: datetime
    status_changed_at: Optional[datetime] = None


# Display names
APPLICATION_STATUS_DISPLAY = {
    ApplicationStatus.APPLIED.value: "Applied",
    ApplicationStatus.ELIGIBLE.value: "Eligible",
    ApplicationStatus.SCREENING.value: "Screening",
    ApplicationStatus.SHORTLISTED.value: "Shortlisted",
    ApplicationStatus.INTERVIEW.value: "In Interview",
    ApplicationStatus.NEXT_ROUND.value: "Next Round",
    ApplicationStatus.SELECTED.value: "Selected",
    ApplicationStatus.OFFERED.value: "Offered",
    ApplicationStatus.OFFER_ACCEPTED.value: "Offer Accepted",
    ApplicationStatus.OFFER_DECLINED.value: "Offer Declined",
    ApplicationStatus.JOINED.value: "Joined",
    ApplicationStatus.REJECTED.value: "Rejected",
    ApplicationStatus.WITHDRAWN.value: "Withdrawn",
    ApplicationStatus.ON_HOLD.value: "On Hold"
}

REJECTION_REASON_DISPLAY = {
    RejectionReason.NOT_QUALIFIED.value: "Not Qualified",
    RejectionReason.OVERQUALIFIED.value: "Overqualified",
    RejectionReason.SALARY_MISMATCH.value: "Salary Mismatch",
    RejectionReason.NOTICE_PERIOD.value: "Notice Period Issue",
    RejectionReason.LOCATION_ISSUE.value: "Location Issue",
    RejectionReason.FAILED_INTERVIEW.value: "Failed Interview",
    RejectionReason.BACKGROUND_CHECK.value: "Background Check Failed",
    RejectionReason.OFFER_DECLINED.value: "Offer Declined",
    RejectionReason.NO_SHOW.value: "No Show",
    RejectionReason.POSITION_CLOSED.value: "Position Closed",
    RejectionReason.DUPLICATE.value: "Duplicate Application",
    RejectionReason.OTHER.value: "Other"
}


def get_application_status_display(status: str) -> str:
    return APPLICATION_STATUS_DISPLAY.get(status, status)


def get_rejection_reason_display(reason: str) -> str:
    return REJECTION_REASON_DISPLAY.get(reason, reason)