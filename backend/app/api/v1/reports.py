"""
Reports API Routes - Phase 5
Handles report generation, saving, and scheduling endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import date
import io

from app.core.dependencies import (
    get_company_db,
    get_master_db,
    require_permissions
)
from app.models.company.report import (
    ReportType, ReportCategory, ReportFormat, DateRangePreset,
    DateRange, ReportFilter,
    GenerateReportRequest, SaveReportRequest, UpdateSavedReportRequest,
    ReportResponse, SavedReportResponse, SavedReportListResponse,
    REPORT_TYPE_DISPLAY, REPORT_CATEGORY_DISPLAY, REPORT_TYPE_DESCRIPTIONS
)
from app.services.report_service import ReportService
from app.services.export_service import ExportService

router = APIRouter(prefix="/reports", tags=["Reports"])


# ============== Report Types ==============

# Permissions required to access each report category.
# User needs at least ONE of the listed permissions to see that category's reports.
CATEGORY_PERMISSIONS: dict = {
    ReportCategory.RECRUITMENT: ["candidates:view", "applications:view", "jobs:view"],
    ReportCategory.CLIENT:      ["clients:view"],
    ReportCategory.FINANCIAL:   ["accounts:view"],
    ReportCategory.ONBOARDING:  ["clients:view", "applications:view"],
    ReportCategory.TEAM:        ["users:view"],
    ReportCategory.AUDIT:       ["audit:view"],
    ReportCategory.HRM:         [
        "hrm:employees:view", "hrm:dashboard:view",
        "hrm:attendance:manage", "hrm:payroll:manage",
    ],
}


def _user_can_see_category(user_permissions: list, category: ReportCategory) -> bool:
    """Return True if the user holds at least one permission for the category."""
    required = CATEGORY_PERMISSIONS.get(category)
    if not required:
        return True  # unknown category — allow by default
    return any(p in user_permissions for p in required)


@router.get("/types")
async def get_report_types(
    category: Optional[ReportCategory] = None,
    current_user: dict = Depends(require_permissions(["reports:view"]))
):
    """Get available report types, filtered by the caller's permissions."""
    user_permissions: list = current_user.get("permissions", [])
    report_types = []

    for rt in ReportType:
        rt_category = get_category_for_type(rt)
        if category and rt_category != category:
            continue
        if not _user_can_see_category(user_permissions, rt_category):
            continue

        report_types.append({
            "type": rt.value,
            "name": REPORT_TYPE_DISPLAY.get(rt, rt.value),
            "category": rt_category.value,
            "description": REPORT_TYPE_DESCRIPTIONS.get(rt, "")
        })

    return {"report_types": report_types}


@router.get("/categories")
async def get_report_categories(
    current_user: dict = Depends(require_permissions(["reports:view"]))
):
    """Get report categories"""
    return {
        "categories": [
            {"value": c.value, "label": REPORT_CATEGORY_DISPLAY.get(c, c.value)}
            for c in ReportCategory
        ]
    }


# ============== Report Generation ==============

@router.post("/generate", response_model=ReportResponse)
async def generate_report(
    data: GenerateReportRequest,
    current_user: dict = Depends(require_permissions(["reports:view"])),
    db = Depends(get_company_db),
    master_db = Depends(get_master_db)
):
    """Generate a report"""
    rt_category = get_category_for_type(data.report_type)
    if not _user_can_see_category(current_user.get("permissions", []), rt_category):
        raise HTTPException(status_code=403, detail="You do not have permission to generate this report")
    service = ReportService(db, master_db=master_db)

    return await service.generate_report(
        report_type=data.report_type,
        company_id=current_user["company_id"],
        filters=data.filters,
        user_id=current_user["id"]
    )


@router.post("/generate/{report_type}")
async def generate_report_by_type(
    report_type: ReportType,
    start_date: Optional[date] = None,
    end_date: Optional[date] = None,
    preset: Optional[DateRangePreset] = None,
    client_ids: Optional[str] = None,
    partner_ids: Optional[str] = None,
    group_by: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["reports:view"])),
    db = Depends(get_company_db),
    master_db = Depends(get_master_db)
):
    """Generate a specific report type with query parameters"""
    rt_category = get_category_for_type(report_type)
    if not _user_can_see_category(current_user.get("permissions", []), rt_category):
        raise HTTPException(status_code=403, detail="You do not have permission to generate this report")
    service = ReportService(db, master_db=master_db)

    filters = ReportFilter(
        date_range=DateRange(
            preset=preset,
            start_date=start_date,
            end_date=end_date
        ),
        client_ids=client_ids.split(",") if client_ids else None,
        partner_ids=partner_ids.split(",") if partner_ids else None,
        group_by=group_by
    )

    return await service.generate_report(
        report_type=report_type,
        company_id=current_user["company_id"],
        filters=filters,
        user_id=current_user["id"]
    )


# ============== Report Export ==============

@router.post("/export")
async def export_report(
    data: GenerateReportRequest,
    current_user: dict = Depends(require_permissions(["reports:export"])),
    db = Depends(get_company_db),
    master_db = Depends(get_master_db)
):
    """Export a report to file"""
    report_service = ReportService(db, master_db=master_db)
    export_service = ExportService(db)

    report = await report_service.generate_report(
        report_type=data.report_type,
        company_id=current_user["company_id"],
        filters=data.filters,
        user_id=current_user["id"]
    )

    content, filename = await export_service.export_report_data(
        report_data=report.data,
        report_name=report.report_name,
        format=data.format
    )

    if data.format == ReportFormat.EXCEL:
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    elif data.format == ReportFormat.CSV:
        content_type = "text/csv"
    elif data.format == ReportFormat.PDF:
        content_type = "application/pdf"
    else:
        content_type = "application/json"

    if isinstance(content, bytes):
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        return StreamingResponse(
            io.StringIO(content),
            media_type=content_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )


# ============== Saved Reports ==============

@router.get("/saved", response_model=SavedReportListResponse)
async def list_saved_reports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    category: Optional[ReportCategory] = None,
    current_user: dict = Depends(require_permissions(["reports:view"])),
    db = Depends(get_company_db)
):
    """List saved reports"""
    service = ReportService(db)

    return await service.list_saved_reports(
        company_id=current_user["company_id"],
        user_id=current_user["id"],
        category=category,
        page=page,
        page_size=page_size
    )


@router.post("/saved", response_model=SavedReportResponse, status_code=status.HTTP_201_CREATED)
async def save_report(
    data: SaveReportRequest,
    current_user: dict = Depends(require_permissions(["reports:create"])),
    db = Depends(get_company_db)
):
    """Save a report configuration"""
    service = ReportService(db)

    return await service.save_report(
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )


@router.get("/saved/{report_id}", response_model=SavedReportResponse)
async def get_saved_report(
    report_id: str,
    current_user: dict = Depends(require_permissions(["reports:view"])),
    db = Depends(get_company_db)
):
    """Get a saved report"""
    service = ReportService(db)

    report = await service.get_saved_report(
        report_id=report_id,
        company_id=current_user["company_id"]
    )

    if not report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved report not found"
        )

    return report


@router.put("/saved/{report_id}", response_model=SavedReportResponse)
async def update_saved_report(
    report_id: str,
    data: UpdateSavedReportRequest,
    current_user: dict = Depends(require_permissions(["reports:edit"])),
    db = Depends(get_company_db)
):
    """Update a saved report"""
    service = ReportService(db)

    result = await service.update_saved_report(
        report_id=report_id,
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )

    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved report not found"
        )

    return result


@router.delete("/saved/{report_id}")
async def delete_saved_report(
    report_id: str,
    current_user: dict = Depends(require_permissions(["reports:delete"])),
    db = Depends(get_company_db)
):
    """Delete a saved report"""
    service = ReportService(db)

    success = await service.delete_saved_report(
        report_id=report_id,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )

    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved report not found"
        )

    return {"message": "Saved report deleted successfully"}


@router.post("/saved/{report_id}/run", response_model=ReportResponse)
async def run_saved_report(
    report_id: str,
    current_user: dict = Depends(require_permissions(["reports:view"])),
    db = Depends(get_company_db),
    master_db = Depends(get_master_db)
):
    """Run a saved report"""
    service = ReportService(db, master_db=master_db)

    saved_report = await service.get_saved_report(
        report_id=report_id,
        company_id=current_user["company_id"]
    )

    if not saved_report:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Saved report not found"
        )

    filters = ReportFilter(**saved_report.filters) if saved_report.filters else None

    return await service.generate_report(
        report_type=saved_report.report_type,
        company_id=current_user["company_id"],
        filters=filters,
        user_id=current_user["id"]
    )


# ============== Helper Functions ==============

def get_category_for_type(report_type: ReportType) -> ReportCategory:
    """Get category for a report type"""
    if report_type in {
        ReportType.PLACEMENTS_SUMMARY, ReportType.APPLICATION_FUNNEL,
        ReportType.TIME_TO_HIRE, ReportType.SOURCE_EFFECTIVENESS,
        ReportType.JOB_AGING, ReportType.CANDIDATE_PIPELINE,
        ReportType.INTERVIEW_CONVERSION, ReportType.RECRUITER_PERFORMANCE,
    }:
        return ReportCategory.RECRUITMENT
    if report_type in {ReportType.CLIENT_SUMMARY, ReportType.CLIENT_HIRING_TREND}:
        return ReportCategory.CLIENT
    if report_type in {
        ReportType.PAYOUT_SUMMARY, ReportType.INVOICE_AGING,
        ReportType.REVENUE_BY_CLIENT, ReportType.COMMISSION_TRENDS,
        ReportType.PAYMENT_HISTORY, ReportType.TAX_SUMMARY,
    }:
        return ReportCategory.FINANCIAL
    if report_type in {
        ReportType.OFFER_ACCEPTANCE, ReportType.NO_SHOW_ANALYSIS,
        ReportType.DOJ_EXTENSIONS, ReportType.DOCUMENT_COMPLIANCE,
        ReportType.PAYOUT_ELIGIBILITY,
    }:
        return ReportCategory.ONBOARDING
    if report_type in {ReportType.LOGIN_ACTIVITY, ReportType.USER_ACTIONS}:
        return ReportCategory.AUDIT
    if report_type in {
        ReportType.HRM_ATTENDANCE_SUMMARY, ReportType.HRM_LEAVE_SUMMARY,
        ReportType.HRM_PAYROLL_SUMMARY, ReportType.HRM_HEADCOUNT,
        ReportType.HRM_EMPLOYEE_DIRECTORY, ReportType.HRM_ASSET_REGISTER,
        ReportType.HRM_EXIT_SUMMARY,
    }:
        return ReportCategory.HRM
    return ReportCategory.TEAM
