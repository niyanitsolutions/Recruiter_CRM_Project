"""
Scheduled Task Model - Phase 5
Background jobs, automation, and task scheduling
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class TaskType(str, Enum):
    """Types of scheduled tasks"""
    # Daily tasks
    UPDATE_DAY_COUNTERS = "update_day_counters"
    UPDATE_PAYOUT_ELIGIBILITY = "update_payout_eligibility"
    SEND_DOJ_REMINDERS = "send_doj_reminders"
    SEND_DAY_10_REMINDERS = "send_day_10_reminders"
    SEND_DAY_30_REMINDERS = "send_day_30_reminders"
    SEND_PAYOUT_REMINDERS = "send_payout_reminders"
    SEND_DOCUMENT_REMINDERS = "send_document_reminders"
    
    # Weekly tasks
    GENERATE_WEEKLY_DIGEST = "generate_weekly_digest"
    CLEANUP_OLD_SESSIONS = "cleanup_old_sessions"
    
    # Monthly tasks
    GENERATE_MONTHLY_REPORTS = "generate_monthly_reports"
    ARCHIVE_OLD_LOGS = "archive_old_logs"
    
    # On-demand tasks
    SEND_SCHEDULED_REPORT = "send_scheduled_report"
    BULK_EMAIL = "bulk_email"
    DATA_EXPORT = "data_export"
    DATA_IMPORT = "data_import"


class TaskStatus(str, Enum):
    """Task execution status"""
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    RETRYING = "retrying"


class TaskPriority(str, Enum):
    """Task priority"""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    CRITICAL = "critical"


class TaskFrequency(str, Enum):
    """Task frequency"""
    ONCE = "once"
    HOURLY = "hourly"
    DAILY = "daily"
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    CUSTOM = "custom"


# ============== Display Names ==============

TASK_TYPE_DISPLAY = {
    TaskType.UPDATE_DAY_COUNTERS: "Update Day Counters",
    TaskType.UPDATE_PAYOUT_ELIGIBILITY: "Update Payout Eligibility",
    TaskType.SEND_DOJ_REMINDERS: "Send DOJ Reminders",
    TaskType.SEND_DAY_10_REMINDERS: "Send Day 10 Reminders",
    TaskType.SEND_DAY_30_REMINDERS: "Send Day 30 Reminders",
    TaskType.SEND_PAYOUT_REMINDERS: "Send Payout Reminders",
    TaskType.SEND_DOCUMENT_REMINDERS: "Send Document Reminders",
    TaskType.GENERATE_WEEKLY_DIGEST: "Generate Weekly Digest",
    TaskType.CLEANUP_OLD_SESSIONS: "Cleanup Old Sessions",
    TaskType.GENERATE_MONTHLY_REPORTS: "Generate Monthly Reports",
    TaskType.ARCHIVE_OLD_LOGS: "Archive Old Logs",
    TaskType.SEND_SCHEDULED_REPORT: "Send Scheduled Report",
    TaskType.BULK_EMAIL: "Bulk Email",
    TaskType.DATA_EXPORT: "Data Export",
    TaskType.DATA_IMPORT: "Data Import",
}

TASK_STATUS_DISPLAY = {
    TaskStatus.PENDING: "Pending",
    TaskStatus.RUNNING: "Running",
    TaskStatus.COMPLETED: "Completed",
    TaskStatus.FAILED: "Failed",
    TaskStatus.CANCELLED: "Cancelled",
    TaskStatus.RETRYING: "Retrying",
}


def get_task_type_display(task_type: TaskType) -> str:
    return TASK_TYPE_DISPLAY.get(task_type, task_type.value)


def get_task_status_display(status: TaskStatus) -> str:
    return TASK_STATUS_DISPLAY.get(status, status.value)


# ============== Sub-Models ==============

class TaskSchedule(BaseModel):
    """Task schedule configuration"""
    frequency: TaskFrequency
    time: str = "02:00"  # HH:MM format
    timezone: str = "Asia/Kolkata"
    day_of_week: Optional[int] = None  # 0-6 (Monday-Sunday)
    day_of_month: Optional[int] = None  # 1-31
    cron_expression: Optional[str] = None  # For custom schedules


class TaskResult(BaseModel):
    """Task execution result"""
    success: bool
    message: str
    records_processed: int = 0
    records_failed: int = 0
    details: Optional[Dict[str, Any]] = None
    errors: List[str] = []


class RetryConfig(BaseModel):
    """Retry configuration"""
    max_retries: int = 3
    retry_delay_seconds: int = 300  # 5 minutes
    exponential_backoff: bool = True
    max_delay_seconds: int = 3600  # 1 hour


# ============== Main Models ==============

class ScheduledTaskModel(BaseModel):
    """Scheduled task definition (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None  # None for system-wide tasks
    
    # Task info
    task_type: TaskType
    name: str
    description: Optional[str] = None
    
    # Schedule
    schedule: TaskSchedule
    is_active: bool = True
    
    # Configuration
    config: Dict[str, Any] = {}
    retry_config: RetryConfig = RetryConfig()
    priority: TaskPriority = TaskPriority.NORMAL
    timeout_seconds: int = 3600  # 1 hour
    
    # Execution tracking
    last_run: Optional[datetime] = None
    last_status: Optional[TaskStatus] = None
    last_result: Optional[TaskResult] = None
    next_run: Optional[datetime] = None
    run_count: int = 0
    failure_count: int = 0
    
    # Audit
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class TaskExecutionLog(BaseModel):
    """Log of task executions"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: Optional[str] = None
    
    # Task reference
    task_id: str
    task_type: TaskType
    task_name: str
    
    # Execution details
    started_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    completed_at: Optional[datetime] = None
    duration_ms: Optional[int] = None
    
    # Status
    status: TaskStatus = TaskStatus.RUNNING
    retry_attempt: int = 0
    
    # Result
    result: Optional[TaskResult] = None
    error_message: Optional[str] = None
    stack_trace: Optional[str] = None
    
    # Context
    triggered_by: str = "scheduler"  # scheduler, manual, api
    execution_context: Dict[str, Any] = {}

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class CreateTaskRequest(BaseModel):
    """Request to create a scheduled task"""
    task_type: TaskType
    name: str
    description: Optional[str] = None
    schedule: TaskSchedule
    config: Dict[str, Any] = {}
    retry_config: Optional[RetryConfig] = None
    priority: TaskPriority = TaskPriority.NORMAL
    is_active: bool = True


class UpdateTaskRequest(BaseModel):
    """Request to update a scheduled task"""
    name: Optional[str] = None
    description: Optional[str] = None
    schedule: Optional[TaskSchedule] = None
    config: Optional[Dict[str, Any]] = None
    retry_config: Optional[RetryConfig] = None
    priority: Optional[TaskPriority] = None
    is_active: Optional[bool] = None


class TaskResponse(ScheduledTaskModel):
    """Task response with display names"""
    type_display: Optional[str] = None
    status_display: Optional[str] = None
    priority_display: Optional[str] = None


class TaskListResponse(BaseModel):
    """List of tasks"""
    items: List[TaskResponse]
    total: int
    page: int
    page_size: int


class TaskExecutionResponse(TaskExecutionLog):
    """Task execution log response"""
    type_display: Optional[str] = None
    status_display: Optional[str] = None


class TaskExecutionListResponse(BaseModel):
    """List of task executions"""
    items: List[TaskExecutionResponse]
    total: int
    page: int
    page_size: int


class RunTaskRequest(BaseModel):
    """Request to manually run a task"""
    config_override: Optional[Dict[str, Any]] = None


class RunTaskResponse(BaseModel):
    """Response from running a task"""
    execution_id: str
    task_id: str
    status: TaskStatus
    message: str


# ============== Default Task Configurations ==============

DEFAULT_DAILY_TASKS = [
    {
        "task_type": TaskType.UPDATE_DAY_COUNTERS,
        "name": "Update Onboard Day Counters",
        "description": "Update days_at_client for all joined candidates",
        "schedule": {"frequency": "daily", "time": "00:30"},
        "priority": "high"
    },
    {
        "task_type": TaskType.UPDATE_PAYOUT_ELIGIBILITY,
        "name": "Update Payout Eligibility",
        "description": "Mark payouts as eligible when payout days are completed",
        "schedule": {"frequency": "daily", "time": "01:00"},
        "priority": "high"
    },
    {
        "task_type": TaskType.SEND_DOJ_REMINDERS,
        "name": "Send DOJ Reminders",
        "description": "Send reminders for upcoming DOJ dates",
        "schedule": {"frequency": "daily", "time": "08:00"},
        "priority": "normal"
    },
    {
        "task_type": TaskType.SEND_DAY_10_REMINDERS,
        "name": "Send Day 10 Check Reminders",
        "description": "Send day 10 check reminders for joined candidates",
        "schedule": {"frequency": "daily", "time": "09:00"},
        "priority": "normal"
    },
    {
        "task_type": TaskType.SEND_DAY_30_REMINDERS,
        "name": "Send Day 30 Check Reminders",
        "description": "Send day 30 check reminders for joined candidates",
        "schedule": {"frequency": "daily", "time": "09:30"},
        "priority": "normal"
    },
    {
        "task_type": TaskType.SEND_PAYOUT_REMINDERS,
        "name": "Send Payout Eligibility Reminders",
        "description": "Notify when candidates become payout eligible",
        "schedule": {"frequency": "daily", "time": "10:00"},
        "priority": "normal"
    },
]

DEFAULT_WEEKLY_TASKS = [
    {
        "task_type": TaskType.GENERATE_WEEKLY_DIGEST,
        "name": "Generate Weekly Digest",
        "description": "Send weekly activity digest to admins",
        "schedule": {"frequency": "weekly", "time": "09:00", "day_of_week": 1},
        "priority": "low"
    },
    {
        "task_type": TaskType.CLEANUP_OLD_SESSIONS,
        "name": "Cleanup Old Sessions",
        "description": "Remove expired user sessions",
        "schedule": {"frequency": "weekly", "time": "03:00", "day_of_week": 0},
        "priority": "low"
    },
]

DEFAULT_MONTHLY_TASKS = [
    {
        "task_type": TaskType.GENERATE_MONTHLY_REPORTS,
        "name": "Generate Monthly Reports",
        "description": "Generate and email monthly reports",
        "schedule": {"frequency": "monthly", "time": "06:00", "day_of_month": 1},
        "priority": "normal"
    },
    {
        "task_type": TaskType.ARCHIVE_OLD_LOGS,
        "name": "Archive Old Audit Logs",
        "description": "Archive audit logs older than 90 days",
        "schedule": {"frequency": "monthly", "time": "02:00", "day_of_month": 1},
        "priority": "low"
    },
]