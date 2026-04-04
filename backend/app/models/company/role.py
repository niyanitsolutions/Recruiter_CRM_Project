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
    ADMIN = "admin"
    CANDIDATE_COORDINATOR = "candidate_coordinator"
    CLIENT_COORDINATOR = "client_coordinator"
    HR = "hr"
    ACCOUNTS = "accounts"
    PARTNER = "partner"


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


# Default permissions for each system role
ROLE_DEFAULT_PERMISSIONS = {
    SystemRole.ADMIN: [
        # Dashboard
        Permission.DASHBOARD_VIEW,
        # User Management - FULL
        Permission.USERS_VIEW,
        Permission.USERS_CREATE,
        Permission.USERS_EDIT,
        Permission.USERS_DELETE,
        Permission.USERS_MANAGE_ROLES,
        # Role Management - FULL
        Permission.ROLES_VIEW,
        Permission.ROLES_CREATE,
        Permission.ROLES_EDIT,
        Permission.ROLES_DELETE,
        # Department Management - FULL
        Permission.DEPARTMENTS_VIEW,
        Permission.DEPARTMENTS_CREATE,
        Permission.DEPARTMENTS_EDIT,
        Permission.DEPARTMENTS_DELETE,
        # Designation Management - FULL
        Permission.DESIGNATIONS_VIEW,
        Permission.DESIGNATIONS_CREATE,
        Permission.DESIGNATIONS_EDIT,
        Permission.DESIGNATIONS_DELETE,
        # Clients - FULL
        Permission.CLIENTS_VIEW,
        Permission.CLIENTS_CREATE,
        Permission.CLIENTS_EDIT,
        Permission.CLIENTS_DELETE,
        # Candidates - FULL (admin oversees all recruitment activity)
        Permission.CANDIDATES_VIEW,
        Permission.CANDIDATES_CREATE,
        Permission.CANDIDATES_EDIT,
        Permission.CANDIDATES_DELETE,
        Permission.CANDIDATES_ASSIGN,
        # Jobs - FULL
        Permission.JOBS_VIEW,
        Permission.JOBS_CREATE,
        Permission.JOBS_EDIT,
        Permission.JOBS_DELETE,
        # Interviews - FULL
        Permission.INTERVIEWS_VIEW,
        Permission.INTERVIEWS_SCHEDULE,
        Permission.INTERVIEWS_UPDATE_STATUS,
        # Partners - FULL
        Permission.PARTNERS_VIEW,
        Permission.PARTNERS_CREATE,
        Permission.PARTNERS_EDIT,
        Permission.PARTNERS_DELETE,
        # Onboards - FULL
        Permission.ONBOARDS_VIEW,
        Permission.ONBOARDS_CREATE,
        Permission.ONBOARDS_EDIT,
        # Accounts / Finance
        Permission.ACCOUNTS_VIEW,
        Permission.ACCOUNTS_INVOICES,
        Permission.ACCOUNTS_PAYOUTS,
        Permission.PAYOUTS_VIEW,
        Permission.PAYOUTS_EDIT,
        Permission.INVOICES_VIEW,
        Permission.INVOICES_APPROVE,
        # Imports / Exports
        Permission.IMPORTS_VIEW,
        Permission.IMPORTS_CREATE,
        Permission.EXPORTS_VIEW,
        Permission.EXPORTS_CREATE,
        # Targets
        Permission.TARGETS_VIEW,
        Permission.TARGETS_CREATE,
        Permission.TARGETS_EDIT,
        Permission.TARGETS_DELETE,
        Permission.TARGETS_ADMIN,
        # Analytics
        Permission.ANALYTICS_VIEW,
        Permission.ANALYTICS_EDIT,
        # Reports - FULL
        Permission.REPORTS_VIEW,
        Permission.REPORTS_EXPORT,
        # CRM Settings - FULL (no create/delete)
        Permission.CRM_SETTINGS_VIEW,
        Permission.CRM_SETTINGS_EDIT,
        # Interview Settings - FULL CRUD
        Permission.INTERVIEW_SETTINGS_VIEW,
        Permission.INTERVIEW_SETTINGS_CREATE,
        Permission.INTERVIEW_SETTINGS_EDIT,
        Permission.INTERVIEW_SETTINGS_DELETE,
        # Audit - FULL VIEW
        Permission.AUDIT_VIEW,
        Permission.AUDIT_SESSIONS,
        Permission.AUDIT_ALERTS,
        Permission.AUDIT_ADMIN,
        # Notifications
        Permission.NOTIFICATIONS_CREATE,
    ],
    SystemRole.CANDIDATE_COORDINATOR: [
        Permission.DASHBOARD_VIEW,
        # Clients - VIEW only
        Permission.CLIENTS_VIEW,
        # Candidates - FULL
        Permission.CANDIDATES_VIEW,
        Permission.CANDIDATES_CREATE,
        Permission.CANDIDATES_EDIT,
        Permission.CANDIDATES_DELETE,
        Permission.CANDIDATES_ASSIGN,
        # Interviews - FULL (owns interview workflow)
        Permission.INTERVIEWS_VIEW,
        Permission.INTERVIEWS_SCHEDULE,
        Permission.INTERVIEWS_UPDATE_STATUS,
        # Interview Settings - FULL CRUD
        Permission.INTERVIEW_SETTINGS_VIEW,
        Permission.INTERVIEW_SETTINGS_CREATE,
        Permission.INTERVIEW_SETTINGS_EDIT,
        Permission.INTERVIEW_SETTINGS_DELETE,
        # Jobs - VIEW only
        Permission.JOBS_VIEW,
        # Onboards - VIEW
        Permission.ONBOARDS_VIEW,
        # Reports - VIEW
        Permission.REPORTS_VIEW,
    ],
    SystemRole.CLIENT_COORDINATOR: [
        Permission.DASHBOARD_VIEW,
        # Clients - FULL
        Permission.CLIENTS_VIEW,
        Permission.CLIENTS_CREATE,
        Permission.CLIENTS_EDIT,
        Permission.CLIENTS_DELETE,
        # Jobs - FULL
        Permission.JOBS_VIEW,
        Permission.JOBS_CREATE,
        Permission.JOBS_EDIT,
        Permission.JOBS_DELETE,
        # Interviews - PARTIAL (client side)
        Permission.INTERVIEWS_VIEW,
        Permission.INTERVIEWS_SCHEDULE,
        Permission.INTERVIEWS_UPDATE_STATUS,
        # Interview Settings - VIEW only (can see but not change)
        Permission.INTERVIEW_SETTINGS_VIEW,
        # Candidates - VIEW only
        Permission.CANDIDATES_VIEW,
        # Onboards - VIEW
        Permission.ONBOARDS_VIEW,
        # Reports - VIEW
        Permission.REPORTS_VIEW,
    ],
    SystemRole.HR: [
        Permission.DASHBOARD_VIEW,
        # Users - VIEW only
        Permission.USERS_VIEW,
        # Candidates - VIEW
        Permission.CANDIDATES_VIEW,
        # Onboards - FULL
        Permission.ONBOARDS_VIEW,
        Permission.ONBOARDS_CREATE,
        Permission.ONBOARDS_EDIT,
        # Reports - VIEW
        Permission.REPORTS_VIEW,
    ],
    SystemRole.ACCOUNTS: [
        Permission.DASHBOARD_VIEW,
        # Accounts - FULL
        Permission.ACCOUNTS_VIEW,
        Permission.ACCOUNTS_INVOICES,
        Permission.ACCOUNTS_PAYOUTS,
        Permission.PAYOUTS_VIEW,
        Permission.PAYOUTS_EDIT,
        Permission.INVOICES_VIEW,
        Permission.INVOICES_APPROVE,
        # Clients - VIEW only
        Permission.CLIENTS_VIEW,
        # Partners - VIEW only
        Permission.PARTNERS_VIEW,
        # Reports - FULL
        Permission.REPORTS_VIEW,
        Permission.REPORTS_EXPORT,
    ],
    SystemRole.PARTNER: [
        Permission.DASHBOARD_VIEW,
        # Candidates - CREATE and VIEW own
        Permission.CANDIDATES_VIEW,
        Permission.CANDIDATES_CREATE,
        # Jobs - VIEW only (visible to partners)
        Permission.JOBS_VIEW,
        # Interviews - VIEW own candidates
        Permission.INTERVIEWS_VIEW,
        # Accounts - VIEW own invoices
        Permission.ACCOUNTS_VIEW,
        Permission.ACCOUNTS_INVOICES,
    ],
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