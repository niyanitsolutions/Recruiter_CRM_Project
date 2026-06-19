"""HRM — Payroll Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class PayrollStatus(str, Enum):
    DRAFT = "draft"
    PROCESSED = "processed"
    PAID = "paid"
    ON_HOLD = "on_hold"


class Deduction(BaseModel):
    name: str
    amount: float
    key: Optional[str] = None   # component key for visibility lookup


class Earning(BaseModel):
    name: str
    amount: float
    key: Optional[str] = None   # component key for visibility lookup


class Payslip(BaseModel):
    """Monthly payslip — company_db.hrm_payslips"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None
    # Employee snapshot fields (populated at generation time)
    employee_department:  Optional[str] = None
    employee_designation: Optional[str] = None
    employee_doj:         Optional[str] = None
    employee_pf_number:   Optional[str] = None
    employee_uan_number:  Optional[str] = None

    month: int           # 1-12
    year: int

    # Earnings
    basic: float = 0.0
    hra: float = 0.0
    special_allowance: float = 0.0
    overtime: float = 0.0
    bonus: float = 0.0
    other_earnings: List[Earning] = Field(default_factory=list)
    gross_earnings: float = 0.0

    # Deductions
    pf_employee: float = 0.0
    professional_tax: float = 0.0
    tds: float = 0.0
    advance_deduction: float = 0.0
    other_deductions: List[Deduction] = Field(default_factory=list)
    total_deductions: float = 0.0

    # Net
    net_salary: float = 0.0

    # Attendance summary
    working_days: int = 26      # calendar working days (excl. weekends + holidays)
    present_days: float = 26.0
    absent_days: float = 0.0
    paid_leave_days: float = 0.0  # approved paid leave days in the month
    leave_days: float = 0.0
    lop_days: float = 0.0         # Loss of Pay days
    lop_deduction: float = 0.0    # salary deducted for LOP (auto-computed)

    status: PayrollStatus = PayrollStatus.DRAFT
    paid_on: Optional[datetime] = None
    payment_reference: Optional[str] = None

    generated_by: Optional[str] = None
    pdf_url: Optional[str] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class GeneratePayrollRequest(BaseModel):
    month: int = Field(..., ge=1, le=12)
    year: int = Field(..., ge=2020)
    employee_ids: Optional[List[str]] = None   # None = all active employees


class UpdatePayslipStatus(BaseModel):
    status: PayrollStatus
    payment_reference: Optional[str] = None
    paid_on: Optional[datetime] = None


class UpdatePayslipData(BaseModel):
    """Editable fields for a payslip."""
    basic: Optional[float] = None
    hra: Optional[float] = None
    special_allowance: Optional[float] = None
    overtime: Optional[float] = None
    bonus: Optional[float] = None
    other_earnings: Optional[List[Earning]] = None
    pf_employee: Optional[float] = None
    professional_tax: Optional[float] = None
    tds: Optional[float] = None
    advance_deduction: Optional[float] = None
    other_deductions: Optional[List[Deduction]] = None
    working_days: Optional[int] = None
    present_days: Optional[float] = None
    paid_leave_days: Optional[float] = None
    lop_days: Optional[float] = None
    absent_days: Optional[float] = None
    leave_days: Optional[float] = None


# ── Payroll Structure Configuration (one per tenant) ──────────────────────────

class PayrollComponent(BaseModel):
    key: str                    # machine key, e.g. "basic_salary", "hra"
    label: str                  # display label shown to HR
    component_type: str = "earning"   # "earning" or "deduction"
    show_in_payslip: bool = True      # whether this line appears on the printed payslip
    is_selected: bool = True          # whether this component is active for this tenant
    is_custom: bool = False           # True for tenant-created custom components


class PayrollStructureConfig(BaseModel):
    """Stored in hrm_payroll_structure — one document per company.
    Always stores ALL components (defaults + customs) with is_selected flags.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    components: List[PayrollComponent] = Field(default_factory=list)
    is_configured: bool = False
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    model_config = ConfigDict(populate_by_name=True)


class UpsertPayrollStructure(BaseModel):
    """Payload to save the full component list (selected + unselected)."""
    components: List[PayrollComponent]


# ── Default component pool (all available, is_selected=True for basics) ───────
DEFAULT_PAYROLL_COMPONENTS: List[dict] = [
    # Earnings — basic and HRA selected by default, rest optional
    {"key": "basic_salary",         "label": "Basic Salary",         "component_type": "earning",   "show_in_payslip": True,  "is_selected": True,  "is_custom": False},
    {"key": "hra",                   "label": "HRA",                  "component_type": "earning",   "show_in_payslip": True,  "is_selected": True,  "is_custom": False},
    {"key": "travel_allowance",      "label": "Travel Allowance",     "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "medical_allowance",     "label": "Medical Allowance",    "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "food_allowance",        "label": "Food Allowance",       "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "conveyance_allowance",  "label": "Conveyance Allowance", "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "special_allowance",     "label": "Special Allowance",    "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "bonus",                 "label": "Bonus",                "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "incentive",             "label": "Incentive",            "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    {"key": "fixed_allowance",       "label": "Fixed Allowance",      "component_type": "earning",   "show_in_payslip": True,  "is_selected": False, "is_custom": False},
    # Deductions — EPF and PT selected by default
    {"key": "epf_contribution",      "label": "EPF Contribution",     "component_type": "deduction", "show_in_payslip": True,  "is_selected": True,  "is_custom": False},
    {"key": "professional_tax",      "label": "Professional Tax",     "component_type": "deduction", "show_in_payslip": True,  "is_selected": True,  "is_custom": False},
    {"key": "loan_deduction",        "label": "Loan Deduction",       "component_type": "deduction", "show_in_payslip": True,  "is_selected": False, "is_custom": False},
]
