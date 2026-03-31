"""
Audit Service - Phase 2
Handles audit logging for all operations
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.audit_log import (
    AuditLogFilter,
    get_action_display, get_entity_display, calculate_changed_fields
)


class AuditService:
    """Service for audit logging operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.audit_logs
    
    async def log(
        self,
        action: str,
        entity_type: str,
        user_id: str,
        user_name: str,
        user_role: str,
        description: str,
        entity_id: Optional[str] = None,
        entity_name: Optional[str] = None,
        user_email: Optional[str] = None,
        old_value: Optional[Dict[str, Any]] = None,
        new_value: Optional[Dict[str, Any]] = None,
        changed_fields: Optional[List[str]] = None,
        details: Optional[Dict[str, Any]] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        request_id: Optional[str] = None
    ) -> str:
        """Create an audit log entry"""
        
        # Calculate changed fields if not provided
        if changed_fields is None and old_value and new_value:
            changed_fields = calculate_changed_fields(old_value, new_value)
        
        log_id = str(ObjectId())
        
        log_doc = {
            "_id": log_id,
            "action": action,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "user_id": user_id,
            "user_name": user_name,
            "user_role": user_role,
            "user_email": user_email,
            "old_value": old_value,
            "new_value": new_value,
            "changed_fields": changed_fields or [],
            "description": description,
            "details": details,
            "ip_address": ip_address,
            "user_agent": user_agent,
            "request_id": request_id,
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.collection.insert_one(log_doc)
        
        return log_id
    
    async def get_log(self, log_id: str) -> Optional[Dict]:
        """Get a single audit log entry"""
        log = await self.collection.find_one({"_id": log_id})
        
        if log:
            log["id"] = log.pop("_id")
            log["action_display"] = get_action_display(log.get("action", ""))
            log["entity_type_display"] = get_entity_display(log.get("entity_type", ""))
        
        return log
    
    async def list_logs(
        self,
        filter_params: AuditLogFilter
    ) -> Tuple[List[Dict], int]:
        """List audit logs with filters and pagination"""
        
        # Build query
        query = {}
        
        if filter_params.action:
            query["action"] = filter_params.action
        
        if filter_params.entity_type:
            query["entity_type"] = filter_params.entity_type
        
        if filter_params.entity_id:
            query["entity_id"] = filter_params.entity_id
        
        if filter_params.user_id:
            query["user_id"] = filter_params.user_id
        
        if filter_params.start_date:
            query["created_at"] = {"$gte": filter_params.start_date}
        
        if filter_params.end_date:
            if "created_at" in query:
                query["created_at"]["$lte"] = filter_params.end_date
            else:
                query["created_at"] = {"$lte": filter_params.end_date}
        
        if filter_params.search:
            import re as _re
            _s = _re.escape(filter_params.search)
            query["$or"] = [
                {"description": {"$regex": _s, "$options": "i"}},
                {"entity_name": {"$regex": _s, "$options": "i"}},
                {"user_name": {"$regex": _s, "$options": "i"}}
            ]
        
        # Get total count
        total = await self.collection.count_documents(query)
        
        # Get paginated results
        skip = (filter_params.page - 1) * filter_params.page_size
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(filter_params.page_size)
        
        logs = []
        async for log in cursor:
            log["id"] = log.pop("_id")
            log["action_display"] = get_action_display(log.get("action", ""))
            log["entity_type_display"] = get_entity_display(log.get("entity_type", ""))
            logs.append(log)
        
        return logs, total
    
    async def get_entity_history(
        self,
        entity_type: str,
        entity_id: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """Get all audit logs for a specific entity"""
        
        query = {
            "entity_type": entity_type,
            "entity_id": entity_id
        }
        
        total = await self.collection.count_documents(query)
        
        skip = (page - 1) * page_size
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        logs = []
        async for log in cursor:
            log["id"] = log.pop("_id")
            log["action_display"] = get_action_display(log.get("action", ""))
            log["entity_type_display"] = get_entity_display(log.get("entity_type", ""))
            logs.append(log)
        
        return logs, total
    
    async def get_user_activity(
        self,
        user_id: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """Get all audit logs by a specific user"""
        
        query = {"user_id": user_id}
        
        total = await self.collection.count_documents(query)
        
        skip = (page - 1) * page_size
        cursor = self.collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        logs = []
        async for log in cursor:
            log["id"] = log.pop("_id")
            log["action_display"] = get_action_display(log.get("action", ""))
            log["entity_type_display"] = get_entity_display(log.get("entity_type", ""))
            logs.append(log)
        
        return logs, total
    
    async def get_recent_activity(
        self,
        limit: int = 10
    ) -> List[Dict]:
        """Get most recent audit logs"""
        
        cursor = self.collection.find().sort("created_at", -1).limit(limit)
        
        logs = []
        async for log in cursor:
            log["id"] = log.pop("_id")
            log["action_display"] = get_action_display(log.get("action", ""))
            log["entity_type_display"] = get_entity_display(log.get("entity_type", ""))
            # Remove detailed values for summary view
            log.pop("old_value", None)
            log.pop("new_value", None)
            logs.append(log)
        
        return logs
    
    async def get_activity_stats(
        self,
        days: int = 7
    ) -> Dict:
        """Get activity statistics for dashboard"""
        from datetime import timedelta
        
        start_date = datetime.now(timezone.utc) - timedelta(days=days)
        
        # Total actions in period
        total_actions = await self.collection.count_documents({
            "created_at": {"$gte": start_date}
        })
        
        # Actions by type
        action_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        actions_by_type = {}
        async for doc in self.collection.aggregate(action_pipeline):
            actions_by_type[doc["_id"]] = doc["count"]
        
        # Actions by entity
        entity_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}},
            {"$sort": {"count": -1}}
        ]
        actions_by_entity = {}
        async for doc in self.collection.aggregate(entity_pipeline):
            actions_by_entity[doc["_id"]] = doc["count"]
        
        # Actions by user (top 5)
        user_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {"$group": {"_id": {"user_id": "$user_id", "user_name": "$user_name"}, "count": {"$sum": 1}}},
            {"$sort": {"count": -1}},
            {"$limit": 5}
        ]
        top_users = []
        async for doc in self.collection.aggregate(user_pipeline):
            top_users.append({
                "user_id": doc["_id"]["user_id"],
                "user_name": doc["_id"]["user_name"],
                "action_count": doc["count"]
            })
        
        # Actions by day
        daily_pipeline = [
            {"$match": {"created_at": {"$gte": start_date}}},
            {
                "$group": {
                    "_id": {
                        "year": {"$year": "$created_at"},
                        "month": {"$month": "$created_at"},
                        "day": {"$dayOfMonth": "$created_at"}
                    },
                    "count": {"$sum": 1}
                }
            },
            {"$sort": {"_id.year": 1, "_id.month": 1, "_id.day": 1}}
        ]
        daily_activity = []
        async for doc in self.collection.aggregate(daily_pipeline):
            date_str = f"{doc['_id']['year']}-{doc['_id']['month']:02d}-{doc['_id']['day']:02d}"
            daily_activity.append({
                "date": date_str,
                "count": doc["count"]
            })
        
        return {
            "total_actions": total_actions,
            "actions_by_type": actions_by_type,
            "actions_by_entity": actions_by_entity,
            "top_users": top_users,
            "daily_activity": daily_activity
        }