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


class Earning(BaseModel):
    name: str
    amount: float


class Payslip(BaseModel):
    """Monthly payslip — company_db.hrm_payslips"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None
    employee_code: Optional[str] = None

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
    working_days: int = 26
    present_days: float = 26.0
    absent_days: float = 0.0
    leave_days: float = 0.0
    lop_days: float = 0.0      # Loss of Pay

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
