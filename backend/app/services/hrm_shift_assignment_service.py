"""HRM — Shift Assignment Service (Phase 5)

Manages time-bounded shift assignments per employee.
Priority: most recent active assignment > employee.shift_id fallback > company default shift.
"""
from datetime import datetime, timezone, date
from typing import Optional, List
from bson import ObjectId


class ShiftAssignmentService:
    COL      = "hrm_shift_assignments"
    EMP_COL  = "hrm_employees"
    SHIFT_COL = "hrm_shifts"
    CHANGE_COL = "hrm_shift_change_requests"

    def __init__(self, db):
        self.db  = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at", "reviewed_at"):
            val = doc.get(f)
            if isinstance(val, datetime):
                doc[f] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        return doc

    # ── Shift Assignment CRUD ─────────────────────────────────────────────────

    async def create_assignment(
        self,
        employee_id: str,
        shift_id: str,
        company_id: str,
        effective_from: str,
        effective_to: Optional[str],
        is_temporary: bool,
        reason: Optional[str],
        assigned_by: str,
    ) -> dict:
        # Validate shift exists
        shift = await self.db[self.SHIFT_COL].find_one({"_id": shift_id, "company_id": company_id, "is_deleted": False})
        if not shift:
            raise ValueError("Shift not found")

        # Overlap validation: check if any active assignment covers the same period
        overlap_query: dict = {
            "company_id": company_id,
            "employee_id": employee_id,
            "is_deleted": False,
            "$or": [
                {"effective_to": None},  # permanent assignments always overlap
                {"effective_to": {"$gte": effective_from}},
            ],
        }
        if effective_to:
            overlap_query["effective_from"] = {"$lte": effective_to}
        existing = await self.col.find_one(overlap_query)
        if existing:
            raise ValueError(
                f"Overlapping assignment exists for this period "
                f"({existing.get('effective_from')} – {existing.get('effective_to') or 'permanent'})"
            )

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        emp = await self.db[self.EMP_COL].find_one({"_id": employee_id, "company_id": company_id})
        emp_name = emp.get("full_name", "") if emp else ""

        # Resolve grace_minutes: shift override → tenant setting → system default (15)
        _settings_doc = await self.db["company_settings"].find_one({}) or {}
        _tenant_grace = int(_settings_doc.get("attendance_grace_minutes", 15))
        _grace = shift.get("grace_minutes")
        resolved_grace = int(_grace) if _grace is not None else _tenant_grace

        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id":    company_id,
            "employee_id":   employee_id,
            "employee_name": emp_name,
            "shift_id":      shift_id,
            "shift_name":    shift.get("name", ""),
            "shift_start":   shift.get("start_time"),
            "shift_end":     shift.get("end_time"),
            "is_overnight":  shift.get("is_overnight", False),
            "grace_minutes": resolved_grace,
            "effective_from": effective_from,
            "effective_to":   effective_to,
            "is_temporary":   is_temporary,
            "reason":         reason,
            "assigned_by":    assigned_by,
            "is_deleted":     False,
            "created_at":     now,
            "updated_at":     now,
        }
        await self.col.insert_one(doc)
        return self._serialize(doc)

    async def list_assignments(
        self,
        company_id: str,
        employee_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if employee_id:
            query["employee_id"] = employee_id
        total = await self.col.count_documents(query)
        cursor = self.col.find(query).sort("effective_from", -1).skip((page - 1) * page_size).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // page_size))}

    async def update_assignment(self, assignment_id: str, company_id: str, data: dict, updated_by: str) -> Optional[dict]:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        existing = await self.col.find_one({"_id": assignment_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return None
        update = {k: v for k, v in data.items() if v is not None}
        update["updated_at"] = now
        update["updated_by"] = updated_by
        # If shift changed, refresh cached shift fields
        new_shift_id = update.get("shift_id")
        if new_shift_id and new_shift_id != existing.get("shift_id"):
            shift = await self.db[self.SHIFT_COL].find_one({"_id": new_shift_id, "company_id": company_id, "is_deleted": False})
            if not shift:
                raise ValueError("Shift not found")
            update["shift_name"]    = shift.get("name", "")
            update["shift_start"]   = shift.get("start_time")
            update["shift_end"]     = shift.get("end_time")
            update["is_overnight"]  = shift.get("is_overnight", False)
            # Resolve grace_minutes: shift override → tenant setting → system default (15)
            _settings_doc = await self.db["company_settings"].find_one({}) or {}
            _tenant_grace = int(_settings_doc.get("attendance_grace_minutes", 15))
            _grace = shift.get("grace_minutes")
            update["grace_minutes"] = int(_grace) if _grace is not None else _tenant_grace
        await self.col.update_one({"_id": assignment_id}, {"$set": update})
        existing.update(update)
        return self._serialize(existing)

    async def delete_assignment(self, assignment_id: str, company_id: str, deleted_by: str) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = await self.col.update_one(
            {"_id": assignment_id, "company_id": company_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": now, "updated_by": deleted_by}},
        )
        return result.modified_count > 0

    async def get_active_assignment(self, employee_id: str, company_id: str, on_date: Optional[str] = None) -> Optional[dict]:
        """Return the shift assignment active on `on_date` (YYYY-MM-DD), defaulting to today."""
        date_str = on_date or date.today().isoformat()
        doc = await self.col.find_one(
            {
                "company_id":    company_id,
                "employee_id":   employee_id,
                "is_deleted":    False,
                "effective_from": {"$lte": date_str},
                "$or": [
                    {"effective_to": None},
                    {"effective_to": {"$gte": date_str}},
                ],
            },
            sort=[("effective_from", -1)],
        )
        return self._serialize(doc) if doc else None

    # ── Shift Change Requests ─────────────────────────────────────────────────

    async def create_change_request(
        self,
        employee_id: str,
        company_id: str,
        requested_shift_id: str,
        effective_from: str,
        effective_to: Optional[str],
        reason: str,
        emp_name: str,
    ) -> dict:
        shift = await self.db[self.SHIFT_COL].find_one({"_id": requested_shift_id, "company_id": company_id, "is_deleted": False})
        if not shift:
            raise ValueError("Requested shift not found")

        # Get current shift
        current_assignment = await self.get_active_assignment(employee_id, company_id)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id":           company_id,
            "employee_id":          employee_id,
            "employee_name":        emp_name,
            "current_shift_id":     current_assignment.get("shift_id") if current_assignment else None,
            "current_shift_name":   current_assignment.get("shift_name") if current_assignment else None,
            "requested_shift_id":   requested_shift_id,
            "requested_shift_name": shift.get("name", ""),
            "effective_from":       effective_from,
            "effective_to":         effective_to,
            "reason":               reason,
            "status":               "pending",
            "reviewed_by":          None,
            "reviewed_at":          None,
            "review_reason":        None,
            "is_deleted":           False,
            "created_at":           now,
            "updated_at":           now,
        }
        await self.db[self.CHANGE_COL].insert_one(doc)
        return self._serialize(doc)

    async def list_change_requests(
        self,
        company_id: str,
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        total = await self.db[self.CHANGE_COL].count_documents(query)
        cursor = self.db[self.CHANGE_COL].find(query).sort("created_at", -1).skip((page - 1) * page_size).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "pages": max(1, -(-total // page_size))}

    async def approve_change_request(self, request_id: str, company_id: str, reviewed_by: str) -> dict:
        req = await self.db[self.CHANGE_COL].find_one({"_id": request_id, "company_id": company_id, "is_deleted": False})
        if not req:
            raise ValueError("Request not found")
        if req.get("status") != "pending":
            raise ValueError(f"Request is already {req.get('status')}")

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Create actual shift assignment
        try:
            await self.create_assignment(
                employee_id=req["employee_id"],
                shift_id=req["requested_shift_id"],
                company_id=company_id,
                effective_from=req["effective_from"],
                effective_to=req.get("effective_to"),
                is_temporary=bool(req.get("effective_to")),
                reason=f"Shift change request approved: {req.get('reason', '')}",
                assigned_by=reviewed_by,
            )
        except ValueError:
            # If overlap exists, delete conflicting assignment and retry
            await self.col.delete_many({
                "company_id":  company_id,
                "employee_id": req["employee_id"],
                "is_deleted":  False,
            })
            await self.create_assignment(
                employee_id=req["employee_id"],
                shift_id=req["requested_shift_id"],
                company_id=company_id,
                effective_from=req["effective_from"],
                effective_to=req.get("effective_to"),
                is_temporary=bool(req.get("effective_to")),
                reason=f"Shift change request approved: {req.get('reason', '')}",
                assigned_by=reviewed_by,
            )

        await self.db[self.CHANGE_COL].update_one(
            {"_id": request_id},
            {"$set": {"status": "approved", "reviewed_by": reviewed_by, "reviewed_at": now, "updated_at": now}},
        )
        req.update({"status": "approved", "reviewed_by": reviewed_by, "reviewed_at": now})
        return self._serialize(req)

    async def reject_change_request(self, request_id: str, company_id: str, reviewed_by: str, reason: Optional[str]) -> dict:
        req = await self.db[self.CHANGE_COL].find_one({"_id": request_id, "company_id": company_id, "is_deleted": False})
        if not req:
            raise ValueError("Request not found")
        if req.get("status") != "pending":
            raise ValueError(f"Request is already {req.get('status')}")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db[self.CHANGE_COL].update_one(
            {"_id": request_id},
            {"$set": {"status": "rejected", "reviewed_by": reviewed_by, "reviewed_at": now,
                      "review_reason": reason, "updated_at": now}},
        )
        req.update({"status": "rejected", "reviewed_by": reviewed_by, "reviewed_at": now, "review_reason": reason})
        return self._serialize(req)

    async def cancel_change_request(self, request_id: str, company_id: str, employee_id: str) -> dict:
        req = await self.db[self.CHANGE_COL].find_one({
            "_id": request_id, "company_id": company_id,
            "employee_id": employee_id, "is_deleted": False,
        })
        if not req:
            raise ValueError("Request not found")
        if req.get("status") != "pending":
            raise ValueError("Only pending requests can be cancelled")
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db[self.CHANGE_COL].update_one(
            {"_id": request_id},
            {"$set": {"status": "cancelled", "updated_at": now}},
        )
        req["status"] = "cancelled"
        return self._serialize(req)
