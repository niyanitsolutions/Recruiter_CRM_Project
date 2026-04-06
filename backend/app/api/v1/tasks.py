"""
Tasks API - Phase 6
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.core.dependencies import get_current_user, get_company_db
from app.services.task_service import TaskService
from app.models.company.task import TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("/")
async def list_tasks(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """
    List tasks involving the current user (created by or assigned to).
    No global access — always scoped to the authenticated user.
    """
    result = await TaskService.list_tasks(
        db,
        user_id=current_user["id"],
        status=status,
        priority=priority,
        page=page,
        page_size=page_size,
    )
    return {"success": True, **result}


@router.post("/")
async def create_task(
    data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """Create a new task. The authenticated user becomes the creator."""
    task = await TaskService.create_task(db, data, current_user["id"])
    return {"success": True, "data": task}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """
    Get task by ID.
    Access: task creator or assigned user only.
    """
    task = await TaskService.get_task(db, task_id, current_user["id"])
    return {"success": True, "data": task}


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """
    Update a task.
    Access: task creator or assigned user only.
    """
    task = await TaskService.update_task(db, task_id, data, current_user["id"])
    return {"success": True, "data": task}


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """
    Delete a task (soft delete).
    Access: task CREATOR only. Assigned users cannot delete.
    """
    await TaskService.delete_task(db, task_id, current_user["id"])
    return {"success": True, "message": "Task deleted"}
