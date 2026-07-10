"""
Task Service - Phase 6
CRUD for internal CRM tasks
"""
import logging
from datetime import datetime, date, timezone
from typing import Optional
from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.task import TaskCreate, TaskUpdate, TaskResponse, TaskStatus, TaskComment

logger = logging.getLogger(__name__)


class TaskService:
    COLLECTION = "tasks"

    # ── Private helper ────────────────────────────────────────────────────────

    @staticmethod
    async def _get_task_doc(db: AsyncIOMotorDatabase, task_id: str) -> dict:
        """Fetch raw task document. Raises 404 if not found or soft-deleted."""
        doc = await db[TaskService.COLLECTION].find_one({"_id": task_id, "is_deleted": False})
        if not doc:
            raise HTTPException(status_code=404, detail="Task not found")
        return doc

    @staticmethod
    def _is_involved(doc: dict, user_id: str) -> bool:
        """Return True if user is creator or assignee of the task."""
        return doc.get("created_by") == user_id or doc.get("assigned_to") == user_id

    # ── Public API ────────────────────────────────────────────────────────────

    @staticmethod
    async def create_task(
        db: AsyncIOMotorDatabase,
        data: TaskCreate,
        created_by: str,
        *,
        company_id: str = "",
        company_name: str = "",
        creator_name: str = "",
    ) -> TaskResponse:
        users = db["users"]
        creator = await users.find_one({"_id": created_by})
        assignee = await users.find_one({"_id": data.assigned_to}) if data.assigned_to else None

        now = datetime.now(timezone.utc)
        due_date = None
        if data.due_date:
            due_date = datetime(data.due_date.year, data.due_date.month, data.due_date.day, tzinfo=timezone.utc)

        doc = {
            "_id": str(ObjectId()),
            "title": data.title,
            "description": data.description,
            "priority": data.priority.value,
            "status": TaskStatus.PENDING.value,
            "due_date": due_date,
            "assigned_to": data.assigned_to,
            "assigned_to_name": assignee.get("full_name") if assignee else None,
            "created_by": created_by,
            "created_by_name": creator.get("full_name") if creator else None,
            "related_entity_type": data.related_entity_type,
            "related_entity_id": data.related_entity_id,
            "created_at": now,
            "updated_at": now,
            "completed_at": None,
            "is_deleted": False,
        }
        await db[TaskService.COLLECTION].insert_one(doc)
        logger.info("Task created | task=%s | by=%s", doc["_id"], created_by)

        if company_id:
            try:
                from app.core.crm_events import emit_company_event
                import asyncio
                asyncio.ensure_future(emit_company_event(
                    company_id, "task.created",
                    {"id": doc["_id"], "title": doc["title"], "assigned_to": doc.get("assigned_to"), "created_by": created_by},
                ))
            except Exception:
                pass

        # Resolve creator name: prefer explicit param > DB doc > fallback string
        _by_name = (creator_name
                    or (creator.get("full_name") if creator else None)
                    or "a team member")
        due_str = data.due_date.strftime("%d %b %Y") if data.due_date else None
        _assignee_id = data.assigned_to

        # In-app CRM notification — always fires for a distinct assignee (not gated by the email checkbox)
        if _assignee_id and _assignee_id != created_by and company_id:
            try:
                from app.services.notification_service import NotificationService
                await NotificationService(db).notify_task_assigned(
                    company_id=company_id,
                    user_id=_assignee_id,
                    task_id=doc["_id"],
                    task_title=data.title,
                    assigned_by_name=_by_name,
                    priority=data.priority.value,
                    due_date_str=due_str,
                )
            except Exception as _e:
                logger.warning("Task assigned notification failed for %s: %s", _assignee_id, _e)

        # Send TASK_ASSIGNED email — only when the "Send Email Notification" checkbox was checked
        # Skip only when no assignee or assignee is the same person who created the task
        _assignee_email = assignee.get("email") if assignee else None
        if data.send_email and _assignee_email and _assignee_id and _assignee_id != created_by:
            try:
                from app.services.email_service import send_task_assigned_email, _fire_email
                _fire_email(send_task_assigned_email(
                    to_email=_assignee_email,
                    assignee_name=assignee.get("full_name", ""),
                    task_title=data.title,
                    task_description=data.description or "",
                    due_date=due_str,
                    priority=data.priority.value,
                    assigned_by_name=_by_name,
                    company_name=company_name,
                    company_id=company_id,
                ))
            except Exception as _e:
                logger.warning("Task email scheduling failed for %s: %s", _assignee_email, _e)

        return TaskService._to_response(doc)

    @staticmethod
    async def list_tasks(
        db: AsyncIOMotorDatabase,
        user_id: str,                   # always required — no global access
        status: Optional[str] = None,
        priority: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> dict:
        """Return tasks where the user is creator or assignee."""
        query = {
            "is_deleted": False,
            "$or": [{"assigned_to": user_id}, {"created_by": user_id}],
        }
        if status:
            query["status"] = status
        if priority:
            query["priority"] = priority

        coll = db[TaskService.COLLECTION]
        total = await coll.count_documents(query)
        skip = (page - 1) * page_size
        docs = await coll.find(query).sort("created_at", -1).skip(skip).limit(page_size).to_list(length=page_size)
        return {
            "tasks": [TaskService._to_response(d) for d in docs],
            "total": total,
            "page": page,
            "page_size": page_size,
        }

    @staticmethod
    async def get_task(
        db: AsyncIOMotorDatabase,
        task_id: str,
        requesting_user_id: str
    ) -> TaskResponse:
        """
        Return task detail.
        Access: creator (created_by) or assignee (assigned_to) only.
        """
        doc = await TaskService._get_task_doc(db, task_id)

        if not TaskService._is_involved(doc, requesting_user_id):
            logger.warning(
                "Unauthorized task view | task=%s | user=%s | creator=%s | assignee=%s",
                task_id, requesting_user_id, doc.get("created_by"), doc.get("assigned_to")
            )
            raise HTTPException(status_code=403, detail="Access denied: you are not involved in this task")

        return TaskService._to_response(doc)

    @staticmethod
    async def update_task(
        db: AsyncIOMotorDatabase,
        task_id: str,
        data: TaskUpdate,
        updated_by: str,
        *,
        is_admin: bool = False,
        company_id: str = "",
    ) -> TaskResponse:
        """
        Update task fields.
        Access: creator/assignee, or admin/owner users (is_admin=True).
        """
        doc = await TaskService._get_task_doc(db, task_id)

        if not is_admin and not TaskService._is_involved(doc, updated_by):
            logger.warning(
                "Unauthorized task update | task=%s | user=%s | creator=%s | assignee=%s",
                task_id, updated_by, doc.get("created_by"), doc.get("assigned_to")
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: only the task creator or assignee can update this task"
            )

        old_status = doc.get("status")

        coll = db[TaskService.COLLECTION]
        updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}

        if "priority" in updates:
            updates["priority"] = updates["priority"].value if hasattr(updates["priority"], "value") else updates["priority"]
        if "status" in updates:
            updates["status"] = updates["status"].value if hasattr(updates["status"], "value") else updates["status"]
            if updates["status"] == TaskStatus.COMPLETED.value:
                updates["completed_at"] = datetime.now(timezone.utc)

        # BSON fix: Motor/PyMongo cannot serialize datetime.date — convert to datetime
        if "due_date" in updates:
            d = updates["due_date"]
            if d is None:
                pass  # leave as None; $set to None clears the field
            elif isinstance(d, date) and not isinstance(d, datetime):
                updates["due_date"] = datetime(d.year, d.month, d.day, tzinfo=timezone.utc)

        if "assigned_to" in updates and updates["assigned_to"]:
            assignee = await db["users"].find_one({"_id": updates["assigned_to"]})
            updates["assigned_to_name"] = assignee.get("full_name") if assignee else None

        updates["updated_at"] = datetime.now(timezone.utc)
        await coll.update_one({"_id": task_id}, {"$set": updates})

        # Re-fetch and return updated doc (internal fetch, no permission re-check needed)
        updated_doc = await TaskService._get_task_doc(db, task_id)

        if company_id:
            try:
                from app.core.crm_events import emit_company_event
                import asyncio
                asyncio.ensure_future(emit_company_event(
                    company_id, "task.updated",
                    {"id": task_id, "status": updated_doc.get("status"), "assigned_to": updated_doc.get("assigned_to")},
                ))
            except Exception:
                pass

        # Notify the creator of a genuine status transition (started/completed/cancelled).
        # Guarded against no-op resaves (status unchanged) and self-notification
        # (creator changing their own task's status) to avoid duplicate/pointless notifications.
        new_status = updated_doc.get("status")
        creator_id = updated_doc.get("created_by")
        if (
            company_id
            and "status" in updates
            and new_status != old_status
            and creator_id
            and creator_id != updated_by
        ):
            try:
                from app.services.notification_service import NotificationService
                actor = await db["users"].find_one({"_id": updated_by})
                actor_name = (actor.get("full_name") if actor else None) or "Someone"
                await NotificationService(db).notify_task_status_changed(
                    company_id=company_id,
                    creator_id=creator_id,
                    task_id=task_id,
                    task_title=updated_doc.get("title", ""),
                    actor_name=actor_name,
                    new_status=new_status,
                )
            except Exception as _e:
                logger.warning("Task status-change notification failed for task=%s: %s", task_id, _e)

        return TaskService._to_response(updated_doc)

    @staticmethod
    async def delete_task(
        db: AsyncIOMotorDatabase,
        task_id: str,
        requesting_user_id: str,
        *,
        company_id: str = "",
    ) -> bool:
        """
        Soft-delete a task.
        Access: creator (created_by) ONLY. Assignee cannot delete.
        """
        doc = await TaskService._get_task_doc(db, task_id)

        if doc.get("created_by") != requesting_user_id:
            logger.warning(
                "Unauthorized task delete attempt | task=%s | user=%s | creator=%s | assignee=%s",
                task_id, requesting_user_id, doc.get("created_by"), doc.get("assigned_to")
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: only the task creator can delete this task"
            )

        result = await db[TaskService.COLLECTION].update_one(
            {"_id": task_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")

        logger.info("Task deleted | task=%s | by=%s", task_id, requesting_user_id)

        if company_id:
            try:
                from app.core.crm_events import emit_company_event
                import asyncio
                asyncio.ensure_future(emit_company_event(
                    company_id, "task.deleted", {"id": task_id},
                ))
            except Exception:
                pass

        return True

    # ── Response builder ──────────────────────────────────────────────────────

    @staticmethod
    async def add_comment(
        db: AsyncIOMotorDatabase,
        task_id: str,
        text: str,
        author_id: str,
        author_name: str,
    ) -> TaskResponse:
        """Append a comment to a task. Access: creator or assignee."""
        doc = await TaskService._get_task_doc(db, task_id)
        if not TaskService._is_involved(doc, author_id):
            raise HTTPException(status_code=403, detail="Access denied: not involved in this task")

        comment = {
            "id": str(ObjectId()),
            "text": text.strip(),
            "author_id": author_id,
            "author_name": author_name,
            "created_at": datetime.now(timezone.utc),
        }
        await db[TaskService.COLLECTION].update_one(
            {"_id": task_id},
            {
                "$push": {"comments": comment},
                "$set":  {"updated_at": datetime.now(timezone.utc)},
            }
        )
        updated = await TaskService._get_task_doc(db, task_id)
        return TaskService._to_response(updated)

    @staticmethod
    def _to_response(doc: dict) -> TaskResponse:
        due = doc.get("due_date")
        if isinstance(due, datetime):
            due = due.date()
        is_overdue = (
            due is not None
            and due < date.today()
            and doc.get("status") not in (TaskStatus.COMPLETED.value, TaskStatus.CANCELLED.value)
        )
        raw_comments = doc.get("comments") or []
        comments = []
        for c in raw_comments:
            try:
                comments.append(TaskComment(
                    id=c["id"],
                    text=c["text"],
                    author_id=c["author_id"],
                    author_name=c["author_name"],
                    created_at=c["created_at"],
                ))
            except Exception:
                pass

        return TaskResponse(
            id=doc["_id"],
            title=doc["title"],
            description=doc.get("description"),
            priority=doc.get("priority", "medium"),
            status=doc.get("status", "pending"),
            due_date=due,
            assigned_to=doc.get("assigned_to"),
            assigned_to_name=doc.get("assigned_to_name"),
            created_by=doc["created_by"],
            created_by_name=doc.get("created_by_name"),
            related_entity_type=doc.get("related_entity_type"),
            related_entity_id=doc.get("related_entity_id"),
            created_at=doc["created_at"],
            updated_at=doc["updated_at"],
            completed_at=doc.get("completed_at"),
            is_overdue=is_overdue,
            comments=comments,
        )
