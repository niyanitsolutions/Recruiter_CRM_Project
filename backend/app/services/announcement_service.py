"""HRM — Announcement Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId


class AnnouncementService:
    COL = "hrm_announcements"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    async def create(self, company_id: str, data: dict, created_by: str, created_by_name: str) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "title": data["title"],
            "body": data["body"],
            "announcement_type": data.get("announcement_type", "general"),
            "priority": data.get("priority", "normal"),
            "target_department_ids": data.get("target_department_ids") or [],
            "target_employee_ids": data.get("target_employee_ids") or [],
            "requires_acknowledgement": data.get("requires_acknowledgement", False),
            "send_email": data.get("send_email", False),
            "email_sent_at": None,
            "read_by": [],
            "is_auto": False,
            "linked_employee_id": None,
            "publish_at": data.get("publish_at"),
            "expires_at": data.get("expires_at"),
            "attachment_url": data.get("attachment_url"),
            "is_active": True,
            "created_by": created_by,
            "created_by_name": created_by_name,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(doc)
        return self._serialize(doc)

    async def list(self, company_id: str, active_only: bool, page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if active_only:
            query["is_active"] = True
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, ann_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": ann_id, "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def update(self, ann_id: str, company_id: str, data: dict) -> Optional[dict]:
        data = {k: v for k, v in data.items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": ann_id, "company_id": company_id}, {"$set": data})
        return await self.get(ann_id, company_id)

    async def delete(self, ann_id: str, company_id: str) -> bool:
        result = await self.col.delete_one({"_id": ann_id, "company_id": company_id})
        return result.deleted_count > 0

    async def mark_read(self, ann_id: str, company_id: str, employee_id: str, employee_name: str) -> Optional[dict]:
        """Record that an employee has read/acknowledged this announcement."""
        now = datetime.now(timezone.utc)
        # Avoid duplicate read records
        await self.col.update_one(
            {"_id": ann_id, "company_id": company_id, "read_by.employee_id": {"$ne": employee_id}},
            {"$push": {"read_by": {"employee_id": employee_id, "employee_name": employee_name, "read_at": now}},
             "$set": {"updated_at": now}},
        )
        return await self.get(ann_id, company_id)

    async def get_read_stats(self, ann_id: str, company_id: str) -> dict:
        doc = await self.col.find_one({"_id": ann_id, "company_id": company_id})
        if not doc:
            return {}
        read_by = doc.get("read_by", [])
        total_employees = await self.db["hrm_employees"].count_documents(
            {"company_id": company_id, "is_deleted": False}
        )
        return {
            "total_employees": total_employees,
            "read_count": len(read_by),
            "read_by": read_by,
        }
