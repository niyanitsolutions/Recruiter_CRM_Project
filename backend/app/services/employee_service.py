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

    async def create(
        self,
        data: EmployeeCreate,
        company_id: str,
        created_by: str,
        crm_enabled: bool = True,
        hrm_enabled: bool = True,
    ) -> dict:
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
        for field in ("salary", "bank_details", "emergency_contact", "address_info", "background_check"):
            if field in doc and hasattr(doc[field], "model_dump"):
                doc[field] = doc[field].model_dump()
        if data.emergency_contacts:
            doc["emergency_contacts"] = [ec.model_dump() for ec in data.emergency_contacts]
        if data.qualifications:
            doc["qualifications"] = [q.model_dump() for q in data.qualifications]
        await self.col.insert_one(doc)

        # ── User ↔ Employee auto-link by email ───────────────────────────────
        # Always runs — CRM + HRM are always active for all tenants.
        try:
            from app.services.notification_service import NotificationService
            notif_svc = NotificationService(self.db)
            employee_email = str(data.email).lower().strip()

            # Find CRM user with same email (case-insensitive)
            matched_user = await self.db.users.find_one(
                {"company_id": company_id, "email": {"$regex": f"^{employee_email}$", "$options": "i"},
                 "is_deleted": False},
                {"_id": 1},
            )

            if matched_user:
                # Link employee → user
                user_id = matched_user["_id"]
                await self.col.update_one(
                    {"_id": doc["_id"]},
                    {"$set": {"crm_user_id": user_id, "updated_at": now}},
                )
                doc["crm_user_id"] = user_id
                # Also stamp employee_id back on the user for reverse lookup
                await self.db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"hrm_employee_id": doc["_id"], "updated_at": now}},
                )
            else:
                # No CRM user exists — notify admins to create one
                admin_ids = await self._get_admin_ids(company_id)
                if admin_ids:
                    await notif_svc.notify_crm_employee_created(
                        company_id=company_id,
                        admin_user_ids=admin_ids,
                        employee_name=data.full_name,
                        employee_email=employee_email,
                    )
        except Exception:
            pass  # linking must never block employee creation

        return self._serialize(doc)

    async def _get_admin_ids(self, company_id: str) -> list:
        """Return user _ids for all active admin/owner users in this company."""
        cursor = self.db.users.find(
            {"company_id": company_id, "is_deleted": False,
             "$or": [{"is_owner": True}, {"role": "admin"}]},
            {"_id": 1},
        )
        return [doc["_id"] async for doc in cursor]

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
