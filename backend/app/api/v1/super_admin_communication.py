"""
Super Admin — Communication Center API.
Endpoints for managing broadcast announcements.
"""
from __future__ import annotations

import os
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.core.dependencies import get_master_db, require_super_admin
from app.models.master.communication import SuperAnnouncementCreate, SuperAnnouncementUpdate
from app.services.communication_service import CommunicationService

router = APIRouter(prefix="/communication", tags=["super-admin-communication"])

_ALLOWED_IMAGE_EXTS = {".jpg", ".jpeg", ".png", ".webp", ".svg"}
_MAX_IMAGE_SIZE     = 5 * 1024 * 1024   # 5 MB


def _get_service(master_db: AsyncIOMotorDatabase = Depends(get_master_db)) -> CommunicationService:
    return CommunicationService(master_db)


# ── Announcements CRUD ────────────────────────────────────────────────────────

@router.post("/announcements", status_code=status.HTTP_201_CREATED)
async def create_announcement(
    data: SuperAnnouncementCreate,
    admin: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    doc = await svc.create(data, admin.get("id", ""))
    return {"success": True, "announcement": doc}


@router.get("/announcements")
async def list_announcements(
    announcement_type: Optional[str] = Query(None),
    is_active:         Optional[bool] = Query(None),
    priority:          Optional[str]  = Query(None),
    status_filter:     Optional[str]  = Query(None, alias="status"),
    skip:              int            = Query(0, ge=0),
    limit:             int            = Query(50, ge=1, le=200),
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    result = await svc.list_all(
        announcement_type=announcement_type,
        is_active=is_active,
        priority=priority,
        status=status_filter,
        skip=skip,
        limit=limit,
    )
    return result


@router.get("/announcements/{announcement_id}")
async def get_announcement(
    announcement_id: str,
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    doc = await svc.get_by_id(announcement_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return doc


@router.put("/announcements/{announcement_id}")
async def update_announcement(
    announcement_id: str,
    data: SuperAnnouncementUpdate,
    admin: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    doc = await svc.update(announcement_id, data, admin.get("id", ""))
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"success": True, "announcement": doc}


@router.delete("/announcements/{announcement_id}")
async def delete_announcement(
    announcement_id: str,
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    deleted = await svc.delete(announcement_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"success": True, "message": "Announcement deleted"}


@router.patch("/announcements/{announcement_id}/toggle")
async def toggle_announcement(
    announcement_id: str,
    payload: dict,
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    is_active = payload.get("is_active")
    if is_active is None:
        raise HTTPException(status_code=400, detail="is_active field required")
    doc = await svc.set_active(announcement_id, bool(is_active))
    if not doc:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return {"success": True, "announcement": doc}


# ── Image Upload ──────────────────────────────────────────────────────────────

@router.post("/announcements/{announcement_id}/image")
async def upload_announcement_image(
    announcement_id: str,
    file: UploadFile = File(...),
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    existing = await svc.get_by_id(announcement_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Announcement not found")

    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in _ALLOWED_IMAGE_EXTS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(_ALLOWED_IMAGE_EXTS)}",
        )

    content = await file.read()
    if len(content) > _MAX_IMAGE_SIZE:
        raise HTTPException(status_code=400, detail="File too large (max 5 MB)")

    upload_dir = os.path.join("uploads", "announcements")
    os.makedirs(upload_dir, exist_ok=True)

    filename = f"{announcement_id}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(upload_dir, filename)
    with open(file_path, "wb") as f:
        f.write(content)

    image_url_path = f"/uploads/announcements/{filename}"
    updated = await svc.set_image(announcement_id, image_url_path)
    return {
        "success":      True,
        "image_path":   image_url_path,
        "announcement": updated,
    }


@router.delete("/announcements/{announcement_id}/image")
async def remove_announcement_image(
    announcement_id: str,
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    existing = await svc.get_by_id(announcement_id)
    if not existing:
        raise HTTPException(status_code=404, detail="Announcement not found")

    old_path = existing.get("image_path", "")
    if old_path:
        disk_path = old_path.lstrip("/")
        if os.path.exists(disk_path):
            os.remove(disk_path)

    updated = await svc.set_image(announcement_id, "")
    return {"success": True, "announcement": updated}


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/announcements/{announcement_id}/analytics")
async def get_analytics(
    announcement_id: str,
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    data = await svc.get_analytics(announcement_id)
    if not data:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return data


# ── Stats ─────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def get_stats(
    _: dict = Depends(require_super_admin()),
    svc: CommunicationService = Depends(_get_service),
):
    from datetime import datetime, timezone
    result = await svc.list_all(limit=1000)
    items  = result.get("items", [])
    now    = datetime.now(timezone.utc)

    def is_scheduled(a: dict) -> bool:
        sd = a.get("start_date")
        if not sd:
            return False
        try:
            if isinstance(sd, str):
                sd = datetime.fromisoformat(sd.replace("Z", "+00:00"))
            if sd.tzinfo is None:
                sd = sd.replace(tzinfo=timezone.utc)
            return sd > now
        except Exception:
            return False

    stats = {
        "total":     len(items),
        "active":    sum(1 for a in items if a.get("is_active")),
        "draft":     sum(1 for a in items if a.get("status") == "draft"),
        "critical":  sum(1 for a in items if a.get("priority") == "critical"),
        "scheduled": sum(1 for a in items if is_scheduled(a)),
        "by_type":   {},
    }
    for a in items:
        t = a.get("announcement_type", "other")
        stats["by_type"][t] = stats["by_type"].get(t, 0) + 1

    return stats


# ── Tenant search (for specific-tenant audience selector) ─────────────────────

@router.get("/tenant-search")
async def search_tenants(
    q:     str = Query("", description="Search query"),
    limit: int = Query(20, ge=1, le=100),
    _: dict = Depends(require_super_admin()),
    master_db: AsyncIOMotorDatabase = Depends(get_master_db),
):
    import re
    filt: dict = {}
    if q.strip():
        pattern = re.compile(re.escape(q.strip()), re.IGNORECASE)
        filt = {"$or": [
            {"company_name": pattern},
            {"owner.email":  pattern},
        ]}

    docs = await master_db["tenants"].find(
        filt,
        {"_id": 1, "company_id": 1, "company_name": 1},
    ).limit(limit).to_list(None)

    return {
        "tenants": [
            {
                "id":           str(d.get("_id", "")),
                "company_id":   d.get("company_id", ""),
                "company_name": d.get("company_name", ""),
            }
            for d in docs
        ]
    }


# ── Public endpoint (login page — no auth) ────────────────────────────────────

@router.get("/public-announcements")
async def get_public_announcements(
    svc: CommunicationService = Depends(_get_service),
):
    """Returns active login-screen announcements with no authentication required."""
    items = await svc.get_public_announcements()
    return {"items": items, "total": len(items)}
