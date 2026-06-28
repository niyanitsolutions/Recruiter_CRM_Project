"""
Centralized Configuration Resolution Service

Every module that needs runtime configuration must import from here.
This service applies the correct priority chain so no module needs to
duplicate the lookup logic.

Priority chain by module
────────────────────────
  SMTP (system / auth emails)     → Platform DB SMTP → .env SMTP
  SMTP (tenant business emails)   → Tenant SMTP (active+verified) → Platform DB SMTP → .env
  Security                        → Tenant override (enabled) → Platform → hardcoded defaults
  Branding                        → Tenant branding → Platform info → hardcoded defaults
  Storage                         → Tenant override (enabled) → Platform → hardcoded defaults
  AI Provider                     → Platform only (no tenant override)
  Payment                         → Platform only (no tenant override)

Caching
───────
  Platform settings: 5-minute TTL in platform_settings_service (separate cache).
  Per-tenant configs: 60-second TTL in this service, keyed by company_id + module.
  Invalidate on every config write via invalidate_tenant_config(company_id, module).

Secret handling
───────────────
  This service never returns raw secrets (passwords, keys) to callers.
  SMTP configs returned by smtp-resolution helpers DO contain the decrypted
  password because the email_service must send over SMTP — but those helpers
  are called only by email_service, not by API routes.

Audit
─────
  Config changes are audited at the API layer (tenant_settings.py, platform_settings.py),
  not here.  This service is read-only.
"""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Optional

logger = logging.getLogger(__name__)

# ── Per-tenant cache ────────────────────────────────────────────────────────────
# Simple dict-of-dicts; safe for single-process async (FastAPI / Motor).
_TENANT_CACHE: dict[str, dict] = {}
_TENANT_CACHE_TS: dict[str, datetime] = {}
TENANT_CACHE_TTL = 60  # seconds


def _cache_key(company_id: str, module: str) -> str:
    return f"{company_id}:{module}"


def _is_fresh(company_id: str, module: str) -> bool:
    ts = _TENANT_CACHE_TS.get(_cache_key(company_id, module))
    if not ts:
        return False
    return (datetime.now(timezone.utc) - ts).total_seconds() < TENANT_CACHE_TTL


def _read_cache(company_id: str, module: str) -> Optional[dict]:
    if _is_fresh(company_id, module):
        return _TENANT_CACHE.get(_cache_key(company_id, module))
    return None


def _write_cache(company_id: str, module: str, value: dict) -> None:
    key = _cache_key(company_id, module)
    _TENANT_CACHE[key] = value
    _TENANT_CACHE_TS[key] = datetime.now(timezone.utc)


def invalidate_tenant_config(company_id: str, module: Optional[str] = None) -> None:
    """
    Remove cached config for a tenant.
    Pass module=None to clear all cached modules for the tenant (e.g. on logout/switch).
    """
    if module:
        key = _cache_key(company_id, module)
        _TENANT_CACHE.pop(key, None)
        _TENANT_CACHE_TS.pop(key, None)
        logger.debug("[ConfigResolution] Cache invalidated: company=%s module=%s", company_id, module)
    else:
        to_del = [k for k in list(_TENANT_CACHE) if k.startswith(f"{company_id}:")]
        for k in to_del:
            _TENANT_CACHE.pop(k, None)
            _TENANT_CACHE_TS.pop(k, None)
        logger.debug("[ConfigResolution] Cache fully cleared: company=%s", company_id)


# ── Hardcoded safety defaults (last-resort fallback) ───────────────────────────

_SECURITY_DEFAULTS: dict = {
    "session_timeout_hours": 24,
    "max_login_attempts": 5,
    "lockout_duration_minutes": 15,
    "require_2fa_super_admin": False,
    "password_min_length": 8,
    # Tenant-only extended fields
    "min_password_length": 8,
    "require_uppercase": True,
    "require_lowercase": True,
    "require_numbers": True,
    "require_symbols": False,
    "password_expiry_days": 90,
    "two_factor_enabled": False,
    "session_timeout_minutes": 1440,
    "ip_whitelist": [],
    "force_password_change": False,
    "enable_custom_security": False,
}

_BRANDING_DEFAULTS: dict = {
    "platform_name": "HireFlow",
    "tagline": "Recruitment & Partner Platform",
    "primary_color": "#6366f1",
    "secondary_color": "#8b5cf6",
    "accent_color": "#f59e0b",
    "logo_url": "",
    "favicon_url": "",
    "login_banner_url": "",
    "login_banner_text": "",
    "company_tagline": "",
    "footer_text": "",
    "dark_mode_enabled": False,
}

_STORAGE_DEFAULTS: dict = {
    "max_resume_size_mb": 10,
    "allowed_resume_types": "pdf,doc,docx",
    "max_storage_per_tenant_gb": 5,
    "enable_storage_override": False,
}


# ── Security config resolution ─────────────────────────────────────────────────

async def resolve_security_config(company_id: str = "") -> dict:
    """
    Return effective security config for the given company.

    Priority:
      1. Tenant security override (enable_custom_security=True in tenant_settings)
      2. Platform settings (master_db.platform_settings)
      3. Hardcoded defaults (_SECURITY_DEFAULTS)

    Returns a merged dict with an extra key:
      config_source: "tenant" | "platform"

    When company_id is empty (super admin / seller / global-user paths), only
    platform settings are used.
    """
    # ── Platform baseline ─────────────────────────────────────────────────────
    try:
        from app.services.platform_settings_service import get_security_settings
        platform_sec = await get_security_settings()
    except Exception as exc:
        logger.debug("[ConfigResolution] Platform security load failed: %s", exc)
        platform_sec = {}

    base = {**_SECURITY_DEFAULTS, **platform_sec, "config_source": "platform"}

    if not company_id:
        return base

    # ── Check cache ───────────────────────────────────────────────────────────
    cached = _read_cache(company_id, "security")
    if cached is not None:
        return cached

    # ── Attempt tenant override ───────────────────────────────────────────────
    result = base
    try:
        from app.core.database import get_company_db
        db = get_company_db(company_id)
        doc = await db.tenant_settings.find_one(
            {"company_id": company_id, "key": "security_settings"}
        )
        if doc and doc.get("enable_custom_security"):
            # Tenant override is active — overlay tenant fields onto base
            skip = {"_id", "id", "company_id", "key", "created_at", "updated_at", "created_by", "updated_by"}
            tenant_fields = {k: v for k, v in doc.items() if k not in skip}
            result = {**base, **tenant_fields, "config_source": "tenant"}
    except Exception as exc:
        logger.debug("[ConfigResolution] Tenant security load failed for %s: %s", company_id, exc)

    _write_cache(company_id, "security", result)
    return result


async def get_effective_lockout_settings(company_id: str = "") -> tuple[int, int]:
    """
    Convenience helper used by auth_service.
    Returns (max_login_attempts, lockout_duration_minutes).
    """
    try:
        cfg = await resolve_security_config(company_id)
        return int(cfg.get("max_login_attempts", 5)), int(cfg.get("lockout_duration_minutes", 15))
    except Exception:
        return 5, 15


async def get_effective_session_timeout(company_id: str = "") -> int:
    """Return session timeout in hours for the given company."""
    try:
        cfg = await resolve_security_config(company_id)
        # Tenant settings store session_timeout_minutes; platform stores session_timeout_hours.
        if cfg.get("config_source") == "tenant" and cfg.get("session_timeout_minutes"):
            return max(1, int(cfg["session_timeout_minutes"]) // 60)
        return max(1, int(cfg.get("session_timeout_hours", 24)))
    except Exception:
        return 24


async def get_effective_password_min_length(company_id: str = "") -> int:
    """Return minimum password length for the given company."""
    try:
        cfg = await resolve_security_config(company_id)
        if cfg.get("config_source") == "tenant":
            val = cfg.get("min_password_length") or cfg.get("password_min_length", 8)
        else:
            val = cfg.get("password_min_length", 8)
        return max(6, int(val))
    except Exception:
        return 8


# ── Branding config resolution ─────────────────────────────────────────────────

async def resolve_branding_config(company_id: str = "") -> dict:
    """
    Return effective branding config.

    Priority:
      1. Tenant branding (key="branding" in tenant_settings)
      2. Platform info (name, tagline from platform_settings)
      3. Hardcoded defaults

    config_source: "tenant" | "platform"
    """
    try:
        from app.services.platform_settings_service import get_platform_info
        platform_info = await get_platform_info()
    except Exception:
        platform_info = {}

    base = {
        **_BRANDING_DEFAULTS,
        "platform_name": platform_info.get("name") or "HireFlow",
        "tagline": platform_info.get("tagline") or "Recruitment & Partner Platform",
        "config_source": "platform",
    }

    if not company_id:
        return base

    cached = _read_cache(company_id, "branding")
    if cached is not None:
        return cached

    result = base
    try:
        from app.core.database import get_company_db
        db = get_company_db(company_id)
        doc = await db.tenant_settings.find_one(
            {"company_id": company_id, "key": "branding"}
        )
        if doc:
            skip = {"_id", "id", "company_id", "key", "created_at", "updated_at", "created_by", "updated_by"}
            tenant_fields = {k: v for k, v in doc.items() if k not in skip}
            result = {**base, **tenant_fields, "config_source": "tenant"}
    except Exception as exc:
        logger.debug("[ConfigResolution] Branding load failed for %s: %s", company_id, exc)

    _write_cache(company_id, "branding", result)
    return result


# ── Storage config resolution ──────────────────────────────────────────────────

async def resolve_storage_config(company_id: str = "") -> dict:
    """
    Return effective storage config (file size limits, allowed types, quota).

    Priority:
      1. Tenant storage override (enable_storage_override=True)
      2. Platform settings
      3. Hardcoded defaults

    config_source: "tenant" | "platform"
    """
    try:
        from app.services.platform_settings_service import get_storage_settings
        platform_st = await get_storage_settings()
    except Exception:
        platform_st = {}

    base = {
        **_STORAGE_DEFAULTS,
        "max_resume_size_mb": int(platform_st.get("max_resume_size_mb") or 10),
        "allowed_resume_types": (platform_st.get("allowed_resume_types") or "pdf,doc,docx"),
        "max_storage_per_tenant_gb": int(platform_st.get("max_storage_per_tenant_gb") or 5),
        "config_source": "platform",
    }

    if not company_id:
        return base

    cached = _read_cache(company_id, "storage")
    if cached is not None:
        return cached

    result = base
    try:
        from app.core.database import get_company_db
        db = get_company_db(company_id)
        doc = await db.tenant_settings.find_one(
            {"company_id": company_id, "key": "storage_settings"}
        )
        if doc and doc.get("enable_storage_override"):
            result = {
                **base,
                "max_resume_size_mb": int(doc.get("max_resume_size_mb") or base["max_resume_size_mb"]),
                "allowed_resume_types": (
                    doc.get("allowed_resume_types") or base["allowed_resume_types"]
                ),
                "config_source": "tenant",
            }
    except Exception as exc:
        logger.debug("[ConfigResolution] Storage load failed for %s: %s", company_id, exc)

    _write_cache(company_id, "storage", result)
    return result


# ── SMTP resolution status (no secrets returned) ───────────────────────────────

async def get_smtp_status(company_id: str = "") -> dict:
    """
    Return a status-only dict (no secrets) describing the current SMTP resolution.
    Used by the settings UI to show "Using Platform SMTP" / "Using Tenant SMTP".

    Returns:
      {
        "system_source": "db" | "env" | "none",
        "tenant_smtp_active": bool,       # only when company_id provided
        "tenant_smtp_verified": bool,     # only when company_id provided
        "effective_source": "tenant" | "platform_db" | "platform_env" | "none",
      }
    """
    from app.core.config import settings as _cfg
    has_env_smtp = bool(
        (_cfg.SMTP_HOST or "").strip()
        and (_cfg.SMTP_USERNAME or "").strip()
        and (_cfg.SMTP_PASSWORD or "").strip()
    )

    try:
        from app.services.platform_settings_service import get_email_settings
        em = await get_email_settings()
        has_db_smtp = bool(
            em.get("smtp_host") and em.get("smtp_user") and em.get("smtp_password")
        )
        db_smtp_active = bool(has_db_smtp and em.get("smtp_is_active", True))
    except Exception:
        has_db_smtp = False
        db_smtp_active = False

    if db_smtp_active:
        system_source = "db"
    elif has_env_smtp:
        system_source = "env"
    else:
        system_source = "none"

    result: dict = {"system_source": system_source}

    if not company_id:
        result["effective_source"] = (
            "platform_db" if system_source == "db"
            else "platform_env" if system_source == "env"
            else "none"
        )
        return result

    # ── Check tenant SMTP status ───────────────────────────────────────────────
    tenant_active = False
    tenant_verified = False
    try:
        from app.core.database import get_company_db
        db = get_company_db(company_id)

        # Primary: smtp_config collection (company_settings.py path)
        sc = await db.smtp_config.find_one({"_id": "smtp"})
        if sc and sc.get("is_active") and sc.get("is_verified"):
            tenant_active = True
            tenant_verified = True
        elif not tenant_verified:
            # Secondary: tenant_settings email_config
            tc = await db.tenant_settings.find_one(
                {"company_id": company_id, "key": "email_config"}
            )
            if tc:
                tenant_verified = bool(tc.get("is_verified"))
                tenant_active = bool(tc.get("is_active") and tenant_verified)
    except Exception as exc:
        logger.debug("[ConfigResolution] Tenant SMTP status check failed %s: %s", company_id, exc)

    result["tenant_smtp_active"] = tenant_active
    result["tenant_smtp_verified"] = tenant_verified
    result["effective_source"] = (
        "tenant" if tenant_active
        else "platform_db" if system_source == "db"
        else "platform_env" if system_source == "env"
        else "none"
    )
    return result
