"""
Analytics API Routes - Phase 5
Dashboard analytics, KPIs, and chart data endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional, List
from datetime import date

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.analytics import (
    ComparisonPeriod, ChartType,
    AnalyticsRequest, DashboardResponse,
    DashboardKPIs, RecruitmentAnalytics, FinancialAnalytics,
    TeamAnalytics, OnboardingAnalytics,
    DashboardLayout, SaveDashboardRequest, UpdateDashboardRequest,
    WidgetConfig
)
from app.services.analytics_service import AnalyticsService

router = APIRouter(prefix="/analytics", tags=["Analytics"])


# ============== Dashboard ==============

@router.get("/dashboard", response_model=DashboardResponse)
async def get_dashboard(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    comparison: Optional[ComparisonPeriod] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get complete dashboard with KPIs and analytics"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date,
        comparison=comparison
    )
    
    # Get all analytics
    kpis = await service.get_dashboard_kpis(
        company_id=current_user["company_id"],
        start_date=start_date,
        end_date=end_date,
        comparison=comparison
    )
    
    recruitment = await service.get_recruitment_analytics(
        company_id=current_user["company_id"],
        request=request
    )
    
    financial = await service.get_financial_analytics(
        company_id=current_user["company_id"],
        request=request
    )
    
    onboarding = await service.get_onboarding_analytics(
        company_id=current_user["company_id"],
        request=request
    )
    
    team = await service.get_team_analytics(
        company_id=current_user["company_id"],
        request=request
    )
    
    return DashboardResponse(
        kpis=kpis,
        recruitment=recruitment,
        financial=financial,
        team=team,
        onboarding=onboarding
    )


# ============== KPIs ==============

@router.get("/kpis", response_model=DashboardKPIs)
async def get_kpis(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    comparison: Optional[ComparisonPeriod] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get dashboard KPIs"""
    service = AnalyticsService(db)
    
    return await service.get_dashboard_kpis(
        company_id=current_user["company_id"],
        start_date=start_date,
        end_date=end_date,
        comparison=comparison
    )


# ============== Specific Analytics ==============

@router.get("/recruitment", response_model=RecruitmentAnalytics)
async def get_recruitment_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    client_ids: Optional[str] = None,
    group_by: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get recruitment analytics"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date,
        client_ids=client_ids.split(",") if client_ids else None,
        group_by=group_by
    )
    
    return await service.get_recruitment_analytics(
        company_id=current_user["company_id"],
        request=request
    )


@router.get("/financial", response_model=FinancialAnalytics)
async def get_financial_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get financial analytics"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date
    )
    
    return await service.get_financial_analytics(
        company_id=current_user["company_id"],
        request=request
    )


@router.get("/onboarding", response_model=OnboardingAnalytics)
async def get_onboarding_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get onboarding analytics"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date
    )
    
    return await service.get_onboarding_analytics(
        company_id=current_user["company_id"],
        request=request
    )


@router.get("/team", response_model=TeamAnalytics)
async def get_team_analytics(
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    coordinator_ids: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get team performance analytics"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date,
        coordinator_ids=coordinator_ids.split(",") if coordinator_ids else None
    )
    
    return await service.get_team_analytics(
        company_id=current_user["company_id"],
        request=request
    )


# ============== Dashboard Layout ==============

@router.get("/layout", response_model=DashboardLayout)
async def get_dashboard_layout(
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get user's dashboard layout"""
    service = AnalyticsService(db)
    
    return await service.get_dashboard_layout(
        user_id=current_user["id"],
        company_id=current_user["company_id"]
    )


@router.post("/layout", response_model=DashboardLayout, status_code=status.HTTP_201_CREATED)
async def save_dashboard_layout(
    data: SaveDashboardRequest,
    current_user: dict = Depends(require_permissions(["analytics:edit"])),
    db = Depends(get_company_db)
):
    """Save dashboard layout"""
    service = AnalyticsService(db)
    
    return await service.save_dashboard_layout(
        user_id=current_user["id"],
        company_id=current_user["company_id"],
        name=data.name,
        widgets=data.widgets,
        is_default=data.is_default
    )


@router.put("/layout/{layout_id}", response_model=DashboardLayout)
async def update_dashboard_layout(
    layout_id: str,
    data: UpdateDashboardRequest,
    current_user: dict = Depends(require_permissions(["analytics:edit"])),
    db = Depends(get_company_db)
):
    """Update dashboard layout"""
    service = AnalyticsService(db)
    
    result = await service.update_dashboard_layout(
        layout_id=layout_id,
        user_id=current_user["id"],
        company_id=current_user["company_id"],
        widgets=data.widgets,
        name=data.name
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dashboard layout not found"
        )
    
    return result


# ============== Widget Data ==============

@router.get("/widget/{widget_id}")
async def get_widget_data(
    widget_id: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get data for a specific widget"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date
    )
    
    # Map widget IDs to data sources
    if widget_id.startswith("kpi_"):
        kpis = await service.get_dashboard_kpis(
            company_id=current_user["company_id"],
            start_date=start_date,
            end_date=end_date
        )
        
        kpi_map = {
            "kpi_placements": kpis.total_placements,
            "kpi_revenue": kpis.total_revenue,
            "kpi_active_jobs": kpis.active_jobs,
            "kpi_pending_interviews": kpis.pending_interviews,
            "kpi_candidates": kpis.total_candidates,
            "kpi_pending_payouts": kpis.pending_payouts,
            "kpi_offer_acceptance": kpis.offer_acceptance_rate,
            "kpi_time_to_hire": kpis.avg_time_to_hire
        }
        
        data = kpi_map.get(widget_id)
        if data:
            return {"widget_id": widget_id, "data": data}
    
    elif widget_id.startswith("chart_"):
        recruitment = await service.get_recruitment_analytics(
            company_id=current_user["company_id"],
            request=request
        )
        
        chart_map = {
            "chart_placements_trend": recruitment.applications_trend,
            "chart_application_funnel": recruitment.funnel_data,
            "chart_by_source": recruitment.by_source,
            "chart_by_status": recruitment.by_status
        }
        
        data = chart_map.get(widget_id)
        if data:
            return {"widget_id": widget_id, "data": data}
    
    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail=f"Widget not found: {widget_id}"
    )


# ============== Charts ==============

@router.get("/charts/{chart_type}")
async def get_chart_data(
    chart_type: str,
    metric: str,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    group_by: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["analytics:view"])),
    db = Depends(get_company_db)
):
    """Get chart data for a specific metric"""
    service = AnalyticsService(db)
    
    request = AnalyticsRequest(
        start_date=start_date,
        end_date=end_date,
        group_by=group_by
    )
    
    # Get appropriate analytics based on metric
    if metric in ["placements", "applications", "interviews", "candidates"]:
        analytics = await service.get_recruitment_analytics(
            company_id=current_user["company_id"],
            request=request
        )
        
        if metric == "placements":
            data = analytics.applications_trend  # Use placements_trend when available
        elif metric == "applications":
            data = analytics.applications_trend
        elif metric == "candidates":
            data = analytics.by_source
        else:
            data = []
    
    elif metric in ["revenue", "payouts"]:
        analytics = await service.get_financial_analytics(
            company_id=current_user["company_id"],
            request=request
        )
        
        if metric == "revenue":
            data = analytics.revenue_trend
        else:
            data = analytics.payout_trend
    
    else:
        data = []
    
    return {
        "chart_type": chart_type,
        "metric": metric,
        "data": data,
        "period": {
            "start": start_date.isoformat() if start_date else None,
            "end": end_date.isoformat() if end_date else None
        }
    }