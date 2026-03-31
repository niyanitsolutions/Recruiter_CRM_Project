"""
Audit Log Model - Company Level (Enhanced for Phase 2)
Complete audit trail for all changes within a company
"""
from datetime import datetime, timezone
from typing import Optional, Dict, Any, List
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class AuditAction(str, Enum):
    """Types of auditable actions"""
    # Authentication
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET = "password_reset"
    
    # CRUD Operations
    CREATE = "create"
    UPDATE = "update"
    DELETE = "delete"
    RESTORE = "restore"
    
    # Status Changes
    ACTIVATE = "activate"
    DEACTIVATE = "deactivate"
    SUSPEND = "suspend"
    
    # Role/Permission Changes
    ROLE_ASSIGN = "role_assign"
    ROLE_REVOKE = "role_revoke"
    PERMISSION_GRANT = "permission_grant"
    PERMISSION_REVOKE = "permission_revoke"
    
    # Data Access
    VIEW = "view"
    EXPORT = "export"
    DOWNLOAD = "download"
    
    # Bulk Operations
    BULK_UPDATE = "bulk_update"
    BULK_DELETE = "bulk_delete"
    IMPORT = "import"


class EntityType(str, Enum):
    """Types of entities that can be audited"""
    USER = "user"
    ROLE = "role"
    DEPARTMENT = "department"
    DESIGNATION = "designation"
    CANDIDATE = "candidate"
    JOB = "job"
    INTERVIEW = "interview"
    PARTNER = "partner"
    ONBOARD = "onboard"
    INVOICE = "invoice"
    SETTINGS = "settings"
    REPORT = "report"


class AuditLogModel(BaseModel):
    """Audit log document model"""
    id: Optional[str] = Field(None, alias="_id")
    
    # Action Info
    action: str  # AuditAction value
    entity_type: str  # EntityType value
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None  # Human readable name
    
    # User who performed action
    user_id: str
    user_name: str
    user_role: str
    user_email: Optional[str] = None
    
    # Change Details
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    changed_fields: List[str] = Field(default_factory=list)
    
    # Description
    description: str  # Human readable description of what happened
    details: Optional[Dict[str, Any]] = None  # Additional context
    
    # Request Info
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    
    # Timestamps
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class AuditLogCreate(BaseModel):
    """Schema for creating an audit log entry"""
    action: str
    entity_type: str
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    user_id: str
    user_name: str
    user_role: str
    user_email: Optional[str] = None
    old_value: Optional[Dict[str, Any]] = None
    new_value: Optional[Dict[str, Any]] = None
    changed_fields: List[str] = Field(default_factory=list)
    description: str
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    request_id: Optional[str] = None


class AuditLogResponse(BaseModel):
    """Audit log response schema"""
    id: str
    action: str
    action_display: str  # Human readable action
    entity_type: str
    entity_type_display: str  # Human readable entity type
    entity_id: Optional[str]
    entity_name: Optional[str]
    user_id: str
    user_name: str
    user_role: str
    changed_fields: List[str]
    description: str
    ip_address: Optional[str]
    created_at: datetime


class AuditLogDetailResponse(AuditLogResponse):
    """Detailed audit log response with full change data"""
    old_value: Optional[Dict[str, Any]]
    new_value: Optional[Dict[str, Any]]
    details: Optional[Dict[str, Any]]
    user_agent: Optional[str]


class AuditLogFilter(BaseModel):
    """Filter options for audit logs"""
    action: Optional[str] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    user_id: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    search: Optional[str] = None
    page: int = Field(default=1, ge=1)
    page_size: int = Field(default=20, ge=1, le=100)


# Display name mappings
ACTION_DISPLAY_NAMES = {
    AuditAction.LOGIN.value: "Logged In",
    AuditAction.LOGOUT.value: "Logged Out",
    AuditAction.LOGIN_FAILED.value: "Login Failed",
    AuditAction.PASSWORD_CHANGE.value: "Changed Password",
    AuditAction.PASSWORD_RESET.value: "Password Reset",
    AuditAction.CREATE.value: "Created",
    AuditAction.UPDATE.value: "Updated",
    AuditAction.DELETE.value: "Deleted",
    AuditAction.RESTORE.value: "Restored",
    AuditAction.ACTIVATE.value: "Activated",
    AuditAction.DEACTIVATE.value: "Deactivated",
    AuditAction.SUSPEND.value: "Suspended",
    AuditAction.ROLE_ASSIGN.value: "Role Assigned",
    AuditAction.ROLE_REVOKE.value: "Role Revoked",
    AuditAction.PERMISSION_GRANT.value: "Permission Granted",
    AuditAction.PERMISSION_REVOKE.value: "Permission Revoked",
    AuditAction.VIEW.value: "Viewed",
    AuditAction.EXPORT.value: "Exported",
    AuditAction.DOWNLOAD.value: "Downloaded",
    AuditAction.BULK_UPDATE.value: "Bulk Updated",
    AuditAction.BULK_DELETE.value: "Bulk Deleted",
    AuditAction.IMPORT.value: "Imported",
}

ENTITY_DISPLAY_NAMES = {
    EntityType.USER.value: "User",
    EntityType.ROLE.value: "Role",
    EntityType.DEPARTMENT.value: "Department",
    EntityType.DESIGNATION.value: "Designation",
    EntityType.CANDIDATE.value: "Candidate",
    EntityType.JOB.value: "Job",
    EntityType.INTERVIEW.value: "Interview",
    EntityType.PARTNER.value: "Partner",
    EntityType.ONBOARD.value: "Onboard",
    EntityType.INVOICE.value: "Invoice",
    EntityType.SETTINGS.value: "Settings",
    EntityType.REPORT.value: "Report",
}


def get_action_display(action: str) -> str:
    """Get human readable action name"""
    return ACTION_DISPLAY_NAMES.get(action, action.replace("_", " ").title())


def get_entity_display(entity_type: str) -> str:
    """Get human readable entity type name"""
    return ENTITY_DISPLAY_NAMES.get(entity_type, entity_type.replace("_", " ").title())


def calculate_changed_fields(old_value: Dict, new_value: Dict) -> List[str]:
    """Calculate which fields changed between old and new values"""
    changed = []
    all_keys = set(list(old_value.keys()) + list(new_value.keys()))
    
    # Exclude sensitive and meta fields
    exclude_fields = {'password_hash', 'updated_at', 'updated_by', '_id', 'id'}
    
    for key in all_keys:
        if key in exclude_fields:
            continue
        old_val = old_value.get(key)
        new_val = new_value.get(key)
        if old_val != new_val:
            changed.append(key)
    
    return changed