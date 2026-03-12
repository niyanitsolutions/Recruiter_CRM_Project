"""
Report Service - Phase 5
Handles report generation, saving, and scheduling
"""
from datetime import datetime, date, timedelta
from typing import Optional
from bson import ObjectId

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
    
    def __init__(self, db):
        self.db = db
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
        start_time = datetime.utcnow()
        
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
        else:
            data, columns = [], []
        
        # Calculate execution time
        execution_time = int((datetime.utcnow() - start_time).total_seconds() * 1000)
        
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
            generated_at=datetime.utcnow(),
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
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
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
        update_data["updated_at"] = datetime.utcnow()
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
                    "deleted_at": datetime.utcnow(),
                    "deleted_by": user_id
                }
            }
        )
        return result.modified_count > 0
    
    # ============== Report Generation Methods ==============
    
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
        
        query = {"company_id": company_id, "is_deleted": False}
        
        if start_date and end_date:
            query["created_at"] = {
                "$gte": datetime.combine(start_date, datetime.min.time()),
                "$lte": datetime.combine(end_date, datetime.max.time())
            }
        
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        status_counts = {}
        async for doc in self.db.applications.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        # Define funnel stages
        funnel_stages = [
            "applied", "screening", "shortlisted", 
            "interview_scheduled", "interviewed", 
            "offered", "joined"
        ]
        
        data = []
        total = sum(status_counts.values())
        
        for stage in funnel_stages:
            count = status_counts.get(stage, 0)
            data.append({
                "stage": stage.replace("_", " ").title(),
                "count": count,
                "percentage": round((count / total * 100) if total > 0 else 0, 1)
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
                "foreignField": "id",
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
        """Generate source effectiveness report"""
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
                "_id": "$source",
                "total": {"$sum": 1},
                "shortlisted": {"$sum": {"$cond": [{"$eq": ["$status", "shortlisted"]}, 1, 0]}},
                "joined": {"$sum": {"$cond": [{"$eq": ["$status", "joined"]}, 1, 0]}}
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
                "conversion_rate": round((doc["joined"] / total * 100) if total > 0 else 0, 1)
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
        
        query = {"company_id": company_id}
        
        if start_date and end_date:
            query["timestamp"] = {
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
    
    # ============== Helper Methods ==============
    
    def _resolve_date_range(self, date_range: Optional[DateRange]) -> tuple:
        """Resolve date range to actual dates"""
        if not date_range:
            # Default to this month
            today = date.today()
            return (today.replace(day=1), today)
        
        if date_range.preset == DateRangePreset.CUSTOM:
            return (date_range.start_date, date_range.end_date)
        
        today = date.today()
        
        if date_range.preset == DateRangePreset.TODAY:
            return (today, today)
        elif date_range.preset == DateRangePreset.YESTERDAY:
            yesterday = today - timedelta(days=1)
            return (yesterday, yesterday)
        elif date_range.preset == DateRangePreset.THIS_WEEK:
            start = today - timedelta(days=today.weekday())
            return (start, today)
        elif date_range.preset == DateRangePreset.LAST_WEEK:
            end = today - timedelta(days=today.weekday() + 1)
            start = end - timedelta(days=6)
            return (start, end)
        elif date_range.preset == DateRangePreset.THIS_MONTH:
            return (today.replace(day=1), today)
        elif date_range.preset == DateRangePreset.LAST_MONTH:
            first_of_this_month = today.replace(day=1)
            last_month_end = first_of_this_month - timedelta(days=1)
            last_month_start = last_month_end.replace(day=1)
            return (last_month_start, last_month_end)
        elif date_range.preset == DateRangePreset.THIS_QUARTER:
            quarter_start_month = ((today.month - 1) // 3) * 3 + 1
            return (today.replace(month=quarter_start_month, day=1), today)
        elif date_range.preset == DateRangePreset.THIS_YEAR:
            return (today.replace(month=1, day=1), today)
        
        return (today.replace(day=1), today)
    
    def _get_category_for_type(self, report_type: ReportType) -> ReportCategory:
        """Get category for a report type"""
        recruitment_types = [
            ReportType.PLACEMENTS_SUMMARY, ReportType.APPLICATION_FUNNEL,
            ReportType.TIME_TO_HIRE, ReportType.SOURCE_EFFECTIVENESS,
            ReportType.JOB_AGING, ReportType.CANDIDATE_PIPELINE,
            ReportType.INTERVIEW_CONVERSION
        ]
        financial_types = [
            ReportType.PAYOUT_SUMMARY, ReportType.INVOICE_AGING,
            ReportType.REVENUE_BY_CLIENT, ReportType.COMMISSION_TRENDS,
            ReportType.PAYMENT_HISTORY, ReportType.TAX_SUMMARY
        ]
        onboarding_types = [
            ReportType.OFFER_ACCEPTANCE, ReportType.NO_SHOW_ANALYSIS,
            ReportType.DOJ_EXTENSIONS, ReportType.DOCUMENT_COMPLIANCE,
            ReportType.PAYOUT_ELIGIBILITY
        ]
        
        if report_type in recruitment_types:
            return ReportCategory.RECRUITMENT
        elif report_type in financial_types:
            return ReportCategory.FINANCIAL
        elif report_type in onboarding_types:
            return ReportCategory.ONBOARDING
        else:
            return ReportCategory.TEAM
    
    def _calculate_next_run(self, schedule: ScheduleConfig) -> Optional[datetime]:
        """Calculate next run time for scheduled report"""
        from datetime import datetime, timedelta
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
            "executed_at": datetime.utcnow()
        }
        await self.execution_logs.insert_one(log)