"""HRM — Leave API Routes"""
import re as _re
from typing import Optional
from datetime import date
import asyncio
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.leave import LeaveApply, LeaveApproveReject
from app.services.leave_service import LeaveService

router = APIRouter(prefix="/hrm/leaves", tags=["HRM - Leaves"])


# ── Employee ID resolution ────────────────────────────────────────────────────

async def _resolve_hrm_employee_id(cu: dict, db) -> str:
    """
    Resolve the HRM employee _id for the calling user.

    Priority:
      1. hrm_employee_id in JWT  (fast path — cached in token)
      2. hrm_employee_id in users collection  (stale JWT after linking)
      3. Email match against hrm_employees  (not-yet-linked accounts)

    On paths 2-3 the bidirectional link is backfilled so future calls
    hit path 1 without a DB round-trip.

    Raises HTTPException(422) when no employee profile can be found.
    """
    # 1. JWT fast path
    emp_id = cu.get("hrm_employee_id")
    if emp_id:
        return emp_id

    # 2. DB lookup (handles stale JWT after admin links the account)
    user_doc = await db["users"].find_one(
        {"_id": cu["id"]},
        {"hrm_employee_id": 1, "email": 1},
    )
    if user_doc:
        emp_id = user_doc.get("hrm_employee_id")
        if emp_id:
            return emp_id

        # 3. Email-based match (accounts never linked via sync panel)
        email = (user_doc.get("email") or "").strip()
        if email:
            emp_doc = await db["hrm_employees"].find_one(
                {
                    "email": _re.compile(
                        f"^{_re.escape(email)}$", _re.IGNORECASE
                    ),
                    "company_id": cu["company_id"],
                    "is_deleted": False,
                },
                {"_id": 1},
            )
            if emp_doc:
                emp_id = str(emp_doc["_id"])
                # Backfill the bidirectional link
                await db["users"].update_one(
                    {"_id": cu["id"]},
                    {"$set": {"hrm_employee_id": emp_id}},
                )
                await db["hrm_employees"].update_one(
                    {"_id": emp_id},
                    {"$set": {"crm_user_id": cu["id"]}},
                )
                return emp_id

    raise HTTPException(
        status_code=422,
        detail=(
            "Employee profile not found. "
            "Please contact HR to link your account to an employee profile."
        ),
    )


# ── Routes ────────────────────────────────────────────────────────────────────

async def _notify_leave_applied_bg(db, company_id, employee_user_id, emp_id,
                                    employee_name, leave_type_value, from_date, to_date, leave_id):
    """Fire-and-forget notification — runs after the route has already responded."""
    try:
        from app.services.notification_service import NotificationService
        await asyncio.wait_for(
            NotificationService(db).notify_leave_applied(
                company_id=company_id,
                employee_user_id=employee_user_id,
                employee_hrm_id=emp_id,
                employee_name=employee_name,
                leave_type=leave_type_value,
                from_date=from_date,
                to_date=to_date,
                leave_id=leave_id,
            ),
            timeout=10.0,
        )
    except Exception:
        pass


@router.post("", status_code=201)
async def apply_leave(
    data: LeaveApply,
    background_tasks: BackgroundTasks,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    emp_id = await _resolve_hrm_employee_id(cu, db)
    employee_name = cu.get("full_name") or cu.get("username", "")

    # Use model_dump(mode='json') so enum fields are plain strings ("casual"), not enum objects
    payload = data.model_dump(mode="json")

    try:
        result = await LeaveService(db).apply(
            payload, emp_id, employee_name, cu["company_id"]
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        import logging as _log
        _log.getLogger(__name__).error("Leave apply error: %s", e, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Leave submission failed: {str(e)}")

    # Notification runs in the background — does NOT block the response
    leave_type_value = payload.get("leave_type", "")
    background_tasks.add_task(
        _notify_leave_applied_bg,
        db, cu["company_id"], cu["id"], emp_id,
        employee_name, leave_type_value,
        str(data.from_date), str(data.to_date), result.get("id", ""),
    )

    return result


@router.get("")
async def list_leaves(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    return await LeaveService(db).list(cu["company_id"], employee_id, status, page, page_size)


# NOTE: Static-path routes (/balance/me, /me) MUST be declared before the dynamic
# wildcard routes (/balance/{employee_id}, /{leave_id}) so FastAPI matches them first.

@router.get("/balance/me")
async def get_my_balance(
    year: Optional[int] = None,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    """Return per-policy leave balance for the calling employee."""
    emp_id = await _resolve_hrm_employee_id(cu, db)
    return await LeaveService(db).get_policy_balances(
        emp_id, cu["company_id"], year or date.today().year
    )


@router.get("/balance/{employee_id}")
async def get_balance(
    employee_id: str,
    year: Optional[int] = None,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    """Return per-policy leave balance for a specific employee (HR/admin use)."""
    return await LeaveService(db).get_policy_balances(
        employee_id, cu["company_id"], year or date.today().year
    )


@router.get("/me")
async def list_my_leaves(
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    """List leave applications for the calling employee."""
    emp_id = await _resolve_hrm_employee_id(cu, db)
    return await LeaveService(db).list(cu["company_id"], emp_id, status, page, page_size)


@router.get("/{leave_id}")
async def get_leave(
    leave_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    leave = await LeaveService(db).get(leave_id, cu["company_id"])
    if not leave:
        raise HTTPException(status_code=404, detail="Leave not found")
    return leave


@router.post("/{leave_id}/action")
async def approve_reject(
    leave_id: str,
    data: LeaveApproveReject,
    background_tasks: BackgroundTasks,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:team_approve"])),
):
    try:
        result = await LeaveService(db).approve_reject(
            leave_id, data.action, cu["id"], cu.get("username", ""),
            cu["company_id"], data.rejection_reason
        )
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    if not result:
        raise HTTPException(status_code=404, detail="Leave not found")

    # Background notification — does NOT block the response
    async def _notify():
        try:
            from app.services.notification_service import NotificationService
            lt = result.get("leave_type", "")
            if hasattr(lt, "value"):
                lt = lt.value
            await asyncio.wait_for(
                NotificationService(db).notify_leave_actioned(
                    company_id=cu["company_id"],
                    employee_user_id=result.get("employee_id", ""),
                    action=data.action,
                    leave_type=str(lt),
                    from_date=str(result.get("from_date", "")),
                    to_date=str(result.get("to_date", "")),
                    leave_id=leave_id,
                ),
                timeout=10.0,
            )
        except Exception:
            pass

    background_tasks.add_task(_notify)

    return result


@router.post("/{leave_id}/cancel")
async def cancel_leave(
    leave_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:leave:apply"])),
):
    """Cancel a pending or approved leave (employee can only cancel their own)."""
    emp_id = await _resolve_hrm_employee_id(cu, db)
    try:
        result = await LeaveService(db).cancel(leave_id, emp_id, cu["company_id"])
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    if not result:
        raise HTTPException(status_code=404, detail="Leave not found")
    return result
