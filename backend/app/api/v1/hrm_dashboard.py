"""HRM — Dashboard API Routes"""
from fastapi import APIRouter, Depends

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.core.redis import get_cache, set_cache
from app.services.hrm_dashboard_service import HRMDashboardService

router = APIRouter(prefix="/hrm/dashboard", tags=["HRM - Dashboard"])

# Cache-aside TTLs. The result is company-wide (keyed on company_id only — the
# service takes no per-user scoping), and the response is a plain JSON-
# serializable dict/list, so it round-trips through Redis cleanly.
# Mirrors the admin dashboard's existing Redis cache-aside pattern.
#   stats: short TTL — includes live-ish counts (present today / on break now),
#          so bounded to 30s to stay fresh while still absorbing the repeated
#          mounts + background polling that hit this endpoint.
#   trend: past-day attendance never changes, so a longer TTL is safe.
_STATS_TTL = 30
_TREND_TTL = 300


@router.get("/stats")
async def get_stats(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:dashboard:view"])),
):
    company_id = cu["company_id"]
    cache_key = f"hrm_dashboard:stats:{company_id}"
    cached = await get_cache(cache_key)
    if cached is not None:
        return cached
    result = await HRMDashboardService(db).get_stats(company_id)
    await set_cache(cache_key, result, ttl_seconds=_STATS_TTL)
    return result


@router.get("/attendance-trend")
async def get_attendance_trend(
    days: int = 7,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:dashboard:view"])),
):
    company_id = cu["company_id"]
    cache_key = f"hrm_dashboard:trend:{company_id}:{days}"
    cached = await get_cache(cache_key)
    if cached is not None:
        return cached
    result = await HRMDashboardService(db).get_attendance_trend(company_id, days)
    await set_cache(cache_key, result, ttl_seconds=_TREND_TTL)
    return result
