"""HRM — Offer Template Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class TemplateType(str, Enum):
    OFFER_LETTER        = "offer_letter"
    APPOINTMENT_LETTER  = "appointment_letter"
    EXPERIENCE_LETTER   = "experience_letter"
    RELIEVING_LETTER    = "relieving_letter"
    CUSTOM              = "custom"


class SalaryComponent(BaseModel):
    label: str          # "Basic", "HRA", "Special Allowance", …
    value: str          # number or expression like "40% of CTC"
    is_fixed: bool = True


class OfferTemplateModel(BaseModel):
    """Stored in company_db.hrm_offer_templates"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    name: str
    template_type: TemplateType = TemplateType.OFFER_LETTER
    subject: Optional[str] = None

    # Rich-text / markdown body. Supports placeholders:
    # {{candidate_name}}, {{position}}, {{ctc}}, {{joining_date}}, {{company_name}}, …
    body: str = ""

    # Structured salary section (optional — rendered into body)
    salary_components: List[SalaryComponent] = Field(default_factory=list)

    # Freeform policy/rules blocks
    policies: List[str] = Field(default_factory=list)
    rules: List[str] = Field(default_factory=list)

    is_active: bool = True
    is_default: bool = False   # only one template per type can be default

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class OfferTemplateCreate(BaseModel):
    name: str
    template_type: TemplateType = TemplateType.OFFER_LETTER
    subject: Optional[str] = None
    body: str = ""
    salary_components: Optional[List[SalaryComponent]] = None
    policies: Optional[List[str]] = None
    rules: Optional[List[str]] = None
    is_default: bool = False


class OfferTemplateUpdate(BaseModel):
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    salary_components: Optional[List[SalaryComponent]] = None
    policies: Optional[List[str]] = None
    rules: Optional[List[str]] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None


class GenerateDocumentRequest(BaseModel):
    """Render a template with candidate/employee data."""
    template_id: str
    # Placeholder values — any key can be provided; backend merges with defaults
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    position: Optional[str] = None
    department: Optional[str] = None
    ctc: Optional[str] = None
    joining_date: Optional[str] = None
    # Arbitrary extra placeholders
    extra_fields: Optional[dict] = None
