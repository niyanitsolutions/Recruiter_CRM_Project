"""
Report Service
Handles report generation, saving, and scheduling
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional
from bson import ObjectId

from app.core.date_utils import resolve_date_preset
from app.models.company.report import (
    ReportType, ReportCategory, DateRangePreset,
    DateRange, ReportFilter, ReportColumn, ScheduleConfig,
    ReportResponse,
    SaveReportRequest, UpdateSavedReportRequest,
    SavedReportResponse, SavedReportListResponse,
    REPORT_TYPE_DISPLAY, REPORT_CATEGORY_DISPLAY
)


class ReportService:
    """Service for report operations"""

    def __init__(self, db, master_db=None):
        self.db = db
        self.master_db = master_db
        self.saved_reports = db.saved_reports
        self.execution_logs = db.report_execution_logs
    
    # ============== Report Generation ==============
    
    async def generate_report(
        self,
        report_type: ReportType,
        company_id: str,
        filters: Optional[ReportFilter] = None,
        user_id: str = ""
    ) -> ReportResponse:
        """Generate a report based on type and filters"""
        start_time = datetime.now(timezone.utc)
        
        # Resolve date range
        date_range = self._resolve_date_range(filters.date_range if filters else None)
        
        # Get report data based on type
        if report_type == ReportType.PLACEMENTS_SUMMARY:
            data, columns = await self._generate_placements_summary(company_id, date_range, filters)
        elif report_type == ReportType.APPLICATION_FUNNEL:
            data, columns = await self._generate_application_funnel(company_id, date_range, filters)
        elif report_type == ReportType.TIME_TO_HIRE:
            data, columns = await self._generate_time_to_hire(company_id, date_range, filters)
        elif report_type == ReportType.SOURCE_EFFECTIVENESS:
            data, columns = await self._generate_source_effectiveness(company_id, date_range, filters)
        elif report_type == ReportType.JOB_AGING:
            data, columns = await self._generate_job_aging(company_id, filters)
        elif report_type == ReportType.PAYOUT_SUMMARY:
            data, columns = await self._generate_payout_summary(company_id, date_range, filters)
        elif report_type == ReportType.INVOICE_AGING:
            data, columns = await self._generate_invoice_aging(company_id, filters)
        elif report_type == ReportType.REVENUE_BY_CLIENT:
            data, columns = await self._generate_revenue_by_client(company_id, date_range, filters)
        elif report_type == ReportType.OFFER_ACCEPTANCE:
            data, columns = await self._generate_offer_acceptance(company_id, date_range, filters)
        elif report_type == ReportType.COORDINATOR_ACTIVITY:
            data, columns = await self._generate_coordinator_activity(company_id, date_range, filters)
        elif report_type == ReportType.CANDIDATE_PIPELINE:
            data, columns = await self._generate_candidate_pipeline(company_id, date_range, filters)
        elif report_type == ReportType.INTERVIEW_CONVERSION:
            data, columns = await self._generate_interview_conversion(company_id, date_range, filters)
        elif report_type == ReportType.RECRUITER_PERFORMANCE:
            data, columns = await self._generate_recruiter_performance(company_id, date_range, filters)
        elif report_type == ReportType.CLIENT_SUMMARY:
            data, columns = await self._generate_client_summary(company_id, date_range, filters)
        elif report_type == ReportType.CLIENT_HIRING_TREND:
            data, columns = await self._generate_client_hiring_trend(company_id, date_range, filters)
        elif report_type == ReportType.COMMISSION_TRENDS:
            data, columns = await self._generate_commission_trends(company_id, date_range, filters)
        elif report_type == ReportType.PAYMENT_HISTORY:
            data, columns = await self._generate_payment_history(company_id, date_range, filters)
        elif report_type == ReportType.TAX_SUMMARY:
            data, columns = await self._generate_tax_summary(company_id, date_range, filters)
        elif report_type == ReportType.NO_SHOW_ANALYSIS:
            data, columns = await self._generate_no_show_analysis(company_id, date_range, filters)
        elif report_type == ReportType.DOJ_EXTENSIONS:
            data, columns = await self._generate_doj_extensions(company_id, date_range, filters)
        elif report_type == ReportType.DOCUMENT_COMPLIANCE:
            data, columns = await self._generate_document_compliance(company_id, filters)
        elif report_type == ReportType.PAYOUT_ELIGIBILITY:
            data, columns = await self._generate_payout_eligibility(company_id, date_range, filters)
        elif report_type == ReportType.USER_PRODUCTIVITY:
            data, columns = await self._generate_user_productivity(company_id, date_range, filters)
        elif report_type == ReportType.RESPONSE_TIME:
            data, columns = await self._generate_response_time(company_id, date_range, filters)
        elif report_type == ReportType.LOGIN_ACTIVITY:
            data, columns = await self._generate_login_activity(company_id, date_range, filters)
        elif report_type == ReportType.USER_ACTIONS:
            data, columns = await self._generate_user_actions(company_id, date_range, filters)
        else:
            data, columns = [], []
        
        # Calculate execution time
        execution_time = int((datetime.now(timezone.utc) - start_time).total_seconds() * 1000)
        
        # Log execution
        await self._log_execution(
            company_id=company_id,
            report_type=report_type,
            filters=filters,
            row_count=len(data),
            execution_time=execution_time,
            user_id=user_id
        )
        
        return ReportResponse(
            report_type=report_type,
            report_name=REPORT_TYPE_DISPLAY.get(report_type, report_type.value),
            generated_at=datetime.now(timezone.utc),
            filters_applied=filters.model_dump() if filters else {},
            columns=columns,
            data=data,
            total_rows=len(data)
        )
    
    # ============== Saved Reports ==============
    
    async def save_report(
        self,
        data: SaveReportRequest,
        company_id: str,
        user_id: str
    ) -> SavedReportResponse:
        """Save a report configuration"""
        # Determine category from report type
        category = self._get_category_for_type(data.report_type)
        
        saved_report = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "name": data.name,
            "description": data.description,
            "report_type": data.report_type.value,
            "category": category.value,
            "filters": data.filters.model_dump() if data.filters else {},
            "columns": data.columns,
            "sort_by": data.sort_by,
            "sort_order": data.sort_order,
            "is_public": data.is_public,
            "shared_with": data.shared_with,
            "schedule": data.schedule.model_dump() if data.schedule else None,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": user_id,
            "is_deleted": False
        }
        
        # Calculate next run if scheduled
        if data.schedule and data.schedule.is_active:
            saved_report["next_run"] = self._calculate_next_run(data.schedule)
        
        await self.saved_reports.insert_one(saved_report)
        
        return SavedReportResponse(**saved_report)
    
    async def get_saved_report(
        self,
        report_id: str,
        company_id: str
    ) -> Optional[SavedReportResponse]:
        """Get a saved report by ID"""
        report = await self.saved_reports.find_one({
            "id": report_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if report:
            report["type_display"] = REPORT_TYPE_DISPLAY.get(
                ReportType(report["report_type"]), report["report_type"]
            )
            report["category_display"] = REPORT_CATEGORY_DISPLAY.get(
                ReportCategory(report["category"]), report["category"]
            )
            return SavedReportResponse(**report)
        return None
    
    async def list_saved_reports(
        self,
        company_id: str,
        user_id: str,
        category: Optional[ReportCategory] = None,
        page: int = 1,
        page_size: int = 20
    ) -> SavedReportListResponse:
        """List saved reports"""
        query = {
            "company_id": company_id,
            "is_deleted": False,
            "$or": [
                {"created_by": user_id},
                {"is_public": True},
                {"shared_with": user_id}
            ]
        }
        
        if category:
            query["category"] = category.value
        
        total = await self.saved_reports.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.saved_reports.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for report in cursor:
            report["type_display"] = REPORT_TYPE_DISPLAY.get(
                ReportType(report["report_type"]), report["report_type"]
            )
            report["category_display"] = REPORT_CATEGORY_DISPLAY.get(
                ReportCategory(report["category"]), report["category"]
            )
            items.append(SavedReportResponse(**report))
        
        return SavedReportListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size
        )
    
    async def update_saved_report(
        self,
        report_id: str,
        data: UpdateSavedReportRequest,
        company_id: str,
        user_id: str
    ) -> Optional[SavedReportResponse]:
        """Update a saved report"""
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user_id
        
        if "filters" in update_data and update_data["filters"]:
            update_data["filters"] = update_data["filters"]
        if "schedule" in update_data and update_data["schedule"]:
            update_data["schedule"] = update_data["schedule"]
            update_data["next_run"] = self._calculate_next_run(
                ScheduleConfig(**update_data["schedule"])
            )
        
        result = await self.saved_reports.find_one_and_update(
            {"id": report_id, "company_id": company_id, "is_deleted": False},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            return SavedReportResponse(**result)
        return None
    
    async def delete_saved_report(
        self,
        report_id: str,
        company_id: str,
        user_id: str
    ) -> bool:
        """Delete a saved report"""
        result = await self.saved_reports.update_one(
            {"id": report_id, "company_id": company_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": user_id
                }
            }
        )
        return result.modified_count > 0
    
    # ============== Report Generation Methods ==============

    async def _get_company_job_ids(self, company_id: str) -> list:
        """Return all job _id values for the company — used to scope application queries
        (applications collection stores no company_id; jobs do)."""
        return await self.db.jobs.distinct("_id", {"company_id": company_id, "is_deleted": False})

    async def _generate_placements_summary(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate placements summary report"""
        start_date, end_date = date_range
        
        query = {
            "company_id": company_id,
            "status": "joined",
            "is_deleted": False
        }
        
        if start_date and end_date:
            query["actual_doj"] = {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        
        if filters:
            if filters.client_ids:
                query["client_id"] = {"$in": filters.client_ids}
            if filters.partner_ids:
                query["partner_id"] = {"$in": filters.partner_ids}
        
        # Aggregate by group_by field
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {
                    "client_name": "$client_name",
                    "partner_name": "$partner_name"
                },
                "placements": {"$sum": 1},
                "total_ctc": {"$sum": "$offer_ctc"},
                "avg_ctc": {"$avg": "$offer_ctc"}
            }},
            {"$sort": {"placements": -1}}
        ]
        
        data = []
        async for doc in self.db.onboards.aggregate(pipeline):
            data.append({
                "client_name": doc["_id"].get("client_name", "Unknown"),
                "partner_name": doc["_id"].get("partner_name", "Direct"),
                "placements": doc["placements"],
                "total_ctc": round(doc["total_ctc"], 2),
                "avg_ctc": round(doc["avg_ctc"], 2)
            })
        
        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
            ReportColumn(key="total_ctc", label="Total CTC", data_type="currency"),
            ReportColumn(key="avg_ctc", label="Avg CTC", data_type="currency"),
        ]
        
        return data, columns
    
    async def _generate_application_funnel(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate application funnel report"""
        start_date, end_date = date_range

        job_ids = await self._get_company_job_ids(company_id)
        query = {"job_id": {"$in": job_ids}, "is_deleted": False}

        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }

        if filters:
            if filters.client_ids:
                query["client_id"] = {"$in": filters.client_ids}
            if filters.coordinator_ids:
                query["created_by"] = {"$in": filters.coordinator_ids}

        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]

        status_counts = {}
        async for doc in self.db.applications.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]

        # Correct ApplicationStatus funnel stages (applied → joined)
        funnel_stages = [
            "applied", "eligible", "screening", "shortlisted",
            "interview", "next_round", "selected", "offered",
            "offer_accepted", "joined"
        ]

        data = []
        total = sum(status_counts.values()) or 1

        for stage in funnel_stages:
            count = status_counts.get(stage, 0)
            data.append({
                "stage": stage.replace("_", " ").title(),
                "count": count,
                "percentage": round(count / total * 100, 1)
            })

        columns = [
            ReportColumn(key="stage", label="Stage", data_type="string"),
            ReportColumn(key="count", label="Count", data_type="number"),
            ReportColumn(key="percentage", label="Percentage", data_type="percentage"),
        ]

        return data, columns
    
    async def _generate_time_to_hire(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate time-to-hire report"""
        start_date, end_date = date_range
        
        query = {
            "company_id": company_id,
            "status": "joined",
            "is_deleted": False
        }
        
        if start_date and end_date:
            query["actual_doj"] = {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        
        pipeline = [
            {"$match": query},
            {"$lookup": {
                "from": "applications",
                "localField": "application_id",
                "foreignField": "_id",
                "as": "application"
            }},
            {"$unwind": "$application"},
            {"$project": {
                "client_name": 1,
                "job_title": 1,
                "days_to_hire": {
                    "$divide": [
                        {"$subtract": [
                            {"$dateFromString": {"dateString": "$actual_doj"}},
                            "$application.created_at"
                        ]},
                        86400000  # milliseconds in a day
                    ]
                }
            }},
            {"$group": {
                "_id": "$client_name",
                "avg_days": {"$avg": "$days_to_hire"},
                "min_days": {"$min": "$days_to_hire"},
                "max_days": {"$max": "$days_to_hire"},
                "placements": {"$sum": 1}
            }},
            {"$sort": {"avg_days": 1}}
        ]
        
        data = []
        async for doc in self.db.onboards.aggregate(pipeline):
            data.append({
                "client_name": doc["_id"] or "Unknown",
                "avg_days": round(doc["avg_days"], 1),
                "min_days": round(doc["min_days"], 1),
                "max_days": round(doc["max_days"], 1),
                "placements": doc["placements"]
            })
        
        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="avg_days", label="Avg Days", data_type="number"),
            ReportColumn(key="min_days", label="Min Days", data_type="number"),
            ReportColumn(key="max_days", label="Max Days", data_type="number"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
        ]
        
        return data, columns
    
    async def _generate_source_effectiveness(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate source effectiveness report — join candidates (source) with applications (status)"""
        start_date, end_date = date_range

        cand_query = {"company_id": company_id, "is_deleted": False}
        if start_date and end_date:
            cand_query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }

        # Join candidates with their applications to get source → application status distribution
        pipeline = [
            {"$match": cand_query},
            {"$lookup": {
                "from": "applications",
                "localField": "_id",
                "foreignField": "candidate_id",
                "as": "apps"
            }},
            {"$unwind": {"path": "$apps", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": "$source",
                "total": {"$sum": 1},
                "shortlisted": {"$sum": {"$cond": [
                    {"$in": ["$apps.status", [
                        "shortlisted", "interview", "next_round",
                        "selected", "offered", "offer_accepted", "joined"
                    ]]},
                    1, 0
                ]}},
                "joined": {"$sum": {"$cond": [{"$eq": ["$apps.status", "joined"]}, 1, 0]}}
            }},
            {"$sort": {"total": -1}}
        ]

        data = []
        async for doc in self.db.candidates.aggregate(pipeline):
            total = doc["total"]
            data.append({
                "source": doc["_id"] or "Unknown",
                "total_candidates": total,
                "shortlisted": doc["shortlisted"],
                "joined": doc["joined"],
                "conversion_rate": round(doc["joined"] / total * 100, 1) if total > 0 else 0
            })

        columns = [
            ReportColumn(key="source", label="Source", data_type="string"),
            ReportColumn(key="total_candidates", label="Total Candidates", data_type="number"),
            ReportColumn(key="shortlisted", label="Shortlisted", data_type="number"),
            ReportColumn(key="joined", label="Joined", data_type="number"),
            ReportColumn(key="conversion_rate", label="Conversion %", data_type="percentage"),
        ]

        return data, columns
    
    async def _generate_job_aging(
        self,
        company_id: str,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate job aging report"""
        today = date.today()
        
        query = {
            "company_id": company_id,
            "status": "open",
            "is_deleted": False
        }
        
        cursor = self.db.jobs.find(query).sort("created_at", 1)
        
        data = []
        async for job in cursor:
            created = job.get("created_at")
            if isinstance(created, datetime):
                days_open = (today - created.date()).days
            else:
                days_open = 0
            
            data.append({
                "job_title": job.get("title", "Unknown"),
                "client_name": job.get("client_name", "Unknown"),
                "positions": job.get("positions", 1),
                "filled": job.get("positions_filled", 0),
                "remaining": job.get("positions", 1) - job.get("positions_filled", 0),
                "days_open": days_open,
                "applications": job.get("application_count", 0)
            })
        
        columns = [
            ReportColumn(key="job_title", label="Job Title", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="positions", label="Positions", data_type="number"),
            ReportColumn(key="filled", label="Filled", data_type="number"),
            ReportColumn(key="remaining", label="Remaining", data_type="number"),
            ReportColumn(key="days_open", label="Days Open", data_type="number"),
            ReportColumn(key="applications", label="Applications", data_type="number"),
        ]
        
        return data, columns
    
    async def _generate_payout_summary(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate payout summary report"""
        start_date, end_date = date_range
        
        query = {"company_id": company_id, "is_deleted": False}
        
        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {
                    "partner_name": "$partner_name",
                    "status": "$status"
                },
                "count": {"$sum": 1},
                "total_amount": {"$sum": "$calculation.net_amount"}
            }},
            {"$sort": {"total_amount": -1}}
        ]
        
        partner_data = {}
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            partner = doc["_id"]["partner_name"] or "Unknown"
            status = doc["_id"]["status"]
            
            if partner not in partner_data:
                partner_data[partner] = {
                    "partner_name": partner,
                    "total_placements": 0,
                    "pending_amount": 0,
                    "eligible_amount": 0,
                    "paid_amount": 0
                }
            
            partner_data[partner]["total_placements"] += doc["count"]
            
            if status in ["pending"]:
                partner_data[partner]["pending_amount"] += doc["total_amount"]
            elif status in ["eligible", "invoice_raised", "invoice_approved"]:
                partner_data[partner]["eligible_amount"] += doc["total_amount"]
            elif status == "paid":
                partner_data[partner]["paid_amount"] += doc["total_amount"]
        
        data = list(partner_data.values())
        
        columns = [
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="total_placements", label="Placements", data_type="number"),
            ReportColumn(key="pending_amount", label="Pending", data_type="currency"),
            ReportColumn(key="eligible_amount", label="Eligible", data_type="currency"),
            ReportColumn(key="paid_amount", label="Paid", data_type="currency"),
        ]
        
        return data, columns
    
    async def _generate_invoice_aging(
        self,
        company_id: str,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate invoice aging report"""
        today = date.today()
        
        query = {
            "company_id": company_id,
            "status": {"$in": ["submitted", "approved"]},
            "is_deleted": False
        }
        
        cursor = self.db.partner_invoices.find(query).sort("invoice_date", 1)
        
        data = []
        async for invoice in cursor:
            invoice_date = invoice.get("invoice_date")
            if isinstance(invoice_date, str):
                invoice_date = date.fromisoformat(invoice_date)
            
            days_outstanding = (today - invoice_date).days if invoice_date else 0
            
            # Categorize by age
            if days_outstanding <= 30:
                age_bucket = "0-30 days"
            elif days_outstanding <= 60:
                age_bucket = "31-60 days"
            elif days_outstanding <= 90:
                age_bucket = "61-90 days"
            else:
                age_bucket = "90+ days"
            
            data.append({
                "invoice_number": invoice.get("invoice_number", ""),
                "partner_name": invoice.get("partner_name", "Unknown"),
                "invoice_date": invoice_date.isoformat() if invoice_date else "",
                "amount": invoice.get("total_amount", 0),
                "status": invoice.get("status", ""),
                "days_outstanding": days_outstanding,
                "age_bucket": age_bucket
            })
        
        columns = [
            ReportColumn(key="invoice_number", label="Invoice #", data_type="string"),
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="invoice_date", label="Invoice Date", data_type="date"),
            ReportColumn(key="amount", label="Amount", data_type="currency"),
            ReportColumn(key="status", label="Status", data_type="string"),
            ReportColumn(key="days_outstanding", label="Days Outstanding", data_type="number"),
            ReportColumn(key="age_bucket", label="Age Bucket", data_type="string"),
        ]
        
        return data, columns
    
    async def _generate_revenue_by_client(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate revenue by client report"""
        start_date, end_date = date_range
        
        query = {
            "company_id": company_id,
            "status": "paid",
            "is_deleted": False
        }
        
        if start_date and end_date:
            query["payment_date"] = {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$client_name",
                "placements": {"$sum": 1},
                "total_revenue": {"$sum": "$calculation.gross_amount"},
                "total_gst": {"$sum": "$calculation.gst_amount"}
            }},
            {"$sort": {"total_revenue": -1}}
        ]
        
        data = []
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            data.append({
                "client_name": doc["_id"] or "Unknown",
                "placements": doc["placements"],
                "total_revenue": round(doc["total_revenue"], 2),
                "total_gst": round(doc["total_gst"], 2),
                "net_revenue": round(doc["total_revenue"] - doc["total_gst"], 2)
            })
        
        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
            ReportColumn(key="total_revenue", label="Gross Revenue", data_type="currency"),
            ReportColumn(key="total_gst", label="GST", data_type="currency"),
            ReportColumn(key="net_revenue", label="Net Revenue", data_type="currency"),
        ]
        
        return data, columns
    
    async def _generate_offer_acceptance(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate offer acceptance report"""
        start_date, end_date = date_range
        
        query = {"company_id": company_id, "is_deleted": False}
        
        if start_date and end_date:
            query["offer_released_date"] = {
                "$gte": start_date.isoformat(),
                "$lte": end_date.isoformat()
            }
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$client_name",
                "total_offers": {"$sum": 1},
                "accepted": {"$sum": {"$cond": [
                    {"$in": ["$status", ["offer_accepted", "doj_confirmed", "doj_extended", "joined", "completed"]]},
                    1, 0
                ]}},
                "declined": {"$sum": {"$cond": [{"$eq": ["$status", "offer_declined"]}, 1, 0]}},
                "pending": {"$sum": {"$cond": [{"$eq": ["$status", "offer_released"]}, 1, 0]}},
                "joined": {"$sum": {"$cond": [{"$eq": ["$status", "joined"]}, 1, 0]}},
                "no_show": {"$sum": {"$cond": [{"$eq": ["$status", "no_show"]}, 1, 0]}}
            }},
            {"$sort": {"total_offers": -1}}
        ]
        
        data = []
        async for doc in self.db.onboards.aggregate(pipeline):
            total = doc["total_offers"]
            data.append({
                "client_name": doc["_id"] or "Unknown",
                "total_offers": total,
                "accepted": doc["accepted"],
                "declined": doc["declined"],
                "pending": doc["pending"],
                "joined": doc["joined"],
                "no_show": doc["no_show"],
                "acceptance_rate": round((doc["accepted"] / total * 100) if total > 0 else 0, 1),
                "join_rate": round((doc["joined"] / doc["accepted"] * 100) if doc["accepted"] > 0 else 0, 1)
            })
        
        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="total_offers", label="Total Offers", data_type="number"),
            ReportColumn(key="accepted", label="Accepted", data_type="number"),
            ReportColumn(key="declined", label="Declined", data_type="number"),
            ReportColumn(key="joined", label="Joined", data_type="number"),
            ReportColumn(key="no_show", label="No Show", data_type="number"),
            ReportColumn(key="acceptance_rate", label="Acceptance %", data_type="percentage"),
            ReportColumn(key="join_rate", label="Join %", data_type="percentage"),
        ]
        
        return data, columns
    
    async def _generate_coordinator_activity(
        self,
        company_id: str,
        date_range: tuple,
        filters: Optional[ReportFilter]
    ) -> tuple:
        """Generate coordinator activity report"""
        start_date, end_date = date_range
        
        # audit_logs are DB-scoped (no company_id field) — filter by date only
        query = {}
        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }

        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {
                    "user_id": "$user_id",
                    "user_name": "$user_name"
                },
                "total_actions": {"$sum": 1},
                "creates": {"$sum": {"$cond": [{"$eq": ["$action", "create"]}, 1, 0]}},
                "updates": {"$sum": {"$cond": [{"$eq": ["$action", "update"]}, 1, 0]}},
                "deletes": {"$sum": {"$cond": [{"$eq": ["$action", "delete"]}, 1, 0]}}
            }},
            {"$sort": {"total_actions": -1}}
        ]
        
        data = []
        async for doc in self.db.audit_logs.aggregate(pipeline):
            data.append({
                "user_name": doc["_id"].get("user_name", "Unknown"),
                "total_actions": doc["total_actions"],
                "creates": doc["creates"],
                "updates": doc["updates"],
                "deletes": doc["deletes"]
            })
        
        columns = [
            ReportColumn(key="user_name", label="User", data_type="string"),
            ReportColumn(key="total_actions", label="Total Actions", data_type="number"),
            ReportColumn(key="creates", label="Creates", data_type="number"),
            ReportColumn(key="updates", label="Updates", data_type="number"),
            ReportColumn(key="deletes", label="Deletes", data_type="number"),
        ]
        
        return data, columns
    
    # ============== Missing Report Generation Methods ==============

    async def _generate_candidate_pipeline(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Candidate pipeline report — stage distribution across applications (pipeline stages live on applications)"""
        start_date, end_date = date_range

        job_ids = await self._get_company_job_ids(company_id)
        query = {"job_id": {"$in": job_ids}, "is_deleted": False}
        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        if filters and filters.coordinator_ids:
            query["created_by"] = {"$in": filters.coordinator_ids}
        if filters and filters.client_ids:
            query["client_id"] = {"$in": filters.client_ids}

        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        status_counts = {}
        async for doc in self.db.applications.aggregate(pipeline):
            status_counts[doc["_id"] or "unknown"] = doc["count"]

        # Correct ApplicationStatus values
        stages = [
            "applied", "eligible", "screening", "shortlisted", "interview",
            "next_round", "selected", "offered", "offer_accepted", "offer_declined",
            "joined", "rejected", "on_hold", "withdrawn"
        ]
        total = sum(status_counts.values()) or 1
        data = []
        for stage in stages:
            count = status_counts.get(stage, 0)
            if count > 0 or stage in ["applied", "shortlisted", "joined"]:
                data.append({
                    "stage": stage.replace("_", " ").title(),
                    "count": count,
                    "percentage": round(count / total * 100, 1)
                })

        columns = [
            ReportColumn(key="stage", label="Pipeline Stage", data_type="string"),
            ReportColumn(key="count", label="Applications", data_type="number"),
            ReportColumn(key="percentage", label="Share %", data_type="percentage"),
        ]
        return data, columns

    async def _generate_interview_conversion(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Interview conversion funnel — scheduled → attended → passed → offered → joined"""
        start_date, end_date = date_range
        # interviews are DB-scoped (no company_id field)
        base_query = {
            "is_deleted": False,
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        }

        scheduled = await self.db.interviews.count_documents({**base_query, "status": {"$in": ["scheduled", "completed", "passed", "failed"]}})
        attended = await self.db.interviews.count_documents({**base_query, "status": {"$in": ["completed", "passed", "failed"]}})
        passed = await self.db.interviews.count_documents({**base_query, "status": "passed"})

        onboard_query = {
            "company_id": company_id, "is_deleted": False,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }
        offered = await self.db.onboards.count_documents(onboard_query)
        joined = await self.db.onboards.count_documents({**onboard_query, "status": "joined"})

        stages = [
            ("Scheduled", scheduled),
            ("Attended", attended),
            ("Passed", passed),
            ("Offered", offered),
            ("Joined", joined),
        ]
        data = []
        for i, (label, count) in enumerate(stages):
            prev = stages[i - 1][1] if i > 0 else count
            data.append({
                "stage": label,
                "count": count,
                "conversion_from_prev": round(count / prev * 100, 1) if prev > 0 else 0,
                "conversion_from_start": round(count / scheduled * 100, 1) if scheduled > 0 else 0,
            })

        columns = [
            ReportColumn(key="stage", label="Stage", data_type="string"),
            ReportColumn(key="count", label="Count", data_type="number"),
            ReportColumn(key="conversion_from_prev", label="Conversion % (prev)", data_type="percentage"),
            ReportColumn(key="conversion_from_start", label="Overall Conversion %", data_type="percentage"),
        ]
        return data, columns

    async def _generate_recruiter_performance(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Recruiter performance leaderboard"""
        start_date, end_date = date_range

        job_ids = await self._get_company_job_ids(company_id)
        dt_filter = {
            "$gte": datetime.combine(start_date, datetime.min.time()),
            "$lte": datetime.combine(end_date, datetime.max.time())
        }

        # Applications created per user
        app_pipeline = [
            {"$match": {
                "job_id": {"$in": job_ids}, "is_deleted": False,
                "created_at": dt_filter
            }},
            {"$group": {
                "_id": "$created_by",
                "applications": {"$sum": 1},
                "shortlisted": {"$sum": {"$cond": [
                    {"$in": ["$status", ["shortlisted", "interview", "next_round", "selected", "offered", "offer_accepted", "joined"]]},
                    1, 0
                ]}},
            }}
        ]
        recruiter_apps = {}
        async for doc in self.db.applications.aggregate(app_pipeline):
            if doc["_id"]:
                recruiter_apps[doc["_id"]] = {"applications": doc["applications"], "shortlisted": doc["shortlisted"]}

        # Interviews scheduled per user (interviews are DB-scoped, no company_id)
        intv_pipeline = [
            {"$match": {"is_deleted": False, "created_at": dt_filter}},
            {"$group": {"_id": "$created_by", "interviews": {"$sum": 1}}}
        ]
        recruiter_intv = {}
        async for doc in self.db.interviews.aggregate(intv_pipeline):
            if doc["_id"]:
                recruiter_intv[doc["_id"]] = doc["interviews"]

        # Placements per user (via onboards → applications)
        place_pipeline = [
            {"$match": {
                "company_id": company_id, "status": "joined", "is_deleted": False,
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            }},
            {"$lookup": {"from": "applications", "localField": "application_id", "foreignField": "_id", "as": "app"}},
            {"$unwind": {"path": "$app", "preserveNullAndEmptyArrays": True}},
            {"$group": {
                "_id": "$app.created_by",
                "placements": {"$sum": 1},
                "revenue": {"$sum": "$calculation.gross_amount"}
            }}
        ]
        recruiter_place = {}
        async for doc in self.db.onboards.aggregate(place_pipeline):
            if doc["_id"]:
                recruiter_place[doc["_id"]] = {"placements": doc["placements"], "revenue": doc.get("revenue", 0)}

        # Gather all recruiter IDs and batch load user names
        all_ids = list(set(list(recruiter_apps.keys()) + list(recruiter_intv.keys()) + list(recruiter_place.keys())))
        user_map = {}
        async for user in self.db.users.find({"id": {"$in": all_ids}, "company_id": company_id}):
            user_map[user["id"]] = user.get("full_name") or user.get("name") or user.get("username", "Unknown")

        data = []
        for uid in all_ids:
            apps = recruiter_apps.get(uid, {})
            place = recruiter_place.get(uid, {})
            intv_count = recruiter_intv.get(uid, 0)
            total_apps = apps.get("applications", 0)
            placements = place.get("placements", 0)
            data.append({
                "recruiter_name": user_map.get(uid, uid),
                "applications": total_apps,
                "shortlisted": apps.get("shortlisted", 0),
                "interviews": intv_count,
                "placements": placements,
                "revenue": round(place.get("revenue", 0), 2),
                "conversion_rate": round(placements / total_apps * 100, 1) if total_apps > 0 else 0,
            })
        data.sort(key=lambda x: x["placements"], reverse=True)

        columns = [
            ReportColumn(key="recruiter_name", label="Recruiter", data_type="string"),
            ReportColumn(key="applications", label="Applications", data_type="number"),
            ReportColumn(key="shortlisted", label="Shortlisted", data_type="number"),
            ReportColumn(key="interviews", label="Interviews", data_type="number"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
            ReportColumn(key="revenue", label="Revenue Generated", data_type="currency"),
            ReportColumn(key="conversion_rate", label="Conversion %", data_type="percentage"),
        ]
        return data, columns

    async def _generate_client_summary(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Client summary report — open jobs, placements, revenue per client"""
        start_date, end_date = date_range

        # Open jobs per client
        job_pipeline = [
            {"$match": {"company_id": company_id, "status": "open", "is_deleted": False}},
            {"$group": {"_id": "$client_name", "open_jobs": {"$sum": 1}, "total_positions": {"$sum": "$positions"}, "filled": {"$sum": "$positions_filled"}}}
        ]
        client_jobs = {}
        async for doc in self.db.jobs.aggregate(job_pipeline):
            k = doc["_id"] or "Unknown"
            client_jobs[k] = {"open_jobs": doc["open_jobs"], "total_positions": doc["total_positions"], "filled": doc["filled"]}

        # Placements per client in date range
        place_pipeline = [
            {"$match": {
                "company_id": company_id, "status": "joined", "is_deleted": False,
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            }},
            {"$group": {"_id": "$client_name", "placements": {"$sum": 1}}}
        ]
        client_place = {}
        async for doc in self.db.onboards.aggregate(place_pipeline):
            client_place[doc["_id"] or "Unknown"] = doc["placements"]

        # Revenue per client
        rev_pipeline = [
            {"$match": {
                "company_id": company_id, "status": "paid", "is_deleted": False,
                "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            }},
            {"$group": {"_id": "$client_name", "revenue": {"$sum": "$calculation.gross_amount"}}}
        ]
        client_rev = {}
        async for doc in self.db.partner_payouts.aggregate(rev_pipeline):
            client_rev[doc["_id"] or "Unknown"] = round(doc["revenue"], 2)

        all_clients = list(set(list(client_jobs.keys()) + list(client_place.keys()) + list(client_rev.keys())))
        data = []
        for client in all_clients:
            jobs = client_jobs.get(client, {})
            data.append({
                "client_name": client,
                "open_jobs": jobs.get("open_jobs", 0),
                "total_positions": jobs.get("total_positions", 0),
                "positions_filled": jobs.get("filled", 0),
                "placements": client_place.get(client, 0),
                "revenue": client_rev.get(client, 0),
            })
        data.sort(key=lambda x: x["placements"], reverse=True)

        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="open_jobs", label="Open Jobs", data_type="number"),
            ReportColumn(key="total_positions", label="Total Positions", data_type="number"),
            ReportColumn(key="positions_filled", label="Positions Filled", data_type="number"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
            ReportColumn(key="revenue", label="Revenue", data_type="currency"),
        ]
        return data, columns

    async def _generate_client_hiring_trend(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Client hiring trend — month-by-month placements per client"""
        start_date, end_date = date_range
        pipeline = [
            {"$match": {
                "company_id": company_id, "status": "joined", "is_deleted": False,
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
            }},
            {"$addFields": {"doj_date": {"$dateFromString": {"dateString": "$actual_doj", "onError": None}}}},
            {"$group": {
                "_id": {
                    "client": "$client_name",
                    "month": {"$dateToString": {"format": "%Y-%m", "date": "$doj_date"}}
                },
                "placements": {"$sum": 1}
            }},
            {"$sort": {"_id.month": 1, "placements": -1}}
        ]
        data = []
        async for doc in self.db.onboards.aggregate(pipeline):
            if doc["_id"].get("month"):
                data.append({
                    "client_name": doc["_id"].get("client") or "Unknown",
                    "month": doc["_id"]["month"],
                    "placements": doc["placements"]
                })

        columns = [
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="month", label="Month", data_type="string"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
        ]
        return data, columns

    async def _generate_commission_trends(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Monthly commission trend per partner"""
        start_date, end_date = date_range
        pipeline = [
            {"$match": {
                "company_id": company_id, "is_deleted": False,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                }
            }},
            {"$group": {
                "_id": {
                    "partner": "$partner_name",
                    "month": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}}
                },
                "placements": {"$sum": 1},
                "commission": {"$sum": "$calculation.net_amount"},
                "gross": {"$sum": "$calculation.gross_amount"}
            }},
            {"$sort": {"_id.month": 1, "commission": -1}}
        ]
        data = []
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            data.append({
                "partner_name": doc["_id"].get("partner") or "Unknown",
                "month": doc["_id"].get("month", ""),
                "placements": doc["placements"],
                "commission": round(doc["commission"], 2),
                "gross_amount": round(doc["gross"], 2)
            })

        columns = [
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="month", label="Month", data_type="string"),
            ReportColumn(key="placements", label="Placements", data_type="number"),
            ReportColumn(key="gross_amount", label="Gross Amount", data_type="currency"),
            ReportColumn(key="commission", label="Commission (Net)", data_type="currency"),
        ]
        return data, columns

    async def _generate_payment_history(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Payment history — all paid transactions"""
        start_date, end_date = date_range
        query = {
            "company_id": company_id,
            "status": "paid",
            "is_deleted": False,
            "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }
        if filters and filters.partner_ids:
            query["partner_id"] = {"$in": filters.partner_ids}

        cursor = self.db.partner_payouts.find(query).sort("payment_date", -1)
        data = []
        async for doc in cursor:
            calc = doc.get("calculation", {})
            data.append({
                "partner_name": doc.get("partner_name", "Unknown"),
                "candidate_name": doc.get("candidate_name", ""),
                "client_name": doc.get("client_name", ""),
                "payment_date": doc.get("payment_date", ""),
                "gross_amount": round(calc.get("gross_amount", 0), 2),
                "tds_amount": round(calc.get("tds_amount", 0), 2),
                "gst_amount": round(calc.get("gst_amount", 0), 2),
                "net_amount": round(calc.get("net_amount", 0), 2),
                "status": doc.get("status", "")
            })

        columns = [
            ReportColumn(key="payment_date", label="Payment Date", data_type="date"),
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="candidate_name", label="Candidate", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="gross_amount", label="Gross", data_type="currency"),
            ReportColumn(key="tds_amount", label="TDS", data_type="currency"),
            ReportColumn(key="gst_amount", label="GST", data_type="currency"),
            ReportColumn(key="net_amount", label="Net Paid", data_type="currency"),
        ]
        return data, columns

    async def _generate_tax_summary(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """GST/TDS summary grouped by month"""
        start_date, end_date = date_range
        pipeline = [
            {"$match": {
                "company_id": company_id, "is_deleted": False,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                }
            }},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m", "date": "$created_at"}},
                "gross_amount": {"$sum": "$calculation.gross_amount"},
                "gst_amount": {"$sum": "$calculation.gst_amount"},
                "tds_amount": {"$sum": "$calculation.tds_amount"},
                "net_amount": {"$sum": "$calculation.net_amount"},
                "transactions": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        data = []
        async for doc in self.db.partner_payouts.aggregate(pipeline):
            data.append({
                "month": doc["_id"],
                "transactions": doc["transactions"],
                "gross_amount": round(doc["gross_amount"], 2),
                "gst_amount": round(doc["gst_amount"], 2),
                "tds_amount": round(doc["tds_amount"], 2),
                "net_amount": round(doc["net_amount"], 2)
            })

        columns = [
            ReportColumn(key="month", label="Month", data_type="string"),
            ReportColumn(key="transactions", label="Transactions", data_type="number"),
            ReportColumn(key="gross_amount", label="Gross Amount", data_type="currency"),
            ReportColumn(key="gst_amount", label="GST", data_type="currency"),
            ReportColumn(key="tds_amount", label="TDS", data_type="currency"),
            ReportColumn(key="net_amount", label="Net Amount", data_type="currency"),
        ]
        return data, columns

    async def _generate_no_show_analysis(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """No-show analysis — candidates who didn't join after offer acceptance"""
        start_date, end_date = date_range
        query = {
            "company_id": company_id, "status": "no_show", "is_deleted": False,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }
        cursor = self.db.onboards.find(query).sort("offer_released_date", -1)
        data = []
        async for doc in cursor:
            data.append({
                "candidate_name": doc.get("candidate_name", ""),
                "client_name": doc.get("client_name", ""),
                "job_title": doc.get("job_title", ""),
                "offer_released_date": doc.get("offer_released_date", ""),
                "expected_doj": doc.get("expected_doj", ""),
                "partner_name": doc.get("partner_name", "Direct"),
                "offer_ctc": doc.get("offer_ctc", 0),
            })

        columns = [
            ReportColumn(key="candidate_name", label="Candidate", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="job_title", label="Job Title", data_type="string"),
            ReportColumn(key="offer_released_date", label="Offer Date", data_type="date"),
            ReportColumn(key="expected_doj", label="Expected DOJ", data_type="date"),
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="offer_ctc", label="Offer CTC", data_type="currency"),
        ]
        return data, columns

    async def _generate_doj_extensions(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """DOJ extensions report — onboards where DOJ was extended"""
        start_date, end_date = date_range
        query = {
            "company_id": company_id,
            "status": {"$in": ["doj_extended", "doj_confirmed"]},
            "is_deleted": False,
            "offer_released_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }
        cursor = self.db.onboards.find(query).sort("offer_released_date", -1)
        data = []
        async for doc in cursor:
            data.append({
                "candidate_name": doc.get("candidate_name", ""),
                "client_name": doc.get("client_name", ""),
                "job_title": doc.get("job_title", ""),
                "original_doj": doc.get("expected_doj", ""),
                "current_doj": doc.get("actual_doj", ""),
                "extension_count": doc.get("doj_extension_count", 0),
                "status": doc.get("status", ""),
            })

        columns = [
            ReportColumn(key="candidate_name", label="Candidate", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="job_title", label="Job Title", data_type="string"),
            ReportColumn(key="original_doj", label="Original DOJ", data_type="date"),
            ReportColumn(key="current_doj", label="Current DOJ", data_type="date"),
            ReportColumn(key="extension_count", label="Extensions", data_type="number"),
            ReportColumn(key="status", label="Status", data_type="string"),
        ]
        return data, columns

    async def _generate_document_compliance(
        self, company_id: str, filters: Optional[ReportFilter]
    ) -> tuple:
        """Document compliance report — onboards with pending/missing documents"""
        query = {
            "company_id": company_id,
            "status": {"$in": ["doj_confirmed", "joined"]},
            "is_deleted": False
        }
        cursor = self.db.onboards.find(query).sort("actual_doj", 1)
        data = []
        async for doc in cursor:
            # documents_required: List[str] of required doc type names
            # documents: List[OnboardDocument] with document_type + status fields
            required_types = doc.get("documents_required", [])
            submitted_docs = doc.get("documents", [])
            submitted_type_set = {d.get("document_type") for d in submitted_docs if d.get("document_type")}
            received_statuses = {"submitted", "verified", "approved", "received"}
            docs_received = sum(1 for d in submitted_docs if d.get("status") in received_statuses)
            missing_types = [t for t in required_types if t not in submitted_type_set]

            if missing_types or not submitted_docs:
                data.append({
                    "candidate_name": doc.get("candidate_name", ""),
                    "client_name": doc.get("client_name", ""),
                    "actual_doj": doc.get("actual_doj", doc.get("expected_doj", "")),
                    "documents_required": len(required_types),
                    "documents_received": docs_received,
                    "missing_documents": ", ".join(missing_types) if missing_types else "No documents uploaded",
                    "compliance_pct": round(docs_received / len(required_types) * 100, 0) if required_types else 0,
                })

        columns = [
            ReportColumn(key="candidate_name", label="Candidate", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="actual_doj", label="DOJ", data_type="date"),
            ReportColumn(key="documents_required", label="Required", data_type="number"),
            ReportColumn(key="documents_received", label="Received", data_type="number"),
            ReportColumn(key="missing_documents", label="Pending Documents", data_type="string"),
            ReportColumn(key="compliance_pct", label="Compliance %", data_type="percentage"),
        ]
        return data, columns

    async def _generate_payout_eligibility(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Payout eligibility — joined candidates without processed payout"""
        start_date, end_date = date_range
        query = {
            "company_id": company_id,
            "status": "joined",
            "payout_eligible": True,
            "is_deleted": False,
            "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()}
        }

        # Get all eligible onboards
        joined_cursor = self.db.onboards.find(query).sort("actual_doj", 1)
        eligible_onboard_ids = []
        onboard_data = {}
        async for doc in joined_cursor:
            oid = doc.get("id") or str(doc.get("_id", ""))
            eligible_onboard_ids.append(oid)
            onboard_data[oid] = doc

        # Find which ones already have a payout record
        paid_pipeline = [
            {"$match": {"company_id": company_id, "onboard_id": {"$in": eligible_onboard_ids}}},
            {"$group": {"_id": "$onboard_id"}}
        ]
        processed_ids = set()
        async for doc in self.db.partner_payouts.aggregate(paid_pipeline):
            processed_ids.add(doc["_id"])

        data = []
        for oid, doc in onboard_data.items():
            if oid not in processed_ids:
                data.append({
                    "candidate_name": doc.get("candidate_name", ""),
                    "client_name": doc.get("client_name", ""),
                    "partner_name": doc.get("partner_name", "Direct"),
                    "actual_doj": doc.get("actual_doj", ""),
                    "offer_ctc": doc.get("offer_ctc", 0),
                    "payout_status": "Not Processed",
                })

        columns = [
            ReportColumn(key="candidate_name", label="Candidate", data_type="string"),
            ReportColumn(key="client_name", label="Client", data_type="string"),
            ReportColumn(key="partner_name", label="Partner", data_type="string"),
            ReportColumn(key="actual_doj", label="DOJ", data_type="date"),
            ReportColumn(key="offer_ctc", label="CTC", data_type="currency"),
            ReportColumn(key="payout_status", label="Payout Status", data_type="string"),
        ]
        return data, columns

    async def _generate_user_productivity(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """User productivity — per-user counts of applications, interviews, offers"""
        start_date, end_date = date_range
        dt_match = {
            "$gte": datetime.combine(start_date, datetime.min.time()),
            "$lte": datetime.combine(end_date, datetime.max.time())
        }

        job_ids = await self._get_company_job_ids(company_id)

        # Applications created per user
        app_pipeline = [
            {"$match": {"job_id": {"$in": job_ids}, "is_deleted": False, "created_at": dt_match}},
            {"$group": {"_id": "$created_by", "applications": {"$sum": 1}}}
        ]
        user_apps = {}
        async for doc in self.db.applications.aggregate(app_pipeline):
            if doc["_id"]:
                user_apps[doc["_id"]] = doc["applications"]

        # Interviews scheduled per user
        # interviews are DB-scoped (no company_id field)
        intv_pipeline = [
            {"$match": {"is_deleted": False, "created_at": dt_match}},
            {"$group": {"_id": "$created_by", "interviews": {"$sum": 1}}}
        ]
        user_intv = {}
        async for doc in self.db.interviews.aggregate(intv_pipeline):
            if doc["_id"]:
                user_intv[doc["_id"]] = doc["interviews"]

        # Candidates added per user
        cand_pipeline = [
            {"$match": {"company_id": company_id, "is_deleted": False, "created_at": dt_match}},
            {"$group": {"_id": "$created_by", "candidates": {"$sum": 1}}}
        ]
        user_cands = {}
        async for doc in self.db.candidates.aggregate(cand_pipeline):
            if doc["_id"]:
                user_cands[doc["_id"]] = doc["candidates"]

        all_ids = list(set(list(user_apps.keys()) + list(user_intv.keys()) + list(user_cands.keys())))
        user_map = {}
        async for user in self.db.users.find({"id": {"$in": all_ids}, "company_id": company_id}):
            user_map[user["id"]] = user.get("full_name") or user.get("name") or user.get("username", "Unknown")

        data = []
        for uid in all_ids:
            apps = user_apps.get(uid, 0)
            intv = user_intv.get(uid, 0)
            cands = user_cands.get(uid, 0)
            total_score = apps + intv * 2 + cands
            data.append({
                "user_name": user_map.get(uid, uid),
                "candidates_added": cands,
                "applications_created": apps,
                "interviews_scheduled": intv,
                "activity_score": total_score,
            })
        data.sort(key=lambda x: x["activity_score"], reverse=True)

        columns = [
            ReportColumn(key="user_name", label="User", data_type="string"),
            ReportColumn(key="candidates_added", label="Candidates Added", data_type="number"),
            ReportColumn(key="applications_created", label="Applications", data_type="number"),
            ReportColumn(key="interviews_scheduled", label="Interviews", data_type="number"),
            ReportColumn(key="activity_score", label="Activity Score", data_type="number"),
        ]
        return data, columns

    async def _generate_response_time(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Response time — avg hours from application creation to first status change per user"""
        start_date, end_date = date_range

        job_ids = await self._get_company_job_ids(company_id)
        pipeline = [
            {"$match": {
                "job_id": {"$in": job_ids}, "is_deleted": False,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "stage_history.1": {"$exists": True}
            }},
            # Derive first_action_at from second stage_history entry (index 1)
            {"$project": {
                "created_by": 1,
                "created_at": 1,
                "first_action_at": {"$arrayElemAt": ["$stage_history.changed_at", 1]}
            }},
            {"$match": {"first_action_at": {"$ne": None}}},
            {"$project": {
                "created_by": 1,
                "response_hours": {
                    "$divide": [
                        {"$subtract": ["$first_action_at", "$created_at"]},
                        3600000
                    ]
                }
            }},
            {"$match": {"response_hours": {"$gte": 0}}},
            {"$group": {
                "_id": "$created_by",
                "avg_response_hours": {"$avg": "$response_hours"},
                "min_response_hours": {"$min": "$response_hours"},
                "max_response_hours": {"$max": "$response_hours"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"avg_response_hours": 1}}
        ]
        raw = []
        async for doc in self.db.applications.aggregate(pipeline):
            raw.append(doc)

        user_ids = [d["_id"] for d in raw if d["_id"]]
        user_map = {}
        async for user in self.db.users.find({"id": {"$in": user_ids}, "company_id": company_id}):
            user_map[user["id"]] = user.get("full_name") or user.get("username", "Unknown")

        data = []
        for doc in raw:
            if doc["_id"]:
                avg_h = doc.get("avg_response_hours", 0) or 0
                data.append({
                    "user_name": user_map.get(doc["_id"], doc["_id"]),
                    "avg_response_hours": round(avg_h, 1),
                    "avg_response_days": round(avg_h / 24, 1),
                    "min_response_hours": round(doc.get("min_response_hours", 0) or 0, 1),
                    "applications_count": doc.get("count", 0),
                })

        columns = [
            ReportColumn(key="user_name", label="User", data_type="string"),
            ReportColumn(key="avg_response_hours", label="Avg Response (hrs)", data_type="number"),
            ReportColumn(key="avg_response_days", label="Avg Response (days)", data_type="number"),
            ReportColumn(key="min_response_hours", label="Best Response (hrs)", data_type="number"),
            ReportColumn(key="applications_count", label="Applications", data_type="number"),
        ]
        return data, columns

    async def _generate_login_activity(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """Login activity report — sessions are stored in master_db"""
        start_date, end_date = date_range

        # Sessions live in master_db, not company_db
        sessions_db = self.master_db if self.master_db else self.db
        query = {
            "company_id": company_id,
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        }

        raw_sessions = []
        async for doc in sessions_db.sessions.find(query).sort("created_at", -1).limit(1000):
            raw_sessions.append(doc)

        # Batch load user names from company_db
        user_ids = list({doc["user_id"] for doc in raw_sessions if doc.get("user_id")})
        user_map = {}
        async for user in self.db.users.find(
            {"$or": [{"id": {"$in": user_ids}}, {"_id": {"$in": user_ids}}]},
            {"id": 1, "_id": 1, "full_name": 1, "username": 1, "email": 1}
        ):
            uid = user.get("id") or str(user.get("_id", ""))
            user_map[uid] = user.get("full_name") or user.get("username") or user.get("email", "Unknown")

        data = []
        for doc in raw_sessions:
            uid = doc.get("user_id", "")
            created = doc.get("created_at")
            is_active = doc.get("is_active", False)
            session_status = doc.get("session_status") or ("active" if is_active else "ended")
            data.append({
                "user_name": user_map.get(uid, uid or "Unknown"),
                "ip_address": doc.get("ip_address", ""),
                "device_info": doc.get("device_info", ""),
                "login_time": created.isoformat() if isinstance(created, datetime) else str(created or ""),
                "session_status": session_status,
            })

        columns = [
            ReportColumn(key="user_name", label="User", data_type="string"),
            ReportColumn(key="login_time", label="Login Time", data_type="date"),
            ReportColumn(key="ip_address", label="IP Address", data_type="string"),
            ReportColumn(key="device_info", label="Device", data_type="string"),
            ReportColumn(key="session_status", label="Status", data_type="string"),
        ]
        return data, columns

    async def _generate_user_actions(
        self, company_id: str, date_range: tuple, filters: Optional[ReportFilter]
    ) -> tuple:
        """User actions audit trail"""
        start_date, end_date = date_range
        # audit_logs are DB-scoped (no company_id field) — filter by date only
        query = {
            "created_at": {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        }
        if filters and filters.coordinator_ids:
            query["user_id"] = {"$in": filters.coordinator_ids}

        cursor = self.db.audit_logs.find(query).sort("created_at", -1).limit(2000)
        data = []
        async for doc in cursor:
            ts = doc.get("created_at")
            data.append({
                "user_name": doc.get("user_name", "") or doc.get("username", ""),
                "action": doc.get("action", ""),
                "entity_type": doc.get("entity_type", doc.get("resource", "")),
                "entity_id": doc.get("entity_id", doc.get("resource_id", "")),
                "description": doc.get("description", doc.get("details", "")),
                "timestamp": ts.isoformat() if isinstance(ts, datetime) else str(ts or ""),
                "ip_address": doc.get("ip_address", ""),
            })

        columns = [
            ReportColumn(key="timestamp", label="Timestamp", data_type="date"),
            ReportColumn(key="user_name", label="User", data_type="string"),
            ReportColumn(key="action", label="Action", data_type="string"),
            ReportColumn(key="entity_type", label="Resource", data_type="string"),
            ReportColumn(key="description", label="Description", data_type="string"),
            ReportColumn(key="ip_address", label="IP Address", data_type="string"),
        ]
        return data, columns

    # ============== Helper Methods ==============

    def _resolve_date_range(self, date_range: Optional[DateRange]) -> tuple:
        """Resolve date range to actual dates"""
        today = date.today()
        if not date_range:
            return (today.replace(day=1), today)
        if date_range.preset == DateRangePreset.CUSTOM:
            return (date_range.start_date or today.replace(day=1), date_range.end_date or today)
        if date_range.preset:
            return resolve_date_preset(date_range.preset.value, today)
        return (today.replace(day=1), today)
    
    def _get_category_for_type(self, report_type: ReportType) -> ReportCategory:
        """Get category for a report type"""
        if report_type in {
            ReportType.PLACEMENTS_SUMMARY, ReportType.APPLICATION_FUNNEL,
            ReportType.TIME_TO_HIRE, ReportType.SOURCE_EFFECTIVENESS,
            ReportType.JOB_AGING, ReportType.CANDIDATE_PIPELINE,
            ReportType.INTERVIEW_CONVERSION, ReportType.RECRUITER_PERFORMANCE,
        }:
            return ReportCategory.RECRUITMENT
        if report_type in {ReportType.CLIENT_SUMMARY, ReportType.CLIENT_HIRING_TREND}:
            return ReportCategory.CLIENT
        if report_type in {
            ReportType.PAYOUT_SUMMARY, ReportType.INVOICE_AGING,
            ReportType.REVENUE_BY_CLIENT, ReportType.COMMISSION_TRENDS,
            ReportType.PAYMENT_HISTORY, ReportType.TAX_SUMMARY,
        }:
            return ReportCategory.FINANCIAL
        if report_type in {
            ReportType.OFFER_ACCEPTANCE, ReportType.NO_SHOW_ANALYSIS,
            ReportType.DOJ_EXTENSIONS, ReportType.DOCUMENT_COMPLIANCE,
            ReportType.PAYOUT_ELIGIBILITY,
        }:
            return ReportCategory.ONBOARDING
        if report_type in {ReportType.LOGIN_ACTIVITY, ReportType.USER_ACTIONS}:
            return ReportCategory.AUDIT
        return ReportCategory.TEAM
    
    def _calculate_next_run(self, schedule: ScheduleConfig) -> Optional[datetime]:
        """Calculate next run time for scheduled report"""
        import pytz
        
        tz = pytz.timezone(schedule.timezone)
        now = datetime.now(tz)
        
        hour, minute = map(int, schedule.time.split(":"))
        
        if schedule.frequency == "daily":
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
        elif schedule.frequency == "weekly":
            days_ahead = schedule.day_of_week - now.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            next_run = now + timedelta(days=days_ahead)
            next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)
        elif schedule.frequency == "monthly":
            next_run = now.replace(day=schedule.day_of_month or 1, hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)
        else:
            return None
        
        return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
    
    async def _log_execution(
        self,
        company_id: str,
        report_type: ReportType,
        filters: Optional[ReportFilter],
        row_count: int,
        execution_time: int,
        user_id: str
    ):
        """Log report execution"""
        log = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "report_type": report_type.value,
            "report_name": REPORT_TYPE_DISPLAY.get(report_type, report_type.value),
            "filters_used": filters.model_dump() if filters else {},
            "format": "json",
            "row_count": row_count,
            "execution_time_ms": execution_time,
            "status": "completed",
            "triggered_by": user_id,
            "trigger_type": "manual",
            "executed_at": datetime.now(timezone.utc)
        }
        await self.execution_logs.insert_one(log)