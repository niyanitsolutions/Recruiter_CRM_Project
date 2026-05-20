"""
Report Model - Phase 5
Report configurations, saved reports, and scheduled reports
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class ReportType(str, Enum):
    """Types of reports"""
    # Recruitment Reports
    PLACEMENTS_SUMMARY = "placements_summary"
    APPLICATION_FUNNEL = "application_funnel"
    TIME_TO_HIRE = "time_to_hire"
    SOURCE_EFFECTIVENESS = "source_effectiveness"
    JOB_AGING = "job_aging"
    CANDIDATE_PIPELINE = "candidate_pipeline"
    INTERVIEW_CONVERSION = "interview_conversion"
    RECRUITER_PERFORMANCE = "recruiter_performance"

    # Client Reports
    CLIENT_SUMMARY = "client_summary"
    CLIENT_HIRING_TREND = "client_hiring_trend"

    # Financial Reports
    PAYOUT_SUMMARY = "payout_summary"
    INVOICE_AGING = "invoice_aging"
    REVENUE_BY_CLIENT = "revenue_by_client"
    COMMISSION_TRENDS = "commission_trends"
    PAYMENT_HISTORY = "payment_history"
    TAX_SUMMARY = "tax_summary"

    # Onboarding Reports
    OFFER_ACCEPTANCE = "offer_acceptance"
    NO_SHOW_ANALYSIS = "no_show_analysis"
    DOJ_EXTENSIONS = "doj_extensions"
    DOCUMENT_COMPLIANCE = "document_compliance"
    PAYOUT_ELIGIBILITY = "payout_eligibility"

    # Team Reports
    COORDINATOR_ACTIVITY = "coordinator_activity"
    USER_PRODUCTIVITY = "user_productivity"
    RESPONSE_TIME = "response_time"

    # Audit Reports
    LOGIN_ACTIVITY = "login_activity"
    USER_ACTIONS = "user_actions"

    # HRM Reports
    HRM_ATTENDANCE_SUMMARY = "hrm_attendance_summary"
    HRM_LEAVE_SUMMARY = "hrm_leave_summary"
    HRM_PAYROLL_SUMMARY = "hrm_payroll_summary"
    HRM_HEADCOUNT = "hrm_headcount"
    HRM_EMPLOYEE_DIRECTORY = "hrm_employee_directory"
    HRM_ASSET_REGISTER = "hrm_asset_register"
    HRM_EXIT_SUMMARY = "hrm_exit_summary"


class ReportCategory(str, Enum):
    """Report categories"""
    RECRUITMENT = "recruitment"
    CLIENT = "client"
    FINANCIAL = "financial"
    ONBOARDING = "onboarding"
    TEAM = "team"
    AUDIT = "audit"
    HRM = "hrm"
    CUSTOM = "custom"


class ReportFormat(str, Enum):
    """Export formats"""
    JSON = "json"
    EXCEL = "excel"
    PDF = "pdf"
    CSV = "csv"


class ScheduleFrequency(str, Enum):
    """Report schedule frequency"""
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"


class DateRangePreset(str, Enum):
    """Preset date ranges"""
    TODAY = "today"
    YESTERDAY = "yesterday"
    THIS_WEEK = "this_week"
    LAST_WEEK = "last_week"
    THIS_MONTH = "this_month"
    LAST_MONTH = "last_month"
    THIS_QUARTER = "this_quarter"
    LAST_QUARTER = "last_quarter"
    LAST_6_MONTHS = "last_6_months"
    LAST_12_MONTHS = "last_12_months"
    THIS_YEAR = "this_year"
    LAST_YEAR = "last_year"
    CUSTOM = "custom"


# ============== Display Names ==============

REPORT_TYPE_DISPLAY = {
    ReportType.PLACEMENTS_SUMMARY: "Placements Summary",
    ReportType.APPLICATION_FUNNEL: "Application Funnel",
    ReportType.TIME_TO_HIRE: "Time to Hire",
    ReportType.SOURCE_EFFECTIVENESS: "Source Effectiveness",
    ReportType.JOB_AGING: "Job Aging Report",
    ReportType.CANDIDATE_PIPELINE: "Candidate Pipeline",
    ReportType.INTERVIEW_CONVERSION: "Interview Conversion",
    ReportType.RECRUITER_PERFORMANCE: "Recruiter Performance",
    ReportType.CLIENT_SUMMARY: "Client Summary",
    ReportType.CLIENT_HIRING_TREND: "Client Hiring Trend",
    ReportType.PAYOUT_SUMMARY: "Payout Summary",
    ReportType.INVOICE_AGING: "Invoice Aging",
    ReportType.REVENUE_BY_CLIENT: "Revenue by Client",
    ReportType.COMMISSION_TRENDS: "Commission Trends",
    ReportType.PAYMENT_HISTORY: "Payment History",
    ReportType.TAX_SUMMARY: "GST/TDS Summary",
    ReportType.OFFER_ACCEPTANCE: "Offer Acceptance Rate",
    ReportType.NO_SHOW_ANALYSIS: "No-Show Analysis",
    ReportType.DOJ_EXTENSIONS: "DOJ Extensions",
    ReportType.DOCUMENT_COMPLIANCE: "Document Compliance",
    ReportType.PAYOUT_ELIGIBILITY: "Payout Eligibility Tracker",
    ReportType.COORDINATOR_ACTIVITY: "Coordinator Activity",
    ReportType.USER_PRODUCTIVITY: "User Productivity",
    ReportType.RESPONSE_TIME: "Response Time Metrics",
    ReportType.LOGIN_ACTIVITY: "Login Activity Report",
    ReportType.USER_ACTIONS: "User Actions Report",
    # HRM
    ReportType.HRM_ATTENDANCE_SUMMARY: "HRM Attendance Summary",
    ReportType.HRM_LEAVE_SUMMARY: "HRM Leave Summary",
    ReportType.HRM_PAYROLL_SUMMARY: "HRM Payroll Summary",
    ReportType.HRM_HEADCOUNT: "Headcount Report",
    ReportType.HRM_EMPLOYEE_DIRECTORY: "Employee Directory",
    ReportType.HRM_ASSET_REGISTER: "Asset Register",
    ReportType.HRM_EXIT_SUMMARY: "Exit Summary Report",
}

REPORT_CATEGORY_DISPLAY = {
    ReportCategory.RECRUITMENT: "Recruitment",
    ReportCategory.CLIENT: "Client",
    ReportCategory.FINANCIAL: "Financial",
    ReportCategory.ONBOARDING: "Onboarding",
    ReportCategory.TEAM: "Team Performance",
    ReportCategory.AUDIT: "Audit & Security",
    ReportCategory.HRM: "HRM",
    ReportCategory.CUSTOM: "Custom",
}

REPORT_TYPE_DESCRIPTIONS = {
    ReportType.PLACEMENTS_SUMMARY: "Overview of all placements grouped by client and partner with CTC breakdown",
    ReportType.APPLICATION_FUNNEL: "Track candidate progression through every stage of the hiring funnel",
    ReportType.TIME_TO_HIRE: "Average, minimum and maximum days from application to joining per client",
    ReportType.SOURCE_EFFECTIVENESS: "Compare candidate sources by application volume, conversion and joining rates",
    ReportType.JOB_AGING: "Open job postings segmented by age bucket — identify stale positions",
    ReportType.CANDIDATE_PIPELINE: "Live view of all candidates by their current pipeline stage",
    ReportType.INTERVIEW_CONVERSION: "Interview-to-offer-to-join conversion rates with drop-off analysis",
    ReportType.RECRUITER_PERFORMANCE: "Recruiter leaderboard with placements, revenue and activity metrics",
    ReportType.CLIENT_SUMMARY: "Client-level overview of open positions, placements, revenue and SLA",
    ReportType.CLIENT_HIRING_TREND: "Month-over-month hiring volume and closure rate per client",
    ReportType.PAYOUT_SUMMARY: "Partner payout breakdown by status — pending, eligible and paid",
    ReportType.INVOICE_AGING: "Outstanding partner invoices segmented by age — 0-30, 30-60, 60-90, 90+ days",
    ReportType.REVENUE_BY_CLIENT: "Gross revenue, GST and net revenue breakdown per client company",
    ReportType.COMMISSION_TRENDS: "Monthly commission earned per partner with trend analysis",
    ReportType.PAYMENT_HISTORY: "Complete log of all processed payments with dates and amounts",
    ReportType.TAX_SUMMARY: "GST and TDS summary for all transactions in the selected period",
    ReportType.OFFER_ACCEPTANCE: "Offer acceptance and join rates broken down by client",
    ReportType.NO_SHOW_ANALYSIS: "Candidates who accepted offers but did not join on the DOJ",
    ReportType.DOJ_EXTENSIONS: "Onboards with extended date of joining — frequency and duration",
    ReportType.DOCUMENT_COMPLIANCE: "Candidates missing required onboarding documents",
    ReportType.PAYOUT_ELIGIBILITY: "Candidates who have joined but whose partner payout is not yet processed",
    ReportType.COORDINATOR_ACTIVITY: "Per-user action counts from audit logs — creates, updates, deletes",
    ReportType.USER_PRODUCTIVITY: "Detailed productivity: applications owned, interviews scheduled, offers released",
    ReportType.RESPONSE_TIME: "Average time for coordinators to move candidates through pipeline stages",
    ReportType.LOGIN_ACTIVITY: "User login history with device, location and session duration",
    ReportType.USER_ACTIONS: "Detailed audit trail of all user actions within the selected period",
    # HRM
    ReportType.HRM_ATTENDANCE_SUMMARY: "Daily attendance log with check-in/out times, work hours, breaks, and late/half-day flags",
    ReportType.HRM_LEAVE_SUMMARY: "Leave applications by employee and type — pending, approved, and rejected breakdown",
    ReportType.HRM_PAYROLL_SUMMARY: "Monthly payroll with CTC, gross salary, deductions, and net take-home per employee",
    ReportType.HRM_HEADCOUNT: "Headcount by department and designation — active, on-leave, and attrition data",
    ReportType.HRM_EMPLOYEE_DIRECTORY: "Full employee directory with contact details, department, designation, and joining date",
    ReportType.HRM_ASSET_REGISTER: "Complete asset inventory with status, assigned employee, and warranty details",
    ReportType.HRM_EXIT_SUMMARY: "Employee exits by type (resignation/termination) with notice period and clearance status",
}


def get_report_type_display(report_type: ReportType) -> str:
    return REPORT_TYPE_DISPLAY.get(report_type, report_type.value)


def get_report_category_display(category: ReportCategory) -> str:
    return REPORT_CATEGORY_DISPLAY.get(category, category.value)


# ============== Sub-Models ==============

class DateRange(BaseModel):
    """Date range for reports"""
    preset: Optional[DateRangePreset] = None
    start_date: Optional[date] = None
    end_date: Optional[date] = None


class ReportFilter(BaseModel):
    """Filters for report generation"""
    date_range: Optional[DateRange] = None
    client_ids: Optional[List[str]] = None
    partner_ids: Optional[List[str]] = None
    coordinator_ids: Optional[List[str]] = None
    job_ids: Optional[List[str]] = None
    status: Optional[List[str]] = None
    group_by: Optional[str] = None  # day, week, month, quarter, year
    custom_filters: Optional[Dict[str, Any]] = None


class ReportColumn(BaseModel):
    """Column definition for report"""
    key: str
    label: str
    data_type: str = "string"  # string, number, currency, percentage, date
    sortable: bool = True
    visible: bool = True
    width: Optional[int] = None
    format: Optional[str] = None


class ScheduleConfig(BaseModel):
    """Schedule configuration for automated reports"""
    frequency: ScheduleFrequency
    day_of_week: Optional[int] = None  # 0-6 for weekly
    day_of_month: Optional[int] = None  # 1-31 for monthly
    time: str = "09:00"  # HH:MM format
    timezone: str = "Asia/Kolkata"
    recipients: List[str] = []  # Email addresses
    format: ReportFormat = ReportFormat.EXCEL
    is_active: bool = True


# ============== Main Models ==============

class ReportDefinition(BaseModel):
    """Report definition/template"""
    report_type: ReportType
    category: ReportCategory
    name: str
    description: Optional[str] = None
    columns: List[ReportColumn] = []
    default_filters: Optional[ReportFilter] = None
    supports_export: List[ReportFormat] = [ReportFormat.EXCEL, ReportFormat.PDF, ReportFormat.CSV]
    supports_scheduling: bool = True
    requires_permissions: List[str] = []


class SavedReportModel(BaseModel):
    """Saved report configuration (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # Report details
    name: str
    description: Optional[str] = None
    report_type: ReportType
    category: ReportCategory
    
    # Configuration
    filters: ReportFilter
    columns: Optional[List[str]] = None  # Selected column keys
    sort_by: Optional[str] = None
    sort_order: str = "asc"
    
    # Sharing
    is_public: bool = False  # Visible to all users
    shared_with: List[str] = []  # User IDs
    
    # Schedule
    schedule: Optional[ScheduleConfig] = None
    last_run: Optional[datetime] = None
    next_run: Optional[datetime] = None
    
    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class ReportExecutionLog(BaseModel):
    """Log of report executions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    report_id: Optional[str] = None  # If from saved report
    report_type: ReportType
    report_name: str
    
    # Execution details
    filters_used: Dict[str, Any] = {}
    format: ReportFormat
    row_count: int = 0
    execution_time_ms: int = 0
    
    # Result
    status: str = "completed"  # completed, failed, cancelled
    error_message: Optional[str] = None
    file_url: Optional[str] = None  # For exported files
    
    # Trigger
    triggered_by: str  # user_id or "scheduler"
    trigger_type: str = "manual"  # manual, scheduled, api
    
    # Audit
    executed_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class GenerateReportRequest(BaseModel):
    """Request to generate a report"""
    report_type: ReportType
    filters: Optional[ReportFilter] = None
    columns: Optional[List[str]] = None
    format: ReportFormat = ReportFormat.JSON
    include_charts: bool = False


class SaveReportRequest(BaseModel):
    """Request to save a report configuration"""
    name: str
    description: Optional[str] = None
    report_type: ReportType
    filters: ReportFilter
    columns: Optional[List[str]] = None
    sort_by: Optional[str] = None
    sort_order: str = "asc"
    is_public: bool = False
    shared_with: List[str] = []
    schedule: Optional[ScheduleConfig] = None


class UpdateSavedReportRequest(BaseModel):
    """Request to update a saved report"""
    name: Optional[str] = None
    description: Optional[str] = None
    filters: Optional[ReportFilter] = None
    columns: Optional[List[str]] = None
    sort_by: Optional[str] = None
    sort_order: Optional[str] = None
    is_public: Optional[bool] = None
    shared_with: Optional[List[str]] = None
    schedule: Optional[ScheduleConfig] = None


class ReportResponse(BaseModel):
    """Report generation response"""
    report_type: ReportType
    report_name: str
    generated_at: datetime
    filters_applied: Dict[str, Any]
    
    # Data
    columns: List[ReportColumn]
    data: List[Dict[str, Any]]
    total_rows: int
    
    # Summary
    summary: Optional[Dict[str, Any]] = None
    
    # Charts data (if requested)
    charts: Optional[List[Dict[str, Any]]] = None


class SavedReportResponse(SavedReportModel):
    """Saved report response"""
    type_display: Optional[str] = None
    category_display: Optional[str] = None
    created_by_name: Optional[str] = None


class SavedReportListResponse(BaseModel):
    """List of saved reports"""
    items: List[SavedReportResponse]
    total: int
    page: int
    page_size: int


class ReportExportResponse(BaseModel):
    """Export response"""
    file_url: str
    file_name: str
    format: ReportFormat
    size_bytes: int
    expires_at: datetime


# ============== Report Data Models ==============

class PlacementSummaryData(BaseModel):
    """Data structure for placement summary report"""
    period: str
    total_placements: int = 0
    total_revenue: float = 0
    by_client: List[Dict[str, Any]] = []
    by_partner: List[Dict[str, Any]] = []
    by_coordinator: List[Dict[str, Any]] = []


class ApplicationFunnelData(BaseModel):
    """Data structure for application funnel report"""
    total_applications: int = 0
    by_stage: Dict[str, int] = {}
    conversion_rates: Dict[str, float] = {}
    avg_time_per_stage: Dict[str, float] = {}


class TimeToHireData(BaseModel):
    """Data structure for time-to-hire report"""
    avg_days_to_hire: float = 0
    median_days_to_hire: float = 0
    by_client: List[Dict[str, Any]] = []
    by_job_type: List[Dict[str, Any]] = []
    trend: List[Dict[str, Any]] = []


class FinancialSummaryData(BaseModel):
    """Data structure for financial reports"""
    total_revenue: float = 0
    total_payouts: float = 0
    total_gst: float = 0
    total_tds: float = 0
    net_revenue: float = 0
    pending_payouts: float = 0
    by_period: List[Dict[str, Any]] = []