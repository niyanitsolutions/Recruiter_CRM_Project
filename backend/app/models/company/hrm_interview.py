"""HRM — Interview (Hiring Pipeline)"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class InterviewMode(str, Enum):
    IN_PERSON = "in_person"
    VIDEO = "video"
    PHONE = "phone"


class InterviewResult(str, Enum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    ON_HOLD = "on_hold"
    # Kept for backward compatibility with existing records — no longer
    # offered as a choice in the feedback UI (Passed / Failed / On Hold only).
    NO_SHOW = "no_show"
    RESCHEDULED = "rescheduled"


class HRMInterviewModel(BaseModel):
    """Interview round — company_db.hrm_interviews"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    candidate_id: str
    candidate_name: Optional[str] = None
    job_id: Optional[str] = None
    job_title: Optional[str] = None

    round_number: int = 1
    round_name: str = "Round 1"
    mode: InterviewMode = InterviewMode.VIDEO

    scheduled_at: datetime
    duration_minutes: int = 60
    location_or_link: Optional[str] = None

    interviewers: List[dict] = Field(default_factory=list)   # [{id, name}]

    result: InterviewResult = InterviewResult.PENDING
    feedback: Optional[str] = None
    rating: Optional[float] = None   # 0-5
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    recommended_for_next: Optional[bool] = None
    completed_at: Optional[datetime] = None

    # Audit trail (section 13) — who scheduled it and whether each email
    # actually fired, for the candidate's History timeline.
    scheduled_by: Optional[str] = None
    scheduled_by_name: Optional[str] = None
    invitation_email_sent: bool = False
    result_email_sent: bool = False

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class HRMInterviewCreate(BaseModel):
    candidate_id: str
    job_id: Optional[str] = None
    # round_number/round_name are no longer HR-entered — the service computes
    # them from the job's configured interview_rounds + the candidate's
    # existing interview history. Kept here (optional, ignored by the service)
    # only so any older caller sending them doesn't get a validation error.
    round_number: Optional[int] = None
    round_name: Optional[str] = None
    mode: InterviewMode = InterviewMode.VIDEO
    scheduled_at: datetime
    duration_minutes: int = 60
    location_or_link: Optional[str] = None
    interviewers: Optional[List[dict]] = None
    send_invitation_email: bool = True


class HRMInterviewFeedback(BaseModel):
    result: InterviewResult
    feedback: Optional[str] = None
    rating: Optional[float] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    recommended_for_next: Optional[bool] = None
    notify_candidate: bool = True
