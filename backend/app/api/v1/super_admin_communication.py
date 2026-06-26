"""Super Admin — Communication Center API.

Only Super Admins can access these management endpoints.
Tenants read announcements via /api/v1/announcements (tenant_communication.py).
"""
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.middleware.auth import require_super_admin, AuthContext
from app.middleware.tenant import get_master_database
from app.models.master.communication import SuperAnnouncementCreate, SuperAnnouncementUpdate
from app.services.communication_service import CommunicationService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Super Admin - Communication Center"])


def _svc(master_db) -> CommunicationService:
    return CommunicationService(master_db)


# ─── CREATE ───────────────────────────────────────────────────────────────────

@router.post("/communication/announcements", status_code=status.HTTP_201_CREATED)
async def create_announcement(
    body: SuperAnnouncementCreate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Create a new super-admin announcement."""
    svc = _svc(master_db)
    doc = await svc.create(body, auth.user_id)
    return {"message": "Announcement created.", "announcement": doc}


# ─── LIST ─────────────────────────────────────────────────────────────────────

@router.get("/communication/announcements")
async def list_announcements(
    announcement_type: Optional[str] = Query(None),
    is_active: Optional[bool] = Query(None),
    priority: Optional[str] = Query(None),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=200),
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """List all super-admin announcements with optional filters."""
    svc = _svc(master_db)
    return await svc.list_all(
        announcement_type=announcement_type,
        is_active=is_active,
        priority=priority,
        skip=skip,
        limit=limit,
    )


# ─── GET ONE ──────────────────────────────────────────────────────────────────

@router.get("/communication/announcements/{announcement_id}")
async def get_announcement(
    announcement_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Get a single announcement by ID."""
    svc = _svc(master_db)
    doc = await svc.get_by_id(announcement_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    return doc


# ─── UPDATE ───────────────────────────────────────────────────────────────────

@router.put("/communication/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    body: SuperAnnouncementUpdate,
    auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Update an announcement."""
    svc = _svc(master_db)
    doc = await svc.update(announcement_id, body, auth.user_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    return {"message": "Announcement updated.", "announcement": doc}


# ─── TOGGLE ACTIVE ────────────────────────────────────────────────────────────

@router.patch("/communication/announcements/{announcement_id}/toggle")
async def toggle_announcement(
    announcement_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Toggle the is_active flag on an announcement."""
    svc = _svc(master_db)
    existing = await svc.get_by_id(announcement_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    new_state = not existing.get("is_active", True)
    doc = await svc.set_active(announcement_id, new_state)
    state_label = "activated" if new_state else "deactivated"
    return {"message": f"Announcement {state_label}.", "announcement": doc}


@router.patch("/communication/announcements/{announcement_id}/activate")
async def activate_announcement(
    announcement_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    doc = await _svc(master_db).set_active(announcement_id, True)
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    return {"message": "Announcement activated.", "announcement": doc}


@router.patch("/communication/announcements/{announcement_id}/deactivate")
async def deactivate_announcement(
    announcement_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    doc = await _svc(master_db).set_active(announcement_id, False)
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    return {"message": "Announcement deactivated.", "announcement": doc}


# ─── DELETE ───────────────────────────────────────────────────────────────────

@router.delete("/communication/announcements/{announcement_id}", status_code=status.HTTP_200_OK)
async def delete_announcement(
    announcement_id: str,
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Soft-delete an announcement."""
    svc = _svc(master_db)
    deleted = await svc.delete(announcement_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Announcement not found.")
    return {"message": "Announcement deleted."}


# ─── STATS ────────────────────────────────────────────────────────────────────

@router.get("/communication/stats")
async def communication_stats(
    _auth: AuthContext = Depends(require_super_admin),
    master_db=Depends(get_master_database),
):
    """Summary counts for the Communication Center dashboard card."""
    col = master_db["super_announcements"]
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)

    total     = await col.count_documents({"is_deleted": False})
    active    = await col.count_documents({"is_deleted": False, "is_active": True})
    critical  = await col.count_documents({"is_deleted": False, "is_active": True, "priority": "critical"})
    scheduled = await col.count_documents({
        "is_deleted": False, "is_active": True,
        "start_date": {"$gt": now},
    })
    expired   = await col.count_documents({
        "is_deleted": False,
        "end_date":   {"$lt": now, "$ne": None},
    })

    by_type = {}
    pipeline = [
        {"$match": {"is_deleted": False}},
        {"$group": {"_id": "$announcement_type", "count": {"$sum": 1}}},
    ]
    async for row in col.aggregate(pipeline):
        by_type[row["_id"]] = row["count"]

    return {
        "total": total,
        "active": active,
        "critical": critical,
        "scheduled": scheduled,
        "expired": expired,
        "by_type": by_type,
    }
