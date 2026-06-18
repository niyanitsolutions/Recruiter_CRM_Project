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
        # Create default structure
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
    def _calc_components(salary: float) -> dict:
        basic = round(salary * 0.40, 2)
        hra = round(salary * 0.20, 2)
        special = round(salary - basic - hra, 2)
        gross = round(basic + hra + special, 2)
        pf = round(basic * 0.12, 2)
        prof_tax = 200.0
        total_ded = round(pf + prof_tax, 2)
        net = round(gross - total_ded, 2)
        return {
            "basic": basic,
            "hra": hra,
            "special_allowance": special,
            "gross_earnings": gross,
            "pf_employee": pf,
            "professional_tax": prof_tax,
            "total_deductions": total_ded,
            "net_salary": net,
        }

    async def generate(self, company_id: str, month: int, year: int, employee_ids: Optional[List[str]], generated_by: str) -> List[dict]:
        query: dict = {"company_id": company_id, "is_deleted": False, "employment_status": "active"}
        if employee_ids:
            query["_id"] = {"$in": employee_ids}
        cursor = self.db[self.EMP_COL].find(query)

        # Load payroll structure config to know which components are earnings vs deductions
        structure_doc = await self.db["hrm_payroll_structure"].find_one({"company_id": company_id})
        structure_components = structure_doc.get("components", []) if structure_doc else []
        earning_keys = {c["key"] for c in structure_components if c.get("component_type") == "earning"}
        deduction_keys = {c["key"] for c in structure_components if c.get("component_type") == "deduction"}

        now = datetime.now(timezone.utc)
        results = []
        async for emp in cursor:
            emp_id = str(emp["_id"])
            existing = await self.col.find_one({"employee_id": emp_id, "company_id": company_id, "month": month, "year": year})
            if existing:
                results.append(self._serialize(existing))
                continue

            salary_components = emp.get("salary_components") or {}

            if salary_components:
                # Build earnings/deductions from dynamic components
                other_earnings = []
                other_deductions = []
                basic = 0.0
                hra = 0.0
                special_allowance = 0.0
                epf = 0.0
                prof_tax = 0.0

                for key, amount in salary_components.items():
                    amount = float(amount or 0)
                    if key in deduction_keys:
                        if key == "epf_contribution":
                            epf = amount
                        elif key == "professional_tax":
                            prof_tax = amount
                        else:
                            other_deductions.append({"name": key, "amount": amount})
                    elif key in earning_keys or not deduction_keys:
                        if key == "basic_salary":
                            basic = amount
                        elif key == "hra":
                            hra = amount
                        elif key == "special_allowance":
                            special_allowance = amount
                        else:
                            other_earnings.append({"name": key, "amount": amount})

                # Find label for other components
                key_to_label = {c["key"]: c["label"] for c in structure_components}
                other_earnings = [{"name": key_to_label.get(e["name"], e["name"]), "amount": e["amount"]} for e in other_earnings]
                other_deductions = [{"name": key_to_label.get(d["name"], d["name"]), "amount": d["amount"]} for d in other_deductions]

                gross_earnings = round(basic + hra + special_allowance + sum(e["amount"] for e in other_earnings), 2)
                total_deductions = round(epf + prof_tax + sum(d["amount"] for d in other_deductions), 2)
                net_salary = round(gross_earnings - total_deductions, 2)

                comps = {
                    "basic": basic, "hra": hra, "special_allowance": special_allowance,
                    "gross_earnings": gross_earnings,
                    "pf_employee": epf, "professional_tax": prof_tax,
                    "total_deductions": total_deductions,
                    "net_salary": net_salary,
                    "other_earnings": other_earnings,
                    "other_deductions": other_deductions,
                }
            else:
                # Legacy: compute from CTC
                salary = emp.get("salary", {}).get("ctc", 0.0) if isinstance(emp.get("salary"), dict) else 0.0
                comps = self._calc_components(salary / 12 if salary > 0 else 0)
                comps["other_earnings"] = []
                comps["other_deductions"] = []

            doc = {
                "_id": str(ObjectId()),
                "company_id": company_id,
                "employee_id": emp_id,
                "employee_name": emp.get("full_name", ""),
                "employee_code": emp.get("employee_id", ""),
                "month": month,
                "year": year,
                **comps,
                "working_days": 26,
                "present_days": 26.0,
                "absent_days": 0.0,
                "leave_days": 0.0,
                "lop_days": 0.0,
                "status": PayrollStatus.DRAFT,
                "generated_by": generated_by,
                "overtime": 0.0,
                "bonus": 0.0,
                "advance_deduction": 0.0,
                "tds": 0.0,
                "created_at": now,
                "updated_at": now,
            }
            await self.col.insert_one(doc)
            results.append(self._serialize(doc))
        return results

    async def list(self, company_id: str, month: Optional[int], year: Optional[int], employee_id: Optional[str], status: Optional[str], page: int, page_size: int) -> dict:
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

    async def update_status(self, payslip_id: str, company_id: str, status: str, payment_reference: Optional[str], paid_on: Optional[datetime]) -> Optional[dict]:
        now = datetime.now(timezone.utc)
        upd: dict = {"status": status, "updated_at": now}
        if payment_reference:
            upd["payment_reference"] = payment_reference
        if paid_on:
            upd["paid_on"] = paid_on
        elif status == PayrollStatus.PAID:
            upd["paid_on"] = now
        await self.col.update_one({"_id": payslip_id, "company_id": company_id}, {"$set": upd})
        return await self.get(payslip_id, company_id)

    async def update_payslip(self, payslip_id: str, company_id: str, data: dict) -> Optional[dict]:
        # Auto-recalculate gross and net when earnings/deductions change
        existing = await self.get(payslip_id, company_id)
        if existing:
            merged = {**existing, **{k: v for k, v in data.items() if v is not None}}
            basic = float(merged.get("basic", 0))
            hra = float(merged.get("hra", 0))
            special = float(merged.get("special_allowance", 0))
            overtime = float(merged.get("overtime", 0))
            bonus = float(merged.get("bonus", 0))
            other_earn = sum(float(e.get("amount", 0) if isinstance(e, dict) else 0) for e in (merged.get("other_earnings") or []))
            gross = round(basic + hra + special + overtime + bonus + other_earn, 2)
            pf = float(merged.get("pf_employee", 0))
            pt = float(merged.get("professional_tax", 0))
            tds = float(merged.get("tds", 0))
            adv = float(merged.get("advance_deduction", 0))
            other_ded = sum(float(d.get("amount", 0) if isinstance(d, dict) else 0) for d in (merged.get("other_deductions") or []))
            total_ded = round(pf + pt + tds + adv + other_ded, 2)
            data["gross_earnings"] = gross
            data["total_deductions"] = total_ded
            data["net_salary"] = round(gross - total_ded, 2)
        data["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": payslip_id, "company_id": company_id}, {"$set": data})
        return await self.get(payslip_id, company_id)

    async def delete(self, payslip_id: str, company_id: str) -> bool:
        result = await self.col.delete_one({"_id": payslip_id, "company_id": company_id, "status": PayrollStatus.DRAFT})
        return result.deleted_count > 0
