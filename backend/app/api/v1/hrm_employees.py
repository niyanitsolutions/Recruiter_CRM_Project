"""HRM — Employee API Routes"""
import logging
import os
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions, require_any_permission
from app.models.company.employee import EmployeeCreate, EmployeeUpdate
from app.services.employee_service import EmployeeService

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/hrm/employees", tags=["HRM - Employees"])


@router.post("", status_code=201)
async def create_employee(
    data: EmployeeCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:employees:manage"], ["hrm:employees:create"]])),
):
    return await EmployeeService(db).create(
        data,
        company_id=cu["company_id"],
        created_by=cu["id"],
        created_by_name=cu.get("full_name") or cu.get("username") or "",
        created_by_role=cu.get("role") or "hr",
        company_name=cu.get("company_name") or "",
        crm_enabled=cu.get("crm_enabled", False),
        hrm_enabled=cu.get("hrm_enabled", True),
    )


@router.get("")
async def list_employees(
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    return await EmployeeService(db).list(cu["company_id"], status, department_id, search, page, page_size)


@router.get("/{employee_id}")
async def get_employee(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    # Allow users to read their own employee record (ESS use-case); otherwise require view perm
    is_own = cu.get("hrm_employee_id") == employee_id
    if not is_own:
        perms = set(cu.get("permissions") or [])
        if "hrm:employees:view" not in perms:
            raise HTTPException(status_code=403, detail="Permission denied")
    emp = await EmployeeService(db).get(employee_id, cu["company_id"])
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


@router.put("/{employee_id}")
async def update_employee(
    employee_id: str,
    data: EmployeeUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:employees:manage"], ["hrm:employees:edit"]])),
):
    emp = await EmployeeService(db).update(employee_id, data, cu["company_id"])
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return emp


# ── Notice Period workflow (section 11) ───────────────────────────────────────

class InitiateNoticeRequest(BaseModel):
    resignation_date: str                     # ISO date the employee resigned
    notice_days: Optional[int] = None         # optional override; else resolved


@router.post("/{employee_id}/initiate-notice")
async def initiate_notice(
    employee_id: str,
    body: InitiateNoticeRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:employees:manage"], ["hrm:employees:edit"]])),
):
    """HR initiates resignation: stores resignation date, notice days and the
    computed last working day, and moves the employee to Notice Period status
    (section 11). Additive endpoint — the existing lifecycle is unchanged."""
    from datetime import date as _date, timedelta as _td
    from app.services.employment_policy import get_employment_defaults, resolve_notice_days

    emp = await db["hrm_employees"].find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    try:
        resignation = _date.fromisoformat(str(body.resignation_date)[:10])
    except (ValueError, TypeError):
        raise HTTPException(status_code=422, detail="Invalid resignation date.")

    if body.notice_days is not None:
        if body.notice_days < 0:
            raise HTTPException(status_code=422, detail="Notice days cannot be negative.")
        notice_days = int(body.notice_days)
    else:
        notice_days = resolve_notice_days(emp, await get_employment_defaults(db))

    last_working_day = resignation + _td(days=notice_days)
    now = datetime.now(timezone.utc)
    await db["hrm_employees"].update_one(
        {"_id": employee_id, "company_id": cu["company_id"]},
        {"$set": {
            "employment_status": "notice_period",
            "resignation_date": datetime(resignation.year, resignation.month, resignation.day, tzinfo=timezone.utc),
            "notice_days": notice_days,
            "last_working_day": datetime(last_working_day.year, last_working_day.month, last_working_day.day, tzinfo=timezone.utc),
            "updated_at": now,
        }},
    )
    return {
        "success": True,
        "employment_status": "notice_period",
        "resignation_date": resignation.isoformat(),
        "notice_days": notice_days,
        "last_working_day": last_working_day.isoformat(),
    }


@router.post("/{employee_id}/photo")
async def upload_employee_photo(
    employee_id: str,
    file: UploadFile = File(...),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Upload or replace an employee's profile photo (JPG, JPEG, PNG, WEBP).

    Allowed callers:
      - Users with hrm:employees:manage permission
      - Company owners and super-admins
      - Any user uploading their own employee photo (self-service)
    """
    is_own = cu.get("hrm_employee_id") == employee_id
    user_perms = set(cu.get("permissions") or [])
    has_manage = bool(user_perms & {"hrm:employees:manage", "hrm:employees:edit"})
    if not is_own and not has_manage and not cu.get("is_owner") and not cu.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Permission denied")

    ALLOWED = {".jpg", ".jpeg", ".png", ".webp"}
    ext = os.path.splitext(file.filename or "")[1].lower()
    if ext not in ALLOWED:
        raise HTTPException(status_code=400, detail="Only JPG, JPEG, PNG, WEBP images are allowed")

    contents = await file.read()
    if len(contents) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Photo must be under 5 MB")

    # Validate employee belongs to this company BEFORE writing the file so
    # there is never a write-then-delete cycle on a filter mismatch.
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"_id": 1, "crm_user_id": 1, "photo_url": 1},
    )
    if not emp:
        logger.warning(
            "photo-upload: employee not found — id=%r company_id=%r",
            employee_id, cu.get("company_id"),
        )
        raise HTTPException(status_code=404, detail="Employee not found")

    old_photo_url = emp.get("photo_url")

    from app.utils.s3 import upload_file as s3_upload
    photo_url = await s3_upload(contents, file.filename or f"photo{ext}", folder="profiles", candidate_id=employee_id)

    # Optimistic-concurrency guard: only apply this write if photo_url still
    # matches what we just read, so a Remove that raced in after our read
    # can never stomp this upload (whichever request updates last otherwise wins).
    result = await db.hrm_employees.update_one(
        {"_id": employee_id, "photo_url": old_photo_url},
        {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        # photo_url changed since our read (concurrent remove/upload) — this
        # upload still wins by force, since it's the most recently completed one.
        await db.hrm_employees.update_one(
            {"_id": employee_id},
            {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc)}},
        )

    # Sync photo to the linked CRM user so the Users list also shows the avatar
    if emp.get("crm_user_id"):
        await db.users.update_one(
            {"_id": emp["crm_user_id"], "is_deleted": False},
            {"$set": {"avatar_url": photo_url, "updated_at": datetime.now(timezone.utc)}},
        )

    # Clean up the previous file now that the new pointer is durably written.
    if old_photo_url and old_photo_url != photo_url:
        from app.utils.s3 import delete_file
        try:
            await delete_file(old_photo_url)
        except Exception:
            pass

    logger.info("photo-upload ok — employee=%r file=%s size=%dB", employee_id, photo_url, len(contents))
    return {"photo_url": photo_url}


@router.delete("/{employee_id}/photo")
async def delete_employee_photo(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Remove an employee's profile photo (same access rule as upload)."""
    is_own = cu.get("hrm_employee_id") == employee_id
    user_perms = set(cu.get("permissions") or [])
    has_manage = bool(user_perms & {"hrm:employees:manage", "hrm:employees:edit"})
    if not is_own and not has_manage and not cu.get("is_owner") and not cu.get("is_super_admin"):
        raise HTTPException(status_code=403, detail="Permission denied")

    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"_id": 1, "crm_user_id": 1, "photo_url": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    old_photo_url = emp.get("photo_url")
    if not old_photo_url:
        return {"success": True}

    # Optimistic-concurrency guard: only clear photo_url if it still matches
    # what we just read — if an upload raced in after our read and already
    # replaced it, skip entirely rather than deleting the newer photo.
    result = await db.hrm_employees.update_one(
        {"_id": employee_id, "photo_url": old_photo_url},
        {"$set": {"photo_url": None, "updated_at": datetime.now(timezone.utc)}},
    )
    if result.modified_count == 0:
        return {"success": True}

    if emp.get("crm_user_id"):
        await db.users.update_one(
            {"_id": emp["crm_user_id"], "is_deleted": False},
            {"$set": {"avatar_url": None, "updated_at": datetime.now(timezone.utc)}},
        )

    from app.utils.s3 import delete_file
    try:
        await delete_file(old_photo_url)
    except Exception:
        pass

    return {"success": True}


@router.delete("/{employee_id}", status_code=204)
async def delete_employee(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:manage"])),
):
    deleted = await EmployeeService(db).delete(employee_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Employee not found")


@router.get("/org-chart/tree")
async def get_org_chart(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    """Return all active employees structured as a hierarchy tree."""
    cursor = db.hrm_employees.find(
        {"company_id": cu["company_id"], "is_deleted": False, "employment_status": "active"},
        {"_id": 1, "full_name": 1, "designation_name": 1, "department_name": 1,
         "reporting_manager_id": 1, "photo_url": 1, "employment_type": 1, "employee_id": 1},
    )
    employees = await cursor.to_list(length=None)

    # Build id → node dict (string keys so reporting_manager_id comparisons work)
    nodes = {}
    for e in employees:
        eid = str(e["_id"])
        nodes[eid] = {
            "id": eid,
            "employee_id": e.get("employee_id", ""),
            "name": e.get("full_name", ""),
            "designation": e.get("designation_name", ""),
            "department": e.get("department_name", ""),
            "photo_url": e.get("photo_url"),
            "employment_type": e.get("employment_type", ""),
            "reporting_manager_id": e.get("reporting_manager_id"),
            "children": [],
        }

    roots = []
    for node in nodes.values():
        mgr_id = node["reporting_manager_id"]
        if mgr_id and str(mgr_id) in nodes:
            nodes[str(mgr_id)]["children"].append(node)
        else:
            roots.append(node)

    return {"tree": roots, "total": len(nodes)}
