"""HRM — Dashboard Service"""
from datetime import datetime, date, timezone
from typing import Optional


class HRMDashboardService:
    def __init__(self, db):
        self.db = db

    async def get_stats(self, company_id: str) -> dict:
        today = date.today()
        month = today.month
        year = today.year

        emp_col = self.db["hrm_employees"]
        att_col = self.db["hrm_attendance"]
        leave_col = self.db["hrm_leaves"]
        payslip_col = self.db["hrm_payslips"]
        ann_col = self.db["hrm_announcements"]
        job_col = self.db["hrm_jobs"]
        cand_col = self.db["hrm_candidates"]

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

        on_leave_today = await leave_col.count_documents({
            "company_id": company_id,
            "status": "approved",
            "from_date": {"$lte": today},
            "to_date": {"$gte": today},
        })

        pending_leaves = await leave_col.count_documents({
            "company_id": company_id,
            "status": "pending",
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
            "pending_leave_requests": pending_leaves,
            "payroll_processed_this_month": payroll_this_month,
            "open_jobs": open_jobs,
            "candidates_in_pipeline": candidates_in_pipeline,
            "active_announcements": recent_announcements,
            "attendance_rate": round((present_today / total_employees * 100) if total_employees else 0, 1),
        }

    async def get_attendance_trend(self, company_id: str, days: int = 7) -> list:
        from datetime import timedelta
        att_col = self.db["hrm_attendance"]
        today = date.today()
        result = []
        for i in range(days - 1, -1, -1):
            d = today - timedelta(days=i)
            present = await att_col.count_documents({
                "company_id": company_id,
                "date": d,
                "status": {"$in": ["present", "late"]},
            })
            late = await att_col.count_documents({
                "company_id": company_id,
                "date": d,
                "is_late": True,
            })
            result.append({"date": d.isoformat(), "present": present, "late": late})
        return result
