"""
Presence Service

Single source of truth for "is this user online right now" across the app.
A session counts as truly active only if it is flagged active, not expired,
and has a heartbeat within SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS — the same
definition already used by the dashboard "Online Users" KPI. Any other place
that needs to know who's online should call this instead of re-deriving its
own threshold/expiry check.
"""
from datetime import datetime, timedelta, timezone

from app.core.database import get_master_db


async def get_online_user_ids(company_id: str) -> set:
    """User ids in `company_id` with a truly-active session right now."""
    from app.services.auth_service import SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS

    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(seconds=SESSION_TRULY_ACTIVE_THRESHOLD_SECONDS)
    master_db = get_master_db()
    ids = await master_db.sessions.distinct("user_id", {
        "company_id": company_id,
        "is_active": True,
        "expires_at": {"$gt": now},
        "last_activity_at": {"$gte": cutoff},
    })
    return set(ids)
