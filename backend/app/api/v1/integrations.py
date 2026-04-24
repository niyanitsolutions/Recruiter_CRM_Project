"""
Integrations API Routes - Phase 6
CRUD + test + toggle for third-party integration configurations.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from typing import Optional
from pydantic import BaseModel

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.services.integration_service import IntegrationService

router = APIRouter(prefix="/integrations", tags=["Integrations"])


class UpsertIntegrationRequest(BaseModel):
    provider: str
    config: dict


class SetActiveRequest(BaseModel):
    active: bool


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/definitions")
async def get_definitions(
    current_user: dict = Depends(get_current_user),
):
    """Return all supported provider definitions (field schemas)."""
    svc = IntegrationService(None)  # no DB needed
    return svc.get_definitions()


@router.get("")
async def list_integrations(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """List installed integrations for the company."""
    svc = IntegrationService(db)
    return await svc.list_integrations(current_user["company_id"])


@router.post("")
async def upsert_integration(
    body: UpsertIntegrationRequest,
    current_user: dict = Depends(require_permissions("crm_settings:edit")),
    db=Depends(get_company_db),
):
    """Create or update an integration configuration."""
    svc = IntegrationService(db)
    return await svc.upsert_integration(
        company_id=current_user["company_id"],
        provider=body.provider,
        config=body.config,
        user_id=current_user["id"],
    )


@router.post("/{provider}/test")
async def test_integration(
    provider: str,
    current_user: dict = Depends(require_permissions("crm_settings:edit")),
    db=Depends(get_company_db),
):
    """Test connectivity for a configured integration."""
    svc = IntegrationService(db)
    return await svc.test_integration(current_user["company_id"], provider)


@router.patch("/{provider}/active")
async def set_active(
    provider: str,
    body: SetActiveRequest,
    current_user: dict = Depends(require_permissions("crm_settings:edit")),
    db=Depends(get_company_db),
):
    """Enable or disable an integration."""
    svc = IntegrationService(db)
    try:
        return await svc.set_active(current_user["company_id"], provider, body.active)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/{provider}")
async def delete_integration(
    provider: str,
    current_user: dict = Depends(require_permissions("crm_settings:edit")),
    db=Depends(get_company_db),
):
    """Remove an integration configuration."""
    svc = IntegrationService(db)
    return await svc.delete_integration(current_user["company_id"], provider)
