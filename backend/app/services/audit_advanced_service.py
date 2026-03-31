"""
Advanced Audit Service - Phase 5
Session tracking, security alerts, and enhanced audit features
(Separate from Phase 2 AuditService which handles basic audit logging)
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
import math
import hashlib

from app.models.company.audit_advanced import (
    AuditAction, AuditSeverity, SessionStatus, AlertType,
    FieldChange, GeoLocation, DeviceInfo,
    AuditLogSearchRequest, AuditLogResponse, AuditLogListResponse,
    AuditTimelineResponse, SessionResponse, SessionListResponse,
    SecurityAlertResponse, SecurityAlertListResponse,
    AuditSummaryResponse, UserActivityResponse, ChangeHistoryResponse,
    AUDIT_ACTION_DISPLAY, AUDIT_SEVERITY_DISPLAY
)


class AuditAdvancedService:
    """Service for advanced audit operations - sessions, alerts, enhanced logging"""
    
    def __init__(self, db):
        self.db = db
        self.audit_logs = db.audit_logs  # Uses same collection as Phase 2
        self.sessions = db.user_sessions
        self.security_alerts = db.security_alerts
        self.login_history = db.login_history
    
    # ============== Enhanced Audit Logging ==============
    
    async def log_action(
        self,
        company_id: Optional[str],
        user_id: str,
        user_name: str,
        user_email: str,
        user_role: str,
        action: AuditAction,
        entity_type: str,
        entity_id: Optional[str] = None,
        entity_name: Optional[str] = None,
        description: str = "",
        changes: Optional[List[FieldChange]] = None,
        old_data: Optional[Dict[str, Any]] = None,
        new_data: Optional[Dict[str, Any]] = None,
        severity: AuditSeverity = AuditSeverity.LOW,
        ip_address: Optional[str] = None,
        device: Optional[DeviceInfo] = None,
        session_id: Optional[str] = None,
        request_id: Optional[str] = None,
        api_endpoint: Optional[str] = None,
        http_method: Optional[str] = None,
        response_status: Optional[int] = None,
        duration_ms: Optional[int] = None
    ) -> str:
        """Log an audit event with enhanced details"""
        log_id = str(ObjectId())
        
        # Determine severity based on action if not provided
        if severity == AuditSeverity.LOW:
            severity = self._get_action_severity(action)
        
        audit_log = {
            "id": log_id,
            "company_id": company_id,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "user_role": user_role,
            "action": action.value,
            "severity": severity.value,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "entity_name": entity_name,
            "description": description,
            "changes": [c.model_dump() for c in changes] if changes else [],
            "old_data": old_data,
            "new_data": new_data,
            "ip_address": ip_address,
            "device": device.model_dump() if device else None,
            "session_id": session_id,
            "request_id": request_id,
            "api_endpoint": api_endpoint,
            "http_method": http_method,
            "response_status": response_status,
            "duration_ms": duration_ms,
            "timestamp": datetime.now(timezone.utc)
        }
        
        await self.audit_logs.insert_one(audit_log)
        
        # Check for security alerts
        await self._check_security_alerts(audit_log)
        
        return log_id
    
    async def search_logs(
        self,
        company_id: str,
        request: AuditLogSearchRequest
    ) -> AuditLogListResponse:
        """Search audit logs with advanced filters"""
        query = {"company_id": company_id}
        
        # Apply filters
        if request.user_id:
            query["user_id"] = request.user_id
        if request.user_ids:
            query["user_id"] = {"$in": request.user_ids}
        if request.action:
            query["action"] = request.action.value
        if request.actions:
            query["action"] = {"$in": [a.value for a in request.actions]}
        if request.severity:
            query["severity"] = request.severity.value
        if request.entity_type:
            query["entity_type"] = request.entity_type
        if request.entity_id:
            query["entity_id"] = request.entity_id
        if request.start_date:
            query["timestamp"] = {"$gte": request.start_date}
        if request.end_date:
            if "timestamp" in query:
                query["timestamp"]["$lte"] = request.end_date
            else:
                query["timestamp"] = {"$lte": request.end_date}
        if request.search:
            import re as _re
            _s = _re.escape(request.search)
            query["$or"] = [
                {"description": {"$regex": _s, "$options": "i"}},
                {"entity_name": {"$regex": _s, "$options": "i"}},
                {"user_name": {"$regex": _s, "$options": "i"}}
            ]
        
        total = await self.audit_logs.count_documents(query)
        skip = (request.page - 1) * request.page_size
        
        sort_direction = -1 if request.sort_order == "desc" else 1
        cursor = self.audit_logs.find(query).sort(
            request.sort_by, sort_direction
        ).skip(skip).limit(request.page_size)
        
        items = []
        async for log in cursor:
            response = AuditLogResponse(**log)
            response.action_display = AUDIT_ACTION_DISPLAY.get(
                AuditAction(log["action"]), log["action"]
            )
            response.severity_display = AUDIT_SEVERITY_DISPLAY.get(
                AuditSeverity(log["severity"]), log["severity"]
            )
            response.time_ago = self._get_time_ago(log["timestamp"])
            items.append(response)
        
        return AuditLogListResponse(
            items=items,
            total=total,
            page=request.page,
            page_size=request.page_size,
            pages=math.ceil(total / request.page_size) if total > 0 else 1
        )
    
    async def get_timeline(
        self,
        company_id: str,
        start_date: date,
        end_date: date
    ) -> List[AuditTimelineResponse]:
        """Get audit timeline grouped by date"""
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "timestamp": {
                    "$gte": datetime.combine(start_date, datetime.min.time()),
                    "$lte": datetime.combine(end_date, datetime.max.time())
                }
            }},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "events": {"$push": "$$ROOT"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": -1}}
        ]
        
        timeline = []
        async for doc in self.audit_logs.aggregate(pipeline):
            events = []
            for event in doc["events"][:50]:  # Limit events per day
                response = AuditLogResponse(**event)
                response.action_display = AUDIT_ACTION_DISPLAY.get(
                    AuditAction(event["action"]), event["action"]
                )
                events.append(response)
            
            timeline.append(AuditTimelineResponse(
                date=date.fromisoformat(doc["_id"]),
                events=events,
                total_events=doc["count"]
            ))
        
        return timeline
    
    async def get_entity_history(
        self,
        company_id: str,
        entity_type: str,
        entity_id: str
    ) -> ChangeHistoryResponse:
        """Get change history for an entity"""
        query = {
            "company_id": company_id,
            "entity_type": entity_type,
            "entity_id": entity_id
        }
        
        cursor = self.audit_logs.find(query).sort("timestamp", -1)
        
        changes = []
        created_at = None
        created_by = None
        last_modified_at = None
        last_modified_by = None
        entity_name = None
        
        async for log in cursor:
            response = AuditLogResponse(**log)
            response.action_display = AUDIT_ACTION_DISPLAY.get(
                AuditAction(log["action"]), log["action"]
            )
            changes.append(response)
            
            if not entity_name:
                entity_name = log.get("entity_name")
            
            if log["action"] == AuditAction.CREATE.value:
                created_at = log["timestamp"]
                created_by = log["user_name"]
            
            if not last_modified_at:
                last_modified_at = log["timestamp"]
                last_modified_by = log["user_name"]
        
        return ChangeHistoryResponse(
            entity_type=entity_type,
            entity_id=entity_id,
            entity_name=entity_name,
            changes=changes,
            total_changes=len(changes),
            created_at=created_at,
            created_by=created_by,
            last_modified_at=last_modified_at,
            last_modified_by=last_modified_by
        )
    
    async def get_audit_summary(
        self,
        company_id: str,
        start_date: datetime,
        end_date: datetime
    ) -> AuditSummaryResponse:
        """Get audit activity summary"""
        query = {
            "company_id": company_id,
            "timestamp": {"$gte": start_date, "$lte": end_date}
        }
        
        total = await self.audit_logs.count_documents(query)
        
        # By action
        action_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}}
        ]
        by_action = {}
        async for doc in self.audit_logs.aggregate(action_pipeline):
            by_action[doc["_id"]] = doc["count"]
        
        # By severity
        severity_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$severity", "count": {"$sum": 1}}}
        ]
        by_severity = {}
        async for doc in self.audit_logs.aggregate(severity_pipeline):
            by_severity[doc["_id"]] = doc["count"]
        
        # By entity type
        entity_pipeline = [
            {"$match": query},
            {"$group": {"_id": "$entity_type", "count": {"$sum": 1}}}
        ]
        by_entity_type = {}
        async for doc in self.audit_logs.aggregate(entity_pipeline):
            by_entity_type[doc["_id"]] = doc["count"]
        
        # By user
        user_pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {"user_id": "$user_id", "user_name": "$user_name"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"count": -1}},
            {"$limit": 10}
        ]
        by_user = []
        async for doc in self.audit_logs.aggregate(user_pipeline):
            by_user.append({
                "user_id": doc["_id"]["user_id"],
                "user_name": doc["_id"]["user_name"],
                "count": doc["count"]
            })
        
        # Events by day
        day_pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {"$dateToString": {"format": "%Y-%m-%d", "date": "$timestamp"}},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        events_by_day = []
        async for doc in self.audit_logs.aggregate(day_pipeline):
            events_by_day.append({"date": doc["_id"], "count": doc["count"]})
        
        # Events by hour
        hour_pipeline = [
            {"$match": query},
            {"$group": {
                "_id": {"$hour": "$timestamp"},
                "count": {"$sum": 1}
            }},
            {"$sort": {"_id": 1}}
        ]
        events_by_hour = []
        async for doc in self.audit_logs.aggregate(hour_pipeline):
            events_by_hour.append({"hour": doc["_id"], "count": doc["count"]})
        
        # Recent critical
        critical_cursor = self.audit_logs.find({
            **query,
            "severity": {"$in": [AuditSeverity.HIGH.value, AuditSeverity.CRITICAL.value]}
        }).sort("timestamp", -1).limit(10)
        
        recent_critical = []
        async for log in critical_cursor:
            response = AuditLogResponse(**log)
            response.action_display = AUDIT_ACTION_DISPLAY.get(
                AuditAction(log["action"]), log["action"]
            )
            recent_critical.append(response)
        
        return AuditSummaryResponse(
            period_start=start_date,
            period_end=end_date,
            total_events=total,
            by_action=by_action,
            by_severity=by_severity,
            by_entity_type=by_entity_type,
            by_user=by_user,
            events_by_day=events_by_day,
            events_by_hour=events_by_hour,
            top_users=by_user,
            recent_critical=recent_critical
        )
    
    # ============== Session Management ==============
    
    async def create_session(
        self,
        user_id: str,
        user_name: str,
        user_email: str,
        user_role: str,
        company_id: Optional[str],
        token: str,
        ip_address: str,
        device: DeviceInfo,
        expires_at: datetime,
        is_remembered: bool = False,
        is_api_session: bool = False
    ) -> str:
        """Create a new user session"""
        session_id = str(ObjectId())
        token_hash = hashlib.sha256(token.encode()).hexdigest()
        
        # Get geo location (in production, use IP geolocation service)
        location = GeoLocation(ip_address=ip_address)
        
        session = {
            "id": session_id,
            "company_id": company_id,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "user_role": user_role,
            "token_hash": token_hash,
            "status": SessionStatus.ACTIVE.value,
            "ip_address": ip_address,
            "location": location.model_dump(),
            "device": device.model_dump(),
            "created_at": datetime.now(timezone.utc),
            "last_activity": datetime.now(timezone.utc),
            "expires_at": expires_at,
            "request_count": 0,
            "is_remembered": is_remembered,
            "is_api_session": is_api_session
        }
        
        await self.sessions.insert_one(session)
        
        # Log login
        await self._log_login(
            user_id=user_id,
            company_id=company_id,
            success=True,
            ip_address=ip_address,
            device=device
        )
        
        return session_id
    
    async def get_session(self, session_id: str) -> Optional[SessionResponse]:
        """Get session by ID"""
        session = await self.sessions.find_one({"id": session_id})
        
        if session:
            response = SessionResponse(**session)
            response.status_display = session["status"].replace("_", " ").title()
            return response
        return None
    
    async def list_user_sessions(
        self,
        user_id: str,
        company_id: Optional[str] = None,
        include_expired: bool = False
    ) -> SessionListResponse:
        """List sessions for a user"""
        query = {"user_id": user_id}
        if company_id:
            query["company_id"] = company_id
        if not include_expired:
            query["status"] = SessionStatus.ACTIVE.value
        
        cursor = self.sessions.find(query).sort("last_activity", -1)
        
        items = []
        active_count = 0
        
        async for session in cursor:
            response = SessionResponse(**session)
            response.status_display = session["status"].replace("_", " ").title()
            items.append(response)
            if session["status"] == SessionStatus.ACTIVE.value:
                active_count += 1
        
        return SessionListResponse(
            items=items,
            total=len(items),
            active_count=active_count
        )
    
    async def update_session_activity(self, session_id: str) -> bool:
        """Update session last activity"""
        result = await self.sessions.update_one(
            {"id": session_id, "status": SessionStatus.ACTIVE.value},
            {
                "$set": {"last_activity": datetime.now(timezone.utc)},
                "$inc": {"request_count": 1}
            }
        )
        return result.modified_count > 0
    
    async def revoke_session(
        self,
        session_id: str,
        user_id: str,
        reason: Optional[str] = None
    ) -> bool:
        """Revoke a session"""
        result = await self.sessions.update_one(
            {"id": session_id},
            {
                "$set": {
                    "status": SessionStatus.REVOKED.value,
                    "ended_at": datetime.now(timezone.utc)
                }
            }
        )
        return result.modified_count > 0
    
    async def revoke_all_sessions(
        self,
        user_id: str,
        except_session_id: Optional[str] = None,
        reason: Optional[str] = None
    ) -> int:
        """Revoke all sessions for a user"""
        query = {
            "user_id": user_id,
            "status": SessionStatus.ACTIVE.value
        }
        if except_session_id:
            query["id"] = {"$ne": except_session_id}
        
        result = await self.sessions.update_many(
            query,
            {
                "$set": {
                    "status": SessionStatus.REVOKED.value,
                    "ended_at": datetime.now(timezone.utc)
                }
            }
        )
        return result.modified_count
    
    async def cleanup_expired_sessions(self) -> int:
        """Cleanup expired sessions"""
        result = await self.sessions.update_many(
            {
                "status": SessionStatus.ACTIVE.value,
                "expires_at": {"$lt": datetime.now(timezone.utc)}
            },
            {
                "$set": {
                    "status": SessionStatus.EXPIRED.value,
                    "ended_at": datetime.now(timezone.utc)
                }
            }
        )
        return result.modified_count
    
    # ============== Login History ==============
    
    async def _log_login(
        self,
        user_id: str,
        company_id: Optional[str],
        success: bool,
        ip_address: str,
        device: DeviceInfo,
        failure_reason: Optional[str] = None
    ):
        """Log login attempt"""
        login_log = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "user_id": user_id,
            "success": success,
            "failure_reason": failure_reason,
            "ip_address": ip_address,
            "location": GeoLocation(ip_address=ip_address).model_dump(),
            "device": device.model_dump(),
            "timestamp": datetime.now(timezone.utc)
        }
        
        await self.login_history.insert_one(login_log)
        
        # Check for security alerts on failed login
        if not success:
            await self._check_failed_login_alerts(user_id, ip_address)
    
    async def log_failed_login(
        self,
        user_id: str,
        company_id: Optional[str],
        ip_address: str,
        device: DeviceInfo,
        failure_reason: str
    ):
        """Log failed login attempt (public method)"""
        await self._log_login(
            user_id=user_id,
            company_id=company_id,
            success=False,
            ip_address=ip_address,
            device=device,
            failure_reason=failure_reason
        )
    
    async def get_login_history(
        self,
        user_id: str,
        limit: int = 50
    ) -> List[Dict[str, Any]]:
        """Get login history for a user"""
        cursor = self.login_history.find(
            {"user_id": user_id}
        ).sort("timestamp", -1).limit(limit)
        
        history = []
        async for log in cursor:
            log["_id"] = str(log["_id"]) if "_id" in log else log.get("id")
            history.append(log)
        
        return history
    
    # ============== Security Alerts ==============
    
    async def _check_security_alerts(self, audit_log: Dict[str, Any]):
        """Check if audit event should trigger security alert"""
        action = AuditAction(audit_log["action"])
        
        # Bulk data export
        if action == AuditAction.EXPORT:
            await self._create_alert(
                company_id=audit_log.get("company_id"),
                alert_type=AlertType.BULK_DATA_EXPORT,
                severity=AuditSeverity.MEDIUM,
                title="Bulk Data Export",
                description=f"User {audit_log['user_name']} exported data",
                user_id=audit_log["user_id"],
                user_name=audit_log["user_name"],
                user_email=audit_log["user_email"],
                ip_address=audit_log.get("ip_address"),
                related_audit_ids=[audit_log["id"]]
            )
        
        # Permission change
        if action == AuditAction.PERMISSION_CHANGE:
            await self._create_alert(
                company_id=audit_log.get("company_id"),
                alert_type=AlertType.PERMISSION_ESCALATION,
                severity=AuditSeverity.HIGH,
                title="Permission Change",
                description=f"Permissions changed by {audit_log['user_name']}",
                user_id=audit_log["user_id"],
                user_name=audit_log["user_name"],
                user_email=audit_log["user_email"],
                ip_address=audit_log.get("ip_address"),
                related_audit_ids=[audit_log["id"]]
            )
    
    async def _check_failed_login_alerts(self, user_id: str, ip_address: str):
        """Check for multiple failed login attempts"""
        recent_failures = await self.login_history.count_documents({
            "user_id": user_id,
            "success": False,
            "timestamp": {"$gte": datetime.now(timezone.utc) - timedelta(minutes=15)}
        })
        
        if recent_failures >= 5:
            user = await self.db.users.find_one({"id": user_id})
            
            await self._create_alert(
                company_id=user.get("company_id") if user else None,
                alert_type=AlertType.MULTIPLE_LOGIN_FAILURES,
                severity=AuditSeverity.HIGH,
                title="Multiple Failed Login Attempts",
                description=f"{recent_failures} failed login attempts in 15 minutes",
                user_id=user_id,
                user_name=user.get("full_name") if user else None,
                user_email=user.get("email") if user else None,
                ip_address=ip_address
            )
    
    async def _create_alert(
        self,
        company_id: Optional[str],
        alert_type: AlertType,
        severity: AuditSeverity,
        title: str,
        description: str,
        user_id: Optional[str] = None,
        user_name: Optional[str] = None,
        user_email: Optional[str] = None,
        ip_address: Optional[str] = None,
        related_audit_ids: List[str] = None,
        metadata: Dict[str, Any] = None
    ):
        """Create a security alert"""
        alert = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "alert_type": alert_type.value,
            "severity": severity.value,
            "title": title,
            "description": description,
            "user_id": user_id,
            "user_name": user_name,
            "user_email": user_email,
            "ip_address": ip_address,
            "location": GeoLocation(ip_address=ip_address).model_dump() if ip_address else None,
            "related_audit_ids": related_audit_ids or [],
            "metadata": metadata or {},
            "is_resolved": False,
            "created_at": datetime.now(timezone.utc)
        }
        
        await self.security_alerts.insert_one(alert)
    
    async def list_security_alerts(
        self,
        company_id: str,
        unresolved_only: bool = False,
        severity: Optional[AuditSeverity] = None,
        page: int = 1,
        page_size: int = 20
    ) -> SecurityAlertListResponse:
        """List security alerts"""
        query = {"company_id": company_id}
        
        if unresolved_only:
            query["is_resolved"] = False
        if severity:
            query["severity"] = severity.value
        
        total = await self.security_alerts.count_documents(query)
        unresolved_count = await self.security_alerts.count_documents({
            "company_id": company_id,
            "is_resolved": False
        })
        
        skip = (page - 1) * page_size
        cursor = self.security_alerts.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for alert in cursor:
            response = SecurityAlertResponse(**alert)
            response.type_display = alert["alert_type"].replace("_", " ").title()
            response.severity_display = AUDIT_SEVERITY_DISPLAY.get(
                AuditSeverity(alert["severity"]), alert["severity"]
            )
            items.append(response)
        
        return SecurityAlertListResponse(
            items=items,
            total=total,
            unresolved_count=unresolved_count
        )
    
    async def resolve_alert(
        self,
        alert_id: str,
        company_id: str,
        user_id: str,
        resolution_notes: Optional[str] = None
    ) -> bool:
        """Resolve a security alert"""
        result = await self.security_alerts.update_one(
            {"id": alert_id, "company_id": company_id},
            {
                "$set": {
                    "is_resolved": True,
                    "resolved_at": datetime.now(timezone.utc),
                    "resolved_by": user_id,
                    "resolution_notes": resolution_notes
                }
            }
        )
        return result.modified_count > 0
    
    # ============== User Activity ==============
    
    async def get_user_activity(
        self,
        user_id: str,
        company_id: str
    ) -> UserActivityResponse:
        """Get activity summary for a user"""
        # Get user info
        user = await self.db.users.find_one({"id": user_id})
        
        # Current session
        current_session = await self.sessions.find_one({
            "user_id": user_id,
            "status": SessionStatus.ACTIVE.value
        }, sort=[("last_activity", -1)])
        
        # Session counts
        total_sessions = await self.sessions.count_documents({"user_id": user_id})
        
        # Activity counts
        activity_pipeline = [
            {"$match": {"user_id": user_id, "company_id": company_id}},
            {"$group": {"_id": "$action", "count": {"$sum": 1}}}
        ]
        
        actions_by_type = {}
        total_actions = 0
        async for doc in self.audit_logs.aggregate(activity_pipeline):
            actions_by_type[doc["_id"]] = doc["count"]
            total_actions += doc["count"]
        
        # Last activity
        last_log = await self.audit_logs.find_one(
            {"user_id": user_id, "company_id": company_id},
            sort=[("timestamp", -1)]
        )
        
        # Login stats
        total_logins = await self.login_history.count_documents({
            "user_id": user_id,
            "success": True
        })
        failed_logins = await self.login_history.count_documents({
            "user_id": user_id,
            "success": False
        })
        
        last_login_doc = await self.login_history.find_one(
            {"user_id": user_id, "success": True},
            sort=[("timestamp", -1)]
        )
        
        # Security alerts
        security_alerts_count = await self.security_alerts.count_documents({"user_id": user_id})
        unresolved_alerts = await self.security_alerts.count_documents({
            "user_id": user_id,
            "is_resolved": False
        })
        
        return UserActivityResponse(
            user_id=user_id,
            user_name=user.get("full_name", "Unknown") if user else "Unknown",
            user_email=user.get("email", "") if user else "",
            current_session=SessionResponse(**current_session) if current_session else None,
            total_sessions=total_sessions,
            total_actions=total_actions,
            actions_by_type=actions_by_type,
            last_activity=last_log["timestamp"] if last_log else None,
            total_logins=total_logins,
            failed_logins=failed_logins,
            last_login=last_login_doc["timestamp"] if last_login_doc else None,
            security_alerts=security_alerts_count,
            unresolved_alerts=unresolved_alerts
        )
    
    # ============== Helper Methods ==============
    
    def _get_action_severity(self, action: AuditAction) -> AuditSeverity:
        """Get default severity for an action"""
        high_severity = [
            AuditAction.DELETE,
            AuditAction.BULK_DELETE,
            AuditAction.PERMISSION_CHANGE,
            AuditAction.ROLE_CHANGE,
            AuditAction.PASSWORD_RESET
        ]
        
        medium_severity = [
            AuditAction.UPDATE,
            AuditAction.BULK_UPDATE,
            AuditAction.EXPORT,
            AuditAction.IMPORT,
            AuditAction.SETTINGS_CHANGE,
            AuditAction.PASSWORD_CHANGE
        ]
        
        if action in high_severity:
            return AuditSeverity.HIGH
        elif action in medium_severity:
            return AuditSeverity.MEDIUM
        else:
            return AuditSeverity.LOW
    
    def _get_time_ago(self, timestamp: datetime) -> str:
        """Get human-readable time ago string"""
        now = datetime.now(timezone.utc)
        diff = now - timestamp
        
        if diff.days > 365:
            years = diff.days // 365
            return f"{years}y ago"
        elif diff.days > 30:
            months = diff.days // 30
            return f"{months}mo ago"
        elif diff.days > 0:
            return f"{diff.days}d ago"
        elif diff.seconds > 3600:
            hours = diff.seconds // 3600
            return f"{hours}h ago"
        elif diff.seconds > 60:
            minutes = diff.seconds // 60
            return f"{minutes}m ago"
        else:
            return "Just now"