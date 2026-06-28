"""
Platform Settings API (Super Admin only)
Stores and retrieves global SaaS platform configuration.
"""
import asyncio
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Request

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
        "smtp_reply_to_email": "",
        "smtp_provider": "",
        "smtp_is_active": True,
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


# ── Helper: log platform config change to master_db.platform_audit_logs ─────────

async def _log_config_change(
    master_db,
    user_id: str,
    section: str,
    description: str,
    ip_address: str = "",
) -> None:
    """Fire-and-forget audit record in master_db."""
    try:
        await master_db.platform_audit_logs.insert_one({
            "action": "config_change",
            "entity_type": "platform_settings",
            "entity_id": "global",
            "section": section,
            "description": description,
            "user_id": user_id,
            "ip_address": ip_address,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception:
        pass  # audit failure must never break the main flow


# ── GET platform settings ──────────────────────────────────────────────────────

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
        has_pwd = bool(doc["email"].get("smtp_password"))
        doc["email"].pop("smtp_password", None)
        doc["email"]["has_smtp_password"] = has_pwd
    return {"success": True, "settings": doc}


# ── PUT platform settings ──────────────────────────────────────────────────────

@router.put("")
async def update_settings(
    payload: dict,
    request: Request,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """
    Persist platform settings (upsert the global document).

    - If the email section contains a new smtp_password it is encrypted before storage.
    - An empty / omitted password keeps the existing one in the DB.
    - Invalidates the in-memory platform settings cache immediately.
    - Audit-logs the change.
    """
    payload.pop("_id", None)

    # ── Handle SMTP password encryption ───────────────────────────────────────
    changed_sections: list[str] = []
    if "email" in payload and isinstance(payload["email"], dict):
        new_pwd = (payload["email"].pop("smtp_password", None) or "").strip()
        payload["email"].pop("has_smtp_password", None)   # frontend convenience field
        if new_pwd:
            try:
                from app.services.email_service import encrypt_password
                payload["email"]["smtp_password"] = encrypt_password(new_pwd)
            except Exception:
                payload["email"]["smtp_password"] = new_pwd
        else:
            # Preserve existing password when none provided
            existing = await master_db.platform_settings.find_one({"_id": "global"})
            if existing and isinstance(existing.get("email"), dict):
                existing_pwd = existing["email"].get("smtp_password")
                if existing_pwd:
                    payload["email"]["smtp_password"] = existing_pwd
        changed_sections.append("email")

    for section in payload:
        if section not in ("updated_at", "updated_by", "email") and isinstance(payload[section], dict):
            changed_sections.append(section)

    payload["updated_at"] = datetime.now(timezone.utc)
    payload["updated_by"] = auth.user_id

    await master_db.platform_settings.update_one(
        {"_id": "global"},
        {"$set": payload},
        upsert=True,
    )

    # Invalidate in-memory caches
    from app.services.platform_settings_service import invalidate_cache
    invalidate_cache()

    # Audit log
    ip = request.headers.get("X-Forwarded-For", request.client.host if request.client else "")
    await _log_config_change(
        master_db, auth.user_id,
        section=", ".join(changed_sections) or "general",
        description=f"Platform settings updated: {', '.join(changed_sections) or 'general'}",
        ip_address=ip,
    )

    return {"success": True, "message": "Settings saved successfully"}


# ── POST SMTP test ─────────────────────────────────────────────────────────────

@router.post("/smtp-test")
async def test_smtp(
    payload: dict,
    auth: AuthContext = Depends(require_super_admin),
):
    """
    Test an SMTP configuration without saving it.
    Accepts the same email section fields as PUT (smtp_host, smtp_port,
    smtp_user, smtp_password).  Returns success/failure with a message.
    """
    from app.services.email_service import test_smtp_connection

    host = (payload.get("smtp_host") or "").strip()
    port = int(payload.get("smtp_port") or 587)
    user = (payload.get("smtp_user") or "").strip()
    password = (payload.get("smtp_password") or "").strip()

    if not host or not user or not password:
        raise HTTPException(status_code=400, detail="smtp_host, smtp_user, and smtp_password are required for testing")

    cfg = {"host": host, "port": port, "username": user, "password": password}
    ok, msg = await asyncio.to_thread(test_smtp_connection, cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


# ── GET public config ──────────────────────────────────────────────────────────

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
