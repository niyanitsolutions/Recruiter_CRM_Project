import re
"""
Designation Service - Phase 2
Handles designation/job title management within a company
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.designation import (
    DesignationCreate, DesignationUpdate,
    get_level_name
)
from app.services.audit_service import AuditService
from app.models.company.audit_log import AuditAction, EntityType


def _generate_desig_code(name: str) -> str:
    """
    Auto-generate a short designation code from the name.
    Example: "HR Manager" → "HRM" prefix → "HRM101" (or next available)
    Takes the first letter of each word, uppercased, capped at 3 chars.
    The numeric suffix is resolved per-call to guarantee uniqueness in the service.
    """
    words = re.split(r'[\s_\-]+', name.strip())
    initials = "".join(w[0].upper() for w in words if w)[:3]
    return initials or "DSG"  # fallback prefix if name has no letters


class DesignationService:
    """Service for designation management operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.designations
        self.users_collection = db.users
        self.departments_collection = db.departments
        self.audit_service = AuditService(db)

    async def _resolve_unique_code(self, prefix: str, exclude_id: Optional[str] = None) -> str:
        """
        Given a prefix (e.g. "HRM"), find the next available numeric suffix
        starting at 101 so the final code is e.g. "HRM101", "HRM102", …
        """
        query = {"code": {"$regex": f"^{re.escape(prefix)}\\d+$"}, "is_deleted": False}
        if exclude_id:
            query["_id"] = {"$ne": exclude_id}
        existing_cursor = self.collection.find(query, {"code": 1})
        existing_codes = [d["code"] async for d in existing_cursor]
        used_numbers = set()
        for code in existing_codes:
            suffix = code[len(prefix):]
            if suffix.isdigit():
                used_numbers.add(int(suffix))
        n = 101
        while n in used_numbers:
            n += 1
        return f"{prefix}{n}"
    
    async def create_designation(
        self,
        desig_data: DesignationCreate,
        created_by_id: str,
        created_by_name: str,
        created_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Create a new designation"""
        try:
            # Check for duplicate name
            existing = await self.collection.find_one({
                "name": {"$regex": f"^{re.escape(desig_data.name)}$", "$options": "i"},
                "is_deleted": False
            })
            
            if existing:
                return False, "Designation with this name already exists", None
            
            # Resolve code — use provided value or auto-generate from name
            if desig_data.code:
                resolved_code = desig_data.code.upper()
                code_exists = await self.collection.find_one({
                    "code": resolved_code,
                    "is_deleted": False
                })
                if code_exists:
                    return False, "Designation with this code already exists", None
            else:
                prefix = _generate_desig_code(desig_data.name)
                resolved_code = await self._resolve_unique_code(prefix)

            # Validate department if provided
            if desig_data.department_id:
                dept = await self.departments_collection.find_one({
                    "_id": desig_data.department_id,
                    "is_deleted": False
                })
                if not dept:
                    return False, "Department not found", None

            desig_id = str(ObjectId())
            now = datetime.now(timezone.utc)

            desig_doc = {
                "_id": desig_id,
                "name": desig_data.name,
                "code": resolved_code,
                "description": desig_data.description,
                "department_id": desig_data.department_id,
                "level": desig_data.level or 1,
                "is_active": True,
                "sort_order": desig_data.sort_order or 0,
                "created_by": created_by_id,
                "created_at": now,
                "is_deleted": False
            }
            
            await self.collection.insert_one(desig_doc)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.CREATE.value,
                entity_type=EntityType.DESIGNATION.value,
                entity_id=desig_id,
                entity_name=desig_data.name,
                user_id=created_by_id,
                user_name=created_by_name,
                user_role=created_by_role,
                new_value=desig_doc,
                description=f"Created new designation: {desig_data.name}",
                ip_address=ip_address
            )
            
            desig_doc["id"] = desig_doc.pop("_id")
            desig_doc["level_name"] = get_level_name(desig_doc["level"])
            return True, "Designation created successfully", desig_doc
            
        except Exception as e:
            return False, f"Error creating designation: {str(e)}", None
    
    async def get_designation(self, desig_id: str) -> Optional[Dict]:
        """Get designation by ID"""
        desig = await self.collection.find_one({
            "_id": desig_id,
            "is_deleted": False
        })
        
        if desig:
            desig["id"] = desig.pop("_id")
            desig["level_name"] = get_level_name(desig.get("level", 1))
            
            # Get department name
            if desig.get("department_id"):
                dept = await self.departments_collection.find_one(
                    {"_id": desig["department_id"]},
                    {"name": 1}
                )
                desig["department_name"] = dept.get("name") if dept else None
            
            # Get user count
            user_count = await self.users_collection.count_documents({
                "designation_id": desig["id"],
                "is_deleted": False
            })
            desig["user_count"] = user_count
        
        return desig
    
    async def list_designations(
        self,
        include_inactive: bool = False,
        department_id: Optional[str] = None,
        level: Optional[int] = None
    ) -> List[Dict]:
        """List all designations"""
        query = {"is_deleted": False}
        
        if not include_inactive:
            query["is_active"] = True
        
        if department_id:
            query["department_id"] = department_id
        
        if level:
            query["level"] = level
        
        cursor = self.collection.find(query).sort("level", -1).sort("sort_order", 1).sort("name", 1)
        
        designations = []
        async for desig in cursor:
            desig["id"] = desig.pop("_id")
            desig["level_name"] = get_level_name(desig.get("level", 1))
            
            # Get department name
            if desig.get("department_id"):
                dept = await self.departments_collection.find_one(
                    {"_id": desig["department_id"]},
                    {"name": 1}
                )
                desig["department_name"] = dept.get("name") if dept else None
            
            # Get user count
            user_count = await self.users_collection.count_documents({
                "designation_id": desig["id"],
                "is_deleted": False
            })
            desig["user_count"] = user_count
            
            designations.append(desig)
        
        return designations
    
    async def get_designations_by_level(self) -> Dict[int, List[Dict]]:
        """Get designations grouped by level"""
        designations = await self.list_designations()
        
        by_level = {}
        for desig in designations:
            level = desig.get("level", 1)
            if level not in by_level:
                by_level[level] = {
                    "level": level,
                    "level_name": get_level_name(level),
                    "designations": []
                }
            by_level[level]["designations"].append(desig)
        
        return list(by_level.values())
    
    async def update_designation(
        self,
        desig_id: str,
        update_data: DesignationUpdate,
        updated_by_id: str,
        updated_by_name: str,
        updated_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Update a designation"""
        try:
            existing = await self.collection.find_one({
                "_id": desig_id,
                "is_deleted": False
            })
            
            if not existing:
                return False, "Designation not found", None
            
            # Build update document
            update_dict = {}
            for field, value in update_data.model_dump(exclude_unset=True).items():
                if value is not None:
                    update_dict[field] = value
            
            if not update_dict:
                return False, "No fields to update", None
            
            # Check for duplicate name if updating name
            if "name" in update_dict:
                dup = await self.collection.find_one({
                    "_id": {"$ne": desig_id},
                    "name": {"$regex": f"^{re.escape(update_dict['name'])}$", "$options": "i"},
                    "is_deleted": False
                })
                if dup:
                    return False, "Designation with this name already exists", None
            
            # Check for duplicate code if updating code
            if "code" in update_dict and update_dict["code"]:
                update_dict["code"] = update_dict["code"].upper()
                dup = await self.collection.find_one({
                    "_id": {"$ne": desig_id},
                    "code": update_dict["code"],
                    "is_deleted": False
                })
                if dup:
                    return False, "Designation with this code already exists", None
            
            # Validate department if updating
            if "department_id" in update_dict and update_dict["department_id"]:
                dept = await self.departments_collection.find_one({
                    "_id": update_dict["department_id"],
                    "is_deleted": False
                })
                if not dept:
                    return False, "Department not found", None
            
            update_dict["updated_by"] = updated_by_id
            update_dict["updated_at"] = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": desig_id},
                {"$set": update_dict}
            )
            
            updated_desig = await self.get_designation(desig_id)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.UPDATE.value,
                entity_type=EntityType.DESIGNATION.value,
                entity_id=desig_id,
                entity_name=existing.get("name"),
                user_id=updated_by_id,
                user_name=updated_by_name,
                user_role=updated_by_role,
                old_value=existing,
                new_value=update_dict,
                changed_fields=list(update_dict.keys()),
                description=f"Updated designation: {existing.get('name')}",
                ip_address=ip_address
            )
            
            return True, "Designation updated successfully", updated_desig
            
        except Exception as e:
            return False, f"Error updating designation: {str(e)}", None
    
    async def delete_designation(
        self,
        desig_id: str,
        deleted_by_id: str,
        deleted_by_name: str,
        deleted_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Soft delete a designation"""
        try:
            desig = await self.collection.find_one({
                "_id": desig_id,
                "is_deleted": False
            })
            
            if not desig:
                return False, "Designation not found"
            
            # Check if designation has users
            user_count = await self.users_collection.count_documents({
                "designation_id": desig_id,
                "is_deleted": False
            })
            
            if user_count > 0:
                return False, f"Cannot delete designation: {user_count} users have this designation"
            
            now = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": desig_id},
                {
                    "$set": {
                        "is_deleted": True,
                        "deleted_at": now,
                        "deleted_by": deleted_by_id,
                        "is_active": False
                    }
                }
            )
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.DELETE.value,
                entity_type=EntityType.DESIGNATION.value,
                entity_id=desig_id,
                entity_name=desig.get("name"),
                user_id=deleted_by_id,
                user_name=deleted_by_name,
                user_role=deleted_by_role,
                old_value=desig,
                description=f"Deleted designation: {desig.get('name')}",
                ip_address=ip_address
            )
            
            return True, "Designation deleted successfully"
            
        except Exception as e:
            return False, f"Error deleting designation: {str(e)}"