"""
Shared date utilities — resolve date preset strings to (start_date, end_date) tuples.
"""
import calendar
from datetime import date, timedelta
from typing import Optional, Tuple


def resolve_date_preset(preset: str, today: Optional[date] = None) -> Tuple[date, date]:
    """
    Convert a date preset string to a (start_date, end_date) tuple.
    Returns (first_of_current_month, today) for unrecognised presets.
    """
    if today is None:
        today = date.today()

    if preset == "today":
        return today, today

    if preset == "yesterday":
        y = today - timedelta(days=1)
        return y, y

    if preset == "this_week":
        start = today - timedelta(days=today.weekday())
        return start, today

    if preset == "last_week":
        start = today - timedelta(days=today.weekday() + 7)
        end   = start + timedelta(days=6)
        return start, end

    if preset == "this_month":
        return today.replace(day=1), today

    if preset == "last_month":
        end   = today.replace(day=1) - timedelta(days=1)
        start = end.replace(day=1)
        return start, end

    if preset == "this_quarter":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        return today.replace(month=q_start_month, day=1), today

    if preset == "last_quarter":
        q_start_month = ((today.month - 1) // 3) * 3 + 1
        lq_end = today.replace(month=q_start_month, day=1) - timedelta(days=1)
        lq_start_month = ((lq_end.month - 1) // 3) * 3 + 1
        lq_last_day = calendar.monthrange(lq_end.year, lq_end.month)[1]
        return lq_end.replace(month=lq_start_month, day=1), lq_end.replace(day=lq_last_day)

    if preset == "last_6_months":
        return today - timedelta(days=182), today

    if preset == "last_12_months":
        return today - timedelta(days=365), today

    if preset == "this_year":
        return today.replace(month=1, day=1), today

    if preset == "last_year":
        return date(today.year - 1, 1, 1), date(today.year - 1, 12, 31)

    # fallback
    return today.replace(day=1), today
