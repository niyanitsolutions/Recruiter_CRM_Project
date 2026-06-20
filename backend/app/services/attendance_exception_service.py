"""HRM — Attendance Exception Service"""
import logging
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

logger = logging.getLogger(__name__)

COL = "hrm_attendance_exceptions"
EMP_COL = "hrm_employees"


def _serialize(doc: dict) -> dict:
    if not doc:
        return {}
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    for field in ("from_datetime", "to_datetime", "created_at", "updated_at"):
        val = doc.get(field)
        if isinstance(val, datetime):
            doc[field] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    return doc


class AttendanceExceptionService:
    def __init__(self, db):
        self.db = db
        self.col = db[COL]

    async def _get_employee(self, emp_id: str, company_id: str) -> Optional[dict]:
        return await self.db[EMP_COL].find_one(
            {"_id": emp_id, "company_id": company_id, "is_deleted": False}
        )

    # ── Create ─────────────────────────────────────────────────────────────────

    async def create_exception(
        self,
        company_id: str,
        employee_id: str,
        reason: str,
        from_datetime: datetime,
        to_datetime: datetime,
        allow_login: bool,
        bypass_geo_fence: bool,
        bypass_ip_restriction: bool,
        created_by: str,
        created_by_name: str,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Normalize to naive UTC
        if from_datetime.tzinfo is not None:
            from_datetime = from_datetime.replace(tzinfo=None)
        if to_datetime.tzinfo is not None:
            to_datetime = to_datetime.replace(tzinfo=None)

        if from_datetime >= to_datetime:
            raise ValueError("From datetime must be before To datetime.")
        if not reason or not reason.strip():
            raise ValueError("Reason is required.")

        emp = await self._get_employee(employee_id, company_id)
        if not emp:
            raise ValueError("Employee not found.")
        emp_name = emp.get("full_name", "")

        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": emp_name,
            "reason": reason.strip(),
            "from_datetime": from_datetime,
            "to_datetime": to_datetime,
            "allow_login": allow_login,
            "bypass_geo_fence": bypass_geo_fence,
            "bypass_ip_restriction": bypass_ip_restriction,
            "created_by": created_by,
            "created_by_name": created_by_name,
            "is_deleted": False,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(doc)
        logger.info(
            "Attendance exception created | company=%s emp=%s %s→%s by=%s",
            company_id, employee_id, from_datetime, to_datetime, created_by,
        )
        return _serialize(doc)

    # ── Update ─────────────────────────────────────────────────────────────────

    async def update_exception(
        self,
        exception_id: str,
        company_id: str,
        updates: dict,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc = await self.col.find_one({"_id": exception_id, "company_id": company_id, "is_deleted": False})
        if not doc:
            raise ValueError("Exception not found.")

        allowed = {"reason", "from_datetime", "to_datetime", "allow_login", "bypass_geo_fence", "bypass_ip_restriction"}
        upd = {k: v for k, v in updates.items() if k in allowed and v is not None}

        for dt_field in ("from_datetime", "to_datetime"):
            if dt_field in upd and isinstance(upd[dt_field], datetime) and upd[dt_field].tzinfo is not None:
                upd[dt_field] = upd[dt_field].replace(tzinfo=None)

        upd["updated_at"] = now
        await self.col.update_one({"_id": exception_id}, {"$set": upd})
        doc = dict(doc)
        doc.update(upd)
        return _serialize(doc)

    # ── Soft-delete ────────────────────────────────────────────────────────────

    async def delete_exception(self, exception_id: str, company_id: str) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = await self.col.update_one(
            {"_id": exception_id, "company_id": company_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": now}},
        )
        return result.modified_count > 0

    # ── List ───────────────────────────────────────────────────────────────────

    async def list_exceptions(
        self,
        company_id: str,
        employee_id: Optional[str] = None,
        include_expired: bool = False,
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        query: dict = {"company_id": company_id, "is_deleted": False}
        if employee_id:
            query["employee_id"] = employee_id
        if not include_expired:
            query["to_datetime"] = {"$gte": now}

        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("from_datetime", -1).skip(skip).limit(page_size)
        items = [_serialize(dict(d)) async for d in cursor]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
        }

    # ── Check Active ───────────────────────────────────────────────────────────

    async def get_active_exception(
        self,
        employee_id: str,
        company_id: str,
        at_time: Optional[datetime] = None,
    ) -> Optional[dict]:
        """Return the active attendance exception for an employee at a given time (UTC naive)."""
        if at_time is None:
            at_time = datetime.now(timezone.utc).replace(tzinfo=None)
        elif at_time.tzinfo is not None:
            at_time = at_time.replace(tzinfo=None)

        doc = await self.col.find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "is_deleted": False,
            "allow_login": True,
            "from_datetime": {"$lte": at_time},
            "to_datetime": {"$gte": at_time},
        })
        return _serialize(doc) if doc else None
