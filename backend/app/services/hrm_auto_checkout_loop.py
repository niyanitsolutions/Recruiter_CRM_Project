"""Midnight auto punch-out background loop.

Runs once per hour.  At the hour closest to midnight (00:00–00:59 UTC) it
auto-punches-out any employee still clocked in across ALL tenant databases.

Key fix: the loop queries for records from PREVIOUS days (date < today), not
today's records.  When this runs at 00:00 UTC the open records belong to
yesterday — querying "today" (the new calendar day) would find nothing.
"""
import asyncio
import logging
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

_POLL_INTERVAL_SECONDS = 3600  # check once per hour


async def hrm_auto_checkout_loop() -> None:
    """Background task: auto punch-out at midnight for every tenant."""
    _ran_today: str = ""  # tracks date string to avoid running twice in same night

    while True:
        try:
            await asyncio.sleep(_POLL_INTERVAL_SECONDS)

            now = datetime.now(timezone.utc)
            today_str = now.strftime("%Y-%m-%d")

            # Only run between 00:00 and 00:59 UTC and only once per calendar day
            if now.hour == 0 and _ran_today != today_str:
                _ran_today = today_str
                await _run_auto_checkout(source="scheduler")

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("hrm_auto_checkout_loop error (will retry next hour): %s", exc)


async def run_startup_recovery() -> None:
    """Layer-2 recovery sweep run once at app startup.

    Closes any attendance records left open from a previous day because the
    server was down, restarted, or crashed before the midnight loop above
    could run for that calendar day. Independent of time-of-day — runs
    immediately regardless of when the app happens to start.
    """
    await _run_auto_checkout(source="startup_recovery")


async def _run_auto_checkout(source: str = "scheduler") -> None:
    """Punch out all open attendance records from previous days across every active tenant DB.

    auto_checkout_all() now queries for records with date < today, which is the
    correct set whether this runs just after midnight UTC (normal schedule) or
    as a recovery sweep at an arbitrary time (startup/login/dashboard load).
    """
    try:
        from app.core.database import get_master_db, DatabaseManager
        from app.services.attendance_service import AttendanceService

        master_db = get_master_db()
        # Company DBs are keyed by the short company_id, NOT the tenant _id (UUID) —
        # using _id here resolved non-existent DB names and the sweep closed nothing.
        tenant_ids = await master_db.tenants.distinct(
            "company_id", {"is_deleted": {"$ne": True}, "is_active": {"$ne": False}}
        )

        total = 0
        for tid in tenant_ids:
            try:
                db = DatabaseManager.get_company_db(tid)
                count = await AttendanceService(db).auto_checkout_all(company_id=tid, source=source)
                if count:
                    logger.info("Auto punch-out (%s): %d record(s) closed for tenant %s", source, count, tid)
                    total += count
            except Exception as tenant_exc:
                logger.warning("Auto punch-out failed for tenant %s: %s", tid, tenant_exc)

        if total:
            logger.info("Auto punch-out complete (%s): %d total record(s) closed", source, total)

    except Exception as exc:
        logger.error("_run_auto_checkout failed: %s", exc)
