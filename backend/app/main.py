"""
Main FastAPI Application - Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
Multi-tenant CRM System for Recruitment Agencies
"""
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from contextlib import asynccontextmanager
import asyncio
import logging
import os

logger = logging.getLogger(__name__)

from app.core.config import settings
from app.core.database import connect_to_mongo, close_mongo_connection, get_master_db
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

# ============== Export ==============
from app.api.v1 import export

# ============== Company Settings ==============
from app.api.v1 import company_settings

# ============== Tenant Settings (Phase 6) ==============
from app.api.v1 import tenant_settings

# ============== Email Test ==============
from app.api.v1 import email_test


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
    from app.services.email_service import validate_smtp_on_startup
    validate_smtp_on_startup()
    print(" SMTP configuration validated")
    # Start subscription reminder background task (runs every 24 hours)
    reminder_task = asyncio.create_task(reminder_background_loop())
    print(" Subscription reminder scheduler started")
    yield
    # Shutdown
    reminder_task.cancel()
    await close_redis()
    await close_mongo_connection()
    print(" Shutting down CRM API Server...")


app = FastAPI(
    title="Multi-Tenant CRM System",
    description="SaaS-Grade Recruitment & Partner Platform",
    version="5.0.0",
    docs_url="/docs" if settings.DEBUG else None,
    redoc_url="/redoc" if settings.DEBUG else None,
    lifespan=lifespan
)

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


# Serve uploaded files (resumes, etc.)
os.makedirs("uploads/resumes", exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")


@app.get("/", tags=["Health Check"])
async def root():
    """Root endpoint - Health check"""
    return {
        "status": "healthy",
        "message": "Multi-Tenant CRM API is running",
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
async def health_check():
    """Detailed health check endpoint"""
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