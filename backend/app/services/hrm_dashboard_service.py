"""HRM — Dashboard Service"""
import asyncio
from datetime import datetime, date, timezone, timedelta
from typing import Optional


def _today_dt() -> datetime:
    """Return today's date as naive midnight datetime — PyMongo 4.x requires datetime, not date."""
    d = date.today()
    return datetime(d.year, d.month, d.day)


def _date_to_dt(d: date) -> datetime:
    """Convert any date/datetime to naive midnight datetime for MongoDB queries."""
    if isinstance(d, datetime):
        return d.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
    return datetime(d.year, d.month, d.day)


class HRMDashboardService:
    def __init__(self, db):
        self.db = db

    async def get_stats(self, company_id: str) -> dict:
        today = _today_dt()
        today_date = date.today()
        month = today_date.month
        year = today_date.year

        emp_col     = self.db["hrm_employees"]
        att_col     = self.db["hrm_attendance"]
        leave_col   = self.db["hrm_leaves"]
        payslip_col = self.db["hrm_payslips"]
        ann_col     = self.db["hrm_announcements"]
        job_col     = self.db["hrm_jobs"]
        cand_col    = self.db["hrm_candidates"]
        exit_col    = self.db["hrm_exit"]

        # ── On break: aggregation needed (check last break element) ──────────
        async def _on_break_count() -> int:
            on_break_pipeline = [
                {"$match": {
                    "company_id": company_id,
                    "date": today,
                    "check_in": {"$ne": None},
                    "check_out": None,
                }},
                {"$project": {"last_break": {"$arrayElemAt": ["$breaks", -1]}}},
                {"$match": {"last_break": {"$ne": None}, "last_break.end": None}},
                {"$count": "total"},
            ]
            result = await att_col.aggregate(on_break_pipeline).to_list(1)
            return result[0]["total"] if result else 0

        # ── Leave date fields stored as "YYYY-MM-DD" strings ─────────────────
        today_str = today_date.isoformat()

        # None of the 15 reads below depends on another's result — they're
        # independent counts/aggregates across several collections — so they
        # run concurrently via asyncio.gather instead of one at a time.
        # "Present today" = employee has a check_in record today, regardless of
        # whether they've punched out or what their status field says.
        # The old status-based query ("present", "late") dropped to zero after
        # short test sessions where work_hours < half_day_threshold → status="half_day".
        (
            total_employees,
            active_employees,
            present_today,
            currently_working,
            late_today,
            half_day_today,
            wfh_today,
            on_break,
            on_leave_today,
            pending_leaves,
            pending_exits,
            payroll_this_month,
            open_jobs,
            candidates_in_pipeline,
            recent_announcements,
        ) = await asyncio.gather(
            emp_col.count_documents({"company_id": company_id, "is_deleted": False}),
            emp_col.count_documents({
                "company_id": company_id, "is_deleted": False, "employment_status": "active",
            }),
            att_col.count_documents({
                "company_id": company_id, "date": today, "check_in": {"$ne": None},
            }),
            # Currently working = clocked in and not yet clocked out
            att_col.count_documents({
                "company_id": company_id, "date": today,
                "check_in": {"$ne": None}, "check_out": None,
            }),
            att_col.count_documents({"company_id": company_id, "date": today, "is_late": True}),
            att_col.count_documents({"company_id": company_id, "date": today, "is_half_day": True}),
            att_col.count_documents({
                "company_id": company_id, "date": today,
                "work_mode": "wfh", "check_in": {"$ne": None},
            }),
            _on_break_count(),
            leave_col.count_documents({
                "company_id": company_id, "status": "approved",
                "from_date": {"$lte": today_str}, "to_date": {"$gte": today_str},
            }),
            leave_col.count_documents({"company_id": company_id, "status": "pending"}),
            exit_col.count_documents({
                "company_id": company_id,
                "status": {"$in": ["submitted", "in_notice", "in_progress"]},
            }),
            payslip_col.count_documents({"company_id": company_id, "month": month, "year": year}),
            job_col.count_documents({"company_id": company_id, "status": "open", "is_deleted": False}),
            cand_col.count_documents({
                "company_id": company_id,
                "current_stage": {"$nin": ["hired", "rejected", "withdrawn"]},
                "is_deleted": False,
            }),
            ann_col.count_documents({"company_id": company_id, "is_active": True}),
        )

        # Absent = active employees who have no attendance record today and are not on leave
        # (depends on 3 of the gathered values above, computed in-memory after they resolve)
        absent_today = max(0, active_employees - present_today - on_leave_today)

        return {
            "total_employees":              total_employees,
            "active_employees":             active_employees,
            "present_today":                present_today,
            "absent_today":                 absent_today,
            "late_today":                   late_today,
            "half_day_today":               half_day_today,
            "wfh_today":                    wfh_today,
            "currently_working":            currently_working,
            "on_break":                     on_break,
            "on_leave_today":               on_leave_today,
            "pending_leaves":               pending_leaves,
            "pending_exits":                pending_exits,
            "payroll_processed_this_month": payroll_this_month,
            "open_jobs":                    open_jobs,
            "candidates_in_pipeline":       candidates_in_pipeline,
            "active_announcements":         recent_announcements,
            "attendance_rate":              round(
                (present_today / total_employees * 100) if total_employees else 0, 1
            ),
        }

    async def get_attendance_trend(self, company_id: str, days: int = 7) -> list:
        """
        Same result as the old per-day loop (oldest → newest, `days` entries,
        each {date, present, late}), but computed with a single aggregation
        instead of 2 count_documents() calls per day (14 round trips for the
        default 7 days). present/late definitions are unchanged: present =
        check_in is set, late = is_late is True, for that exact `date` value.
        """
        att_col = self.db["hrm_attendance"]
        today_date = date.today()
        ordered_dates = [today_date - timedelta(days=i) for i in range(days - 1, -1, -1)]
        ordered_dts = [_date_to_dt(d) for d in ordered_dates]

        pipeline = [
            {"$match": {"company_id": company_id, "date": {"$in": ordered_dts}}},
            {"$group": {
                "_id": "$date",
                # $ifNull normalizes a MISSING check_in field to None before the
                # $ne compare — plain aggregation $ne does NOT treat "missing"
                # the same as null (unlike find()'s {"$ne": None} query matcher,
                # which does), so without this a doc with no check_in field at
                # all would be miscounted as present.
                "present": {"$sum": {"$cond": [
                    {"$ne": [{"$ifNull": ["$check_in", None]}, None]}, 1, 0,
                ]}},
                "late": {"$sum": {"$cond": [{"$eq": ["$is_late", True]}, 1, 0]}},
            }},
        ]
        rows = await att_col.aggregate(pipeline).to_list(None)
        by_date = {row["_id"]: row for row in rows}

        result = []
        for raw_d, d_dt in zip(ordered_dates, ordered_dts):
            row = by_date.get(d_dt)
            result.append({
                "date": raw_d.isoformat(),
                "present": row["present"] if row else 0,
                "late": row["late"] if row else 0,
            })
        return result
