"""HRM — Leave Service"""
from datetime import datetime, timezone, date
from typing import Optional, List
from bson import ObjectId
import math

from app.models.company.leave import LeaveStatus, LeaveType, LeaveDuration


class LeaveService:
    COL = "hrm_leaves"
    BAL_COL = "hrm_leave_balances"

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

    @staticmethod
    def _calc_days(from_date: date, to_date: date, duration: LeaveDuration) -> float:
        delta = (to_date - from_date).days + 1
        if duration in (LeaveDuration.HALF_DAY_MORNING, LeaveDuration.HALF_DAY_AFTERNOON):
            return 0.5
        return float(max(1, delta))

    async def apply(self, data: dict, employee_id: str, employee_name: str, company_id: str) -> dict:
        now = datetime.now(timezone.utc)
        days = self._calc_days(data["from_date"], data["to_date"], data.get("duration", LeaveDuration.FULL_DAY))
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": employee_name,
            "total_days": days,
            "status": LeaveStatus.PENDING,
            **{k: v for k, v in data.items()},
            "created_at": now,
            "updated_at": now,
        }
        # Serialize dates
        for f in ("from_date", "to_date"):
            if isinstance(doc.get(f), date):
                doc[f] = doc[f]
        await self.col.insert_one(doc)
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

        # If approved, deduct from balance
        if action == "approve":
            leave = await self.col.find_one({"_id": leave_id, "company_id": company_id})
            if leave:
                await self._deduct_balance(
                    leave["employee_id"],
                    company_id,
                    leave.get("leave_type"),
                    float(leave.get("total_days", 1)),
                )

        await self.col.update_one({"_id": leave_id, "company_id": company_id}, {"$set": update})
        return await self.get(leave_id, company_id)

    async def _deduct_balance(self, emp_id: str, company_id: str, leave_type: str, days: float):
        year = date.today().year
        field_map = {
            LeaveType.CASUAL: "casual_used",
            LeaveType.SICK: "sick_used",
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
            "to_date": {"$gte": today_str},
        })
