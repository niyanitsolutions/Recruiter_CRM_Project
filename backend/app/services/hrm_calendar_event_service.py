"""HRM — Company Calendar Event service (create/list/update/delete + RBAC +
visibility). Additive: a new hrm_calendar_events collection, surfaced through
the existing calendar aggregation (HrmCalendarService)."""
from datetime import datetime, timezone
from typing import Optional

from fastapi import HTTPException

from app.models.company.hrm_calendar_event import CompanyEventCreate, CompanyEventUpdate

# Permissions that grant company-wide event management (owner/admin already do).
_HR_PERMS = {"hrm:leave:manage", "hrm:leave:team_approve", "hrm:attendance:manage", "hrm:employees:manage"}


def is_hr_or_owner(cu: dict) -> bool:
    if cu.get("is_owner") or cu.get("role") == "admin":
        return True
    return bool(set(cu.get("permissions") or []) & _HR_PERMS)


class CompanyEventService:
    COL = "hrm_calendar_events"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _ser(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    async def _direct_report_ids(self, company_id: str, self_employee_id: Optional[str]) -> set:
        if not self_employee_id:
            return set()
        cursor = self.db["hrm_employees"].find(
            {"company_id": company_id, "reporting_manager_id": self_employee_id, "is_deleted": False},
            {"_id": 1},
        )
        return {str(d["_id"]) async for d in cursor}

    # ── Create (RBAC: owner/HR → anyone; manager → team; employee → denied) ──

    async def create(self, company_id: str, data: CompanyEventCreate, cu: dict,
                     self_employee_id: Optional[str]) -> dict:
        if data.end_date < data.start_date:
            raise HTTPException(status_code=422, detail="End date cannot be before start date.")

        hr = is_hr_or_owner(cu)
        reports = set() if hr else await self._direct_report_ids(company_id, self_employee_id)
        is_manager = bool(reports)

        if not hr and not is_manager:
            # Plain employees are read-only on the calendar.
            raise HTTPException(status_code=403, detail="You do not have permission to create calendar events.")

        vis = data.visibility.value if hasattr(data.visibility, "value") else data.visibility
        if not hr:
            # Managers may only create for themselves or for their direct reports.
            if vis not in ("only_me", "selected_employees"):
                raise HTTPException(status_code=403, detail="Managers can only create events for themselves or their team.")
            if vis == "selected_employees":
                allowed = reports | ({self_employee_id} if self_employee_id else set())
                if not set(data.visible_employee_ids or []).issubset(allowed):
                    raise HTTPException(status_code=403, detail="Managers can only select their own team members.")

        now = datetime.now(timezone.utc)
        doc = {
            "_id": __import__("uuid").uuid4().hex,
            "company_id": company_id,
            "event_name": data.event_name.strip(),
            "description": data.description,
            "start_date": data.start_date,
            "end_date": data.end_date,
            "all_day": data.all_day,
            "start_time": data.start_time,
            "end_time": data.end_time,
            "location": data.location,
            "meeting_link": data.meeting_link,
            "color": data.color or "#6366f1",
            "repeat": data.repeat.value if hasattr(data.repeat, "value") else data.repeat,
            "visibility": vis,
            "visible_employee_ids": data.visible_employee_ids or [],
            "visible_department_ids": data.visible_department_ids or [],
            "visible_designation_ids": data.visible_designation_ids or [],
            "created_by": cu.get("id", ""),
            "created_by_name": cu.get("full_name", ""),
            "created_by_role": cu.get("role", ""),
            "created_by_employee_id": self_employee_id,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.col.insert_one(doc)
        return self._ser(dict(doc))

    # ── Manage list (HR/owner → all; else → events the user created) ─────────

    async def list_manageable(self, company_id: str, cu: dict) -> list:
        query = {"company_id": company_id, "is_deleted": False}
        if not is_hr_or_owner(cu):
            query["created_by"] = cu.get("id")
        return [self._ser(d) async for d in self.col.find(query).sort("start_date", 1)]

    async def update(self, event_id: str, company_id: str, data: CompanyEventUpdate,
                     cu: dict) -> Optional[dict]:
        existing = await self.col.find_one({"_id": event_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return None
        if not is_hr_or_owner(cu) and existing.get("created_by") != cu.get("id"):
            raise HTTPException(status_code=403, detail="You can only edit events you created.")
        upd = {k: (v.value if hasattr(v, "value") else v)
               for k, v in data.model_dump(exclude_none=True).items()}
        if upd.get("end_date") and upd.get("start_date") and upd["end_date"] < upd["start_date"]:
            raise HTTPException(status_code=422, detail="End date cannot be before start date.")
        upd["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": event_id, "company_id": company_id}, {"$set": upd})
        return self._ser(await self.col.find_one({"_id": event_id, "company_id": company_id}))

    async def delete(self, event_id: str, company_id: str, cu: dict) -> bool:
        existing = await self.col.find_one({"_id": event_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return False
        if not is_hr_or_owner(cu) and existing.get("created_by") != cu.get("id"):
            raise HTTPException(status_code=403, detail="You can only delete events you created.")
        await self.col.update_one({"_id": event_id, "company_id": company_id},
                                  {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}})
        return True

    # ── Visibility query (used by the calendar aggregation) ──────────────────

    async def visible_events(self, company_id: str, from_str: str, to_str: str,
                             cu: dict, self_employee_id: Optional[str]) -> list:
        # Date-range overlap: start_date <= range_end AND end_date >= range_start
        base = {
            "company_id": company_id, "is_deleted": False,
            "start_date": {"$lte": to_str}, "end_date": {"$gte": from_str},
        }
        if is_hr_or_owner(cu):
            query = base  # HR/owner see every event
        else:
            dept_id = desig_id = None
            if self_employee_id:
                emp = await self.db["hrm_employees"].find_one(
                    {"_id": self_employee_id}, {"department_id": 1, "designation_id": 1})
                if emp:
                    dept_id = emp.get("department_id")
                    desig_id = emp.get("designation_id")
            ors = [{"visibility": "everyone"}, {"created_by": cu.get("id")}]
            if self_employee_id:
                ors.append({"visibility": "selected_employees", "visible_employee_ids": self_employee_id})
                ors.append({"visibility": "only_me", "created_by_employee_id": self_employee_id})
            if dept_id:
                ors.append({"visibility": "selected_departments", "visible_department_ids": dept_id})
            if desig_id:
                ors.append({"visibility": "selected_designations", "visible_designation_ids": desig_id})
            query = {**base, "$or": ors}

        out = []
        async for e in self.col.find(query):
            out.append({
                "id": f"company_event_{e['_id']}",
                "type": "company_event",
                "date_start": e.get("start_date"),
                "date_end": e.get("end_date") or e.get("start_date"),
                "title": e.get("event_name", "Event"),
                "meta": {
                    "event_id": str(e["_id"]),
                    "description": e.get("description"),
                    "all_day": e.get("all_day", True),
                    "start_time": e.get("start_time"),
                    "end_time": e.get("end_time"),
                    "location": e.get("location"),
                    "meeting_link": e.get("meeting_link"),
                    "color": e.get("color", "#6366f1"),
                    "repeat": e.get("repeat", "none"),
                    "visibility": e.get("visibility"),
                    "created_by_name": e.get("created_by_name"),
                },
            })
        return out
