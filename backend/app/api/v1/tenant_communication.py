"""Tenant-facing Communication API.

Company users (any authenticated tenant user) can:
  • GET  /announcements          — fetch active announcements targeted at their tenant
  • POST /announcements/dismiss  — record that the user dismissed a popup (permanent)
  • GET  /payments/gateway-status — check if payments are enabled (for UI gates)
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel

from app.core.dependencies import get_current_user, get_company_db
from app.core.database import get_master_db
from app.services.communication_service import CommunicationService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Tenant - Announcements"])


# ─── GET active announcements for this tenant ─────────────────────────────────

@router.get("/announcements")
async def get_tenant_announcements(
    location: Optional[str] = Query(None, description="Filter by display location"),
    current_user: dict = Depends(get_current_user),
    company_db=Depends(get_company_db),
):
    """
    Return active super-admin announcements visible to the current tenant.
    Filters by tenant subscription status/plan and schedule.
    """
    master_db = get_master_db()
    company_id = current_user.get("company_id")

    # Look up tenant document so we can filter by audience
    tenant = await master_db.tenants.find_one({"company_id": company_id})
    if not tenant:
        return {"items": []}

    # Load permanently dismissed IDs for this user
    try:
        dismissed_cursor = company_db["announcement_dismissals"].find(
            {"user_id": current_user["id"], "permanent": True},
            {"announcement_id": 1},
        )
        dismissed_ids = [d["announcement_id"] async for d in dismissed_cursor]
    except Exception:
        dismissed_ids = []

    svc = CommunicationService(master_db)
    items = await svc.get_active_for_tenant(
        tenant=tenant,
        display_location=location,
        dismissed_ids=dismissed_ids,
    )
    return {"items": items}


# ─── DISMISS a popup announcement ─────────────────────────────────────────────

class DismissRequest(BaseModel):
    announcement_id: str
    permanent: bool = False   # True = "Don't show again"


@router.post("/announcements/dismiss")
async def dismiss_announcement(
    body: DismissRequest,
    current_user: dict = Depends(get_current_user),
    company_db=Depends(get_company_db),
):
    """
    Record that the user dismissed an announcement.
    permanent=True means "Don't show again" — stored in company DB.
    """
    from datetime import datetime, timezone

    try:
        await company_db["announcement_dismissals"].update_one(
            {"user_id": current_user["id"], "announcement_id": body.announcement_id},
            {"$set": {
                "user_id":         current_user["id"],
                "announcement_id": body.announcement_id,
                "permanent":       body.permanent,
                "dismissed_at":    datetime.now(timezone.utc),
            }},
            upsert=True,
        )
    except Exception as exc:
        logger.warning("Failed to record announcement dismissal: %s", exc)

    return {"message": "Announcement dismissed."}


# ─── Payment gateway status (for tenant UI gates) ────────────────────────────

@router.get("/payments/gateway-status")
async def payment_gateway_status(
    _current_user: dict = Depends(get_current_user),
):
    """
    Return whether online payments are enabled and which provider is active.
    Tenant UI should check this before showing payment buttons.
    """
    master_db = get_master_db()
    doc = await master_db["payment_provider_config"].find_one(
        {"_id": "global"},
        {"payments_enabled": 1, "active_provider": 1},
    )
    if not doc:
        return {"payments_enabled": False, "active_provider": None}
    return {
        "payments_enabled": doc.get("payments_enabled", False),
        "active_provider":  doc.get("active_provider"),
    }
