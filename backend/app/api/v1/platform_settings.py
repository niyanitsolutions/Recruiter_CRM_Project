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
        "name": "CRM SaaS Platform",
        "version": "v1.0.0",
        "environment": "development",
    },
    "notifications": {
        "new_tenant_registered": True,
        "new_seller_registered": True,
        "payment_received": True,
        "payment_failed": True,
        "trial_expiring": True,
        "plan_expired": True,
        "subscription_renewed": False,
        "subscription_cancelled": True,
    },
    "security": {
        "session_timeout_hours": 24,
        "jwt_expiry_hours": 24,
        "max_login_attempts": 5,
        "account_lock_duration_minutes": 30,
        "enable_2fa": False,
    },
    "platform_controls": {
        "allow_tenant_self_signup": True,
        "allow_seller_registration": True,
        "enable_trial_plan": True,
        "trial_duration_days": 7,
        "default_plan": "",
    },
    "billing": {
        "currency": "INR",
        "tax_percentage": 18.0,
        "invoice_prefix": "INV",
        "payment_gateway": "razorpay",
    },
    "email": {
        "smtp_host": "",
        "smtp_port": 587,
        "sender_email": "",
        "sender_name": "CRM SaaS Platform",
    },
    "storage": {
        "provider": "local",
        "max_file_size_mb": 10,
        "allowed_types": "pdf,docx,doc,jpg,jpeg,png",
    },
    "maintenance": {
        "enabled": False,
        "message": "We are currently performing scheduled maintenance. Please check back shortly.",
    },
}


@router.get("")
async def get_settings(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Retrieve current platform settings."""
    doc = await master_db.platform_settings.find_one({"_id": "global"})
    if not doc:
        return {"success": True, "settings": DEFAULT_SETTINGS}
    doc.pop("_id", None)
    doc.pop("updated_at", None)
    doc.pop("updated_by", None)
    return {"success": True, "settings": doc}


@router.put("")
async def update_settings(
    payload: dict,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Persist platform settings (upsert the global document)."""
    payload.pop("_id", None)
    payload["updated_at"] = datetime.now(timezone.utc)
    payload["updated_by"] = auth.user_id

    await master_db.platform_settings.update_one(
        {"_id": "global"},
        {"$set": payload},
        upsert=True,
    )
    return {"success": True, "message": "Settings saved successfully"}
