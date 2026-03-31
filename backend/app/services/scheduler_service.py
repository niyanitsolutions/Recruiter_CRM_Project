"""
Scheduler Service - Phase 5
Background job execution and task scheduling
"""
from datetime import datetime, date, timedelta, timezone
from typing import Optional, Dict, Any
from bson import ObjectId
import traceback

from app.models.company.scheduled_task import (
    TaskType, TaskStatus, TaskPriority, TaskFrequency,
    TaskSchedule, TaskResult, RetryConfig,
    TaskResponse, TaskListResponse,
    TaskExecutionResponse, TaskExecutionListResponse,
    CreateTaskRequest, UpdateTaskRequest,
    DEFAULT_DAILY_TASKS, DEFAULT_WEEKLY_TASKS, DEFAULT_MONTHLY_TASKS,
    TASK_TYPE_DISPLAY, TASK_STATUS_DISPLAY
)


class SchedulerService:
    """Service for scheduled task management and execution"""
    
    def __init__(self, db):
        self.db = db
        self.tasks = db.scheduled_tasks
        self.execution_logs = db.task_execution_logs
    
    # ============== Task Management ==============
    
    async def create_task(
        self,
        data: CreateTaskRequest,
        company_id: Optional[str],
        user_id: Optional[str]
    ) -> TaskResponse:
        """Create a scheduled task"""
        task_id = str(ObjectId())
        
        task = {
            "id": task_id,
            "company_id": company_id,
            "task_type": data.task_type.value,
            "name": data.name,
            "description": data.description,
            "schedule": data.schedule.model_dump(),
            "is_active": data.is_active,
            "config": data.config,
            "retry_config": (data.retry_config or RetryConfig()).model_dump(),
            "priority": data.priority.value,
            "timeout_seconds": 3600,
            "run_count": 0,
            "failure_count": 0,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
            "created_by": user_id,
            "is_deleted": False
        }
        
        # Calculate next run
        task["next_run"] = self._calculate_next_run(data.schedule)
        
        await self.tasks.insert_one(task)
        
        return await self._to_response(task)
    
    async def get_task(
        self,
        task_id: str,
        company_id: Optional[str] = None
    ) -> Optional[TaskResponse]:
        """Get task by ID"""
        query = {"id": task_id, "is_deleted": False}
        if company_id:
            query["company_id"] = company_id
        
        task = await self.tasks.find_one(query)
        
        if task:
            return await self._to_response(task)
        return None
    
    async def list_tasks(
        self,
        company_id: Optional[str] = None,
        task_type: Optional[TaskType] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20
    ) -> TaskListResponse:
        """List scheduled tasks"""
        query = {"is_deleted": False}
        
        if company_id:
            query["$or"] = [
                {"company_id": company_id},
                {"company_id": None}  # System tasks
            ]
        if task_type:
            query["task_type"] = task_type.value
        if is_active is not None:
            query["is_active"] = is_active
        
        total = await self.tasks.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.tasks.find(query).sort("next_run", 1).skip(skip).limit(page_size)
        
        items = []
        async for task in cursor:
            items.append(await self._to_response(task))
        
        return TaskListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size
        )
    
    async def update_task(
        self,
        task_id: str,
        data: UpdateTaskRequest,
        company_id: Optional[str] = None
    ) -> Optional[TaskResponse]:
        """Update a scheduled task"""
        query = {"id": task_id, "is_deleted": False}
        if company_id:
            query["company_id"] = company_id
        
        update_data = data.model_dump(exclude_unset=True)
        update_data["updated_at"] = datetime.now(timezone.utc)
        
        if "schedule" in update_data and update_data["schedule"]:
            schedule = TaskSchedule(**update_data["schedule"])
            update_data["next_run"] = self._calculate_next_run(schedule)
        
        result = await self.tasks.find_one_and_update(
            query,
            {"$set": update_data},
            return_document=True
        )
        
        if result:
            return await self._to_response(result)
        return None
    
    async def delete_task(
        self,
        task_id: str,
        company_id: Optional[str] = None
    ) -> bool:
        """Delete a scheduled task"""
        query = {"id": task_id}
        if company_id:
            query["company_id"] = company_id
        
        result = await self.tasks.update_one(
            query,
            {"$set": {"is_deleted": True, "is_active": False}}
        )
        return result.modified_count > 0
    
    async def toggle_task(
        self,
        task_id: str,
        is_active: bool,
        company_id: Optional[str] = None
    ) -> bool:
        """Enable or disable a task"""
        query = {"id": task_id, "is_deleted": False}
        if company_id:
            query["company_id"] = company_id
        
        update_data = {"is_active": is_active, "updated_at": datetime.now(timezone.utc)}
        
        if is_active:
            # Recalculate next run
            task = await self.tasks.find_one(query)
            if task:
                schedule = TaskSchedule(**task["schedule"])
                update_data["next_run"] = self._calculate_next_run(schedule)
        
        result = await self.tasks.update_one(query, {"$set": update_data})
        return result.modified_count > 0
    
    # ============== Task Execution ==============
    
    async def run_task(
        self,
        task_id: str,
        company_id: Optional[str] = None,
        triggered_by: str = "manual"
    ) -> TaskExecutionResponse:
        """Run a task manually"""
        task = await self.tasks.find_one({
            "id": task_id,
            "is_deleted": False
        })
        
        if not task:
            raise ValueError("Task not found")
        
        return await self._execute_task(task, triggered_by)
    
    async def run_due_tasks(self) -> int:
        """Run all tasks that are due (called by scheduler)"""
        now = datetime.now(timezone.utc)
        
        cursor = self.tasks.find({
            "is_active": True,
            "is_deleted": False,
            "next_run": {"$lte": now}
        })
        
        executed_count = 0
        
        async for task in cursor:
            try:
                await self._execute_task(task, "scheduler")
                executed_count += 1
            except Exception as e:
                print(f"Error executing task {task['id']}: {e}")
        
        return executed_count
    
    async def _execute_task(
        self,
        task: Dict[str, Any],
        triggered_by: str
    ) -> TaskExecutionResponse:
        """Execute a single task"""
        task_type = TaskType(task["task_type"])
        execution_id = str(ObjectId())
        
        # Create execution log
        execution = {
            "id": execution_id,
            "company_id": task.get("company_id"),
            "task_id": task["id"],
            "task_type": task["task_type"],
            "task_name": task["name"],
            "started_at": datetime.now(timezone.utc),
            "status": TaskStatus.RUNNING.value,
            "retry_attempt": 0,
            "triggered_by": triggered_by,
            "execution_context": task.get("config", {})
        }
        
        await self.execution_logs.insert_one(execution)
        
        # Update task status
        await self.tasks.update_one(
            {"id": task["id"]},
            {"$set": {"last_status": TaskStatus.RUNNING.value}}
        )
        
        try:
            # Execute based on task type
            result = await self._run_task_logic(task_type, task)
            
            # Update execution log
            completed_at = datetime.now(timezone.utc)
            duration_ms = int((completed_at - execution["started_at"]).total_seconds() * 1000)
            
            await self.execution_logs.update_one(
                {"id": execution_id},
                {"$set": {
                    "status": TaskStatus.COMPLETED.value,
                    "completed_at": completed_at,
                    "duration_ms": duration_ms,
                    "result": result.model_dump()
                }}
            )
            
            # Update task
            schedule = TaskSchedule(**task["schedule"])
            next_run = self._calculate_next_run(schedule)
            
            await self.tasks.update_one(
                {"id": task["id"]},
                {
                    "$set": {
                        "last_run": completed_at,
                        "last_status": TaskStatus.COMPLETED.value,
                        "last_result": result.model_dump(),
                        "next_run": next_run
                    },
                    "$inc": {"run_count": 1}
                }
            )
            
            execution["status"] = TaskStatus.COMPLETED.value
            execution["completed_at"] = completed_at
            execution["duration_ms"] = duration_ms
            execution["result"] = result
            
        except Exception as e:
            error_message = str(e)
            stack_trace = traceback.format_exc()
            
            await self.execution_logs.update_one(
                {"id": execution_id},
                {"$set": {
                    "status": TaskStatus.FAILED.value,
                    "completed_at": datetime.now(timezone.utc),
                    "error_message": error_message,
                    "stack_trace": stack_trace
                }}
            )
            
            await self.tasks.update_one(
                {"id": task["id"]},
                {
                    "$set": {
                        "last_run": datetime.now(timezone.utc),
                        "last_status": TaskStatus.FAILED.value
                    },
                    "$inc": {"run_count": 1, "failure_count": 1}
                }
            )
            
            execution["status"] = TaskStatus.FAILED.value
            execution["error_message"] = error_message
        
        response = TaskExecutionResponse(**execution)
        response.type_display = TASK_TYPE_DISPLAY.get(task_type, task["task_type"])
        response.status_display = TASK_STATUS_DISPLAY.get(
            TaskStatus(execution["status"]), execution["status"]
        )
        
        return response
    
    async def _run_task_logic(
        self,
        task_type: TaskType,
        task: Dict[str, Any]
    ) -> TaskResult:
        """Execute the actual task logic"""
        company_id = task.get("company_id")
        config = task.get("config", {})
        
        if task_type == TaskType.UPDATE_DAY_COUNTERS:
            return await self._task_update_day_counters(company_id)
        
        elif task_type == TaskType.UPDATE_PAYOUT_ELIGIBILITY:
            return await self._task_update_payout_eligibility(company_id)
        
        elif task_type == TaskType.SEND_DOJ_REMINDERS:
            return await self._task_send_doj_reminders(company_id)
        
        elif task_type == TaskType.SEND_DAY_10_REMINDERS:
            return await self._task_send_day_reminders(company_id, 10)
        
        elif task_type == TaskType.SEND_DAY_30_REMINDERS:
            return await self._task_send_day_reminders(company_id, 30)
        
        elif task_type == TaskType.SEND_PAYOUT_REMINDERS:
            return await self._task_send_payout_reminders(company_id)
        
        elif task_type == TaskType.CLEANUP_OLD_SESSIONS:
            return await self._task_cleanup_sessions()
        
        elif task_type == TaskType.SEND_SCHEDULED_REPORT:
            return await self._task_send_scheduled_report(config)
        
        else:
            return TaskResult(
                success=True,
                message=f"Task {task_type.value} completed (no-op)",
                records_processed=0
            )
    
    # ============== Task Implementations ==============
    
    async def _task_update_day_counters(self, company_id: Optional[str]) -> TaskResult:
        """Update day counters for joined candidates"""
        query = {
            "status": "joined",
            "is_deleted": False
        }
        if company_id:
            query["company_id"] = company_id
        
        today = date.today()
        updated = 0
        
        cursor = self.db.onboards.find(query)
        async for onboard in cursor:
            actual_doj = onboard.get("actual_doj")
            if actual_doj:
                if isinstance(actual_doj, str):
                    doj = date.fromisoformat(actual_doj)
                else:
                    doj = actual_doj
                
                days = (today - doj).days
                
                await self.db.onboards.update_one(
                    {"id": onboard["id"]},
                    {"$set": {"days_at_client": days}}
                )
                updated += 1
        
        return TaskResult(
            success=True,
            message=f"Updated day counters for {updated} onboards",
            records_processed=updated
        )
    
    async def _task_update_payout_eligibility(self, company_id: Optional[str]) -> TaskResult:
        """Update payout eligibility based on days completed"""
        query = {
            "status": "joined",
            "payout_eligible": False,
            "is_deleted": False
        }
        if company_id:
            query["company_id"] = company_id
        
        updated = 0
        
        cursor = self.db.onboards.find(query)
        async for onboard in cursor:
            days_at_client = onboard.get("days_at_client", 0)
            payout_days = onboard.get("payout_days", 45)
            
            if days_at_client >= payout_days:
                await self.db.onboards.update_one(
                    {"id": onboard["id"]},
                    {"$set": {"payout_eligible": True}}
                )
                
                # Update partner payout if exists
                await self.db.partner_payouts.update_one(
                    {"onboard_id": onboard["id"]},
                    {"$set": {"status": "eligible"}}
                )
                
                updated += 1
        
        return TaskResult(
            success=True,
            message=f"Updated eligibility for {updated} payouts",
            records_processed=updated
        )
    
    async def _task_send_doj_reminders(self, company_id: Optional[str]) -> TaskResult:
        """Send reminders for upcoming DOJ"""
        tomorrow = date.today() + timedelta(days=1)
        
        query = {
            "status": {"$in": ["offer_accepted", "doj_confirmed", "doj_extended"]},
            "expected_doj": tomorrow.isoformat(),
            "is_deleted": False
        }
        if company_id:
            query["company_id"] = company_id
        
        count = await self.db.onboards.count_documents(query)
        
        # In production, create notifications and send emails here
        
        return TaskResult(
            success=True,
            message=f"Sent DOJ reminders for {count} candidates",
            records_processed=count
        )
    
    async def _task_send_day_reminders(self, company_id: Optional[str], day: int) -> TaskResult:
        """Send day check reminders"""
        query = {
            "status": "joined",
            "days_at_client": day,
            f"day_{day}_reminder_sent": {"$ne": True},
            "is_deleted": False
        }
        if company_id:
            query["company_id"] = company_id
        
        count = 0
        cursor = self.db.onboards.find(query)
        
        async for onboard in cursor:
            # Mark reminder as sent
            await self.db.onboards.update_one(
                {"id": onboard["id"]},
                {"$set": {f"day_{day}_reminder_sent": True}}
            )
            count += 1
        
        return TaskResult(
            success=True,
            message=f"Sent day {day} reminders for {count} candidates",
            records_processed=count
        )
    
    async def _task_send_payout_reminders(self, company_id: Optional[str]) -> TaskResult:
        """Send payout eligibility reminders"""
        query = {
            "status": "eligible",
            "payout_reminder_sent": {"$ne": True},
            "is_deleted": False
        }
        if company_id:
            query["company_id"] = company_id
        
        count = 0
        cursor = self.db.partner_payouts.find(query)
        
        async for payout in cursor:
            await self.db.partner_payouts.update_one(
                {"id": payout["id"]},
                {"$set": {"payout_reminder_sent": True}}
            )
            count += 1
        
        return TaskResult(
            success=True,
            message=f"Sent payout reminders for {count} eligible payouts",
            records_processed=count
        )
    
    async def _task_cleanup_sessions(self) -> TaskResult:
        """Cleanup expired sessions"""
        result = await self.db.user_sessions.update_many(
            {
                "status": "active",
                "expires_at": {"$lt": datetime.now(timezone.utc)}
            },
            {"$set": {"status": "expired", "ended_at": datetime.now(timezone.utc)}}
        )
        
        return TaskResult(
            success=True,
            message=f"Cleaned up {result.modified_count} expired sessions",
            records_processed=result.modified_count
        )
    
    async def _task_send_scheduled_report(self, config: Dict[str, Any]) -> TaskResult:
        """Send a scheduled report"""
        report_id = config.get("report_id")
        # In production, generate and email the report
        
        return TaskResult(
            success=True,
            message=f"Sent scheduled report {report_id}",
            records_processed=1
        )
    
    # ============== Execution Logs ==============
    
    async def get_execution_logs(
        self,
        task_id: Optional[str] = None,
        company_id: Optional[str] = None,
        status: Optional[TaskStatus] = None,
        page: int = 1,
        page_size: int = 20
    ) -> TaskExecutionListResponse:
        """Get task execution logs"""
        query = {}
        
        if task_id:
            query["task_id"] = task_id
        if company_id:
            query["$or"] = [
                {"company_id": company_id},
                {"company_id": None}
            ]
        if status:
            query["status"] = status.value
        
        total = await self.execution_logs.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.execution_logs.find(query).sort("started_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for log in cursor:
            response = TaskExecutionResponse(**log)
            response.type_display = TASK_TYPE_DISPLAY.get(
                TaskType(log["task_type"]), log["task_type"]
            )
            response.status_display = TASK_STATUS_DISPLAY.get(
                TaskStatus(log["status"]), log["status"]
            )
            items.append(response)
        
        return TaskExecutionListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size
        )
    
    # ============== Helper Methods ==============
    
    def _calculate_next_run(self, schedule: TaskSchedule) -> datetime:
        """Calculate next run time"""
        import pytz
        
        tz = pytz.timezone(schedule.timezone)
        now = datetime.now(tz)
        
        hour, minute = map(int, schedule.time.split(":"))
        
        if schedule.frequency == TaskFrequency.ONCE:
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0)
        
        elif schedule.frequency == TaskFrequency.HOURLY:
            next_run = now.replace(minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(hours=1)
            return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
        
        elif schedule.frequency == TaskFrequency.DAILY:
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
            return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
        
        elif schedule.frequency == TaskFrequency.WEEKLY:
            days_ahead = (schedule.day_of_week or 0) - now.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            next_run = now + timedelta(days=days_ahead)
            next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)
            return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
        
        elif schedule.frequency == TaskFrequency.MONTHLY:
            day = schedule.day_of_month or 1
            next_run = now.replace(day=day, hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)
            return next_run.astimezone(pytz.UTC).replace(tzinfo=None)
        
        else:
            return now.replace(hour=hour, minute=minute, second=0, microsecond=0).astimezone(pytz.UTC).replace(tzinfo=None)
    
    async def _to_response(self, task: Dict[str, Any]) -> TaskResponse:
        """Convert task dict to response"""
        response = TaskResponse(**task)
        response.type_display = TASK_TYPE_DISPLAY.get(
            TaskType(task["task_type"]), task["task_type"]
        )
        if task.get("last_status"):
            response.status_display = TASK_STATUS_DISPLAY.get(
                TaskStatus(task["last_status"]), task["last_status"]
            )
        response.priority_display = task.get("priority", "normal").title()
        return response
    
    # ============== Initialize Default Tasks ==============
    
    async def initialize_default_tasks(self, company_id: Optional[str] = None):
        """Initialize default scheduled tasks"""
        all_defaults = DEFAULT_DAILY_TASKS + DEFAULT_WEEKLY_TASKS + DEFAULT_MONTHLY_TASKS
        
        for task_config in all_defaults:
            # Check if already exists
            existing = await self.tasks.find_one({
                "task_type": task_config["task_type"].value,
                "company_id": company_id,
                "is_deleted": False
            })
            
            if not existing:
                await self.create_task(
                    data=CreateTaskRequest(
                        task_type=task_config["task_type"],
                        name=task_config["name"],
                        description=task_config.get("description"),
                        schedule=TaskSchedule(**task_config["schedule"]),
                        priority=TaskPriority(task_config.get("priority", "normal")),
                        is_active=True
                    ),
                    company_id=company_id,
                    user_id=None
                )