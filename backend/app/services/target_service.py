"""
Target Service - Phase 5
Handles goals, targets, and performance tracking
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId

from app.models.company.target import (
    TargetType, TargetPeriod, TargetStatus, TargetScope,
    TargetMilestone, TargetProgress, LeaderboardEntry,
    CreateTargetRequest, UpdateTargetRequest, BulkCreateTargetRequest,
    UpdateProgressRequest, TargetResponse, TargetListResponse,
    TargetSummaryResponse, LeaderboardResponse, TargetDashboardResponse,
    TARGET_TYPE_DISPLAY, TARGET_PERIOD_DISPLAY, TARGET_STATUS_DISPLAY
)


class TargetService:
    """Service for target and goal management"""
    
    def __init__(self, db):
        self.db = db
        self.targets = db.targets
        self.target_history = db.target_history
        self.target_templates = db.target_templates
    
    # ============== Target CRUD ==============
    
    async def create_target(
        self,
        data: CreateTargetRequest,
        company_id: str,
        user_id: str,
        *,
        company_name: str = "",
        creator_name: str = "",
    ) -> TargetResponse:
        """Create a new target"""
        # Get assigned user name if individual target
        assigned_to_name = None
        if data.scope == TargetScope.INDIVIDUAL and data.assigned_to:
            user = await self.db.users.find_one({"id": data.assigned_to})
            if user:
                assigned_to_name = user.get("full_name")
        
        target = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "name": data.name,
            "description": data.description,
            "target_type": data.target_type.value,
            "scope": data.scope.value,
            "assigned_to": data.assigned_to,
            "assigned_to_name": assigned_to_name,
            "period": data.period.value,
            "start_date": data.start_date.isoformat(),
            "end_date": data.end_date.isoformat(),
            "target_value": data.target_value,
            "unit": data.unit,
            "weight": data.weight,
            "current_value": 0,
            "status": TargetStatus.NOT_STARTED.value,
            "filters": data.filters,
            "notify_on_milestones": data.notify_on_milestones,
            "notify_on_achievement": data.notify_on_achievement,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": user_id,
            "is_deleted": False
        }
        
        await self.targets.insert_one(target)

        # Send TARGET_ASSIGNED email for individual targets (best-effort)
        if data.scope.value == "individual" and data.assigned_to and data.assigned_to != user_id:
            try:
                assignee_doc = await self.db.users.find_one({"_id": data.assigned_to})
                if assignee_doc and assignee_doc.get("email"):
                    from app.services.email_service import send_target_assigned_email, _fire_email
                    # Resolve assigner name: explicit param > DB lookup > fallback
                    _by_name = creator_name or "a manager"
                    if not _by_name or _by_name == "a manager":
                        creator_doc = await self.db.users.find_one({"_id": user_id}, {"full_name": 1})
                        _by_name = (creator_doc.get("full_name") if creator_doc else None) or "a manager"
                    _fire_email(send_target_assigned_email(
                        to_email=assignee_doc["email"],
                        assignee_name=assignee_doc.get("full_name", ""),
                        target_name=data.name,
                        target_value=data.target_value,
                        unit=data.unit,
                        period=data.period.value,
                        start_date=str(data.start_date),
                        end_date=str(data.end_date),
                        assigned_by_name=_by_name,
                        company_name=company_name or company_id,
                        company_id=company_id,
                    ))
            except Exception as _e:
                import logging as _logging
                _logging.getLogger(__name__).warning("Target email scheduling failed: %s", _e)

        return await self._to_response(target)
    
    async def get_target(
        self,
        target_id: str,
        company_id: str
    ) -> Optional[TargetResponse]:
        """Get target by ID"""
        target = await self.targets.find_one({
            "id": target_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if target:
            return await self._to_response(target)
        return None
    
    async def list_targets(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        target_type: Optional[TargetType] = None,
        period: Optional[TargetPeriod] = None,
        scope: Optional[TargetScope] = None,
        assigned_to: Optional[str] = None,
        status: Optional[TargetStatus] = None,
        active_only: bool = False
    ) -> TargetListResponse:
        """List targets with filters"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if target_type:
            query["target_type"] = target_type.value
        if period:
            query["period"] = period.value
        if scope:
            query["scope"] = scope.value
        if assigned_to:
            query["assigned_to"] = assigned_to
        if status:
            query["status"] = status.value
        if active_only:
            today = date.today().isoformat()
            query["start_date"] = {"$lte": today}
            query["end_date"] = {"$gte": today}
        
        total = await self.targets.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.targets.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for target in cursor:
            items.append(await self._to_response(target))
        
        return TargetListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size
        )
    
    async def update_target(
        self,
        target_id: str,
        data: UpdateTargetRequest,
        company_id: str,
        user_id: str
    ) -> Optional[TargetResponse]:
        """Update a target"""
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.now(timezone.utc)
        update_data["updated_by"] = user_id
        
        if "end_date" in update_data and update_data["end_date"]:
            update_data["end_date"] = update_data["end_date"].isoformat()
        
        result = await self.targets.find_one_and_update(
            {"id": target_id, "company_id": company_id, "is_deleted": False},
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            return await self._to_response(result)
        return None
    
    async def delete_target(
        self,
        target_id: str,
        company_id: str,
        user_id: str
    ) -> bool:
        """Soft delete a target"""
        result = await self.targets.update_one(
            {"id": target_id, "company_id": company_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": user_id
                }
            }
        )
        return result.modified_count > 0
    
    # ============== Bulk Operations ==============
    
    async def bulk_create_targets(
        self,
        data: BulkCreateTargetRequest,
        company_id: str,
        user_id: str
    ) -> List[TargetResponse]:
        """Create targets for multiple users"""
        created_targets = []
        
        for assignment in data.assignments:
            user_id_assigned = assignment.get("user_id")
            target_value = assignment.get("target_value", data.target_value if hasattr(data, 'target_value') else 0)
            
            # Get user name
            user = await self.db.users.find_one({"id": user_id_assigned})
            assigned_to_name = user.get("full_name") if user else None
            
            target = {
                "id": str(ObjectId()),
                "company_id": company_id,
                "name": data.name,
                "description": data.description,
                "target_type": data.target_type.value,
                "scope": TargetScope.INDIVIDUAL.value,
                "assigned_to": user_id_assigned,
                "assigned_to_name": assigned_to_name,
                "period": data.period.value,
                "start_date": data.start_date.isoformat(),
                "end_date": data.end_date.isoformat(),
                "target_value": target_value,
                "unit": "count",
                "weight": 1.0,
                "current_value": 0,
                "status": TargetStatus.NOT_STARTED.value,
                "filters": {},
                "notify_on_milestones": True,
                "notify_on_achievement": True,
                "created_at": datetime.now(timezone.utc),
                "updated_at": datetime.now(timezone.utc),
                "created_by": user_id,
                "is_deleted": False
            }
            
            await self.targets.insert_one(target)
            created_targets.append(await self._to_response(target))
        
        return created_targets
    
    # ============== Progress Management ==============
    
    async def update_progress(
        self,
        target_id: str,
        data: UpdateProgressRequest,
        company_id: str,
        user_id: str
    ) -> Optional[TargetResponse]:
        """Update target progress"""
        target = await self.targets.find_one({
            "id": target_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if not target:
            return None
        
        previous_value = target.get("current_value", 0)
        new_value = data.value
        
        # Log history
        history = {
            "id": str(ObjectId()),
            "target_id": target_id,
            "company_id": company_id,
            "previous_value": previous_value,
            "new_value": new_value,
            "change_amount": new_value - previous_value,
            "change_source": data.source,
            "related_entity_type": data.related_entity_type,
            "related_entity_id": data.related_entity_id,
            "recorded_at": datetime.now(timezone.utc),
            "recorded_by": user_id
        }
        await self.target_history.insert_one(history)
        
        # Calculate new status
        target_value = target.get("target_value", 0)
        new_status = self._calculate_status(new_value, target_value, target)
        
        # Check for achievement
        achieved_at = None
        if new_status in [TargetStatus.ACHIEVED.value, TargetStatus.EXCEEDED.value]:
            if target.get("status") not in [TargetStatus.ACHIEVED.value, TargetStatus.EXCEEDED.value]:
                achieved_at = datetime.now(timezone.utc)
        
        update_data = {
            "current_value": new_value,
            "status": new_status,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": user_id
        }
        
        if achieved_at:
            update_data["achieved_at"] = achieved_at
        
        result = await self.targets.find_one_and_update(
            {"id": target_id, "company_id": company_id},
            {"$set": update_data},
            return_document=True
        )
        
        return await self._to_response(result) if result else None
    
    async def increment_progress(
        self,
        target_id: str,
        increment: float,
        company_id: str,
        user_id: str,
        source: str = "system",
        related_entity_type: Optional[str] = None,
        related_entity_id: Optional[str] = None
    ) -> Optional[TargetResponse]:
        """Increment target progress by amount"""
        target = await self.targets.find_one({
            "id": target_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if not target:
            return None
        
        new_value = target.get("current_value", 0) + increment
        
        return await self.update_progress(
            target_id=target_id,
            data=UpdateProgressRequest(
                value=new_value,
                source=source,
                related_entity_type=related_entity_type,
                related_entity_id=related_entity_id
            ),
            company_id=company_id,
            user_id=user_id
        )
    
    async def auto_update_targets(self, company_id: str) -> int:
        """Auto-update targets based on actual data (run periodically)"""
        updated_count = 0
        today = date.today()
        
        # Get active targets
        cursor = self.targets.find({
            "company_id": company_id,
            "start_date": {"$lte": today.isoformat()},
            "end_date": {"$gte": today.isoformat()},
            "is_deleted": False
        })
        
        async for target in cursor:
            target_type = TargetType(target["target_type"])
            start_date = date.fromisoformat(target["start_date"])
            end_date = date.fromisoformat(target["end_date"])
            filters = target.get("filters", {})
            
            # Calculate actual value based on target type
            actual_value = await self._calculate_actual_value(
                company_id,
                target_type,
                start_date,
                end_date,
                filters,
                target.get("assigned_to")
            )
            
            # Update if changed
            if actual_value != target.get("current_value"):
                await self.update_progress(
                    target_id=target["id"],
                    data=UpdateProgressRequest(
                        value=actual_value,
                        source="system"
                    ),
                    company_id=company_id,
                    user_id="system"
                )
                updated_count += 1
        
        return updated_count
    
    async def _calculate_actual_value(
        self,
        company_id: str,
        target_type: TargetType,
        start_date: date,
        end_date: date,
        filters: Dict[str, Any],
        assigned_to: Optional[str]
    ) -> float:
        """Calculate actual value for a target type"""
        if target_type == TargetType.PLACEMENTS:
            query = {
                "company_id": company_id,
                "status": "joined",
                "actual_doj": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }
            if assigned_to:
                # Get placements by this coordinator
                query["created_by"] = assigned_to
            return await self.db.onboards.count_documents(query)
        
        elif target_type == TargetType.REVENUE:
            pipeline = [
                {"$match": {
                    "company_id": company_id,
                    "status": "paid",
                    "payment_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                    "is_deleted": False
                }},
                {"$group": {"_id": None, "total": {"$sum": "$calculation.gross_amount"}}}
            ]
            async for doc in self.db.partner_payouts.aggregate(pipeline):
                return doc.get("total", 0)
            return 0
        
        elif target_type == TargetType.INTERVIEWS:
            query = {
                "company_id": company_id,
                "scheduled_date": {"$gte": start_date.isoformat(), "$lte": end_date.isoformat()},
                "is_deleted": False
            }
            if assigned_to:
                query["created_by"] = assigned_to
            return await self.db.interviews.count_documents(query)
        
        elif target_type == TargetType.CANDIDATES_ADDED:
            query = {
                "company_id": company_id,
                "created_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }
            if assigned_to:
                query["created_by"] = assigned_to
            return await self.db.candidates.count_documents(query)
        
        elif target_type == TargetType.JOBS_CLOSED:
            query = {
                "company_id": company_id,
                "status": "closed",
                "closed_at": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                },
                "is_deleted": False
            }
            return await self.db.jobs.count_documents(query)
        
        return 0
    
    # ============== Dashboard & Summary ==============
    
    async def get_target_summary(
        self,
        company_id: str,
        user_id: Optional[str] = None
    ) -> TargetSummaryResponse:
        """Get summary of targets"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if user_id:
            query["$or"] = [
                {"assigned_to": user_id},
                {"scope": TargetScope.COMPANY.value}
            ]
        
        # Count by status
        pipeline = [
            {"$match": query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        
        status_counts = {}
        async for doc in self.targets.aggregate(pipeline):
            status_counts[doc["_id"]] = doc["count"]
        
        total = sum(status_counts.values())
        achieved = status_counts.get(TargetStatus.ACHIEVED.value, 0) + status_counts.get(TargetStatus.EXCEEDED.value, 0)
        
        # Group by type
        type_pipeline = [
            {"$match": query},
            {"$group": {
                "_id": "$target_type",
                "total": {"$sum": 1},
                "achieved": {"$sum": {"$cond": [
                    {"$in": ["$status", [TargetStatus.ACHIEVED.value, TargetStatus.EXCEEDED.value]]},
                    1, 0
                ]}},
                "total_value": {"$sum": "$target_value"},
                "current_value": {"$sum": "$current_value"}
            }}
        ]
        
        targets_by_type = {}
        async for doc in self.targets.aggregate(type_pipeline):
            targets_by_type[doc["_id"]] = {
                "total": doc["total"],
                "achieved": doc["achieved"],
                "target_value": doc["total_value"],
                "current_value": doc["current_value"]
            }
        
        return TargetSummaryResponse(
            total_targets=total,
            achieved=achieved,
            in_progress=status_counts.get(TargetStatus.IN_PROGRESS.value, 0),
            missed=status_counts.get(TargetStatus.MISSED.value, 0),
            exceeded=status_counts.get(TargetStatus.EXCEEDED.value, 0),
            overall_achievement_rate=round((achieved / total * 100) if total > 0 else 0, 1),
            targets_by_type=targets_by_type
        )
    
    async def get_leaderboard(
        self,
        company_id: str,
        target_type: TargetType,
        period: Optional[TargetPeriod] = None,
        start_date: Optional[date] = None,
        end_date: Optional[date] = None
    ) -> LeaderboardResponse:
        """Get leaderboard for a target type"""
        # Default to current month
        if not start_date:
            start_date = date.today().replace(day=1)
        if not end_date:
            end_date = date.today()
        
        query = {
            "company_id": company_id,
            "target_type": target_type.value,
            "scope": TargetScope.INDIVIDUAL.value,
            "start_date": {"$lte": end_date.isoformat()},
            "end_date": {"$gte": start_date.isoformat()},
            "is_deleted": False
        }
        
        if period:
            query["period"] = period.value
        
        # Aggregate by user
        pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {"user_id": "$assigned_to", "user_name": "$assigned_to_name"},
                "target_value": {"$sum": "$target_value"},
                "current_value": {"$sum": "$current_value"}
            }},
            {"$sort": {"current_value": -1}}
        ]
        
        entries = []
        rank = 0
        company_total = 0
        company_target = 0
        
        async for doc in self.targets.aggregate(pipeline):
            rank += 1
            current = doc["current_value"]
            target = doc["target_value"]
            percentage = (current / target * 100) if target > 0 else 0
            
            # Determine status
            if percentage >= 100:
                status = TargetStatus.EXCEEDED if percentage > 100 else TargetStatus.ACHIEVED
            elif percentage > 0:
                status = TargetStatus.IN_PROGRESS
            else:
                status = TargetStatus.NOT_STARTED
            
            entries.append(LeaderboardEntry(
                rank=rank,
                user_id=doc["_id"]["user_id"],
                user_name=doc["_id"]["user_name"] or "Unknown",
                current_value=current,
                target_value=target,
                percentage=round(percentage, 1),
                achievement_status=status
            ))
            
            company_total += current
            company_target += target
        
        return LeaderboardResponse(
            target_type=target_type,
            period=period or TargetPeriod.MONTHLY,
            start_date=start_date,
            end_date=end_date,
            entries=entries,
            total_participants=len(entries),
            company_total=company_total,
            company_target=company_target
        )
    
    async def get_user_target_dashboard(
        self,
        user_id: str,
        company_id: str
    ) -> TargetDashboardResponse:
        """Get target dashboard for a user"""
        # Get user info
        user = await self.db.users.find_one({"id": user_id})
        user_name = user.get("full_name", "Unknown") if user else "Unknown"
        
        # Get current targets
        today = date.today()
        query = {
            "company_id": company_id,
            "$or": [
                {"assigned_to": user_id},
                {"scope": TargetScope.COMPANY.value}
            ],
            "start_date": {"$lte": today.isoformat()},
            "end_date": {"$gte": today.isoformat()},
            "is_deleted": False
        }
        
        cursor = self.targets.find(query).sort("end_date", 1)
        
        current_targets = []
        async for target in cursor:
            current_targets.append(await self._to_response(target))
        
        # Get summary
        summary = await self.get_target_summary(company_id, user_id)
        
        # Get leaderboard position
        leaderboard_rank = None
        total_participants = None
        
        # Find placement target for this user
        placement_target = await self.targets.find_one({
            "company_id": company_id,
            "assigned_to": user_id,
            "target_type": TargetType.PLACEMENTS.value,
            "start_date": {"$lte": today.isoformat()},
            "end_date": {"$gte": today.isoformat()},
            "is_deleted": False
        })
        
        if placement_target:
            leaderboard = await self.get_leaderboard(
                company_id,
                TargetType.PLACEMENTS,
                period=TargetPeriod(placement_target["period"])
            )
            for entry in leaderboard.entries:
                if entry.user_id == user_id:
                    leaderboard_rank = entry.rank
                    break
            total_participants = leaderboard.total_participants
        
        return TargetDashboardResponse(
            user_id=user_id,
            user_name=user_name,
            current_targets=current_targets,
            summary=summary,
            leaderboard_rank=leaderboard_rank,
            total_participants=total_participants
        )
    
    # ============== Helper Methods ==============
    
    def _calculate_status(
        self,
        current_value: float,
        target_value: float,
        target: Dict[str, Any]
    ) -> str:
        """Calculate target status based on progress"""
        if target_value == 0:
            return TargetStatus.NOT_STARTED.value
        
        percentage = (current_value / target_value) * 100
        end_date = date.fromisoformat(target["end_date"])
        today = date.today()
        
        if percentage >= 100:
            return TargetStatus.EXCEEDED.value if percentage > 100 else TargetStatus.ACHIEVED.value
        elif today > end_date:
            return TargetStatus.MISSED.value
        elif current_value > 0:
            return TargetStatus.IN_PROGRESS.value
        else:
            return TargetStatus.NOT_STARTED.value
    
    def _calculate_progress(self, target: Dict[str, Any]) -> TargetProgress:
        """Calculate progress details for a target"""
        current = target.get("current_value", 0)
        target_value = target.get("target_value", 0)
        start_date = date.fromisoformat(target["start_date"])
        end_date = date.fromisoformat(target["end_date"])
        today = date.today()
        
        percentage = (current / target_value * 100) if target_value > 0 else 0
        remaining = max(0, target_value - current)
        
        elapsed_days = (today - start_date).days + 1
        days_remaining = max(0, (end_date - today).days + 1)
        
        daily_rate_needed = (remaining / days_remaining) if days_remaining > 0 else 0
        current_daily_rate = (current / elapsed_days) if elapsed_days > 0 else 0
        
        on_track = current_daily_rate >= daily_rate_needed or percentage >= 100
        
        # Calculate milestones
        milestones = []
        for pct in [25, 50, 75, 100]:
            milestone_value = target_value * pct / 100
            achieved = current >= milestone_value
            milestones.append(TargetMilestone(
                percentage=pct,
                achieved_at=datetime.now(timezone.utc) if achieved else None,
                value_at_milestone=current if achieved else None
            ))
        
        return TargetProgress(
            current_value=current,
            percentage_complete=round(percentage, 1),
            remaining_value=remaining,
            days_remaining=days_remaining,
            daily_rate_needed=round(daily_rate_needed, 2),
            current_daily_rate=round(current_daily_rate, 2),
            on_track=on_track,
            milestones=milestones
        )
    
    async def _to_response(self, target: Dict[str, Any]) -> TargetResponse:
        """Convert target dict to response"""
        response = TargetResponse(**target)
        response.type_display = TARGET_TYPE_DISPLAY.get(
            TargetType(target["target_type"]), target["target_type"]
        )
        response.period_display = TARGET_PERIOD_DISPLAY.get(
            TargetPeriod(target["period"]), target["period"]
        )
        response.status_display = TARGET_STATUS_DISPLAY.get(
            TargetStatus(target["status"]), target["status"]
        )
        response.progress = self._calculate_progress(target)
        return response