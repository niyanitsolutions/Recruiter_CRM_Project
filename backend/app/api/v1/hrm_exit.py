"""HRM — Exit Management API"""
from datetime import datetime, date, timezone, timedelta
from typing import Optional
import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.exit_management import ExitCreate, ExitUpdate, ExitStatusUpdate

router = APIRouter(prefix="/hrm/exit", tags=["HRM - Exit Management"])

DEFAULT_CHECKLIST = [
    "Return company assets (laptop, phone, access cards)",
    "Handover pending tasks and documentation",
    "IT access revocation",
    "Email handover / auto-reply setup",
    "Finance clearance (salary, reimbursements)",
    "PF/Gratuity processing",
    "Experience letter / relieving letter issued",
    "Exit interview completed",
]


def _serial(doc: dict) -> dict:
    if doc:
        doc["id"] = doc.pop("_id", doc.get("id"))
    return doc


@router.post("", status_code=201)
async def create_exit_request(
    data: ExitCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    # Validate employee exists
    emp = await db.hrm_employees.find_one(
        {"_id": data.employee_id, "company_id": cu["company_id"], "is_deleted": False}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Prevent duplicate active exit requests
    existing = await db.hrm_exit.find_one({
        "employee_id": data.employee_id,
        "company_id": cu["company_id"],
        "status": {"$nin": ["completed", "cancelled"]},
        "is_deleted": False,
    })
    if existing:
        raise HTTPException(status_code=400, detail="An active exit request already exists for this employee")

    last_working_date = data.resignation_date + timedelta(days=data.notice_period_days)

    # Resolve manager name
    manager_name = None
    if data.manager_id:
        mgr = await db.hrm_employees.find_one({"_id": data.manager_id, "company_id": cu["company_id"]})
        if mgr:
            manager_name = mgr.get("full_name")

    now = datetime.now(timezone.utc)
    checklist = [{"item": item, "completed": False} for item in DEFAULT_CHECKLIST]

    doc = {
        "_id": str(uuid.uuid4()),
        "company_id": cu["company_id"],
        "employee_id": emp["_id"],
        "employee_name": emp.get("full_name", ""),
        "employee_code": emp.get("employee_id"),
        "department_name": emp.get("department_name"),
        "designation_name": emp.get("designation_name"),
        "exit_type": data.exit_type,
        "status": "submitted",
        "resignation_date": data.resignation_date.isoformat(),
        "last_working_date": last_working_date.isoformat(),
        "notice_period_days": data.notice_period_days,
        "reason": data.reason,
        "detailed_reason": data.detailed_reason,
        "manager_id": data.manager_id,
        "manager_name": manager_name,
        "checklist": checklist,
        "assets_returned": False,
        "exit_interview_done": False,
        "created_by": cu["id"],
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    await db.hrm_exit.insert_one(doc)
    return _serial(doc)


@router.get("")
async def list_exit_requests(
    status: Optional[str] = None,
    department_id: Optional[str] = None,
    search: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    query = {"company_id": cu["company_id"], "is_deleted": False}
    if status:
        query["status"] = status
    if search:
        query["$or"] = [
            {"employee_name": {"$regex": search, "$options": "i"}},
            {"employee_code": {"$regex": search, "$options": "i"}},
        ]

    total = await db.hrm_exit.count_documents(query)
    skip  = (page - 1) * page_size
    cursor = db.hrm_exit.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(length=page_size)
    return {"items": [_serial(i) for i in items], "total": total, "page": page, "page_size": page_size}


@router.get("/{exit_id}")
async def get_exit_request(
    exit_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    doc = await db.hrm_exit.find_one({"_id": exit_id, "company_id": cu["company_id"], "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Exit request not found")
    return _serial(doc)


@router.put("/{exit_id}")
async def update_exit_request(
    exit_id: str,
    data: ExitUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    updates = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if "resignation_date" in updates or "notice_period_days" in updates:
        doc = await db.hrm_exit.find_one({"_id": exit_id, "company_id": cu["company_id"]})
        if doc:
            res_date = updates.get("resignation_date", doc.get("resignation_date"))
            if isinstance(res_date, str):
                res_date = date.fromisoformat(res_date)
            days = updates.get("notice_period_days", doc.get("notice_period_days", 30))
            updates["last_working_date"] = (res_date + timedelta(days=days)).isoformat()
    updates["updated_at"] = datetime.now(timezone.utc)
    result = await db.hrm_exit.find_one_and_update(
        {"_id": exit_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Exit request not found")
    return _serial(result)


@router.post("/{exit_id}/status")
async def update_exit_status(
    exit_id: str,
    data: ExitStatusUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    now = datetime.now(timezone.utc)
    updates: dict = {"status": data.status, "updated_at": now}
    if data.notes:
        updates["manager_notes"] = data.notes
    if data.status == "in_notice":
        updates["manager_acknowledged_at"] = now
    result = await db.hrm_exit.find_one_and_update(
        {"_id": exit_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$set": updates},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Exit request not found")

    # Mark employee as resigned if completed
    if data.status == "completed":
        await db.hrm_employees.update_one(
            {"_id": result["employee_id"], "company_id": cu["company_id"]},
            {"$set": {"employment_status": "resigned", "updated_at": now}},
        )
    return _serial(result)


@router.post("/{exit_id}/checklist/{item_index}")
async def toggle_checklist_item(
    exit_id: str,
    item_index: int,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    doc = await db.hrm_exit.find_one({"_id": exit_id, "company_id": cu["company_id"], "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Exit request not found")

    checklist = doc.get("checklist", [])
    if item_index < 0 or item_index >= len(checklist):
        raise HTTPException(status_code=400, detail="Invalid checklist item index")

    now = datetime.now(timezone.utc)
    item = checklist[item_index]
    item["completed"] = not item.get("completed", False)
    item["completed_by"] = cu["id"] if item["completed"] else None
    item["completed_at"] = now if item["completed"] else None

    await db.hrm_exit.update_one(
        {"_id": exit_id},
        {"$set": {"checklist": checklist, "updated_at": now}},
    )
    return {"checklist": checklist}


@router.delete("/{exit_id}", status_code=204)
async def cancel_exit_request(
    exit_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:exit:manage"])),
):
    result = await db.hrm_exit.update_one(
        {"_id": exit_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$set": {"status": "cancelled", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Exit request not found")
