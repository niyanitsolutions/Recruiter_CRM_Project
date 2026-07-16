"""HRM — Internal Hiring: "Send Application Link" invitation history.

Tracks a named person HR invited to apply for an internal job. Does not
mint its own token — it points at the job's own permanent public apply
link (see HRMJobModel.public_slug). Purely for history / duplicate
detection; the actual application is created via the public apply flow.
"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from enum import Enum
import uuid


class InvitationStatus(str, Enum):
    SENT = "sent"
    APPLIED = "applied"


class HRMCandidateInvitationModel(BaseModel):
    """Invitation record — company_db.hrm_candidate_invitations"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    job_id: str
    job_title: Optional[str] = None

    candidate_name: str
    email: EmailStr
    message: Optional[str] = None

    status: InvitationStatus = InvitationStatus.SENT
    applied_candidate_id: Optional[str] = None
    applied_at: Optional[datetime] = None

    sent_by: Optional[str] = None
    sent_by_name: Optional[str] = None
    sent_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class HRMCandidateInvitationCreate(BaseModel):
    job_id: str
    candidate_name: str
    email: EmailStr
    message: Optional[str] = None
