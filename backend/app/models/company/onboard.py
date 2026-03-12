"""
Onboard Model - Phase 4
Tracks candidate onboarding journey from offer to joining
"""
from datetime import datetime, date
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field, field_validator
from enum import Enum
import uuid


# ============== Enums ==============

class OnboardStatus(str, Enum):
    """Onboard status workflow"""
    OFFER_RELEASED = "offer_released"
    OFFER_ACCEPTED = "offer_accepted"
    OFFER_DECLINED = "offer_declined"
    DOJ_CONFIRMED = "doj_confirmed"
    DOJ_EXTENDED = "doj_extended"
    JOINED = "joined"
    NO_SHOW = "no_show"
    ABSCONDED = "absconded"
    TERMINATED = "terminated"
    COMPLETED = "completed"


class DocumentStatus(str, Enum):
    """Document verification status"""
    PENDING = "pending"
    SUBMITTED = "submitted"
    VERIFIED = "verified"
    REJECTED = "rejected"


# ============== Display Names ==============

ONBOARD_STATUS_DISPLAY = {
    OnboardStatus.OFFER_RELEASED: "Offer Released",
    OnboardStatus.OFFER_ACCEPTED: "Offer Accepted",
    OnboardStatus.OFFER_DECLINED: "Offer Declined",
    OnboardStatus.DOJ_CONFIRMED: "DOJ Confirmed",
    OnboardStatus.DOJ_EXTENDED: "DOJ Extended",
    OnboardStatus.JOINED: "Joined",
    OnboardStatus.NO_SHOW: "No Show",
    OnboardStatus.ABSCONDED: "Absconded",
    OnboardStatus.TERMINATED: "Terminated",
    OnboardStatus.COMPLETED: "Completed"
}

DOCUMENT_STATUS_DISPLAY = {
    DocumentStatus.PENDING: "Pending",
    DocumentStatus.SUBMITTED: "Submitted",
    DocumentStatus.VERIFIED: "Verified",
    DocumentStatus.REJECTED: "Rejected"
}


def get_onboard_status_display(status: OnboardStatus) -> str:
    return ONBOARD_STATUS_DISPLAY.get(status, status.value)


def get_document_status_display(status: DocumentStatus) -> str:
    return DOCUMENT_STATUS_DISPLAY.get(status, status.value)


# ============== Sub-Models ==============

class OnboardDocument(BaseModel):
    """Document required for onboarding"""
    document_type: str
    document_name: str
    document_url: Optional[str] = None
    status: DocumentStatus = DocumentStatus.PENDING
    submitted_at: Optional[datetime] = None
    verified_at: Optional[datetime] = None
    verified_by: Optional[str] = None
    rejection_reason: Optional[str] = None


class ReminderLog(BaseModel):
    """Log of reminders sent"""
    reminder_type: str
    sent_at: datetime
    sent_to: List[str]
    channel: str
    status: str


class StatusHistory(BaseModel):
    """Status change history"""
    from_status: Optional[str] = None
    to_status: str
    changed_at: datetime = Field(default_factory=datetime.utcnow)
    changed_by: str
    reason: Optional[str] = None
    notes: Optional[str] = None


# ============== Main Model ==============

class OnboardModel(BaseModel):
    """Main onboard model (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # References
    candidate_id: str
    application_id: str
    job_id: str
    client_id: str
    partner_id: Optional[str] = None
    
    # Offer Details
    offer_ctc: float
    offer_designation: str
    offer_location: str
    offer_released_date: date
    offer_valid_until: Optional[date] = None
    offer_letter_url: Optional[str] = None
    
    # Joining Details
    expected_doj: Optional[date] = None
    actual_doj: Optional[date] = None
    doj_extension_count: int = 0
    doj_extension_reasons: List[str] = []
    
    # Status
    status: OnboardStatus = OnboardStatus.OFFER_RELEASED
    
    # Day Counter
    days_at_client: int = 0
    payout_days_required: int = 45
    
    # Documents
    documents_required: List[str] = []
    documents: List[OnboardDocument] = []
    documents_verified: bool = False
    
    # Reminders
    reminder_day_10_sent: bool = False
    reminder_day_30_sent: bool = False
    reminder_payout_sent: bool = False
    reminder_logs: List[ReminderLog] = []
    
    # Payout
    payout_eligible: bool = False
    payout_eligibility_date: Optional[date] = None
    
    # Notes
    notes: Optional[str] = None
    hr_notes: Optional[str] = None
    
    # Status History
    status_history: List[StatusHistory] = []
    
    # Denormalized fields
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_mobile: Optional[str] = None
    job_title: Optional[str] = None
    client_name: Optional[str] = None
    partner_name: Optional[str] = None
    
    # Audit Fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class OnboardCreate(BaseModel):
    """Create onboard record"""
    candidate_id: str
    application_id: str
    job_id: str
    client_id: str
    partner_id: Optional[str] = None
    offer_ctc: float
    offer_designation: str
    offer_location: str
    offer_released_date: date
    offer_valid_until: Optional[date] = None
    offer_letter_url: Optional[str] = None
    expected_doj: Optional[date] = None
    payout_days_required: int = 45
    documents_required: List[str] = []
    notes: Optional[str] = None
    
    @field_validator('payout_days_required')
    @classmethod
    def validate_payout_days(cls, v):
        if v not in [45, 60, 90]:
            raise ValueError('Payout days must be 45, 60, or 90')
        return v


class OnboardUpdate(BaseModel):
    """Update onboard record"""
    offer_ctc: Optional[float] = None
    offer_designation: Optional[str] = None
    offer_location: Optional[str] = None
    offer_valid_until: Optional[date] = None
    offer_letter_url: Optional[str] = None
    expected_doj: Optional[date] = None
    actual_doj: Optional[date] = None
    payout_days_required: Optional[int] = None
    documents_required: Optional[List[str]] = None
    notes: Optional[str] = None
    hr_notes: Optional[str] = None


class OnboardStatusUpdate(BaseModel):
    """Update onboard status"""
    status: OnboardStatus
    reason: Optional[str] = None
    notes: Optional[str] = None
    actual_doj: Optional[date] = None


class DOJExtension(BaseModel):
    """Extend DOJ"""
    new_doj: date
    reason: str


class DocumentUpdate(BaseModel):
    """Update document status"""
    document_type: str
    document_url: Optional[str] = None
    status: DocumentStatus
    rejection_reason: Optional[str] = None


class OnboardResponse(BaseModel):
    """Onboard response model"""
    id: str
    company_id: str
    candidate_id: str
    application_id: str
    job_id: str
    client_id: str
    partner_id: Optional[str] = None
    offer_ctc: float
    offer_designation: str
    offer_location: str
    offer_released_date: date
    offer_valid_until: Optional[date] = None
    offer_letter_url: Optional[str] = None
    expected_doj: Optional[date] = None
    actual_doj: Optional[date] = None
    doj_extension_count: int = 0
    doj_extension_reasons: List[str] = []
    status: OnboardStatus
    status_display: Optional[str] = None
    days_at_client: int = 0
    payout_days_required: int = 45
    documents_required: List[str] = []
    documents: List[OnboardDocument] = []
    documents_verified: bool = False
    reminder_day_10_sent: bool = False
    reminder_day_30_sent: bool = False
    reminder_payout_sent: bool = False
    payout_eligible: bool = False
    payout_eligibility_date: Optional[date] = None
    notes: Optional[str] = None
    hr_notes: Optional[str] = None
    status_history: List[StatusHistory] = []
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_mobile: Optional[str] = None
    job_title: Optional[str] = None
    client_name: Optional[str] = None
    partner_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    created_by: str
    
    model_config = ConfigDict(from_attributes=True)


class OnboardListResponse(BaseModel):
    """List response with pagination"""
    items: List[OnboardResponse]
    total: int
    page: int
    page_size: int
    pages: int


class OnboardDashboardStats(BaseModel):
    """Dashboard statistics for onboarding"""
    total_offers: int = 0
    offers_accepted: int = 0
    offers_declined: int = 0
    doj_confirmed: int = 0
    joined_this_month: int = 0
    no_shows: int = 0
    payout_eligible: int = 0
    pending_documents: int = 0
    upcoming_doj: int = 0
# Alias for backward compatibility
OnboardInDB = OnboardModel
