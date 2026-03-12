"""
Partner Payout Model - Phase 4
Tracks partner commissions, invoices, and payments
"""
from datetime import datetime, date, timedelta
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field, field_validator
from enum import Enum
import uuid


# ============== Enums ==============

class PayoutStatus(str, Enum):
    """Payout status workflow"""
    PENDING = "pending"
    ELIGIBLE = "eligible"
    INVOICE_RAISED = "invoice_raised"
    INVOICE_APPROVED = "invoice_approved"
    INVOICE_REJECTED = "invoice_rejected"
    PAYMENT_PROCESSING = "payment_processing"
    PAID = "paid"
    CANCELLED = "cancelled"


class InvoiceStatus(str, Enum):
    """Invoice status"""
    DRAFT = "draft"
    SUBMITTED = "submitted"
    APPROVED = "approved"
    REJECTED = "rejected"
    PAID = "paid"
    CANCELLED = "cancelled"


class PaymentMethod(str, Enum):
    """Payment method"""
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    CASH = "cash"
    OTHER = "other"


class CommissionType(str, Enum):
    """Commission calculation type"""
    PERCENTAGE = "percentage"
    FIXED = "fixed"
    SLAB = "slab"


# ============== Display Names ==============

PAYOUT_STATUS_DISPLAY = {
    PayoutStatus.PENDING: "Pending",
    PayoutStatus.ELIGIBLE: "Eligible",
    PayoutStatus.INVOICE_RAISED: "Invoice Raised",
    PayoutStatus.INVOICE_APPROVED: "Invoice Approved",
    PayoutStatus.INVOICE_REJECTED: "Invoice Rejected",
    PayoutStatus.PAYMENT_PROCESSING: "Payment Processing",
    PayoutStatus.PAID: "Paid",
    PayoutStatus.CANCELLED: "Cancelled"
}

INVOICE_STATUS_DISPLAY = {
    InvoiceStatus.DRAFT: "Draft",
    InvoiceStatus.SUBMITTED: "Submitted",
    InvoiceStatus.APPROVED: "Approved",
    InvoiceStatus.REJECTED: "Rejected",
    InvoiceStatus.PAID: "Paid",
    InvoiceStatus.CANCELLED: "Cancelled"
}

PAYMENT_METHOD_DISPLAY = {
    PaymentMethod.BANK_TRANSFER: "Bank Transfer",
    PaymentMethod.UPI: "UPI",
    PaymentMethod.CHEQUE: "Cheque",
    PaymentMethod.CASH: "Cash",
    PaymentMethod.OTHER: "Other"
}

COMMISSION_TYPE_DISPLAY = {
    CommissionType.PERCENTAGE: "Percentage of CTC",
    CommissionType.FIXED: "Fixed Amount",
    CommissionType.SLAB: "CTC Slab Based"
}


def get_payout_status_display(status: PayoutStatus) -> str:
    return PAYOUT_STATUS_DISPLAY.get(status, status.value)


def get_invoice_status_display(status: InvoiceStatus) -> str:
    return INVOICE_STATUS_DISPLAY.get(status, status.value)


# ============== Sub-Models ==============

class PartnerCommissionRule(BaseModel):
    """Commission rule configuration"""
    commission_type: CommissionType = CommissionType.PERCENTAGE
    percentage: Optional[float] = None
    fixed_amount: Optional[float] = None
    slabs: Optional[List[dict]] = None
    payout_days: int = 45
    
    @field_validator('percentage')
    @classmethod
    def validate_percentage(cls, v):
        if v is not None and (v < 0 or v > 100):
            raise ValueError('Percentage must be between 0 and 100')
        return v


class PayoutCalculation(BaseModel):
    """Payout calculation details"""
    candidate_ctc: float
    commission_type: CommissionType
    commission_percentage: Optional[float] = None
    commission_fixed: Optional[float] = None
    gross_amount: float
    gst_percentage: float = 18.0
    gst_amount: float
    tds_percentage: float = 10.0
    tds_amount: float
    net_amount: float
    
    @classmethod
    def calculate(cls, ctc: float, rule: PartnerCommissionRule, gst_rate: float = 18.0, tds_rate: float = 10.0):
        """Calculate payout based on commission rule"""
        if rule.commission_type == CommissionType.PERCENTAGE:
            gross = (ctc * (rule.percentage or 0) / 100)
        elif rule.commission_type == CommissionType.FIXED:
            gross = rule.fixed_amount or 0
        elif rule.commission_type == CommissionType.SLAB:
            gross = 0
            for slab in rule.slabs or []:
                if slab.get('min_ctc', 0) <= ctc <= slab.get('max_ctc', float('inf')):
                    gross = ctc * slab.get('percentage', 0) / 100
                    break
        else:
            gross = 0
        
        gst = gross * gst_rate / 100
        tds = gross * tds_rate / 100
        net = gross + gst - tds
        
        return cls(
            candidate_ctc=ctc,
            commission_type=rule.commission_type,
            commission_percentage=rule.percentage,
            commission_fixed=rule.fixed_amount,
            gross_amount=round(gross, 2),
            gst_percentage=gst_rate,
            gst_amount=round(gst, 2),
            tds_percentage=tds_rate,
            tds_amount=round(tds, 2),
            net_amount=round(net, 2)
        )


class InvoiceItem(BaseModel):
    """Invoice line item"""
    onboard_id: str
    candidate_id: str
    candidate_name: str
    job_title: str
    client_name: str
    joined_date: date
    ctc: float
    commission_amount: float
    gst_amount: float
    total_amount: float


class PaymentRecord(BaseModel):
    """Record payment"""
    payment_date: date
    payment_method: PaymentMethod
    payment_reference: str
    payment_amount: float
    notes: Optional[str] = None


# ============== Main Models ==============

class PartnerPayoutModel(BaseModel):
    """Main partner payout model (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # References
    partner_id: str
    onboard_id: str
    candidate_id: str
    job_id: str
    client_id: str
    
    # Payout Details
    candidate_ctc: float
    payout_days_required: int = 45
    joined_date: date
    payout_eligible_date: date
    
    # Commission Calculation
    commission_rule: PartnerCommissionRule
    calculation: PayoutCalculation
    
    # Status
    status: PayoutStatus = PayoutStatus.PENDING
    
    # Invoice Details
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    invoice_url: Optional[str] = None
    invoice_status: Optional[InvoiceStatus] = None
    
    # Payment Details
    payment_date: Optional[date] = None
    payment_method: Optional[PaymentMethod] = None
    payment_reference: Optional[str] = None
    payment_notes: Optional[str] = None
    
    # Rejection/Cancellation
    rejection_reason: Optional[str] = None
    cancellation_reason: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None
    
    # Denormalized fields
    partner_name: Optional[str] = None
    candidate_name: Optional[str] = None
    job_title: Optional[str] = None
    client_name: Optional[str] = None
    
    # Audit Fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class InvoiceModel(BaseModel):
    """Partner invoice model (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    partner_id: str
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None
    
    # Items
    payout_ids: List[str]
    items: List[InvoiceItem]
    
    # Amounts
    subtotal: float
    gst_amount: float
    tds_amount: float
    total_amount: float
    
    # Status
    status: InvoiceStatus = InvoiceStatus.DRAFT
    
    # Approval
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_amount: Optional[float] = None
    
    # Rejection
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    
    # Payment
    paid_at: Optional[datetime] = None
    payment_details: Optional[PaymentRecord] = None
    
    # Documents
    invoice_pdf_url: Optional[str] = None
    
    # Notes
    notes: Optional[str] = None
    accounts_notes: Optional[str] = None
    
    # Denormalized
    partner_name: Optional[str] = None
    partner_email: Optional[str] = None
    partner_mobile: Optional[str] = None
    
    # Audit Fields
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class PartnerPayoutCreate(BaseModel):
    """Create payout record"""
    partner_id: str
    onboard_id: str
    candidate_id: str
    job_id: str
    client_id: str
    candidate_ctc: float
    payout_days_required: int = 45
    joined_date: date
    commission_rule: PartnerCommissionRule
    notes: Optional[str] = None


class InvoiceCreate(BaseModel):
    """Create/raise invoice"""
    payout_ids: List[str]
    invoice_date: date = Field(default_factory=date.today)
    notes: Optional[str] = None


class InvoiceApprove(BaseModel):
    """Approve invoice"""
    approved_amount: Optional[float] = None
    notes: Optional[str] = None


class InvoiceReject(BaseModel):
    """Reject invoice"""
    rejection_reason: str
    notes: Optional[str] = None


class PartnerPayoutResponse(BaseModel):
    """Payout response model"""
    id: str
    company_id: str
    partner_id: str
    onboard_id: str
    candidate_id: str
    job_id: str
    client_id: str
    candidate_ctc: float
    payout_days_required: int
    joined_date: date
    payout_eligible_date: date
    commission_rule: PartnerCommissionRule
    calculation: PayoutCalculation
    status: PayoutStatus
    status_display: Optional[str] = None
    days_remaining: Optional[int] = None
    invoice_number: Optional[str] = None
    invoice_date: Optional[date] = None
    invoice_status: Optional[InvoiceStatus] = None
    payment_date: Optional[date] = None
    payment_method: Optional[PaymentMethod] = None
    payment_reference: Optional[str] = None
    rejection_reason: Optional[str] = None
    notes: Optional[str] = None
    partner_name: Optional[str] = None
    candidate_name: Optional[str] = None
    job_title: Optional[str] = None
    client_name: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class PartnerPayoutListResponse(BaseModel):
    """List response with pagination"""
    items: List[PartnerPayoutResponse]
    total: int
    page: int
    page_size: int
    pages: int


class InvoiceResponse(BaseModel):
    """Invoice response model"""
    id: str
    company_id: str
    partner_id: str
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None
    payout_ids: List[str]
    items: List[InvoiceItem]
    subtotal: float
    gst_amount: float
    tds_amount: float
    total_amount: float
    status: InvoiceStatus
    status_display: Optional[str] = None
    approved_by: Optional[str] = None
    approved_at: Optional[datetime] = None
    approved_amount: Optional[float] = None
    rejected_by: Optional[str] = None
    rejected_at: Optional[datetime] = None
    rejection_reason: Optional[str] = None
    paid_at: Optional[datetime] = None
    payment_details: Optional[PaymentRecord] = None
    invoice_pdf_url: Optional[str] = None
    notes: Optional[str] = None
    accounts_notes: Optional[str] = None
    partner_name: Optional[str] = None
    partner_email: Optional[str] = None
    partner_mobile: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    
    model_config = ConfigDict(from_attributes=True)


class InvoiceListResponse(BaseModel):
    """List response with pagination"""
    items: List[InvoiceResponse]
    total: int
    page: int
    page_size: int
    pages: int


# ============== Dashboard & Reports ==============

class PartnerPayoutStats(BaseModel):
    """Partner payout statistics"""
    total_placements: int = 0
    pending_payouts: int = 0
    eligible_payouts: int = 0
    invoices_raised: int = 0
    invoices_approved: int = 0
    invoices_pending: int = 0
    total_paid: float = 0.0
    total_pending_amount: float = 0.0
    this_month_earnings: float = 0.0


class AccountsPayoutDashboard(BaseModel):
    """Accounts team payout dashboard"""
    pending_approvals: int = 0
    pending_payments: int = 0
    total_pending_amount: float = 0.0
    paid_this_month: float = 0.0
    paid_this_quarter: float = 0.0
    overdue_payments: int = 0
    partners_with_pending: int = 0
# Aliases for backward compatibility
PartnerPayoutInDB = PartnerPayoutModel
InvoiceInDB = InvoiceModel
