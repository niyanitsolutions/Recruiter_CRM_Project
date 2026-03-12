"""
Settings Model - Phase 3
Company settings including custom fields, interview stages, email templates
"""
from datetime import datetime
from typing import Optional, List, Any, Dict
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class FieldType(str, Enum):
    """Custom field types"""
    TEXT = "text"
    TEXTAREA = "textarea"
    NUMBER = "number"
    DATE = "date"
    DATETIME = "datetime"
    SELECT = "select"
    MULTI_SELECT = "multi_select"
    CHECKBOX = "checkbox"
    EMAIL = "email"
    PHONE = "phone"
    URL = "url"
    FILE = "file"


class EntityType(str, Enum):
    """Entity types for custom fields"""
    CANDIDATE = "candidate"
    JOB = "job"
    CLIENT = "client"
    INTERVIEW = "interview"


# ============== Custom Field Definition ==============

class SelectOption(BaseModel):
    """Option for select/multi-select fields"""
    value: str
    label: str
    color: Optional[str] = None  # For visual distinction


class CustomFieldDefinition(BaseModel):
    """Custom field definition"""
    id: Optional[str] = Field(None, alias="_id")
    
    entity_type: str  # candidate, job, client
    field_name: str
    field_label: str
    field_type: str = Field(default=FieldType.TEXT.value)
    
    # Validation
    is_required: bool = Field(default=False)
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None  # Regex pattern
    
    # For select fields
    options: List[SelectOption] = Field(default_factory=list)
    allow_other: bool = Field(default=False)  # Allow custom value
    
    # Display
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    sort_order: int = Field(default=0)
    is_visible: bool = Field(default=True)
    show_in_list: bool = Field(default=False)  # Show in list view
    
    # Permissions
    editable_by_roles: List[str] = Field(default_factory=list)  # Empty = all
    visible_to_roles: List[str] = Field(default_factory=list)  # Empty = all
    
    is_active: bool = Field(default=True)
    
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class CustomFieldCreate(BaseModel):
    """Schema for creating a custom field"""
    entity_type: str
    field_name: str
    field_label: str
    field_type: str = Field(default=FieldType.TEXT.value)
    
    is_required: bool = Field(default=False)
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None
    
    options: List[SelectOption] = Field(default_factory=list)
    allow_other: bool = Field(default=False)
    
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    sort_order: Optional[int] = Field(default=0)
    show_in_list: bool = Field(default=False)
    
    editable_by_roles: List[str] = Field(default_factory=list)
    visible_to_roles: List[str] = Field(default_factory=list)


class CustomFieldUpdate(BaseModel):
    """Schema for updating a custom field"""
    field_label: Optional[str] = None
    
    is_required: Optional[bool] = None
    min_length: Optional[int] = None
    max_length: Optional[int] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    pattern: Optional[str] = None
    
    options: Optional[List[SelectOption]] = None
    allow_other: Optional[bool] = None
    
    placeholder: Optional[str] = None
    help_text: Optional[str] = None
    sort_order: Optional[int] = None
    is_visible: Optional[bool] = None
    show_in_list: Optional[bool] = None
    
    editable_by_roles: Optional[List[str]] = None
    visible_to_roles: Optional[List[str]] = None
    
    is_active: Optional[bool] = None


# ============== Interview Stage Definition ==============

class InterviewStageDefinition(BaseModel):
    """Interview stage definition"""
    id: Optional[str] = Field(None, alias="_id")
    
    name: str
    code: str  # e.g., "TECH1", "HR"
    description: Optional[str] = None
    
    stage_order: int = Field(default=1)
    is_mandatory: bool = Field(default=True)
    
    # Default settings
    default_duration_minutes: int = Field(default=60)
    default_mode: str = Field(default="video")  # in_person, video, phone
    
    # Feedback template
    feedback_template_id: Optional[str] = None
    requires_feedback: bool = Field(default=True)
    
    # Auto-actions
    auto_reject_on_fail: bool = Field(default=False)
    auto_advance_on_pass: bool = Field(default=False)
    
    is_active: bool = Field(default=True)
    
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class InterviewStageCreate(BaseModel):
    """Schema for creating an interview stage"""
    name: str
    code: str
    description: Optional[str] = None
    
    stage_order: int = Field(default=1)
    is_mandatory: bool = Field(default=True)
    
    default_duration_minutes: int = Field(default=60)
    default_mode: str = Field(default="video")
    
    requires_feedback: bool = Field(default=True)
    auto_reject_on_fail: bool = Field(default=False)
    auto_advance_on_pass: bool = Field(default=False)


class InterviewStageUpdate(BaseModel):
    """Schema for updating an interview stage"""
    name: Optional[str] = None
    description: Optional[str] = None
    
    stage_order: Optional[int] = None
    is_mandatory: Optional[bool] = None
    
    default_duration_minutes: Optional[int] = None
    default_mode: Optional[str] = None
    
    requires_feedback: Optional[bool] = None
    auto_reject_on_fail: Optional[bool] = None
    auto_advance_on_pass: Optional[bool] = None
    
    is_active: Optional[bool] = None


# ============== Email Template ==============

class EmailTemplate(BaseModel):
    """Email template"""
    id: Optional[str] = Field(None, alias="_id")
    
    name: str
    code: str  # interview_scheduled, offer_letter, etc.
    subject: str
    body: str  # HTML with placeholders like {{candidate_name}}
    
    template_type: str  # candidate, client, internal
    trigger: Optional[str] = None  # auto trigger event
    
    # Placeholders available
    available_placeholders: List[str] = Field(default_factory=list)
    
    is_active: bool = Field(default=True)
    
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class EmailTemplateCreate(BaseModel):
    """Schema for creating email template"""
    name: str
    code: str
    subject: str
    body: str
    template_type: str
    trigger: Optional[str] = None


class EmailTemplateUpdate(BaseModel):
    """Schema for updating email template"""
    name: Optional[str] = None
    subject: Optional[str] = None
    body: Optional[str] = None
    trigger: Optional[str] = None
    is_active: Optional[bool] = None


# ============== Company Settings (Geo Fence sub-models) ==============

class GeoFenceLocation(BaseModel):
    """A single allowed geo fence zone"""
    id: str = Field(default_factory=lambda: str(__import__('uuid').uuid4()))
    name: str = ""
    latitude: float = 0.0
    longitude: float = 0.0
    radius: int = 500  # metres

    model_config = ConfigDict(populate_by_name=True)


class UserGeoFenceConfig(BaseModel):
    """Per-user geo fence override"""
    user_id: str
    enabled: bool = False
    locations: List[GeoFenceLocation] = Field(default_factory=list)

    model_config = ConfigDict(populate_by_name=True)


class NotificationChannel(BaseModel):
    """Email + in-app toggle for one event"""
    email: bool = True
    in_app: bool = True


class NotificationPreferences(BaseModel):
    """Admin-controlled notification toggles per system event"""
    new_candidate: NotificationChannel = Field(default_factory=NotificationChannel)
    interview_scheduled: NotificationChannel = Field(default_factory=NotificationChannel)
    interview_feedback: NotificationChannel = Field(default_factory=NotificationChannel)
    user_created: NotificationChannel = Field(default_factory=NotificationChannel)

    model_config = ConfigDict(populate_by_name=True)


# ============== Company Settings ==============

class CompanySettings(BaseModel):
    """Company-wide settings"""
    id: Optional[str] = Field(None, alias="_id")

    # ===== Company Profile =====
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    primary_color: Optional[str] = None

    # ===== Admin Contact =====
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    support_email: Optional[str] = None

    # ===== Recruitment Settings =====
    default_currency: str = Field(default="INR")
    default_notice_period: str = Field(default="30_days")
    auto_assign_candidates: bool = Field(default=False)

    # ===== Partner Settings =====
    default_partner_commission: float = Field(default=8.33)
    partner_can_see_client_name: bool = Field(default=False)
    partner_can_see_candidate_contact: bool = Field(default=True)

    # ===== Interview Settings =====
    default_interview_duration: int = Field(default=60)
    default_interview_mode: str = Field(default="video")
    send_interview_reminders: bool = Field(default=True)
    reminder_hours_before: int = Field(default=24)

    # ===== Notification Settings (legacy flat flags kept for backward compat) =====
    notify_on_new_candidate: bool = Field(default=True)
    notify_on_interview_scheduled: bool = Field(default=True)
    notify_on_feedback_pending: bool = Field(default=True)
    notify_on_offer: bool = Field(default=True)
    # Enhanced per-channel notification preferences
    notification_preferences: NotificationPreferences = Field(default_factory=NotificationPreferences)

    # ===== Security / Geo Fence =====
    geo_fence_enabled: bool = Field(default=False)
    geo_fence_locations: List[GeoFenceLocation] = Field(default_factory=list)
    user_geo_fence: List[UserGeoFenceConfig] = Field(default_factory=list)

    # ===== Data Retention =====
    auto_archive_rejected_days: int = Field(default=90)
    auto_archive_closed_jobs_days: int = Field(default=180)

    # ===== Working Hours (for scheduling) =====
    working_days: List[int] = Field(default=[1, 2, 3, 4, 5])  # Mon-Fri
    working_hours_start: str = Field(default="09:00")
    working_hours_end: str = Field(default="18:00")
    timezone: str = Field(default="Asia/Kolkata")

    # ===== Integration Settings =====
    email_provider: Optional[str] = None
    sms_provider: Optional[str] = None
    calendar_integration: Optional[str] = None

    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(populate_by_name=True)


class CompanySettingsUpdate(BaseModel):
    """Schema for updating company settings"""
    # Profile
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    primary_color: Optional[str] = None
    timezone: Optional[str] = None

    # Admin Contact
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    support_email: Optional[str] = None

    # Recruitment
    default_currency: Optional[str] = None
    default_notice_period: Optional[str] = None
    auto_assign_candidates: Optional[bool] = None
    default_partner_commission: Optional[float] = None
    partner_can_see_client_name: Optional[bool] = None
    partner_can_see_candidate_contact: Optional[bool] = None

    # Interview
    default_interview_duration: Optional[int] = None
    default_interview_mode: Optional[str] = None
    send_interview_reminders: Optional[bool] = None
    reminder_hours_before: Optional[int] = None

    # Notifications
    notify_on_new_candidate: Optional[bool] = None
    notify_on_interview_scheduled: Optional[bool] = None
    notify_on_feedback_pending: Optional[bool] = None
    notify_on_offer: Optional[bool] = None
    notification_preferences: Optional[NotificationPreferences] = None

    # Geo Fence
    geo_fence_enabled: Optional[bool] = None
    geo_fence_locations: Optional[List[GeoFenceLocation]] = None
    user_geo_fence: Optional[List[UserGeoFenceConfig]] = None

    # Working hours
    working_days: Optional[List[int]] = None
    working_hours_start: Optional[str] = None
    working_hours_end: Optional[str] = None


# ============== Default Interview Stages ==============

DEFAULT_INTERVIEW_STAGES = [
    {
        "name": "Screening",
        "code": "SCREEN",
        "description": "Initial screening call",
        "stage_order": 1,
        "is_mandatory": True,
        "default_duration_minutes": 30,
        "default_mode": "phone",
        "requires_feedback": True,
        "auto_reject_on_fail": True,
        "auto_advance_on_pass": True
    },
    {
        "name": "Technical Round 1",
        "code": "TECH1",
        "description": "First technical interview",
        "stage_order": 2,
        "is_mandatory": True,
        "default_duration_minutes": 60,
        "default_mode": "video",
        "requires_feedback": True,
        "auto_reject_on_fail": True,
        "auto_advance_on_pass": False
    },
    {
        "name": "Technical Round 2",
        "code": "TECH2",
        "description": "Second technical interview",
        "stage_order": 3,
        "is_mandatory": False,
        "default_duration_minutes": 60,
        "default_mode": "video",
        "requires_feedback": True,
        "auto_reject_on_fail": True,
        "auto_advance_on_pass": False
    },
    {
        "name": "HR Round",
        "code": "HR",
        "description": "HR interview",
        "stage_order": 4,
        "is_mandatory": True,
        "default_duration_minutes": 45,
        "default_mode": "video",
        "requires_feedback": True,
        "auto_reject_on_fail": False,
        "auto_advance_on_pass": False
    },
    {
        "name": "Final Round",
        "code": "FINAL",
        "description": "Final interview with management",
        "stage_order": 5,
        "is_mandatory": False,
        "default_duration_minutes": 60,
        "default_mode": "in_person",
        "requires_feedback": True,
        "auto_reject_on_fail": False,
        "auto_advance_on_pass": False
    }
]


# ============== Default Email Templates ==============

DEFAULT_EMAIL_TEMPLATES = [
    {
        "name": "Interview Scheduled",
        "code": "interview_scheduled",
        "subject": "Interview Scheduled - {{job_title}} at {{client_name}}",
        "body": """
        <p>Dear {{candidate_name}},</p>
        <p>Your interview has been scheduled for the position of <strong>{{job_title}}</strong>.</p>
        <p><strong>Details:</strong></p>
        <ul>
            <li>Date: {{interview_date}}</li>
            <li>Time: {{interview_time}}</li>
            <li>Mode: {{interview_mode}}</li>
            <li>Round: {{stage_name}}</li>
        </ul>
        {{#if meeting_link}}
        <p><strong>Meeting Link:</strong> <a href="{{meeting_link}}">Join Meeting</a></p>
        {{/if}}
        {{#if venue}}
        <p><strong>Venue:</strong> {{venue}}</p>
        {{/if}}
        <p>Best regards,<br>{{company_name}}</p>
        """,
        "template_type": "candidate",
        "trigger": "interview_scheduled",
        "available_placeholders": [
            "candidate_name", "job_title", "client_name", "interview_date",
            "interview_time", "interview_mode", "stage_name", "meeting_link",
            "venue", "company_name"
        ]
    },
    {
        "name": "Interview Reminder",
        "code": "interview_reminder",
        "subject": "Reminder: Interview Tomorrow - {{job_title}}",
        "body": """
        <p>Dear {{candidate_name}},</p>
        <p>This is a reminder that your interview is scheduled for tomorrow.</p>
        <p><strong>Details:</strong></p>
        <ul>
            <li>Date: {{interview_date}}</li>
            <li>Time: {{interview_time}}</li>
            <li>Round: {{stage_name}}</li>
        </ul>
        <p>Best regards,<br>{{company_name}}</p>
        """,
        "template_type": "candidate",
        "trigger": "interview_reminder",
        "available_placeholders": [
            "candidate_name", "job_title", "interview_date", "interview_time",
            "stage_name", "company_name"
        ]
    },
    {
        "name": "Offer Letter",
        "code": "offer_letter",
        "subject": "Congratulations! Job Offer - {{job_title}}",
        "body": """
        <p>Dear {{candidate_name}},</p>
        <p>Congratulations! We are pleased to offer you the position of <strong>{{offered_designation}}</strong>.</p>
        <p><strong>Offer Details:</strong></p>
        <ul>
            <li>Designation: {{offered_designation}}</li>
            <li>CTC: {{offered_ctc}}</li>
            <li>Location: {{offered_location}}</li>
            <li>Expected Joining: {{expected_joining_date}}</li>
        </ul>
        <p>Please confirm your acceptance by {{offer_valid_until}}.</p>
        <p>Best regards,<br>{{company_name}}</p>
        """,
        "template_type": "candidate",
        "trigger": "offer_created",
        "available_placeholders": [
            "candidate_name", "job_title", "offered_designation", "offered_ctc",
            "offered_location", "expected_joining_date", "offer_valid_until",
            "company_name"
        ]
    }
]


# Field type display
FIELD_TYPE_DISPLAY = {
    FieldType.TEXT.value: "Text",
    FieldType.TEXTAREA.value: "Text Area",
    FieldType.NUMBER.value: "Number",
    FieldType.DATE.value: "Date",
    FieldType.DATETIME.value: "Date & Time",
    FieldType.SELECT.value: "Dropdown",
    FieldType.MULTI_SELECT.value: "Multi-Select",
    FieldType.CHECKBOX.value: "Checkbox",
    FieldType.EMAIL.value: "Email",
    FieldType.PHONE.value: "Phone",
    FieldType.URL.value: "URL",
    FieldType.FILE.value: "File Upload"
}


def get_field_type_display(field_type: str) -> str:
    return FIELD_TYPE_DISPLAY.get(field_type, field_type)