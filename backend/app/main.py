"""
Main FastAPI Application - Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
Multi-tenant CRM System for Recruitment Agencies
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from contextlib import asynccontextmanager
import asyncio
import logging
import os

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection, get_master_db
from app.core.limiter import limiter
from app.core.redis import init_redis, close_redis
from app.services.plan_service import plan_service
from app.services.subscription_reminder_service import reminder_background_loop
from app.models.master.global_user import ensure_global_indexes

# ============== Phase 1 - Auth & Tenant Management ==============
from app.api.v1 import auth, super_admin, tenants, plans, payments

# ============== Seller / Reseller System ==============
from app.api.v1 import sellers, seller_portal

# ============== Super Admin Extensions ==============
from app.api.v1 import discounts, platform_settings

# ============== Phase 2 - User Management ==============
from app.api.v1 import users, partners, roles, departments, designations, audit_logs, admin_dashboard

# ============== Phase 3 - Recruitment Core ==============
from app.api.v1 import clients, candidates, jobs, applications, interviews, pipelines
from app.api.v1 import settings as settings_router

# ============== Phase 4 - Onboarding & Partner Payout ==============
from app.api.v1 import onboards, payouts, notifications

# ============== Phase 5 - Reports, Analytics, Import/Export, Targets, Audit ==============
from app.api.v1 import reports, analytics, imports_exports, targets, audit, scheduler, tasks

# ============== Phase 6 - Integrations & Trash ==============
from app.api.v1 import integrations, trash

# ============== Export ==============
from app.api.v1 import export

# ============== HRM Module ==============
from app.api.v1 import (
    hrm_employees, hrm_attendance, hrm_leaves, hrm_payroll,
    hrm_performance, hrm_announcements, hrm_dashboard, hrm_hiring,
    hrm_offer_templates, hrm_documents, hrm_sync,
    hrm_assets, hrm_exit,
    hrm_holidays, hrm_leave_policies, hrm_shifts,
    hrm_document_templates,
)

# ============== Company Settings ==============
from app.api.v1 import company_settings

# ============== Tenant Settings (Phase 6) ==============
from app.api.v1 import tenant_settings

# ============== Email Test ==============
from app.api.v1 import email_test

# ============== Session Management + WebSocket ==============
from app.api.v1 import sessions as sessions_router
from app.api.v1.sessions import session_cleanup_loop


# ─── Default super admin auto-seed ────────────────────────────────────────────
async def _seed_default_superadmin() -> None:
    """
    Creates the default super admin account on first startup if none exists.
    Credentials are read from .env:
        DEFAULT_SUPERADMIN_USERNAME   (default: superadmin)
        DEFAULT_SUPERADMIN_EMAIL      (default: superadmin@niyanhireflow.com)
        DEFAULT_SUPERADMIN_NAME       (default: Super Administrator)
        DEFAULT_SUPERADMIN_PASSWORD   (default: SuperAdmin@123  ← change in production!)
    Safe to call on every restart — skips silently if any super admin already exists.
    """
    import uuid
    from datetime import datetime, timezone
    from passlib.context import CryptContext

    master_db = get_master_db()
    if await master_db.super_admins.find_one({"is_deleted": False}):
        return  # already seeded — nothing to do

    username  = os.getenv("DEFAULT_SUPERADMIN_USERNAME", "superadmin")
    email     = os.getenv("DEFAULT_SUPERADMIN_EMAIL",    "superadmin@niyanhireflow.com")
    full_name = os.getenv("DEFAULT_SUPERADMIN_NAME",     "Super Administrator")
    password  = os.getenv("DEFAULT_SUPERADMIN_PASSWORD", "SuperAdmin@123")

    rounds     = int(os.getenv("BCRYPT_ROUNDS", "12"))
    pwd_ctx    = CryptContext(schemes=["bcrypt"], deprecated="auto", bcrypt__rounds=rounds)
    now        = datetime.now(timezone.utc)

    doc = {
        "_id":                   str(uuid.uuid4()),
        "username":              username,
        "email":                 email,
        "full_name":             full_name,
        "mobile":                None,
        "password_hash":         pwd_ctx.hash(password),
        "status":                "active",
        "is_primary":            True,
        "is_deleted":            False,
        "deleted_at":            None,
        "permissions": [
            "tenants:read", "tenants:write", "tenants:delete",
            "plans:read", "plans:write",
            "payments:read",
            "analytics:read",
            "super_admins:read", "super_admins:write",
            "sellers:read", "sellers:write",
            "discounts:read", "discounts:write",
        ],
        "failed_login_attempts": 0,
        "locked_until":          None,
        "last_login":            None,
        "last_login_ip":         None,
        "created_at":            now,
        "updated_at":            now,
        "created_by":            "system_startup",
    }

    await master_db.super_admins.insert_one(doc)
    logger.info(f"Default super admin created — username: {username}  email: {email}")
    if password == "SuperAdmin@123":
        logger.warning("Default super admin is using the default password! "
                       "Set DEFAULT_SUPERADMIN_PASSWORD in .env before going to production.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan manager - handles startup and shutdown"""
    # Startup
    print(" Starting CRM API Server...")
    print(f" Environment: {os.getenv('ENVIRONMENT', 'development')}")
    await connect_to_mongo()
    print(" Connected to MongoDB")
    await init_redis()
    print(" Redis initialized")
    seeded = await plan_service.seed_default_plans()
    print(f" Plans seeded/updated: {seeded}")
    await ensure_global_indexes(get_master_db())
    print(" Global user indexes ensured")
    await _seed_default_superadmin()
    print(" Default super admin checked/seeded")
    from app.services.email_service import validate_smtp_on_startup
    validate_smtp_on_startup()
    print(" SMTP configuration validated")
    # Run schema migrations across all tenant databases (idempotent, safe)
    from app.migrations.runner import run_migrations
    await run_migrations()
    print(" Schema migrations applied")
    # Ensure indexes are up-to-date for all existing tenant databases.
    # create_index is idempotent — safe to call on every restart.
    from app.core.database import DatabaseManager, get_master_db as _get_mdb
    _master = _get_mdb()
    try:
        tenant_ids = await _master.tenants.distinct("_id", {"is_deleted": {"$ne": True}})
        if tenant_ids:
            await asyncio.gather(*[DatabaseManager.ensure_indexes(tid) for tid in tenant_ids])
            print(f" Indexes ensured for {len(tenant_ids)} tenant DB(s)")
    except Exception as _idx_err:
        logger.warning("Index migration skipped: %s", _idx_err)
    # Start subscription reminder background task (runs every 24 hours)
    reminder_task = asyncio.create_task(reminder_background_loop())
    print(" Subscription reminder scheduler started")
    cleanup_task = asyncio.create_task(session_cleanup_loop())
    print(" Session cleanup scheduler started")

    # Ensure sessions TTL index exists (idempotent)
    try:
        _master_db2 = get_master_db()
        await _master_db2.sessions.create_index("expires_at", expireAfterSeconds=0, background=True)
        await _master_db2.sessions.create_index(
            [("user_id", 1), ("is_active", 1), ("last_activity_at", -1)],
            background=True,
        )
    except Exception as _idx_err2:
        logger.warning("Session index creation skipped: %s", _idx_err2)

    yield
    # Shutdown
    cleanup_task.cancel()
    reminder_task.cancel()
    await close_redis()
    await close_mongo_connection()
    print(" Shutting down Niyan HireFlow API Server...")


app = FastAPI(
    title="Niyan HireFlow",
    description="Smart Recruitment & Talent Management Platform",
    version="5.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Global exception handlers ─────────────────────────────────────────────────

@app.exception_handler(RequestValidationError)
async def validation_exception_handler(_request: Request, exc: RequestValidationError):
    """
    Convert Pydantic 422 validation errors into a single clean message
    instead of the raw list format that the frontend would have to parse.
    """
    errors = exc.errors()
    messages = []
    for err in errors:
        loc = " → ".join(str(l) for l in err.get("loc", []) if l != "body")
        msg = err.get("msg", "Invalid value").replace("Value error, ", "")
        messages.append(f"{loc}: {msg}" if loc else msg)
    return JSONResponse(
        status_code=422,
        content={"success": False, "message": "; ".join(messages)},
    )


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    """
    Catch-all handler: converts any unhandled exception into a standard
    {"success": false, "message": "..."} JSON response and logs it.
    HTTPException is intentionally excluded — FastAPI handles those natively.
    """
    from fastapi import HTTPException as FastAPIHTTPException
    if isinstance(exc, FastAPIHTTPException):
        # Let FastAPI's default HTTPException handler deal with it
        raise exc
    logger.error("Unhandled exception on %s %s: %s", request.method, request.url.path, exc, exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"success": False, "message": "An unexpected error occurred. Please try again later."},
    )


# GZip — compress any response ≥ 512 B; most list/dashboard JSON payloads
# are 2–20 kB and compress 60–80%, which matters on slow mobile connections.
app.add_middleware(GZipMiddleware, minimum_size=512)

# CORS Configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Prefix
API_V1_PREFIX = "/api/v1"

# ============== PHASE 1 ROUTERS ==============
app.include_router(auth.router, prefix=f"{API_V1_PREFIX}/auth", tags=["Authentication"])
app.include_router(super_admin.router, prefix=f"{API_V1_PREFIX}/super-admin", tags=["Super Admin"])
app.include_router(tenants.router, prefix=f"{API_V1_PREFIX}/tenants", tags=["Tenants"])
app.include_router(plans.router, prefix=f"{API_V1_PREFIX}/plans", tags=["Plans"])
app.include_router(payments.router, prefix=f"{API_V1_PREFIX}/payments", tags=["Payments"])

# ============== SELLER / RESELLER ROUTERS ==============
app.include_router(sellers.router, prefix=f"{API_V1_PREFIX}/sellers", tags=["Sellers"])
app.include_router(seller_portal.router, prefix=f"{API_V1_PREFIX}/seller-portal", tags=["Seller Portal"])

# ============== SUPER ADMIN EXTENSIONS ==============
app.include_router(discounts.router, prefix=f"{API_V1_PREFIX}/discounts", tags=["Discounts"])
app.include_router(platform_settings.router, prefix=f"{API_V1_PREFIX}/platform-settings", tags=["Platform Settings"])

# ============== PHASE 2 ROUTERS ==============
app.include_router(users.router, prefix=API_V1_PREFIX, tags=["Users"])
app.include_router(partners.router, prefix=API_V1_PREFIX, tags=["Partners"])
app.include_router(roles.router, prefix=API_V1_PREFIX, tags=["Roles"])
app.include_router(departments.router, prefix=API_V1_PREFIX, tags=["Departments"])
app.include_router(designations.router, prefix=API_V1_PREFIX, tags=["Designations"])
app.include_router(audit_logs.router, prefix=API_V1_PREFIX, tags=["Audit Logs"])
app.include_router(admin_dashboard.router, prefix=API_V1_PREFIX, tags=["Admin Dashboard"])

# ============== PHASE 3 ROUTERS ==============
app.include_router(clients.router, prefix=API_V1_PREFIX, tags=["Clients"])
app.include_router(candidates.router, prefix=API_V1_PREFIX, tags=["Candidates"])
app.include_router(candidates.public_router, prefix=API_V1_PREFIX, tags=["Public Forms"])
app.include_router(jobs.router, prefix=API_V1_PREFIX, tags=["Jobs"])
app.include_router(applications.router, prefix=API_V1_PREFIX, tags=["Applications"])
app.include_router(interviews.router, prefix=API_V1_PREFIX, tags=["Interviews"])
app.include_router(pipelines.router, prefix=API_V1_PREFIX, tags=["Pipelines"])
app.include_router(settings_router.router, prefix=API_V1_PREFIX, tags=["Settings"])
app.include_router(company_settings.router, prefix=API_V1_PREFIX, tags=["Company Settings"])
app.include_router(tenant_settings.router, prefix=API_V1_PREFIX, tags=["Tenant Settings"])

# ============== PHASE 4 ROUTERS ==============
app.include_router(onboards.router, prefix=API_V1_PREFIX, tags=["Onboards"])
app.include_router(payouts.router, prefix=API_V1_PREFIX, tags=["Partner Payouts"])
app.include_router(notifications.router, prefix=API_V1_PREFIX, tags=["Notifications"])

# ============== PHASE 5 ROUTERS ==============
app.include_router(reports.router, prefix=API_V1_PREFIX, tags=["Reports"])
app.include_router(analytics.router, prefix=API_V1_PREFIX, tags=["Analytics"])
app.include_router(imports_exports.router, prefix=API_V1_PREFIX, tags=["Import/Export"])
app.include_router(targets.router, prefix=API_V1_PREFIX, tags=["Targets"])
app.include_router(audit.router, prefix=API_V1_PREFIX, tags=["Advanced Audit"])
app.include_router(scheduler.router, prefix=API_V1_PREFIX, tags=["Scheduler"])
app.include_router(export.router, prefix=API_V1_PREFIX, tags=["Export"])
app.include_router(tasks.router, prefix=API_V1_PREFIX, tags=["Tasks"])
app.include_router(email_test.router, prefix=API_V1_PREFIX, tags=["Email"])

# ============== SESSION MANAGEMENT + WEBSOCKET ==============
app.include_router(sessions_router.router, prefix=API_V1_PREFIX, tags=["Sessions"])

# ============== PHASE 6 ROUTERS ==============
app.include_router(integrations.router, prefix=API_V1_PREFIX, tags=["Integrations"])
app.include_router(trash.router, prefix=API_V1_PREFIX, tags=["Trash"])

# ============== HRM MODULE ROUTERS ==============
app.include_router(hrm_dashboard.router, prefix=API_V1_PREFIX, tags=["HRM - Dashboard"])
app.include_router(hrm_employees.router, prefix=API_V1_PREFIX, tags=["HRM - Employees"])
app.include_router(hrm_attendance.router, prefix=API_V1_PREFIX, tags=["HRM - Attendance"])
app.include_router(hrm_leaves.router, prefix=API_V1_PREFIX, tags=["HRM - Leaves"])
app.include_router(hrm_payroll.router, prefix=API_V1_PREFIX, tags=["HRM - Payroll"])
app.include_router(hrm_performance.router, prefix=API_V1_PREFIX, tags=["HRM - Performance"])
app.include_router(hrm_announcements.router,   prefix=API_V1_PREFIX, tags=["HRM - Announcements"])
app.include_router(hrm_hiring.router,           prefix=API_V1_PREFIX, tags=["HRM - Hiring"])
app.include_router(hrm_offer_templates.router,  prefix=API_V1_PREFIX, tags=["HRM - Offer Templates"])
app.include_router(hrm_documents.router,        prefix=API_V1_PREFIX, tags=["HRM - Documents"])
app.include_router(hrm_sync.router,             prefix=API_V1_PREFIX, tags=["HRM - Sync"])
app.include_router(hrm_assets.router,           prefix=API_V1_PREFIX, tags=["HRM - Assets"])
app.include_router(hrm_exit.router,             prefix=API_V1_PREFIX, tags=["HRM - Exit Management"])
app.include_router(hrm_holidays.router,           prefix=API_V1_PREFIX, tags=["HRM - Holidays"])
app.include_router(hrm_leave_policies.router,    prefix=API_V1_PREFIX, tags=["HRM - Leave Policies"])
app.include_router(hrm_shifts.router,            prefix=API_V1_PREFIX, tags=["HRM - Shifts"])
app.include_router(hrm_document_templates.router, prefix=API_V1_PREFIX, tags=["HRM - Document Templates"])


# Serve uploaded files (resumes, etc.)
os.makedirs("uploads/resumes", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/", tags=["Health Check"])
async def root():
    """Root endpoint - Health check"""
    return {
        "status": "healthy",
        "message": "Niyan HireFlow API is running",
        "version": "5.0.0",
        "phases": [
            "Phase 1 - Foundation & Auth",
            "Phase 2 - User Management",
            "Phase 3 - Recruitment Core",
            "Phase 4 - Onboarding & Payout",
            "Phase 5 - Reports & Analytics"
        ]
    }


@app.get("/health", tags=["Health Check"])
@app.get("/healthy", tags=["Health Check"])
async def health_check():
    return {
        "status": "healthy",
        "database": "connected",
        "version": "5.0.0"
    }


@app.get("/api/v1/info", tags=["Info"])
async def api_info():
    """API information endpoint"""
    return {
        "version": "5.0.0",
        "phases": {
            "phase_1": "Foundation & Authentication",
            "phase_2": "User Management",
            "phase_3": "Recruitment Core",
            "phase_4": "Onboarding & Partner Payout",
            "phase_5": "Reports, Analytics & Advanced Features"
        },
        "endpoints": {
            # Phase 1
            "auth": "/api/v1/auth",
            "super_admin": "/api/v1/super-admin",
            "tenants": "/api/v1/tenants",
            "plans": "/api/v1/plans",
            "payments": "/api/v1/payments",
            # Phase 2
            "users": "/api/v1/users",
            "roles": "/api/v1/roles",
            "departments": "/api/v1/departments",
            "designations": "/api/v1/designations",
            "audit_logs": "/api/v1/audit-logs",
            "admin_dashboard": "/api/v1/admin/dashboard",
            # Phase 3
            "clients": "/api/v1/clients",
            "candidates": "/api/v1/candidates",
            "jobs": "/api/v1/jobs",
            "applications": "/api/v1/applications",
            "interviews": "/api/v1/interviews",
            "settings": "/api/v1/settings",
            # Phase 4
            "onboards": "/api/v1/onboards",
            "payouts": "/api/v1/payouts",
            "notifications": "/api/v1/notifications",
            # Phase 5
            "reports": "/api/v1/reports",
            "analytics": "/api/v1/analytics",
            "imports_exports": "/api/v1/data",
            "targets": "/api/v1/targets",
            "advanced_audit": "/api/v1/audit",
            "scheduler": "/api/v1/scheduler"
        }
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "app.main:app",
        host="0.0.0.0",
        port=8000,
        reload=True
    )