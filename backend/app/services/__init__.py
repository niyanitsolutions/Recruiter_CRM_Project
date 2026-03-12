"""
Services Module - Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
Business logic layer
"""

# ============== Phase 1 - Auth & Tenant Management ==============
from app.services.auth_service import AuthService, auth_service
from app.services.tenant_service import TenantService, tenant_service
from app.services.plan_service import PlanService, plan_service
from app.services.payment_service import PaymentService, payment_service

# ============== Phase 2 - User Management ==============
from .user_service import UserService
from .role_service import RoleService
from .department_service import DepartmentService
from .designation_service import DesignationService
from .audit_service import AuditService

# ============== Phase 3 - Recruitment Core ==============
from .client_service import ClientService
from .candidate_service import CandidateService
from .job_service import JobService
from .application_service import ApplicationService
from .interview_service import InterviewService
from .settings_service import SettingsService

# ============== Phase 4 - Onboarding & Partner Payout ==============
from .onboard_service import OnboardService
from .partner_payout_service import PartnerPayoutService
from .notification_service import NotificationService

# ============== Phase 5 - Reports, Analytics, Import/Export, Targets, Audit ==============
from .report_service import ReportService
from .analytics_service import AnalyticsService
from .export_service import ExportService
from .import_service import ImportService
from .target_service import TargetService
from .audit_advanced_service import AuditAdvancedService  # Phase 5 advanced audit (sessions, alerts)
from .scheduler_service import SchedulerService


__all__ = [
    # Phase 1
    "AuthService",
    "auth_service",
    "TenantService",
    "tenant_service",
    "PlanService",
    "plan_service",
    "PaymentService",
    "payment_service",
    # Phase 2
    "UserService",
    "RoleService",
    "DepartmentService",
    "DesignationService",
    "AuditService",
    # Phase 3
    "ClientService",
    "CandidateService",
    "JobService",
    "ApplicationService",
    "InterviewService",
    "SettingsService",
    # Phase 4
    "OnboardService",
    "PartnerPayoutService",
    "NotificationService",
    # Phase 5
    "ReportService",
    "AnalyticsService",
    "ExportService",
    "ImportService",
    "TargetService",
    "AuditAdvancedService",
    "SchedulerService",
]