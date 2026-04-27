"""
Trash API Routes - Phase 6
Soft-delete restore and permanent delete endpoints.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from typing import Optional

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.services.trash_service import TrashService

router = APIRouter(prefix="/trash", tags=["Trash"])


@router.get("")
async def list_deleted(
    module: Optional[str] = Query(None, description="Filter by module name"),
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db=Depends(get_company_db),
):
    """List all soft-deleted records, optionally filtered by module."""
    svc = TrashService(db)
    return await svc.list_deleted(module)


@router.post("/{module}/{record_id}/restore")
async def restore_record(
    module: str,
    record_id: str,
    current_user: dict = Depends(require_permissions(["audit:view"])),
    db=Depends(get_company_db),
):
    """Restore a soft-deleted record."""
    svc = TrashService(db)
    try:
        return await svc.restore(module, record_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))


@router.delete("/{module}/{record_id}")
async def permanent_delete(
    module: str,
    record_id: str,
    current_user: dict = Depends(require_permissions(["audit:admin"])),
    db=Depends(get_company_db),
):
    """Permanently delete a record from trash (irreversible)."""
    svc = TrashService(db)
    try:
        return await svc.permanent_delete(module, record_id)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc))
