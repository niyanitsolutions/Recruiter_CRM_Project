"""
Interview Model - Phase 3
Interview scheduling, tracking, and feedback
"""
from datetime import datetime, date, time
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class InterviewStatus(str, Enum):
    """Interview status"""
    SCHEDULED = "scheduled"
    CONFIRMED = "confirmed"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"
    RESCHEDULED = "rescheduled"
    NO_SHOW = "no_show"


class InterviewMode(str, Enum):
    """Interview mode"""
    IN_PERSON = "in_person"
    PHONE = "phone"
    VIDEO = "video"


class InterviewResult(str, Enum):
    """Interview result"""
    PASSED = "passed"
    FAILED = "failed"
    ON_HOLD = "on_hold"
    PENDING = "pending"


class FeedbackRating(str, Enum):
    """Rating scale"""
    POOR = "1"
    BELOW_AVERAGE = "2"
    AVERAGE = "3"
    GOOD = "4"
    EXCELLENT = "5"


# ============== Sub-Models ==============

class SkillRating(BaseModel):
    """Skill-wise rating"""
    skill_name: str
    rating: int = Field(ge=1, le=5)
    remarks: Optional[str] = None


class InterviewFeedback(BaseModel):
    """Interview feedback details"""
    overall_rating: int = Field(ge=1, le=5)
    
    # Category ratings
    technical_skills: Optional[int] = Field(None, ge=1, le=5)
    communication: Optional[int] = Field(None, ge=1, le=5)
    problem_solving: Optional[int] = Field(None, ge=1, le=5)
    cultural_fit: Optional[int] = Field(None, ge=1, le=5)
    experience_relevance: Optional[int] = Field(None, ge=1, le=5)
    
    # Skill-wise ratings
    skill_ratings: List[SkillRating] = Field(default_factory=list)
    
    # Decision
    result: str = Field(default=InterviewResult.PENDING.value)
    recommendation: Optional[str] = None  # hire, reject, next_round, hold
    
    # Comments
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    remarks: Optional[str] = None
    
    # Feedback by
    feedback_by: Optional[str] = None
    feedback_by_name: Optional[str] = None
    feedback_at: datetime = Field(default_factory=datetime.utcnow)


class RescheduleHistory(BaseModel):
    """Reschedule history"""
    from_date: datetime
    to_date: datetime
    reason: Optional[str] = None
    rescheduled_by: str
    rescheduled_at: datetime = Field(default_factory=datetime.utcnow)


# ============== Main Model ==============

class InterviewModel(BaseModel):
    """Interview document model"""
    id: Optional[str] = Field(None, alias="_id")
    
    # ===== References =====
    application_id: str
    candidate_id: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    candidate_mobile: Optional[str] = None
    
    job_id: str
    job_title: Optional[str] = None
    
    client_id: Optional[str] = None
    client_name: Optional[str] = None
    
    # ===== Stage Info =====
    stage_id: str
    stage_name: str
    stage_order: int = Field(default=1)
    
    # ===== Schedule =====
    scheduled_date: date
    scheduled_time: Optional[str] = None  # "10:00 AM"
    scheduled_datetime: Optional[datetime] = None  # Combined
    duration_minutes: int = Field(default=60)
    end_time: Optional[str] = None
    
    # ===== Mode & Location =====
    interview_mode: str = Field(default=InterviewMode.VIDEO.value)
    
    # For in-person
    venue: Optional[str] = None
    address: Optional[str] = None
    
    # For video/phone
    meeting_link: Optional[str] = None
    meeting_id: Optional[str] = None
    meeting_password: Optional[str] = None
    dial_in_number: Optional[str] = None
    
    # ===== Interviewers =====
    interviewer_ids: List[str] = Field(default_factory=list)
    interviewer_names: List[str] = Field(default_factory=list)
    primary_interviewer: Optional[str] = None
    panel_size: int = Field(default=1)
    
    # ===== Status =====
    status: str = Field(default=InterviewStatus.SCHEDULED.value)
    result: str = Field(default=InterviewResult.PENDING.value)
    
    # ===== Feedback =====
    feedback: Optional[InterviewFeedback] = None
    feedback_submitted: bool = Field(default=False)
    feedback_due_date: Optional[datetime] = None
    
    # ===== Notifications =====
    candidate_notified: bool = Field(default=False)
    candidate_notified_at: Optional[datetime] = None
    interviewer_notified: bool = Field(default=False)
    interviewer_notified_at: Optional[datetime] = None
    reminder_sent: bool = Field(default=False)
    
    # ===== Reschedule =====
    is_rescheduled: bool = Field(default=False)
    reschedule_count: int = Field(default=0)
    reschedule_history: List[RescheduleHistory] = Field(default_factory=list)
    
    # ===== Cancellation =====
    cancellation_reason: Optional[str] = None
    cancelled_by: Optional[str] = None
    cancelled_at: Optional[datetime] = None
    
    # ===== Notes =====
    instructions: Optional[str] = None  # For candidate
    internal_notes: Optional[str] = None  # For coordinators
    
    # ===== Coordinator =====
    scheduled_by: Optional[str] = None
    scheduled_by_name: Optional[str] = None
    
    # ===== Timestamps =====
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    
    # ===== Soft Delete =====
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class InterviewCreate(BaseModel):
    """Schema for scheduling an interview.
    Either application_id OR (candidate_id + job_id) must be provided.
    """
    # Application-based path (traditional)
    application_id: Optional[str] = None

    # Direct candidate+job path (from matching_results, no application required)
    candidate_id: Optional[str] = None
    job_id: Optional[str] = None

    stage_id: str
    
    scheduled_date: date
    scheduled_time: str  # "10:00 AM"
    duration_minutes: int = Field(default=60)
    
    interview_mode: str = Field(default=InterviewMode.VIDEO.value)
    
    # Location/Meeting details
    venue: Optional[str] = None
    address: Optional[str] = None
    meeting_link: Optional[str] = None
    dial_in_number: Optional[str] = None
    
    interviewer_ids: List[str] = Field(default_factory=list)
    primary_interviewer: Optional[str] = None
    
    instructions: Optional[str] = None
    internal_notes: Optional[str] = None
    
    send_notification: bool = Field(default=True)


class InterviewUpdate(BaseModel):
    """Schema for updating an interview"""
    scheduled_date: Optional[date] = None
    scheduled_time: Optional[str] = None
    duration_minutes: Optional[int] = None
    
    interview_mode: Optional[str] = None
    
    venue: Optional[str] = None
    address: Optional[str] = None
    meeting_link: Optional[str] = None
    dial_in_number: Optional[str] = None
    
    interviewer_ids: Optional[List[str]] = None
    primary_interviewer: Optional[str] = None
    
    status: Optional[str] = None
    
    instructions: Optional[str] = None
    internal_notes: Optional[str] = None


class InterviewReschedule(BaseModel):
    """Schema for rescheduling"""
    new_date: date
    new_time: str
    reason: Optional[str] = None
    send_notification: bool = Field(default=True)


class InterviewFeedbackSubmit(BaseModel):
    """Schema for submitting feedback"""
    overall_rating: int = Field(ge=1, le=5)
    
    technical_skills: Optional[int] = Field(None, ge=1, le=5)
    communication: Optional[int] = Field(None, ge=1, le=5)
    problem_solving: Optional[int] = Field(None, ge=1, le=5)
    cultural_fit: Optional[int] = Field(None, ge=1, le=5)
    experience_relevance: Optional[int] = Field(None, ge=1, le=5)
    
    skill_ratings: List[SkillRating] = Field(default_factory=list)
    
    result: str
    recommendation: Optional[str] = None
    
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    remarks: Optional[str] = None


class InterviewResponse(BaseModel):
    """Full interview response"""
    id: str

    application_id: Optional[str] = None
    candidate_id: str
    candidate_name: Optional[str]
    candidate_email: Optional[str]
    candidate_mobile: Optional[str]

    job_id: str
    job_title: Optional[str]
    client_name: Optional[str]

    stage_id: str
    stage_name: Optional[str] = None
    stage_order: int
    
    scheduled_date: date
    scheduled_time: Optional[str]
    duration_minutes: int
    
    interview_mode: str
    interview_mode_display: str = ""
    
    venue: Optional[str]
    meeting_link: Optional[str]
    
    interviewer_names: List[str]
    primary_interviewer: Optional[str]
    
    status: str
    status_display: str = ""
    result: str
    result_display: str = ""
    
    feedback: Optional[InterviewFeedback]
    feedback_submitted: bool
    
    is_rescheduled: bool
    reschedule_count: int
    
    instructions: Optional[str]
    
    created_at: datetime


class InterviewListResponse(BaseModel):
    """Simplified interview for lists"""
    id: str

    candidate_name: Optional[str] = None
    job_title: Optional[str] = None
    client_name: Optional[str] = None

    stage_name: Optional[str] = None
    
    scheduled_date: date
    scheduled_time: Optional[str]
    
    interview_mode: str
    interviewer_names: List[str]
    
    status: str
    status_display: str = ""
    result: str
    
    feedback_submitted: bool
    is_rescheduled: bool


# Display names
INTERVIEW_STATUS_DISPLAY = {
    InterviewStatus.SCHEDULED.value: "Scheduled",
    InterviewStatus.CONFIRMED.value: "Confirmed",
    InterviewStatus.IN_PROGRESS.value: "In Progress",
    InterviewStatus.COMPLETED.value: "Completed",
    InterviewStatus.CANCELLED.value: "Cancelled",
    InterviewStatus.RESCHEDULED.value: "Rescheduled",
    InterviewStatus.NO_SHOW.value: "No Show"
}

INTERVIEW_MODE_DISPLAY = {
    InterviewMode.IN_PERSON.value: "In-Person",
    InterviewMode.PHONE.value: "Phone",
    InterviewMode.VIDEO.value: "Video Call"
}

INTERVIEW_RESULT_DISPLAY = {
    InterviewResult.PASSED.value: "Passed",
    InterviewResult.FAILED.value: "Failed",
    InterviewResult.ON_HOLD.value: "On Hold",
    InterviewResult.PENDING.value: "Pending"
}


def get_interview_status_display(status: str) -> str:
    return INTERVIEW_STATUS_DISPLAY.get(status, status)


def get_interview_mode_display(mode: str) -> str:
    return INTERVIEW_MODE_DISPLAY.get(mode, mode)


def get_interview_result_display(result: str) -> str:
    return INTERVIEW_RESULT_DISPLAY.get(result, result)