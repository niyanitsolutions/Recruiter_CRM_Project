"""HRM — Employee Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.employee import EmployeeCreate, EmployeeUpdate, EmploymentStatus


class EmployeeService:
    COL = "hrm_employees"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _next_employee_id(self, company_id: str) -> str:
        count = await self.col.count_documents({"company_id": company_id})
        return f"EMP{(count + 1):04d}"

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if doc is None:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    # ── CRUD ──────────────────────────────────────────────────────────────────

    async def create(self, data: EmployeeCreate, company_id: str, created_by: str) -> dict:
        emp_id = await self._next_employee_id(company_id)
        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": emp_id,
            **data.model_dump(exclude_none=True),
            "employment_status": EmploymentStatus.ACTIVE,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        if data.salary:
            doc["salary"] = data.salary.model_dump()
        if data.bank_details:
            doc["bank_details"] = data.bank_details.model_dump()
        if data.emergency_contact:
            doc["emergency_contact"] = data.emergency_contact.model_dump()
        await self.col.insert_one(doc)
        return self._serialize(doc)

    async def list(
        self,
        company_id: str,
        status: Optional[str] = None,
        department_id: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if status:
            query["employment_status"] = status
        if department_id:
            query["department_id"] = department_id
        if search:
            query["$or"] = [
                {"full_name": {"$regex": search, "$options": "i"}},
                {"email": {"$regex": search, "$options": "i"}},
                {"employee_id": {"$regex": search, "$options": "i"}},
            ]
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, employee_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": employee_id, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def update(self, employee_id: str, data: EmployeeUpdate, company_id: str) -> Optional[dict]:
        update_data = {k: v for k, v in data.model_dump(exclude_none=True).items()}
        if not update_data:
            return await self.get(employee_id, company_id)
        # Serialize nested models
        for field in ("salary", "bank_details", "emergency_contact"):
            if field in update_data and hasattr(update_data[field], "model_dump"):
                update_data[field] = update_data[field].model_dump()
        update_data["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": employee_id, "company_id": company_id}, {"$set": update_data})
        return await self.get(employee_id, company_id)

    async def delete(self, employee_id: str, company_id: str) -> bool:
        result = await self.col.update_one(
            {"_id": employee_id, "company_id": company_id},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0

    async def get_by_email(self, email: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"email": email, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def count_active(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "employment_status": EmploymentStatus.ACTIVE,
            "is_deleted": False,
        })
