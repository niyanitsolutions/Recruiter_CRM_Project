"""Regression tests for the production-readiness audit fixes.

Covers the pure-logic pieces added during the audit:
  - Application status state machine (Phase 1)
  - Payroll working-day / present-day / paid-leave / LOP math (Phase 4/6)
"""
from datetime import date

from app.models.company.application import (
    ApplicationStatus,
    ACTIVE_APPLICATION_STATUSES,
    is_valid_status_transition,
)
from app.services.payroll_service import PayrollService


# ── Application state machine ──────────────────────────────────────────────────

class TestApplicationTransitions:
    def test_unknown_status_rejected(self):
        ok, err = is_valid_status_transition("applied", "banana")
        assert not ok and "Invalid" in err

    def test_joined_is_terminal(self):
        for target in ("applied", "rejected", "offered", "withdrawn"):
            ok, _ = is_valid_status_transition("joined", target)
            assert not ok, f"joined → {target} must be blocked"

    def test_rejected_cannot_jump_to_hiring_outcome(self):
        for target in ("selected", "offered", "offer_accepted", "joined", "withdrawn"):
            ok, _ = is_valid_status_transition("rejected", target)
            assert not ok, f"rejected → {target} must be blocked"

    def test_rejected_can_reenter_pipeline(self):
        ok, _ = is_valid_status_transition("rejected", "screening")
        assert ok

    def test_withdrawn_cannot_be_rejected(self):
        ok, _ = is_valid_status_transition("withdrawn", "rejected")
        assert not ok

    def test_normal_forward_flow_allowed(self):
        flow = ["applied", "eligible", "screening", "shortlisted", "interview",
                "selected", "offered", "offer_accepted", "joined"]
        for prev, nxt in zip(flow, flow[1:]):
            ok, err = is_valid_status_transition(prev, nxt)
            assert ok, f"{prev} → {nxt} should be allowed: {err}"

    def test_same_status_is_noop_valid(self):
        ok, _ = is_valid_status_transition("interview", "interview")
        assert ok

    def test_active_statuses_cover_pipeline(self):
        assert "eligible" in ACTIVE_APPLICATION_STATUSES
        assert "selected" in ACTIVE_APPLICATION_STATUSES
        assert "offer_accepted" in ACTIVE_APPLICATION_STATUSES
        for terminal in ("rejected", "withdrawn", "joined", "offer_declined"):
            assert terminal not in ACTIVE_APPLICATION_STATUSES

    def test_every_status_value_is_enum_member(self):
        values = {s.value for s in ApplicationStatus}
        for s in ACTIVE_APPLICATION_STATUSES:
            assert s in values


# ── Payroll math ────────────────────────────────────────────────────────────────

class TestPayrollCalculations:
    def test_working_days_mon_fri(self):
        # June 2026: 30 days, starts Monday → 22 Mon-Fri days
        assert PayrollService._calc_working_days(2026, 6, set()) == 22

    def test_working_days_excludes_holidays(self):
        # 2026-06-01 is a Monday (working day)
        assert PayrollService._calc_working_days(2026, 6, {"2026-06-01"}) == 21

    def test_working_days_six_day_week(self):
        # Mon-Sat working: June 2026 has 4 Sundays → 26 working days
        assert PayrollService._calc_working_days(2026, 6, set(), {0, 1, 2, 3, 4, 5}) == 26

    def test_present_days_skips_holiday_placeholders(self):
        records = [
            {"status": "present", "check_in": "x"},
            {"status": "holiday", "check_in": None},   # auto-marked placeholder → 0
            {"status": "holiday", "check_in": "x"},    # actually worked → 1
            {"status": "half_day", "check_in": "x"},
            {"status": "absent", "check_in": None},
        ]
        assert PayrollService._calc_present_days(records) == 2.5

    def test_paid_leave_excludes_non_working_days_and_present_days(self):
        # Leave Mon 2026-06-01 .. Sun 2026-06-07, Mon-Fri week
        leaves = [{
            "leave_type": "casual", "duration": "full_day",
            "from_date": date(2026, 6, 1), "to_date": date(2026, 6, 7),
        }]
        # 5 working days in range; employee attended 2026-06-03 → 4 paid leave days
        days = PayrollService._calc_paid_leave_days(
            leaves, 2026, 6, set(), {0, 1, 2, 3, 4}, {"2026-06-03"}
        )
        assert days == 4.0

    def test_unpaid_leave_not_counted(self):
        leaves = [{
            "leave_type": "unpaid", "duration": "full_day",
            "from_date": date(2026, 6, 1), "to_date": date(2026, 6, 5),
        }]
        assert PayrollService._calc_paid_leave_days(leaves, 2026, 6, set()) == 0.0

    def test_lop_deduction_masks_nothing(self):
        salary = {"gross_earnings": 22000.0, "_statutory_deductions": 1000.0}
        out = PayrollService._apply_attendance(dict(salary), 22, 20.0, 0.0)
        # 2 LOP days at 1000/day
        assert out["lop_days"] == 2.0
        assert out["lop_deduction"] == 2000.0
        assert out["net_salary"] == 22000.0 - 2000.0 - 1000.0

    def test_full_attendance_no_lop(self):
        salary = {"gross_earnings": 22000.0, "_statutory_deductions": 0.0}
        out = PayrollService._apply_attendance(dict(salary), 22, 20.0, 2.0)
        assert out["lop_days"] == 0.0
        assert out["net_salary"] == 22000.0

    def test_mid_month_joiner_prorated(self):
        # Joined 2026-06-16 (Tuesday). June 2026 Mon-Fri working days = 22,
        # expected days from the 16th = 11.
        expected = PayrollService._calc_expected_days(
            2026, 6, set(), {0, 1, 2, 3, 4}, date(2026, 6, 16), None
        )
        assert expected == 11

        salary = {"gross_earnings": 22000.0, "_statutory_deductions": 0.0}
        out = PayrollService._apply_attendance(dict(salary), 22, 11.0, 0.0, expected)
        # Fully present after joining: LOP = 11 out-of-window days only
        assert out["lop_days"] == 11.0
        assert out["net_salary"] == 22000.0 - round(22000.0 / 22 * 11, 2)

    def test_full_month_employee_returns_none_expected(self):
        assert PayrollService._calc_expected_days(
            2026, 6, set(), None, date(2020, 1, 1), None
        ) is None
