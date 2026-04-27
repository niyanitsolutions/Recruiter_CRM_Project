"""HRM — Attendance Service"""
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from app.models.company.attendance import AttendanceStatus


class AttendanceService:
    COL = "hrm_attendance"
    EMP_COL = "hrm_employees"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        # Convert date to string
        if isinstance(doc.get("date"), date):
            doc["date"] = doc["date"].isoformat()
        return doc

    async def _get_employee(self, emp_id: str, company_id: str) -> Optional[dict]:
        return await self.db[self.EMP_COL].find_one({"_id": emp_id, "company_id": company_id, "is_deleted": False})

    async def check_in(self, employee_id: str, company_id: str, marked_by: str, notes: str = "") -> dict:
        today = date.today()
        now = datetime.now(timezone.utc)
        existing = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if existing and existing.get("check_in"):
            return self._serialize(existing)

        emp = await self._get_employee(employee_id, company_id)
        shift_start = emp.get("shift_start_time", "09:00") if emp else "09:00"
        grace = 15  # minutes
        sh, sm = map(int, shift_start.split(":"))
        shift_dt = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
        late_threshold = shift_dt + timedelta(minutes=grace)
        is_late = now > late_threshold
        late_by = max(0, int((now - late_threshold).total_seconds() / 60)) if is_late else 0

        doc_id = str(existing["_id"]) if existing else str(ObjectId())
        update = {
            "_id": doc_id,
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": emp.get("full_name", "") if emp else "",
            "date": today,
            "check_in": now,
            "status": AttendanceStatus.LATE if is_late else AttendanceStatus.PRESENT,
            "is_late": is_late,
            "late_by_minutes": late_by,
            "notes": notes,
            "marked_by": marked_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.replace_one({"_id": doc_id}, update, upsert=True)
        return self._serialize(update)

    async def check_out(self, employee_id: str, company_id: str, marked_by: str, notes: str = "") -> dict:
        today = date.today()
        now = datetime.now(timezone.utc)
        record = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if not record:
            return {}
        work_hours = 0.0
        if record.get("check_in"):
            delta = now - record["check_in"]
            work_hours = round(delta.total_seconds() / 3600, 2)
        await self.col.update_one(
            {"_id": record["_id"]},
            {"$set": {"check_out": now, "work_hours": work_hours, "updated_at": now}},
        )
        record["check_out"] = now
        record["work_hours"] = work_hours
        return self._serialize(record)

    async def get_today(self, employee_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"employee_id": employee_id, "date": date.today(), "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def get_monthly(self, employee_id: str, company_id: str, year: int, month: int) -> List[dict]:
        start = date(year, month, 1)
        if month == 12:
            end = date(year + 1, 1, 1)
        else:
            end = date(year, month + 1, 1)
        cursor = self.col.find({
            "employee_id": employee_id,
            "company_id": company_id,
            "date": {"$gte": start, "$lt": end},
        }).sort("date", 1)
        return [self._serialize(d) async for d in cursor]

    async def get_team_today(self, company_id: str) -> List[dict]:
        cursor = self.col.find({"company_id": company_id, "date": date.today()})
        return [self._serialize(d) async for d in cursor]

    async def manual_update(self, company_id: str, update_data: dict) -> dict:
        now = datetime.now(timezone.utc)
        emp_id = update_data["employee_id"]
        d = update_data["date"]
        update_data["updated_at"] = now
        update_data["company_id"] = company_id
        existing = await self.col.find_one({"employee_id": emp_id, "date": d, "company_id": company_id})
        if existing:
            await self.col.update_one({"_id": existing["_id"]}, {"$set": update_data})
            existing.update(update_data)
            return self._serialize(existing)
        update_data["_id"] = str(ObjectId())
        update_data["created_at"] = now
        await self.col.insert_one(update_data)
        return self._serialize(update_data)

    async def count_present_today(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "date": date.today(),
            "status": {"$in": [AttendanceStatus.PRESENT, AttendanceStatus.LATE]},
        })

    async def count_late_today(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "date": date.today(),
            "is_late": True,
        })
