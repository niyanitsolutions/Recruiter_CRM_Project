"""Deterministic tests for the subscription enhancements:
prorated seat billing, cycle pricing, remaining-validity math,
and the renewal-queue state machine.
"""
from datetime import datetime, timezone

from app.services.payment_service import (
    CYCLE_DAYS,
    CYCLE_MONTHS,
    cycle_price_per_seat,
    remaining_validity_days,
    prorated_seat_amount,
)
from app.services.subscription_queue_service import VALID_TRANSITIONS


PLAN = {
    "price_per_user_monthly": 300,   # ₹300 / seat / month (requirement example)
    "price_per_user_yearly": 250,    # discounted yearly per-user monthly-equivalent
}


def _tenant(start: datetime, expiry: datetime, cycle: str = "monthly") -> dict:
    return {"plan_start_date": start, "plan_expiry": expiry, "billing_cycle": cycle, "max_users": 10}


class TestCyclePricing:
    def test_cycle_tables_consistent(self):
        assert set(CYCLE_DAYS) == set(CYCLE_MONTHS) == {"monthly", "quarterly", "half_yearly", "yearly"}
        assert CYCLE_DAYS["quarterly"] == 90 and CYCLE_DAYS["half_yearly"] == 180

    def test_monthly_price(self):
        assert cycle_price_per_seat(PLAN, "monthly") == 300

    def test_quarterly_price_is_three_months(self):
        assert cycle_price_per_seat(PLAN, "quarterly") == 900

    def test_half_yearly_price_is_six_months(self):
        assert cycle_price_per_seat(PLAN, "half_yearly") == 1800

    def test_yearly_price_uses_discounted_rate(self):
        assert cycle_price_per_seat(PLAN, "yearly") == 250 * 12


class TestRemainingValidity:
    def test_requirement_example_six_days_remaining(self):
        # 1 Jul → 31 Jul cycle, "now" = 25 Jul → 6 days remain, 30 total
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 7, 31, tzinfo=timezone.utc)
        now = datetime(2026, 7, 25, tzinfo=timezone.utc)
        remaining, total = remaining_validity_days(_tenant(start, expiry), now)
        assert remaining == 6
        assert total == 30

    def test_expired_subscription_returns_zero(self):
        start = datetime(2026, 6, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 7, 1, tzinfo=timezone.utc)
        now = datetime(2026, 7, 15, tzinfo=timezone.utc)
        remaining, _ = remaining_validity_days(_tenant(start, expiry), now)
        assert remaining == 0

    def test_partial_day_rounds_up(self):
        # 12 hours left → still 1 billable remaining day (ceil)
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 7, 31, tzinfo=timezone.utc)
        now = datetime(2026, 7, 30, 12, 0, tzinfo=timezone.utc)
        remaining, _ = remaining_validity_days(_tenant(start, expiry), now)
        assert remaining == 1

    def test_leap_year_february_cycle(self):
        # 2028 is a leap year: 1 Feb → 1 Mar is 29 actual days
        start = datetime(2028, 2, 1, tzinfo=timezone.utc)
        expiry = datetime(2028, 3, 1, tzinfo=timezone.utc)
        now = datetime(2028, 2, 15, tzinfo=timezone.utc)
        remaining, total = remaining_validity_days(_tenant(start, expiry), now)
        assert total == 29
        assert remaining == 15

    def test_naive_datetimes_treated_as_utc(self):
        # Motor returns naive datetimes — must not crash or mis-compare
        start = datetime(2026, 7, 1)
        expiry = datetime(2026, 7, 31)
        now = datetime(2026, 7, 25, tzinfo=timezone.utc)
        remaining, total = remaining_validity_days(_tenant(start, expiry), now)
        assert (remaining, total) == (6, 30)

    def test_missing_start_falls_back_to_cycle_days(self):
        expiry = datetime(2026, 7, 31, tzinfo=timezone.utc)
        now = datetime(2026, 7, 25, tzinfo=timezone.utc)
        t = {"plan_expiry": expiry, "billing_cycle": "quarterly", "max_users": 5}
        remaining, total = remaining_validity_days(t, now)
        assert remaining == 6
        assert total == 90


class TestProratedSeatBilling:
    def test_requirement_example(self):
        # ₹300/seat/month, 6 of 30 days remaining → ₹60 per seat; 3 seats = ₹180
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 7, 31, tzinfo=timezone.utc)
        now = datetime(2026, 7, 25, tzinfo=timezone.utc)
        amount, remaining, total = prorated_seat_amount(PLAN, _tenant(start, expiry), 3, now)
        assert (remaining, total) == (6, 30)
        assert amount == 180  # 300/30*6 = 60 per seat × 3

    def test_never_full_price_when_partial_cycle(self):
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 7, 31, tzinfo=timezone.utc)
        now = datetime(2026, 7, 2, tzinfo=timezone.utc)  # 29 of 30 days remain
        amount, _, _ = prorated_seat_amount(PLAN, _tenant(start, expiry), 1, now)
        assert amount < 300

    def test_yearly_cycle_proration(self):
        # Yearly plan: cycle price/seat = 250*12 = 3000, half the year remaining
        start = datetime(2026, 1, 1, tzinfo=timezone.utc)
        expiry = datetime(2027, 1, 1, tzinfo=timezone.utc)   # 365 days
        now = datetime(2026, 7, 2, 12, tzinfo=timezone.utc)
        t = _tenant(start, expiry, cycle="yearly")
        amount, remaining, total = prorated_seat_amount(PLAN, t, 1, now)
        assert total == 365
        assert amount == int(round(3000 / 365 * remaining))

    def test_quarterly_cycle_proration(self):
        start = datetime(2026, 7, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 9, 29, tzinfo=timezone.utc)  # 90 days
        now = datetime(2026, 9, 20, tzinfo=timezone.utc)     # 9 days remain
        t = _tenant(start, expiry, cycle="quarterly")
        amount, remaining, total = prorated_seat_amount(PLAN, t, 2, now)
        assert (remaining, total) == (9, 90)
        assert amount == int(round(900 / 90 * 9)) * 2  # ₹90/seat × 2

    def test_expired_returns_zero_amount(self):
        start = datetime(2026, 6, 1, tzinfo=timezone.utc)
        expiry = datetime(2026, 6, 30, tzinfo=timezone.utc)
        now = datetime(2026, 7, 15, tzinfo=timezone.utc)
        amount, remaining, _ = prorated_seat_amount(PLAN, _tenant(start, expiry), 3, now)
        assert amount == 0 and remaining == 0


class TestQueueStateMachine:
    def test_queued_can_activate_or_cancel(self):
        assert VALID_TRANSITIONS["queued"] == {"active", "cancelled"}

    def test_active_can_only_expire(self):
        assert VALID_TRANSITIONS["active"] == {"expired"}

    def test_terminal_states_immutable(self):
        assert VALID_TRANSITIONS["expired"] == set()
        assert VALID_TRANSITIONS["cancelled"] == set()

    def test_no_direct_queued_to_expired(self):
        assert "expired" not in VALID_TRANSITIONS["queued"]

    def test_no_reactivation_of_cancelled(self):
        for target in ("queued", "active"):
            assert target not in VALID_TRANSITIONS["cancelled"]
