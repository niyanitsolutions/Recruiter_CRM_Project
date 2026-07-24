"""Super Admin — Telephony Integrations API.

Only Super Admins can access these endpoints. Mirrors
super_admin_payment_provider.py in structure and security posture, but
config is stored **per tenant** (one document per company_id) since each
tenant can have exactly one active telephony provider.

Key invariants:
  • Telephony is DISABLED by default for every tenant.
  • Only ONE provider may be active per tenant at a time.
  • Secret credential fields are stored encrypted and never returned in plain text.
  • Blank submissions keep the existing stored secret.
"""
from __future__ import annotations

import logging
import traceback
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.core.database import get_company_db as get_company_db_by_id
from app.telephony.models.telephony import (
    SaveTelephonySettingsRequest, ToggleTelephonyRequest,
    SetTelephonyProviderRequest, TestTelephonyConnectionRequest,
)
from app.telephony.services.telephony_service import TelephonyService
from app.telephony.services.telephony_settings_service import (
    TelephonySettingsService, SUPPORTED_PROVIDERS, PROVIDER_META,
    SECRET_FIELDS, VERIFIED_PROVIDERS, BLOCKED_PROVIDERS, _COLLECTION,
    get_provider_status, get_provider_capabilities,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/telephony-provider", tags=["Super Admin - Telephony"])


async def _audit_tenant(company_id: str, action: str, description: str, auth: AuthContext) -> None:
    """Fire-and-forget audit entry written to the AFFECTED TENANT's own
    company_db.audit_logs — master_db has no audit_logs collection, index,
    or reader UI, so writing there would be invisible. Writing to the
    tenant's own audit log makes Super Admin telephony actions show up in
    that tenant's existing Audit Logs page (the only real "reuse" here).
    Never raises — an audit failure must never block the primary action."""
    try:
        from app.services.audit_service import AuditService
        company_db = get_company_db_by_id(company_id)
        await AuditService(company_db).log(
            action=action,
            entity_type="telephony_settings",
            entity_id=company_id,
            user_id=auth.user_id,
            user_name=getattr(auth, "username", None) or "Super Admin",
            user_role=getattr(auth, "role", None) or "super_admin",
            description=description,
        )
    except Exception as exc:
        logger.warning("Telephony audit log failed for company=%s action=%s: %s", company_id, action, exc)


def _doc_to_response(doc: dict) -> dict:
    return {
        "company_id":  doc.get("company_id"),
        "enabled":     doc.get("enabled", False),
        "provider":    doc.get("provider"),
        "credentials": TelephonySettingsService.safe_credentials(doc.get("credentials") or {}),
        "webhooks":    TelephonySettingsService.safe_credentials(doc.get("webhooks") or {}),
        "caller_ids":  doc.get("caller_ids") or [],
        "updated_at":  doc.get("updated_at"),
        "updated_by":  doc.get("updated_by"),
    }


# ─── Metadata ─────────────────────────────────────────────────────────────────

@router.get("/providers")
async def list_telephony_providers(_auth: AuthContext = Depends(require_super_admin)):
    """Return supported providers with their metadata, required fields,
    verification status, and per-provider capability truth table — so
    Super Admin sees exactly what's real before testing/activating anything."""
    meta_with_status = {
        slug: {**info, "status": get_provider_status(slug), "capabilities": get_provider_capabilities(slug)}
        for slug, info in PROVIDER_META.items()
    }
    return {
        "providers": SUPPORTED_PROVIDERS,
        "meta": meta_with_status,
        "secret_fields": list(SECRET_FIELDS),
        "verified_providers": list(VERIFIED_PROVIDERS),
        "blocked_providers": list(BLOCKED_PROVIDERS),
    }


# ─── Tenant list (for the management table) ───────────────────────────────────

@router.get("/tenants")
async def list_tenants_telephony_status(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    tenants_cursor = master_db.tenants.find(
        {"is_deleted": {"$ne": True}},
        {"company_id": 1, "company_name": 1, "status": 1},
    )
    tenants = [t async for t in tenants_cursor]
    company_ids = [t["company_id"] for t in tenants]

    settings_cursor = master_db[_COLLECTION].find(
        {"_id": {"$in": company_ids}}, {"enabled": 1, "provider": 1},
    )
    settings_by_id = {s["_id"]: s async for s in settings_cursor}

    return {
        "tenants": [
            {
                "company_id": t["company_id"],
                "company_name": t.get("company_name", ""),
                "status": t.get("status"),
                "telephony_enabled": settings_by_id.get(t["company_id"], {}).get("enabled", False),
                "telephony_provider": settings_by_id.get(t["company_id"], {}).get("provider"),
            }
            for t in tenants
        ]
    }


# ─── GET one tenant's config ──────────────────────────────────────────────────

@router.get("/{company_id}")
async def get_tenant_telephony_config(
    company_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    doc = await master_db[_COLLECTION].find_one({"_id": company_id})
    if not doc:
        return {"configured": False, "company_id": company_id, "enabled": False, "provider": None,
                "credentials": {}, "webhooks": {}, "caller_ids": []}
    return {"configured": True, **_doc_to_response(doc)}


# ─── SAVE / UPDATE a tenant's provider config ────────────────────────────────

@router.post("/{company_id}/save", status_code=status.HTTP_200_OK)
async def save_tenant_telephony_config(
    company_id: str,
    body: SaveTelephonySettingsRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    tenant = await master_db.tenants.find_one({"company_id": company_id})
    if not tenant:
        raise HTTPException(status_code=404, detail="Tenant not found.")
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")
    if body.activate and body.provider in BLOCKED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"'{body.provider}' cannot be enabled: {PROVIDER_META[body.provider]['description']}",
        )

    doc = await master_db[_COLLECTION].find_one({"_id": company_id}) or {}
    existing_creds = doc.get("credentials") or {} if doc.get("provider") == body.provider else {}

    incoming = body.credentials.model_dump(exclude_none=True)
    new_creds = TelephonySettingsService.build_storable_credentials(incoming, existing_creds)

    now = datetime.now(timezone.utc)
    update: dict[str, Any] = {
        "_id": company_id,
        "company_id": company_id,
        "enabled": doc.get("enabled", False),
        "provider": body.provider,
        "credentials": new_creds,
        "webhooks": doc.get("webhooks") or {},
        "caller_ids": body.caller_ids or doc.get("caller_ids") or [],
        "updated_at": now,
        "updated_by": auth.user_id,
    }
    if body.activate:
        update["enabled"] = True

    await master_db[_COLLECTION].replace_one({"_id": company_id}, update, upsert=True)

    # Keep the tenant document's cached flags in sync (read at login/refresh).
    await master_db.tenants.update_one(
        {"company_id": company_id},
        {"$set": {"telephony_enabled": update["enabled"], "telephony_provider": body.provider}},
    )

    updated = await master_db[_COLLECTION].find_one({"_id": company_id})

    was_new_provider = doc.get("provider") != body.provider
    await _audit_tenant(
        company_id,
        "provider_changed" if was_new_provider else "credentials_updated",
        f"Super Admin {'switched telephony provider to' if was_new_provider else 'updated telephony credentials for'} '{body.provider}'.",
        auth,
    )

    return {"message": f"Provider '{body.provider}' configuration saved.", **_doc_to_response(updated)}


# ─── TOGGLE enable/disable for a tenant ──────────────────────────────────────

@router.post("/{company_id}/toggle", status_code=status.HTTP_200_OK)
async def toggle_tenant_telephony(
    company_id: str,
    body: ToggleTelephonyRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    doc = await master_db[_COLLECTION].find_one({"_id": company_id})
    if body.enabled and (not doc or not doc.get("provider")):
        raise HTTPException(status_code=400, detail="Configure a provider before enabling telephony for this tenant.")
    if body.enabled and doc and doc.get("provider") in BLOCKED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"'{doc['provider']}' cannot be enabled: {PROVIDER_META[doc['provider']]['description']}",
        )

    now = datetime.now(timezone.utc)
    await master_db[_COLLECTION].update_one(
        {"_id": company_id},
        {"$set": {"enabled": body.enabled, "updated_at": now, "updated_by": auth.user_id}},
        upsert=True,
    )
    await master_db.tenants.update_one(
        {"company_id": company_id},
        {"$set": {"telephony_enabled": body.enabled}},
    )
    state = "enabled" if body.enabled else "disabled"
    await _audit_tenant(company_id, f"telephony_{state}", f"Super Admin {state} telephony for this tenant.", auth)
    return {"message": f"Telephony {state} for tenant.", "enabled": body.enabled}


# ─── SET / switch active provider ────────────────────────────────────────────

@router.post("/{company_id}/set-provider", status_code=status.HTTP_200_OK)
async def set_tenant_telephony_provider(
    company_id: str,
    body: SetTelephonyProviderRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Switch the tenant's active provider. Only one provider is ever active;
    switching does not require any other code change per the spec — the
    Provider Factory reads `provider` at call time."""
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")

    doc = await master_db[_COLLECTION].find_one({"_id": company_id})
    if not doc or doc.get("provider") != body.provider:
        raise HTTPException(
            status_code=400,
            detail=f"Provider '{body.provider}' has not been configured for this tenant yet. Save its configuration first.",
        )

    now = datetime.now(timezone.utc)
    await master_db[_COLLECTION].update_one(
        {"_id": company_id},
        {"$set": {"provider": body.provider, "updated_at": now, "updated_by": auth.user_id}},
    )
    await master_db.tenants.update_one(
        {"company_id": company_id}, {"$set": {"telephony_provider": body.provider}},
    )
    return {"message": f"Active provider switched to '{body.provider}'.", "provider": body.provider}


# ─── DELETE a tenant's config ─────────────────────────────────────────────────

@router.delete("/{company_id}", status_code=status.HTTP_200_OK)
async def delete_tenant_telephony_config(
    company_id: str,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    doc = await master_db[_COLLECTION].find_one({"_id": company_id})
    if not doc:
        raise HTTPException(status_code=404, detail="No telephony configuration found for this tenant.")

    await master_db[_COLLECTION].delete_one({"_id": company_id})
    await master_db.tenants.update_one(
        {"company_id": company_id},
        {"$set": {"telephony_enabled": False, "telephony_provider": None}},
    )
    return {"message": "Telephony configuration removed."}


# ─── Provider health (on-demand — no background polling) ─────────────────────

@router.get("/{company_id}/health")
async def tenant_telephony_health(
    company_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """On-demand connection check + real historical data from sync/webhook
    logs — never a fabricated always-on monitor (no background worker exists
    in this codebase; see Phase 1/3 scoping notes)."""
    company_db = get_company_db_by_id(company_id)
    return await TelephonyService.get_provider_health(master_db, company_db, company_id)


# ─── TEST connection ──────────────────────────────────────────────────────────

@router.post("/{company_id}/test")
async def test_tenant_telephony_connection(
    company_id: str,
    body: TestTelephonyConnectionRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")

    doc = await master_db[_COLLECTION].find_one({"_id": company_id})
    stored_creds = (doc or {}).get("credentials", {}) if doc and doc.get("provider") == body.provider else {}
    runtime = TelephonySettingsService.decrypt_credentials(stored_creds)

    incoming = body.credentials.model_dump(exclude_none=True)
    for k, v in incoming.items():
        val = v.strip() if isinstance(v, str) else v
        if val not in (None, ""):
            runtime[k] = val

    try:
        result = await TelephonySettingsService.test_connection(body.provider, runtime)
        await _audit_tenant(
            company_id, "connection_tested",
            f"Super Admin tested the {body.provider} connection ({'succeeded' if result.get('success') else 'failed'}).",
            auth,
        )
        return {"provider": body.provider, "verified_provider": body.provider in VERIFIED_PROVIDERS, **result}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("test_tenant_telephony_connection unhandled exception provider=%s: %s\n%s",
                      body.provider, exc, traceback.format_exc())
        return {"success": False, "provider": body.provider, "message": f"Internal error during test: {exc}", "steps": {}}
