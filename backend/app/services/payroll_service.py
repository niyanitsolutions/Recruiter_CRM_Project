"""HRM — Payroll Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.payroll import PayrollStatus, DEFAULT_PAYROLL_COMPONENTS

# Map salary_components keys to their dedicated Payslip document fields.
# Keys listed here are handled directly; anything else goes to other_earnings / other_deductions.
_EARNING_FIELD_MAP = {
    "basic_salary":    "basic",
    "hra":             "hra",
    "special_allowance": "special_allowance",
    "bonus":           "bonus",
    # overtime and tds are post-generation adjustments — not in salary_components
}

_DEDUCTION_FIELD_MAP = {
    "epf_contribution":  "pf_employee",
    "professional_tax":  "professional_tax",
    "loan_deduction":    "advance_deduction",
    # tds is a post-generation adjustment
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
        # First time — create with all defaults; basic_salary/hra/epf/pt pre-selected
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
    def _calc_from_salary_components(salary_components: dict, deduction_keys: set, key_to_label: dict) -> dict:
        """
        Convert the employee's salary_components dict into the payslip fields.

        Standard keys map to dedicated payslip fields via _EARNING_FIELD_MAP / _DEDUCTION_FIELD_MAP.
        All other (allowance/custom) keys go into other_earnings / other_deductions with their
        component label and key stored for frontend visibility lookup.

        Returns a dict ready to spread into the payslip document.
        """
        # Dedicated earning fields (accumulate — supports future multi-entry)
        basic = hra = special_allowance = bonus = 0.0
        # Dedicated deduction fields
        pf_employee = professional_tax = advance_deduction = 0.0
        # Dynamic lists
        other_earnings: List[dict] = []
        other_deductions: List[dict] = []

        for key, raw_amount in salary_components.items():
            amount = float(raw_amount or 0)
            if amount == 0:
                continue

            if key in deduction_keys:
                # Map to dedicated field or other_deductions
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
                # Map to dedicated earning field or other_earnings
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
        total_deductions = round(
            pf_employee + professional_tax + advance_deduction +
            sum(d["amount"] for d in other_deductions),
            2,
        )
        net_salary = round(gross_earnings - total_deductions, 2)

        return {
            "basic":              basic,
            "hra":                hra,
            "special_allowance":  special_allowance,
            "bonus":              bonus,
            "other_earnings":     other_earnings,
            "pf_employee":        pf_employee,
            "professional_tax":   professional_tax,
            "advance_deduction":  advance_deduction,
            "other_deductions":   other_deductions,
            "gross_earnings":     gross_earnings,
            "total_deductions":   total_deductions,
            "net_salary":         net_salary,
        }

    async def generate(
        self,
        company_id: str,
        month: int,
        year: int,
        employee_ids: Optional[List[str]],
        generated_by: str,
    ) -> List[dict]:
        query: dict = {
            "company_id": company_id,
            "is_deleted": False,
            "employment_status": "active",
        }
        if employee_ids:
            query["_id"] = {"$in": employee_ids}
        cursor = self.db[self.EMP_COL].find(query)

        # Load structure to resolve labels and types for each component key
        structure_doc = await self.db["hrm_payroll_structure"].find_one({"company_id": company_id})
        all_components = structure_doc.get("components", []) if structure_doc else []

        # Only is_selected components are "active" for this tenant
        active_components = [c for c in all_components if c.get("is_selected", True)]
        deduction_keys = {c["key"] for c in active_components if c.get("component_type") == "deduction"}
        # key → human label (from full pool so labels for deselected components are available too)
        key_to_label = {c["key"]: c["label"] for c in all_components}

        now = datetime.now(timezone.utc)
        results = []

        async for emp in cursor:
            emp_id = str(emp["_id"])

            # Skip if payslip already exists for this month/year
            existing = await self.col.find_one({
                "employee_id": emp_id,
                "company_id": company_id,
                "month": month,
                "year": year,
            })
            if existing:
                results.append(self._serialize(existing))
                continue

            # ── Resolve salary data ────────────────────────────────────────────
            salary_components = emp.get("salary_components") or {}

            if salary_components:
                # Primary path: use per-component values stored on the employee
                salary_comps_dict = self._calc_from_salary_components(
                    salary_components, deduction_keys, key_to_label
                )
            else:
                # Legacy path: employee predates salary_components — read from salary sub-doc
                sal = emp.get("salary") or {}
                if isinstance(sal, dict):
                    basic = float(sal.get("basic", 0) or 0)
                    hra   = float(sal.get("hra",   0) or 0)
                    special_allowance = float(sal.get("special_allowance", 0) or 0)
                    pf_emp = float(sal.get("pf_employee", 0) or 0)
                    pt     = float(sal.get("professional_tax", 0) or 0)
                else:
                    basic = hra = special_allowance = pf_emp = pt = 0.0

                gross_earnings   = round(basic + hra + special_allowance, 2)
                total_deductions = round(pf_emp + pt, 2)

                salary_comps_dict = {
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
                    "total_deductions":  total_deductions,
                    "net_salary":        round(gross_earnings - total_deductions, 2),
                }

            # ── Build payslip document with employee detail snapshot ───────────
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
                **salary_comps_dict,
                # Post-generation adjustable fields (start at 0)
                "overtime":          0.0,
                "tds":               0.0,
                # Attendance defaults
                "working_days":  26,
                "present_days":  26.0,
                "absent_days":   0.0,
                "leave_days":    0.0,
                "lop_days":      0.0,
                # Meta
                "status":        PayrollStatus.DRAFT,
                "generated_by":  generated_by,
                "created_at":    now,
                "updated_at":    now,
            }
            await self.col.insert_one(doc)
            results.append(self._serialize(doc))

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
        skip  = (page - 1) * page_size
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
        """Update payslip fields and auto-recalculate gross / net."""
        existing = await self.get(payslip_id, company_id)
        if existing:
            # Merge incoming changes onto existing values
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
            total_ded = round(
                _f("pf_employee") + _f("professional_tax") +
                _f("tds") + _f("advance_deduction") + _list_sum("other_deductions"),
                2,
            )
            data["gross_earnings"]   = gross
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
