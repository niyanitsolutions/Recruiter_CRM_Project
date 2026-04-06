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

from app.models.company.task import TaskCreate, TaskUpdate, TaskResponse, TaskStatus

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
        created_by: str
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
        updated_by: str
    ) -> TaskResponse:
        """
        Update task fields.
        Access: creator (created_by) or assignee (assigned_to) only.
        """
        doc = await TaskService._get_task_doc(db, task_id)

        if not TaskService._is_involved(doc, updated_by):
            logger.warning(
                "Unauthorized task update | task=%s | user=%s | creator=%s | assignee=%s",
                task_id, updated_by, doc.get("created_by"), doc.get("assigned_to")
            )
            raise HTTPException(
                status_code=403,
                detail="Access denied: only the task creator or assignee can update this task"
            )

        coll = db[TaskService.COLLECTION]
        updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}

        if "priority" in updates:
            updates["priority"] = updates["priority"].value if hasattr(updates["priority"], "value") else updates["priority"]
        if "status" in updates:
            updates["status"] = updates["status"].value if hasattr(updates["status"], "value") else updates["status"]
            if updates["status"] == TaskStatus.COMPLETED.value:
                updates["completed_at"] = datetime.now(timezone.utc)

        if "assigned_to" in updates and updates["assigned_to"]:
            assignee = await db["users"].find_one({"_id": updates["assigned_to"]})
            updates["assigned_to_name"] = assignee.get("full_name") if assignee else None

        updates["updated_at"] = datetime.now(timezone.utc)
        await coll.update_one({"_id": task_id}, {"$set": updates})

        # Re-fetch and return updated doc (internal fetch, no permission re-check needed)
        updated_doc = await TaskService._get_task_doc(db, task_id)
        return TaskService._to_response(updated_doc)

    @staticmethod
    async def delete_task(
        db: AsyncIOMotorDatabase,
        task_id: str,
        requesting_user_id: str
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
        return True

    # ── Response builder ──────────────────────────────────────────────────────

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
        )
