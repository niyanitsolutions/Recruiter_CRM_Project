"""HRM — Holiday API Routes"""
from datetime import datetime
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import PlainTextResponse

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_holiday import HolidayCreate, HolidayUpdate
from app.services.hrm_holiday_service import HolidayService

router = APIRouter(prefix="/hrm/holidays", tags=["HRM - Holidays"])

_MANAGE = Depends(require_permissions(["hrm:attendance:manage"]))
_VIEW   = Depends(require_permissions(["hrm:attendance:team"]))


def _ip(request: Request) -> Optional[str]:
    fwd = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
    return fwd or (request.client.host if request.client else None)


# ── List ──────────────────────────────────────────────────────────────────────

@router.get("")
async def list_holidays(
    year: Optional[int] = Query(None),
    holiday_type: Optional[str] = Query(None),
    department: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_VIEW,
):
    return await HolidayService(db).list(
        company_id=cu["company_id"],
        year=year,
        holiday_type=holiday_type,
        department=department,
        page=page,
        page_size=page_size,
    )


# ── Create ────────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_holiday(
    data: HolidayCreate,
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        return await HolidayService(db).create(
            data.model_dump(), cu["company_id"], cu["id"], _ip(request)
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


# ── Get single ────────────────────────────────────────────────────────────────

@router.get("/{holiday_id}")
async def get_holiday(
    holiday_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_VIEW,
):
    h = await HolidayService(db).get(holiday_id, cu["company_id"])
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return h


# ── Update ────────────────────────────────────────────────────────────────────

@router.put("/{holiday_id}")
async def update_holiday(
    holiday_id: str,
    data: HolidayUpdate,
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    try:
        h = await HolidayService(db).update(
            holiday_id,
            data.model_dump(exclude_none=True),
            cu["company_id"],
            cu["id"],
            _ip(request),
        )
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))
    if not h:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return h


# ── Delete ────────────────────────────────────────────────────────────────────

@router.delete("/{holiday_id}")
async def delete_holiday(
    holiday_id: str,
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    ok = await HolidayService(db).delete(holiday_id, cu["company_id"], cu["id"], _ip(request))
    if not ok:
        raise HTTPException(status_code=404, detail="Holiday not found")
    return {"ok": True}


# ── Check date ────────────────────────────────────────────────────────────────

@router.get("/check/{check_date}")
async def check_holiday(
    check_date: str,
    department: Optional[str] = Query(None),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return holiday info if date is a holiday, else null."""
    try:
        datetime.strptime(check_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=422, detail="Date must be YYYY-MM-DD")
    h = await HolidayService(db).is_holiday(check_date, cu["company_id"], department)
    return {"is_holiday": h is not None, "holiday": h}


# ── Import CSV ────────────────────────────────────────────────────────────────

@router.post("/import")
async def import_holidays(
    request: Request,
    file: UploadFile = File(...),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=422, detail="Only CSV files are supported")
    content_bytes = await file.read()
    try:
        csv_text = content_bytes.decode("utf-8-sig")  # handle BOM
    except UnicodeDecodeError:
        csv_text = content_bytes.decode("latin-1")
    result = await HolidayService(db).import_from_csv(
        csv_text, cu["company_id"], cu["id"], _ip(request)
    )
    return result


# ── Export CSV ────────────────────────────────────────────────────────────────

@router.get("/export/csv", response_class=PlainTextResponse)
async def export_holidays(
    year: Optional[int] = Query(None),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_VIEW,
):
    svc = HolidayService(db)
    result = await svc.list(company_id=cu["company_id"], year=year, page_size=500)
    csv_text = svc.export_to_csv(result["items"])
    return PlainTextResponse(
        content=csv_text,
        media_type="text/csv",
        headers={"Content-Disposition": f'attachment; filename="holidays_{year or "all"}.csv"'},
    )


# ── Copy to next year ─────────────────────────────────────────────────────────

@router.post("/copy-next-year")
async def copy_to_next_year(
    request: Request,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _p=_MANAGE,
):
    result = await HolidayService(db).copy_to_next_year(
        cu["company_id"], cu["id"], _ip(request)
    )
    return result
