"""
Tasks API - Phase 6
"""
from typing import Optional
from fastapi import APIRouter, Depends, Query
from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.services.task_service import TaskService
from app.models.company.task import TaskCreate, TaskUpdate

router = APIRouter(prefix="/tasks", tags=["Tasks"])


@router.get("/")
async def list_tasks(
    status: Optional[str] = Query(None),
    priority: Optional[str] = Query(None),
    my_tasks: bool = Query(False),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    user_id = current_user["id"] if my_tasks else None
    result = await TaskService.list_tasks(db, user_id=user_id, status=status, priority=priority, page=page, page_size=page_size)
    return {"success": True, **result}


@router.post("/")
async def create_task(
    data: TaskCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    task = await TaskService.create_task(db, data, current_user["id"])
    return {"success": True, "data": task}


@router.get("/{task_id}")
async def get_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    task = await TaskService.get_task(db, task_id)
    return {"success": True, "data": task}


@router.put("/{task_id}")
async def update_task(
    task_id: str,
    data: TaskUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    task = await TaskService.update_task(db, task_id, data, current_user["id"])
    return {"success": True, "data": task}


@router.delete("/{task_id}")
async def delete_task(
    task_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    await TaskService.delete_task(db, task_id)
    return {"success": True, "message": "Task deleted"}
