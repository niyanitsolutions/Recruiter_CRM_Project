"""
Onboard Service - Phase 4
Handles onboarding workflow, day counter, and reminders
"""
from datetime import datetime, date, timedelta
from typing import Optional, List, Dict
from bson import ObjectId
import math

from app.models.company.onboard import (
    OnboardCreate, OnboardUpdate, OnboardStatusUpdate,
    OnboardResponse, OnboardListResponse,
    OnboardStatus, DocumentStatus, OnboardDocument,
    DOJExtension, DocumentUpdate, StatusHistory,
    ReminderLog, OnboardDashboardStats
)


class OnboardService:
    """Service for onboard operations"""
    
    def __init__(self, db):
        self.db = db
        self.collection = db.onboards
    
    # ============== CRUD Operations ==============
    
    async def create(
        self,
        data: OnboardCreate,
        company_id: str,
        created_by: str
    ) -> OnboardResponse:
        """Create new onboard record"""
        # Get candidate, job, client details for denormalization
        candidate = await self.db.candidates.find_one({"id": data.candidate_id})
        job = await self.db.jobs.find_one({"id": data.job_id})
        client = await self.db.clients.find_one({"id": data.client_id})
        partner = None
        if data.partner_id:
            # Get partner from users collection
            partner = await self.db.users.find_one({"id": data.partner_id})
        
        # Create initial status history
        status_history = [StatusHistory(
            to_status=OnboardStatus.OFFER_RELEASED.value,
            changed_at=datetime.utcnow(),
            changed_by=created_by,
            notes="Onboard record created"
        )]
        
        # Create document list from required documents
        documents = [
            OnboardDocument(document_type=doc_type, document_name=doc_type.replace("_", " ").title())
            for doc_type in data.documents_required
        ]
        
        onboard_data = {
            **data.model_dump(),
            "id": str(ObjectId()),
            "company_id": company_id,
            "status": OnboardStatus.OFFER_RELEASED.value,
            "documents": [doc.model_dump() for doc in documents],
            "status_history": [sh.model_dump() for sh in status_history],
            "days_at_client": 0,
            "payout_eligible": False,
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": created_by,
            "is_deleted": False,
            # Denormalized fields
            "candidate_name": candidate.get("full_name") if candidate else None,
            "candidate_email": candidate.get("email") if candidate else None,
            "candidate_mobile": candidate.get("mobile") if candidate else None,
            "job_title": job.get("title") if job else None,
            "client_name": client.get("name") if client else None,
            "partner_name": partner.get("full_name") if partner else None,
        }
        
        await self.collection.insert_one(onboard_data)
        
        # Update application status to "offered"
        await self.db.applications.update_one(
            {"id": data.application_id},
            {"$set": {"status": "offered", "updated_at": datetime.utcnow()}}
        )
        
        return OnboardResponse(**onboard_data)
    
    async def get_by_id(self, onboard_id: str, company_id: str) -> Optional[OnboardResponse]:
        """Get onboard by ID"""
        onboard = await self.collection.find_one({
            "id": onboard_id,
            "company_id": company_id,
            "is_deleted": False
        })
        return OnboardResponse(**onboard) if onboard else None
    
    async def update(
        self,
        onboard_id: str,
        data: OnboardUpdate,
        company_id: str,
        updated_by: str
    ) -> Optional[OnboardResponse]:
        """Update onboard record"""
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.utcnow()
        update_data["updated_by"] = updated_by
        
        result = await self.collection.find_one_and_update(
            {"id": onboard_id, "company_id": company_id, "is_deleted": False},
            {"$set": update_data},
            return_document=True
        )
        return OnboardResponse(**result) if result else None
    
    async def delete(
        self,
        onboard_id: str,
        company_id: str,
        deleted_by: str
    ) -> bool:
        """Soft delete onboard"""
        result = await self.collection.update_one(
            {"id": onboard_id, "company_id": company_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.utcnow(),
                    "deleted_by": deleted_by
                }
            }
        )
        return result.modified_count > 0
    
    async def list(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        status: Optional[str] = None,
        client_id: Optional[str] = None,
        partner_id: Optional[str] = None,
        search: Optional[str] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None
    ) -> OnboardListResponse:
        """List onboards with filters"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if status:
            query["status"] = status
        if client_id:
            query["client_id"] = client_id
        if partner_id:
            query["partner_id"] = partner_id
        if search:
            query["$or"] = [
                {"candidate_name": {"$regex": search, "$options": "i"}},
                {"job_title": {"$regex": search, "$options": "i"}},
                {"client_name": {"$regex": search, "$options": "i"}}
            ]
        if from_date:
            query["offer_released_date"] = {"$gte": from_date.isoformat()}
        if to_date:
            if "offer_released_date" in query:
                query["offer_released_date"]["$lte"] = to_date.isoformat()
            else:
                query["offer_released_date"] = {"$lte": to_date.isoformat()}
        
        total = await self.collection.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [OnboardResponse(**doc) async for doc in cursor]
        
        return OnboardListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size,
            pages=math.ceil(total / page_size) if total > 0 else 1
        )
    
    # ============== Status Management ==============
    
    async def update_status(
        self,
        onboard_id: str,
        data: OnboardStatusUpdate,
        company_id: str,
        updated_by: str
    ) -> Optional[OnboardResponse]:
        """Update onboard status"""
        onboard = await self.collection.find_one({
            "id": onboard_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if not onboard:
            return None
        
        # Create status history entry
        status_history = StatusHistory(
            from_status=onboard.get("status"),
            to_status=data.status.value,
            changed_at=datetime.utcnow(),
            changed_by=updated_by,
            reason=data.reason,
            notes=data.notes
        )
        
        update_data = {
            "status": data.status.value,
            "updated_at": datetime.utcnow(),
            "updated_by": updated_by
        }
        
        # Handle specific status updates
        if data.status == OnboardStatus.JOINED and data.actual_doj:
            update_data["actual_doj"] = data.actual_doj.isoformat()
            # Calculate payout eligibility date
            payout_days = onboard.get("payout_days_required", 45)
            update_data["payout_eligibility_date"] = (
                data.actual_doj + timedelta(days=payout_days)
            ).isoformat()
        
        result = await self.collection.find_one_and_update(
            {"id": onboard_id, "company_id": company_id},
            {
                "$set": update_data,
                "$push": {"status_history": status_history.model_dump()}
            },
            return_document=True
        )
        
        # If joined, create partner payout record
        if data.status == OnboardStatus.JOINED and onboard.get("partner_id"):
            await self._create_partner_payout(result)
        
        return OnboardResponse(**result) if result else None
    
    async def extend_doj(
        self,
        onboard_id: str,
        data: DOJExtension,
        company_id: str,
        updated_by: str
    ) -> Optional[OnboardResponse]:
        """Extend DOJ"""
        onboard = await self.collection.find_one({
            "id": onboard_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if not onboard:
            return None
        
        extension_reasons = onboard.get("doj_extension_reasons", [])
        extension_reasons.append(data.reason)
        
        status_history = StatusHistory(
            from_status=onboard.get("status"),
            to_status=OnboardStatus.DOJ_EXTENDED.value,
            changed_at=datetime.utcnow(),
            changed_by=updated_by,
            reason=data.reason,
            notes=f"DOJ extended to {data.new_doj}"
        )
        
        result = await self.collection.find_one_and_update(
            {"id": onboard_id, "company_id": company_id},
            {
                "$set": {
                    "expected_doj": data.new_doj.isoformat(),
                    "status": OnboardStatus.DOJ_EXTENDED.value,
                    "doj_extension_reasons": extension_reasons,
                    "updated_at": datetime.utcnow(),
                    "updated_by": updated_by
                },
                "$inc": {"doj_extension_count": 1},
                "$push": {"status_history": status_history.model_dump()}
            },
            return_document=True
        )
        
        return OnboardResponse(**result) if result else None
    
    # ============== Document Management ==============
    
    async def update_document(
        self,
        onboard_id: str,
        data: DocumentUpdate,
        company_id: str,
        updated_by: str
    ) -> Optional[OnboardResponse]:
        """Update document status"""
        onboard = await self.collection.find_one({
            "id": onboard_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if not onboard:
            return None
        
        documents = onboard.get("documents", [])
        for doc in documents:
            if doc.get("document_type") == data.document_type:
                doc["status"] = data.status.value
                if data.document_url:
                    doc["document_url"] = data.document_url
                if data.status == DocumentStatus.SUBMITTED:
                    doc["submitted_at"] = datetime.utcnow().isoformat()
                elif data.status == DocumentStatus.VERIFIED:
                    doc["verified_at"] = datetime.utcnow().isoformat()
                    doc["verified_by"] = updated_by
                elif data.status == DocumentStatus.REJECTED:
                    doc["rejection_reason"] = data.rejection_reason
                break
        
        # Check if all documents are verified
        all_verified = all(
            doc.get("status") == DocumentStatus.VERIFIED.value
            for doc in documents
        )
        
        result = await self.collection.find_one_and_update(
            {"id": onboard_id, "company_id": company_id},
            {
                "$set": {
                    "documents": documents,
                    "documents_verified": all_verified,
                    "updated_at": datetime.utcnow(),
                    "updated_by": updated_by
                }
            },
            return_document=True
        )
        
        return OnboardResponse(**result) if result else None
    
    # ============== Day Counter & Payout ==============
    
    async def update_day_counters(self, company_id: str) -> int:
        """Update day counters for all joined candidates (run daily via scheduler)"""
        today = date.today()
        updated_count = 0
        
        # Find all joined onboards
        cursor = self.collection.find({
            "company_id": company_id,
            "status": OnboardStatus.JOINED.value,
            "is_deleted": False,
            "payout_eligible": False
        })
        
        async for onboard in cursor:
            actual_doj = onboard.get("actual_doj")
            if actual_doj:
                if isinstance(actual_doj, str):
                    actual_doj = date.fromisoformat(actual_doj)
                
                days_at_client = (today - actual_doj).days
                payout_days = onboard.get("payout_days_required", 45)
                payout_eligible = days_at_client >= payout_days
                
                await self.collection.update_one(
                    {"id": onboard["id"]},
                    {
                        "$set": {
                            "days_at_client": days_at_client,
                            "payout_eligible": payout_eligible,
                            "updated_at": datetime.utcnow()
                        }
                    }
                )
                updated_count += 1
        
        return updated_count
    
    async def get_reminders_due(self, company_id: str) -> Dict[str, List[OnboardResponse]]:
        """Get onboards that need reminders (run daily)"""
        today = date.today()
        reminders = {
            "day_10": [],
            "day_30": [],
            "payout_day": [],
            "upcoming_doj": []
        }
        
        # Day 10 reminders
        cursor = self.collection.find({
            "company_id": company_id,
            "status": OnboardStatus.JOINED.value,
            "days_at_client": 10,
            "reminder_day_10_sent": False,
            "is_deleted": False
        })
        reminders["day_10"] = [OnboardResponse(**doc) async for doc in cursor]
        
        # Day 30 reminders
        cursor = self.collection.find({
            "company_id": company_id,
            "status": OnboardStatus.JOINED.value,
            "days_at_client": 30,
            "reminder_day_30_sent": False,
            "is_deleted": False
        })
        reminders["day_30"] = [OnboardResponse(**doc) async for doc in cursor]
        
        # Payout day reminders
        cursor = self.collection.find({
            "company_id": company_id,
            "status": OnboardStatus.JOINED.value,
            "payout_eligible": True,
            "reminder_payout_sent": False,
            "is_deleted": False
        })
        reminders["payout_day"] = [OnboardResponse(**doc) async for doc in cursor]
        
        # Upcoming DOJ (next 3 days)
        upcoming_date = (today + timedelta(days=3)).isoformat()
        cursor = self.collection.find({
            "company_id": company_id,
            "status": {"$in": [OnboardStatus.DOJ_CONFIRMED.value, OnboardStatus.DOJ_EXTENDED.value]},
            "expected_doj": {"$lte": upcoming_date, "$gte": today.isoformat()},
            "is_deleted": False
        })
        reminders["upcoming_doj"] = [OnboardResponse(**doc) async for doc in cursor]
        
        return reminders
    
    async def mark_reminder_sent(
        self,
        onboard_id: str,
        reminder_type: str,
        company_id: str,
        recipients: List[str],
        channel: str = "email"
    ) -> bool:
        """Mark reminder as sent"""
        reminder_log = ReminderLog(
            reminder_type=reminder_type,
            sent_at=datetime.utcnow(),
            sent_to=recipients,
            channel=channel,
            status="sent"
        )
        
        field_map = {
            "day_10": "reminder_day_10_sent",
            "day_30": "reminder_day_30_sent",
            "payout_day": "reminder_payout_sent"
        }
        
        update_data = {"$push": {"reminder_logs": reminder_log.model_dump()}}
        if reminder_type in field_map:
            update_data["$set"] = {field_map[reminder_type]: True}
        
        result = await self.collection.update_one(
            {"id": onboard_id, "company_id": company_id},
            update_data
        )
        return result.modified_count > 0
    
    # ============== Dashboard & Stats ==============
    
    async def get_dashboard_stats(self, company_id: str) -> OnboardDashboardStats:
        """Get onboarding dashboard statistics"""
        today = date.today()
        first_of_month = today.replace(day=1)
        next_week = today + timedelta(days=7)
        
        pipeline = [
            {"$match": {"company_id": company_id, "is_deleted": False}},
            {"$group": {
                "_id": "$status",
                "count": {"$sum": 1}
            }}
        ]
        
        status_counts = {}
        async for doc in self.collection.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        # Count joined this month
        joined_this_month = await self.collection.count_documents({
            "company_id": company_id,
            "status": OnboardStatus.JOINED.value,
            "actual_doj": {"$gte": first_of_month.isoformat()},
            "is_deleted": False
        })
        
        # Count payout eligible
        payout_eligible = await self.collection.count_documents({
            "company_id": company_id,
            "payout_eligible": True,
            "is_deleted": False
        })
        
        # Count pending documents
        pending_docs = await self.collection.count_documents({
            "company_id": company_id,
            "documents_verified": False,
            "status": {"$in": [
                OnboardStatus.OFFER_ACCEPTED.value,
                OnboardStatus.DOJ_CONFIRMED.value,
                OnboardStatus.JOINED.value
            ]},
            "is_deleted": False
        })
        
        # Count upcoming DOJ (next 7 days)
        upcoming_doj = await self.collection.count_documents({
            "company_id": company_id,
            "status": {"$in": [OnboardStatus.DOJ_CONFIRMED.value, OnboardStatus.DOJ_EXTENDED.value]},
            "expected_doj": {
                "$gte": today.isoformat(),
                "$lte": next_week.isoformat()
            },
            "is_deleted": False
        })
        
        return OnboardDashboardStats(
            total_offers=sum(status_counts.values()),
            offers_accepted=status_counts.get(OnboardStatus.OFFER_ACCEPTED.value, 0),
            offers_declined=status_counts.get(OnboardStatus.OFFER_DECLINED.value, 0),
            doj_confirmed=status_counts.get(OnboardStatus.DOJ_CONFIRMED.value, 0),
            joined_this_month=joined_this_month,
            no_shows=status_counts.get(OnboardStatus.NO_SHOW.value, 0),
            payout_eligible=payout_eligible,
            pending_documents=pending_docs,
            upcoming_doj=upcoming_doj
        )
    
    # ============== Helper Methods ==============
    
    async def _create_partner_payout(self, onboard: dict) -> None:
        """Create partner payout record when candidate joins"""
        from app.models.company.partner_payout import (
            PartnerCommissionRule, PayoutCalculation, PayoutStatus
        )
        
        # Get commission rule from settings
        settings = await self.db.company_settings.find_one({"company_id": onboard["company_id"]})
        commission_config = settings.get("partner_commission", {}) if settings else {}
        
        commission_rule = PartnerCommissionRule(
            commission_type=commission_config.get("type", "percentage"),
            percentage=commission_config.get("percentage", 8.33),  # Default 1 month salary
            payout_days=onboard.get("payout_days_required", 45)
        )
        
        calculation = PayoutCalculation.calculate(
            ctc=onboard.get("offer_ctc", 0),
            rule=commission_rule
        )
        
        actual_doj = onboard.get("actual_doj")
        if isinstance(actual_doj, str):
            actual_doj = date.fromisoformat(actual_doj)
        
        payout_data = {
            "id": str(ObjectId()),
            "company_id": onboard["company_id"],
            "partner_id": onboard["partner_id"],
            "onboard_id": onboard["id"],
            "candidate_id": onboard["candidate_id"],
            "job_id": onboard["job_id"],
            "client_id": onboard["client_id"],
            "candidate_ctc": onboard.get("offer_ctc", 0),
            "payout_days_required": onboard.get("payout_days_required", 45),
            "joined_date": actual_doj.isoformat() if actual_doj else None,
            "payout_eligible_date": (
                actual_doj + timedelta(days=onboard.get("payout_days_required", 45))
            ).isoformat() if actual_doj else None,
            "commission_rule": commission_rule.model_dump(),
            "calculation": calculation.model_dump(),
            "status": PayoutStatus.PENDING.value,
            "created_at": datetime.utcnow(),
            "created_by": "system",
            "is_deleted": False,
            # Denormalized
            "partner_name": onboard.get("partner_name"),
            "candidate_name": onboard.get("candidate_name"),
            "job_title": onboard.get("job_title"),
            "client_name": onboard.get("client_name")
        }
        
        await self.db.partner_payouts.insert_one(payout_data)