"""HRM — Offer Letter"""
from datetime import datetime, date, timezone
from typing import Optional
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class OfferStatus(str, Enum):
    DRAFT = "draft"
    SENT = "sent"
    ACCEPTED = "accepted"
    REJECTED = "rejected"
    EXPIRED = "expired"
    REVOKED = "revoked"


class HRMOfferModel(BaseModel):
    """Offer letter — company_db.hrm_offers"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    candidate_id: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    job_id: Optional[str] = None
    job_title: Optional[str] = None

    # Offer details
    offered_designation: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    offered_ctc: float = 0.0
    joining_date: Optional[date] = None
    offer_expiry_date: Optional[date] = None

    status: OfferStatus = OfferStatus.DRAFT
    rejection_reason: Optional[str] = None
    accepted_at: Optional[datetime] = None
    rejected_at: Optional[datetime] = None

    # PDF
    pdf_url: Optional[str] = None

    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class HRMOfferCreate(BaseModel):
    candidate_id: str
    job_id: Optional[str] = None
    offered_designation: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    offered_ctc: float
    joining_date: Optional[date] = None
    offer_expiry_date: Optional[date] = None
    notes: Optional[str] = None


class HRMOfferRespond(BaseModel):
    action: str             # "accept" | "reject"
    rejection_reason: Optional[str] = None
