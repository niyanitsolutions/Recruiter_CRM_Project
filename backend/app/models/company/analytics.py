"""
Analytics Model - Phase 5
Dashboard analytics, KPIs, and chart data structures
"""
from datetime import datetime, date
from typing import Optional, List, Dict, Any
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum
import uuid


# ============== Enums ==============

class ChartType(str, Enum):
    """Types of charts"""
    LINE = "line"
    BAR = "bar"
    PIE = "pie"
    DONUT = "donut"
    AREA = "area"
    STACKED_BAR = "stacked_bar"
    HORIZONTAL_BAR = "horizontal_bar"
    FUNNEL = "funnel"
    GAUGE = "gauge"
    TABLE = "table"


class MetricType(str, Enum):
    """Types of metrics"""
    COUNT = "count"
    SUM = "sum"
    AVERAGE = "average"
    PERCENTAGE = "percentage"
    CURRENCY = "currency"
    RATIO = "ratio"


class ComparisonPeriod(str, Enum):
    """Comparison periods"""
    PREVIOUS_PERIOD = "previous_period"
    PREVIOUS_MONTH = "previous_month"
    PREVIOUS_QUARTER = "previous_quarter"
    PREVIOUS_YEAR = "previous_year"
    SAME_PERIOD_LAST_YEAR = "same_period_last_year"


class WidgetSize(str, Enum):
    """Dashboard widget sizes"""
    SMALL = "small"      # 1x1
    MEDIUM = "medium"    # 2x1
    LARGE = "large"      # 2x2
    WIDE = "wide"        # 3x1
    FULL = "full"        # 4x1


class TrendDirection(str, Enum):
    """Trend direction"""
    UP = "up"
    DOWN = "down"
    STABLE = "stable"


# ============== Sub-Models ==============

class KPIValue(BaseModel):
    """KPI value with trend"""
    value: float
    formatted_value: str
    metric_type: MetricType
    trend_direction: Optional[TrendDirection] = None
    trend_percentage: Optional[float] = None
    comparison_value: Optional[float] = None
    comparison_label: Optional[str] = None


class ChartDataPoint(BaseModel):
    """Single data point for charts"""
    label: str
    value: float
    color: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class ChartSeries(BaseModel):
    """Series for multi-series charts"""
    name: str
    data: List[ChartDataPoint]
    color: Optional[str] = None


class ChartConfig(BaseModel):
    """Chart configuration"""
    chart_type: ChartType
    title: str
    subtitle: Optional[str] = None
    x_axis_label: Optional[str] = None
    y_axis_label: Optional[str] = None
    show_legend: bool = True
    show_data_labels: bool = False
    colors: Optional[List[str]] = None
    stacked: bool = False


class WidgetConfig(BaseModel):
    """Dashboard widget configuration"""
    widget_id: str
    widget_type: str  # kpi, chart, list, table, calendar
    title: str
    size: WidgetSize = WidgetSize.MEDIUM
    position: Dict[str, int] = {"x": 0, "y": 0}
    refresh_interval: int = 300  # seconds
    config: Dict[str, Any] = {}


# ============== Main Analytics Models ==============

class DashboardKPIs(BaseModel):
    """Key Performance Indicators for dashboard"""
    # Recruitment KPIs
    total_placements: KPIValue
    active_jobs: KPIValue
    total_candidates: KPIValue
    pending_interviews: KPIValue
    
    # Financial KPIs
    total_revenue: KPIValue
    pending_payouts: KPIValue
    
    # Onboarding KPIs
    offer_acceptance_rate: KPIValue
    avg_time_to_hire: KPIValue
    
    # Period info
    period_start: date
    period_end: date
    comparison_period: Optional[ComparisonPeriod] = None


class RecruitmentAnalytics(BaseModel):
    """Recruitment analytics data"""
    # Summary
    total_applications: int = 0
    total_interviews: int = 0
    total_offers: int = 0
    total_placements: int = 0
    
    # Funnel
    funnel_data: List[ChartDataPoint] = []
    
    # Trends
    applications_trend: List[ChartDataPoint] = []
    placements_trend: List[ChartDataPoint] = []
    
    # Breakdowns
    by_source: List[ChartDataPoint] = []
    by_status: List[ChartDataPoint] = []
    by_client: List[ChartDataPoint] = []
    by_coordinator: List[ChartDataPoint] = []
    
    # Performance metrics
    avg_time_to_shortlist: float = 0
    avg_time_to_interview: float = 0
    avg_time_to_offer: float = 0
    avg_time_to_join: float = 0
    interview_to_offer_ratio: float = 0
    offer_to_join_ratio: float = 0


class FinancialAnalytics(BaseModel):
    """Financial analytics data"""
    # Summary
    total_revenue: float = 0
    total_payouts: float = 0
    total_pending: float = 0
    profit_margin: float = 0
    
    # Trends
    revenue_trend: List[ChartDataPoint] = []
    payout_trend: List[ChartDataPoint] = []
    
    # Breakdowns
    revenue_by_client: List[ChartDataPoint] = []
    payouts_by_partner: List[ChartDataPoint] = []
    revenue_by_month: List[ChartDataPoint] = []
    
    # Invoice metrics
    total_invoices: int = 0
    pending_invoices: int = 0
    overdue_invoices: int = 0
    avg_invoice_value: float = 0


class TeamAnalytics(BaseModel):
    """Team performance analytics"""
    # Summary
    total_users: int = 0
    active_users: int = 0
    
    # Activity
    total_actions: int = 0
    avg_actions_per_user: float = 0
    
    # Breakdown
    actions_by_user: List[Dict[str, Any]] = []
    actions_by_type: List[ChartDataPoint] = []
    activity_by_day: List[ChartDataPoint] = []
    
    # Performance
    top_performers: List[Dict[str, Any]] = []
    placements_by_coordinator: List[Dict[str, Any]] = []
    response_time_by_user: List[Dict[str, Any]] = []


class OnboardingAnalytics(BaseModel):
    """Onboarding analytics data"""
    # Summary
    total_offers: int = 0
    offers_accepted: int = 0
    offers_declined: int = 0
    candidates_joined: int = 0
    no_shows: int = 0
    
    # Rates
    acceptance_rate: float = 0
    no_show_rate: float = 0
    doj_extension_rate: float = 0
    
    # Trends
    offers_trend: List[ChartDataPoint] = []
    joins_trend: List[ChartDataPoint] = []
    
    # Breakdown
    by_client: List[Dict[str, Any]] = []
    by_partner: List[Dict[str, Any]] = []
    
    # Payout tracking
    payout_eligible: int = 0
    payout_pending: int = 0
    avg_days_to_eligibility: float = 0


# ============== Dashboard Configuration ==============

class DashboardLayout(BaseModel):
    """User's dashboard layout configuration"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    company_id: str
    user_id: str
    
    name: str = "My Dashboard"
    is_default: bool = False
    
    # Widget configurations
    widgets: List[WidgetConfig] = []
    
    # Layout settings
    columns: int = 4
    row_height: int = 100
    
    # Audit
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
    is_deleted: bool = False

    model_config = ConfigDict(from_attributes=True)


# ============== Request/Response Models ==============

class AnalyticsRequest(BaseModel):
    """Request for analytics data"""
    start_date: Optional[date] = None
    end_date: Optional[date] = None
    comparison: Optional[ComparisonPeriod] = None
    client_ids: Optional[List[str]] = None
    partner_ids: Optional[List[str]] = None
    coordinator_ids: Optional[List[str]] = None
    group_by: Optional[str] = None  # day, week, month


class DashboardResponse(BaseModel):
    """Complete dashboard response"""
    kpis: DashboardKPIs
    recruitment: Optional[RecruitmentAnalytics] = None
    financial: Optional[FinancialAnalytics] = None
    team: Optional[TeamAnalytics] = None
    onboarding: Optional[OnboardingAnalytics] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class ChartResponse(BaseModel):
    """Chart data response"""
    config: ChartConfig
    series: List[ChartSeries]
    total_value: Optional[float] = None
    generated_at: datetime = Field(default_factory=datetime.utcnow)


class WidgetDataResponse(BaseModel):
    """Widget data response"""
    widget_id: str
    widget_type: str
    title: str
    data: Any
    last_updated: datetime = Field(default_factory=datetime.utcnow)


class SaveDashboardRequest(BaseModel):
    """Request to save dashboard layout"""
    name: str
    widgets: List[WidgetConfig]
    is_default: bool = False


class UpdateDashboardRequest(BaseModel):
    """Request to update dashboard layout"""
    name: Optional[str] = None
    widgets: Optional[List[WidgetConfig]] = None
    is_default: Optional[bool] = None


# ============== Predefined Widgets ==============

DEFAULT_WIDGETS = [
    {
        "widget_id": "kpi_placements",
        "widget_type": "kpi",
        "title": "Placements This Month",
        "size": "small",
        "config": {"metric": "placements", "period": "this_month"}
    },
    {
        "widget_id": "kpi_revenue",
        "widget_type": "kpi",
        "title": "Revenue This Month",
        "size": "small",
        "config": {"metric": "revenue", "period": "this_month"}
    },
    {
        "widget_id": "kpi_active_jobs",
        "widget_type": "kpi",
        "title": "Active Jobs",
        "size": "small",
        "config": {"metric": "active_jobs"}
    },
    {
        "widget_id": "kpi_pending_interviews",
        "widget_type": "kpi",
        "title": "Pending Interviews",
        "size": "small",
        "config": {"metric": "pending_interviews"}
    },
    {
        "widget_id": "chart_placements_trend",
        "widget_type": "chart",
        "title": "Placements Trend",
        "size": "large",
        "config": {"chart_type": "line", "metric": "placements", "group_by": "month"}
    },
    {
        "widget_id": "chart_application_funnel",
        "widget_type": "chart",
        "title": "Application Funnel",
        "size": "medium",
        "config": {"chart_type": "funnel", "metric": "applications"}
    },
    {
        "widget_id": "list_upcoming_interviews",
        "widget_type": "list",
        "title": "Upcoming Interviews",
        "size": "medium",
        "config": {"entity": "interviews", "filter": "upcoming", "limit": 5}
    },
    {
        "widget_id": "list_recent_placements",
        "widget_type": "list",
        "title": "Recent Placements",
        "size": "medium",
        "config": {"entity": "placements", "filter": "recent", "limit": 5}
    },
    {
        "widget_id": "chart_revenue_by_client",
        "widget_type": "chart",
        "title": "Revenue by Client",
        "size": "medium",
        "config": {"chart_type": "pie", "metric": "revenue", "group_by": "client"}
    },
    {
        "widget_id": "table_pending_approvals",
        "widget_type": "table",
        "title": "Pending Approvals",
        "size": "wide",
        "config": {"entity": "invoices", "filter": "pending_approval"}
    }
]