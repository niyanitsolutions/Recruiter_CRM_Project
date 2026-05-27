"""HRM — Dashboard Service"""
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

        emp_col = self.db["hrm_employees"]
        att_col = self.db["hrm_attendance"]
        leave_col = self.db["hrm_leaves"]
        payslip_col = self.db["hrm_payslips"]
        ann_col = self.db["hrm_announcements"]
        job_col = self.db["hrm_jobs"]
        cand_col = self.db["hrm_candidates"]
        exit_col = self.db["hrm_exit"]

        total_employees = await emp_col.count_documents({"company_id": company_id, "is_deleted": False, "employment_status": "active"})

        present_today = await att_col.count_documents({
            "company_id": company_id,
            "date": today,
            "status": {"$in": ["present", "late"]},
        })

        late_today = await att_col.count_documents({
            "company_id": company_id,
            "date": today,
            "is_late": True,
        })

        # Leave date fields may be stored as string ("YYYY-MM-DD"), date, or datetime.
        # Use string comparison for portability — isoformat gives "YYYY-MM-DD" which sorts correctly.
        today_str = today_date.isoformat()
        on_leave_today = await leave_col.count_documents({
            "company_id": company_id,
            "status": "approved",
            "from_date": {"$lte": today_str},
            "to_date": {"$gte": today_str},
        })

        pending_leaves = await leave_col.count_documents({
            "company_id": company_id,
            "status": "pending",
        })

        pending_exits = await exit_col.count_documents({
            "company_id": company_id,
            "status": {"$in": ["submitted", "in_notice", "in_progress"]},
        })

        payroll_this_month = await payslip_col.count_documents({
            "company_id": company_id,
            "month": month,
            "year": year,
        })

        open_jobs = await job_col.count_documents({"company_id": company_id, "status": "open", "is_deleted": False})

        candidates_in_pipeline = await cand_col.count_documents({
            "company_id": company_id,
            "current_stage": {"$nin": ["hired", "rejected", "withdrawn"]},
            "is_deleted": False,
        })

        recent_announcements = await ann_col.count_documents({
            "company_id": company_id,
            "is_active": True,
        })

        absent_today = max(0, total_employees - present_today - on_leave_today)

        return {
            "total_employees": total_employees,
            "present_today": present_today,
            "absent_today": absent_today,
            "late_today": late_today,
            "on_leave_today": on_leave_today,
            "pending_leaves": pending_leaves,
            "pending_exits": pending_exits,
            "payroll_processed_this_month": payroll_this_month,
            "open_jobs": open_jobs,
            "candidates_in_pipeline": candidates_in_pipeline,
            "active_announcements": recent_announcements,
            "attendance_rate": round((present_today / total_employees * 100) if total_employees else 0, 1),
        }

    async def get_attendance_trend(self, company_id: str, days: int = 7) -> list:
        att_col = self.db["hrm_attendance"]
        today_date = date.today()
        result = []
        for i in range(days - 1, -1, -1):
            raw_d = today_date - timedelta(days=i)
            d_dt = _date_to_dt(raw_d)
            present = await att_col.count_documents({
                "company_id": company_id,
                "date": d_dt,
                "status": {"$in": ["present", "late"]},
            })
            late = await att_col.count_documents({
                "company_id": company_id,
                "date": d_dt,
                "is_late": True,
            })
            result.append({"date": raw_d.isoformat(), "present": present, "late": late})
        return result
