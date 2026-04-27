"""HRM — Onboarding (Hiring → Employee conversion)"""
from datetime import datetime, date, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class OnboardingStatus(str, Enum):
    INITIATED = "initiated"
    IN_PROGRESS = "in_progress"
    DOCUMENTS_PENDING = "documents_pending"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class OnboardingTask(BaseModel):
    task_name: str
    description: Optional[str] = None
    is_completed: bool = False
    completed_at: Optional[datetime] = None
    completed_by: Optional[str] = None


class OnboardingDocument(BaseModel):
    doc_type: str
    doc_name: str
    is_required: bool = True
    file_url: Optional[str] = None
    uploaded_at: Optional[datetime] = None


class HRMOnboardingModel(BaseModel):
    """
    Onboarding record — company_db.hrm_onboardings.
    On completion → auto-creates an EmployeeModel record.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    candidate_id: str
    candidate_name: Optional[str] = None
    candidate_email: Optional[str] = None
    offer_id: Optional[str] = None
    job_id: Optional[str] = None
    job_title: Optional[str] = None

    joining_date: Optional[date] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None

    tasks: List[OnboardingTask] = Field(default_factory=list)
    documents: List[OnboardingDocument] = Field(default_factory=list)

    status: OnboardingStatus = OnboardingStatus.INITIATED

    # Set when status becomes COMPLETED — links to created employee
    employee_id: Optional[str] = None

    notes: Optional[str] = None
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class HRMOnboardingCreate(BaseModel):
    candidate_id: str
    offer_id: Optional[str] = None
    joining_date: Optional[date] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    notes: Optional[str] = None


class HRMOnboardingUpdate(BaseModel):
    joining_date: Optional[date] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    tasks: Optional[List[OnboardingTask]] = None
    documents: Optional[List[OnboardingDocument]] = None
    status: Optional[OnboardingStatus] = None
    notes: Optional[str] = None
