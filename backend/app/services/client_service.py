import re
"""
Client Service - Phase 3
Business logic for client (hiring company) management
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, status

from app.models.company.client import (
    ClientCreate,
    ClientUpdate,
    ClientResponse,
    ClientListResponse
)
from app.services.audit_service import AuditService


class ClientService:
    """Service for client management"""
    
    COLLECTION = "clients"
    
    @staticmethod
    async def create_client(
        db: AsyncIOMotorDatabase,
        client_data: ClientCreate,
        created_by: str
    ) -> ClientResponse:
        """Create a new client"""
        collection = db[ClientService.COLLECTION]
        
        # Check for duplicate name
        existing = await collection.find_one({
            "name": {"$regex": f"^{re.escape(client_data.name)}$", "$options": "i"},
            "is_deleted": False
        })
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client with this name already exists"
            )
        
        # Check for duplicate code if provided
        if client_data.code:
            existing_code = await collection.find_one({
                "code": client_data.code.upper(),
                "is_deleted": False
            })
            if existing_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Client with this code already exists"
                )
        
        # Prepare document
        client_dict = client_data.model_dump(exclude_unset=True)
        client_dict["_id"] = str(ObjectId())
        client_dict["created_by"] = created_by
        client_dict["created_at"] = datetime.now(timezone.utc)
        client_dict["is_deleted"] = False
        client_dict["status"] = client_dict.get("status", "active")  # always persist status
        client_dict["total_jobs"] = 0
        client_dict["active_jobs"] = 0
        client_dict["total_placements"] = 0
        
        if client_data.code:
            client_dict["code"] = client_data.code.upper()
        
        # Insert
        await collection.insert_one(client_dict)

        # Audit log — best-effort; a logging failure must never block the response
        try:
            audit = AuditService(db)
            await audit.log(
                action="create",
                entity_type="client",
                entity_id=client_dict["_id"],
                entity_name=client_data.name,
                user_id=created_by,
                user_name="",
                user_role="",
                description=f"Client created: {client_data.name}",
            )
        except Exception:
            pass

        return await ClientService.get_client(db, client_dict["_id"])
    
    @staticmethod
    async def get_client(
        db: AsyncIOMotorDatabase,
        client_id: str
    ) -> ClientResponse:
        """Get client by ID"""
        collection = db[ClientService.COLLECTION]
        
        client = await collection.find_one({
            "_id": client_id,
            "is_deleted": False
        })
        
        if not client:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found"
            )
        
        return ClientResponse(
            id=client["_id"],
            name=client["name"],
            code=client.get("code"),
            client_type=client.get("client_type", "direct"),
            industry=client.get("industry"),
            website=client.get("website"),
            city=client.get("city"),
            state=client.get("state"),
            country=client.get("country", "India"),
            email=client.get("email"),
            phone=client.get("phone"),
            contact_persons=client.get("contact_persons", []),
            commission_percentage=client.get("commission_percentage", 8.33),
            total_jobs=client.get("total_jobs", 0),
            active_jobs=client.get("active_jobs", 0),
            total_placements=client.get("total_placements", 0),
            status=client.get("status", "active"),
            created_at=client["created_at"]
        )
    
    @staticmethod
    async def list_clients(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        search: Optional[str] = None,
        status_filter: Optional[str] = None,
        client_type: Optional[str] = None,
        city: Optional[str] = None
    ) -> Dict[str, Any]:
        """List clients with filters and pagination"""
        collection = db[ClientService.COLLECTION]
        
        # Build query
        query = {"is_deleted": False}
        
        if search:
            import re as _re
            _s = _re.escape(search)
            query["$or"] = [
                {"name": {"$regex": _s, "$options": "i"}},
                {"code": {"$regex": _s, "$options": "i"}},
                {"email": {"$regex": _s, "$options": "i"}}
            ]
        
        if status_filter:
            query["status"] = status_filter
        
        if client_type:
            query["client_type"] = client_type
        
        if city:
            query["city"] = {"$regex": re.escape(city), "$options": "i"}
        
        # Count total
        total = await collection.count_documents(query)
        
        # Fetch with pagination
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        clients = await cursor.to_list(length=page_size)
        
        # Format response
        result = []
        for client in clients:
            result.append(ClientListResponse(
                id=client["_id"],
                name=client["name"],
                code=client.get("code"),
                client_type=client.get("client_type", "direct"),
                industry=client.get("industry"),
                city=client.get("city"),
                active_jobs=client.get("active_jobs", 0),
                total_placements=client.get("total_placements", 0),
                status=client.get("status", "active")
            ))
        
        return {
            "data": result,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size
            }
        }
    
    @staticmethod
    async def update_client(
        db: AsyncIOMotorDatabase,
        client_id: str,
        update_data: ClientUpdate,
        updated_by: str
    ) -> ClientResponse:
        """Update a client"""
        collection = db[ClientService.COLLECTION]
        
        # Get existing
        existing = await collection.find_one({
            "_id": client_id,
            "is_deleted": False
        })
        
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found"
            )
        
        # Prepare update
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        
        if not update_dict:
            return await ClientService.get_client(db, client_id)
        
        # Check for duplicate name
        if "name" in update_dict:
            existing_name = await collection.find_one({
                "name": {"$regex": f"^{re.escape(update_dict['name'])}$", "$options": "i"},
                "_id": {"$ne": client_id},
                "is_deleted": False
            })
            if existing_name:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Client with this name already exists"
                )
        
        # Check for duplicate code
        if "code" in update_dict and update_dict["code"]:
            update_dict["code"] = update_dict["code"].upper()
            existing_code = await collection.find_one({
                "code": update_dict["code"],
                "_id": {"$ne": client_id},
                "is_deleted": False
            })
            if existing_code:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Client with this code already exists"
                )
        
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.now(timezone.utc)
        
        # Update
        await collection.update_one(
            {"_id": client_id},
            {"$set": update_dict}
        )
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="update",
                entity_type="client",
                entity_id=client_id,
                entity_name=existing["name"],
                user_id=updated_by,
                user_name="",
                user_role="",
                description=f"Client updated: {existing['name']}",
            )
        except Exception:
            pass

        return await ClientService.get_client(db, client_id)
    
    @staticmethod
    async def delete_client(
        db: AsyncIOMotorDatabase,
        client_id: str,
        deleted_by: str
    ) -> bool:
        """Soft delete a client"""
        collection = db[ClientService.COLLECTION]
        
        # Get existing
        existing = await collection.find_one({
            "_id": client_id,
            "is_deleted": False
        })
        
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Client not found"
            )
        
        # Check for active jobs
        jobs_collection = db["jobs"]
        active_jobs = await jobs_collection.count_documents({
            "client_id": client_id,
            "status": {"$in": ["open", "on_hold"]},
            "is_deleted": False
        })
        
        if active_jobs > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete client with {active_jobs} active jobs"
            )
        
        # Soft delete
        await collection.update_one(
            {"_id": client_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": deleted_by
                }
            }
        )
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="delete",
                entity_type="client",
                entity_id=client_id,
                entity_name=existing["name"],
                user_id=deleted_by,
                user_name="",
                user_role="",
                description=f"Client deleted: {existing['name']}",
            )
        except Exception:
            pass

        return True
    
    @staticmethod
    async def update_client_stats(
        db: AsyncIOMotorDatabase,
        client_id: str
    ):
        """Update client statistics (called when jobs change)"""
        collection = db[ClientService.COLLECTION]
        jobs_collection = db["jobs"]
        applications_collection = db["applications"]
        
        # Count jobs
        total_jobs = await jobs_collection.count_documents({
            "client_id": client_id,
            "is_deleted": False
        })
        
        active_jobs = await jobs_collection.count_documents({
            "client_id": client_id,
            "status": {"$in": ["open", "on_hold"]},
            "is_deleted": False
        })
        
        # Count placements (joined)
        total_placements = await applications_collection.count_documents({
            "client_id": client_id,
            "status": "joined",
            "is_deleted": False
        })
        
        # Update
        await collection.update_one(
            {"_id": client_id},
            {
                "$set": {
                    "total_jobs": total_jobs,
                    "active_jobs": active_jobs,
                    "total_placements": total_placements
                }
            }
        )
    
    @staticmethod
    async def get_client_dropdown(
        db: AsyncIOMotorDatabase
    ) -> List[Dict[str, str]]:
        """Get clients for dropdown"""
        collection = db[ClientService.COLLECTION]
        
        # Include documents where status == "active" OR status field is absent
        # (older records created before the status field was explicitly stored).
        cursor = collection.find(
            {
                "is_deleted": False,
                "$or": [{"status": "active"}, {"status": {"$exists": False}}]
            },
            {"_id": 1, "name": 1, "code": 1}
        ).sort("name", 1)
        
        clients = await cursor.to_list(length=500)
        
        return [
            {
                "value": c["_id"],
                "label": f"{c['name']}" + (f" ({c['code']})" if c.get("code") else "")
            }
            for c in clients
        ]