"""
Role Model - Company Level
Defines roles and their permissions within a company
"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class SystemRole(str, Enum):
    """System-defined roles (cannot be deleted)"""
    OWNER = "owner"                                   # Company owner — full access within subscription
    ADMIN = "admin"
    RECRUITER = "recruiter"                           # Recruitment specialist — candidates + jobs
    CANDIDATE_COORDINATOR = "candidate_coordinator"
    CLIENT_COORDINATOR = "client_coordinator"
    HR = "hr"
    ACCOUNTS = "accounts"
    PARTNER = "partner"
    MANAGER = "manager"                               # HRM team manager
    EMPLOYEE = "employee"                             # HRM self-service employee


class Permission(str, Enum):
    """All available permissions in the system"""
    # Dashboard
    DASHBOARD_VIEW = "dashboard:view"
    
    # User Management
    USERS_VIEW = "users:view"
    USERS_CREATE = "users:create"
    USERS_EDIT = "users:edit"
    USERS_DELETE = "users:delete"
    USERS_MANAGE_ROLES = "users:manage_roles"
    
    # Role Management
    ROLES_VIEW = "roles:view"
    ROLES_CREATE = "roles:create"
    ROLES_EDIT = "roles:edit"
    ROLES_DELETE = "roles:delete"
    
    # Department Management
    DEPARTMENTS_VIEW = "departments:view"
    DEPARTMENTS_CREATE = "departments:create"
    DEPARTMENTS_EDIT = "departments:edit"
    DEPARTMENTS_DELETE = "departments:delete"
    
    # Designation Management
    DESIGNATIONS_VIEW = "designations:view"
    DESIGNATIONS_CREATE = "designations:create"
    DESIGNATIONS_EDIT = "designations:edit"
    DESIGNATIONS_DELETE = "designations:delete"
    
    # Client Management (Phase 3)
    CLIENTS_VIEW = "clients:view"
    CLIENTS_CREATE = "clients:create"
    CLIENTS_EDIT = "clients:edit"
    CLIENTS_DELETE = "clients:delete"
    
    # Candidate Management (Phase 3)
    CANDIDATES_VIEW = "candidates:view"
    CANDIDATES_CREATE = "candidates:create"
    CANDIDATES_EDIT = "candidates:edit"
    CANDIDATES_DELETE = "candidates:delete"
    CANDIDATES_ASSIGN = "candidates:assign"
    
    # Job Management (Phase 3)
    JOBS_VIEW = "jobs:view"
    JOBS_CREATE = "jobs:create"
    JOBS_EDIT = "jobs:edit"
    JOBS_DELETE = "jobs:delete"
    
    # Interview Management (Phase 3)
    INTERVIEWS_VIEW = "interviews:view"
    INTERVIEWS_SCHEDULE = "interviews:schedule"
    INTERVIEWS_UPDATE_STATUS = "interviews:update_status"
    
    # Partner Management
    PARTNERS_VIEW = "partners:view"
    PARTNERS_CREATE = "partners:create"
    PARTNERS_EDIT = "partners:edit"
    PARTNERS_DELETE = "partners:delete"
    
    # Onboarding
    ONBOARDS_VIEW = "onboards:view"
    ONBOARDS_CREATE = "onboards:create"
    ONBOARDS_EDIT = "onboards:edit"
    
    # Accounts
    ACCOUNTS_VIEW = "accounts:view"
    ACCOUNTS_INVOICES = "accounts:invoices"
    ACCOUNTS_PAYOUTS = "accounts:payouts"
    
    # Payouts & Invoices (Phase 4)
    PAYOUTS_VIEW = "payouts:view"
    PAYOUTS_EDIT = "payouts:edit"
    INVOICES_VIEW = "invoices:view"
    INVOICES_APPROVE = "invoices:approve"
    
    # Imports / Exports (Phase 5)
    IMPORTS_VIEW = "imports:view"
    IMPORTS_CREATE = "imports:create"
    EXPORTS_VIEW = "exports:view"
    EXPORTS_CREATE = "exports:create"
    
    # Targets (Phase 5)
    TARGETS_VIEW = "targets:view"
    TARGETS_CREATE = "targets:create"
    TARGETS_EDIT = "targets:edit"
    TARGETS_DELETE = "targets:delete"
    TARGETS_ADMIN = "targets:admin"
    
    # Analytics (Phase 5)
    ANALYTICS_VIEW = "analytics:view"
    ANALYTICS_EDIT = "analytics:edit"
    
    # Reports
    REPORTS_VIEW = "reports:view"
    REPORTS_EXPORT = "reports:export"
    
    # CRM Settings (Global)
    CRM_SETTINGS_VIEW = "crm_settings:view"
    CRM_SETTINGS_EDIT = "crm_settings:edit"
    
    # Interview Settings (within Interviews module)
    INTERVIEW_SETTINGS_VIEW = "interview_settings:view"
    INTERVIEW_SETTINGS_CREATE = "interview_settings:create"
    INTERVIEW_SETTINGS_EDIT = "interview_settings:edit"
    INTERVIEW_SETTINGS_DELETE = "interview_settings:delete"
    
    # Audit
    AUDIT_VIEW = "audit:view"
    AUDIT_SESSIONS = "audit:sessions"
    AUDIT_ALERTS = "audit:alerts"
    AUDIT_ADMIN = "audit:admin"
    
    # Notifications
    NOTIFICATIONS_CREATE = "notifications:create"

    # Tasks
    TASKS_VIEW = "tasks:view"
    TASKS_CREATE = "tasks:create"
    TASKS_EDIT = "tasks:edit"

    # ── HRM Module ────────────────────────────────────────────────────────────
    # Dashboard
    HRM_DASHBOARD_VIEW       = "hrm:dashboard:view"
    # Employees
    HRM_EMPLOYEES_VIEW       = "hrm:employees:view"
    HRM_EMPLOYEES_MANAGE     = "hrm:employees:manage"
    # Attendance
    HRM_ATTENDANCE_SELF      = "hrm:attendance:self"     # own check-in/out
    HRM_ATTENDANCE_TEAM      = "hrm:attendance:team"     # view team attendance
    HRM_ATTENDANCE_MANAGE    = "hrm:attendance:manage"   # full control / manual updates
    # Leaves
    HRM_LEAVE_APPLY          = "hrm:leave:apply"         # apply own leave
    HRM_LEAVE_TEAM_APPROVE   = "hrm:leave:team_approve"  # approve team leaves
    HRM_LEAVE_MANAGE         = "hrm:leave:manage"        # full leave management
    # Payroll
    HRM_PAYROLL_VIEW_SELF    = "hrm:payroll:view_self"   # view own payslip
    HRM_PAYROLL_MANAGE       = "hrm:payroll:manage"      # generate & manage all payslips
    # Performance
    HRM_PERFORMANCE_SELF     = "hrm:performance:self"    # submit self review
    HRM_PERFORMANCE_TEAM     = "hrm:performance:team"    # view/review team
    HRM_PERFORMANCE_MANAGE   = "hrm:performance:manage"  # create, finalize reviews
    # Announcements
    HRM_ANNOUNCEMENTS_VIEW   = "hrm:announcements:view"
    HRM_ANNOUNCEMENTS_MANAGE = "hrm:announcements:manage"
    # Hiring Pipeline
    HRM_HIRING_VIEW          = "hrm:hiring:view"
    HRM_HIRING_MANAGE        = "hrm:hiring:manage"
    # Offer Templates
    HRM_OFFER_TEMPLATES_VIEW   = "hrm:offer_templates:view"
    HRM_OFFER_TEMPLATES_MANAGE = "hrm:offer_templates:manage"
    # Document Templates (Enterprise Builder)
    HRM_DOC_TEMPLATES_VIEW     = "hrm:doc_templates:view"
    HRM_DOC_TEMPLATES_MANAGE   = "hrm:doc_templates:manage"
    HRM_DOC_TEMPLATES_GENERATE = "hrm:doc_templates:generate"
    # Documents
    HRM_DOCUMENTS_MANAGE     = "hrm:documents:manage"
    # Assets
    HRM_ASSETS_VIEW          = "hrm:assets:view"
    HRM_ASSETS_MANAGE        = "hrm:assets:manage"
    # Exit Management
    HRM_EXIT_VIEW            = "hrm:exit:view"
    HRM_EXIT_MANAGE          = "hrm:exit:manage"
    # Notifications (in-app read access)
    NOTIFICATIONS_VIEW       = "notifications:view"


# ── Convenience sets ──────────────────────────────────────────────────────────

# All HRM permissions (for OWNER / ADMIN / HR)
_HRM_FULL = [
    Permission.HRM_DASHBOARD_VIEW,
    Permission.HRM_EMPLOYEES_VIEW,
    Permission.HRM_EMPLOYEES_MANAGE,
    Permission.HRM_ATTENDANCE_SELF,
    Permission.HRM_ATTENDANCE_TEAM,
    Permission.HRM_ATTENDANCE_MANAGE,
    Permission.HRM_LEAVE_APPLY,
    Permission.HRM_LEAVE_TEAM_APPROVE,
    Permission.HRM_LEAVE_MANAGE,
    Permission.HRM_PAYROLL_VIEW_SELF,
    Permission.HRM_PAYROLL_MANAGE,
    Permission.HRM_PERFORMANCE_SELF,
    Permission.HRM_PERFORMANCE_TEAM,
    Permission.HRM_PERFORMANCE_MANAGE,
    Permission.HRM_ANNOUNCEMENTS_VIEW,
    Permission.HRM_ANNOUNCEMENTS_MANAGE,
    Permission.HRM_HIRING_VIEW,
    Permission.HRM_HIRING_MANAGE,
    Permission.HRM_OFFER_TEMPLATES_VIEW,
    Permission.HRM_OFFER_TEMPLATES_MANAGE,
    Permission.HRM_DOC_TEMPLATES_VIEW,
    Permission.HRM_DOC_TEMPLATES_MANAGE,
    Permission.HRM_DOC_TEMPLATES_GENERATE,
    Permission.HRM_DOCUMENTS_MANAGE,
    Permission.HRM_ASSETS_VIEW,
    Permission.HRM_ASSETS_MANAGE,
    Permission.HRM_EXIT_VIEW,
    Permission.HRM_EXIT_MANAGE,
    Permission.NOTIFICATIONS_VIEW,
]

# Team-level HRM (MANAGER)
_HRM_TEAM = [
    Permission.HRM_DASHBOARD_VIEW,
    Permission.HRM_EMPLOYEES_VIEW,
    Permission.HRM_ATTENDANCE_SELF,
    Permission.HRM_ATTENDANCE_TEAM,
    Permission.HRM_LEAVE_APPLY,
    Permission.HRM_LEAVE_TEAM_APPROVE,
    Permission.HRM_PAYROLL_VIEW_SELF,
    Permission.HRM_PERFORMANCE_SELF,
    Permission.HRM_PERFORMANCE_TEAM,
    Permission.HRM_ANNOUNCEMENTS_VIEW,
    Permission.HRM_HIRING_VIEW,
    Permission.NOTIFICATIONS_VIEW,
]

# Self-service HRM (EMPLOYEE)
_HRM_SELF = [
    Permission.HRM_DASHBOARD_VIEW,
    Permission.HRM_ATTENDANCE_SELF,
    Permission.HRM_LEAVE_APPLY,
    Permission.HRM_PAYROLL_VIEW_SELF,
    Permission.HRM_PERFORMANCE_SELF,
    Permission.HRM_ANNOUNCEMENTS_VIEW,
    Permission.NOTIFICATIONS_VIEW,
]

# Minimum HRM self-service for all internal non-partner roles
# Every employee account (regardless of CRM role) must be able to:
#   - Punch in/out  - Apply for leave  - View own payslips  - See announcements
_HRM_ESS_MINIMUM = [
    Permission.HRM_ATTENDANCE_SELF,
    Permission.HRM_LEAVE_APPLY,
    Permission.HRM_PAYROLL_VIEW_SELF,
    Permission.HRM_PERFORMANCE_SELF,
    Permission.HRM_ANNOUNCEMENTS_VIEW,
    Permission.NOTIFICATIONS_VIEW,
]


# ── Shared CRM permission set (platform-management permissions for OWNER/ADMIN) ──
_CRM_ADMIN_BASE = [
    Permission.DASHBOARD_VIEW,
    Permission.USERS_VIEW, Permission.USERS_CREATE, Permission.USERS_EDIT,
    Permission.USERS_DELETE, Permission.USERS_MANAGE_ROLES,
    Permission.ROLES_VIEW, Permission.ROLES_CREATE, Permission.ROLES_EDIT, Permission.ROLES_DELETE,
    Permission.DEPARTMENTS_VIEW, Permission.DEPARTMENTS_CREATE,
    Permission.DEPARTMENTS_EDIT, Permission.DEPARTMENTS_DELETE,
    Permission.DESIGNATIONS_VIEW, Permission.DESIGNATIONS_CREATE,
    Permission.DESIGNATIONS_EDIT, Permission.DESIGNATIONS_DELETE,
    Permission.CLIENTS_VIEW, Permission.CLIENTS_CREATE, Permission.CLIENTS_EDIT, Permission.CLIENTS_DELETE,
    Permission.CANDIDATES_VIEW, Permission.CANDIDATES_CREATE, Permission.CANDIDATES_EDIT,
    Permission.CANDIDATES_DELETE, Permission.CANDIDATES_ASSIGN,
    Permission.JOBS_VIEW, Permission.JOBS_CREATE, Permission.JOBS_EDIT, Permission.JOBS_DELETE,
    Permission.INTERVIEWS_VIEW, Permission.INTERVIEWS_SCHEDULE, Permission.INTERVIEWS_UPDATE_STATUS,
    Permission.INTERVIEW_SETTINGS_VIEW, Permission.INTERVIEW_SETTINGS_CREATE,
    Permission.INTERVIEW_SETTINGS_EDIT, Permission.INTERVIEW_SETTINGS_DELETE,
    Permission.ONBOARDS_VIEW, Permission.ONBOARDS_CREATE, Permission.ONBOARDS_EDIT,
    Permission.PARTNERS_VIEW, Permission.PARTNERS_CREATE, Permission.PARTNERS_EDIT,
    Permission.ACCOUNTS_VIEW, Permission.ACCOUNTS_INVOICES, Permission.ACCOUNTS_PAYOUTS,
    Permission.PAYOUTS_VIEW, Permission.PAYOUTS_EDIT,
    Permission.INVOICES_VIEW, Permission.INVOICES_APPROVE,
    Permission.TARGETS_VIEW, Permission.TARGETS_CREATE, Permission.TARGETS_EDIT,
    Permission.TARGETS_DELETE, Permission.TARGETS_ADMIN,
    Permission.TASKS_VIEW, Permission.TASKS_CREATE, Permission.TASKS_EDIT,
    Permission.REPORTS_VIEW, Permission.REPORTS_EXPORT,
    Permission.ANALYTICS_VIEW,
    Permission.AUDIT_VIEW, Permission.AUDIT_SESSIONS, Permission.AUDIT_ALERTS, Permission.AUDIT_ADMIN,
    Permission.CRM_SETTINGS_VIEW, Permission.CRM_SETTINGS_EDIT,
    Permission.IMPORTS_VIEW, Permission.IMPORTS_CREATE,
    Permission.EXPORTS_VIEW, Permission.EXPORTS_CREATE,
    Permission.NOTIFICATIONS_CREATE,
    Permission.NOTIFICATIONS_VIEW,
]


# Default permissions for each system role
ROLE_DEFAULT_PERMISSIONS = {

    # ── OWNER: Company owner — full CRM + full HRM (within subscription limits).
    # Module guards in middleware enforce subscription boundaries; this role
    # simply grants all permissions so nothing is blocked inside enabled modules.
    SystemRole.OWNER: _CRM_ADMIN_BASE + _HRM_FULL,

    # ── ADMIN: Same as OWNER for day-to-day platform administration.
    SystemRole.ADMIN: _CRM_ADMIN_BASE + _HRM_FULL,

    # ── CRM specialist roles ──────────────────────────────────────────────────

    SystemRole.RECRUITER: [
        Permission.DASHBOARD_VIEW,
        Permission.CANDIDATES_VIEW, Permission.CANDIDATES_CREATE,
        Permission.CANDIDATES_EDIT, Permission.CANDIDATES_DELETE, Permission.CANDIDATES_ASSIGN,
        Permission.INTERVIEWS_VIEW, Permission.INTERVIEWS_SCHEDULE, Permission.INTERVIEWS_UPDATE_STATUS,
        Permission.INTERVIEW_SETTINGS_VIEW,
        Permission.JOBS_VIEW, Permission.JOBS_CREATE, Permission.JOBS_EDIT,
        Permission.CLIENTS_VIEW,
        Permission.ONBOARDS_VIEW,
        Permission.REPORTS_VIEW,
        Permission.TASKS_VIEW, Permission.TASKS_CREATE, Permission.TASKS_EDIT,
        *_HRM_ESS_MINIMUM,
    ],

    SystemRole.CANDIDATE_COORDINATOR: [
        Permission.DASHBOARD_VIEW,
        Permission.CLIENTS_VIEW,
        Permission.CANDIDATES_VIEW, Permission.CANDIDATES_CREATE,
        Permission.CANDIDATES_EDIT, Permission.CANDIDATES_DELETE, Permission.CANDIDATES_ASSIGN,
        Permission.INTERVIEWS_VIEW, Permission.INTERVIEWS_SCHEDULE, Permission.INTERVIEWS_UPDATE_STATUS,
        Permission.INTERVIEW_SETTINGS_VIEW, Permission.INTERVIEW_SETTINGS_CREATE,
        Permission.INTERVIEW_SETTINGS_EDIT, Permission.INTERVIEW_SETTINGS_DELETE,
        Permission.JOBS_VIEW,
        Permission.ONBOARDS_VIEW,
        Permission.REPORTS_VIEW,
        Permission.TASKS_VIEW, Permission.TASKS_CREATE, Permission.TASKS_EDIT,
        *_HRM_ESS_MINIMUM,
    ],

    SystemRole.CLIENT_COORDINATOR: [
        Permission.DASHBOARD_VIEW,
        Permission.CLIENTS_VIEW, Permission.CLIENTS_CREATE,
        Permission.CLIENTS_EDIT, Permission.CLIENTS_DELETE,
        Permission.JOBS_VIEW, Permission.JOBS_CREATE, Permission.JOBS_EDIT, Permission.JOBS_DELETE,
        Permission.INTERVIEWS_VIEW, Permission.INTERVIEWS_SCHEDULE, Permission.INTERVIEWS_UPDATE_STATUS,
        Permission.INTERVIEW_SETTINGS_VIEW,
        Permission.CANDIDATES_VIEW,
        Permission.ONBOARDS_VIEW,
        Permission.REPORTS_VIEW,
        Permission.TASKS_VIEW, Permission.TASKS_CREATE, Permission.TASKS_EDIT,
        *_HRM_ESS_MINIMUM,
    ],

    # ── HR: CRM onboarding tasks + full HRM access ────────────────────────────
    SystemRole.HR: [
        Permission.DASHBOARD_VIEW,
        Permission.USERS_VIEW,
        Permission.CANDIDATES_VIEW,
        Permission.ONBOARDS_VIEW, Permission.ONBOARDS_CREATE, Permission.ONBOARDS_EDIT,
        Permission.REPORTS_VIEW,
        Permission.TASKS_VIEW, Permission.TASKS_CREATE, Permission.TASKS_EDIT,
        *_HRM_FULL,
    ],

    SystemRole.ACCOUNTS: [
        Permission.DASHBOARD_VIEW,
        Permission.ACCOUNTS_VIEW, Permission.ACCOUNTS_INVOICES, Permission.ACCOUNTS_PAYOUTS,
        Permission.PAYOUTS_VIEW, Permission.PAYOUTS_EDIT,
        Permission.INVOICES_VIEW, Permission.INVOICES_APPROVE,
        Permission.CLIENTS_VIEW,
        Permission.PARTNERS_VIEW,
        Permission.REPORTS_VIEW, Permission.REPORTS_EXPORT,
        Permission.TASKS_VIEW,
        *_HRM_ESS_MINIMUM,
    ],

    SystemRole.PARTNER: [
        Permission.DASHBOARD_VIEW,
        Permission.CANDIDATES_VIEW, Permission.CANDIDATES_CREATE,
        Permission.JOBS_VIEW,
        Permission.INTERVIEWS_VIEW,
        Permission.ACCOUNTS_VIEW, Permission.ACCOUNTS_INVOICES,
    ],

    # ── HRM-only roles ────────────────────────────────────────────────────────

    # MANAGER: team-level HRM (no CRM access by default)
    SystemRole.MANAGER: _HRM_TEAM,

    # EMPLOYEE: self-service HRM only
    SystemRole.EMPLOYEE: _HRM_SELF,
}


class RoleModel(BaseModel):
    """Role document model"""
    id: Optional[str] = Field(None, alias="_id")
    name: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permissions: List[str] = Field(default_factory=list)
    is_system_role: bool = Field(default=False)  # System roles cannot be deleted
    is_active: bool = Field(default=True)
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class RoleCreate(BaseModel):
    """Schema for creating a new role"""
    name: str = Field(..., min_length=2, max_length=50)
    display_name: str = Field(..., min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permissions: List[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    """Schema for updating a role"""
    display_name: Optional[str] = Field(None, min_length=2, max_length=100)
    description: Optional[str] = Field(None, max_length=500)
    permissions: Optional[List[str]] = None
    is_active: Optional[bool] = None


class RoleResponse(BaseModel):
    """Role response schema"""
    id: str
    name: str
    display_name: str
    description: Optional[str]
    permissions: List[str]
    is_system_role: bool
    is_active: bool
    created_at: datetime
    updated_at: Optional[datetime]