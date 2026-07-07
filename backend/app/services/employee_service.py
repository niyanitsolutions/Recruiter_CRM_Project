"""HRM — Employee Service"""
import re
from datetime import datetime, date, timezone
from typing import Optional, List
from bson import ObjectId


def _dates_to_datetime(obj):
    """
    Recursively replace datetime.date values with datetime.datetime.

    PyMongo / BSON cannot encode bare date objects (only datetime.datetime is
    a valid BSON date type). datetime subclasses date, so the datetime check
    must come first to avoid double-converting timezone-aware datetimes.
    """
    if isinstance(obj, datetime):
        return obj   # already a datetime — leave unchanged
    if isinstance(obj, date):
        return datetime(obj.year, obj.month, obj.day, tzinfo=timezone.utc)
    if isinstance(obj, dict):
        return {k: _dates_to_datetime(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_dates_to_datetime(item) for item in obj]
    return obj

from app.models.company.employee import (
    EmployeeCreate, EmployeeUpdate, EmploymentStatus, AccountInfoCreate,
    calculate_profile_completion,
)


async def next_employee_code(col, company_id: str) -> str:
    """Next sequential EMP code from the highest existing number.

    Count-based generation reused numbers after deletions (10 employees, delete
    one, next create → duplicate EMP0010). Soft-deleted docs stay in the
    collection, so taking max over all docs never reuses a code.
    """
    docs = await col.find(
        {"company_id": company_id, "employee_id": {"$regex": r"^EMP\d+$"}},
        {"employee_id": 1},
    ).sort("employee_id", -1).limit(1).to_list(1)
    n = 0
    if docs:
        try:
            n = int(docs[0]["employee_id"][3:])
        except (ValueError, TypeError):
            n = 0
    if n <= 0:
        n = await col.count_documents({"company_id": company_id})
    return f"EMP{(n + 1):04d}"


class EmployeeService:
    COL = "hrm_employees"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    # ── Helpers ───────────────────────────────────────────────────────────────

    async def _next_employee_id(self, company_id: str) -> str:
        return await next_employee_code(self.col, company_id)

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
        created_by_name: str = "",
        created_by_role: str = "hr",
        company_name: str = "",
        crm_enabled: bool = True,
        hrm_enabled: bool = True,
    ) -> dict:
        # Duplicate employee email → would auto-link two employees to one user
        from fastapi import HTTPException
        dup_emp = await self.col.find_one({
            "email": {"$regex": f"^{re.escape(str(data.email).lower().strip())}$", "$options": "i"},
            "company_id": company_id,
            "is_deleted": False,
        }, {"_id": 1})
        if dup_emp:
            raise HTTPException(status_code=409, detail={
                "duplicate": True,
                "fields": {"email": str(data.email)},
            })

        # ── Pre-validate account_info before creating anything ────────────────
        # This prevents orphan employees when account creation fails due to duplicates.
        if data.account_info and data.account_info.username and data.account_info.password:
            ai = data.account_info
            employee_email = str(data.email).lower().strip()

            # Duplicate username check
            dup_user = await self.db.users.find_one(
                {"username": ai.username.lower(), "is_deleted": {"$ne": True}},
                {"_id": 1},
            )
            if dup_user:
                raise HTTPException(status_code=409, detail={
                    "duplicate": True,
                    "fields": {"username": ai.username},
                })

            # Duplicate email check (will become the user's email too)
            dup_email = await self.db.users.find_one(
                {"email": {"$regex": f"^{re.escape(employee_email)}$", "$options": "i"},
                 "is_deleted": {"$ne": True}},
                {"_id": 1},
            )
            if dup_email:
                raise HTTPException(status_code=409, detail={
                    "duplicate": True,
                    "fields": {"email": str(data.email)},
                })

            # Seat limit check (internal users only)
            if (ai.user_type or "internal") != "partner":
                from app.core.database import get_master_db
                master_db = get_master_db()
                tenant = await master_db.tenants.find_one({"company_id": company_id})
                if tenant:
                    total_seats = int(tenant.get("max_users", 0))
                    if total_seats > 0:
                        current_count = await self.db.users.count_documents({
                            "is_deleted": False, "user_type": "internal",
                        })
                        if current_count >= total_seats:
                            raise HTTPException(status_code=402, detail={
                                "seat_limit_reached": True,
                                "total_user_seats": total_seats,
                                "current_active_users": current_count,
                            })

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
        # Convert datetime.date → datetime.datetime before insert.
        # PyMongo's BSON encoder cannot handle bare date objects (e.g. date_of_birth,
        # date_of_joining). This must run after all model_dump() calls above.
        doc = _dates_to_datetime(doc)
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
                await self.db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"hrm_employee_id": doc["_id"], "updated_at": now}},
                )

            elif data.account_info and data.account_info.username and data.account_info.password:
                # No CRM user exists — create one using the full UserService pipeline
                # (handles permissions, welcome email, global user sync, audit log)
                ai = data.account_info
                await self._create_linked_user(
                    employee_id=doc["_id"],
                    employee_doc=doc,
                    account_info=ai,
                    company_id=company_id,
                    created_by=created_by,
                    created_by_name=created_by_name,
                    created_by_role=created_by_role,
                    company_name=company_name,
                )
                # Refresh crm_user_id in memory
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

    async def _create_linked_user(
        self,
        employee_id: str,
        employee_doc: dict,
        account_info: AccountInfoCreate,
        company_id: str,
        created_by: str,
        created_by_name: str,
        created_by_role: str,
        company_name: str,
    ) -> None:
        """Create a CRM user from account_info + employee identity, then link them."""
        from app.services.user_service import UserService
        from app.models.company.user import UserCreate

        # joining_date: convert from ISO date string to datetime if present
        joining_dt = None
        if account_info.joining_date:
            try:
                from datetime import date as _date
                parsed = _date.fromisoformat(account_info.joining_date[:10])
                joining_dt = datetime(parsed.year, parsed.month, parsed.day, tzinfo=timezone.utc)
            except Exception:
                pass

        # mobile: use employee's phone; fall back to placeholder if empty/invalid
        mobile_raw = str(employee_doc.get("phone", "") or "").strip()
        if not re.match(r"^[6-9]\d{9}$", re.sub(r"[^0-9]", "", mobile_raw)):
            mobile_raw = "9999999999"  # placeholder — user must update after first login

        user_data = UserCreate(
            username=account_info.username.lower().strip(),
            password=account_info.password,
            email=str(employee_doc["email"]).lower().strip(),
            full_name=str(employee_doc["full_name"]).strip(),
            mobile=re.sub(r"[^0-9]", "", mobile_raw),
            employee_id=account_info.employee_id,
            role=account_info.role or "candidate_coordinator",
            user_type=account_info.user_type or "internal",
            department_id=account_info.department_id,
            department=account_info.department,
            designation_id=account_info.designation_id,
            designation=account_info.designation,
            reporting_to=account_info.reporting_to,
            joining_date=joining_dt,
            status=account_info.status or "active",
            permissions=account_info.permissions,
            primary_department=account_info.primary_department,
            level=account_info.level,
            assigned_departments=account_info.assigned_departments or [],
            restricted_modules=account_info.restricted_modules or [],
            override_duplicate=account_info.override_duplicate or False,
        )

        user_svc = UserService(self.db)
        ok, msg, _ = await user_svc.create_user(
            user_data=user_data,
            created_by_id=created_by,
            created_by_name=created_by_name or "System",
            created_by_role=created_by_role or "hr",
            company_id=company_id,
            company_name=company_name or "",
        )
        if not ok:
            raise RuntimeError(f"User creation failed: {msg}")
        # auto-link is handled inside user_service.create_user via sync_user_to_employee

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
        items = []
        async for d in cursor:
            profile_status = calculate_profile_completion(d)
            item = self._serialize(d)
            item["employee_profile_status"] = profile_status
            items.append(item)
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
        # Same date-serialization fix as in create() — covers date_of_joining,
        # date_of_leaving, and DisciplinaryRecord.date in EmployeeUpdate payloads.
        update_data = _dates_to_datetime(update_data)
        await self.col.update_one({"_id": employee_id, "company_id": company_id}, {"$set": update_data})

        # Phase 10: sync shared fields to linked CRM user
        try:
            shared = {}
            if "full_name" in update_data:       shared["full_name"] = update_data["full_name"]
            if "email" in update_data:           shared["email"] = str(update_data["email"]).lower()
            if "phone" in update_data:           shared["mobile"] = update_data["phone"]
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
        """Permanently delete an employee and all employee-scoped HRM data.

        Business records the employee created/touched elsewhere (candidates,
        clients, jobs, interviews, applications, tasks, reports, audit logs)
        are intentionally left untouched — only data scoped to this employee
        record itself is removed. The linked CRM user account (if any) is kept
        and merely unlinked, matching prior behavior, since it may still be
        referenced as created_by/assigned_to elsewhere.
        """
        emp = await self.col.find_one({"_id": employee_id, "company_id": company_id})
        if not emp:
            return False

        now = datetime.now(timezone.utc)
        from app.utils.s3 import delete_file

        # ── 1. Remove stored files (photo + documents) ─────────────────────
        photo_url = emp.get("photo_url")
        if photo_url:
            try:
                await delete_file(photo_url)
            except Exception:
                pass
        for doc in (emp.get("documents") or []):
            file_url = doc.get("file_url") if isinstance(doc, dict) else None
            if file_url:
                try:
                    await delete_file(file_url)
                except Exception:
                    pass

        # ── 2. Unassign (not delete) any assets currently held by this employee ──
        try:
            cursor = self.db.hrm_assets.find({
                "company_id": company_id, "assigned_to_id": employee_id,
                "status": "assigned", "is_deleted": False,
            })
            async for asset in cursor:
                history = asset.get("assignment_history", [])
                for h in reversed(history):
                    if h.get("returned_on") is None:
                        h["returned_on"] = now
                        h["notes"] = (h.get("notes") or "") + " | Auto-returned: employee deleted"
                        break
                await self.db.hrm_assets.update_one(
                    {"_id": asset["_id"]},
                    {"$set": {
                        "status": "available", "assigned_to_id": None,
                        "assigned_to_name": None, "assigned_on": None,
                        "assignment_history": history, "updated_at": now,
                    }},
                )
        except Exception:
            pass

        # ── 3. Cascade-delete employee-scoped collections ──────────────────
        cascade_collections = [
            "hrm_attendance", "hrm_leaves", "hrm_leave_balances", "hrm_comp_off_credits",
            "hrm_payslips", "hrm_performance", "hrm_shift_assignments",
            "hrm_shift_change_requests", "hrm_work_mode_requests",
            "hrm_attendance_exceptions", "hrm_exit", "hrm_onboardings",
        ]
        for col_name in cascade_collections:
            try:
                await self.db[col_name].delete_many(
                    {"employee_id": employee_id, "company_id": company_id}
                )
            except Exception:
                pass

        # ── 4. Invalidate/remove onboarding link tokens for this employee ──
        for col_name in ("employee_onboarding_tokens", "hrm_doc_upload_tokens"):
            try:
                await self.db[col_name].delete_many({"employee_id": employee_id})
            except Exception:
                pass

        # ── 5. Soft-delete generated documents (Document Center) — matches
        # that module's existing single-document delete semantics. ─────────
        try:
            await self.db.doc_generated.update_many(
                {"employee_id": employee_id},
                {"$set": {"is_deleted": True, "updated_at": now}},
            )
        except Exception:
            pass

        # ── 6. Unlink the CRM user (kept, not deleted) ─────────────────────
        if emp.get("crm_user_id"):
            try:
                await self.db.users.update_one(
                    {"_id": emp["crm_user_id"]},
                    {"$unset": {"hrm_employee_id": ""}, "$set": {"updated_at": now}},
                )
            except Exception:
                pass

        # ── 7. Hard-delete the employee record itself ──────────────────────
        result = await self.col.delete_one({"_id": employee_id, "company_id": company_id})
        return result.deleted_count > 0

    async def get_by_email(self, email: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"email": email, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def count_active(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "employment_status": EmploymentStatus.ACTIVE,
            "is_deleted": False,
        })
