"""
Telephony Settings Service — Super Admin provider-config layer.

Mirrors `payment_provider_service.py` in structure and security posture,
but keyed **per tenant** (one document per company_id) instead of a single
global document, per the Telephony spec (each tenant can have exactly one
active provider).

Collection: master_db.telephony_settings, _id = company_id.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import HTTPException

from app.telephony.services.provider_factory import get_provider

_COLLECTION = "telephony_settings"

# ─── Supported providers ──────────────────────────────────────────────────────

SUPPORTED_PROVIDERS: list[str] = [
    "twilio", "tata_smartflo", "exotel", "airtel_iq", "knowlarity",
    "ozonetel", "myoperator", "kaleyra", "infobip", "gupshup",
]

# Providers with a real implementation grounded in verified official
# documentation (auth, endpoints, request/response shapes all confirmed by
# directly reading the provider's official developer docs — see each
# adapter's module docstring for citations and any remaining unconfirmed
# details, which are marked unsupported rather than guessed).
VERIFIED_PROVIDERS: set[str] = {
    "twilio", "tata_smartflo", "exotel", "knowlarity", "ozonetel",
    "kaleyra", "infobip", "gupshup",
}

# Providers registered in the Provider Factory but not implementable from
# public official documentation (see each adapter's module docstring for
# exactly what was checked). Super Admin can see them listed but cannot
# enable them for a tenant — see super_admin_telephony.py guards.
BLOCKED_PROVIDERS: set[str] = {"airtel_iq", "myoperator"}

PROVIDER_META: dict[str, dict] = {
    "twilio": {
        "label": "Twilio", "description": "Global voice/SMS platform, fully documented REST API",
        "logo": "T", "color": "from-red-600 to-red-400",
        "fields": ["account_sid", "auth_token", "from_number", "twiml_url", "status_callback_url", "webhook_secret"],
    },
    "tata_smartflo": {
        "label": "Tata Smartflo", "description": "Tata Tele Business Services cloud calling suite",
        "logo": "TS", "color": "from-blue-700 to-blue-400",
        "fields": ["api_token", "agent_number", "caller_id", "api_base_url", "webhook_secret"],
    },
    "exotel": {
        "label": "Exotel", "description": "India's cloud telephony platform for business calling",
        "logo": "E", "color": "from-orange-600 to-orange-400",
        "fields": ["sid", "api_key", "api_token", "exophone", "api_base_url", "status_callback_url", "webhook_secret"],
    },
    "airtel_iq": {
        "label": "Airtel IQ", "description": "Blocked — official API docs not publicly reachable (see adapter docstring)",
        "logo": "A", "color": "from-red-700 to-pink-500",
        "fields": [],
    },
    "knowlarity": {
        "label": "Knowlarity", "description": "SuperReceptionist cloud telephony (SR API)",
        "logo": "K", "color": "from-yellow-600 to-yellow-400",
        "fields": ["sr_api_key", "application_access_key", "sr_number", "channel_tier", "api_base_url"],
    },
    "ozonetel": {
        "label": "Ozonetel", "description": "CloudAgent contact-center and voice API platform",
        "logo": "O", "color": "from-cyan-600 to-cyan-400",
        "fields": ["api_key", "username", "phone_name", "campaign_name", "did", "api_base_url", "webhook_secret"],
    },
    "myoperator": {
        "label": "MyOperator", "description": "Blocked — official docs internally inconsistent (see adapter docstring)",
        "logo": "M", "color": "from-green-600 to-green-400",
        "fields": [],
    },
    "kaleyra": {
        "label": "Kaleyra", "description": "Kaleyra IO CPaaS voice API",
        "logo": "KY", "color": "from-purple-600 to-purple-400",
        "fields": ["api_key", "sid", "bridge", "caller_id", "api_base_url", "webhook_secret"],
    },
    "infobip": {
        "label": "Infobip", "description": "Global CPaaS with per-account API base URL",
        "logo": "I", "color": "from-indigo-600 to-indigo-400",
        "fields": ["api_key", "api_base_url", "caller_id", "calls_configuration_id", "webhook_secret"],
    },
    "gupshup": {
        "label": "Gupshup", "description": "Voice calling via Gupshup's Knowlarity-based platform",
        "logo": "G", "color": "from-teal-600 to-emerald-400",
        "fields": ["authorization_key", "x_api_key", "k_number", "country_code", "api_base_url"],
    },
}

# Fields that contain secrets (encrypted at rest, masked in responses)
SECRET_FIELDS: set[str] = {
    "auth_token", "api_token", "api_key", "webhook_secret",
    "sr_api_key", "application_access_key", "authorization_key", "x_api_key",
}


def get_provider_status(slug: str) -> str:
    """'verified' | 'blocked' — surfaced to Super Admin before they even
    attempt to test/activate a provider."""
    return "blocked" if slug in BLOCKED_PROVIDERS else "verified"


def get_provider_capabilities(slug: str) -> dict:
    """Capability truth table for a provider, independent of any stored
    credentials — every adapter reports this from its class-level
    CAPABILITIES regardless of instance state."""
    if slug not in SUPPORTED_PROVIDERS:
        return {}
    return get_provider(slug, {}).get_capabilities()


class TelephonySettingsService:
    """Super Admin access point for per-tenant telephony provider config."""

    # ── Document structure ─────────────────────────────────────────────────
    # {
    #   "_id": company_id, "company_id": company_id,
    #   "enabled": False, "provider": None,
    #   "credentials": { "<field>_encrypted": "...", "<field>": "..." },
    #   "webhooks": {"inbound_url": "", "status_callback_url": "", "recording_url": "",
    #                "webhook_secret_encrypted": ""},
    #   "caller_ids": [], "updated_at": datetime, "updated_by": str,
    # }

    @staticmethod
    async def get_settings(master_db, company_id: str) -> dict:
        doc = await master_db[_COLLECTION].find_one({"_id": company_id})
        if not doc:
            return {"_id": company_id, "company_id": company_id, "enabled": False,
                     "provider": None, "credentials": {}, "webhooks": {}, "caller_ids": []}
        return doc

    @staticmethod
    async def get_runtime_config(master_db, company_id: str) -> Optional[dict]:
        """Return {"provider": slug, "credentials": {decrypted}} for the tenant's
        active provider, or None if telephony is disabled/unconfigured.
        This is the single entry point telephony_service.py uses at call time."""
        doc = await master_db[_COLLECTION].find_one({"_id": company_id})
        if not doc or not doc.get("enabled") or not doc.get("provider"):
            return None
        return {
            "provider": doc["provider"],
            "credentials": TelephonySettingsService.decrypt_credentials(doc.get("credentials") or {}),
            "webhooks": doc.get("webhooks") or {},
        }

    @staticmethod
    def decrypt_credentials(creds: dict) -> dict:
        from app.services.email_service import decrypt_password
        result = dict(creds)
        for field in SECRET_FIELDS:
            enc_key = f"{field}_encrypted"
            if enc_key in result:
                val = result.pop(enc_key)
                result[field] = decrypt_password(val) if val else ""
        return result

    @staticmethod
    def build_storable_credentials(payload: dict, existing: dict) -> dict:
        """Merge incoming credential fields into existing stored config.
        Secret fields: new value if supplied (encrypted), else keep existing.
        Non-secret fields: always overwrite when present in payload."""
        from app.services.email_service import encrypt_password
        result: dict[str, Any] = dict(existing)
        for field, value in payload.items():
            if value is None:
                continue
            if field in SECRET_FIELDS:
                val_str = str(value).strip()
                if val_str:
                    result[f"{field}_encrypted"] = encrypt_password(val_str)
            else:
                result[field] = value
        return result

    @staticmethod
    def safe_credentials(stored: dict) -> dict:
        """Mask secrets for API responses — never return plaintext."""
        from app.services.email_service import decrypt_password
        out: dict[str, Any] = {}
        for k, v in stored.items():
            if k.endswith("_encrypted"):
                field_name = k[:-len("_encrypted")]
                plain = decrypt_password(v) if v else ""
                out[f"{field_name}_masked"] = (
                    "" if not plain else (plain[:4] + "●" * max(0, len(plain) - 8) + plain[-4:]) if len(plain) >= 8 else "●●●●●●●●"
                )
                out[f"has_{field_name}"] = bool(v)
            else:
                out[k] = v
        return out

    @staticmethod
    async def test_connection(provider: str, credentials: dict) -> dict:
        if provider not in SUPPORTED_PROVIDERS:
            raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")
        adapter = get_provider(provider, credentials)
        return await adapter.validate_connection()
