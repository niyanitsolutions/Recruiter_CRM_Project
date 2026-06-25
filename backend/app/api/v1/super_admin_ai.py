"""Super Admin — AI Provider Management API.

Only Super Admins can access these endpoints.
Tenants, owners, employees, and all other roles have zero access.
"""
import logging
import traceback
from datetime import datetime, timezone
from typing import Any, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.services.ai_service import AIService, SUPPORTED_PROVIDERS, PROVIDER_MODELS, _COLLECTION, _DOC_ID

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Super Admin - AI Provider"])

# ─── Request / response schemas ───────────────────────────────────────────────

class AIProviderSaveRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None          # plain text; will be encrypted before storage
    model: Optional[str] = None
    temperature: float = Field(default=0.3, ge=0.0, le=2.0)
    top_p: float = Field(default=1.0, ge=0.0, le=1.0)
    max_tokens: int = Field(default=2048, ge=1, le=128000)
    timeout: int = Field(default=30, ge=5, le=300)
    retry_count: int = Field(default=2, ge=0, le=5)
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    region: Optional[str] = None
    azure_endpoint: Optional[str] = None
    api_version: Optional[str] = None
    base_url: Optional[str] = None
    custom_headers: dict[str, str] = {}
    is_active: bool = True


class AIProviderTestRequest(BaseModel):
    provider: str
    api_key: Optional[str] = None
    model: Optional[str] = None
    temperature: float = 0.3
    max_tokens: int = 256               # keep test calls cheap
    timeout: int = 30
    organization_id: Optional[str] = None
    project_id: Optional[str] = None
    region: Optional[str] = None
    azure_endpoint: Optional[str] = None
    api_version: Optional[str] = None
    base_url: Optional[str] = None
    custom_headers: dict[str, str] = {}


def _mask_key(encrypted: Optional[str]) -> str:
    """Return a safe masked representation for UI display."""
    if not encrypted:
        return ""
    from app.services.email_service import decrypt_password
    plain = decrypt_password(encrypted)
    if not plain or len(plain) < 8:
        return "●●●●●●●●"
    return plain[:4] + "●" * (len(plain) - 8) + plain[-4:]


def _doc_to_response(doc: dict) -> dict:
    """Convert DB document to safe API response (no raw key)."""
    return {
        "provider":        doc.get("provider", ""),
        "model":           doc.get("model", ""),
        "temperature":     doc.get("temperature", 0.3),
        "top_p":           doc.get("top_p", 1.0),
        "max_tokens":      doc.get("max_tokens", 2048),
        "timeout":         doc.get("timeout", 30),
        "retry_count":     doc.get("retry_count", 2),
        "organization_id": doc.get("organization_id"),
        "project_id":      doc.get("project_id"),
        "region":          doc.get("region"),
        "azure_endpoint":  doc.get("azure_endpoint"),
        "api_version":     doc.get("api_version"),
        "base_url":        doc.get("base_url"),
        "custom_headers":  doc.get("custom_headers") or {},
        "is_active":       doc.get("is_active", True),
        "has_api_key":     bool(doc.get("api_key_encrypted")),
        "api_key_masked":  _mask_key(doc.get("api_key_encrypted")),
        "updated_at":      doc.get("updated_at"),
        "updated_by":      doc.get("updated_by"),
    }


# ─── Metadata (no DB) ─────────────────────────────────────────────────────────

@router.get("/ai-provider/providers")
async def list_providers(_auth: AuthContext = Depends(require_super_admin)):
    """Return supported providers and their available models."""
    return {
        "providers": SUPPORTED_PROVIDERS,
        "models": PROVIDER_MODELS,
    }


# ─── GET active config ────────────────────────────────────────────────────────

@router.get("/ai-provider")
async def get_ai_provider(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Return the current AI provider configuration (API key is masked)."""
    doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
    if not doc:
        return {"configured": False}
    return {"configured": True, **_doc_to_response(doc)}


# ─── SAVE config ──────────────────────────────────────────────────────────────

@router.post("/ai-provider", status_code=status.HTTP_200_OK)
async def save_ai_provider(
    body: AIProviderSaveRequest,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Create or update the AI provider configuration."""
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported provider '{body.provider}'. Supported: {', '.join(SUPPORTED_PROVIDERS)}",
        )

    existing = await master_db[_COLLECTION].find_one({"_id": _DOC_ID}, {"api_key_encrypted": 1})
    existing_key = (existing or {}).get("api_key_encrypted")

    # Resolve API key: use new key if supplied, keep existing if not
    if body.api_key and body.api_key.strip():
        from app.services.email_service import encrypt_password
        api_key_encrypted = encrypt_password(body.api_key.strip())
    else:
        api_key_encrypted = existing_key  # keep whatever was stored

    now = datetime.now(timezone.utc)
    doc: dict[str, Any] = {
        "_id":             _DOC_ID,
        "provider":        body.provider,
        "api_key_encrypted": api_key_encrypted,
        "model":           body.model or "",
        "temperature":     body.temperature,
        "top_p":           body.top_p,
        "max_tokens":      body.max_tokens,
        "timeout":         body.timeout,
        "retry_count":     body.retry_count,
        "organization_id": body.organization_id,
        "project_id":      body.project_id,
        "region":          body.region,
        "azure_endpoint":  body.azure_endpoint,
        "api_version":     body.api_version,
        "base_url":        body.base_url,
        "custom_headers":  body.custom_headers,
        "is_active":       body.is_active,
        "updated_at":      now,
        "updated_by":      auth.user_id,
    }

    await master_db[_COLLECTION].replace_one({"_id": _DOC_ID}, doc, upsert=True)
    return {"message": "AI provider configuration saved.", **_doc_to_response(doc)}


# ─── REMOVE API key ───────────────────────────────────────────────────────────

@router.delete("/ai-provider/api-key", status_code=status.HTTP_200_OK)
async def remove_api_key(
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Remove the stored API key from the active configuration."""
    result = await master_db[_COLLECTION].update_one(
        {"_id": _DOC_ID},
        {"$set": {"api_key_encrypted": None, "updated_at": datetime.now(timezone.utc), "updated_by": auth.user_id}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="No AI provider configuration found.")
    return {"message": "API key removed."}


# ─── TEST connection ──────────────────────────────────────────────────────────

@router.post("/ai-provider/test")
async def test_ai_provider(
    body: AIProviderTestRequest,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Test-fire a minimal prompt against the supplied (or active) provider config.

    If body.api_key is not supplied, falls back to the stored encrypted key.
    """
    if body.provider not in SUPPORTED_PROVIDERS:
        raise HTTPException(status_code=400, detail=f"Unsupported provider '{body.provider}'.")

    # Resolve API key: use supplied → decrypt stored → empty
    api_key = (body.api_key or "").strip()
    if not api_key:
        existing = await master_db[_COLLECTION].find_one({"_id": _DOC_ID}, {"api_key_encrypted": 1})
        if existing and existing.get("api_key_encrypted"):
            from app.services.email_service import decrypt_password
            api_key = decrypt_password(existing["api_key_encrypted"])

    config_override = {
        "provider":        body.provider,
        "api_key":         api_key,
        "model":           body.model or "",
        "temperature":     body.temperature,
        "max_tokens":      body.max_tokens,
        "timeout":         body.timeout,
        "retry_count":     1,
        "organization_id": body.organization_id,
        "project_id":      body.project_id,
        "region":          body.region,
        "azure_endpoint":  body.azure_endpoint,
        "api_version":     body.api_version,
        "base_url":        body.base_url,
        "custom_headers":  body.custom_headers,
    }

    try:
        result = await AIService.test_connection(config_override, master_db)
        return result
    except HTTPException:
        raise  # auth / validation errors propagate normally
    except Exception as exc:
        logger.error(
            "test_ai_provider unhandled exception provider=%s: %s\n%s",
            body.provider, exc, traceback.format_exc(),
        )
        return {
            "success":  False,
            "provider": body.provider,
            "model":    body.model or "",
            "message":  f"Internal error during test: {exc}",
            "steps":    {},
        }
