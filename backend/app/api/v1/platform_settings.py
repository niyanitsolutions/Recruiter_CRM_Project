"""
Platform Settings API (Super Admin only)
Stores and retrieves global SaaS platform configuration.
"""
from fastapi import APIRouter, Depends
from datetime import datetime, timezone

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database

router = APIRouter()

# Default settings document — returned when no settings have been saved yet
DEFAULT_SETTINGS = {
    "platform": {
        "name": "HireFlow",
        "tagline": "Recruitment & Partner Platform",
        "support_email": "support@hireflow.com",
        "timezone": "Asia/Kolkata",
        "date_format": "DD/MM/YYYY",
    },
    "notifications": {
        "new_tenant": True,
        "payment_received": True,
        "trial_expiring": True,
        "plan_expired": False,
        "seller_registered": True,
    },
    "security": {
        "session_timeout_hours": 24,
        "max_login_attempts": 5,
        "lockout_duration_minutes": 15,
        "require_2fa_super_admin": False,
        "password_min_length": 8,
    },
    "platform_controls": {
        "allow_self_registration": True,
        "trial_days": 14,
        "max_tenants_per_seller": 50,
    },
    "billing": {
        "currency": "INR",
        "tax_rate_percent": 18.0,
        "invoice_prefix": "INV",
        "invoice_due_days": 15,
    },
    "email": {
        "smtp_host": "",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_use_tls": True,
        "from_name": "HireFlow",
        "from_email": "",
        # smtp_password is stored encrypted — never returned in GET responses
    },
    "storage": {
        "max_resume_size_mb": 10,
        "allowed_resume_types": "pdf,doc,docx",
        "max_storage_per_tenant_gb": 5,
    },
    "maintenance": {
        "maintenance_mode": False,
        "maintenance_message": "We are performing scheduled maintenance. Please try again later.",
        "allow_super_admin_access": True,
    },
}


@router.get("")
async def get_settings(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Retrieve current platform settings. SMTP password is never returned."""
    doc = await master_db.platform_settings.find_one({"_id": "global"})
    if not doc:
        return {"success": True, "settings": DEFAULT_SETTINGS}
    doc.pop("_id", None)
    doc.pop("updated_at", None)
    doc.pop("updated_by", None)
    # Strip the SMTP password from the response for security
    if "email" in doc and isinstance(doc["email"], dict):
        doc["email"].pop("smtp_password", None)
    return {"success": True, "settings": doc}


@router.put("")
async def update_settings(
    payload: dict,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """
    Persist platform settings (upsert the global document).

    If the email section contains a new smtp_password it is encrypted before
    storage.  An empty/omitted password keeps the existing one in the DB.
    """
    payload.pop("_id", None)

    # ── Handle SMTP password encryption ───────────────────────────────────────
    if "email" in payload and isinstance(payload["email"], dict):
        new_pwd = (payload["email"].get("smtp_password") or "").strip()
        if new_pwd:
            try:
                from app.services.email_service import encrypt_password
                payload["email"]["smtp_password"] = encrypt_password(new_pwd)
            except Exception:
                pass  # store as-is if encryption fails (Fernet not configured)
        else:
            # Don't overwrite the existing password when none is provided
            payload["email"].pop("smtp_password", None)

    payload["updated_at"] = datetime.now(timezone.utc)
    payload["updated_by"] = auth.user_id

    await master_db.platform_settings.update_one(
        {"_id": "global"},
        {"$set": payload},
        upsert=True,
    )

    # Invalidate the in-memory cache so the next request reads fresh data
    from app.services.platform_settings_service import invalidate_cache
    invalidate_cache()

    return {"success": True, "message": "Settings saved successfully"}


@router.get("/public-config")
async def get_public_config():
    """
    Public endpoint — no auth required.
    Returns non-sensitive platform settings needed by the frontend on load:
      - Platform name, support email, date format, timezone
      - Maintenance mode status and message
    """
    from app.services.platform_settings_service import get_platform_settings
    s = await get_platform_settings()
    platform = s.get("platform", {})
    maintenance = s.get("maintenance", {})
    return {
        "success": True,
        "config": {
            "platform_name": platform.get("name", "HireFlow"),
            "support_email": platform.get("support_email", ""),
            "timezone": platform.get("timezone", "Asia/Kolkata"),
            "date_format": platform.get("date_format", "DD/MM/YYYY"),
            "maintenance_mode": bool(maintenance.get("maintenance_mode", False)),
            "maintenance_message": maintenance.get(
                "maintenance_message",
                "We are performing scheduled maintenance. Please try again later.",
            ),
        },
    }
