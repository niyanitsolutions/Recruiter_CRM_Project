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
            "target_department_ids": data.get("target_department_ids") or [],
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
