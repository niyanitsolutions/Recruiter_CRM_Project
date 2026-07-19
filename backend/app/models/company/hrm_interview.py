"""HRM — Interview (Hiring Pipeline)"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class InterviewMode(str, Enum):
    # "in_person" is surfaced in the UI as "Face-to-Face" — the stored value is
    # unchanged so existing interview records keep working.
    IN_PERSON = "in_person"
    VIDEO = "video"
    PHONE = "phone"
    ONLINE = "online"


class InterviewResult(str, Enum):
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    ON_HOLD = "on_hold"
    # "Absent" in the feedback UI — candidate didn't show up. Distinct from
    # Failed: does not reject the candidate, HR can reschedule or reject later.
    NO_SHOW = "no_show"
    # Interview was scheduled but HR cancelled it before it happened (Cancel
    # Interview action) — does not count as a completed round either way.
    CANCELLED = "cancelled"
    # Kept for backward compatibility with existing records.
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
    # Free-text notes for the interview panel (additive, optional).
    notes: Optional[str] = None

    interviewers: List[dict] = Field(default_factory=list)   # [{id, name, email}]

    result: InterviewResult = InterviewResult.PENDING
    feedback: Optional[str] = None
    interviewer_name: Optional[str] = None
    rating: Optional[float] = None   # 0-5 — "Overall Rating" (auto-averaged from the 4 below, HR-editable)
    technical_rating: Optional[float] = None
    communication_rating: Optional[float] = None
    problem_solving_rating: Optional[float] = None
    behaviour_rating: Optional[float] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    recommended_for_next: Optional[bool] = None
    completed_at: Optional[datetime] = None

    # Structured rejection reason captured on a Fail/Reject decision (optional;
    # e.g. "Technical", "Communication", "Culture Fit"). Kept alongside the free
    # -text feedback so History and reporting can group rejections by reason.
    rejection_reason: Optional[str] = None

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
    # them from the candidate's interview_pipeline (defined below on the first
    # schedule) → the job's configured interview_rounds → generic "Round N".
    # Kept here (optional, ignored by the service) only so any older caller
    # sending them doesn't get a validation error.
    round_number: Optional[int] = None
    round_name: Optional[str] = None
    # Recruiter-defined round pipeline, sent ONLY when scheduling the first
    # interview for a candidate. The service stores it on the candidate and
    # ignores it on subsequent schedules (the pipeline is fixed once set).
    # Shape: [{"round_number": 1, "round_name": "Technical Screening"}, ...]
    interview_rounds: Optional[List[dict]] = None
    mode: InterviewMode = InterviewMode.VIDEO
    scheduled_at: datetime
    duration_minutes: int = 60
    location_or_link: Optional[str] = None
    notes: Optional[str] = None
    interviewers: Optional[List[dict]] = None
    # Legacy single toggle — still honored for older callers.
    send_invitation_email: bool = True
    # Separate per-recipient toggles. None = "not specified", in which case the
    # legacy send_invitation_email decides (backward compatible).
    send_candidate_email: Optional[bool] = None
    send_interviewer_email: Optional[bool] = None

    def wants_candidate_email(self) -> bool:
        return self.send_invitation_email if self.send_candidate_email is None else self.send_candidate_email

    def wants_interviewer_email(self) -> bool:
        return self.send_invitation_email if self.send_interviewer_email is None else self.send_interviewer_email


class HRMInterviewFeedback(BaseModel):
    result: InterviewResult
    feedback: Optional[str] = None
    interviewer_name: Optional[str] = None
    # Required by the UI when result == FAILED; free-form/categorical string.
    rejection_reason: Optional[str] = None
    rating: Optional[float] = None   # Overall — auto-computed client-side if omitted, but accepted as sent
    technical_rating: Optional[float] = None
    communication_rating: Optional[float] = None
    problem_solving_rating: Optional[float] = None
    behaviour_rating: Optional[float] = None
    strengths: Optional[str] = None
    weaknesses: Optional[str] = None
    recommended_for_next: Optional[bool] = None
    notify_candidate: bool = True


class HRMInterviewUpdate(BaseModel):
    """Edit / Reschedule Interview — only allowed while result is still
    'pending' (see hrm_hiring_service.update_interview)."""
    scheduled_at: Optional[datetime] = None
    duration_minutes: Optional[int] = None
    mode: Optional[InterviewMode] = None
    location_or_link: Optional[str] = None
