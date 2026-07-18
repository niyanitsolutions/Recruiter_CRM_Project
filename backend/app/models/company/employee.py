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
    PROBATION = "probation"
    ACTIVE = "active"
    NOTICE_PERIOD = "notice_period"
    INACTIVE = "inactive"
    ON_LEAVE = "on_leave"
    TERMINATED = "terminated"
    RESIGNED = "resigned"
    PENDING_HR_REVIEW = "pending_hr_review"


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


class BackgroundVerification(BaseModel):
    """Previous-employment details captured during self-onboarding. Distinct
    from BackgroundCheck (which tracks HR's verification status); this holds the
    employee-supplied prior-employment record. All optional — older employee
    records simply carry null."""
    previous_company: Optional[str] = None
    previous_designation: Optional[str] = None
    manager_name: Optional[str] = None
    manager_email: Optional[str] = None
    manager_phone: Optional[str] = None
    employment_from: Optional[str] = None      # YYYY-MM or YYYY-MM-DD
    employment_to: Optional[str] = None
    reason_for_leaving: Optional[str] = None


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


def calculate_profile_completion(emp: dict) -> str:
    """
    Return 'complete' if all mandatory sections are filled, otherwise 'incomplete'.
    Works on raw MongoDB dicts so it can be called at list-query time without
    constructing a full EmployeeModel instance.
    """
    # 1. Personal Information
    addr = emp.get("address_info") or {}
    personal_ok = bool(
        emp.get("phone") and
        emp.get("date_of_birth") and
        emp.get("gender") and
        emp.get("blood_group") and
        emp.get("pan_number") and
        emp.get("aadhaar_number") and
        addr.get("street") and
        addr.get("city") and
        addr.get("state") and
        addr.get("zip_code")
    )

    # 2. Employment Details
    employment_ok = bool(
        (emp.get("department_id") or emp.get("department_name")) and
        (emp.get("designation_id") or emp.get("designation_name")) and
        emp.get("date_of_joining")
    )

    # 3. Bank Details
    bank = emp.get("bank_details") or {}
    bank_ok = bool(
        bank.get("bank_name") and
        bank.get("account_number") and
        bank.get("ifsc_code") and
        bank.get("account_holder_name")
    )

    # 4. Emergency Contacts — at least one with name + relationship + phone
    contact_ok = False
    for c in (emp.get("emergency_contacts") or []):
        if isinstance(c, dict) and c.get("name") and c.get("relationship") and c.get("phone"):
            contact_ok = True
            break
    if not contact_ok:
        lc = emp.get("emergency_contact")
        if isinstance(lc, dict) and lc.get("name") and lc.get("relationship") and lc.get("phone"):
            contact_ok = True

    # 5. Qualifications — at least one record
    qual_ok = len(emp.get("qualifications") or []) >= 1

    # 6. Background Verification — status field present
    bg = emp.get("background_check")
    bg_ok = bool(bg and (bg.get("status") if isinstance(bg, dict) else getattr(bg, "status", None)))

    # 7. Documents — at least one uploaded
    docs_ok = len(emp.get("documents") or []) >= 1

    if personal_ok and employment_ok and bank_ok and contact_ok and qual_ok and bg_ok and docs_ok:
        return "complete"
    return "incomplete"


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
    # ── Employment Policy (Probation & Notice) — additive, backward compatible.
    # Older records simply carry the defaults (use_company_default=True, nulls). ──
    probation_use_company_default: bool = True
    probation_days: Optional[int] = None          # custom override when not using default
    probation_end_date: Optional[date] = None     # computed = joining + effective probation days
    notice_use_company_default: bool = True
    notice_days: Optional[int] = None             # custom override when not using default
    resignation_date: Optional[date] = None       # set when HR initiates notice
    last_working_day: Optional[date] = None        # resignation_date + notice_days
    work_location: Optional[str] = None
    shift_start_time: str = "09:00"   # HH:MM
    shift_end_time: str = "18:00"

    # Salary
    salary: SalaryStructure = Field(default_factory=SalaryStructure)
    # Dynamic per-component values keyed by component key (e.g. "basic_salary": 30000)
    salary_components: Dict[str, float] = Field(default_factory=dict)

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
    background_check: Optional[BackgroundCheck] = None          # HR verify status
    background_verification: Optional[BackgroundVerification] = None  # prior-employment details

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


class AccountInfoCreate(BaseModel):
    """Full user account fields for creating a CRM user alongside an employee.
    Email, full_name, and phone are inherited from the employee record (not duplicated here)."""
    username: str
    password: str
    employee_id: Optional[str] = None
    user_type: str = "internal"
    role: str = "candidate_coordinator"
    department_id: Optional[str] = None
    department: Optional[str] = None
    designation_id: Optional[str] = None
    designation: Optional[str] = None
    reporting_to: Optional[str] = None
    joining_date: Optional[str] = None
    status: str = "active"
    permissions: Optional[List[str]] = None
    primary_department: Optional[str] = None
    level: Optional[str] = None
    assigned_departments: Optional[List[str]] = None
    restricted_modules: Optional[List[str]] = None
    override_duplicate: bool = False


class EmployeeCreate(BaseModel):
    full_name: str
    email: EmailStr
    phone: str
    gender: Optional[Gender] = None
    date_of_birth: Optional[date] = None
    blood_group: Optional[BloodGroup] = None
    address: Optional[str] = None
    address_info: Optional[AddressInfo] = None
    photo_url: Optional[str] = None
    department_id: Optional[str] = None
    department_name: Optional[str] = None
    designation_id: Optional[str] = None
    designation_name: Optional[str] = None
    reporting_manager_id: Optional[str] = None
    employment_type: EmploymentType = EmploymentType.FULL_TIME
    date_of_joining: Optional[date] = None
    probation_use_company_default: bool = True
    probation_days: Optional[int] = None
    notice_use_company_default: bool = True
    notice_days: Optional[int] = None
    work_location: Optional[str] = None
    shift_start_time: str = "09:00"
    shift_end_time: str = "18:00"
    salary: Optional[SalaryStructure] = None
    salary_components: Optional[Dict[str, float]] = None
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
    background_verification: Optional[BackgroundVerification] = None
    account_info: Optional[AccountInfoCreate] = None


class EmployeeUpdate(BaseModel):
    full_name: Optional[str] = None
    email: Optional[EmailStr] = None
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
    probation_use_company_default: Optional[bool] = None
    probation_days: Optional[int] = None
    notice_use_company_default: Optional[bool] = None
    notice_days: Optional[int] = None
    work_location: Optional[str] = None
    shift_start_time: Optional[str] = None
    shift_end_time: Optional[str] = None
    salary: Optional[SalaryStructure] = None
    salary_components: Optional[Dict[str, float]] = None
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
    background_verification: Optional[BackgroundVerification] = None
