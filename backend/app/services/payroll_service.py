"""HRM — Payroll Service"""
import calendar as _cal
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List, Set
from bson import ObjectId

from app.models.company.payroll import PayrollStatus, DEFAULT_PAYROLL_COMPONENTS

# Map salary_components keys to dedicated Payslip document fields.
# Keys listed here are handled directly; anything else goes to other_earnings / other_deductions.
_EARNING_FIELD_MAP = {
    "basic_salary":    "basic",
    "hra":             "hra",
    "special_allowance": "special_allowance",
    "bonus":           "bonus",
}

_DEDUCTION_FIELD_MAP = {
    "epf_contribution":  "pf_employee",
    "professional_tax":  "professional_tax",
    "loan_deduction":    "advance_deduction",
}

# Leave types that are paid (employee is compensated during these leaves)
_PAID_LEAVE_TYPES: Set[str] = {
    "casual", "sick", "earned", "annual",
    "maternity", "paternity", "comp_off", "compensatory",
    "marriage", "bereavement",
}

# Attendance statuses that count as a present day (1.0 or 0.5)
_PRESENT_STATUSES = {
    "present":    1.0,
    "late":       1.0,
    "wfh":        1.0,
    "hybrid":     1.0,
    "field_work": 1.0,
    "auto_closed": 1.0,
    "half_day":   0.5,
    "holiday":    1.0,  # worked on a public holiday → counts as present for salary
}


class PayrollStructureService:
    COL = "hrm_payroll_structure"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    async def get_or_create(self, company_id: str) -> dict:
        doc = await self.col.find_one({"company_id": company_id})
        if doc:
            return self._serialize(doc)
        now = datetime.now(timezone.utc)
        new_doc = {
            "_id": company_id,
            "company_id": company_id,
            "components": DEFAULT_PAYROLL_COMPONENTS,
            "is_configured": False,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(new_doc)
        return self._serialize(new_doc)

    async def upsert(self, company_id: str, components: list) -> dict:
        """Save the full component list (all defaults + customs, with is_selected flags)."""
        now = datetime.now(timezone.utc)
        await self.col.update_one(
            {"company_id": company_id},
            {"$set": {"components": components, "is_configured": True, "updated_at": now}},
            upsert=True,
        )
        doc = await self.col.find_one({"company_id": company_id})
        return self._serialize(doc) if doc else {}


class PayrollService:
    COL = "hrm_payslips"
    EMP_COL = "hrm_employees"
    ATT_COL = "hrm_attendance"
    LEAVE_COL = "hrm_leaves"
    HOLIDAY_COL = "hrm_holidays"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    @staticmethod
    def _format_date(d) -> str:
        if not d:
            return ""
        if isinstance(d, str):
            return d[:10]
        try:
            return d.strftime("%d-%b-%Y")
        except Exception:
            return str(d)

    @staticmethod
    def _to_date(value) -> Optional[date]:
        """Coerce a datetime or date to a date object."""
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return None

    @staticmethod
    def _calc_working_days(
        year: int,
        month: int,
        holiday_date_strings: Set[str],
        working_day_nums: Optional[Set[int]] = None,
    ) -> int:
        """Count working days in the month, skipping off-days and holidays.

        working_day_nums: Python weekdays that ARE working (0=Mon…6=Sun).
        Defaults to Mon-Fri (0-4) when None or empty.
        """
        if not working_day_nums:
            working_day_nums = {0, 1, 2, 3, 4}
        _, days_in_month = _cal.monthrange(year, month)
        working = 0
        for day in range(1, days_in_month + 1):
            d = date(year, month, day)
            if d.weekday() not in working_day_nums:
                continue
            if d.strftime("%Y-%m-%d") in holiday_date_strings:
                continue
            working += 1
        return max(1, working)         # always at least 1 to avoid division by zero

    @staticmethod
    def _calc_present_days(att_records: List[dict]) -> float:
        """Count present days from attendance documents (half_day = 0.5).

        "holiday" status records exist both for employees who WORKED on a
        holiday (check_in set) and as auto-marked placeholders for everyone
        else (check_in None). Only the former counts as a present day —
        counting placeholders inflated payable days and masked real absences.
        """
        total = 0.0
        for rec in att_records:
            status = rec.get("status", "")
            if status == "holiday" and not rec.get("check_in"):
                continue
            total += _PRESENT_STATUSES.get(status, 0.0)
        return total

    @staticmethod
    def _calc_paid_leave_days(
        leave_records: List[dict],
        year: int,
        month: int,
        holiday_date_strings: Set[str],
        working_day_nums: Optional[Set[int]] = None,
        present_date_strings: Optional[Set[str]] = None,
    ) -> float:
        """
        Count approved paid leave days that fall within the given month,
        excluding tenant non-working days and company holidays (must use the
        same working-day set as _calc_working_days or payable days get inflated).

        present_date_strings: days the employee actually attended — excluded so a
        day cannot count as BOTH present and paid leave (double payable credit).
        """
        if not working_day_nums:
            working_day_nums = {0, 1, 2, 3, 4}
        present_date_strings = present_date_strings or set()
        _, last_day = _cal.monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        total = 0.0
        for leave in leave_records:
            leave_type = leave.get("leave_type", "")
            if leave_type not in _PAID_LEAVE_TYPES:
                continue

            fd = PayrollService._to_date(leave.get("from_date"))
            td = PayrollService._to_date(leave.get("to_date"))
            if not fd or not td:
                continue

            overlap_start = max(fd, month_start)
            overlap_end = min(td, month_end)
            if overlap_end < overlap_start:
                continue

            duration = leave.get("duration", "full_day")
            multiplier = 0.5 if "half_day" in (duration or "") else 1.0

            current = overlap_start
            while current <= overlap_end:
                day_str = current.strftime("%Y-%m-%d")
                if (current.weekday() in working_day_nums
                        and day_str not in holiday_date_strings
                        and day_str not in present_date_strings):
                    total += multiplier
                current += timedelta(days=1)

        return total

    @staticmethod
    def _calc_from_salary_components(
        salary_components: dict,
        deduction_keys: Set[str],
        key_to_label: dict,
    ) -> dict:
        """
        Convert the employee's salary_components dict into payslip fields.

        Standard keys map via _EARNING_FIELD_MAP / _DEDUCTION_FIELD_MAP.
        All others go to other_earnings / other_deductions with key stored
        for frontend visibility lookup.
        """
        basic = hra = special_allowance = bonus = 0.0
        pf_employee = professional_tax = advance_deduction = 0.0
        other_earnings: List[dict] = []
        other_deductions: List[dict] = []

        for key, raw_amount in salary_components.items():
            amount = float(raw_amount or 0)
            if amount == 0:
                continue

            if key in deduction_keys:
                field = _DEDUCTION_FIELD_MAP.get(key)
                if field == "pf_employee":
                    pf_employee = amount
                elif field == "professional_tax":
                    professional_tax = amount
                elif field == "advance_deduction":
                    advance_deduction = amount
                else:
                    other_deductions.append({
                        "key":    key,
                        "name":   key_to_label.get(key, key),
                        "amount": amount,
                    })
            else:
                field = _EARNING_FIELD_MAP.get(key)
                if field == "basic":
                    basic = amount
                elif field == "hra":
                    hra = amount
                elif field == "special_allowance":
                    special_allowance = amount
                elif field == "bonus":
                    bonus = amount
                else:
                    other_earnings.append({
                        "key":    key,
                        "name":   key_to_label.get(key, key),
                        "amount": amount,
                    })

        gross_earnings = round(
            basic + hra + special_allowance + bonus +
            sum(e["amount"] for e in other_earnings),
            2,
        )
        # Statutory deductions only (LOP is added separately after attendance calc)
        statutory_deductions = round(
            pf_employee + professional_tax + advance_deduction +
            sum(d["amount"] for d in other_deductions),
            2,
        )

        return {
            "basic":                basic,
            "hra":                  hra,
            "special_allowance":    special_allowance,
            "bonus":                bonus,
            "other_earnings":       other_earnings,
            "pf_employee":          pf_employee,
            "professional_tax":     professional_tax,
            "advance_deduction":    advance_deduction,
            "other_deductions":     other_deductions,
            "gross_earnings":       gross_earnings,
            "_statutory_deductions": statutory_deductions,
        }

    @staticmethod
    def _calc_expected_days(
        year: int,
        month: int,
        holiday_date_strings: Set[str],
        working_day_nums: Optional[Set[int]],
        doj: Optional[date],
        dol: Optional[date],
    ) -> Optional[int]:
        """Working days the employee was actually expected to work this month,
        clamped to [date_of_joining, date_of_leaving]. Returns None when the
        full month applies (no clamping needed)."""
        _, last_day = _cal.monthrange(year, month)
        month_start = date(year, month, 1)
        month_end = date(year, month, last_day)

        start = month_start if not doj or doj <= month_start else doj
        end = month_end if not dol or dol >= month_end else dol
        if start == month_start and end == month_end:
            return None
        if end < start:
            return 0

        if not working_day_nums:
            working_day_nums = {0, 1, 2, 3, 4}
        expected = 0
        current = start
        while current <= end:
            if current.weekday() in working_day_nums and current.strftime("%Y-%m-%d") not in holiday_date_strings:
                expected += 1
            current += timedelta(days=1)
        return expected

    @staticmethod
    def _apply_attendance(
        salary_dict: dict,
        working_days: int,
        present_days: float,
        paid_leave_days: float,
        expected_days: Optional[int] = None,
    ) -> dict:
        """
        Compute LOP deduction and final net from attendance data.

        payable_days = present_days + paid_leave_days
        lop_days     = max(0, expected_days - payable_days)
        lop_deduction = round(gross / working_days * lop_days, 2)
        net_salary    = gross - lop_deduction - statutory_deductions

        expected_days defaults to the full month's working days; it is lower
        when the employee joined or left mid-month, plus the days before
        joining / after leaving are themselves unpaid (LOP).
        """
        gross = salary_dict["gross_earnings"]
        statutory = salary_dict.pop("_statutory_deductions", 0.0)

        target_days = working_days if expected_days is None else expected_days
        # Days outside the employment window are unpaid too
        out_of_window = max(0, working_days - target_days)
        payable_days = present_days + paid_leave_days
        lop_days = max(0.0, round(target_days - payable_days, 4)) + out_of_window
        per_day = gross / working_days if working_days > 0 else 0.0
        lop_deduction = round(per_day * lop_days, 2)

        total_deductions = round(statutory + lop_deduction, 2)
        net_salary = round(gross - total_deductions, 2)
        absent_days = max(0.0, lop_days - 0.0)   # absent = LOP days

        return {
            **salary_dict,
            "working_days":    working_days,
            "present_days":    round(present_days, 2),
            "paid_leave_days": round(paid_leave_days, 2),
            "absent_days":     round(absent_days, 2),
            "leave_days":      round(paid_leave_days, 2),
            "lop_days":        round(lop_days, 2),
            "lop_deduction":   lop_deduction,
            "total_deductions": total_deductions,
            "net_salary":      net_salary,
        }

    async def _fetch_holiday_dates(self, company_id: str, year: int, month: int) -> Set[str]:
        """Return a set of YYYY-MM-DD strings for active holidays in the given month."""
        _, last_day = _cal.monthrange(year, month)
        month_str = f"{year}-{month:02d}"
        cursor = self.db[self.HOLIDAY_COL].find({
            "company_id": company_id,
            "is_active": True,
            "is_deleted": {"$ne": True},
            "date": {"$regex": f"^{month_str}"},
        })
        holidays = set()
        async for h in cursor:
            d = h.get("date", "")
            if d:
                holidays.add(d[:10])
        return holidays

    async def _fetch_attendance(self, company_id: str, employee_id: str, year: int, month: int) -> List[dict]:
        """Return attendance records for the employee in the given month."""
        _, last_day = _cal.monthrange(year, month)
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        month_end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        cursor = self.db[self.ATT_COL].find({
            "company_id": company_id,
            "employee_id": employee_id,
            "date": {"$gte": month_start, "$lte": month_end},
        })
        return [rec async for rec in cursor]

    async def _fetch_approved_leaves(self, company_id: str, employee_id: str, year: int, month: int) -> List[dict]:
        """Return approved leave applications overlapping the given month."""
        _, last_day = _cal.monthrange(year, month)
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        month_end = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        cursor = self.db[self.LEAVE_COL].find({
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "approved",
            "from_date": {"$lte": month_end},
            "to_date":   {"$gte": month_start},
        })
        return [rec async for rec in cursor]

    async def _batch_fetch_attendance(
        self, company_id: str, emp_ids: List[str], year: int, month: int
    ) -> dict:
        """Return {employee_id: [records]} for ALL employees in one query."""
        _, last_day = _cal.monthrange(year, month)
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        month_end   = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        by_emp: dict = {eid: [] for eid in emp_ids}
        async for rec in self.db[self.ATT_COL].find({
            "company_id": company_id,
            "employee_id": {"$in": emp_ids},
            "date": {"$gte": month_start, "$lte": month_end},
        }):
            eid = rec.get("employee_id", "")
            if eid in by_emp:
                by_emp[eid].append(rec)
        return by_emp

    async def _batch_fetch_leaves(
        self, company_id: str, emp_ids: List[str], year: int, month: int
    ) -> dict:
        """Return {employee_id: [records]} for ALL employees in one query."""
        _, last_day = _cal.monthrange(year, month)
        month_start = datetime(year, month, 1, tzinfo=timezone.utc)
        month_end   = datetime(year, month, last_day, 23, 59, 59, tzinfo=timezone.utc)
        by_emp: dict = {eid: [] for eid in emp_ids}
        async for rec in self.db[self.LEAVE_COL].find({
            "company_id": company_id,
            "employee_id": {"$in": emp_ids},
            "status": "approved",
            "from_date": {"$lte": month_end},
            "to_date":   {"$gte": month_start},
        }):
            eid = rec.get("employee_id", "")
            if eid in by_emp:
                by_emp[eid].append(rec)
        return by_emp

    async def generate(
        self,
        company_id: str,
        month: int,
        year: int,
        employee_ids: Optional[List[str]],
        generated_by: str,
    ) -> List[dict]:
        emp_query: dict = {
            "company_id": company_id,
            "is_deleted": False,
            "employment_status": "active",
        }
        if employee_ids:
            emp_query["_id"] = {"$in": employee_ids}

        # ── Load all qualifying employees at once ──────────────────────────────
        employees = await self.db[self.EMP_COL].find(emp_query).to_list(length=None)
        if not employees:
            return []
        all_emp_ids = [str(e["_id"]) for e in employees]

        # ── Shared reference data (one fetch each) ─────────────────────────────
        structure_doc = await self.db["hrm_payroll_structure"].find_one({"company_id": company_id})
        all_components   = structure_doc.get("components", []) if structure_doc else []
        active_components = [c for c in all_components if c.get("is_selected", True)]
        deduction_keys: Set[str] = {
            c["key"] for c in active_components if c.get("component_type") == "deduction"
        }
        key_to_label = {c["key"]: c["label"] for c in all_components}

        holiday_dates = await self._fetch_holiday_dates(company_id, year, month)
        settings_doc  = await self.db["company_settings"].find_one({})
        raw_wd = settings_doc.get("working_days") if settings_doc else None
        tenant_working_days: Optional[Set[int]] = set(raw_wd) if raw_wd else None
        working_days = self._calc_working_days(year, month, holiday_dates, tenant_working_days)

        # ── Batch-fetch the three per-employee collections ─────────────────────
        existing_map: dict = {}
        async for ps in self.col.find({
            "company_id": company_id,
            "month": month,
            "year":  year,
            "employee_id": {"$in": all_emp_ids},
        }):
            existing_map[ps["employee_id"]] = ps

        att_map   = await self._batch_fetch_attendance(company_id, all_emp_ids, year, month)
        leave_map = await self._batch_fetch_leaves(company_id, all_emp_ids, year, month)

        now = datetime.now(timezone.utc)
        results: List[dict] = []
        docs_to_insert: List[dict] = []

        for emp in employees:
            emp_id = str(emp["_id"])

            # Already generated — return existing payslip
            if emp_id in existing_map:
                results.append(self._serialize(existing_map[emp_id]))
                continue

            # ── Salary components → payslip fields ────────────────────────────
            salary_components = emp.get("salary_components") or {}
            if salary_components:
                salary_dict = self._calc_from_salary_components(
                    salary_components, deduction_keys, key_to_label
                )
            else:
                sal = emp.get("salary") or {}
                if isinstance(sal, dict):
                    basic             = float(sal.get("basic", 0) or 0)
                    hra               = float(sal.get("hra",   0) or 0)
                    special_allowance = float(sal.get("special_allowance", 0) or 0)
                    pf_emp            = float(sal.get("pf_employee", 0) or 0)
                    pt                = float(sal.get("professional_tax", 0) or 0)
                else:
                    basic = hra = special_allowance = pf_emp = pt = 0.0
                gross_earnings = round(basic + hra + special_allowance, 2)
                salary_dict = {
                    "basic":             basic,
                    "hra":               hra,
                    "special_allowance": special_allowance,
                    "bonus":             0.0,
                    "other_earnings":    [],
                    "pf_employee":       pf_emp,
                    "professional_tax":  pt,
                    "advance_deduction": 0.0,
                    "other_deductions":  [],
                    "gross_earnings":    gross_earnings,
                    "_statutory_deductions": round(pf_emp + pt, 2),
                }

            # ── Attendance + leave (in-memory, no extra DB calls) ──────────────
            att_records   = att_map.get(emp_id, [])
            leave_records = leave_map.get(emp_id, [])

            # Days actually attended — a day must not count as both present and paid leave
            present_dates: Set[str] = set()
            for rec in att_records:
                if rec.get("check_in") or _PRESENT_STATUSES.get(rec.get("status", ""), 0.0) > 0:
                    d = self._to_date(rec.get("date"))
                    if d:
                        present_dates.add(d.strftime("%Y-%m-%d"))

            paid_leave_days = self._calc_paid_leave_days(
                leave_records, year, month, holiday_dates, tenant_working_days, present_dates
            )

            # Prorate for mid-month joiners / leavers
            expected_days = self._calc_expected_days(
                year, month, holiday_dates, tenant_working_days,
                self._to_date(emp.get("date_of_joining")),
                self._to_date(emp.get("date_of_leaving")),
            )

            if att_records:
                present_days = self._calc_present_days(att_records)
            else:
                target = float(working_days if expected_days is None else expected_days)
                present_days = max(0.0, target - paid_leave_days)

            att_dict = self._apply_attendance(
                salary_dict, working_days, present_days, paid_leave_days, expected_days
            )

            doc = {
                "_id":                  str(ObjectId()),
                "company_id":           company_id,
                "employee_id":          emp_id,
                "employee_name":        emp.get("full_name", ""),
                "employee_code":        emp.get("employee_id", ""),
                "employee_department":  emp.get("department_name", "") or "",
                "employee_designation": emp.get("designation_name", "") or "",
                "employee_doj":         self._format_date(emp.get("date_of_joining")),
                "employee_pf_number":   emp.get("pf_number", "") or "",
                "employee_uan_number":  emp.get("uan_number", "") or "",
                "month": month,
                "year":  year,
                **att_dict,
                "overtime": 0.0,
                "tds":      0.0,
                "status":        PayrollStatus.DRAFT,
                "generated_by":  generated_by,
                "created_at":    now,
                "updated_at":    now,
            }
            docs_to_insert.append(doc)
            results.append(self._serialize(doc))

        # ── Bulk insert all new payslips in one round-trip ─────────────────────
        if docs_to_insert:
            await self.col.insert_many(docs_to_insert, ordered=False)

        return results

    async def list(
        self,
        company_id: str,
        month: Optional[int],
        year: Optional[int],
        employee_id: Optional[str],
        status: Optional[str],
        page: int,
        page_size: int,
    ) -> dict:
        query: dict = {"company_id": company_id}
        if month:
            query["month"] = month
        if year:
            query["year"] = year
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort([("year", -1), ("month", -1)]).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, payslip_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": payslip_id, "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def update_status(
        self,
        payslip_id: str,
        company_id: str,
        status: str,
        payment_reference: Optional[str],
        paid_on: Optional[datetime],
    ) -> Optional[dict]:
        from fastapi import HTTPException
        valid_statuses = {s.value for s in PayrollStatus}
        if status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid payroll status '{status}'")

        existing = await self.col.find_one(
            {"_id": payslip_id, "company_id": company_id}, {"status": 1}
        )
        if not existing:
            return None
        # Paid payslips are locked — money has moved; no further status changes
        if existing.get("status") == PayrollStatus.PAID.value and status != PayrollStatus.PAID.value:
            raise HTTPException(status_code=400, detail="A paid payslip is locked and cannot change status.")

        now = datetime.now(timezone.utc)
        upd: dict = {"status": status, "updated_at": now}
        if payment_reference:
            upd["payment_reference"] = payment_reference
        if paid_on:
            upd["paid_on"] = paid_on
        elif status == PayrollStatus.PAID:
            upd["paid_on"] = now
        await self.col.update_one(
            {"_id": payslip_id, "company_id": company_id}, {"$set": upd}
        )
        return await self.get(payslip_id, company_id)

    async def update_payslip(
        self, payslip_id: str, company_id: str, data: dict
    ) -> Optional[dict]:
        """Update payslip fields and auto-recalculate gross / LOP / net."""
        existing = await self.get(payslip_id, company_id)
        if existing and existing.get("status") == PayrollStatus.PAID.value:
            from fastapi import HTTPException
            raise HTTPException(
                status_code=400,
                detail="A paid payslip is locked and cannot be edited."
            )
        if existing:
            merged = {**existing}
            for k, v in data.items():
                if v is not None:
                    merged[k] = v

            def _f(k):
                return float(merged.get(k, 0) or 0)

            def _list_sum(key):
                return sum(
                    float(item["amount"] if isinstance(item, dict) else 0)
                    for item in (merged.get(key) or [])
                )

            gross = round(
                _f("basic") + _f("hra") + _f("special_allowance") +
                _f("overtime") + _f("bonus") + _list_sum("other_earnings"),
                2,
            )
            # Recalculate LOP deduction from updated working/lop days
            working_days = max(1, int(_f("working_days") or 26))
            lop_days = _f("lop_days")
            lop_deduction = round(gross / working_days * lop_days, 2) if working_days > 0 else 0.0

            statutory = round(
                _f("pf_employee") + _f("professional_tax") +
                _f("tds") + _f("advance_deduction") + _list_sum("other_deductions"),
                2,
            )
            total_ded = round(statutory + lop_deduction, 2)

            data["gross_earnings"]   = gross
            data["lop_deduction"]    = lop_deduction
            data["total_deductions"] = total_ded
            data["net_salary"]       = round(gross - total_ded, 2)

        data["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one(
            {"_id": payslip_id, "company_id": company_id}, {"$set": data}
        )
        return await self.get(payslip_id, company_id)

    async def delete(self, payslip_id: str, company_id: str) -> bool:
        result = await self.col.delete_one(
            {"_id": payslip_id, "company_id": company_id, "status": PayrollStatus.DRAFT}
        )
        return result.deleted_count > 0
