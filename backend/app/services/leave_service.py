"""HRM — Leave Service (enhanced: holiday overlap, weekend exclusion, policy validation)"""
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List
from bson import ObjectId
import math

from app.models.company.leave import LeaveStatus, LeaveType, LeaveDuration


class LeaveService:
    COL = "hrm_leaves"
    BAL_COL = "hrm_leave_balances"
    POL_COL = "hrm_leave_policies"
    HOL_COL = "hrm_holidays"
    AUDIT_COL = "hrm_audit_logs"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]
        self.bal = db[self.BAL_COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("from_date", "to_date"):
            if isinstance(doc.get(f), date):
                doc[f] = doc[f].isoformat()
        return doc

    # ── Working-day calculation ───────────────────────────────────────────────

    async def _count_working_days(
        self, from_date: date, to_date: date, company_id: str,
        department: Optional[str] = None, duration: Optional[str] = None
    ) -> float:
        """Count actual working days: excludes weekends and company holidays."""
        if duration in (LeaveDuration.HALF_DAY_MORNING, LeaveDuration.HALF_DAY_AFTERNOON,
                         "half_day_morning", "half_day_afternoon"):
            return 0.5

        # Fetch company holidays in range
        holiday_dates: set = set()
        cursor = self.db[self.HOL_COL].find({
            "company_id": company_id,
            "date": {"$gte": from_date.isoformat(), "$lte": to_date.isoformat()},
            "is_active": True,
            "is_deleted": False,
        })
        async for h in cursor:
            # Respect dept filter if applicable_departments is non-empty
            depts = h.get("applicable_departments", [])
            if not depts or (department and department in depts):
                holiday_dates.add(h["date"])

        total = 0.0
        current = from_date
        while current <= to_date:
            if current.weekday() < 5:  # Monday=0 … Friday=4
                if current.isoformat() not in holiday_dates:
                    total += 1.0
            current += timedelta(days=1)

        return max(0.0, total)

    # ── Policy helpers ────────────────────────────────────────────────────────

    async def _get_policy(self, leave_type: str, company_id: str) -> Optional[dict]:
        return await self.db[self.POL_COL].find_one({
            "company_id": company_id,
            "leave_type": leave_type,
            "is_active": True,
            "is_deleted": False,
        })

    async def _validate_policy(
        self, leave_type: str, days: float, company_id: str,
        gender: Optional[str] = None, department: Optional[str] = None,
        on_probation: bool = False, on_notice: bool = False,
    ) -> None:
        policy = await self._get_policy(leave_type, company_id)
        if not policy:
            return  # No policy → allow

        if not policy.get("is_active", True):
            raise ValueError(f"Leave type is not currently active")

        if gender and policy.get("gender_restriction") and policy["gender_restriction"] != gender:
            raise ValueError(f"'{policy['name']}' is restricted to {policy['gender_restriction']} employees")

        if on_probation and policy.get("probation_restriction"):
            raise ValueError(f"'{policy['name']}' cannot be taken during probation period")

        if on_notice and policy.get("notice_period_restriction"):
            raise ValueError(f"'{policy['name']}' cannot be taken during notice period")

        min_days = float(policy.get("min_days", 0.5))
        if days < min_days:
            raise ValueError(f"Minimum {min_days} day(s) required for '{policy['name']}'")

        max_days = policy.get("max_days")
        if max_days and days > float(max_days):
            raise ValueError(f"Maximum {max_days} day(s) allowed per application for '{policy['name']}'")

        if department and policy.get("applicable_departments"):
            depts = policy["applicable_departments"]
            if depts and department not in depts:
                raise ValueError(f"'{policy['name']}' is not applicable to your department")

    async def _check_balance(
        self, employee_id: str, company_id: str, leave_type: str, days: float
    ) -> None:
        """Raise ValueError if insufficient balance (respects negative_balance policy)."""
        policy = await self._get_policy(leave_type, company_id)
        if policy and policy.get("negative_balance_allowed"):
            return  # Negative balance allowed — skip balance check

        year = date.today().year
        bal = await self.bal.find_one({"employee_id": employee_id, "company_id": company_id, "year": year})
        if not bal:
            return  # First leave this year — no existing balance yet, allow

        field_map = {
            LeaveType.CASUAL: ("casual_total", "casual_used"),
            LeaveType.SICK:   ("sick_total",   "sick_used"),
            LeaveType.EARNED: ("earned_total", "earned_used"),
        }
        if leave_type not in field_map:
            return  # Only check known types

        total_f, used_f = field_map[leave_type]
        available = float(bal.get(total_f, 0)) - float(bal.get(used_f, 0)) - float(bal.get(used_f.replace("used", "pending"), 0))
        if available < days:
            raise ValueError(
                f"Insufficient leave balance. Available: {available:.1f} days, Requested: {days:.1f} days"
            )

    async def _check_overlapping(self, employee_id: str, company_id: str,
                                   from_date: date, to_date: date, exclude_id: Optional[str] = None) -> None:
        """Raise ValueError if an approved/pending leave overlaps the requested period."""
        query = {
            "company_id": company_id,
            "employee_id": employee_id,
            "status": {"$in": [LeaveStatus.PENDING, LeaveStatus.APPROVED]},
            "from_date": {"$lte": to_date.isoformat()},
            "to_date":   {"$gte": from_date.isoformat()},
        }
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        dup = await self.col.find_one(query)
        if dup:
            raise ValueError(
                f"A {dup['status']} leave already exists for {dup['from_date']} – {dup['to_date']}"
            )

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def apply(self, data: dict, employee_id: str, employee_name: str,
                    company_id: str, department: Optional[str] = None,
                    gender: Optional[str] = None) -> dict:
        from_date = data["from_date"]
        to_date   = data["to_date"]
        if isinstance(from_date, str):
            from_date = date.fromisoformat(from_date)
        if isinstance(to_date, str):
            to_date = date.fromisoformat(to_date)
        if from_date > to_date:
            raise ValueError("from_date must not be after to_date")

        duration = data.get("duration", LeaveDuration.FULL_DAY)

        # Compute working days (excludes weekends + holidays)
        days = await self._count_working_days(from_date, to_date, company_id, department, duration)
        if days <= 0:
            raise ValueError("No working days in selected date range (all days are weekends or holidays)")

        # Policy validation
        await self._validate_policy(
            str(data.get("leave_type", "")), days, company_id,
            gender=gender, department=department,
        )

        # Balance check
        await self._check_balance(employee_id, company_id, str(data.get("leave_type", "")), days)

        # Overlap check
        await self._check_overlapping(employee_id, company_id, from_date, to_date)

        now = datetime.now(timezone.utc)
        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": employee_name,
            "total_days": days,
            "status": LeaveStatus.PENDING,
            "from_date": from_date.isoformat(),
            "to_date":   to_date.isoformat(),
            "leave_type": data.get("leave_type"),
            "duration": duration,
            "reason": data.get("reason", ""),
            "attachment_url": data.get("attachment_url"),
            "approver_id": None,
            "approver_name": None,
            "approved_at": None,
            "rejection_reason": None,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(doc)

        # Log audit
        await self.db[self.AUDIT_COL].insert_one({
            "_id": str(ObjectId()),
            "company_id": company_id,
            "module": "leaves",
            "action": "leave_applied",
            "entity_type": "leave",
            "entity_id": doc_id,
            "user_id": employee_id,
            "changes": {"leave_type": str(data.get("leave_type")), "days": days,
                        "from": from_date.isoformat(), "to": to_date.isoformat()},
            "timestamp": now.replace(tzinfo=None),
        })
        return self._serialize(doc)

    async def list(
        self,
        company_id: str,
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id}
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, leave_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": leave_id, "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def approve_reject(
        self,
        leave_id: str,
        action: str,
        approver_id: str,
        approver_name: str,
        company_id: str,
        rejection_reason: Optional[str] = None,
    ) -> Optional[dict]:
        now = datetime.now(timezone.utc)
        new_status = LeaveStatus.APPROVED if action == "approve" else LeaveStatus.REJECTED
        update: dict = {
            "status": new_status,
            "approver_id": approver_id,
            "approver_name": approver_name,
            "approved_at": now,
            "updated_at": now,
        }
        if rejection_reason:
            update["rejection_reason"] = rejection_reason

        leave = await self.col.find_one({"_id": leave_id, "company_id": company_id})
        if not leave:
            return None

        if action == "approve":
            await self._deduct_balance(
                leave["employee_id"], company_id,
                leave.get("leave_type"), float(leave.get("total_days", 1)),
            )

        await self.col.update_one({"_id": leave_id, "company_id": company_id}, {"$set": update})

        # Audit log
        await self.db[self.AUDIT_COL].insert_one({
            "_id": str(ObjectId()),
            "company_id": company_id,
            "module": "leaves",
            "action": f"leave_{action}d",
            "entity_type": "leave",
            "entity_id": leave_id,
            "user_id": approver_id,
            "changes": {"action": action, "rejection_reason": rejection_reason},
            "timestamp": now.replace(tzinfo=None),
        })
        return await self.get(leave_id, company_id)

    async def cancel(self, leave_id: str, employee_id: str, company_id: str) -> Optional[dict]:
        leave = await self.col.find_one({"_id": leave_id, "company_id": company_id})
        if not leave:
            return None
        if leave.get("employee_id") != employee_id:
            raise ValueError("You can only cancel your own leaves")
        if leave.get("status") not in (LeaveStatus.PENDING, LeaveStatus.APPROVED):
            raise ValueError(f"Cannot cancel a {leave.get('status')} leave")
        now = datetime.now(timezone.utc)
        await self.col.update_one(
            {"_id": leave_id},
            {"$set": {"status": LeaveStatus.CANCELLED, "updated_at": now}},
        )
        # Restore balance if was approved
        if leave.get("status") == LeaveStatus.APPROVED:
            await self._restore_balance(
                employee_id, company_id,
                leave.get("leave_type"), float(leave.get("total_days", 1)),
            )
        leave["status"] = LeaveStatus.CANCELLED
        return self._serialize(leave)

    # ── Balance management ────────────────────────────────────────────────────

    async def _deduct_balance(self, emp_id: str, company_id: str, leave_type: str, days: float):
        year = date.today().year
        field_map = {
            LeaveType.CASUAL: "casual_used",
            LeaveType.SICK:   "sick_used",
            LeaveType.EARNED: "earned_used",
        }
        field = field_map.get(leave_type)
        if not field:
            return
        await self.bal.update_one(
            {"employee_id": emp_id, "company_id": company_id, "year": year},
            {"$inc": {field: days}},
            upsert=True,
        )

    async def _restore_balance(self, emp_id: str, company_id: str, leave_type: str, days: float):
        """Restore balance when leave is cancelled after approval."""
        year = date.today().year
        field_map = {
            LeaveType.CASUAL: "casual_used",
            LeaveType.SICK:   "sick_used",
            LeaveType.EARNED: "earned_used",
        }
        field = field_map.get(leave_type)
        if not field:
            return
        await self.bal.update_one(
            {"employee_id": emp_id, "company_id": company_id, "year": year},
            {"$inc": {field: -days}},
        )

    async def get_balance(self, employee_id: str, company_id: str, year: int) -> dict:
        doc = await self.bal.find_one({"employee_id": employee_id, "company_id": company_id, "year": year})
        if doc:
            doc["id"] = str(doc.pop("_id", ""))
            return doc
        return {
            "employee_id": employee_id,
            "year": year,
            "casual_total": 12, "casual_used": 0,
            "sick_total": 12, "sick_used": 0,
            "earned_total": 15, "earned_used": 0,
        }

    async def count_on_leave_today(self, company_id: str) -> int:
        today_str = date.today().isoformat()
        return await self.col.count_documents({
            "company_id": company_id,
            "status": LeaveStatus.APPROVED,
            "from_date": {"$lte": today_str},
            "to_date":   {"$gte": today_str},
        })
