"""HRM — Shift Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.hrm_shift import DEFAULT_SHIFTS


class ShiftService:
    COL = "hrm_shifts"
    EMP_COL = "hrm_employees"
    AUDIT_COL = "hrm_audit_logs"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at"):
            val = doc.get(f)
            if isinstance(val, datetime):
                doc[f] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        return doc

    async def _audit(self, action: str, entity_id: str, user_id: str,
                     company_id: str, changes: Optional[dict] = None):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db[self.AUDIT_COL].insert_one({
            "_id": str(ObjectId()),
            "company_id": company_id,
            "module": "shifts",
            "action": action,
            "entity_type": "shift",
            "entity_id": entity_id,
            "user_id": user_id,
            "changes": changes or {},
            "timestamp": now,
        })

    # ── Seed defaults ─────────────────────────────────────────────────────────

    async def seed_defaults(self, company_id: str, created_by: str = "system") -> int:
        existing_count = await self.col.count_documents({"company_id": company_id, "is_deleted": False})
        if existing_count > 0:
            return 0
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        docs = []
        for s in DEFAULT_SHIFTS:
            docs.append({
                "_id": str(ObjectId()),
                "company_id": company_id,
                "is_active": True,
                "is_deleted": False,
                "applicable_departments": [],
                "created_by": created_by,
                "updated_by": None,
                "created_at": now,
                "updated_at": now,
                **s,
            })
        if docs:
            await self.col.insert_many(docs)
        return len(docs)

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def create(self, data: dict, company_id: str, created_by: str) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Duplicate name check
        dup = await self.col.find_one({
            "company_id": company_id,
            "name": data["name"],
            "is_deleted": False,
        })
        if dup:
            raise ValueError(f"A shift named '{data['name']}' already exists")
        # If marked as default, clear other defaults
        if data.get("is_default"):
            await self.col.update_many(
                {"company_id": company_id, "is_default": True},
                {"$set": {"is_default": False}},
            )
        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id": company_id,
            "name": data["name"],
            "shift_type": data.get("shift_type", "morning"),
            "start_time": data.get("start_time", "09:00"),
            "end_time": data.get("end_time", "18:00"),
            "grace_minutes": int(data.get("grace_minutes", 15)),
            "working_hours": float(data.get("working_hours", 8.0)),
            "break_duration_minutes": int(data.get("break_duration_minutes", 60)),
            "is_overnight": bool(data.get("is_overnight", False)),
            "applicable_departments": data.get("applicable_departments", []),
            "is_default": bool(data.get("is_default", False)),
            "is_active": True,
            "created_by": created_by,
            "updated_by": None,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.col.insert_one(doc)
        await self._audit("shift_created", doc_id, created_by, company_id,
                          {"name": doc["name"], "start_time": doc["start_time"]})
        return self._serialize(doc)

    async def list(self, company_id: str, include_inactive: bool = False) -> List[dict]:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if not include_inactive:
            query["is_active"] = True
        cursor = self.col.find(query).sort("name", 1)
        return [self._serialize(d) async for d in cursor]

    async def get(self, shift_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": shift_id, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def get_default(self, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({
            "company_id": company_id, "is_default": True, "is_deleted": False
        })
        return self._serialize(doc) if doc else None

    async def update(self, shift_id: str, data: dict, company_id: str,
                     updated_by: str) -> Optional[dict]:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        existing = await self.col.find_one({"_id": shift_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return None
        # Duplicate name check
        if "name" in data and data["name"] != existing["name"]:
            dup = await self.col.find_one({
                "company_id": company_id, "name": data["name"],
                "is_deleted": False, "_id": {"$ne": shift_id},
            })
            if dup:
                raise ValueError(f"A shift named '{data['name']}' already exists")
        # If marking as default, clear others
        if data.get("is_default"):
            await self.col.update_many(
                {"company_id": company_id, "is_default": True, "_id": {"$ne": shift_id}},
                {"$set": {"is_default": False}},
            )
        update_set = {k: v for k, v in data.items() if v is not None}
        update_set.update({"updated_by": updated_by, "updated_at": now})
        await self.col.update_one({"_id": shift_id}, {"$set": update_set})
        await self._audit("shift_updated", shift_id, updated_by, company_id, {"changes": data})
        existing.update(update_set)
        return self._serialize(existing)

    async def delete(self, shift_id: str, company_id: str, deleted_by: str) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Check if any employees are assigned to this shift
        assigned = await self.db[self.EMP_COL].count_documents({
            "company_id": company_id,
            "shift_id": shift_id,
            "is_deleted": False,
        })
        if assigned > 0:
            raise ValueError(f"Cannot delete: {assigned} employee(s) are assigned to this shift")
        result = await self.col.update_one(
            {"_id": shift_id, "company_id": company_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": now, "updated_by": deleted_by}},
        )
        if result.modified_count:
            await self._audit("shift_deleted", shift_id, deleted_by, company_id)
        return result.modified_count > 0

    async def assign_to_employee(self, shift_id: str, employee_id: str,
                                  company_id: str, updated_by: str) -> bool:
        """Assign a shift to an employee."""
        shift = await self.col.find_one({"_id": shift_id, "company_id": company_id, "is_deleted": False})
        if not shift:
            raise ValueError("Shift not found")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = await self.db[self.EMP_COL].update_one(
            {"_id": employee_id, "company_id": company_id},
            {"$set": {
                "shift_id": shift_id,
                "shift_name": shift["name"],
                "shift_start_time": shift["start_time"],
                "shift_end_time": shift["end_time"],
                "updated_at": now,
            }},
        )
        return result.modified_count > 0

    async def get_employee_count(self, shift_id: str, company_id: str) -> int:
        return await self.db[self.EMP_COL].count_documents({
            "company_id": company_id,
            "shift_id": shift_id,
            "is_deleted": False,
        })
