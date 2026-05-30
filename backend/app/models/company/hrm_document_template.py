"""HRM — Document Template Model (Enterprise Edition)"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field
from enum import Enum
import uuid


# ─── Enums ───────────────────────────────────────────────────────────────────

class DocumentType(str, Enum):
    OFFER_LETTER            = "offer_letter"
    APPOINTMENT_LETTER      = "appointment_letter"
    EXPERIENCE_LETTER       = "experience_letter"
    RELIEVING_LETTER        = "relieving_letter"
    JOINING_LETTER          = "joining_letter"
    PROMOTION_LETTER        = "promotion_letter"
    INCREMENT_LETTER        = "increment_letter"
    WARNING_LETTER          = "warning_letter"
    NDA_AGREEMENT           = "nda_agreement"
    HR_POLICY               = "hr_policy"
    PAYSLIP                 = "payslip"
    SALARY_REVISION         = "salary_revision"
    INTERNSHIP_LETTER       = "internship_letter"
    INTERNSHIP_COMPLETION   = "internship_completion"
    EMPLOYEE_ID_LETTER      = "employee_id_letter"
    BONAFIDE_LETTER         = "bonafide_letter"
    WFH_APPROVAL            = "wfh_approval"
    LEAVE_APPROVAL          = "leave_approval"
    TERMINATION_LETTER      = "termination_letter"
    CUSTOM                  = "custom"


class TemplateCategory(str, Enum):
    HR          = "hr"
    RECRUITMENT = "recruitment"
    PAYROLL     = "payroll"
    LEGAL       = "legal"
    FINANCE     = "finance"
    COMPLIANCE  = "compliance"
    EMPLOYEE    = "employee"
    CUSTOM      = "custom"


class BlockType(str, Enum):
    HEADING         = "heading"
    TEXT            = "text"
    PARAGRAPH       = "paragraph"
    TABLE           = "table"
    SALARY_TABLE    = "salary_table"
    IMAGE           = "image"
    LOGO            = "logo"
    SIGNATURE       = "signature"
    SIGNATURE_BLOCK = "signature_block"
    DIVIDER         = "divider"
    SPACER          = "spacer"
    QR_CODE         = "qr_code"
    PAGE_BREAK      = "page_break"
    EMP_DETAILS     = "employee_details"
    COMPANY_DETAILS = "company_details"
    LIST_ITEMS      = "list_items"
    TWO_COLUMN      = "two_column"
    CONDITIONS      = "conditions"


class PageSize(str, Enum):
    A4     = "A4"
    LETTER = "LETTER"
    LEGAL  = "LEGAL"
    A3     = "A3"


class PageOrientation(str, Enum):
    PORTRAIT  = "portrait"
    LANDSCAPE = "landscape"


class LogoPosition(str, Enum):
    LEFT   = "left"
    CENTER = "center"
    RIGHT  = "right"


class WatermarkType(str, Enum):
    TEXT  = "text"
    IMAGE = "image"


class SignatureType(str, Enum):
    UPLOAD = "upload"
    DRAW   = "draw"
    TYPED  = "typed"


# ─── Sub-models ───────────────────────────────────────────────────────────────

class PageConfig(BaseModel):
    size: PageSize = PageSize.A4
    orientation: PageOrientation = PageOrientation.PORTRAIT
    margin_top: float = 20
    margin_right: float = 20
    margin_bottom: float = 20
    margin_left: float = 20


class HeaderConfig(BaseModel):
    enabled: bool = True
    logo_url: Optional[str] = None
    logo_position: LogoPosition = LogoPosition.LEFT
    logo_width: float = 80
    logo_height: float = 40
    show_company_name: bool = True
    show_address: bool = True
    show_phone: bool = False
    show_email: bool = False
    show_website: bool = False
    show_gst: bool = False
    custom_html: Optional[str] = None
    background_color: str = "#ffffff"
    border_bottom: bool = True
    border_color: str = "#e2e8f0"


class FooterConfig(BaseModel):
    enabled: bool = True
    show_page_numbers: bool = True
    show_generated_date: bool = True
    disclaimer: str = ""
    custom_html: Optional[str] = None
    background_color: str = "#ffffff"
    border_top: bool = True
    border_color: str = "#e2e8f0"


class WatermarkConfig(BaseModel):
    enabled: bool = False
    type: WatermarkType = WatermarkType.TEXT
    text: str = "CONFIDENTIAL"
    image_url: Optional[str] = None
    opacity: float = 0.10
    rotation: int = -45
    font_size: int = 60
    color: str = "#cccccc"


class BrandingConfig(BaseModel):
    primary_color: str = "#1e3a5f"
    secondary_color: str = "#4a90d9"
    accent_color: str = "#e2e8f0"
    font_family: str = "Helvetica"
    font_size: int = 11
    line_height: float = 1.5
    text_color: str = "#1a1a1a"
    heading_color: str = "#1e3a5f"


class BlockProperties(BaseModel):
    font_size: Optional[int] = None
    font_weight: Optional[str] = None      # normal | bold
    font_style: Optional[str] = None       # normal | italic
    text_align: Optional[str] = "left"    # left | center | right | justify
    color: Optional[str] = None
    background_color: Optional[str] = None
    margin_top: int = 6
    margin_bottom: int = 6
    padding: int = 0
    border: bool = False
    border_color: str = "#e2e8f0"
    border_radius: int = 0
    width: Optional[str] = None           # "100%" | "50%" | px value
    height: Optional[str] = None
    line_height: Optional[float] = None


class TemplateBlock(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    type: BlockType
    content: Any = ""                     # str for text/html, dict for table/salary_table
    properties: BlockProperties = Field(default_factory=BlockProperties)
    order: int = 0
    is_locked: bool = False               # prevent editing in generation form
    is_hidden: bool = False               # hide block from canvas and export
    condition: Optional[str] = None       # e.g. "salary_ctc > 100000"


class SignatureSlot(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    label: str = "Authorized Signatory"
    name: Optional[str] = None
    designation: Optional[str] = None
    signature_type: SignatureType = SignatureType.UPLOAD
    image_url: Optional[str] = None
    typed_text: Optional[str] = None
    position: str = "left"               # left | center | right


class VersionSnapshot(BaseModel):
    version: int
    saved_at: datetime
    saved_by: str
    note: str = ""
    snapshot: dict                        # full template document at that version


# ─── Main Template Model ──────────────────────────────────────────────────────

class DocumentTemplateModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str

    name: str
    description: str = ""
    doc_type: DocumentType = DocumentType.CUSTOM
    category: TemplateCategory = TemplateCategory.HR

    is_active: bool = True
    is_default: bool = False
    is_deleted: bool = False

    version: int = 1

    page_config:  PageConfig   = Field(default_factory=PageConfig)
    branding:     BrandingConfig = Field(default_factory=BrandingConfig)
    header:       HeaderConfig = Field(default_factory=HeaderConfig)
    footer:       FooterConfig = Field(default_factory=FooterConfig)
    watermark:    WatermarkConfig = Field(default_factory=WatermarkConfig)

    blocks: List[TemplateBlock] = Field(default_factory=list)
    signatures: List[SignatureSlot] = Field(default_factory=list)

    # Allowed roles for this template (empty = all roles)
    allowed_roles: List[str] = Field(default_factory=list)

    version_history: List[dict] = Field(default_factory=list)

    tags: List[str] = Field(default_factory=list)

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_generated_at: Optional[datetime] = None
    generation_count: int = 0


# ─── Reusable Content Block ───────────────────────────────────────────────────

class ContentBlockModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    name: str
    description: str = ""
    category: str = "general"
    block_data: TemplateBlock
    is_deleted: bool = False
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))


# ─── Document Generation Record ───────────────────────────────────────────────

class GenerationStatus(str, Enum):
    DRAFT     = "draft"
    GENERATED = "generated"
    SENT      = "sent"
    SIGNED    = "signed"


class DocumentGenerationModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    template_id: str
    template_name: str
    doc_type: str

    generated_for_employee_id: Optional[str] = None
    generated_for_employee_name: Optional[str] = None
    generated_for_candidate_id: Optional[str] = None
    generated_for_candidate_name: Optional[str] = None

    field_data: dict = Field(default_factory=dict)
    rendered_html: str = ""
    pdf_url: Optional[str] = None
    docx_url: Optional[str] = None
    qr_code: Optional[str] = None
    document_number: Optional[str] = None

    status: GenerationStatus = GenerationStatus.GENERATED
    generated_by: Optional[str] = None
    generated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False


# ─── Request / Response models ────────────────────────────────────────────────

class TemplateCreate(BaseModel):
    name: str
    description: str = ""
    doc_type: DocumentType = DocumentType.CUSTOM
    category: TemplateCategory = TemplateCategory.HR
    is_active: bool = True                # False = save as draft (inactive)
    is_default: bool = False
    page_config: Optional[dict] = None
    branding: Optional[dict] = None
    header: Optional[dict] = None
    footer: Optional[dict] = None
    watermark: Optional[dict] = None
    blocks: Optional[List[dict]] = None
    signatures: Optional[List[dict]] = None
    allowed_roles: Optional[List[str]] = None
    tags: Optional[List[str]] = None


class TemplateUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    doc_type: Optional[DocumentType] = None
    category: Optional[TemplateCategory] = None
    is_active: Optional[bool] = None
    is_default: Optional[bool] = None
    page_config: Optional[dict] = None
    branding: Optional[dict] = None
    header: Optional[dict] = None
    footer: Optional[dict] = None
    watermark: Optional[dict] = None
    blocks: Optional[List[dict]] = None
    signatures: Optional[List[dict]] = None
    allowed_roles: Optional[List[str]] = None
    tags: Optional[List[str]] = None
    version_note: Optional[str] = None   # note for version snapshot


class GenerateDocumentRequest(BaseModel):
    field_data: dict = Field(default_factory=dict)
    employee_id: Optional[str] = None
    candidate_id: Optional[str] = None
    export_format: str = "html"           # html | pdf | docx
    save_record: bool = True


class CloneTemplateRequest(BaseModel):
    name: str
    doc_type: Optional[DocumentType] = None


class ContentBlockCreate(BaseModel):
    name: str
    description: str = ""
    category: str = "general"
    block_data: dict


class RestoreVersionRequest(BaseModel):
    version: int
    note: str = ""


# ─── Dynamic Form Field Schema (per document type) ───────────────────────────

class FieldType(str, Enum):
    TEXT     = "text"
    NUMBER   = "number"
    DATE     = "date"
    SELECT   = "select"
    TEXTAREA = "textarea"
    EMAIL    = "email"
    PHONE    = "phone"
    CURRENCY = "currency"
    PERCENT  = "percent"


class FormField(BaseModel):
    key: str
    label: str
    type: FieldType = FieldType.TEXT
    required: bool = False
    placeholder: str = ""
    options: Optional[List[str]] = None     # for select type
    default: Optional[str] = None
    group: str = "general"
    hint: Optional[str] = None
    auto_fill_from: Optional[str] = None    # employee.full_name, etc.


# ─── Static schema: which fields to show per document type ───────────────────

DOCUMENT_TYPE_FIELDS: Dict[str, List[dict]] = {
    "offer_letter": [
        {"key": "candidate_name",     "label": "Candidate Name",      "type": "text",     "required": True,  "group": "candidate", "auto_fill_from": "candidate.full_name"},
        {"key": "position",           "label": "Position / Role",     "type": "text",     "required": True,  "group": "offer"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "offer"},
        {"key": "joining_date",       "label": "Joining Date",        "type": "date",     "required": True,  "group": "offer"},
        {"key": "salary_ctc",         "label": "CTC (Annual)",        "type": "currency", "required": True,  "group": "salary"},
        {"key": "location",           "label": "Work Location",       "type": "text",     "required": True,  "group": "offer"},
        {"key": "reporting_manager",  "label": "Reporting Manager",   "type": "text",     "required": False, "group": "offer"},
        {"key": "offer_expiry_date",  "label": "Offer Expiry Date",   "type": "date",     "required": False, "group": "offer"},
        {"key": "probation_period",   "label": "Probation Period",    "type": "text",     "required": False, "group": "offer", "default": "3 months"},
        {"key": "shift",              "label": "Shift",               "type": "select",   "required": False, "group": "offer", "options": ["General", "Morning", "Evening", "Night"]},
        {"key": "work_mode",          "label": "Work Mode",           "type": "select",   "required": False, "group": "offer", "options": ["Office", "Remote", "Hybrid"], "default": "Office"},
        {"key": "bonus",              "label": "Joining Bonus",       "type": "currency", "required": False, "group": "salary"},
        {"key": "candidate_email",    "label": "Candidate Email",     "type": "email",    "required": False, "group": "candidate", "auto_fill_from": "candidate.email"},
        {"key": "candidate_phone",    "label": "Candidate Phone",     "type": "phone",    "required": False, "group": "candidate", "auto_fill_from": "candidate.phone"},
    ],
    "appointment_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "position",           "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "joining_date",       "label": "Joining Date",        "type": "date",     "required": True,  "group": "job",  "auto_fill_from": "employee.date_of_joining"},
        {"key": "salary_ctc",         "label": "CTC (Annual)",        "type": "currency", "required": True,  "group": "salary"},
        {"key": "location",           "label": "Work Location",       "type": "text",     "required": False, "group": "job"},
        {"key": "reporting_manager",  "label": "Reporting Manager",   "type": "text",     "required": False, "group": "job",  "auto_fill_from": "employee.reporting_manager"},
        {"key": "employment_type",    "label": "Employment Type",     "type": "select",   "required": False, "group": "job",  "options": ["Permanent", "Contract", "Probation", "Part-time"]},
        {"key": "probation_period",   "label": "Probation Period",    "type": "text",     "required": False, "group": "job",  "default": "3 months"},
    ],
    "experience_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "joining_date",       "label": "Date of Joining",     "type": "date",     "required": True,  "group": "dates", "auto_fill_from": "employee.date_of_joining"},
        {"key": "leaving_date",       "label": "Last Working Day",    "type": "date",     "required": True,  "group": "dates"},
        {"key": "experience_years",   "label": "Total Experience",    "type": "text",     "required": False, "group": "dates"},
        {"key": "reporting_manager",  "label": "Reporting Manager",   "type": "text",     "required": False, "group": "job"},
    ],
    "relieving_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "joining_date",       "label": "Date of Joining",     "type": "date",     "required": True,  "group": "dates", "auto_fill_from": "employee.date_of_joining"},
        {"key": "relieving_date",     "label": "Last Working Day",    "type": "date",     "required": True,  "group": "dates"},
        {"key": "reason",             "label": "Reason for Leaving",  "type": "text",     "required": False, "group": "details"},
    ],
    "joining_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "position",           "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "joining_date",       "label": "Joining Date",        "type": "date",     "required": True,  "group": "job"},
        {"key": "salary_ctc",         "label": "CTC (Annual)",        "type": "currency", "required": False, "group": "salary"},
        {"key": "location",           "label": "Work Location",       "type": "text",     "required": False, "group": "job"},
        {"key": "reporting_manager",  "label": "Reporting Manager",   "type": "text",     "required": False, "group": "job",  "auto_fill_from": "employee.reporting_manager"},
    ],
    "promotion_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "old_designation",    "label": "Current Designation", "type": "text",     "required": True,  "group": "promotion"},
        {"key": "new_designation",    "label": "New Designation",     "type": "text",     "required": True,  "group": "promotion"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "effective_date",     "label": "Effective Date",      "type": "date",     "required": True,  "group": "promotion"},
        {"key": "new_salary",         "label": "New CTC (Annual)",    "type": "currency", "required": False, "group": "salary"},
    ],
    "increment_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "effective_date",     "label": "Effective Date",      "type": "date",     "required": True,  "group": "increment"},
        {"key": "old_salary",         "label": "Current CTC",         "type": "currency", "required": True,  "group": "salary"},
        {"key": "new_salary",         "label": "Revised CTC",         "type": "currency", "required": True,  "group": "salary"},
        {"key": "increment_amount",   "label": "Increment Amount",    "type": "currency", "required": False, "group": "salary"},
        {"key": "increment_percent",  "label": "Increment %",         "type": "percent",  "required": False, "group": "salary"},
    ],
    "warning_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job"},
        {"key": "incident_date",      "label": "Incident Date",       "type": "date",     "required": True,  "group": "warning"},
        {"key": "incident_description","label": "Incident Description","type": "textarea","required": True,  "group": "warning"},
        {"key": "warning_number",     "label": "Warning Number",      "type": "select",   "required": False, "group": "warning", "options": ["1st Warning", "2nd Warning", "Final Warning"]},
    ],
    "nda_agreement": [
        {"key": "party_name",         "label": "Party Name",          "type": "text",     "required": True,  "group": "parties"},
        {"key": "party_designation",  "label": "Designation",         "type": "text",     "required": False, "group": "parties"},
        {"key": "effective_date",     "label": "Effective Date",      "type": "date",     "required": True,  "group": "agreement"},
        {"key": "duration",           "label": "NDA Duration",        "type": "text",     "required": False, "group": "agreement", "default": "2 years"},
        {"key": "governing_law",      "label": "Governing Law",       "type": "text",     "required": False, "group": "agreement", "default": "India"},
    ],
    "hr_policy": [
        {"key": "policy_name",        "label": "Policy Name",         "type": "text",     "required": True,  "group": "policy"},
        {"key": "effective_date",     "label": "Effective Date",      "type": "date",     "required": True,  "group": "policy"},
        {"key": "applicable_to",      "label": "Applicable To",       "type": "text",     "required": False, "group": "policy", "default": "All Employees"},
        {"key": "version",            "label": "Policy Version",      "type": "text",     "required": False, "group": "policy", "default": "v1.0"},
    ],
    "payslip": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.designation"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.department"},
        {"key": "payroll_month",      "label": "Payroll Month",       "type": "text",     "required": True,  "group": "payroll"},
        {"key": "payroll_year",       "label": "Payroll Year",        "type": "number",   "required": True,  "group": "payroll"},
        {"key": "salary_basic",       "label": "Basic Salary",        "type": "currency", "required": True,  "group": "earnings"},
        {"key": "salary_hra",         "label": "HRA",                 "type": "currency", "required": False, "group": "earnings"},
        {"key": "salary_special",     "label": "Special Allowance",   "type": "currency", "required": False, "group": "earnings"},
        {"key": "salary_overtime",    "label": "Overtime",            "type": "currency", "required": False, "group": "earnings"},
        {"key": "salary_bonus",       "label": "Bonus",               "type": "currency", "required": False, "group": "earnings"},
        {"key": "deduct_pf",          "label": "PF (Employee)",       "type": "currency", "required": False, "group": "deductions"},
        {"key": "deduct_esi",         "label": "ESI",                 "type": "currency", "required": False, "group": "deductions"},
        {"key": "deduct_pt",          "label": "Professional Tax",    "type": "currency", "required": False, "group": "deductions"},
        {"key": "deduct_tds",         "label": "TDS",                 "type": "currency", "required": False, "group": "deductions"},
        {"key": "working_days",       "label": "Working Days",        "type": "number",   "required": False, "group": "attendance"},
        {"key": "present_days",       "label": "Present Days",        "type": "number",   "required": False, "group": "attendance"},
        {"key": "lop_days",           "label": "LOP Days",            "type": "number",   "required": False, "group": "attendance"},
        {"key": "bank_account",       "label": "Bank Account No.",    "type": "text",     "required": False, "group": "banking", "auto_fill_from": "employee.bank_account"},
        {"key": "uan_number",         "label": "UAN Number",          "type": "text",     "required": False, "group": "banking", "auto_fill_from": "employee.uan_number"},
    ],
    "salary_revision": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "effective_date",     "label": "Effective Date",      "type": "date",     "required": True,  "group": "revision"},
        {"key": "old_salary",         "label": "Current CTC",         "type": "currency", "required": True,  "group": "salary"},
        {"key": "new_salary",         "label": "Revised CTC",         "type": "currency", "required": True,  "group": "salary"},
        {"key": "increment_percent",  "label": "Increment %",         "type": "percent",  "required": False, "group": "salary"},
    ],
    "internship_letter": [
        {"key": "intern_name",        "label": "Intern Name",         "type": "text",     "required": True,  "group": "intern"},
        {"key": "intern_email",       "label": "Intern Email",        "type": "email",    "required": False, "group": "intern"},
        {"key": "position",           "label": "Internship Role",     "type": "text",     "required": True,  "group": "details"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "details"},
        {"key": "start_date",         "label": "Start Date",          "type": "date",     "required": True,  "group": "dates"},
        {"key": "end_date",           "label": "End Date",            "type": "date",     "required": True,  "group": "dates"},
        {"key": "stipend",            "label": "Monthly Stipend",     "type": "currency", "required": False, "group": "salary"},
        {"key": "reporting_manager",  "label": "Reporting Manager",   "type": "text",     "required": False, "group": "details"},
    ],
    "internship_completion": [
        {"key": "intern_name",        "label": "Intern Name",         "type": "text",     "required": True,  "group": "intern"},
        {"key": "position",           "label": "Internship Role",     "type": "text",     "required": True,  "group": "details"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "details"},
        {"key": "start_date",         "label": "Start Date",          "type": "date",     "required": True,  "group": "dates"},
        {"key": "end_date",           "label": "End Date",            "type": "date",     "required": True,  "group": "dates"},
        {"key": "mentor_name",        "label": "Mentor / Supervisor", "type": "text",     "required": False, "group": "details"},
        {"key": "performance",        "label": "Performance Rating",  "type": "select",   "required": False, "group": "details", "options": ["Outstanding", "Excellent", "Good", "Satisfactory"]},
    ],
    "employee_id_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "joining_date",       "label": "Date of Joining",     "type": "date",     "required": True,  "group": "dates", "auto_fill_from": "employee.date_of_joining"},
    ],
    "bonafide_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "purpose",            "label": "Purpose of Letter",   "type": "text",     "required": True,  "group": "details"},
        {"key": "addressed_to",       "label": "Addressed To",        "type": "text",     "required": False, "group": "details"},
    ],
    "wfh_approval": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": False, "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": False, "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "wfh_from",           "label": "WFH From Date",       "type": "date",     "required": True,  "group": "dates"},
        {"key": "wfh_to",             "label": "WFH To Date",         "type": "date",     "required": True,  "group": "dates"},
        {"key": "wfh_days",           "label": "Number of Days",      "type": "number",   "required": False, "group": "dates"},
        {"key": "reason",             "label": "Reason",              "type": "textarea", "required": True,  "group": "details"},
        {"key": "approved_by",        "label": "Approved By",         "type": "text",     "required": False, "group": "approval"},
    ],
    "leave_approval": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "leave_type",         "label": "Leave Type",          "type": "select",   "required": True,  "group": "leave", "options": ["Casual Leave", "Sick Leave", "Earned Leave", "Maternity Leave", "Paternity Leave", "Compensatory Off", "Unpaid Leave"]},
        {"key": "leave_from",         "label": "Leave From",          "type": "date",     "required": True,  "group": "leave"},
        {"key": "leave_to",           "label": "Leave To",            "type": "date",     "required": True,  "group": "leave"},
        {"key": "leave_days",         "label": "Number of Days",      "type": "number",   "required": False, "group": "leave"},
        {"key": "approved_by",        "label": "Approved By",         "type": "text",     "required": False, "group": "approval"},
        {"key": "leave_balance",      "label": "Remaining Balance",   "type": "number",   "required": False, "group": "leave"},
    ],
    "termination_letter": [
        {"key": "employee_name",      "label": "Employee Name",       "type": "text",     "required": True,  "group": "employee", "auto_fill_from": "employee.full_name"},
        {"key": "employee_id",        "label": "Employee ID",         "type": "text",     "required": False, "group": "employee", "auto_fill_from": "employee.employee_id"},
        {"key": "designation",        "label": "Designation",         "type": "text",     "required": True,  "group": "job"},
        {"key": "department",         "label": "Department",          "type": "text",     "required": True,  "group": "job",  "auto_fill_from": "employee.department"},
        {"key": "joining_date",       "label": "Date of Joining",     "type": "date",     "required": False, "group": "dates", "auto_fill_from": "employee.date_of_joining"},
        {"key": "termination_date",   "label": "Last Working Day",    "type": "date",     "required": True,  "group": "dates"},
        {"key": "reason",             "label": "Reason",              "type": "textarea", "required": True,  "group": "details"},
        {"key": "notice_period",      "label": "Notice Period",       "type": "text",     "required": False, "group": "details"},
        {"key": "severance_pay",      "label": "Severance Pay",       "type": "currency", "required": False, "group": "salary"},
    ],
    "custom": [
        {"key": "recipient_name",     "label": "Recipient Name",      "type": "text",     "required": False, "group": "recipient"},
        {"key": "date",               "label": "Date",                "type": "date",     "required": False, "group": "general"},
        {"key": "subject",            "label": "Subject",             "type": "text",     "required": False, "group": "general"},
        {"key": "body",               "label": "Body / Content",      "type": "textarea", "required": False, "group": "general"},
    ],
}


# ─── Placeholder Groups (for the placeholder browser in the builder) ──────────

PLACEHOLDER_GROUPS: Dict[str, List[dict]] = {
    "Candidate": [
        {"key": "candidate_name",       "label": "Candidate Name"},
        {"key": "candidate_email",      "label": "Candidate Email"},
        {"key": "candidate_phone",      "label": "Candidate Phone"},
        {"key": "position",             "label": "Position / Role"},
        {"key": "department",           "label": "Department"},
        {"key": "joining_date",         "label": "Joining Date"},
        {"key": "salary_ctc",           "label": "CTC (Annual)"},
        {"key": "location",             "label": "Work Location"},
        {"key": "offer_expiry_date",    "label": "Offer Expiry Date"},
        {"key": "probation_period",     "label": "Probation Period"},
        {"key": "work_mode",            "label": "Work Mode"},
        {"key": "shift",                "label": "Shift"},
        {"key": "bonus",                "label": "Joining Bonus"},
        {"key": "reporting_manager",    "label": "Reporting Manager"},
    ],
    "Employee": [
        {"key": "employee_name",        "label": "Employee Name"},
        {"key": "employee_id",          "label": "Employee ID"},
        {"key": "employee_email",       "label": "Employee Email"},
        {"key": "employee_phone",       "label": "Employee Phone"},
        {"key": "designation",          "label": "Designation"},
        {"key": "department",           "label": "Department"},
        {"key": "employment_type",      "label": "Employment Type"},
        {"key": "date_of_joining",      "label": "Date of Joining"},
        {"key": "date_of_birth",        "label": "Date of Birth"},
        {"key": "bank_account",         "label": "Bank Account No."},
        {"key": "uan_number",           "label": "UAN Number"},
        {"key": "pan_number",           "label": "PAN Number"},
    ],
    "Company": [
        {"key": "company_name",         "label": "Company Name"},
        {"key": "company_address",      "label": "Company Address"},
        {"key": "company_city",         "label": "City"},
        {"key": "company_state",        "label": "State"},
        {"key": "company_country",      "label": "Country"},
        {"key": "company_phone",        "label": "Company Phone"},
        {"key": "company_email",        "label": "Company Email"},
        {"key": "company_website",      "label": "Company Website"},
        {"key": "company_gst",          "label": "GST Number"},
        {"key": "company_cin",          "label": "CIN Number"},
    ],
    "Payroll": [
        {"key": "payroll_month",        "label": "Payroll Month"},
        {"key": "payroll_year",         "label": "Payroll Year"},
        {"key": "salary_basic",         "label": "Basic Salary"},
        {"key": "salary_hra",           "label": "HRA"},
        {"key": "salary_special",       "label": "Special Allowance"},
        {"key": "salary_overtime",      "label": "Overtime"},
        {"key": "salary_bonus",         "label": "Bonus"},
        {"key": "salary_gross",         "label": "Gross Salary"},
        {"key": "deduct_pf",            "label": "PF (Employee)"},
        {"key": "deduct_pf_employer",   "label": "PF (Employer)"},
        {"key": "deduct_esi",           "label": "ESI"},
        {"key": "deduct_pt",            "label": "Professional Tax"},
        {"key": "deduct_tds",           "label": "TDS"},
        {"key": "total_deductions",     "label": "Total Deductions"},
        {"key": "salary_net",           "label": "Net Salary"},
        {"key": "working_days",         "label": "Working Days"},
        {"key": "present_days",         "label": "Present Days"},
        {"key": "lop_days",             "label": "LOP Days"},
    ],
    "HR / Approval": [
        {"key": "leave_type",           "label": "Leave Type"},
        {"key": "leave_from",           "label": "Leave From"},
        {"key": "leave_to",             "label": "Leave To"},
        {"key": "leave_days",           "label": "Leave Days"},
        {"key": "leave_balance",        "label": "Leave Balance"},
        {"key": "approved_by",          "label": "Approved By"},
        {"key": "increment_amount",     "label": "Increment Amount"},
        {"key": "increment_percent",    "label": "Increment %"},
        {"key": "old_salary",           "label": "Old Salary"},
        {"key": "new_salary",           "label": "New Salary"},
        {"key": "effective_date",       "label": "Effective Date"},
    ],
    "Dates": [
        {"key": "date_today",           "label": "Today's Date"},
        {"key": "date_formatted",       "label": "Date (Long Format)"},
        {"key": "current_month",        "label": "Current Month"},
        {"key": "current_year",         "label": "Current Year"},
        {"key": "document_number",      "label": "Document Number"},
        {"key": "document_date",        "label": "Document Date"},
    ],
}

# ─── Document Type Labels ──────────────────────────────────────────────────────

DOCUMENT_TYPE_LABELS: Dict[str, str] = {
    "offer_letter":           "Offer Letter",
    "appointment_letter":     "Appointment Letter",
    "experience_letter":      "Experience Letter",
    "relieving_letter":       "Relieving Letter",
    "joining_letter":         "Joining Letter",
    "promotion_letter":       "Promotion Letter",
    "increment_letter":       "Increment Letter",
    "warning_letter":         "Warning Letter",
    "nda_agreement":          "NDA Agreement",
    "hr_policy":              "HR Policy",
    "payslip":                "Payslip",
    "salary_revision":        "Salary Revision Letter",
    "internship_letter":      "Internship Letter",
    "internship_completion":  "Internship Completion Certificate",
    "employee_id_letter":     "Employee ID Letter",
    "bonafide_letter":        "Bonafide Letter",
    "wfh_approval":           "WFH Approval Letter",
    "leave_approval":         "Leave Approval Letter",
    "termination_letter":     "Termination Letter",
    "custom":                 "Custom Template",
}

CATEGORY_DOC_TYPES: Dict[str, List[str]] = {
    "hr":          ["appointment_letter", "joining_letter", "employee_id_letter", "bonafide_letter", "wfh_approval", "leave_approval", "warning_letter", "termination_letter", "hr_policy"],
    "recruitment": ["offer_letter", "nda_agreement"],
    "payroll":     ["payslip", "salary_revision", "increment_letter"],
    "legal":       ["nda_agreement", "termination_letter"],
    "employee":    ["experience_letter", "relieving_letter", "promotion_letter", "internship_letter", "internship_completion"],
    "custom":      ["custom"],
}
