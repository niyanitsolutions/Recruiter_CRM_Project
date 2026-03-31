"""
Analytics Service - Phase 5
Dashboard analytics, KPIs, and chart data generation
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.analytics import (
    MetricType, ComparisonPeriod, TrendDirection,
    KPIValue, ChartDataPoint,
    DashboardKPIs, RecruitmentAnalytics, FinancialAnalytics,
    TeamAnalytics, OnboardingAnalytics, DashboardLayout,
    AnalyticsRequest,
    WidgetConfig, DEFAULT_WIDGETS
)


class AnalyticsService:
    """Service for analytics and dashboard operations"""
    
    def __init__(self, db):
        self.db = db
        self.dashboard_layouts = db.dashboard_layouts
    
    # ============== Dashboard KPIs ==============
    
    async def get_dashboard_kpis(
        self,
        company_id: str,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None,
        comparison: Optional[ComparisonPeriod] = None
    ) -> DashboardKPIs:
        """Get dashboard KPIs with optional comparison"""
        # Default to this month
        if not end_date:
            end_date = date.today()
        if not start_date:
            start_date = end_date.replace(day=1)
        
        # Get comparison period
        comp_start, comp_end = None, None
        if comparison:
            comp_start, comp_end = self._get_comparison_dates(start_date, end_date, comparison)
        
        # Calculate KPIs
        placements = await self._get_placements_kpi(company_id, start_date, end_date, comp_start, comp_end)
        active_jobs = await self._get_active_jobs_kpi(company_id)
        total_candidates = await self._get_candidates_kpi(company_id, start_date, end_date, comp_start, comp_end)
        pending_interviews = await self._get_pending_interviews_kpi(company_id)
        total_revenue = await self._get_revenue_kpi(company_id, start_date, end_date, comp_start, comp_end)
        pending_payouts = await self._get_pending_payouts_kpi(company_id)
        offer_acceptance = await self._get_offer_acceptance_kpi(company_id, start_date, end_date, comp_start, comp_end)
        avg_time_to_hire = await self._get_time_to_hire_kpi(company_id, start_date, end_date)
        
        return DashboardKPIs(
            total_placements=placements,
            active_jobs=active_jobs,
            total_candidates=total_candidates,
            pending_interviews=pending_interviews,
            total_revenue=total_revenue,
            pending_payouts=pending_payouts,
            offer_acceptance_rate=offer_acceptance,
            avg_time_to_hire=avg_time_to_hire,
            period_start=start_date,
            period_end=end_date,
            comparison_period=comparison
        )
    
    async def _get_placements_kpi(
        self,
        company_id: str,
        start_date: date,
        end_date: date,
        comp_start: Optional[date],
        comp_end: Optional[date]
    ) -> KPIValue:
        """Get placements KPI"""
        current = await self.db.onboards.count_documents({
            "company_id": company_id,
            "status": "joined",
            "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "is_deleted": False
        })
        
        comparison_value = None
        trend_direction = None
        trend_percentage = None
        
        if comp_start and comp_end:
            comparison_value = await self.db.onboards.count_documents({
                "company_id": company_id,
                "status": "joined",
                "actual_doj": {"$gte": comp_start.isoformat(), "$lte": comp_end.isoformat()},
                "is_deleted": False
            })
            
            if comparison_value > 0:
                trend_percentage = round(((current - comparison_value) / comparison_value) * 100, 1)
                trend_direction = TrendDirection.UP if current > comparison_value else (
                    TrendDirection.DOWN if current < comparison_value else TrendDirection.STABLE
                )
        
        return KPIValue(
            value=current,
            formatted_value=str(current),
            metric_type=MetricType.COUNT,
            trend_direction=trend_direction,
            trend_percentage=trend_percentage,
            comparison_value=comparison_value,
            comparison_label="vs previous period" if comparison_value else None
        )
    
    async def _get_active_jobs_kpi(self, company_id: str) -> KPIValue:
        """Get active jobs KPI"""
        count = await self.db.jobs.count_documents({
            "company_id": company_id,
            "status": "open",
            "is_deleted": False
        })
        
        return KPIValue(
            value=count,
            formatted_value=str(count),
            metric_type=MetricType.COUNT
        )
    
    async def _get_candidates_kpi(
        self,
        company_id: str,
        start_date: date,
        end_date: date,
        comp_start: Optional[date],
        comp_end: Optional[date]
    ) -> KPIValue:
        """Get candidates added KPI"""
        current = await self.db.candidates.count_documents({
            "company_id": company_id,
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            },
            "is_deleted": False
        })
        
        comparison_value = None
        trend_direction = None
        trend_percentage = None
        
        if comp_start and comp_end:
            comparison_value = await self.db.candidates.count_documents({
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(comp_start, datetime.min.time()),
                    "$lte": datetime.combine(comp_end, datetime.max.time())
                },
                "is_deleted": False
            })
            
            if comparison_value > 0:
                trend_percentage = round(((current - comparison_value) / comparison_value) * 100, 1)
                trend_direction = TrendDirection.UP if current > comparison_value else (
                    TrendDirection.DOWN if current < comparison_value else TrendDirection.STABLE
                )
        
        return KPIValue(
            value=current,
            formatted_value=str(current),
            metric_type=MetricType.COUNT,
            trend_direction=trend_direction,
            trend_percentage=trend_percentage,
            comparison_value=comparison_value
        )
    
    async def _get_pending_interviews_kpi(self, company_id: str) -> KPIValue:
        """Get pending interviews KPI"""
        today = date.today()
        count = await self.db.interviews.count_documents({
            "company_id": company_id,
            "status": "scheduled",
            "scheduled_date": {"$gte": today.isoformat()},
            "is_deleted": False
        })
        
        return KPIValue(
            value=count,
            formatted_value=str(count),
            metric_type=MetricType.COUNT
        )
    
    async def _get_revenue_kpi(
        self,
        company_id: str,
        start_date: date,
        end_date: date,
        comp_start: Optional[date],
        comp_end: Optional[date]
    ) -> KPIValue:
        """Get revenue KPI"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "paid",
                "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$group": {"_id": None, "total": {"$sum": "$calculation.gross_amount"}}}
        ]
        
        current = 0
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            current = doc.get("total", 0)
        
        comparison_value = None
        trend_direction = None
        trend_percentage = None
        
        if comp_start and comp_end:
            comp_pipeline = [
                {"$match": {
                    "company_id": company_id,
                    "status": "paid",
                    "payment_date": {"$gte": comp_start.isoformat(), "$lte": comp_end.isoformat()},
                    "is_deleted": False
                }},
                {"$group": {"_id": None, "total": {"$sum": "$calculation.gross_amount"}}}
            ]
            
            async for doc in self.db.partner_payouts.aggregate(comp_pipeline):
                comparison_value = doc.get("total", 0)
            
            if comparison_value and comparison_value > 0:
                trend_percentage = round(((current - comparison_value) / comparison_value) * 100, 1)
                trend_direction = TrendDirection.UP if current > comparison_value else (
                    TrendDirection.DOWN if current < comparison_value else TrendDirection.STABLE
                )
        
        return KPIValue(
            value=current,
            formatted_value=f"₹{current:,.0f}",
            metric_type=MetricType.CURRENCY,
            trend_direction=trend_direction,
            trend_percentage=trend_percentage,
            comparison_value=comparison_value
        )
    
    async def _get_pending_payouts_kpi(self, company_id: str) -> KPIValue:
        """Get pending payouts KPI"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": {"$in": ["eligible", "invoice_raised", "invoice_approved"]},
                "is_deleted": False
            }},
            {"$group": {"_id": None, "total": {"$sum": "$calculation.net_amount"}}}
        ]
        
        total = 0
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            total = doc.get("total", 0)
        
        return KPIValue(
            value=total,
            formatted_value=f"₹{total:,.0f}",
            metric_type=MetricType.CURRENCY
        )
    
    async def _get_offer_acceptance_kpi(
        self,
        company_id: str,
        start_date: date,
        end_date: date,
        comp_start: Optional[date],
        comp_end: Optional[date]
    ) -> KPIValue:
        """Get offer acceptance rate KPI"""
        query = {
            "company_id": company_id,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "is_deleted": False
        }
        
        total = await self.db.onboards.count_documents(query)
        accepted = await self.db.onboards.count_documents({
            **query,
            "status": {"$in": ["offer_accepted", "doj_confirmed", "doj_extended", "joined", "completed"]}
        })
        
        rate = (accepted / total * 100) if total > 0 else 0
        
        return KPIValue(
            value=round(rate, 1),
            formatted_value=f"{rate:.1f}%",
            metric_type=MetricType.PERCENTAGE
        )
    
    async def _get_time_to_hire_kpi(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> KPIValue:
        """Get average time to hire KPI"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "joined",
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$lookup": {
                "from": "applications",
                "localField": "application_id",
                "foreignField": "id",
                "as": "application"
            }},
            {"$unwind": "$application"},
            {"$project": {
                "days_to_hire": {
                    "$divide": [
                        {"$subtract": [
                            {"$dateFromString": {"dateString": "$actual_doj"}},
                            "$application.created_at"
                        ]},
                        86400000
                    ]
                }
            }},
            {"$group": {"_id": None, "avg_days": {"$avg": "$days_to_hire"}}}
        ]
        
        avg_days = 0
        async for doc in self.db.onboards.aggregate(pipeline):
            avg_days = doc.get("avg_days", 0)
        
        return KPIValue(
            value=round(avg_days, 1),
            formatted_value=f"{avg_days:.0f} days",
            metric_type=MetricType.AVERAGE
        )
    
    # ============== Recruitment Analytics ==============
    
    async def get_recruitment_analytics(
        self,
        company_id: str,
        request: AnalyticsRequest
    ) -> RecruitmentAnalytics:
        """Get recruitment analytics"""
        start_date = request.start_date or date.today().replace(day=1)
        end_date = request.end_date or date.today()
        
        # Get totals
        total_applications = await self.db.applications.count_documents({
            "company_id": company_id,
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            },
            "is_deleted": False
        })
        
        total_interviews = await self.db.interviews.count_documents({
            "company_id": company_id,
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            },
            "is_deleted": False
        })
        
        total_offers = await self.db.onboards.count_documents({
            "company_id": company_id,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "is_deleted": False
        })
        
        total_placements = await self.db.onboards.count_documents({
            "company_id": company_id,
            "status": "joined",
            "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "is_deleted": False
        })
        
        # Funnel data
        funnel_data = await self._get_application_funnel(company_id, start_date, end_date)
        
        # Trends
        applications_trend = await self._get_trend_data(
            self.db.applications, company_id, start_date, end_date, request.group_by or "week"
        )
        
        # By source
        by_source = await self._get_candidates_by_source(company_id, start_date, end_date)
        
        # By status
        by_status = await self._get_applications_by_status(company_id, start_date, end_date)
        
        return RecruitmentAnalytics(
            total_applications=total_applications,
            total_interviews=total_interviews,
            total_offers=total_offers,
            total_placements=total_placements,
            funnel_data=funnel_data,
            applications_trend=applications_trend,
            by_source=by_source,
            by_status=by_status
        )
    
    async def _get_application_funnel(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[ChartDataPoint]:
        """Get application funnel data"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        
        status_counts = {}
        async for doc in self.db.applications.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        stages = [
            ("Applied", ["applied", "screening"]),
            ("Shortlisted", ["shortlisted"]),
            ("Interview", ["interview_scheduled", "interviewed"]),
            ("Offered", ["offered"]),
            ("Joined", ["joined"])
        ]
        
        funnel = []
        colors = ["#3B82F6", "#8B5CF6", "#EC4899", "#F59E0B", "#10B981"]
        
        for i, (label, statuses) in enumerate(stages):
            count = sum(status_counts.get(s, 0) for s in statuses)
            funnel.append(ChartDataPoint(
                label=label,
                value=count,
                color=colors[i]
            ))
        
        return funnel
    
    async def _get_trend_data(
        self,
        collection,
        company_id: str,
        start_date: date,
        end_date: date,
        group_by: str
    ) -> List[ChartDataPoint]:
        """Get trend data grouped by period"""
        if group_by == "day":
            date_format = "%Y-%m-%d"
            group_id = {"$dateToString": {"format": date_format, "date": "$created_at"}}
        elif group_by == "week":
            group_id = {"$week": "$created_at"}
        else:  # month
            date_format = "%Y-%m"
            group_id = {"$dateToString": {"format": date_format, "date": "$created_at"}}
        
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }},
            {"$group": {"_id": group_id, "count": {"$sum": 1}}},
            {"$sort": {"_id": 1}}
        ]
        
        data = []
        async for doc in collection.aggregate(pipeline):
            data.append(ChartDataPoint(
                label=str(doc["_id"]),
                value=doc["count"]
            ))
        
        return data
    
    async def _get_candidates_by_source(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[ChartDataPoint]:
        """Get candidates by source"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }},
            {"$group": {"_id": "$source", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        
        colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#EC4899"]
        data = []
        i = 0
        
        async for doc in self.db.candidates.aggregate(pipeline):
            data.append(ChartDataPoint(
                label=doc["_id"] or "Unknown",
                value=doc["count"],
                color=colors[i % len(colors)]
            ))
            i += 1
        
        return data
    
    async def _get_applications_by_status(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[ChartDataPoint]:
        """Get applications by status"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        
        data = []
        async for doc in self.db.applications.aggregate(pipeline):
            data.append(ChartDataPoint(
                label=doc["_id"].replace("_", " ").title() if doc["_id"] else "Unknown",
                value=doc["count"]
            ))
        
        return data
    
    # ============== Financial Analytics ==============
    
    async def get_financial_analytics(
        self,
        company_id: str,
        request: AnalyticsRequest
    ) -> FinancialAnalytics:
        """Get financial analytics"""
        start_date = request.start_date or date.today().replace(day=1)
        end_date = request.end_date or date.today()
        
        # Revenue totals
        revenue_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "paid",
                "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$group": {
                "_id": None,
                "total_revenue": {"$sum": "$calculation.gross_amount"},
                "total_payouts": {"$sum": "$calculation.net_amount"}
            }}
        ]
        
        total_revenue = 0
        total_payouts = 0
        
        async for doc in self.db.partner_payouts.aggregate(revenue_pipeline):
            total_revenue = doc.get("total_revenue", 0)
            total_payouts = doc.get("total_payouts", 0)
        
        # Pending payouts
        pending_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": {"$in": ["eligible", "invoice_raised", "invoice_approved"]},
                "is_deleted": False
            }},
            {"$group": {"_id": None, "total": {"$sum": "$calculation.net_amount"}}}
        ]
        
        total_pending = 0
        async for doc in self.db.partner_payouts.aggregate(pending_pipeline):
            total_pending = doc.get("total", 0)
        
        # Revenue by client
        revenue_by_client = await self._get_revenue_by_client(company_id, start_date, end_date)
        
        # Revenue trend
        revenue_trend = await self._get_revenue_trend(company_id, start_date, end_date)
        
        # Invoice counts
        total_invoices = await self.db.partner_invoices.count_documents({
            "company_id": company_id,
            "is_deleted": False
        })
        
        pending_invoices = await self.db.partner_invoices.count_documents({
            "company_id": company_id,
            "status": {"$in": ["submitted", "approved"]},
            "is_deleted": False
        })
        
        return FinancialAnalytics(
            total_revenue=total_revenue,
            total_payouts=total_payouts,
            total_pending=total_pending,
            profit_margin=round((total_revenue - total_payouts) / total_revenue * 100, 1) if total_revenue > 0 else 0,
            revenue_trend=revenue_trend,
            revenue_by_client=revenue_by_client,
            total_invoices=total_invoices,
            pending_invoices=pending_invoices
        )
    
    async def _get_revenue_by_client(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[ChartDataPoint]:
        """Get revenue by client"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "paid",
                "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$group": {
                "_id": "$client_name",
                "revenue": {"$sum": "$calculation.gross_amount"}
            }},
            {"$sort": {"revenue": -1}},
            {"$limit": 10}
        ]
        
        colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", 
                  "#EC4899", "#14B8A6", "#F97316", "#6366F1", "#84CC16"]
        data = []
        i = 0
        
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            data.append(ChartDataPoint(
                label=doc["_id"] or "Unknown",
                value=round(doc["revenue"], 2),
                color=colors[i % len(colors)]
            ))
            i += 1
        
        return data
    
    async def _get_revenue_trend(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[ChartDataPoint]:
        """Get revenue trend by month"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "paid",
                "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$addFields": {
                "payment_date_parsed": {"$dateFromString": {"dateString": "$payment_date"}}
            }},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$payment_date_parsed"}},
                "revenue": {"$sum": "$calculation.gross_amount"}
            }},
            {"$sort": {"_id": 1}}
        ]
        
        data = []
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            data.append(ChartDataPoint(
                label=doc["_id"],
                value=round(doc["revenue"], 2)
            ))
        
        return data
    
    # ============== Onboarding Analytics ==============
    
    async def get_onboarding_analytics(
        self,
        company_id: str,
        request: AnalyticsRequest
    ) -> OnboardingAnalytics:
        """Get onboarding analytics"""
        start_date = request.start_date or date.today().replace(day=1)
        end_date = request.end_date or date.today()
        
        query = {
            "company_id": company_id,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
            "is_deleted": False
        }
        
        total_offers = await self.db.onboards.count_documents(query)
        
        offers_accepted = await self.db.onboards.count_documents({
            **query,
            "status": {"$in": ["offer_accepted", "doj_confirmed", "doj_extended", "joined", "completed"]}
        })
        
        offers_declined = await self.db.onboards.count_documents({
            **query,
            "status": "offer_declined"
        })
        
        candidates_joined = await self.db.onboards.count_documents({
            **query,
            "status": "joined"
        })
        
        no_shows = await self.db.onboards.count_documents({
            **query,
            "status": "no_show"
        })
        
        # Rates
        acceptance_rate = (offers_accepted / total_offers * 100) if total_offers > 0 else 0
        no_show_rate = (no_shows / offers_accepted * 100) if offers_accepted > 0 else 0
        
        # Payout tracking
        payout_eligible = await self.db.onboards.count_documents({
            "company_id": company_id,
            "payout_eligible": True,
            "is_deleted": False
        })
        
        payout_pending = await self.db.partner_payouts.count_documents({
            "company_id": company_id,
            "status": "pending",
            "is_deleted": False
        })
        
        return OnboardingAnalytics(
            total_offers=total_offers,
            offers_accepted=offers_accepted,
            offers_declined=offers_declined,
            candidates_joined=candidates_joined,
            no_shows=no_shows,
            acceptance_rate=round(acceptance_rate, 1),
            no_show_rate=round(no_show_rate, 1),
            payout_eligible=payout_eligible,
            payout_pending=payout_pending
        )
    
    # ============== Team Analytics ==============
    
    async def get_team_analytics(
        self,
        company_id: str,
        request: AnalyticsRequest
    ) -> TeamAnalytics:
        """Get team performance analytics"""
        start_date = request.start_date or date.today().replace(day=1)
        end_date = request.end_date or date.today()
        
        # Total users
        total_users = await self.db.users.count_documents({
            "company_id": company_id,
            "is_deleted": False
        })
        
        active_users = await self.db.users.count_documents({
            "company_id": company_id,
            "is_active": True,
            "is_deleted": False
        })
        
        # Activity from audit logs
        activity_pipeline = [
            {"$match": {
                "company_id": company_id,
                "timestamp": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                }
            }},
            {"$group": {
                "_id": {"user_id": "$user_id", "user_name": "$user_name"},
                "actions": {"$sum": 1}
            }},
            {"$sort": {"actions": -1}}
        ]
        
        actions_by_user = []
        total_actions = 0
        
        async for doc in self.db.audit_logs.aggregate(activity_pipeline):
            actions_by_user.append({
                "user_id": doc["_id"]["user_id"],
                "user_name": doc["_id"]["user_name"],
                "actions": doc["actions"]
            })
            total_actions += doc["actions"]
        
        # Top performers (by placements)
        top_performers_pipeline = [
            {"$match": {
                "company_id": company_id,
                "status": "joined",
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }},
            {"$lookup": {
                "from": "applications",
                "localField": "application_id",
                "foreignField": "id",
                "as": "application"
            }},
            {"$unwind": "$application"},
            {"$group": {
                "_id": "$application.created_by",
                "placements": {"$sum": 1}
            }},
            {"$sort": {"placements": -1}},
            {"$limit": 10}
        ]
        
        top_performers = []
        async for doc in self.db.onboards.aggregate(top_performers_pipeline):
            # Get user name
            user = await self.db.users.find_one({"id": doc["_id"]})
            top_performers.append({
                "user_id": doc["_id"],
                "user_name": user.get("full_name", "Unknown") if user else "Unknown",
                "placements": doc["placements"]
            })
        
        return TeamAnalytics(
            total_users=total_users,
            active_users=active_users,
            total_actions=total_actions,
            avg_actions_per_user=round(total_actions / active_users, 1) if active_users > 0 else 0,
            actions_by_user=actions_by_user,
            top_performers=top_performers
        )
    
    # ============== Dashboard Layout ==============
    
    async def get_dashboard_layout(
        self,
        user_id: str,
        company_id: str
    ) -> Optional[DashboardLayout]:
        """Get user's dashboard layout"""
        layout = await self.dashboard_layouts.find_one({
            "user_id": user_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if layout:
            return DashboardLayout(**layout)
        
        # Return default layout
        return DashboardLayout(
            id=str(ObjectId()),
            company_id=company_id,
            user_id=user_id,
            name="Default Dashboard",
            is_default=True,
            widgets=[WidgetConfig(**w) for w in DEFAULT_WIDGETS]
        )
    
    async def save_dashboard_layout(
        self,
        user_id: str,
        company_id: str,
        name: str,
        widgets: List[WidgetConfig],
        is_default: bool = False
    ) -> DashboardLayout:
        """Save dashboard layout"""
        layout_data = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "user_id": user_id,
            "name": name,
            "is_default": is_default,
            "widgets": [w.model_dump() for w in widgets],
            "columns": 4,
            "row_height": 100,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "is_deleted": False
        }
        
        await self.dashboard_layouts.insert_one(layout_data)
        return DashboardLayout(**layout_data)
    
    async def update_dashboard_layout(
        self,
        layout_id: str,
        user_id: str,
        company_id: str,
        widgets: Optional[List[WidgetConfig]] = None,
        name: Optional[str] = None
    ) -> Optional[DashboardLayout]:
        """Update dashboard layout"""
        update_data = {"updated_at": datetime.now(timezone.utc)}
        
        if widgets:
            update_data["widgets"] = [w.model_dump() for w in widgets]
        if name:
            update_data["name"] = name
        
        result = await self.dashboard_layouts.find_one_and_update(
            {"id": layout_id, "user_id": user_id, "company_id": company_id, "is_deleted": False},
            {"$set": update_data},
            return_document=True
        )
        
        return DashboardLayout(**result) if result else None
    
    # ============== Helper Methods ==============
    
    def _get_comparison_dates(
        self,
        start_date: date,
        end_date: date,
        comparison: ComparisonPeriod
    ) -> tuple:
        """Get comparison period dates"""
        period_days = (end_date - start_date).days + 1
        
        if comparison == ComparisonPeriod.PREVIOUS_PERIOD:
            comp_end = start_date - timedelta(days=1)
            comp_start = comp_end - timedelta(days=period_days - 1)
        elif comparison == ComparisonPeriod.PREVIOUS_MONTH:
            comp_end = start_date.replace(day=1) - timedelta(days=1)
            comp_start = comp_end.replace(day=1)
        elif comparison == ComparisonPeriod.PREVIOUS_QUARTER:
            quarter_start_month = ((start_date.month - 1) // 3) * 3 + 1
            comp_end = start_date.replace(month=quarter_start_month, day=1) - timedelta(days=1)
            comp_start_month = ((comp_end.month - 1) // 3) * 3 + 1
            comp_start = comp_end.replace(month=comp_start_month, day=1)
        elif comparison == ComparisonPeriod.PREVIOUS_YEAR:
            comp_start = start_date.replace(year=start_date.year - 1)
            comp_end = end_date.replace(year=end_date.year - 1)
        elif comparison == ComparisonPeriod.SAME_PERIOD_LAST_YEAR:
            comp_start = start_date.replace(year=start_date.year - 1)
            comp_end = end_date.replace(year=end_date.year - 1)
        else:
            return None, None
        
        return comp_start, comp_end