"""
Clients API - Phase 3
Handles client (hiring company) management
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List

from app.models.company.client import (
    ClientCreate, ClientUpdate, ClientResponse, ClientListResponse,
    ClientStatus, ClientType
)
from app.services.client_service import ClientService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/clients", tags=["Clients"])


@router.get("/")
async def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    client_type: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """List all clients with filters and pagination"""
    result = await ClientService.list_clients(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status,
        client_type=client_type,
        city=city
    )
    
    return {"success": True, **result}


@router.get("/dropdown")
async def get_clients_dropdown(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """Get clients for dropdown"""
    clients = await ClientService.get_client_dropdown(db)
    return {"success": True, "data": clients}


@router.get("/statuses")
async def get_client_statuses(
    current_user: dict = Depends(get_current_user)
):
    """Get available client statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in ClientStatus]
    return {"success": True, "data": statuses}


@router.get("/types")
async def get_client_types(
    current_user: dict = Depends(get_current_user)
):
    """Get available client types"""
    types = [{"value": t.value, "label": t.value.replace("_", " ").title()} for t in ClientType]
    return {"success": True, "data": types}


@router.post("/")
async def create_client(
    client_data: ClientCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:create"]))
):
    """Create a new client"""
    client = await ClientService.create_client(
        db=db,
        client_data=client_data,
        created_by=current_user["id"]
    )
    
    return {"success": True, "message": "Client created successfully", "data": client}


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """Get client by ID"""
    client = await ClientService.get_client(db, client_id)
    return {"success": True, "data": client}


@router.put("/{client_id}")
async def update_client(
    client_id: str,
    update_data: ClientUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:edit"]))
):
    """Update a client"""
    client = await ClientService.update_client(
        db=db,
        client_id=client_id,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Client updated successfully", "data": client}


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:delete"]))
):
    """Soft delete a client"""
    await ClientService.delete_client(
        db=db,
        client_id=client_id,
        deleted_by=current_user["id"]
    )
    
    return {"success": True, "message": "Client deleted successfully"}