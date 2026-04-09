"""
Export API - Direct streaming export for all CRM modules.

Endpoints:
  Company (requires exports:create):
    GET /export/candidates
    GET /export/jobs
    GET /export/clients
    GET /export/applications
    GET /export/interviews
    GET /export/users

  Super Admin only:
    GET /export/tenants
    GET /export/resellers

Supports format=csv and format=pdf.
All exports are streamed directly — no intermediate job/file storage needed.
"""
from fastapi import APIRouter, Depends, Query
from fastapi.responses import StreamingResponse
from typing import Optional
from datetime import datetime, timezone
import csv
import io

from app.core.dependencies import get_company_db, require_permissions
from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database

router = APIRouter(prefix="/export", tags=["Export"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _parse_date(d: Optional[str], end_of_day: bool = False) -> Optional[datetime]:
    if not d:
        return None
    try:
        dt = datetime.strptime(d, "%Y-%m-%d")
        if end_of_day:
            return dt.replace(hour=23, minute=59, second=59, tzinfo=timezone.utc)
        return dt.replace(tzinfo=timezone.utc)
    except ValueError:
        return None


def _fmt(val) -> str:
    """Safely convert any MongoDB field value to a string."""
    if val is None:
        return ""
    if isinstance(val, datetime):
        return val.strftime("%Y-%m-%d %H:%M")
    if isinstance(val, list):
        return ", ".join(str(v) for v in val)
    return str(val)


def _fmt_skills(skills) -> str:
    """Convert skills list (list of dicts or strings) to a comma-separated string."""
    if not skills:
        return ""
    names = []
    for s in skills:
        if isinstance(s, dict):
            names.append(s.get("name", str(s)))
        else:
            names.append(str(s))
    return ", ".join(names)


def _filename(module: str, fmt: str) -> str:
    return f"{module}_{datetime.now().strftime('%Y-%m-%d')}.{fmt}"


def _csv_response(headers: list, rows: list, module: str) -> StreamingResponse:
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(headers)
    writer.writerows(rows)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="{_filename(module, "csv")}"'},
    )


def _pdf_response(title: str, headers: list, rows: list, module: str) -> StreamingResponse:
    """Generate a landscape A4 PDF table and stream it."""
    try:
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import A4, landscape
        from reportlab.lib.units import cm
        from reportlab.lib.styles import getSampleStyleSheet
        from reportlab.platypus import SimpleDocTemplate, Table, TableStyle, Paragraph, Spacer
    except ImportError:
        # reportlab not installed — fall back to CSV with a note
        rows.insert(0, ["[PDF unavailable — reportlab not installed. Showing CSV fallback.]"])
        return _csv_response(headers, rows, module)

    buf = io.BytesIO()
    page = landscape(A4)
    doc = SimpleDocTemplate(
        buf,
        pagesize=page,
        leftMargin=1 * cm,
        rightMargin=1 * cm,
        topMargin=1.5 * cm,
        bottomMargin=1.5 * cm,
    )
    styles = getSampleStyleSheet()
    story = []

    story.append(Paragraph(title, styles["Title"]))
    story.append(Spacer(1, 0.3 * cm))
    story.append(Paragraph(
        f"Generated: {datetime.now().strftime('%Y-%m-%d %H:%M')}  |  Total records: {len(rows)}",
        styles["Normal"],
    ))
    story.append(Spacer(1, 0.5 * cm))

    col_count = len(headers)
    usable_width = page[0] - 2 * cm
    # Distribute widths: wider columns for name/email/skills, narrower for status/dates
    base_width = usable_width / col_count
    if col_count > 0:
        col_widths = [base_width] * col_count
        # Give extra space to text-heavy columns (name, email, skills) and shrink narrow ones
        if col_count >= 4:
            wide_cols = min(3, col_count)
            narrow_cols = col_count - wide_cols
            wide_w = usable_width * 0.55 / wide_cols
            narrow_w = usable_width * 0.45 / max(narrow_cols, 1) if narrow_cols else base_width
            col_widths = [wide_w] * wide_cols + [narrow_w] * narrow_cols
    else:
        col_widths = [base_width]

    table_data = [headers] + rows
    t = Table(table_data, colWidths=col_widths, repeatRows=1)
    t.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, 0),  colors.HexColor("#4F46E5")),
        ("TEXTCOLOR",     (0, 0), (-1, 0),  colors.white),
        ("FONTNAME",      (0, 0), (-1, 0),  "Helvetica-Bold"),
        ("FONTSIZE",      (0, 0), (-1, 0),  8),
        ("ALIGN",         (0, 0), (-1, 0),  "CENTER"),
        ("FONTSIZE",      (0, 1), (-1, -1), 7),
        ("ROWBACKGROUNDS",(0, 1), (-1, -1), [colors.white, colors.HexColor("#F5F5FF")]),
        ("GRID",          (0, 0), (-1, -1), 0.4, colors.HexColor("#CCCCCC")),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("TOPPADDING",    (0, 0), (-1, -1), 3),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
        ("WORDWRAP",      (0, 0), (-1, -1), True),
    ]))
    story.append(t)

    doc.build(story)
    buf.seek(0)
    return StreamingResponse(
        buf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{_filename(module, "pdf")}"'},
    )


def _respond(fmt: str, title: str, headers: list, rows: list, module: str) -> StreamingResponse:
    if fmt == "pdf":
        return _pdf_response(title, headers, rows, module)
    return _csv_response(headers, rows, module)


def _date_query(from_date: Optional[str], to_date: Optional[str]) -> Optional[dict]:
    q = {}
    fd = _parse_date(from_date)
    td = _parse_date(to_date, end_of_day=True)
    if fd:
        q["$gte"] = fd
    if td:
        q["$lte"] = td
    return q if q else None


# ══════════════════════════════════════════════════════════════════════════════
# COMPANY EXPORTS
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/candidates")
async def export_candidates(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export candidates as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email":     {"$regex": search, "$options": "i"}},
            {"mobile":    {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Name", "Email", "Mobile", "Skills", "Experience (Yrs)",
        "Current Company", "Location", "Notice Period", "Status", "Source", "Created Date",
    ]
    rows = []
    async for doc in db.candidates.find(query).sort("created_at", -1).limit(5000):
        rows.append([
            _fmt(doc.get("full_name")),
            _fmt(doc.get("email")),
            _fmt(doc.get("mobile")),
            _fmt_skills(doc.get("skills")),
            _fmt(doc.get("total_experience_years")),
            _fmt(doc.get("current_company")),
            _fmt(doc.get("current_city")),
            _fmt(doc.get("notice_period")),
            _fmt(doc.get("status")),
            _fmt(doc.get("source")),
            _fmt(doc.get("created_at")),
        ])

    return _respond(format, "Candidates Report", headers, rows, "candidates")


@router.get("/jobs")
async def export_jobs(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export jobs as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"title":       {"$regex": search, "$options": "i"}},
            {"client_name": {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Title", "Client", "Job Type", "Work Mode", "Location",
        "Experience", "Salary Range", "Positions", "Status", "Priority", "Created Date",
    ]
    rows = []
    async for doc in db.jobs.find(query).sort("created_at", -1).limit(5000):
        salary = (
            f"{_fmt(doc.get('min_salary'))} - {_fmt(doc.get('max_salary'))}"
            if doc.get("min_salary") is not None else ""
        )
        exp = (
            f"{_fmt(doc.get('min_experience'))} - {_fmt(doc.get('max_experience'))} yrs"
            if doc.get("min_experience") is not None else ""
        )
        rows.append([
            _fmt(doc.get("title")),
            _fmt(doc.get("client_name")),
            _fmt(doc.get("job_type")),
            _fmt(doc.get("work_mode")),
            _fmt(doc.get("location")),
            exp,
            salary,
            _fmt(doc.get("positions")),
            _fmt(doc.get("status")),
            _fmt(doc.get("priority")),
            _fmt(doc.get("created_at")),
        ])

    return _respond(format, "Jobs Report", headers, rows, "jobs")


@router.get("/clients")
async def export_clients(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export clients as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"name":          {"$regex": search, "$options": "i"}},
            {"contact_email": {"$regex": search, "$options": "i"}},
            {"contact_name":  {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Name", "Client Code", "Type", "Contact Person",
        "Email", "Phone", "City", "State", "Status", "Active Jobs", "Created Date",
    ]
    rows = []
    async for doc in db.clients.find(query).sort("created_at", -1).limit(5000):
        rows.append([
            _fmt(doc.get("name")),
            _fmt(doc.get("code")),
            _fmt(doc.get("client_type")),
            _fmt(doc.get("contact_name")),
            _fmt(doc.get("contact_email")),
            _fmt(doc.get("contact_phone")),
            _fmt(doc.get("city")),
            _fmt(doc.get("state")),
            _fmt(doc.get("status")),
            _fmt(doc.get("active_jobs", 0)),
            _fmt(doc.get("created_at")),
        ])

    return _respond(format, "Clients Report", headers, rows, "clients")


@router.get("/applications")
async def export_applications(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export applications as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["applied_date"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"candidate_name": {"$regex": search, "$options": "i"}},
            {"job_title":      {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Candidate", "Job Title", "Client", "Stage", "Status", "Applied Date", "Last Updated",
    ]
    rows = []
    async for doc in db.applications.find(query).sort("applied_date", -1).limit(5000):
        rows.append([
            _fmt(doc.get("candidate_name")),
            _fmt(doc.get("job_title")),
            _fmt(doc.get("client_name")),
            _fmt(doc.get("current_stage")),
            _fmt(doc.get("status")),
            _fmt(doc.get("applied_date")),
            _fmt(doc.get("updated_at")),
        ])

    return _respond(format, "Applications Report", headers, rows, "applications")


@router.get("/interviews")
async def export_interviews(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export interviews as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["scheduled_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"candidate_name": {"$regex": search, "$options": "i"}},
            {"job_title":      {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Candidate", "Job Title", "Round", "Interview Type",
        "Status", "Scheduled At", "Interviewer", "Feedback",
    ]
    rows = []
    async for doc in db.interviews.find(query).sort("scheduled_at", -1).limit(5000):
        rows.append([
            _fmt(doc.get("candidate_name")),
            _fmt(doc.get("job_title")),
            _fmt(doc.get("round_number")),
            _fmt(doc.get("interview_type")),
            _fmt(doc.get("status")),
            _fmt(doc.get("scheduled_at")),
            _fmt(doc.get("interviewer_name")),
            _fmt(doc.get("feedback_summary")),
        ])

    return _respond(format, "Interviews Report", headers, rows, "interviews")


@router.get("/users")
async def export_users(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    department: Optional[str] = None,
    role: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db=Depends(get_company_db),
):
    """Export users as CSV or PDF (tenant-isolated)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if role:
        query["role"] = role
    if department:
        query["$or"] = [{"department": department}, {"department_id": department}]
    if search:
        query["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"email":     {"$regex": search, "$options": "i"}},
            {"username":  {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Full Name", "Username", "Email", "Mobile",
        "Role", "Department", "Designation", "Level", "Status", "Joined Date", "Last Login",
    ]
    rows = []
    async for doc in db.users.find(query).sort("created_at", -1).limit(5000):
        rows.append([
            _fmt(doc.get("full_name")),
            _fmt(doc.get("username")),
            _fmt(doc.get("email")),
            _fmt(doc.get("mobile")),
            _fmt(doc.get("role")),
            _fmt(doc.get("department")),
            _fmt(doc.get("designation")),
            _fmt(doc.get("level")),
            _fmt(doc.get("status")),
            _fmt(doc.get("joining_date")),
            _fmt(doc.get("last_login")),
        ])

    return _respond(format, "Users Report", headers, rows, "users")


# ══════════════════════════════════════════════════════════════════════════════
# SUPER ADMIN EXPORTS  (master_db — cross-tenant data)
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/tenants")
async def export_tenants(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Export all tenants as CSV or PDF (super admin only)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"company_name":  {"$regex": search, "$options": "i"}},
            {"owner.email":   {"$regex": search, "$options": "i"}},
            {"owner.full_name": {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Company Name", "Owner Name", "Owner Email", "Owner Mobile",
        "City", "State", "Website", "Plan", "Plan Type",
        "Status", "Created Date", "Plan Expiry",
    ]
    rows = []
    async for doc in master_db.tenants.find(query).sort("created_at", -1).limit(10000):
        owner = doc.get("owner") or {}
        address = doc.get("address") or {}
        city = address.get("city") if isinstance(address, dict) else doc.get("city", "")
        state = address.get("state") if isinstance(address, dict) else doc.get("state", "")
        plan_type = "Trial" if doc.get("is_trial") else "Subscription"
        rows.append([
            _fmt(doc.get("company_name")),
            _fmt(owner.get("full_name")),
            _fmt(owner.get("email")),
            _fmt(owner.get("mobile")),
            _fmt(city),
            _fmt(state),
            _fmt(doc.get("website")),
            _fmt(doc.get("plan_name")),
            plan_type,
            _fmt(doc.get("status")),
            _fmt(doc.get("created_at")),
            _fmt(doc.get("plan_expiry")),
        ])

    return _respond(format, "Tenants Report", headers, rows, "tenants")


@router.get("/resellers")
async def export_resellers(
    format: str = Query("csv", pattern="^(csv|pdf)$"),
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    search: Optional[str] = None,
    status: Optional[str] = None,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Export all resellers/sellers as CSV or PDF (super admin only)."""
    query: dict = {"is_deleted": {"$ne": True}}
    dq = _date_query(from_date, to_date)
    if dq:
        query["created_at"] = dq
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"seller_name":  {"$regex": search, "$options": "i"}},
            {"email":        {"$regex": search, "$options": "i"}},
            {"company_name": {"$regex": search, "$options": "i"}},
        ]

    headers = [
        "Seller Name", "Company", "Email", "Phone",
        "Status", "Plan", "Plan Type", "Margin %", "Created Date", "Plan Expiry",
    ]
    rows = []
    async for doc in master_db.sellers.find(query).sort("created_at", -1).limit(10000):
        plan_type = "Trial" if doc.get("is_trial") else "Subscription"
        rows.append([
            _fmt(doc.get("seller_name")),
            _fmt(doc.get("company_name")),
            _fmt(doc.get("email")),
            _fmt(doc.get("phone")),
            _fmt(doc.get("status")),
            _fmt(doc.get("plan_name")),
            plan_type,
            _fmt(doc.get("margin_percentage")),
            _fmt(doc.get("created_at")),
            _fmt(doc.get("plan_expiry_date")),
        ])

    return _respond(format, "Resellers Report", headers, rows, "resellers")
