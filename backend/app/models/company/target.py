"""
Target Model - Phase 5
Goals, targets, and performance tracking
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class TargetType(str, Enum):
    """Types of targets"""
    PLACEMENTS = "placements"
    REVENUE = "revenue"
    INTERVIEWS = "interviews"
    APPLICATIONS = "applications"
    CANDIDATES_ADDED = "candidates_added"
    JOBS_CLOSED = "jobs_closed"
    OFFER_ACCEPTANCE = "offer_acceptance"
    CLIENT_ACQUISITION = "client_acquisition"


class TargetPeriod(str, Enum):
    """Target period"""
    WEEKLY = "weekly"
    MONTHLY = "monthly"
    QUARTERLY = "quarterly"
    YEARLY = "yearly"
    CUSTOM = "custom"


class TargetStatus(str, Enum):
    """Target status"""
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    ACHIEVED = "achieved"
    MISSED = "missed"
    EXCEEDED = "exceeded"


class TargetScope(str, Enum):
    """Target scope"""
    COMPANY = "company"
    TEAM = "team"
    INDIVIDUAL = "individual"


# ============== Display Names ==============

TARGET_TYPE_DISPLAY = {
    TargetType.PLACEMENTS: "Placements",
    TargetType.REVENUE: "Revenue",
    TargetType.INTERVIEWS: "Interviews Scheduled",
    TargetType.APPLICATIONS: "Applications Processed",
    TargetType.CANDIDATES_ADDED: "Candidates Added",
    TargetType.JOBS_CLOSED: "Jobs Closed",
    TargetType.OFFER_ACCEPTANCE: "Offer Acceptance Rate",
    TargetType.CLIENT_ACQUISITION: "New Clients",
}

TARGET_PERIOD_DISPLAY = {
    TargetPeriod.WEEKLY: "Weekly",
    TargetPeriod.MONTHLY: "Monthly",
    TargetPeriod.QUARTERLY: "Quarterly",
    TargetPeriod.YEARLY: "Yearly",
    TargetPeriod.CUSTOM: "Custom",
}

TARGET_STATUS_DISPLAY = {
    TargetStatus.NOT_STARTED: "Not Started",
    TargetStatus.IN_PROGRESS: "In Progress",
    TargetStatus.ACHIEVED: "Achieved",
    TargetStatus.MISSED: "Missed",
    TargetStatus.EXCEEDED: "Exceeded",
}


def get_target_type_display(target_type: TargetType) -> str:
    return TARGET_TYPE_DISPLAY.get(target_type, target_type.value)


def get_target_period_display(period: TargetPeriod) -> str:
    return TARGET_PERIOD_DISPLAY.get(period, period.value)


def get_target_status_display(status: TargetStatus) -> str:
    return TARGET_STATUS_DISPLAY.get(status, status.value)


# ============== Sub-Models ==============

class TargetMilestone(BaseModel):
    """Milestone within a target"""
    percentage: int  # 25, 50, 75, 100
    achieved_at: Optional[datetime] = None
    value_at_milestone: Optional[float] = None


class TargetProgress(BaseModel):
    """Progress tracking for a target"""
    current_value: float = 0
    percentage_complete: float = 0
    remaining_value: float = 0
    days_remaining: int = 0
    daily_rate_needed: float = 0
    current_daily_rate: float = 0
    on_track: bool = True
    milestones: List[TargetMilestone] = []


class LeaderboardEntry(BaseModel):
    """Leaderboard entry"""
    rank: int
    user_id: str
    user_name: str
    avatar_url: Optional[str] = None
    current_value: float
    target_value: float
    percentage: float
    achievement_status: TargetStatus


# ============== Main Models ==============

class TargetModel(BaseModel):
    """Target definition (stored in database)"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    # Target info
    name: str
    description: Optional[str] = None
    target_type: TargetType
    
    # Scope
    scope: TargetScope = TargetScope.INDIVIDUAL
    assigned_to: Optional[str] = None  # user_id for individual, team_id for team
    assigned_to_name: Optional[str] = None
    
    # Period
    period: TargetPeriod
    start_date: date
    end_date: date
    
    # Value
    target_value: float
    unit: str = "count"  # count, currency, percentage
    
    # Weighting (for composite scoring)
    weight: float = 1.0
    
    # Progress
    current_value: float = 0
    status: TargetStatus = TargetStatus.NOT_STARTED
    achieved_at: Optional[datetime] = None
    
    # Filters (for calculating current_value)
    filters: Dict[str, Any] = {}  # e.g., {"client_id": "xxx"}
    
    # Notifications
    notify_on_milestones: bool = True
    notify_on_achievement: bool = True
    
    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


class TargetHistoryModel(BaseModel):
    """History of target value changes"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    target_id: str
    company_id: str
    
    # Change details
    previous_value: float
    new_value: float
    change_amount: float
    
    # Context
    change_source: str  # manual, system, import
    related_entity_type: Optional[str] = None  # e.g., "placement"
    related_entity_id: Optional[str] = None
    
    # Audit
    recorded_at: datetime = Field(default_factory=datetime.utcnow)
    recorded_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class TargetTemplateModel(BaseModel):
    """Reusable target template"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    
    name: str
    description: Optional[str] = None
    target_type: TargetType
    scope: TargetScope
    period: TargetPeriod
    default_value: float
    unit: str = "count"
    weight: float = 1.0
    
    # Auto-assign settings
    auto_assign: bool = False
    assign_to_roles: List[str] = []  # Role names to auto-assign
    
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)
    created_by: str = ""

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class CreateTargetRequest(BaseModel):
    """Request to create a target"""
    name: str
    description: Optional[str] = None
    target_type: TargetType
    scope: TargetScope = TargetScope.INDIVIDUAL
    assigned_to: Optional[str] = None
    period: TargetPeriod
    start_date: date
    end_date: date
    target_value: float
    unit: str = "count"
    weight: float = 1.0
    filters: Dict[str, Any] = {}
    notify_on_milestones: bool = True
    notify_on_achievement: bool = True


class UpdateTargetRequest(BaseModel):
    """Request to update a target"""
    name: Optional[str] = None
    description: Optional[str] = None
    target_value: Optional[float] = None
    end_date: Optional[date] = None
    filters: Optional[Dict[str, Any]] = None
    notify_on_milestones: Optional[bool] = None
    notify_on_achievement: Optional[bool] = None


class BulkCreateTargetRequest(BaseModel):
    """Request to create targets for multiple users"""
    template_id: Optional[str] = None
    name: str
    description: Optional[str] = None
    target_type: TargetType
    period: TargetPeriod
    start_date: date
    end_date: date
    
    # Assignments
    assignments: List[Dict[str, Any]]  # [{"user_id": "xxx", "target_value": 10}, ...]


class UpdateProgressRequest(BaseModel):
    """Request to manually update target progress"""
    value: float
    source: str = "manual"
    related_entity_type: Optional[str] = None
    related_entity_id: Optional[str] = None


class TargetResponse(TargetModel):
    """Target response with computed fields"""
    type_display: Optional[str] = None
    period_display: Optional[str] = None
    status_display: Optional[str] = None
    progress: Optional[TargetProgress] = None


class TargetListResponse(BaseModel):
    """List of targets"""
    items: List[TargetResponse]
    total: int
    page: int
    page_size: int


class TargetSummaryResponse(BaseModel):
    """Summary of targets for a user/team/company"""
    total_targets: int
    achieved: int
    in_progress: int
    missed: int
    exceeded: int
    overall_achievement_rate: float
    targets_by_type: Dict[str, Dict[str, Any]]


class LeaderboardResponse(BaseModel):
    """Leaderboard response"""
    target_type: TargetType
    period: TargetPeriod
    start_date: date
    end_date: date
    entries: List[LeaderboardEntry]
    total_participants: int
    company_total: float
    company_target: float


class TargetDashboardResponse(BaseModel):
    """Target dashboard for a user"""
    user_id: str
    user_name: str
    
    # Current period targets
    current_targets: List[TargetResponse]
    
    # Summary
    summary: TargetSummaryResponse
    
    # Leaderboard position
    leaderboard_rank: Optional[int] = None
    total_participants: Optional[int] = None
    
    # Trends
    achievement_history: List[Dict[str, Any]] = []


# ============== Default Target Configurations ==============

DEFAULT_TARGET_TEMPLATES = [
    {
        "name": "Monthly Placements",
        "description": "Monthly placement target for coordinators",
        "target_type": TargetType.PLACEMENTS,
        "scope": TargetScope.INDIVIDUAL,
        "period": TargetPeriod.MONTHLY,
        "default_value": 5,
        "unit": "count",
        "assign_to_roles": ["candidate_coordinator", "client_coordinator"]
    },
    {
        "name": "Monthly Revenue",
        "description": "Monthly revenue target for the company",
        "target_type": TargetType.REVENUE,
        "scope": TargetScope.COMPANY,
        "period": TargetPeriod.MONTHLY,
        "default_value": 1000000,
        "unit": "currency"
    },
    {
        "name": "Quarterly Placements",
        "description": "Quarterly placement target",
        "target_type": TargetType.PLACEMENTS,
        "scope": TargetScope.COMPANY,
        "period": TargetPeriod.QUARTERLY,
        "default_value": 50,
        "unit": "count"
    },
    {
        "name": "Weekly Interviews",
        "description": "Weekly interview scheduling target",
        "target_type": TargetType.INTERVIEWS,
        "scope": TargetScope.INDIVIDUAL,
        "period": TargetPeriod.WEEKLY,
        "default_value": 10,
        "unit": "count",
        "assign_to_roles": ["candidate_coordinator"]
    },
    {
        "name": "Monthly Candidate Additions",
        "description": "Monthly target for adding new candidates",
        "target_type": TargetType.CANDIDATES_ADDED,
        "scope": TargetScope.INDIVIDUAL,
        "period": TargetPeriod.MONTHLY,
        "default_value": 50,
        "unit": "count",
        "assign_to_roles": ["candidate_coordinator", "partner"]
    },
]