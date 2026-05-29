"""Midnight auto punch-out background loop.

Runs once per hour. At the hour closest to midnight (00:00–00:59) it
auto-punches-out any employee still clocked in across ALL tenant databases.
This ensures no attendance record stays open past midnight regardless of
whether a scheduled task was set up per company.
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
                await _run_auto_checkout()

        except asyncio.CancelledError:
            break
        except Exception as exc:
            logger.warning("hrm_auto_checkout_loop error (will retry next hour): %s", exc)


async def _run_auto_checkout() -> None:
    """Punch out all open attendance records across every active tenant DB."""
    try:
        from app.core.database import get_master_db, DatabaseManager
        from app.services.attendance_service import AttendanceService

        master_db = get_master_db()
        tenant_ids = await master_db.tenants.distinct(
            "_id", {"is_deleted": {"$ne": True}, "is_active": {"$ne": False}}
        )

        total = 0
        for tid in tenant_ids:
            try:
                db = DatabaseManager.get_company_db(tid)
                count = await AttendanceService(db).auto_checkout_all(company_id=tid)
                if count:
                    logger.info("Auto punch-out: %d record(s) closed for tenant %s", count, tid)
                    total += count
            except Exception as tenant_exc:
                logger.warning("Auto punch-out failed for tenant %s: %s", tid, tenant_exc)

        if total:
            logger.info("Auto punch-out complete: %d total record(s) closed", total)

    except Exception as exc:
        logger.error("_run_auto_checkout failed: %s", exc)
