"""HRM — Performance Service"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId


class PerformanceService:
    COL = "hrm_performance"
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

    async def create(self, company_id: str, data: dict, created_by_id: str, company_name: str = "") -> dict:
        now = datetime.now(timezone.utc)
        emp = await self.db[self.EMP_COL].find_one({"_id": data["employee_id"], "company_id": company_id})
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "employee_id": data["employee_id"],
            "employee_name": data.get("employee_name") or (emp.get("full_name", "") if emp else ""),
            "employee_email": data.get("employee_email") or (emp.get("email", "") if emp else ""),
            "employee_mobile": data.get("employee_mobile") or (emp.get("phone", "") if emp else ""),
            "description": data.get("description"),
            "review_cycle": data["review_cycle"],
            "year": data["year"],
            "goals": [g if isinstance(g, dict) else g.model_dump() for g in (data.get("goals") or [])],
            "review_points": [p if isinstance(p, dict) else p.model_dump() for p in (data.get("review_points") or [])],
            "is_finalized": False,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.insert_one(doc)

        # Review saved successfully — notify the employee by email (opt-in,
        # never blocks the response, never sent if the insert above failed).
        if data.get("notify_email", True) and doc["employee_email"]:
            try:
                from app.services.email_service import send_performance_review_created_email, _fire_email
                _fire_email(send_performance_review_created_email(
                    to_email=doc["employee_email"],
                    employee_name=doc["employee_name"] or "",
                    review_cycle=doc["review_cycle"],
                    year=doc["year"],
                    company_name=company_name,
                    company_id=company_id,
                ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Performance review email failed: %s", _e)

        return self._serialize(doc)

    async def list(self, company_id: str, employee_id: Optional[str], year: Optional[int], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if employee_id:
            query["employee_id"] = employee_id
        if year:
            query["year"] = year
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, review_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": review_id, "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def submit_self(self, review_id: str, company_id: str, data: dict) -> Optional[dict]:
        now = datetime.now(timezone.utc)
        upd: dict = {
            "self_rating": data["self_rating"],
            "self_comments": data.get("self_comments"),
            "self_submitted_at": now,
            "updated_at": now,
        }
        if data.get("goals"):
            upd["goals"] = [g if isinstance(g, dict) else g.model_dump() for g in data["goals"]]
        await self.col.update_one({"_id": review_id, "company_id": company_id}, {"$set": upd})
        return await self.get(review_id, company_id)

    async def submit_manager(self, review_id: str, company_id: str, data: dict, manager_id: str, manager_name: str) -> Optional[dict]:
        now = datetime.now(timezone.utc)
        upd: dict = {
            "manager_id": manager_id,
            "manager_name": manager_name,
            "manager_rating": data["manager_rating"],
            "manager_comments": data.get("manager_comments"),
            "manager_reviewed_at": now,
            "updated_at": now,
        }
        if data.get("goals"):
            upd["goals"] = [g if isinstance(g, dict) else g.model_dump() for g in data["goals"]]
        if data.get("final_rating"):
            upd["final_rating"] = data["final_rating"]
        if data.get("final_score") is not None:
            upd["final_score"] = data["final_score"]
        if data.get("finalize"):
            upd["is_finalized"] = True
            upd["finalized_at"] = now
        await self.col.update_one({"_id": review_id, "company_id": company_id}, {"$set": upd})
        return await self.get(review_id, company_id)

    async def delete(self, review_id: str, company_id: str) -> bool:
        result = await self.col.delete_one({"_id": review_id, "company_id": company_id, "is_finalized": False})
        return result.deleted_count > 0
