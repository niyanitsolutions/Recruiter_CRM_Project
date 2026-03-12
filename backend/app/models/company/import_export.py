"""
Import/Export Model - Phase 5
Bulk data import, export, and templates
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class ImportExportType(str, Enum):
    """Types of entities for import/export"""
    CANDIDATES = "candidates"
    CLIENTS = "clients"
    JOBS = "jobs"
    USERS = "users"
    APPLICATIONS = "applications"
    CONTACTS = "contacts"


class ImportStatus(str, Enum):
    """Import job status"""
    PENDING = "pending"
    VALIDATING = "validating"
    PROCESSING = "processing"
    COMPLETED = "completed"
    COMPLETED_WITH_ERRORS = "completed_with_errors"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExportStatus(str, Enum):
    """Export job status"""
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    EXPIRED = "expired"


class ExportFormat(str, Enum):
    """Export file formats"""
    EXCEL = "xlsx"
    CSV = "csv"
    PDF = "pdf"
    JSON = "json"


class ImportAction(str, Enum):
    """Action for duplicate handling"""
    SKIP = "skip"
    UPDATE = "update"
    CREATE_NEW = "create_new"


# ============== Display Names ==============

IMPORT_EXPORT_TYPE_DISPLAY = {
    ImportExportType.CANDIDATES: "Candidates",
    ImportExportType.CLIENTS: "Clients",
    ImportExportType.JOBS: "Jobs",
    ImportExportType.USERS: "Users",
    ImportExportType.APPLICATIONS: "Applications",
    ImportExportType.CONTACTS: "Contacts",
}

IMPORT_STATUS_DISPLAY = {
    ImportStatus.PENDING: "Pending",
    ImportStatus.VALIDATING: "Validating",
    ImportStatus.PROCESSING: "Processing",
    ImportStatus.COMPLETED: "Completed",
    ImportStatus.COMPLETED_WITH_ERRORS: "Completed with Errors",
    ImportStatus.FAILED: "Failed",
    ImportStatus.CANCELLED: "Cancelled",
}

EXPORT_STATUS_DISPLAY = {
    ExportStatus.PENDING: "Pending",
    ExportStatus.PROCESSING: "Processing",
    ExportStatus.COMPLETED: "Completed",
    ExportStatus.FAILED: "Failed",
    ExportStatus.EXPIRED: "Expired",
}


def get_import_status_display(status: ImportStatus) -> str:
    return IMPORT_STATUS_DISPLAY.get(status, status.value)


def get_export_status_display(status: ExportStatus) -> str:
    return EXPORT_STATUS_DISPLAY.get(status, status.value)


# ============== Sub-Models ==============

class ColumnMapping(BaseModel):
    """Mapping between file column and database field"""
    file_column: str
    db_field: str
    is_required: bool = False
    default_value: Optional[Any] = None
    transform: Optional[str] = None  # e.g., "uppercase", "lowercase", "date"


class ValidationError(BaseModel):
    """Validation error for a row"""
    row_number: int
    column: str
    value: Any
    error: str
    severity: str = "error"  # error, warning


class ImportRow(BaseModel):
    """Status of a single imported row"""
    row_number: int
    status: str  # success, error, skipped
    action: Optional[str] = None  # created, updated, skipped
    record_id: Optional[str] = None
    errors: List[str] = []
    warnings: List[str] = []
    data: Optional[Dict[str, Any]] = None


class FieldDefinition(BaseModel):
    """Field definition for import template"""
    field_name: str
    display_name: str
    data_type: str  # string, number, date, email, phone, boolean, enum
    is_required: bool = False
    max_length: Optional[int] = None
    allowed_values: Optional[List[str]] = None
    description: Optional[str] = None
    example: Optional[str] = None


# ============== Main Models ==============

class ImportTemplateModel(BaseModel):
    """Import template definition"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None  # None for system templates
    
    entity_type: ImportExportType
    name: str
    description: Optional[str] = None
    
    # Field definitions
    fields: List[FieldDefinition]
    required_fields: List[str] = []
    
    # Template file
    template_url: Optional[str] = None
    sample_data_url: Optional[str] = None
    
    # Settings
    is_system: bool = False
    is_active: bool = True
    
    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ImportJobModel(BaseModel):
    """Import job record (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # Job info
    entity_type: ImportExportType
    file_name: str
    file_url: str
    file_size: int = 0
    
    # Configuration
    column_mapping: List[ColumnMapping] = []
    duplicate_action: ImportAction = ImportAction.SKIP
    duplicate_check_fields: List[str] = []  # Fields to check for duplicates
    skip_first_row: bool = True  # Skip header row
    
    # Status
    status: ImportStatus = ImportStatus.PENDING
    
    # Progress
    total_rows: int = 0
    processed_rows: int = 0
    successful_rows: int = 0
    failed_rows: int = 0
    skipped_rows: int = 0
    
    # Results
    validation_errors: List[ValidationError] = []
    row_results: List[ImportRow] = []
    error_file_url: Optional[str] = None  # File with error details
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class ExportJobModel(BaseModel):
    """Export job record (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # Job info
    entity_type: ImportExportType
    export_name: str
    format: ExportFormat
    
    # Configuration
    filters: Dict[str, Any] = {}
    columns: List[str] = []  # Empty = all columns
    sort_by: Optional[str] = None
    sort_order: str = "asc"
    include_headers: bool = True
    
    # Status
    status: ExportStatus = ExportStatus.PENDING
    
    # Progress
    total_records: int = 0
    processed_records: int = 0
    
    # Result
    file_url: Optional[str] = None
    file_name: Optional[str] = None
    file_size: int = 0
    expires_at: Optional[datetime] = None
    
    # Error
    error_message: Optional[str] = None
    
    # Timing
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None
    
    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class StartImportRequest(BaseModel):
    """Request to start an import job"""
    entity_type: ImportExportType
    file_url: str
    file_name: str
    column_mapping: List[ColumnMapping]
    duplicate_action: ImportAction = ImportAction.SKIP
    duplicate_check_fields: List[str] = []
    skip_first_row: bool = True


class ValidateImportRequest(BaseModel):
    """Request to validate import file"""
    entity_type: ImportExportType
    file_url: str
    skip_first_row: bool = True
    sample_rows: int = 10


class ValidateImportResponse(BaseModel):
    """Response from import validation"""
    is_valid: bool
    total_rows: int
    sample_data: List[Dict[str, Any]]
    detected_columns: List[str]
    suggested_mapping: List[ColumnMapping]
    validation_errors: List[ValidationError]


class CreateExportRequest(BaseModel):
    """Request to create an export job"""
    entity_type: ImportExportType
    format: ExportFormat = ExportFormat.EXCEL
    filters: Optional[Dict[str, Any]] = None
    columns: Optional[List[str]] = None
    sort_by: Optional[str] = None
    sort_order: str = "asc"
    export_name: Optional[str] = None


class ImportJobResponse(ImportJobModel):
    """Import job response"""
    entity_type_display: Optional[str] = None
    status_display: Optional[str] = None
    progress_percentage: Optional[int] = None
    created_by_name: Optional[str] = None


class ImportJobListResponse(BaseModel):
    """List of import jobs"""
    items: List[ImportJobResponse]
    total: int
    page: int
    page_size: int


class ExportJobResponse(ExportJobModel):
    """Export job response"""
    entity_type_display: Optional[str] = None
    status_display: Optional[str] = None
    download_url: Optional[str] = None


class ExportJobListResponse(BaseModel):
    """List of export jobs"""
    items: List[ExportJobResponse]
    total: int
    page: int
    page_size: int


class TemplateResponse(ImportTemplateModel):
    """Template response with download URL"""
    download_url: Optional[str] = None
    entity_type_display: Optional[str] = None


class TemplateListResponse(BaseModel):
    """List of templates"""
    items: List[TemplateResponse]
    total: int


# ============== Default Templates ==============

CANDIDATE_IMPORT_FIELDS = [
    FieldDefinition(field_name="full_name", display_name="Full Name", data_type="string", is_required=True, max_length=100, example="John Doe"),
    FieldDefinition(field_name="email", display_name="Email", data_type="email", is_required=True, example="john@example.com"),
    FieldDefinition(field_name="mobile", display_name="Mobile", data_type="phone", is_required=True, example="+919876543210"),
    FieldDefinition(field_name="current_company", display_name="Current Company", data_type="string", example="Tech Corp"),
    FieldDefinition(field_name="current_designation", display_name="Current Designation", data_type="string", example="Senior Developer"),
    FieldDefinition(field_name="experience_years", display_name="Experience (Years)", data_type="number", example="5"),
    FieldDefinition(field_name="current_ctc", display_name="Current CTC", data_type="number", example="1200000"),
    FieldDefinition(field_name="expected_ctc", display_name="Expected CTC", data_type="number", example="1500000"),
    FieldDefinition(field_name="notice_period", display_name="Notice Period", data_type="enum", allowed_values=["immediate", "15_days", "30_days", "60_days", "90_days"], example="30_days"),
    FieldDefinition(field_name="location", display_name="Location", data_type="string", example="Mumbai"),
    FieldDefinition(field_name="skills", display_name="Skills (comma separated)", data_type="string", example="Python, React, AWS"),
    FieldDefinition(field_name="source", display_name="Source", data_type="enum", allowed_values=["direct", "referral", "job_portal", "linkedin", "partner", "other"], example="linkedin"),
]

CLIENT_IMPORT_FIELDS = [
    FieldDefinition(field_name="name", display_name="Company Name", data_type="string", is_required=True, max_length=200, example="Acme Inc"),
    FieldDefinition(field_name="industry", display_name="Industry", data_type="string", example="Technology"),
    FieldDefinition(field_name="website", display_name="Website", data_type="string", example="https://acme.com"),
    FieldDefinition(field_name="address", display_name="Address", data_type="string", example="123 Business Park"),
    FieldDefinition(field_name="city", display_name="City", data_type="string", example="Mumbai"),
    FieldDefinition(field_name="state", display_name="State", data_type="string", example="Maharashtra"),
    FieldDefinition(field_name="contact_name", display_name="Contact Person Name", data_type="string", is_required=True, example="Jane Smith"),
    FieldDefinition(field_name="contact_email", display_name="Contact Email", data_type="email", is_required=True, example="jane@acme.com"),
    FieldDefinition(field_name="contact_phone", display_name="Contact Phone", data_type="phone", example="+919876543210"),
    FieldDefinition(field_name="contact_designation", display_name="Contact Designation", data_type="string", example="HR Manager"),
]

JOB_IMPORT_FIELDS = [
    FieldDefinition(field_name="title", display_name="Job Title", data_type="string", is_required=True, example="Senior Software Engineer"),
    FieldDefinition(field_name="client_name", display_name="Client Name", data_type="string", is_required=True, example="Acme Inc"),
    FieldDefinition(field_name="positions", display_name="Number of Positions", data_type="number", is_required=True, example="5"),
    FieldDefinition(field_name="job_type", display_name="Job Type", data_type="enum", allowed_values=["full_time", "part_time", "contract", "internship"], example="full_time"),
    FieldDefinition(field_name="work_mode", display_name="Work Mode", data_type="enum", allowed_values=["onsite", "remote", "hybrid"], example="hybrid"),
    FieldDefinition(field_name="location", display_name="Location", data_type="string", example="Mumbai"),
    FieldDefinition(field_name="min_experience", display_name="Min Experience (Years)", data_type="number", example="3"),
    FieldDefinition(field_name="max_experience", display_name="Max Experience (Years)", data_type="number", example="7"),
    FieldDefinition(field_name="min_salary", display_name="Min Salary", data_type="number", example="1000000"),
    FieldDefinition(field_name="max_salary", display_name="Max Salary", data_type="number", example="1800000"),
    FieldDefinition(field_name="skills", display_name="Required Skills (comma separated)", data_type="string", example="Python, Django, PostgreSQL"),
    FieldDefinition(field_name="description", display_name="Job Description", data_type="string", example="Looking for experienced developers..."),
]