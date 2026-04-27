"""HRM — Dashboard API Routes"""
from fastapi import APIRouter, Depends

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.services.hrm_dashboard_service import HRMDashboardService

router = APIRouter(prefix="/hrm/dashboard", tags=["HRM - Dashboard"])


@router.get("/stats")
async def get_stats(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:dashboard:view"])),
):
    return await HRMDashboardService(db).get_stats(cu["company_id"])


@router.get("/attendance-trend")
async def get_attendance_trend(
    days: int = 7,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:dashboard:view"])),
):
    return await HRMDashboardService(db).get_attendance_trend(cu["company_id"], days)
