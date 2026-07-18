"""
Employment policy helpers — Probation & Notice Period.

Pure, side-effect-free functions (plus one async company-defaults fetch) shared
by the employee service (create/update, status + probation-end-date computation)
and the leave service (on-probation / on-notice checks). Kept deliberately small
and additive so future features (extend probation, waive/buyout notice, auto
confirmation, reminders) can build on the same resolved values without a schema
redesign.
"""
from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Optional, Tuple

# Fallbacks used only when the company has enabled a default but not stored a
# number (kept identical to the UI's example defaults).
DEFAULT_PROBATION_DAYS = 90
DEFAULT_NOTICE_DAYS = 30

# Lifecycle statuses that HR sets explicitly and which must NOT be overwritten by
# the automatic probation/active computation.
_LIFECYCLE_LOCKED = {
    "notice_period", "resigned", "terminated", "inactive", "on_leave", "pending_hr_review",
}


async def get_employment_defaults(db) -> dict:
    """Read company-wide employment defaults from the company_settings doc.
    Missing/unset → disabled, so existing tenants are unaffected until HR opts in."""
    doc = await db["company_settings"].find_one({}) or {}
    ed = doc.get("employment_defaults") or {}
    return {
        "probation_enabled": bool(ed.get("probation_enabled", False)),
        "probation_days": int(ed.get("probation_days") or DEFAULT_PROBATION_DAYS),
        "notice_enabled": bool(ed.get("notice_enabled", False)),
        "notice_days": int(ed.get("notice_days") if ed.get("notice_days") is not None else DEFAULT_NOTICE_DAYS),
    }


def _status_str(v) -> str:
    """Normalize an employment_status that may be an Enum member or a plain
    string to its lowercase string value (avoids the str(Enum) == 'Cls.X' trap)."""
    return str(getattr(v, "value", v) or "")


def _to_date(v) -> Optional[date]:
    if v is None:
        return None
    if isinstance(v, datetime):
        return v.date()
    if isinstance(v, date):
        return v
    try:
        return date.fromisoformat(str(v)[:10])
    except (ValueError, TypeError):
        return None


def resolve_probation_days(emp: dict, defaults: dict) -> Optional[int]:
    """Effective probation length in days, or None when no probation applies
    (company default disabled, or a custom value of 0/None)."""
    if emp.get("probation_use_company_default", True):
        return defaults["probation_days"] if defaults["probation_enabled"] else None
    d = emp.get("probation_days")
    try:
        d = int(d)
    except (TypeError, ValueError):
        return None
    return d if d > 0 else None


def resolve_notice_days(emp: dict, defaults: dict) -> int:
    """Effective notice length in days (>= 0). 0 when notice does not apply."""
    if emp.get("notice_use_company_default", True):
        return defaults["notice_days"] if defaults["notice_enabled"] else 0
    d = emp.get("notice_days")
    try:
        d = int(d)
    except (TypeError, ValueError):
        return 0
    return d if d >= 0 else 0


def compute_probation_end_date(joining, probation_days: Optional[int]) -> Optional[date]:
    j = _to_date(joining)
    if not j or not probation_days:
        return None
    return j + timedelta(days=int(probation_days))


def is_on_probation(emp: dict, today: Optional[date] = None) -> bool:
    """True while the current date is before the probation end date. Uses the
    stored probation_end_date if present, else recomputes from joining+days."""
    today = today or date.today()
    if _status_str(emp.get("employment_status")) in _LIFECYCLE_LOCKED - {"pending_hr_review"}:
        # Once on notice / resigned / terminated etc., probation no longer gates.
        return False
    end = _to_date(emp.get("probation_end_date"))
    if end is None:
        return False
    return today < end


def is_on_notice(emp: dict) -> bool:
    return _status_str(emp.get("employment_status")) == "notice_period"


def compute_probation_on_save(emp: dict, defaults: dict, today: Optional[date] = None
                              ) -> Tuple[Optional[int], Optional[date], str]:
    """Return (effective_probation_days, probation_end_date, employment_status)
    to persist on create/HR-edit.

    Status rules (section 4): before the probation end date → 'probation';
    on/after → 'active'. HR-set lifecycle statuses (notice/resigned/…) are
    preserved and never auto-overwritten.
    """
    today = today or date.today()
    prob_days = resolve_probation_days(emp, defaults)
    end = compute_probation_end_date(emp.get("date_of_joining"), prob_days)

    current = _status_str(emp.get("employment_status"))
    if current in _LIFECYCLE_LOCKED:
        return prob_days, end, current
    if end is not None and today < end:
        return prob_days, end, "probation"
    return prob_days, end, "active"
