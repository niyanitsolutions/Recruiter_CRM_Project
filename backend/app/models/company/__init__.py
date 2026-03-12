"""
Company Level Models - Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
All models for company-specific database
"""

# ============== Phase 2 - User Management ==============
from .user import (
    UserModel,
    UserCreate,
    UserUpdate,
    UserProfileUpdate,
    UserResponse,
    UserListResponse,
    ChangePasswordRequest,
    ResetPasswordByAdmin,
    UserStatus,
    UserRole,
    get_role_display_name,
    ROLE_DISPLAY_NAMES
)

from .role import (
    RoleModel,
    RoleCreate,
    RoleUpdate,
    RoleResponse,
    SystemRole,
    Permission,
    ROLE_DEFAULT_PERMISSIONS
)

from .department import (
    DepartmentModel,
    DepartmentCreate,
    DepartmentUpdate,
    DepartmentResponse
)

from .designation import (
    DesignationModel,
    DesignationCreate,
    DesignationUpdate,
    DesignationResponse,
    LEVEL_NAMES,
    get_level_name
)

from .audit_log import (
    AuditLogModel,
    AuditLogCreate,
    AuditLogResponse,
    AuditLogDetailResponse,
    AuditLogFilter,
    AuditAction,
    EntityType as AuditEntityType,
    get_action_display,
    get_entity_display,
    calculate_changed_fields
)

# ============== Phase 3 - Recruitment Core ==============
from .client import (
    ClientModel,
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientListResponse,
    ClientStatus,
    ClientType,
    ContactPerson,
    CLIENT_TYPE_DISPLAY,
    get_client_type_display
)

from .candidate import (
    CandidateModel,
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    CandidateListResponse,
    CandidateSearchParams,
    CandidateStatus,
    CandidateSource,
    NoticePeriod,
    Gender,
    MaritalStatus,
    SkillItem,
    EducationItem,
    WorkExperienceItem,
    CertificationItem,
    LanguageItem,
    DocumentItem,
    CustomFieldValue,
    ResumeParseResult,
    CANDIDATE_STATUS_DISPLAY,
    CANDIDATE_SOURCE_DISPLAY,
    NOTICE_PERIOD_DISPLAY,
    get_status_display as get_candidate_status_display,
    get_source_display,
    get_notice_period_display
)

from .job import (
    JobModel,
    JobCreate,
    JobUpdate,
    JobResponse,
    JobListResponse,
    JobSearchParams,
    JobStatus,
    JobType,
    WorkMode,
    Priority,
    SalaryRange,
    ExperienceRange,
    SkillRequirement,
    EducationRequirement,
    EligibilityCriteria,
    JOB_STATUS_DISPLAY,
    JOB_TYPE_DISPLAY,
    WORK_MODE_DISPLAY,
    PRIORITY_DISPLAY,
    get_job_status_display,
    get_job_type_display,
    get_work_mode_display,
    get_priority_display
)

from .application import (
    ApplicationModel,
    ApplicationCreate,
    ApplicationUpdate,
    ApplicationStatusUpdate,
    ApplicationResponse,
    ApplicationListResponse,
    ApplicationStatus,
    RejectionReason,
    StageHistory,
    APPLICATION_STATUS_DISPLAY,
    REJECTION_REASON_DISPLAY,
    get_application_status_display,
    get_rejection_reason_display
)

from .interview import (
    InterviewModel,
    InterviewCreate,
    InterviewUpdate,
    InterviewReschedule,
    InterviewFeedbackSubmit,
    InterviewResponse,
    InterviewListResponse,
    InterviewStatus,
    InterviewMode,
    InterviewResult,
    FeedbackRating,
    SkillRating,
    InterviewFeedback,
    RescheduleHistory,
    INTERVIEW_STATUS_DISPLAY,
    INTERVIEW_MODE_DISPLAY,
    INTERVIEW_RESULT_DISPLAY,
    get_interview_status_display,
    get_interview_mode_display,
    get_interview_result_display
)

from .settings import (
    # Custom Fields
    CustomFieldDefinition,
    CustomFieldCreate,
    CustomFieldUpdate,
    FieldType,
    EntityType as SettingsEntityType,
    SelectOption,
    FIELD_TYPE_DISPLAY,
    get_field_type_display,
    
    # Interview Stages
    InterviewStageDefinition,
    InterviewStageCreate,
    InterviewStageUpdate,
    DEFAULT_INTERVIEW_STAGES,
    
    # Email Templates
    EmailTemplate,
    EmailTemplateCreate,
    EmailTemplateUpdate,
    DEFAULT_EMAIL_TEMPLATES,
    
    # Company Settings
    CompanySettings,
    CompanySettingsUpdate
)

# ============== Phase 4 - Onboarding & Partner Payout ==============
from .onboard import (
    OnboardModel,
    OnboardCreate,
    OnboardUpdate,
    OnboardStatusUpdate,
    OnboardResponse,
    OnboardListResponse,
    OnboardStatus,
    DocumentStatus,
    OnboardDocument,
    DOJExtension,
    DocumentUpdate,
    StatusHistory,
    ReminderLog,
    OnboardDashboardStats,
    ONBOARD_STATUS_DISPLAY,
    DOCUMENT_STATUS_DISPLAY,
    get_onboard_status_display,
    get_document_status_display
)

from .partner_payout import (
    PartnerPayoutModel,
    PartnerPayoutCreate,
    PartnerPayoutResponse,
    PartnerPayoutListResponse,
    PayoutStatus,
    InvoiceStatus,
    PaymentMethod,
    CommissionType,
    InvoiceModel,
    InvoiceCreate,
    InvoiceApprove,
    InvoiceReject,
    InvoiceResponse,
    InvoiceListResponse,
    InvoiceItem,
    PaymentRecord,
    PartnerCommissionRule,
    PayoutCalculation,
    PartnerPayoutStats,
    AccountsPayoutDashboard,
    PAYOUT_STATUS_DISPLAY,
    INVOICE_STATUS_DISPLAY,
    PAYMENT_METHOD_DISPLAY,
    COMMISSION_TYPE_DISPLAY,
    get_payout_status_display,
    get_invoice_status_display
)

from .notification import (
    NotificationModel,
    NotificationCreate,
    NotificationResponse,
    NotificationListResponse,
    NotificationType,
    NotificationChannel,
    NotificationPriority,
    NotificationStatus,
    ScheduledReminderModel,
    ScheduledReminderCreate,
    ScheduledReminderType,
    ScheduledReminderStatus,
    NotificationPreference,
    NotificationPreferenceUpdate,
    NOTIFICATION_TYPE_DISPLAY,
    NOTIFICATION_CHANNEL_DISPLAY,
    NOTIFICATION_PRIORITY_DISPLAY,
    get_notification_type_display
)

# ============== Phase 5 - Reports, Analytics, Import/Export, Targets, Audit ==============
from .report import (
    # Enums
    ReportType,
    ReportCategory,
    ReportFormat,
    ScheduleFrequency,
    DateRangePreset,
    # Display helpers
    REPORT_TYPE_DISPLAY,
    REPORT_CATEGORY_DISPLAY,
    get_report_type_display,
    get_report_category_display,
    # Sub-models
    DateRange,
    ReportFilter,
    ReportColumn,
    ScheduleConfig,
    # Main models
    ReportDefinition,
    SavedReportModel,
    ReportExecutionLog,
    # Request/Response
    GenerateReportRequest,
    SaveReportRequest,
    UpdateSavedReportRequest,
    ReportResponse,
    SavedReportResponse,
    SavedReportListResponse,
    ReportExportResponse,
    # Data models
    PlacementSummaryData,
    ApplicationFunnelData,
    TimeToHireData,
    FinancialSummaryData
)

from .analytics import (
    # Enums
    ChartType,
    MetricType,
    ComparisonPeriod,
    WidgetSize,
    TrendDirection,
    # Sub-models
    KPIValue,
    ChartDataPoint,
    ChartSeries,
    ChartConfig,
    WidgetConfig,
    # Main models
    DashboardKPIs,
    RecruitmentAnalytics,
    FinancialAnalytics,
    TeamAnalytics,
    OnboardingAnalytics,
    DashboardLayout,
    # Request/Response
    AnalyticsRequest,
    DashboardResponse,
    ChartResponse,
    WidgetDataResponse,
    SaveDashboardRequest,
    UpdateDashboardRequest,
    # Defaults
    DEFAULT_WIDGETS
)

from .scheduled_task import (
    # Enums
    TaskType,
    TaskStatus,
    TaskPriority,
    TaskFrequency,
    # Display helpers
    TASK_TYPE_DISPLAY,
    TASK_STATUS_DISPLAY,
    get_task_type_display,
    get_task_status_display,
    # Sub-models
    TaskSchedule,
    TaskResult,
    RetryConfig,
    # Main models
    ScheduledTaskModel,
    TaskExecutionLog,
    # Request/Response
    CreateTaskRequest,
    UpdateTaskRequest,
    TaskResponse,
    TaskListResponse,
    TaskExecutionResponse,
    TaskExecutionListResponse,
    RunTaskRequest,
    RunTaskResponse,
    # Defaults
    DEFAULT_DAILY_TASKS,
    DEFAULT_WEEKLY_TASKS,
    DEFAULT_MONTHLY_TASKS
)

from .import_export import (
    # Enums
    ImportExportType,
    ImportStatus,
    ExportStatus,
    ExportFormat,
    ImportAction,
    # Display helpers
    IMPORT_EXPORT_TYPE_DISPLAY,
    IMPORT_STATUS_DISPLAY,
    EXPORT_STATUS_DISPLAY,
    get_import_status_display,
    get_export_status_display,
    # Sub-models
    ColumnMapping,
    ValidationError,
    ImportRow,
    FieldDefinition,
    # Main models
    ImportTemplateModel,
    ImportJobModel,
    ExportJobModel,
    # Request/Response
    StartImportRequest,
    ValidateImportRequest,
    ValidateImportResponse,
    CreateExportRequest,
    ImportJobResponse,
    ImportJobListResponse,
    ExportJobResponse,
    ExportJobListResponse,
    TemplateResponse,
    TemplateListResponse,
    # Defaults
    CANDIDATE_IMPORT_FIELDS,
    CLIENT_IMPORT_FIELDS,
    JOB_IMPORT_FIELDS
)

from .target import (
    # Enums
    TargetType,
    TargetPeriod,
    TargetStatus,
    TargetScope,
    # Display helpers
    TARGET_TYPE_DISPLAY,
    TARGET_PERIOD_DISPLAY,
    TARGET_STATUS_DISPLAY,
    get_target_type_display,
    get_target_period_display,
    get_target_status_display,
    # Sub-models
    TargetMilestone,
    TargetProgress,
    LeaderboardEntry,
    # Main models
    TargetModel,
    TargetHistoryModel,
    TargetTemplateModel,
    # Request/Response
    CreateTargetRequest,
    UpdateTargetRequest,
    BulkCreateTargetRequest,
    UpdateProgressRequest,
    TargetResponse,
    TargetListResponse,
    TargetSummaryResponse,
    LeaderboardResponse,
    TargetDashboardResponse,
    # Defaults
    DEFAULT_TARGET_TEMPLATES
)

from .audit_advanced import (
    # Enums
    AuditAction as AdvancedAuditAction,
    AuditSeverity,
    SessionStatus,
    AlertType,
    # Display helpers
    AUDIT_ACTION_DISPLAY,
    AUDIT_SEVERITY_DISPLAY,
    get_audit_action_display,
    get_audit_severity_display,
    # Sub-models
    FieldChange,
    GeoLocation,
    DeviceInfo,
    # Main models
    AuditLogModel as AdvancedAuditLogModel,
    SessionModel,
    SecurityAlertModel,
    LoginHistoryModel,
    # Request/Response
    AuditLogSearchRequest,
    AuditLogResponse as AdvancedAuditLogResponse,
    AuditLogListResponse as AdvancedAuditLogListResponse,
    AuditTimelineResponse,
    SessionResponse,
    SessionListResponse,
    RevokeSessionRequest,
    RevokeAllSessionsRequest,
    SecurityAlertResponse,
    SecurityAlertListResponse,
    ResolveAlertRequest,
    AuditSummaryResponse,
    UserActivityResponse,
    ChangeHistoryResponse
)


__all__ = [
    # ============== Phase 2 - User Management ==============
    # User
    'UserModel',
    'UserCreate',
    'UserUpdate',
    'UserProfileUpdate',
    'UserResponse',
    'UserListResponse',
    'ChangePasswordRequest',
    'ResetPasswordByAdmin',
    'UserStatus',
    'UserRole',
    'get_role_display_name',
    'ROLE_DISPLAY_NAMES',
    
    # Role
    'RoleModel',
    'RoleCreate',
    'RoleUpdate',
    'RoleResponse',
    'SystemRole',
    'Permission',
    'ROLE_DEFAULT_PERMISSIONS',
    
    # Department
    'DepartmentModel',
    'DepartmentCreate',
    'DepartmentUpdate',
    'DepartmentResponse',
    
    # Designation
    'DesignationModel',
    'DesignationCreate',
    'DesignationUpdate',
    'DesignationResponse',
    'LEVEL_NAMES',
    'get_level_name',
    
    # Audit Log
    'AuditLogModel',
    'AuditLogCreate',
    'AuditLogResponse',
    'AuditLogDetailResponse',
    'AuditLogFilter',
    'AuditAction',
    'AuditEntityType',
    'get_action_display',
    'get_entity_display',
    'calculate_changed_fields',
    
    # ============== Phase 3 - Recruitment Core ==============
    # Client
    'ClientModel',
    'ClientCreate',
    'ClientUpdate',
    'ClientResponse',
    'ClientListResponse',
    'ClientStatus',
    'ClientType',
    'ContactPerson',
    'CLIENT_TYPE_DISPLAY',
    'get_client_type_display',
    
    # Candidate
    'CandidateModel',
    'CandidateCreate',
    'CandidateUpdate',
    'CandidateResponse',
    'CandidateListResponse',
    'CandidateSearchParams',
    'CandidateStatus',
    'CandidateSource',
    'NoticePeriod',
    'Gender',
    'MaritalStatus',
    'SkillItem',
    'EducationItem',
    'WorkExperienceItem',
    'CertificationItem',
    'LanguageItem',
    'DocumentItem',
    'CustomFieldValue',
    'ResumeParseResult',
    'CANDIDATE_STATUS_DISPLAY',
    'CANDIDATE_SOURCE_DISPLAY',
    'NOTICE_PERIOD_DISPLAY',
    'get_candidate_status_display',
    'get_source_display',
    'get_notice_period_display',
    
    # Job
    'JobModel',
    'JobCreate',
    'JobUpdate',
    'JobResponse',
    'JobListResponse',
    'JobSearchParams',
    'JobStatus',
    'JobType',
    'WorkMode',
    'Priority',
    'SalaryRange',
    'ExperienceRange',
    'SkillRequirement',
    'EducationRequirement',
    'EligibilityCriteria',
    'JOB_STATUS_DISPLAY',
    'JOB_TYPE_DISPLAY',
    'WORK_MODE_DISPLAY',
    'PRIORITY_DISPLAY',
    'get_job_status_display',
    'get_job_type_display',
    'get_work_mode_display',
    'get_priority_display',
    
    # Application
    'ApplicationModel',
    'ApplicationCreate',
    'ApplicationUpdate',
    'ApplicationStatusUpdate',
    'ApplicationResponse',
    'ApplicationListResponse',
    'ApplicationStatus',
    'RejectionReason',
    'StageHistory',
    'APPLICATION_STATUS_DISPLAY',
    'REJECTION_REASON_DISPLAY',
    'get_application_status_display',
    'get_rejection_reason_display',
    
    # Interview
    'InterviewModel',
    'InterviewCreate',
    'InterviewUpdate',
    'InterviewReschedule',
    'InterviewFeedbackSubmit',
    'InterviewResponse',
    'InterviewListResponse',
    'InterviewStatus',
    'InterviewMode',
    'InterviewResult',
    'FeedbackRating',
    'SkillRating',
    'InterviewFeedback',
    'RescheduleHistory',
    'INTERVIEW_STATUS_DISPLAY',
    'INTERVIEW_MODE_DISPLAY',
    'INTERVIEW_RESULT_DISPLAY',
    'get_interview_status_display',
    'get_interview_mode_display',
    'get_interview_result_display',
    
    # Settings - Custom Fields
    'CustomFieldDefinition',
    'CustomFieldCreate',
    'CustomFieldUpdate',
    'FieldType',
    'SettingsEntityType',
    'SelectOption',
    'FIELD_TYPE_DISPLAY',
    'get_field_type_display',
    
    # Settings - Interview Stages
    'InterviewStageDefinition',
    'InterviewStageCreate',
    'InterviewStageUpdate',
    'DEFAULT_INTERVIEW_STAGES',
    
    # Settings - Email Templates
    'EmailTemplate',
    'EmailTemplateCreate',
    'EmailTemplateUpdate',
    'DEFAULT_EMAIL_TEMPLATES',
    
    # Settings - Company Settings
    'CompanySettings',
    'CompanySettingsUpdate',
    
    # ============== Phase 4 - Onboarding & Partner Payout ==============
    # Onboard
    'OnboardModel',
    'OnboardCreate',
    'OnboardUpdate',
    'OnboardStatusUpdate',
    'OnboardResponse',
    'OnboardListResponse',
    'OnboardStatus',
    'DocumentStatus',
    'OnboardDocument',
    'DOJExtension',
    'DocumentUpdate',
    'StatusHistory',
    'ReminderLog',
    'OnboardDashboardStats',
    'ONBOARD_STATUS_DISPLAY',
    'DOCUMENT_STATUS_DISPLAY',
    'get_onboard_status_display',
    'get_document_status_display',
    
    # Partner Payout
    'PartnerPayoutModel',
    'PartnerPayoutCreate',
    'PartnerPayoutResponse',
    'PartnerPayoutListResponse',
    'PayoutStatus',
    'InvoiceStatus',
    'PaymentMethod',
    'CommissionType',
    'InvoiceModel',
    'InvoiceCreate',
    'InvoiceApprove',
    'InvoiceReject',
    'InvoiceResponse',
    'InvoiceListResponse',
    'InvoiceItem',
    'PaymentRecord',
    'PartnerCommissionRule',
    'PayoutCalculation',
    'PartnerPayoutStats',
    'AccountsPayoutDashboard',
    'PAYOUT_STATUS_DISPLAY',
    'INVOICE_STATUS_DISPLAY',
    'PAYMENT_METHOD_DISPLAY',
    'COMMISSION_TYPE_DISPLAY',
    'get_payout_status_display',
    'get_invoice_status_display',
    
    # Notification
    'NotificationModel',
    'NotificationCreate',
    'NotificationResponse',
    'NotificationListResponse',
    'NotificationType',
    'NotificationChannel',
    'NotificationPriority',
    'NotificationStatus',
    'ScheduledReminderModel',
    'ScheduledReminderCreate',
    'ScheduledReminderType',
    'ScheduledReminderStatus',
    'NotificationPreference',
    'NotificationPreferenceUpdate',
    'NOTIFICATION_TYPE_DISPLAY',
    'NOTIFICATION_CHANNEL_DISPLAY',
    'NOTIFICATION_PRIORITY_DISPLAY',
    'get_notification_type_display',
    
    # ============== Phase 5 - Reports, Analytics, Import/Export, Targets, Audit ==============
    # Report
    'ReportType',
    'ReportCategory',
    'ReportFormat',
    'ScheduleFrequency',
    'DateRangePreset',
    'REPORT_TYPE_DISPLAY',
    'REPORT_CATEGORY_DISPLAY',
    'get_report_type_display',
    'get_report_category_display',
    'DateRange',
    'ReportFilter',
    'ReportColumn',
    'ScheduleConfig',
    'ReportDefinition',
    'SavedReportModel',
    'ReportExecutionLog',
    'GenerateReportRequest',
    'SaveReportRequest',
    'UpdateSavedReportRequest',
    'ReportResponse',
    'SavedReportResponse',
    'SavedReportListResponse',
    'ReportExportResponse',
    'PlacementSummaryData',
    'ApplicationFunnelData',
    'TimeToHireData',
    'FinancialSummaryData',
    
    # Analytics
    'ChartType',
    'MetricType',
    'ComparisonPeriod',
    'WidgetSize',
    'TrendDirection',
    'KPIValue',
    'ChartDataPoint',
    'ChartSeries',
    'ChartConfig',
    'WidgetConfig',
    'DashboardKPIs',
    'RecruitmentAnalytics',
    'FinancialAnalytics',
    'TeamAnalytics',
    'OnboardingAnalytics',
    'DashboardLayout',
    'AnalyticsRequest',
    'DashboardResponse',
    'ChartResponse',
    'WidgetDataResponse',
    'SaveDashboardRequest',
    'UpdateDashboardRequest',
    'DEFAULT_WIDGETS',
    
    # Scheduled Task
    'TaskType',
    'TaskStatus',
    'TaskPriority',
    'TaskFrequency',
    'TASK_TYPE_DISPLAY',
    'TASK_STATUS_DISPLAY',
    'get_task_type_display',
    'get_task_status_display',
    'TaskSchedule',
    'TaskResult',
    'RetryConfig',
    'ScheduledTaskModel',
    'TaskExecutionLog',
    'CreateTaskRequest',
    'UpdateTaskRequest',
    'TaskResponse',
    'TaskListResponse',
    'TaskExecutionResponse',
    'TaskExecutionListResponse',
    'RunTaskRequest',
    'RunTaskResponse',
    'DEFAULT_DAILY_TASKS',
    'DEFAULT_WEEKLY_TASKS',
    'DEFAULT_MONTHLY_TASKS',
    
    # Import/Export
    'ImportExportType',
    'ImportStatus',
    'ExportStatus',
    'ExportFormat',
    'ImportAction',
    'IMPORT_EXPORT_TYPE_DISPLAY',
    'IMPORT_STATUS_DISPLAY',
    'EXPORT_STATUS_DISPLAY',
    'get_import_status_display',
    'get_export_status_display',
    'ColumnMapping',
    'ValidationError',
    'ImportRow',
    'FieldDefinition',
    'ImportTemplateModel',
    'ImportJobModel',
    'ExportJobModel',
    'StartImportRequest',
    'ValidateImportRequest',
    'ValidateImportResponse',
    'CreateExportRequest',
    'ImportJobResponse',
    'ImportJobListResponse',
    'ExportJobResponse',
    'ExportJobListResponse',
    'TemplateResponse',
    'TemplateListResponse',
    'CANDIDATE_IMPORT_FIELDS',
    'CLIENT_IMPORT_FIELDS',
    'JOB_IMPORT_FIELDS',
    
    # Target
    'TargetType',
    'TargetPeriod',
    'TargetStatus',
    'TargetScope',
    'TARGET_TYPE_DISPLAY',
    'TARGET_PERIOD_DISPLAY',
    'TARGET_STATUS_DISPLAY',
    'get_target_type_display',
    'get_target_period_display',
    'get_target_status_display',
    'TargetMilestone',
    'TargetProgress',
    'LeaderboardEntry',
    'TargetModel',
    'TargetHistoryModel',
    'TargetTemplateModel',
    'CreateTargetRequest',
    'UpdateTargetRequest',
    'BulkCreateTargetRequest',
    'UpdateProgressRequest',
    'TargetResponse',
    'TargetListResponse',
    'TargetSummaryResponse',
    'LeaderboardResponse',
    'TargetDashboardResponse',
    'DEFAULT_TARGET_TEMPLATES',
    
    # Advanced Audit
    'AdvancedAuditAction',
    'AuditSeverity',
    'SessionStatus',
    'AlertType',
    'AUDIT_ACTION_DISPLAY',
    'AUDIT_SEVERITY_DISPLAY',
    'get_audit_action_display',
    'get_audit_severity_display',
    'FieldChange',
    'GeoLocation',
    'DeviceInfo',
    'AdvancedAuditLogModel',
    'SessionModel',
    'SecurityAlertModel',
    'LoginHistoryModel',
    'AuditLogSearchRequest',
    'AdvancedAuditLogResponse',
    'AdvancedAuditLogListResponse',
    'AuditTimelineResponse',
    'SessionResponse',
    'SessionListResponse',
    'RevokeSessionRequest',
    'RevokeAllSessionsRequest',
    'SecurityAlertResponse',
    'SecurityAlertListResponse',
    'ResolveAlertRequest',
    'AuditSummaryResponse',
    'UserActivityResponse',
    'ChangeHistoryResponse',
]