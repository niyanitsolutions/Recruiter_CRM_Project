"""HRM — Leave Service (enhanced: holiday overlap, weekend exclusion, policy validation)"""
import logging
from datetime import datetime, timezone, date, timedelta
from typing import Optional, List
from bson import ObjectId
import math

from app.models.company.leave import LeaveStatus, LeaveType, LeaveDuration

logger = logging.getLogger(__name__)


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

    # ── Settings loader ───────────────────────────────────────────────────────

    async def _get_working_days(self, company_id: str) -> list:
        """Return tenant working-day indices (0=Mon…6=Sun) from company_settings.
        Falls back to Mon-Fri [0,1,2,3,4] if not configured."""
        doc = await self.db["company_settings"].find_one({}) or {}
        wd = doc.get("attendance_working_days")
        if wd and isinstance(wd, list):
            return wd
        return [0, 1, 2, 3, 4]

    # ── Working-day calculation ───────────────────────────────────────────────

    async def _count_working_days(
        self, from_date: date, to_date: date, company_id: str,
        department: Optional[str] = None, duration: Optional[str] = None,
        working_days: Optional[list] = None,
    ) -> float:
        """Count actual working days: excludes tenant non-working days and company holidays."""
        if duration in (LeaveDuration.HALF_DAY_MORNING, LeaveDuration.HALF_DAY_AFTERNOON,
                         "half_day_morning", "half_day_afternoon"):
            return 0.5

        # Use tenant-configured working days; fall back to Mon-Fri for backward compat
        if working_days is None:
            working_days = await self._get_working_days(company_id)

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
            if current.weekday() in working_days:
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
        """Raise ValueError if insufficient balance (policy-driven, all leave types)."""
        policy = await self._get_policy(leave_type, company_id)
        if not policy:
            return  # No policy configured — allow

        if policy.get("negative_balance_allowed"):
            return  # Negative balance explicitly permitted

        allocated = float(policy.get("annual_allocation", 0))
        if allocated <= 0:
            return  # Zero allocation means unlimited / not tracked

        year = date.today().year
        year_start = f"{year}-01-01"
        year_end   = f"{year}-12-31"

        used_agg = await self.col.aggregate([
            {"$match": {
                "company_id": company_id, "employee_id": employee_id,
                "leave_type": str(leave_type), "status": LeaveStatus.APPROVED.value,
                "from_date": {"$gte": year_start}, "to_date": {"$lte": year_end},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_days"}}},
        ]).to_list(1)
        used = float(used_agg[0]["total"]) if used_agg else 0.0

        pend_agg = await self.col.aggregate([
            {"$match": {
                "company_id": company_id, "employee_id": employee_id,
                "leave_type": str(leave_type), "status": LeaveStatus.PENDING.value,
                "from_date": {"$gte": year_start}, "to_date": {"$lte": year_end},
            }},
            {"$group": {"_id": None, "total": {"$sum": "$total_days"}}},
        ]).to_list(1)
        pending = float(pend_agg[0]["total"]) if pend_agg else 0.0

        available = allocated - used - pending
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
            "status": {"$in": [LeaveStatus.PENDING.value, LeaveStatus.APPROVED.value]},
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

    @staticmethod
    def _enum_val(v) -> str:
        """Return plain string from an enum value or plain string."""
        return v.value if hasattr(v, "value") else str(v)

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

        # Normalise enum → plain string so all subsequent lookups use "casual" not "LeaveType.CASUAL"
        leave_type = self._enum_val(data.get("leave_type", ""))
        duration   = self._enum_val(data.get("duration", LeaveDuration.FULL_DAY.value))

        # Compute working days (excludes weekends + holidays)
        days = await self._count_working_days(from_date, to_date, company_id, department, duration)
        if days <= 0:
            raise ValueError("No working days in selected date range (all days are weekends or holidays)")

        # Policy validation
        await self._validate_policy(leave_type, days, company_id, gender=gender, department=department)

        # Balance check
        await self._check_balance(employee_id, company_id, leave_type, days)

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
            "status": LeaveStatus.PENDING.value,
            "from_date": from_date.isoformat(),
            "to_date":   to_date.isoformat(),
            "leave_type": leave_type,
            "duration":   duration,
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
            "changes": {"leave_type": leave_type, "days": days,
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
            # Create attendance placeholder records for each working day of the leave.
            # Runs after deduct_balance so the leave is logically committed first.
            try:
                leave_for_attendance = {**leave, "id": leave_id}
                await self.create_attendance_for_leave(leave_for_attendance, company_id)
            except Exception as exc:
                logger.warning("create_attendance_for_leave failed for leave %s: %s", leave_id, exc)

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
            # Remove attendance placeholder records created for this leave
            try:
                await self.remove_attendance_for_leave(leave_id, company_id)
            except Exception as exc:
                logger.warning("remove_attendance_for_leave failed for leave %s: %s", leave_id, exc)

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
        """Legacy single-doc balance (kept for backward compat). Prefer get_policy_balances()."""
        doc = await self.bal.find_one({"employee_id": employee_id, "company_id": company_id, "year": year})
        if doc:
            doc["id"] = str(doc.pop("_id", ""))
            return doc
        # Fall back to policy-seeded values for casual/sick/earned
        casual_pol  = await self._get_policy("casual", company_id)
        sick_pol    = await self._get_policy("sick", company_id)
        earned_pol  = await self._get_policy("earned", company_id)
        return {
            "employee_id": employee_id,
            "year": year,
            "casual_total":  float(casual_pol["annual_allocation"]) if casual_pol else 12.0,
            "casual_used":   0,
            "sick_total":    float(sick_pol["annual_allocation"]) if sick_pol else 12.0,
            "sick_used":     0,
            "earned_total":  float(earned_pol["annual_allocation"]) if earned_pol else 15.0,
            "earned_used":   0,
        }

    async def get_policy_balances(self, employee_id: str, company_id: str, year: int) -> list:
        """Return per-policy balance computed from actual leave applications.

        Pulls annual_allocation from each active policy and computes
        used/pending from real leave records — no separate balance table needed.
        """
        policies = await self.db[self.POL_COL].find(
            {"company_id": company_id, "is_active": True, "is_deleted": False}
        ).sort("name", 1).to_list(None)

        year_start = f"{year}-01-01"
        year_end   = f"{year}-12-31"

        result = []
        for pol in policies:
            lt        = str(pol.get("leave_type", ""))
            allocated = float(pol.get("annual_allocation", 0))

            used_agg = await self.col.aggregate([
                {"$match": {
                    "company_id": company_id, "employee_id": employee_id,
                    "leave_type": lt, "status": LeaveStatus.APPROVED.value,
                    "from_date": {"$gte": year_start}, "to_date": {"$lte": year_end},
                }},
                {"$group": {"_id": None, "total": {"$sum": "$total_days"}}},
            ]).to_list(1)
            used = float(used_agg[0]["total"]) if used_agg else 0.0

            pend_agg = await self.col.aggregate([
                {"$match": {
                    "company_id": company_id, "employee_id": employee_id,
                    "leave_type": lt, "status": LeaveStatus.PENDING.value,
                    "from_date": {"$gte": year_start}, "to_date": {"$lte": year_end},
                }},
                {"$group": {"_id": None, "total": {"$sum": "$total_days"}}},
            ]).to_list(1)
            pending = float(pend_agg[0]["total"]) if pend_agg else 0.0

            result.append({
                "policy_id":  str(pol.get("_id", "")),
                "leave_type": lt,
                "name":       pol.get("name", lt.replace("_", " ").title()),
                "code":       pol.get("code", ""),
                "color":      pol.get("color", "#3b82f6"),
                "allocated":  allocated,
                "used":       round(used, 2),
                "pending":    round(pending, 2),
                "remaining":  round(max(0.0, allocated - used - pending), 2),
                "negative_balance_allowed": bool(pol.get("negative_balance_allowed", False)),
            })
        return result

    # ── Attendance integration ────────────────────────────────────────────────

    async def create_attendance_for_leave(self, leave: dict, company_id: str) -> int:
        """Create placeholder attendance records for each working day of an approved leave.

        Skips days where the employee already has an attendance record with check_in
        set (they came to work — their actual attendance takes priority).
        Idempotent: safe to call multiple times for the same leave.
        """
        from_date_str = leave.get("from_date", "")
        to_date_str   = leave.get("to_date", "")
        if not from_date_str or not to_date_str:
            return 0

        from_date = date.fromisoformat(from_date_str) if isinstance(from_date_str, str) else from_date_str
        to_date   = date.fromisoformat(to_date_str)   if isinstance(to_date_str,   str) else to_date_str

        employee_id   = leave.get("employee_id", "")
        leave_id      = str(leave.get("id") or leave.get("_id") or "")
        working_days  = await self._get_working_days(company_id)
        employee_name = leave.get("employee_name", "")
        leave_type    = leave.get("leave_type", "")

        # Get employee department for department-specific holiday filtering
        emp_doc = await self.db["hrm_employees"].find_one(
            {"_id": employee_id, "company_id": company_id, "is_deleted": False},
            {"department": 1},
        )
        dept = emp_doc.get("department") if emp_doc else None

        # Collect holiday dates in the leave range
        holiday_dates: set = set()
        cursor = self.db[self.HOL_COL].find({
            "company_id": company_id,
            "date": {"$gte": from_date_str, "$lte": to_date_str},
            "is_active": True,
            "is_deleted": False,
        })
        async for h in cursor:
            depts = h.get("applicable_departments", [])
            if not depts or (dept and dept in depts):
                holiday_dates.add(h["date"])

        now = datetime.now(timezone.utc).replace(tzinfo=None)
        count = 0
        current = from_date

        while current <= to_date:
            # Skip non-working days (tenant-configured) and holidays
            if current.weekday() not in working_days or current.isoformat() in holiday_dates:
                current += timedelta(days=1)
                continue

            day_dt = datetime(current.year, current.month, current.day)

            existing = await self.db["hrm_attendance"].find_one({
                "employee_id": employee_id,
                "company_id": company_id,
                "date": day_dt,
            })

            if existing and existing.get("check_in"):
                # Employee worked this day — don't overwrite actual attendance
                current += timedelta(days=1)
                continue

            if (existing
                    and existing.get("status") == "on_leave"
                    and existing.get("leave_id") == leave_id):
                # Already a placeholder for this exact leave — idempotent skip
                current += timedelta(days=1)
                continue

            leave_attendance = {
                "company_id":          company_id,
                "employee_id":         employee_id,
                "employee_name":       employee_name,
                "date":                day_dt,
                "status":              "on_leave",
                "leave_id":            leave_id,
                "leave_type":          leave_type,
                "check_in":            None,
                "check_out":           None,
                "work_mode":           "office",
                "breaks":              [],
                "total_break_minutes": 0.0,
                "work_hours":          0.0,
                "is_late":             False,
                "late_by_minutes":     0,
                "is_half_day":         False,
                "overtime_hours":      0.0,
                "auto_punched_out":    False,
                "notes":               f"Approved {leave_type.replace('_', ' ')} leave",
                "marked_by":           "system",
                "created_at":          now,
                "updated_at":          now,
            }

            if existing:
                # Update existing placeholder without check_in
                await self.db["hrm_attendance"].update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "status":    "on_leave",
                        "leave_id":  leave_id,
                        "leave_type": leave_type,
                        "notes":     leave_attendance["notes"],
                        "marked_by": "system",
                        "updated_at": now,
                    }},
                )
            else:
                leave_attendance["_id"] = str(ObjectId())
                await self.db["hrm_attendance"].insert_one(leave_attendance)

            count += 1
            current += timedelta(days=1)

        return count

    async def remove_attendance_for_leave(self, leave_id: str, company_id: str) -> int:
        """Delete attendance placeholder records created for a cancelled/rejected leave.

        Only removes records where check_in is None (employee didn't actually work).
        Records where the employee came to work despite having leave are preserved.
        """
        result = await self.db["hrm_attendance"].delete_many({
            "company_id": company_id,
            "leave_id":   leave_id,
            "check_in":   None,
        })
        return result.deleted_count

    async def count_on_leave_today(self, company_id: str) -> int:
        today_str = date.today().isoformat()
        return await self.col.count_documents({
            "company_id": company_id,
            "status": LeaveStatus.APPROVED,
            "from_date": {"$lte": today_str},
            "to_date":   {"$gte": today_str},
        })
