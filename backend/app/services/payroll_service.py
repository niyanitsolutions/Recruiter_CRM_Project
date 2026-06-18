"""HRM — Payroll Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.payroll import PayrollStatus, DEFAULT_PAYROLL_COMPONENTS


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
        # First time — create with all defaults, basic_salary/hra/epf/pt pre-selected
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
        """Convert date/datetime/string to a display-friendly string."""
        if not d:
            return ""
        if isinstance(d, str):
            return d[:10]  # take YYYY-MM-DD part
        try:
            return d.strftime("%d-%b-%Y")
        except Exception:
            return str(d)

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

        # Load structure so we can map component keys → labels and types
        structure_doc = await self.db["hrm_payroll_structure"].find_one({"company_id": company_id})
        all_components = structure_doc.get("components", []) if structure_doc else []
        # Only active (is_selected) components participate
        active_components = [c for c in all_components if c.get("is_selected", True)]
        earning_keys  = {c["key"] for c in active_components if c.get("component_type") == "earning"}
        deduction_keys = {c["key"] for c in active_components if c.get("component_type") == "deduction"}
        key_to_label   = {c["key"]: c["label"] for c in all_components}

        now = datetime.now(timezone.utc)
        results = []

        async for emp in cursor:
            emp_id = str(emp["_id"])

            # Skip if payslip already exists for this period
            existing = await self.col.find_one({
                "employee_id": emp_id,
                "company_id": company_id,
                "month": month,
                "year": year,
            })
            if existing:
                results.append(self._serialize(existing))
                continue

            # ── Resolve salary data ────────────────────────────────────────
            salary_components = emp.get("salary_components") or {}

            if salary_components:
                # New path: use per-component values stored on the employee
                basic = 0.0
                hra   = 0.0
                special_allowance = 0.0
                epf   = 0.0
                prof_tax = 0.0
                other_earnings   = []
                other_deductions = []

                for key, raw_amount in salary_components.items():
                    amount = float(raw_amount or 0)
                    if amount == 0:
                        continue

                    if key in deduction_keys:
                        if key == "epf_contribution":
                            epf = amount
                        elif key == "professional_tax":
                            prof_tax = amount
                        else:
                            other_deductions.append({
                                "name":   key_to_label.get(key, key),
                                "amount": amount,
                            })
                    else:
                        # treat as earning (or uncategorised key → earning)
                        if key == "basic_salary":
                            basic = amount
                        elif key == "hra":
                            hra = amount
                        elif key == "special_allowance":
                            special_allowance = amount
                        else:
                            other_earnings.append({
                                "name":   key_to_label.get(key, key),
                                "amount": amount,
                            })

                gross_earnings   = round(
                    basic + hra + special_allowance +
                    sum(e["amount"] for e in other_earnings),
                    2,
                )
                total_deductions = round(
                    epf + prof_tax +
                    sum(d["amount"] for d in other_deductions),
                    2,
                )
                net_salary = round(gross_earnings - total_deductions, 2)

                salary_comps_dict = {
                    "basic":              basic,
                    "hra":                hra,
                    "special_allowance":  special_allowance,
                    "other_earnings":     other_earnings,
                    "pf_employee":        epf,
                    "professional_tax":   prof_tax,
                    "other_deductions":   other_deductions,
                    "gross_earnings":     gross_earnings,
                    "total_deductions":   total_deductions,
                    "net_salary":         net_salary,
                }

            else:
                # Legacy path: read stored salary fields (not CTC-based formula)
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
                net_salary       = round(gross_earnings - total_deductions, 2)

                salary_comps_dict = {
                    "basic":              basic,
                    "hra":                hra,
                    "special_allowance":  special_allowance,
                    "other_earnings":     [],
                    "pf_employee":        pf_emp,
                    "professional_tax":   pt,
                    "other_deductions":   [],
                    "gross_earnings":     gross_earnings,
                    "total_deductions":   total_deductions,
                    "net_salary":         net_salary,
                }

            # ── Build payslip document (snapshot of employee details) ──────
            doc = {
                "_id":                  str(ObjectId()),
                "company_id":           company_id,
                "employee_id":          emp_id,
                "employee_name":        emp.get("full_name", ""),
                "employee_code":        emp.get("employee_id", ""),
                # Employee detail snapshot
                "employee_department":  emp.get("department_name", ""),
                "employee_designation": emp.get("designation_name", ""),
                "employee_doj":         self._format_date(emp.get("date_of_joining")),
                "employee_pf_number":   emp.get("pf_number", "") or "",
                "employee_uan_number":  emp.get("uan_number", "") or "",
                # Period
                "month": month,
                "year":  year,
                # Salary
                **salary_comps_dict,
                # Attendance defaults
                "working_days":     26,
                "present_days":     26.0,
                "absent_days":      0.0,
                "leave_days":       0.0,
                "lop_days":         0.0,
                # Other earnings not captured above
                "overtime":         0.0,
                "bonus":            0.0,
                "advance_deduction": 0.0,
                "tds":              0.0,
                # Meta
                "status":           PayrollStatus.DRAFT,
                "generated_by":     generated_by,
                "created_at":       now,
                "updated_at":       now,
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
            merged = {**existing, **{k: v for k, v in data.items() if v is not None}}

            def _f(k):
                return float(merged.get(k, 0) or 0)

            def _list_sum(key):
                return sum(
                    float(e.get("amount", 0) if isinstance(e, dict) else 0)
                    for e in (merged.get(key) or [])
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
