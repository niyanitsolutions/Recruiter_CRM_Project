"""
Task Service - Phase 6
CRUD for internal CRM tasks
"""
from datetime import datetime, date, timezone
from typing import Optional, List
from bson import ObjectId
from fastapi import HTTPException
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.task import TaskCreate, TaskUpdate, TaskResponse, TaskStatus


class TaskService:
    COLLECTION = "tasks"

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
        doc = {
            "_id": str(ObjectId()),
            "title": data.title,
            "description": data.description,
            "priority": data.priority.value,
            "status": TaskStatus.PENDING.value,
            "due_date": data.due_date,
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
        return TaskService._to_response(doc)

    @staticmethod
    async def list_tasks(
        db: AsyncIOMotorDatabase,
        user_id: Optional[str] = None,
        status: Optional[str] = None,
        priority: Optional[str] = None,
        page: int = 1,
        page_size: int = 20
    ) -> dict:
        query = {"is_deleted": False}
        if user_id:
            query["$or"] = [{"assigned_to": user_id}, {"created_by": user_id}]
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
    async def get_task(db: AsyncIOMotorDatabase, task_id: str) -> TaskResponse:
        doc = await db[TaskService.COLLECTION].find_one({"_id": task_id, "is_deleted": False})
        if not doc:
            raise HTTPException(status_code=404, detail="Task not found")
        return TaskService._to_response(doc)

    @staticmethod
    async def update_task(
        db: AsyncIOMotorDatabase,
        task_id: str,
        data: TaskUpdate,
        updated_by: str
    ) -> TaskResponse:
        coll = db[TaskService.COLLECTION]
        existing = await coll.find_one({"_id": task_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Task not found")

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
        return await TaskService.get_task(db, task_id)

    @staticmethod
    async def delete_task(db: AsyncIOMotorDatabase, task_id: str) -> bool:
        result = await db[TaskService.COLLECTION].update_one(
            {"_id": task_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Task not found")
        return True

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
