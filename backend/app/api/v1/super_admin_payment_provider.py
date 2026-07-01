"""Super Admin — Payment Provider Management API.

Only Super Admins can access these endpoints.
Mirrors super_admin_ai.py in structure and security posture.

Key invariants:
  • Payments are DISABLED by default after any fresh installation.
  • Only ONE provider may be active at a time; activating a new one deactivates all others.
  • Secret fields are stored encrypted and never returned in plain text.
  • Secrets display as masked values; blank submissions keep the existing stored secret.
"""
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.services.payment_provider_service import (
    PaymentProviderService,
    SUPPORTED_PROVIDERS,
    PROVIDER_META,
    SECRET_FIELDS,
    _COLLECTION,
    _DOC_ID,
)

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Super Admin - Payment Provider"])


# ─── Request / response schemas ───────────────────────────────────────────────

class ProviderConfigPayload(BaseModel):
    """Generic provider config — all fields optional; only relevant ones are stored."""
    # Razorpay
    key_id:            Optional[str] = None
    key_secret:        Optional[str] = None
    # Stripe
    publishable_key:   Optional[str] = None
    secret_key:        Optional[str] = None
    # Cashfree / PayPal
    client_id:         Optional[str] = None
    client_secret:     Optional[str] = None
    # PhonePe
    merchant_id:       Optional[str] = None
    salt_key:          Optional[str] = None
    salt_index:        Optional[str] = None
    # PayU
    merchant_key:      Optional[str] = None
    merchant_salt:     Optional[str] = None
    auth_header:       Optional[str] = None
    # CCAvenue
    access_code:       Optional[str] = None
    working_key:       Optional[str] = None
    # Instamojo / generic
    api_key:           Optional[str] = None
    auth_token:        Optional[str] = None
    # Custom REST
    base_url:          Optional[str] = None
    secret:            Optional[str] = None
    auth_type:         Optional[str] = None
    custom_headers:    dict[str, str] = {}
    # Shared
    webhook_secret:    Optional[str] = None
    environment:       str = "sandbox"
    currency:          str = "INR"
    timeout:           int = Field(default=30, ge=5, le=300)
    retry_count:       int = Field(default=2, ge=0, le=5)


class SaveProviderRequest(BaseModel):
    provider: str
    config: ProviderConfigPayload
    activate: bool = False          # immediately set as active_provider


class SetActiveProviderRequest(BaseModel):
    provider: str


class SetPaymentsEnabledRequest(BaseModel):
    enabled: bool


class TestConnectionRequest(BaseModel):
    provider: str
    config: ProviderConfigPayload


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _mask_secret(encrypted_val: Optional[str]) -> str:
    """Return masked display string for a secret value."""
    if not encrypted_val:
        return ""
    from app.services.email_service import decrypt_password
    plain = decrypt_password(encrypted_val)
    if not plain:
        return ""
    if len(plain) < 8:
        return "●●●●●●●●"
    return plain[:4] + "●" * (len(plain) - 8) + plain[-4:]


def _safe_provider_config(provider: str, stored: dict) -> dict:
    """Convert a stored provider config to safe API response (secrets masked)."""
    out: dict[str, Any] = {}
    for k, v in stored.items():
        if k.endswith("_encrypted"):
            field_name = k[:-len("_encrypted")]
            out[f"{field_name}_masked"] = _mask_secret(v)
            out[f"has_{field_name}"] = bool(v)
        else:
            out[k] = v
    return out


def _build_storable_config(payload: ProviderConfigPayload, existing_provider_cfg: dict) -> dict:
    """
    Merge incoming payload into existing stored config.
    - Non-secret fields: always overwrite.
    - Secret fields: use new value if supplied; keep existing encrypted value otherwise.
    """
    from app.services.email_service import encrypt_password

    raw = payload.model_dump(exclude_none=True)
    result: dict[str, Any] = dict(existing_provider_cfg)  # start from existing

    for field, value in raw.items():
        if field in SECRET_FIELDS:
            val_str = str(value).strip() if value else ""
            if val_str:
                result[f"{field}_encrypted"] = encrypt_password(val_str)
            # else: keep existing encrypted value (blank = no change)
        else:
            result[field] = value

    return result


def _doc_to_response(doc: dict) -> dict:
    """Convert the global config document to a safe API response."""
    providers_raw = doc.get("providers") or {}
    providers_safe = {
        p: _safe_provider_config(p, cfg)
        for p, cfg in providers_raw.items()
    }
    return {
        "payments_enabled": doc.get("payments_enabled", False),
        "active_provider":  doc.get("active_provider"),
        "providers":        providers_safe,
        "updated_at":       doc.get("updated_at"),
        "updated_by":       doc.get("updated_by"),
    }


# ─── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/payment-provider/providers")
async def list_payment_providers(_auth: AuthContext = Depends(require_super_admin)):
    """Return supported providers with their metadata and required fields."""
    return {
        "providers": SUPPORTED_PROVIDERS,
        "meta":      PROVIDER_META,
        "secret_fields": list(SECRET_FIELDS),
    }


# ─── GET global config ────────────────────────────────────────────────────────

@router.get("/payment-provider")
async def get_payment_provider_config(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Return the full payment provider configuration (secrets masked)."""
    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    if not doc:
        return {"configured": False, "payments_enabled": False, "active_provider": None, "providers": {}}
    return {"configured": True, **_doc_to_response(doc)}


# ─── Global Enable/Disable payments ──────────────────────────────────────────

@router.post("/payment-provider/toggle", status_code=status.HTTP_200_OK)
async def toggle_payments(
    body: SetPaymentsEnabledRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Enable or disable payments globally. Only Super Admin can do this."""
    now = datetime.now(timezone.utc)
    await master_db[_COLLECTION].update_one(
        {"_id": _DOC_ID},
        {"$set": {
            "payments_enabled": body.enabled,
            "updated_at": now,
            "updated_by": auth.user_id,
        }},
        upsert=True,
    )
    state = "enabled" if body.enabled else "disabled"
    return {"message": f"Payments {state}.", "payments_enabled": body.enabled}


# ─── SAVE / UPDATE a provider config ─────────────────────────────────────────

@router.post("/payment-provider/save", status_code=status.HTTP_200_OK)
async def save_provider_config(
    body: SaveProviderRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Save (create or update) the configuration for a specific provider."""
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{body.provider}'. Supported: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    # Load existing document
    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID}) or {}
    providers = dict(doc.get("providers") or {})
    existing_cfg = providers.get(body.provider, {})

    # Build storable config (secrets encrypted, blank = keep existing)
    new_cfg = _build_storable_config(body.config, existing_cfg)
    providers[body.provider] = new_cfg

    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {
        "payments_enabled": doc.get("payments_enabled", False),
        "providers": providers,
        "updated_at": now,
        "updated_by": auth.user_id,
    }

    # If activate=True, set as active provider
    if body.activate:
        update["active_provider"] = body.provider
    else:
        update["active_provider"] = doc.get("active_provider")

    await master_db[_COLLECTION].replace_one({"_id": _DOC_ID}, {"_id": _DOC_ID, **update}, upsert=True)

    # Reload and return safe response
    updated = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    return {
        "message": f"Provider '{body.provider}' configuration saved.",
        **_doc_to_response(updated),
    }


# ─── SET active provider ──────────────────────────────────────────────────────

@router.post("/payment-provider/set-active", status_code=status.HTTP_200_OK)
async def set_active_provider(
    body: SetActiveProviderRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Switch the active payment provider. All other providers become inactive."""
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")

    # Verify the provider is configured
    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    if not doc:
        raise HTTPException(status_code=404, detail="No payment provider configuration found. Save a provider first.")

    providers = doc.get("providers") or {}
    if body.provider not in providers:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' has not been configured yet. Save its configuration first.",
        )

    now = datetime.now(timezone.utc)
    await master_db[_COLLECTION].update_one(
        {"_id": _DOC_ID},
        {"$set": {"active_provider": body.provider, "updated_at": now, "updated_by": auth.user_id}},
    )
    return {"message": f"Active provider switched to '{body.provider}'.", "active_provider": body.provider}


# ─── DEACTIVATE provider (set active_provider to None) ───────────────────────

@router.post("/payment-provider/deactivate", status_code=status.HTTP_200_OK)
async def deactivate_provider(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Clear the active provider (no provider will be active)."""
    now = datetime.now(timezone.utc)
    await master_db[_COLLECTION].update_one(
        {"_id": _DOC_ID},
        {"$set": {"active_provider": None, "updated_at": now, "updated_by": auth.user_id}},
        upsert=True,
    )
    return {"message": "Active provider cleared.", "active_provider": None}


# ─── DELETE a provider config ─────────────────────────────────────────────────

@router.delete("/payment-provider/{provider}", status_code=status.HTTP_200_OK)
async def delete_provider_config(
    provider: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Remove all configuration for a specific provider."""
    if provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")

    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    if not doc:
        raise HTTPException(status_code=404, detail="No payment configuration found.")

    providers = dict(doc.get("providers") or {})
    if provider not in providers:
        raise HTTPException(status_code=404, detail=f"Provider '{provider}' is not configured.")

    del providers[provider]
    now = datetime.now(timezone.utc)

    active = doc.get("active_provider")
    new_active = None if active == provider else active

    await master_db[_COLLECTION].update_one(
        {"_id": _DOC_ID},
        {"$set": {
            "providers": providers,
            "active_provider": new_active,
            "updated_at": now,
            "updated_by": auth.user_id,
        }},
    )
    return {"message": f"Provider '{provider}' configuration removed.", "active_provider": new_active}


# ─── TEST connection ──────────────────────────────────────────────────────────

@router.post("/payment-provider/test")
async def test_payment_provider(
    body: TestConnectionRequest,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """
    Test connectivity and credentials for a provider.
    Accepts either new credentials (in body.config) or falls back to stored secrets.
    """
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")

    # Build a runtime config: merge stored encrypted values with what was supplied
    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    stored_cfg = (doc or {}).get("providers", {}).get(body.provider, {}) if doc else {}

    # Start with decrypted stored values
    from app.services.email_service import decrypt_password
    runtime: dict[str, Any] = {}
    for k, v in stored_cfg.items():
        if k.endswith("_encrypted"):
            field_name = k[:-len("_encrypted")]
            runtime[field_name] = decrypt_password(v) if v else ""
        else:
            runtime[k] = v

    # Override with values from the request (non-empty values only).
    # Preserve numeric types (timeout, retry_count) — do not coerce to str.
    incoming = body.config.model_dump(exclude_none=True)
    for k, v in incoming.items():
        val = v.strip() if isinstance(v, str) else v
        if val not in (None, ""):
            runtime[k] = val

    try:
        result = await PaymentProviderService.test_connection(body.provider, runtime, master_db)
        return {"provider": body.provider, **result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error(
            "test_payment_provider unhandled exception provider=%s: %s\n%s",
            body.provider, exc, traceback.format_exc(),
        )
        return {
            "success":  False,
            "provider": body.provider,
            "message":  f"Internal error during test: {exc}",
            "steps":    {},
        }


# ─── Runtime status (non-admin; used by payment flow to check if enabled) ────

@router.get("/payment-provider/status")
async def payment_provider_status(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Quick status check: are payments enabled and which provider is active?"""
    doc = await master_db[_COLLECTION].find_one(
        {"_id": _DOC_ID},
        {"payments_enabled": 1, "active_provider": 1},
    )
    if not doc:
        return {"payments_enabled": False, "active_provider": None}
    return {
        "payments_enabled": doc.get("payments_enabled", False),
        "active_provider":  doc.get("active_provider"),
    }
