"""
Company Settings API
Endpoints for tenant admins to manage their company profile, contact, security
(geo fence), notification preferences, and read subscription details.
"""
from datetime import datetime, timezone
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.middleware.tenant import get_master_database
from app.services.settings_service import SettingsService
from app.models.company.settings import (
    CompanySettingsUpdate,
    GeoFenceLocation,
    UserGeoFenceConfig,
    NotificationPreferences,
)

router = APIRouter(prefix="/company-settings", tags=["Company Settings"])


# ── Request schemas ────────────────────────────────────────────────────────────

class ProfileUpdateRequest(BaseModel):
    company_name: Optional[str] = None
    company_logo_url: Optional[str] = None
    industry: Optional[str] = None
    website: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    zip_code: Optional[str] = None
    timezone: Optional[str] = None


class ContactUpdateRequest(BaseModel):
    admin_name: Optional[str] = None
    admin_email: Optional[str] = None
    admin_phone: Optional[str] = None
    support_email: Optional[str] = None


class GeoFenceUpdateRequest(BaseModel):
    geo_fence_enabled: bool
    geo_fence_locations: List[GeoFenceLocation] = []
    user_geo_fence: List[UserGeoFenceConfig] = []


class NotificationsUpdateRequest(BaseModel):
    notification_preferences: NotificationPreferences


class SmtpConfigRequest(BaseModel):
    host: str
    port: int = 587
    username: str
    password: str           # plain text — will be encrypted before storage
    from_email: Optional[str] = None
    from_name: Optional[str] = None
    enabled: bool = True


# ── Helpers ───────────────────────────────────────────────────────────────────

def _settings_to_dict(settings_obj) -> dict:
    """Serialize a CompanySettings Pydantic model to a plain dict."""
    try:
        return settings_obj.model_dump(by_alias=False)
    except Exception:
        return {}


# ── GET all settings ──────────────────────────────────────────────────────────

@router.get("/")
async def get_company_settings(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    """Return the full company settings document."""
    settings = await SettingsService.get_company_settings(db)
    return {"success": True, "data": _settings_to_dict(settings)}


# ── UPDATE profile ────────────────────────────────────────────────────────────

@router.put("/profile")
async def update_profile(
    data: ProfileUpdateRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Update company profile (name, logo, industry, address, timezone …)."""
    update = CompanySettingsUpdate(**data.model_dump(exclude_none=True))
    updated = await SettingsService.update_company_settings(db, update, current_user["id"])
    return {"success": True, "message": "Company profile updated", "data": _settings_to_dict(updated)}


# ── UPDATE admin contact ──────────────────────────────────────────────────────

@router.put("/contact")
async def update_contact(
    data: ContactUpdateRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Update admin contact details."""
    update = CompanySettingsUpdate(**data.model_dump(exclude_none=True))
    updated = await SettingsService.update_company_settings(db, update, current_user["id"])
    return {"success": True, "message": "Contact details updated", "data": _settings_to_dict(updated)}


# ── GET subscription details (read-only, from master_db) ─────────────────────

@router.get("/subscription")
async def get_subscription(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    master_db=Depends(get_master_database),
    db=Depends(get_company_db),
):
    """
    Return current subscription / plan info from the tenant record.
    Also includes current user count from company_db.
    """
    company_id = current_user.get("company_id")
    if not company_id:
        raise HTTPException(status_code=400, detail="No company_id in token")

    tenant = await master_db.tenants.find_one({"company_id": company_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant record not found")

    # Count active users in company_db
    current_users = await db.users.count_documents({"status": "active", "is_deleted": {"$ne": True}})

    max_users = tenant.get("max_users") or 0
    plan_name = tenant.get("plan_name") or "—"
    price_per_user = tenant.get("price_per_user") or 0
    plan_start = tenant.get("plan_start_date")
    plan_expiry = tenant.get("plan_expiry")
    sub_status = tenant.get("status", "active")
    is_trial = tenant.get("is_trial", False)

    # Normalise datetimes returned by Motor (naive → aware)
    def _to_iso(dt):
        if dt is None:
            return None
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt.isoformat()

    # Derive subscription status: check plan_expiry first for accuracy
    now = datetime.now(timezone.utc)
    plan_expiry_aware = None
    if plan_expiry:
        plan_expiry_aware = plan_expiry.replace(tzinfo=timezone.utc) if plan_expiry.tzinfo is None else plan_expiry

    if is_trial:
        display_status = "Trial"
    elif plan_expiry_aware and plan_expiry_aware < now:
        display_status = "Expired"
    elif sub_status in ("suspended", "cancelled"):
        display_status = sub_status.capitalize()
    else:
        display_status = "Active"

    return {
        "success": True,
        "data": {
            "plan_name": plan_name,
            "price_per_user": price_per_user,
            "max_users": max_users,
            "current_users": current_users,
            "remaining_users": max(max_users - current_users, 0),
            "plan_start_date": _to_iso(plan_start),
            "plan_expiry_date": _to_iso(plan_expiry),
            "status": display_status,
            "is_trial": is_trial,
        },
    }


# ── UPDATE geo fence / security ───────────────────────────────────────────────

@router.put("/security")
async def update_security(
    data: GeoFenceUpdateRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Enable/disable geo fence and configure allowed locations."""
    update = CompanySettingsUpdate(
        geo_fence_enabled=data.geo_fence_enabled,
        geo_fence_locations=data.geo_fence_locations,
        user_geo_fence=data.user_geo_fence,
    )
    updated = await SettingsService.update_company_settings(db, update, current_user["id"])
    return {"success": True, "message": "Security settings updated", "data": _settings_to_dict(updated)}


# ── UPDATE notification preferences ──────────────────────────────────────────

@router.put("/notifications")
async def update_notifications(
    data: NotificationsUpdateRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Update notification channel (email / in-app) preferences per event."""
    update = CompanySettingsUpdate(notification_preferences=data.notification_preferences)
    updated = await SettingsService.update_company_settings(db, update, current_user["id"])
    return {"success": True, "message": "Notification preferences updated", "data": _settings_to_dict(updated)}


# ── SMTP Configuration ────────────────────────────────────────────────────────

@router.get("/smtp")
async def get_smtp_config(
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Get current tenant SMTP configuration (password masked)."""
    doc = await db.smtp_config.find_one({"_id": "smtp"})
    if not doc:
        return {"success": True, "data": None}
    return {
        "success": True,
        "data": {
            "host": doc.get("host"),
            "port": doc.get("port", 587),
            "username": doc.get("username"),
            "from_email": doc.get("from_email"),
            "from_name": doc.get("from_name"),
            "enabled": doc.get("enabled", True),
            "has_password": bool(doc.get("password")),
        },
    }


@router.put("/smtp")
async def save_smtp_config(
    data: SmtpConfigRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Save (upsert) tenant SMTP configuration. Tests connection before saving."""
    import asyncio
    from app.services.email_service import encrypt_password, test_smtp_connection

    cfg = {
        "host": data.host,
        "port": data.port,
        "username": data.username,
        "password": data.password,
    }
    ok, msg = await asyncio.to_thread(test_smtp_connection, cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=f"SMTP test failed: {msg}")

    from datetime import datetime, timezone
    await db.smtp_config.update_one(
        {"_id": "smtp"},
        {"$set": {
            "_id": "smtp",
            "host": data.host,
            "port": data.port,
            "username": data.username,
            "password": encrypt_password(data.password),
            "from_email": data.from_email or data.username,
            "from_name": data.from_name or "",
            "enabled": data.enabled,
            "updated_at": datetime.now(timezone.utc),
            "updated_by": current_user.get("id"),
        }},
        upsert=True,
    )
    return {"success": True, "message": "SMTP configuration saved and verified"}


@router.delete("/smtp")
async def delete_smtp_config(
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    """Remove tenant SMTP config (will fall back to system SMTP)."""
    await db.smtp_config.delete_one({"_id": "smtp"})
    return {"success": True, "message": "SMTP configuration removed"}


@router.post("/smtp/test")
async def test_smtp_config(
    data: SmtpConfigRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
):
    """Test an SMTP config without saving it."""
    import asyncio
    from app.services.email_service import test_smtp_connection
    cfg = {"host": data.host, "port": data.port, "username": data.username, "password": data.password}
    ok, msg = await asyncio.to_thread(test_smtp_connection, cfg)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}
