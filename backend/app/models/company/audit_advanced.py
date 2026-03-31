"""
Advanced Audit Model - Phase 5
Enhanced audit logging, session tracking, and security monitoring
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class AuditAction(str, Enum):
    """Audit action types"""
    # CRUD actions
    CREATE = "create"
    READ = "read"
    UPDATE = "update"
    DELETE = "delete"
    
    # Auth actions
    LOGIN = "login"
    LOGOUT = "logout"
    LOGIN_FAILED = "login_failed"
    PASSWORD_CHANGE = "password_change"
    PASSWORD_RESET = "password_reset"
    
    # Data actions
    EXPORT = "export"
    IMPORT = "import"
    BULK_UPDATE = "bulk_update"
    BULK_DELETE = "bulk_delete"
    
    # System actions
    SETTINGS_CHANGE = "settings_change"
    PERMISSION_CHANGE = "permission_change"
    ROLE_CHANGE = "role_change"
    
    # Business actions
    STATUS_CHANGE = "status_change"
    APPROVAL = "approval"
    REJECTION = "rejection"
    ASSIGNMENT = "assignment"


class AuditSeverity(str, Enum):
    """Audit event severity"""
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class SessionStatus(str, Enum):
    """Session status"""
    ACTIVE = "active"
    EXPIRED = "expired"
    REVOKED = "revoked"
    LOGGED_OUT = "logged_out"


class AlertType(str, Enum):
    """Security alert types"""
    MULTIPLE_LOGIN_FAILURES = "multiple_login_failures"
    UNUSUAL_LOCATION = "unusual_location"
    UNUSUAL_TIME = "unusual_time"
    SENSITIVE_DATA_ACCESS = "sensitive_data_access"
    BULK_DATA_EXPORT = "bulk_data_export"
    PERMISSION_ESCALATION = "permission_escalation"
    SUSPICIOUS_ACTIVITY = "suspicious_activity"


# ============== Display Names ==============

AUDIT_ACTION_DISPLAY = {
    AuditAction.CREATE: "Created",
    AuditAction.READ: "Viewed",
    AuditAction.UPDATE: "Updated",
    AuditAction.DELETE: "Deleted",
    AuditAction.LOGIN: "Logged In",
    AuditAction.LOGOUT: "Logged Out",
    AuditAction.LOGIN_FAILED: "Login Failed",
    AuditAction.PASSWORD_CHANGE: "Password Changed",
    AuditAction.PASSWORD_RESET: "Password Reset",
    AuditAction.EXPORT: "Exported Data",
    AuditAction.IMPORT: "Imported Data",
    AuditAction.BULK_UPDATE: "Bulk Updated",
    AuditAction.BULK_DELETE: "Bulk Deleted",
    AuditAction.SETTINGS_CHANGE: "Settings Changed",
    AuditAction.PERMISSION_CHANGE: "Permission Changed",
    AuditAction.ROLE_CHANGE: "Role Changed",
    AuditAction.STATUS_CHANGE: "Status Changed",
    AuditAction.APPROVAL: "Approved",
    AuditAction.REJECTION: "Rejected",
    AuditAction.ASSIGNMENT: "Assigned",
}

AUDIT_SEVERITY_DISPLAY = {
    AuditSeverity.LOW: "Low",
    AuditSeverity.MEDIUM: "Medium",
    AuditSeverity.HIGH: "High",
    AuditSeverity.CRITICAL: "Critical",
}


def get_audit_action_display(action: AuditAction) -> str:
    return AUDIT_ACTION_DISPLAY.get(action, action.value)


def get_audit_severity_display(severity: AuditSeverity) -> str:
    return AUDIT_SEVERITY_DISPLAY.get(severity, severity.value)


# ============== Sub-Models ==============

class FieldChange(BaseModel):
    """Single field change"""
    field_name: str
    field_label: str
    old_value: Any
    new_value: Any
    data_type: str = "string"


class GeoLocation(BaseModel):
    """Geographic location"""
    ip_address: str
    country: Optional[str] = None
    city: Optional[str] = None
    region: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None


class DeviceInfo(BaseModel):
    """Device information"""
    device_type: str  # desktop, mobile, tablet
    os: Optional[str] = None
    os_version: Optional[str] = None
    browser: Optional[str] = None
    browser_version: Optional[str] = None
    user_agent: str = ""


# ============== Main Models ==============

class AuditLogModel(BaseModel):
    """Enhanced audit log entry (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None  # None for super admin actions
    
    # User info
    user_id: str
    user_name: str
    user_email: str
    user_role: str
    
    # Action info
    action: AuditAction
    severity: AuditSeverity = AuditSeverity.LOW
    
    # Entity info
    entity_type: str  # e.g., "candidate", "job", "user"
    entity_id: Optional[str] = None
    entity_name: Optional[str] = None
    
    # Change details
    description: str
    changes: List[FieldChange] = []
    old_data: Optional[Dict[str, Any]] = None
    new_data: Optional[Dict[str, Any]] = None
    
    # Request context
    ip_address: Optional[str] = None
    location: Optional[GeoLocation] = None
    device: Optional[DeviceInfo] = None
    session_id: Optional[str] = None
    request_id: Optional[str] = None
    
    # API context
    api_endpoint: Optional[str] = None
    http_method: Optional[str] = None
    response_status: Optional[int] = None
    
    # Timing
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    duration_ms: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class SessionModel(BaseModel):
    """User session tracking (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None
    
    # User info
    user_id: str
    user_name: str
    user_email: str
    user_role: str
    
    # Session info
    token_hash: str  # Hashed token for security
    status: SessionStatus = SessionStatus.ACTIVE
    
    # Device & Location
    ip_address: str
    location: Optional[GeoLocation] = None
    device: DeviceInfo
    
    # Timing
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    last_activity: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    expires_at: datetime
    ended_at: Optional[datetime] = None
    
    # Activity
    request_count: int = 0
    
    # Flags
    is_remembered: bool = False  # "Remember me" login
    is_api_session: bool = False

    model_config = ConfigDict(from_attributes=True)


class SecurityAlertModel(BaseModel):
    """Security alert (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None
    
    # Alert info
    alert_type: AlertType
    severity: AuditSeverity
    title: str
    description: str
    
    # Related user
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_email: Optional[str] = None
    
    # Context
    ip_address: Optional[str] = None
    location: Optional[GeoLocation] = None
    related_audit_ids: List[str] = []
    metadata: Dict[str, Any] = {}
    
    # Status
    is_resolved: bool = False
    resolved_at: Optional[datetime] = None
    resolved_by: Optional[str] = None
    resolution_notes: Optional[str] = None
    
    # Timing
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)


class LoginHistoryModel(BaseModel):
    """User login history"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None
    user_id: str
    
    # Login result
    success: bool
    failure_reason: Optional[str] = None
    
    # Context
    ip_address: str
    location: Optional[GeoLocation] = None
    device: DeviceInfo
    
    # Timing
    timestamp: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class AuditLogSearchRequest(BaseModel):
    """Request to search audit logs"""
    # Filters
    user_id: Optional[str] = None
    user_ids: Optional[List[str]] = None
    action: Optional[AuditAction] = None
    actions: Optional[List[AuditAction]] = None
    severity: Optional[AuditSeverity] = None
    entity_type: Optional[str] = None
    entity_id: Optional[str] = None
    
    # Date range
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    
    # Text search
    search: Optional[str] = None
    
    # Pagination
    page: int = 1
    page_size: int = 50
    
    # Sort
    sort_by: str = "timestamp"
    sort_order: str = "desc"


class AuditLogResponse(AuditLogModel):
    """Audit log response with display names"""
    action_display: Optional[str] = None
    severity_display: Optional[str] = None
    time_ago: Optional[str] = None


class AuditLogListResponse(BaseModel):
    """List of audit logs"""
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int
    pages: int


class AuditTimelineResponse(BaseModel):
    """Timeline view of audit logs"""
    date: date
    events: List[AuditLogResponse]
    total_events: int


class SessionResponse(SessionModel):
    """Session response"""
    status_display: Optional[str] = None
    is_current: bool = False
    duration: Optional[str] = None


class SessionListResponse(BaseModel):
    """List of sessions"""
    items: List[SessionResponse]
    total: int
    active_count: int


class RevokeSessionRequest(BaseModel):
    """Request to revoke a session"""
    session_id: str
    reason: Optional[str] = None


class RevokeAllSessionsRequest(BaseModel):
    """Request to revoke all sessions for a user"""
    user_id: str
    except_current: bool = True
    reason: Optional[str] = None


class SecurityAlertResponse(SecurityAlertModel):
    """Security alert response"""
    type_display: Optional[str] = None
    severity_display: Optional[str] = None


class SecurityAlertListResponse(BaseModel):
    """List of security alerts"""
    items: List[SecurityAlertResponse]
    total: int
    unresolved_count: int


class ResolveAlertRequest(BaseModel):
    """Request to resolve a security alert"""
    resolution_notes: Optional[str] = None


class AuditSummaryResponse(BaseModel):
    """Audit activity summary"""
    period_start: datetime
    period_end: datetime
    
    # Counts
    total_events: int
    by_action: Dict[str, int]
    by_severity: Dict[str, int]
    by_entity_type: Dict[str, int]
    by_user: List[Dict[str, Any]]
    
    # Trends
    events_by_day: List[Dict[str, Any]]
    events_by_hour: List[Dict[str, Any]]
    
    # Highlights
    top_users: List[Dict[str, Any]]
    recent_critical: List[AuditLogResponse]


class UserActivityResponse(BaseModel):
    """User activity summary"""
    user_id: str
    user_name: str
    user_email: str
    
    # Session info
    current_session: Optional[SessionResponse] = None
    total_sessions: int
    
    # Activity
    total_actions: int
    actions_by_type: Dict[str, int]
    last_activity: Optional[datetime] = None
    
    # Login history
    total_logins: int
    failed_logins: int
    last_login: Optional[datetime] = None
    common_locations: List[str] = []
    common_devices: List[str] = []
    
    # Security
    security_alerts: int
    unresolved_alerts: int


class ChangeHistoryResponse(BaseModel):
    """Change history for an entity"""
    entity_type: str
    entity_id: str
    entity_name: Optional[str] = None
    
    changes: List[AuditLogResponse]
    total_changes: int
    
    created_at: Optional[datetime] = None
    created_by: Optional[str] = None
    last_modified_at: Optional[datetime] = None
    last_modified_by: Optional[str] = None