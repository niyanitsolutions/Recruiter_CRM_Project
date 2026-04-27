"""HRM — Announcements API Routes"""
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.announcement import AnnouncementCreate, AnnouncementUpdate
from app.services.announcement_service import AnnouncementService

router = APIRouter(prefix="/hrm/announcements", tags=["HRM - Announcements"])


@router.post("", status_code=201)
async def create_announcement(
    data: AnnouncementCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:announcements:manage"])),
):
    return await AnnouncementService(db).create(cu["company_id"], data.model_dump(), cu["id"], cu.get("username", ""))


@router.get("")
async def list_announcements(
    active_only: bool = True,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:announcements:view"])),
):
    return await AnnouncementService(db).list(cu["company_id"], active_only, page, page_size)


@router.get("/{ann_id}")
async def get_announcement(
    ann_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:announcements:view"])),
):
    ann = await AnnouncementService(db).get(ann_id, cu["company_id"])
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return ann


@router.put("/{ann_id}")
async def update_announcement(
    ann_id: str,
    data: AnnouncementUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:announcements:manage"])),
):
    ann = await AnnouncementService(db).update(ann_id, cu["company_id"], data.model_dump())
    if not ann:
        raise HTTPException(status_code=404, detail="Announcement not found")
    return ann


@router.delete("/{ann_id}", status_code=204)
async def delete_announcement(
    ann_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:announcements:manage"])),
):
    deleted = await AnnouncementService(db).delete(ann_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Announcement not found")
