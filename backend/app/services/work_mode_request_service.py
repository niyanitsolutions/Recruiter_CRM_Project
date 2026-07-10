"""HRM — Work Mode Request Service"""
import logging
from datetime import datetime, date, timezone
from typing import Optional, List
from bson import ObjectId

logger = logging.getLogger(__name__)

COL = "hrm_work_mode_requests"
EMP_COL = "hrm_employees"


def _serialize(doc: dict) -> dict:
    if not doc:
        return {}
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", ""))
    for field in ("approved_at", "rejected_at", "cancelled_at", "created_at", "updated_at"):
        val = doc.get(field)
        if isinstance(val, datetime):
            doc[field] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
    return doc


class WorkModeRequestService:
    def __init__(self, db):
        self.db = db
        self.col = db[COL]

    async def _get_employee(self, emp_id: str, company_id: str) -> Optional[dict]:
        return await self.db[EMP_COL].find_one(
            {"_id": emp_id, "company_id": company_id, "is_deleted": False}
        )

    # ── Create Request ─────────────────────────────────────────────────────────

    async def create_request(
        self,
        company_id: str,
        employee_id: str,
        crm_user_id: str,
        work_mode: str,
        from_date: str,
        to_date: str,
        reason: str,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        # Validate dates
        try:
            fd = date.fromisoformat(from_date)
            td = date.fromisoformat(to_date)
        except ValueError:
            raise ValueError("Invalid date format. Use YYYY-MM-DD.")

        if fd > td:
            raise ValueError("From date must be on or before To date.")

        # Validate reason
        if not reason or not reason.strip():
            raise ValueError("Reason is required.")

        # Check for overlapping active (pending/approved) requests
        overlap = await self.col.find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "status": {"$in": ["pending", "approved"]},
            "from_date": {"$lte": to_date},
            "to_date": {"$gte": from_date},
        })
        if overlap:
            raise ValueError(
                f"You already have an overlapping {overlap['status']} work mode request "
                f"({overlap['from_date']} – {overlap['to_date']}). "
                "Please cancel it before submitting a new one."
            )

        emp = await self._get_employee(employee_id, company_id)
        emp_name = emp.get("full_name", "") if emp else ""

        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": emp_name,
            "crm_user_id": crm_user_id,
            "work_mode": work_mode,
            "from_date": from_date,
            "to_date": to_date,
            "reason": reason.strip(),
            "status": "pending",
            "approved_by": None,
            "approved_by_name": None,
            "approved_at": None,
            "rejected_by": None,
            "rejected_by_name": None,
            "rejected_reason": None,
            "rejected_at": None,
            "cancelled_at": None,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(doc)
        logger.info("WMR created | company=%s emp=%s mode=%s %s→%s", company_id, employee_id, work_mode, from_date, to_date)
        return _serialize(doc)

    # ── Approve ────────────────────────────────────────────────────────────────

    async def approve_request(
        self,
        request_id: str,
        company_id: str,
        approved_by: str,
        approved_by_name: str,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc = await self.col.find_one({"_id": request_id, "company_id": company_id})
        if not doc:
            raise ValueError("Work mode request not found.")
        if doc["status"] != "pending":
            raise ValueError(f"Cannot approve a request with status '{doc['status']}'.")

        # Check for overlapping approved requests (excluding this one)
        overlap = await self.col.find_one({
            "_id": {"$ne": request_id},
            "company_id": company_id,
            "employee_id": doc["employee_id"],
            "status": "approved",
            "from_date": {"$lte": doc["to_date"]},
            "to_date": {"$gte": doc["from_date"]},
        })
        if overlap:
            raise ValueError(
                f"Cannot approve — employee already has an approved work mode request "
                f"({overlap['from_date']} – {overlap['to_date']}) that overlaps with this period."
            )

        upd = {
            "status": "approved",
            "approved_by": approved_by,
            "approved_by_name": approved_by_name,
            "approved_at": now,
            "updated_at": now,
        }
        await self.col.update_one({"_id": request_id}, {"$set": upd})
        doc = dict(doc)
        doc.update(upd)
        logger.info("WMR approved | id=%s emp=%s by=%s", request_id, doc["employee_id"], approved_by)
        return _serialize(doc)

    # ── Reject ─────────────────────────────────────────────────────────────────

    async def reject_request(
        self,
        request_id: str,
        company_id: str,
        rejected_by: str,
        rejected_by_name: str,
        reason: Optional[str] = None,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc = await self.col.find_one({"_id": request_id, "company_id": company_id})
        if not doc:
            raise ValueError("Work mode request not found.")
        if doc["status"] not in ("pending",):
            raise ValueError(f"Cannot reject a request with status '{doc['status']}'.")

        upd = {
            "status": "rejected",
            "rejected_by": rejected_by,
            "rejected_by_name": rejected_by_name,
            "rejected_reason": reason,
            "rejected_at": now,
            "updated_at": now,
        }
        await self.col.update_one({"_id": request_id}, {"$set": upd})
        doc = dict(doc)
        doc.update(upd)
        logger.info("WMR rejected | id=%s emp=%s by=%s", request_id, doc["employee_id"], rejected_by)
        return _serialize(doc)

    # ── Cancel ─────────────────────────────────────────────────────────────────

    async def cancel_request(
        self,
        request_id: str,
        company_id: str,
        employee_id: str,
    ) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        doc = await self.col.find_one({"_id": request_id, "company_id": company_id, "employee_id": employee_id})
        if not doc:
            raise ValueError("Work mode request not found.")
        if doc["status"] not in ("pending", "approved"):
            raise ValueError(f"Cannot cancel a request with status '{doc['status']}'.")

        upd = {"status": "cancelled", "cancelled_at": now, "updated_at": now}
        await self.col.update_one({"_id": request_id}, {"$set": upd})
        doc = dict(doc)
        doc.update(upd)
        logger.info("WMR cancelled | id=%s emp=%s", request_id, employee_id)
        return _serialize(doc)

    # ── Queries ────────────────────────────────────────────────────────────────

    async def list_requests(
        self,
        company_id: str,
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
    ) -> dict:
        query: dict = {"company_id": company_id}
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        # Date-range overlap filter (calendar aggregation) — optional, additive,
        # existing callers that don't pass date_from/date_to are unaffected.
        if date_from is not None:
            query["to_date"] = {"$gte": date_from}
        if date_to is not None:
            query["from_date"] = {"$lte": date_to}
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [_serialize(dict(d)) async for d in cursor]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
        }

    async def get_active_work_mode(
        self,
        employee_id: str,
        company_id: str,
        today_str: Optional[str] = None,
    ) -> Optional[dict]:
        """Return the approved work mode request active for today, or None."""
        if not today_str:
            today_str = date.today().isoformat()
        doc = await self.col.find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "approved",
            "from_date": {"$lte": today_str},
            "to_date": {"$gte": today_str},
        })
        return _serialize(doc) if doc else None

    async def expire_old_requests(self, company_id: str) -> int:
        """Mark past approved requests as expired."""
        today_str = date.today().isoformat()
        result = await self.col.update_many(
            {
                "company_id": company_id,
                "status": "approved",
                "to_date": {"$lt": today_str},
            },
            {"$set": {"status": "expired", "updated_at": datetime.now(timezone.utc).replace(tzinfo=None)}},
        )
        return result.modified_count
