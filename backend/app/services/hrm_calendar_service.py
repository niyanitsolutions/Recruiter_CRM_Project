"""HRM — Company Calendar aggregation service.

Combines Company Holidays, Approved Leave, Approved Work-From-Home requests,
and Approved Shift-Change requests into one normalized event list for a
bounded date range, with permission-based visibility enforced server-side
(unauthorized records are never returned, not merely hidden client-side).

Reuses the existing HolidayService / LeaveService / WorkModeRequestService /
ShiftAssignmentService query methods — no new collections, no changes to
those services' existing behavior for callers that don't pass the new
optional date_from/date_to kwargs.
"""
from datetime import date
from typing import Optional

from app.services.hrm_holiday_service import HolidayService
from app.services.leave_service import LeaveService
from app.services.work_mode_request_service import WorkModeRequestService
from app.services.hrm_shift_assignment_service import ShiftAssignmentService

MAX_RANGE_DAYS = 62
_HR_LEAVE_PERMS = {"hrm:leave:team_approve", "hrm:leave:manage"}
_HR_ATTENDANCE_PERMS = {"hrm:attendance:team", "hrm:attendance:manage"}


def _is_hr_or_owner(cu: dict, extra_perms: set) -> bool:
    if cu.get("is_owner") or cu.get("role") == "admin":
        return True
    return bool(set(cu.get("permissions") or []) & extra_perms)


class HrmCalendarService:
    def __init__(self, db):
        self.db = db

    async def get_events(
        self,
        company_id: str,
        date_from: date,
        date_to: date,
        cu: dict,
        self_employee_id: Optional[str],
    ) -> list:
        events: list = []
        events.extend(await self._holiday_events(company_id, date_from, date_to))
        events.extend(await self._leave_events(company_id, date_from, date_to, cu, self_employee_id))
        events.extend(await self._wfh_events(company_id, date_from, date_to, cu, self_employee_id))
        events.extend(await self._shift_change_events(company_id, date_from, date_to, cu, self_employee_id))
        events.extend(await self._company_event_events(company_id, date_from, date_to, cu, self_employee_id))
        return events

    # ── Company events — visibility-scoped (see CompanyEventService) ─────────

    async def _company_event_events(
        self, company_id: str, date_from: date, date_to: date, cu: dict, self_employee_id: Optional[str],
    ) -> list:
        from app.services.hrm_calendar_event_service import CompanyEventService
        return await CompanyEventService(self.db).visible_events(
            company_id, date_from.isoformat(), date_to.isoformat(), cu, self_employee_id,
        )

    # ── Holidays — visible to everyone, no filtering ────────────────────────

    async def _holiday_events(self, company_id: str, date_from: date, date_to: date) -> list:
        svc = HolidayService(self.db)
        from_str, to_str = date_from.isoformat(), date_to.isoformat()
        years = sorted({date_from.year, date_to.year})
        seen_ids = set()
        out = []
        for year in years:
            result = await svc.list(company_id=company_id, year=year, page=1, page_size=500)
            for h in result.get("items", []):
                h_date = h.get("date", "")
                if h["id"] in seen_ids or not (from_str <= h_date <= to_str):
                    continue
                seen_ids.add(h["id"])
                out.append({
                    "id": f"holiday_{h['id']}",
                    "type": "holiday",
                    "date_start": h_date,
                    "date_end": h_date,
                    "title": h.get("name", "Holiday"),
                    "meta": {
                        "holiday_type": h.get("holiday_type"),
                        "description": h.get("description"),
                        "is_paid": h.get("is_paid"),
                        "is_recurring": h.get("is_recurring"),
                    },
                })
        return out

    # ── Leave — self / reporting manager / HR / owner only ──────────────────

    async def _leave_events(
        self, company_id: str, date_from: date, date_to: date, cu: dict, self_employee_id: Optional[str],
    ) -> list:
        result = await LeaveService(self.db).list(
            company_id=company_id, status="approved",
            date_from=date_from, date_to=date_to, page=1, page_size=500,
        )
        records = result.get("items", [])
        if _is_hr_or_owner(cu, _HR_LEAVE_PERMS):
            visible = records
        else:
            direct_report_ids = await self._direct_report_ids(company_id, self_employee_id)
            allowed = direct_report_ids | ({self_employee_id} if self_employee_id else set())
            visible = [r for r in records if r.get("employee_id") in allowed]

        return [
            {
                "id": f"leave_{r['id']}",
                "type": "leave",
                "date_start": _date_str(r.get("from_date")),
                "date_end": _date_str(r.get("to_date")),
                "title": r.get("leave_type", "Leave"),
                "employee_id": r.get("employee_id"),
                "employee_name": r.get("employee_name"),
                "meta": {"total_days": r.get("total_days")},
            }
            for r in visible
        ]

    async def _direct_report_ids(self, company_id: str, self_employee_id: Optional[str]) -> set:
        if not self_employee_id:
            return set()
        cursor = self.db["hrm_employees"].find(
            {"company_id": company_id, "reporting_manager_id": self_employee_id, "is_deleted": False},
            {"_id": 1},
        )
        return {str(doc["_id"]) async for doc in cursor}

    # ── WFH — permission-based (HR/manage sees all, else self only) ─────────

    async def _wfh_events(
        self, company_id: str, date_from: date, date_to: date, cu: dict, self_employee_id: Optional[str],
    ) -> list:
        can_see_all = _is_hr_or_owner(cu, _HR_ATTENDANCE_PERMS)
        if not can_see_all and not self_employee_id:
            return []  # no HRM employee profile and not HR/owner — nothing to show
        employee_filter = None if can_see_all else self_employee_id
        result = await WorkModeRequestService(self.db).list_requests(
            company_id=company_id, employee_id=employee_filter, status="approved",
            date_from=date_from, date_to=date_to, page=1, page_size=500,
        )
        return [
            {
                "id": f"wfh_{r['id']}",
                "type": "wfh",
                "date_start": _date_str(r.get("from_date")),
                "date_end": _date_str(r.get("to_date")),
                "title": (r.get("work_mode") or "wfh").replace("_", " ").title(),
                "employee_id": r.get("employee_id"),
                "employee_name": r.get("employee_name"),
                "meta": {},
            }
            for r in result.get("items", [])
        ]

    # ── Shift Change — permission-based (same rule as WFH) ──────────────────

    async def _shift_change_events(
        self, company_id: str, date_from: date, date_to: date, cu: dict, self_employee_id: Optional[str],
    ) -> list:
        can_see_all = _is_hr_or_owner(cu, _HR_ATTENDANCE_PERMS)
        if not can_see_all and not self_employee_id:
            return []
        employee_filter = None if can_see_all else self_employee_id
        result = await ShiftAssignmentService(self.db).list_change_requests(
            company_id=company_id, employee_id=employee_filter, status="approved",
            date_from=date_from.isoformat(), date_to=date_to.isoformat(), page=1, page_size=500,
        )
        return [
            {
                "id": f"shift_change_{r['id']}",
                "type": "shift_change",
                "date_start": r.get("effective_from"),
                "date_end": r.get("effective_to") or r.get("effective_from"),
                "title": "Shift Change",
                "employee_id": r.get("employee_id"),
                "employee_name": r.get("employee_name"),
                "meta": {},
            }
            for r in result.get("items", [])
        ]


def _date_str(value) -> Optional[str]:
    if value is None:
        return None
    if isinstance(value, str):
        return value[:10]
    return value.isoformat()
