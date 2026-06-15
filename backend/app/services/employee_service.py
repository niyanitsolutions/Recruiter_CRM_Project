"""HRM — Employee Service"""
import re
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.employee import EmployeeCreate, EmployeeUpdate, EmploymentStatus, AccountInfoCreate


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
            **data.model_dump(exclude_none=True, exclude={"account_info"}),
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

            # Find CRM user with same email (case-insensitive).
            # Users in the company-specific DB do NOT store a company_id field
            # (they are already in the per-company database), so no company_id filter.
            matched_user = await self.db.users.find_one(
                {"email": {"$regex": f"^{re.escape(employee_email)}$", "$options": "i"},
                 "is_deleted": {"$ne": True}},
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
            elif data.account_info and data.account_info.username and data.account_info.password:
                # No CRM user exists BUT account_info was provided — create user account now
                from app.services.hrm_sync_service import HRMSyncService
                sync_svc = HRMSyncService(self.db)
                await sync_svc.sync_employee_to_user(
                    employee_id=doc["_id"],
                    company_id=company_id,
                    created_by=created_by,
                    password=data.account_info.password,
                    role=data.account_info.role or "hr",
                    username=data.account_info.username,
                )
                # Refresh crm_user_id in memory after sync
                fresh = await self.col.find_one({"_id": doc["_id"]}, {"crm_user_id": 1})
                if fresh and fresh.get("crm_user_id"):
                    doc["crm_user_id"] = fresh["crm_user_id"]
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
        """Return user _ids for all active admin/owner users in this company.
        Users in the company-specific DB have no company_id field — omit that filter."""
        cursor = self.db.users.find(
            {"is_deleted": {"$ne": True},
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
            _s = re.escape(search)
            query["$or"] = [
                {"full_name": {"$regex": _s, "$options": "i"}},
                {"email": {"$regex": _s, "$options": "i"}},
                {"employee_id": {"$regex": _s, "$options": "i"}},
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

        # Phase 10: sync shared fields to linked CRM user
        try:
            shared = {}
            if "full_name" in update_data:     shared["full_name"] = update_data["full_name"]
            if "email" in update_data:         shared["email"] = str(update_data["email"]).lower()
            if "phone" in update_data:         shared["mobile"] = update_data["phone"]
            if "department_name" in update_data: shared["department"] = update_data["department_name"]
            if "department_id" in update_data:   shared["department_id"] = update_data["department_id"]
            if shared:
                emp_doc = await self.col.find_one({"_id": employee_id}, {"crm_user_id": 1})
                crm_user_id = emp_doc.get("crm_user_id") if emp_doc else None
                if crm_user_id:
                    shared["updated_at"] = datetime.now(timezone.utc)
                    await self.db.users.update_one(
                        {"_id": crm_user_id, "is_deleted": {"$ne": True}},
                        {"$set": shared},
                    )
        except Exception:
            pass  # sync must never block employee update

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
