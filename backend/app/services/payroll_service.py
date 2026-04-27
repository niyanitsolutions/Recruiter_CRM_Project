"""HRM — Payroll Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.payroll import PayrollStatus


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

        now = datetime.now(timezone.utc)
        results = []
        async for emp in cursor:
            emp_id = str(emp["_id"])
            existing = await self.col.find_one({"employee_id": emp_id, "company_id": company_id, "month": month, "year": year})
            if existing:
                results.append(self._serialize(existing))
                continue

            salary = emp.get("salary", {}).get("ctc", 0.0) if isinstance(emp.get("salary"), dict) else 0.0
            comps = self._calc_components(salary / 12 if salary > 0 else 0)
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
                "other_earnings": [],
                "other_deductions": [],
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
        data["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": payslip_id, "company_id": company_id}, {"$set": data})
        return await self.get(payslip_id, company_id)

    async def delete(self, payslip_id: str, company_id: str) -> bool:
        result = await self.col.delete_one({"_id": payslip_id, "company_id": company_id, "status": PayrollStatus.DRAFT})
        return result.deleted_count > 0
