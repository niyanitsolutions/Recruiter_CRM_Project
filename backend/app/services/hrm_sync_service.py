"""HRM Sync Service — bidirectional User ↔ Employee linking"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


class HRMSyncService:
    """Link CRM users to HRM employee records (and vice-versa)."""

    def __init__(self, db, master_db=None):
        self.db = db
        self.master_db = master_db
        self.employees = db["hrm_employees"]
        self.users = db["users"]

    # ── Helpers ───────────────────────────────────────────────────────────────

    @staticmethod
    def _ser(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    async def _next_employee_id(self, company_id: str) -> str:
        count = await self.employees.count_documents({"company_id": company_id})
        return f"EMP{(count + 1):04d}"

    # ── Status ────────────────────────────────────────────────────────────────

    async def get_sync_status(self, company_id: str) -> dict:
        """Return counts of unlinked users and employees."""
        # Users are already in the company-specific DB — no company_id field needed
        total_users = await self.users.count_documents({
            "is_deleted": {"$ne": True}
        })
        linked_users = await self.users.count_documents({
            "is_deleted": {"$ne": True},
            "hrm_employee_id": {"$exists": True, "$ne": None}
        })
        total_employees = await self.employees.count_documents({
            "company_id": company_id, "is_deleted": False
        })
        linked_employees = await self.employees.count_documents({
            "company_id": company_id, "is_deleted": False,
            "crm_user_id": {"$exists": True, "$ne": None}
        })
        return {
            "total_users": total_users,
            "linked_users": linked_users,
            "unlinked_users": total_users - linked_users,
            "total_employees": total_employees,
            "linked_employees": linked_employees,
            "unlinked_employees": total_employees - linked_employees,
        }

    async def list_unlinked_users(self, company_id: str, page: int = 1, page_size: int = 20):
        skip = (page - 1) * page_size
        # Users are already in the company-specific DB — no company_id filter needed
        query = {
            "is_deleted": {"$ne": True},
            "$or": [
                {"hrm_employee_id": {"$exists": False}},
                {"hrm_employee_id": None},
            ]
        }
        total = await self.users.count_documents(query)
        cursor = self.users.find(query).sort("full_name", 1).skip(skip).limit(page_size)
        items = [self._ser(doc) async for doc in cursor]
        return {"total": total, "items": items}

    async def list_unlinked_employees(self, company_id: str, page: int = 1, page_size: int = 20):
        skip = (page - 1) * page_size
        query = {
            "company_id": company_id,
            "is_deleted": False,
            "$or": [
                {"crm_user_id": {"$exists": False}},
                {"crm_user_id": None},
            ]
        }
        total = await self.employees.count_documents(query)
        cursor = self.employees.find(query).sort("full_name", 1).skip(skip).limit(page_size)
        items = [self._ser(doc) async for doc in cursor]
        return {"total": total, "items": items}

    # ── Sync: Employee → User ─────────────────────────────────────────────────

    async def sync_employee_to_user(
        self,
        employee_id: str,
        company_id: str,
        created_by: str,
        password: Optional[str] = None,
        role: str = "hr",
    ) -> dict:
        """Create a CRM user account from an employee record and link them."""
        emp = await self.employees.find_one({"_id": employee_id, "company_id": company_id, "is_deleted": False})
        if not emp:
            return {"success": False, "message": "Employee not found"}

        if emp.get("crm_user_id"):
            # Already linked — return existing user
            user = await self.users.find_one({"_id": emp["crm_user_id"]})
            return {"success": True, "message": "Already linked", "user": self._ser(user) if user else None}

        # Check if a user with this email already exists
        existing = await self.users.find_one({"email": emp["email"], "is_deleted": {"$ne": True}})
        if existing:
            # Just link them
            now = datetime.now(timezone.utc)
            await self.employees.update_one(
                {"_id": employee_id},
                {"$set": {"crm_user_id": str(existing["_id"]), "updated_at": now}}
            )
            await self.users.update_one(
                {"_id": existing["_id"]},
                {"$set": {"hrm_employee_id": employee_id, "updated_at": now}}
            )
            return {"success": True, "message": "Linked to existing user", "user": self._ser(existing)}

        # Create new user
        from passlib.context import CryptContext
        import os
        rounds = int(os.getenv("BCRYPT_ROUNDS", "12"))
        pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=rounds)
        plain_pwd = password or f"HireFlow@{datetime.now().year}"
        now = datetime.now(timezone.utc)
        user_doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "username": emp["email"].split("@")[0].lower().replace(".", "_"),
            "email": emp["email"],
            "full_name": emp["full_name"],
            "phone": emp.get("phone", ""),
            "role": role,
            "permissions": [],
            "override_permissions": False,
            "password_hash": pwd_ctx.hash(plain_pwd),
            "is_active": True,
            "is_deleted": False,
            "hrm_employee_id": employee_id,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.users.insert_one(user_doc)
        await self.employees.update_one(
            {"_id": employee_id},
            {"$set": {"crm_user_id": user_doc["_id"], "updated_at": now}}
        )
        user_doc["temp_password"] = plain_pwd
        return {"success": True, "message": "User account created and linked", "user": self._ser(user_doc)}

    # ── Sync: User → Employee ─────────────────────────────────────────────────

    async def sync_user_to_employee(
        self,
        user_id: str,
        company_id: str,
        created_by: str,
        extra_fields: Optional[dict] = None,
    ) -> dict:
        """Create an employee record from a CRM user and link them."""
        user = await self.users.find_one({"_id": user_id, "is_deleted": {"$ne": True}})
        if not user:
            return {"success": False, "message": "User not found"}

        if user.get("hrm_employee_id"):
            emp = await self.employees.find_one({"_id": user["hrm_employee_id"]})
            return {"success": True, "message": "Already linked", "employee": self._ser(emp) if emp else None}

        # Check if employee with same email already exists
        existing_emp = await self.employees.find_one({"email": user["email"], "company_id": company_id, "is_deleted": False})
        if existing_emp:
            now = datetime.now(timezone.utc)
            await self.employees.update_one(
                {"_id": existing_emp["_id"]},
                {"$set": {"crm_user_id": user_id, "updated_at": now}}
            )
            await self.users.update_one(
                {"_id": user_id},
                {"$set": {"hrm_employee_id": str(existing_emp["_id"]), "updated_at": now}}
            )
            return {"success": True, "message": "Linked to existing employee", "employee": self._ser(existing_emp)}

        emp_id = await self._next_employee_id(company_id)
        now = datetime.now(timezone.utc)
        emp_doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": emp_id,
            "full_name": user.get("full_name", ""),
            "email": user["email"],
            "phone": user.get("phone", ""),
            "employment_status": "active",
            "employment_type": "full_time",
            "salary": {"ctc": 0.0, "basic": 0.0, "hra": 0.0, "special_allowance": 0.0,
                       "pf_employee": 0.0, "pf_employer": 0.0, "professional_tax": 0.0,
                       "gross_salary": 0.0, "net_salary": 0.0},
            "crm_user_id": user_id,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
            **(extra_fields or {}),
        }
        await self.employees.insert_one(emp_doc)
        await self.users.update_one(
            {"_id": user_id},
            {"$set": {"hrm_employee_id": emp_doc["_id"], "updated_at": now}}
        )
        return {"success": True, "message": "Employee record created and linked", "employee": self._ser(emp_doc)}

    # ── Manual link/unlink ────────────────────────────────────────────────────

    async def link(self, user_id: str, employee_id: str, company_id: str) -> dict:
        """Manually link an existing user to an existing employee."""
        user = await self.users.find_one({"_id": user_id})
        emp = await self.employees.find_one({"_id": employee_id, "company_id": company_id})
        if not user or not emp:
            return {"success": False, "message": "User or employee not found"}
        now = datetime.now(timezone.utc)
        await self.users.update_one({"_id": user_id}, {"$set": {"hrm_employee_id": employee_id, "updated_at": now}})
        await self.employees.update_one({"_id": employee_id}, {"$set": {"crm_user_id": user_id, "updated_at": now}})
        return {"success": True, "message": "Linked successfully"}

    async def unlink(self, user_id: str, company_id: str) -> dict:
        """Remove the link between a user and their employee record."""
        user = await self.users.find_one({"_id": user_id})
        if not user:
            return {"success": False, "message": "User not found"}
        emp_id = user.get("hrm_employee_id")
        now = datetime.now(timezone.utc)
        await self.users.update_one({"_id": user_id}, {"$unset": {"hrm_employee_id": ""}, "$set": {"updated_at": now}})
        if emp_id:
            await self.employees.update_one({"_id": emp_id}, {"$unset": {"crm_user_id": ""}, "$set": {"updated_at": now}})
        return {"success": True, "message": "Unlinked successfully"}
