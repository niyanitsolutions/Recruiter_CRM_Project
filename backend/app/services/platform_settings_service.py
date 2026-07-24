"""
Platform Settings Service — Central cached loader for global platform configuration.

Every module that needs a platform-level setting (email SMTP, security lockout,
maintenance mode, storage limits, etc.) imports from here instead of reading the
database directly.

Caching strategy:
  • In-memory dict with a 5-minute TTL.
  • Cache is invalidated immediately when settings are saved via the API.
  • On cache miss the DB is queried; on DB failure the previous cache or the
    hard-coded DEFAULT_SETTINGS are returned so the application stays running.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── In-memory cache ────────────────────────────────────────────────────────────
_cache: Optional[dict] = None
_cache_ts: Optional[datetime] = None
CACHE_TTL_SECONDS = 300  # 5 minutes


# ── Defaults (mirrors the frontend DEFAULTS constant) ─────────────────────────
DEFAULT_SETTINGS: dict = {
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
        # ── Tenant Activity Monitoring event toggles (additive) ────────────────
        "subscription_renewed": True,
        "payment_failed": True,
        "tenant_inactive": True,
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
        "smtp_password": "",
        "smtp_use_tls": True,
        "from_name": "HireFlow",
        "from_email": "",
        "smtp_reply_to_email": "",
        "smtp_provider": "",
        # smtp_is_active: True = use this DB config; False = use .env only.
        # Defaults True so existing DB-configured SMTP keeps working without action.
        "smtp_is_active": True,
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
    # ── Tenant Activity Monitoring (additive) ──────────────────────────────────
    # Controls the Super Admin Tenant Activity Monitoring & Business
    # Notification feature. `inactivity_days` is the number of days with no
    # authenticated activity from ANY user of a tenant before it is flagged
    # inactive to the Super Admin.
    "tenant_activity_monitoring": {
        "enabled": True,
        "inactivity_days": 7,
    },
}


# ── Helpers ────────────────────────────────────────────────────────────────────

def _deep_merge(base: dict, override: dict) -> dict:
    """Recursively merge *override* into *base*, returning a new dict."""
    result = dict(base)
    for key, val in (override or {}).items():
        if isinstance(val, dict) and isinstance(result.get(key), dict):
            result[key] = _deep_merge(result[key], val)
        elif val is not None:
            result[key] = val
    return result


async def _load_from_db() -> dict:
    from app.core.database import get_master_db
    master_db = get_master_db()
    doc = await master_db.platform_settings.find_one({"_id": "global"})
    if not doc:
        return dict(DEFAULT_SETTINGS)
    doc.pop("_id", None)
    doc.pop("updated_at", None)
    doc.pop("updated_by", None)
    return _deep_merge(DEFAULT_SETTINGS, doc)


# ── Public API ─────────────────────────────────────────────────────────────────

async def get_platform_settings(force_refresh: bool = False) -> dict:
    """
    Return the global platform settings.

    Uses an in-memory cache with a 5-minute TTL.
    Pass force_refresh=True after saving settings to bypass the cache.
    """
    global _cache, _cache_ts

    now = datetime.now(timezone.utc)
    if (
        not force_refresh
        and _cache is not None
        and _cache_ts is not None
        and (now - _cache_ts).total_seconds() < CACHE_TTL_SECONDS
    ):
        return _cache

    try:
        _cache = await _load_from_db()
        _cache_ts = now
    except Exception as exc:
        logger.error("[PlatformSettings] DB load failed: %s — using cached/default values", exc)
        if _cache is None:
            _cache = dict(DEFAULT_SETTINGS)
    return _cache


def invalidate_cache() -> None:
    """Force the next call to get_platform_settings() to re-read from the DB."""
    global _cache, _cache_ts
    _cache = None
    _cache_ts = None
    logger.debug("[PlatformSettings] Cache invalidated")


# ── Typed section getters ──────────────────────────────────────────────────────

async def get_security_settings() -> dict:
    s = await get_platform_settings()
    return s.get("security") or DEFAULT_SETTINGS["security"]


async def get_platform_controls() -> dict:
    s = await get_platform_settings()
    return s.get("platform_controls") or DEFAULT_SETTINGS["platform_controls"]


async def get_maintenance_settings() -> dict:
    s = await get_platform_settings()
    return s.get("maintenance") or DEFAULT_SETTINGS["maintenance"]


async def get_storage_settings() -> dict:
    s = await get_platform_settings()
    return s.get("storage") or DEFAULT_SETTINGS["storage"]


async def get_billing_settings() -> dict:
    s = await get_platform_settings()
    return s.get("billing") or DEFAULT_SETTINGS["billing"]


async def get_email_settings() -> dict:
    s = await get_platform_settings()
    return s.get("email") or DEFAULT_SETTINGS["email"]


async def get_notification_settings() -> dict:
    s = await get_platform_settings()
    return s.get("notifications") or DEFAULT_SETTINGS["notifications"]


async def get_platform_info() -> dict:
    s = await get_platform_settings()
    return s.get("platform") or DEFAULT_SETTINGS["platform"]


async def get_tenant_activity_monitoring_settings() -> dict:
    s = await get_platform_settings()
    return s.get("tenant_activity_monitoring") or DEFAULT_SETTINGS["tenant_activity_monitoring"]


# ── Convenience single-value getters ──────────────────────────────────────────

async def get_platform_name() -> str:
    info = await get_platform_info()
    return info.get("name") or "HireFlow"


async def get_password_min_length() -> int:
    sec = await get_security_settings()
    val = sec.get("password_min_length", 8)
    try:
        return max(6, int(val))
    except (TypeError, ValueError):
        return 8


async def get_max_login_attempts() -> int:
    sec = await get_security_settings()
    val = sec.get("max_login_attempts", 5)
    try:
        return max(3, int(val))
    except (TypeError, ValueError):
        return 5


async def get_lockout_duration_minutes() -> int:
    sec = await get_security_settings()
    val = sec.get("lockout_duration_minutes", 15)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 15


async def get_session_timeout_hours() -> int:
    sec = await get_security_settings()
    val = sec.get("session_timeout_hours", 24)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 24


async def is_maintenance_mode() -> bool:
    m = await get_maintenance_settings()
    return bool(m.get("maintenance_mode", False))


async def is_self_registration_allowed() -> bool:
    pc = await get_platform_controls()
    return bool(pc.get("allow_self_registration", True))


async def get_trial_days() -> int:
    pc = await get_platform_controls()
    val = pc.get("trial_days", 14)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 14


async def get_inactivity_days() -> int:
    tam = await get_tenant_activity_monitoring_settings()
    val = tam.get("inactivity_days", 7)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 7


async def is_tenant_activity_monitoring_enabled() -> bool:
    tam = await get_tenant_activity_monitoring_settings()
    return bool(tam.get("enabled", True))


async def get_max_tenants_per_seller() -> int:
    pc = await get_platform_controls()
    val = pc.get("max_tenants_per_seller", 50)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 50


async def get_max_resume_size_mb() -> int:
    st = await get_storage_settings()
    val = st.get("max_resume_size_mb", 10)
    try:
        return max(1, int(val))
    except (TypeError, ValueError):
        return 10


async def get_allowed_resume_types() -> list[str]:
    st = await get_storage_settings()
    raw = st.get("allowed_resume_types", "pdf,doc,docx")
    return [t.strip().lower() for t in raw.split(",") if t.strip()]


async def is_notification_enabled(event: str) -> bool:
    """
    Check whether a specific notification event is enabled.

    event names: new_tenant | payment_received | trial_expiring | plan_expired | seller_registered
    """
    notif = await get_notification_settings()
    return bool(notif.get(event, True))


# ── SMTP config builder ────────────────────────────────────────────────────────

async def get_db_smtp_config() -> dict | None:
    """
    Return an SMTP config dict built from the platform settings DB record,
    or None when:
      - SMTP is not configured (missing host / user / password), OR
      - smtp_is_active is explicitly False (admin disabled platform DB SMTP,
        forcing fallback to .env credentials).

    The password is decrypted via Fernet when a key is configured.
    """
    em = await get_email_settings()

    # Respect the active toggle — False means "use .env only"
    if not em.get("smtp_is_active", True):
        logger.debug("[PlatformSettings] Platform DB SMTP is disabled (smtp_is_active=False)")
        return None

    host = (em.get("smtp_host") or "").strip()
    user = (em.get("smtp_user") or "").strip()
    raw_password = (em.get("smtp_password") or "").strip()

    if not host or not user or not raw_password:
        return None

    # Decrypt password if Fernet key is configured
    try:
        from app.services.email_service import decrypt_password
        password = decrypt_password(raw_password)
    except Exception:
        password = raw_password

    from_email = (em.get("from_email") or "").strip() or user
    from_name = (em.get("from_name") or "").strip() or "HireFlow"
    reply_to = (em.get("smtp_reply_to_email") or "").strip()

    from app.core.config import settings as _cfg
    cfg: dict = {
        "host": host,
        "port": int(em.get("smtp_port") or 587),
        "username": user,
        "password": password,
        "from_email": from_email,
        "from_name": from_name,
        "timeout": _cfg.SMTP_TIMEOUT,
    }
    if reply_to:
        cfg["reply_to"] = reply_to
    return cfg
