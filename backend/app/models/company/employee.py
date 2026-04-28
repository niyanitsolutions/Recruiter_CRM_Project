"""HRM — Employee Model"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, EmailStr, ConfigDict
from enum import Enum
import uuid


class EmploymentType(str, Enum):
    FULL_TIME = "full_time"
    PART_TIME = "part_time"
    CONTRACT = "contract"
    INTERN = "intern"
    CONSULTANT = "consultant"


class EmploymentStatus(str, Enum):
    ACTIVE = "active"
    INACTIVE = "inactive"
    ON_LEAVE = "on_leave"
    TERMINATED = "terminated"
    RESIGNED = "resigned"


class Gender(str, Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"
    PREFER_NOT_TO_SAY = "prefer_not_to_say"


class BloodGroup(str, Enum):
    A_POS = "A+"
    A_NEG = "A-"
    B_POS = "B+"
    B_NEG = "B-"
    AB_POS = "AB+"
    AB_NEG = "AB-"
    O_POS = "O+"
    O_NEG = "O-"


class EmergencyContact(BaseModel):
    name: str
    relationship: str
    phone: str
    email: Optional[str] = None


class AddressInfo(BaseModel):
    street: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    zip_code: Optional[str] = None
    country: str = "India"


class Qualification(BaseModel):
    type: str                         # "academic" | "professional"
    title: str                        # e.g. "B.Tech", "AWS Certified"
    institution: Optional[str] = None
    year: Optional[int] = None
    grade: Optional[str] = None


class DisciplinaryRecord(BaseModel):
    date: date
    incident: str
    action_taken: str
    recorded_by: Optional[str] = None


class BackgroundCheck(BaseModel):
    status: str = "pending"           # "pending" | "verified" | "rejected"
    checked_by: Optional[str] = None
    checked_on: Optional[date] = None
    notes: Optional[str] = None


class BankDetails(BaseModel):
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_holder_name: Optional[str] = None


class SalaryStructure(BaseModel):
    ctc: float = 0.0              # Annual CTC
    basic: float = 0.0            # Monthly basic
    hra: float = 0.0              # Monthly HRA
    special_allowance: float = 0.0
    pf_employee: float = 0.0      # Employee PF (12% of basic)
    pf_employer: float = 0.0      # Employer PF
    professional_tax: float = 0.0
    gross_salary: float = 0.0     # Monthly gross
    net_salary: float = 0.0       # Monthly take-home


class EmployeeDocument(BaseModel):
    doc_type: str          # id_proof, offer_letter, contract, certificate, etc.
    doc_name: str
    file_url: str
    uploaded_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


class EmployeeModel(BaseModel):
    """Core HR employee record — stored in company_db.hrm_employees"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    # Personal Info
    employee_id: str                          # Auto-generated: EMP001, EMP002…
    full_name: str
    email: EmailStr
    phone: str
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    address: Optional[str] = None             # legacy plain-text address
    address_info: Optional[AddressInfo] = None  # structured address
    emergency_contact: Optional[EmergencyContact] = None   # legacy single contact
    emergency_contacts: List[EmergencyContact] = Field(default_factory=list)
    photo_url: Optional[str] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None

    # Employment Info
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation_id: Optional[str] = None
    designation_name: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    reporting_manager_name: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    employment_status: EmploymentStatus = EmploymentStatus.ACTIVE
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    work_location: Optional[str] = None
    shift_start_time: str = "09:00"   # HH:MM
    shift_end_time: str = "18:00"

    # Salary
    salary: SalaryStructure = Field(default_factory=SalaryStructure)

    # Bank & Compliance
    bank_details: Optional[BankDetails] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None

    # Employment Notes & Discipline
    work_description: Optional[str] = None
    disciplinary_records: List[DisciplinaryRecord] = Field(default_factory=list)

    # Qualifications
    qualifications: List[Qualification] = Field(default_factory=list)

    # Background Verification
    background_check: Optional[BackgroundCheck] = None

    # Documents
    documents: List[EmployeeDocument] = Field(default_factory=list)

    # Linked CRM user (if employee is also a CRM user)
    crm_user_id: Optional[str] = None

    # Source — if converted from HRM hiring pipeline
    hrm_onboarding_id: Optional[str] = None

    # Meta
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class EmployeeCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    address: Optional[str] = None
    address_info: Optional[AddressInfo] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation_id: Optional[str] = None
    designation_name: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    date_of_joining: Optional[date] = None
    work_location: Optional[str] = None
    shift_start_time: str = "09:00"
    shift_end_time: str = "18:00"
    salary: Optional[SalaryStructure] = None
    bank_details: Optional[BankDetails] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None
    emergency_contact: Optional[EmergencyContact] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    work_description: Optional[str] = None
    qualifications: Optional[List[Qualification]] = None
    background_check: Optional[BackgroundCheck] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    phone: Optional[str] = None
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    address: Optional[str] = None
    address_info: Optional[AddressInfo] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation_id: Optional[str] = None
    designation_name: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    employment_type: Optional[EmploymentType] = None
    employment_status: Optional[EmploymentStatus] = None
    date_of_joining: Optional[date] = None
    date_of_leaving: Optional[date] = None
    work_location: Optional[str] = None
    shift_start_time: Optional[str] = None
    shift_end_time: Optional[str] = None
    salary: Optional[SalaryStructure] = None
    bank_details: Optional[BankDetails] = None
    pan_number: Optional[str] = None
    aadhaar_number: Optional[str] = None
    pf_number: Optional[str] = None
    uan_number: Optional[str] = None
    emergency_contact: Optional[EmergencyContact] = None
    emergency_contacts: Optional[List[EmergencyContact]] = None
    photo_url: Optional[str] = None
    work_description: Optional[str] = None
    disciplinary_records: Optional[List[DisciplinaryRecord]] = None
    qualifications: Optional[List[Qualification]] = None
    background_check: Optional[BackgroundCheck] = None
