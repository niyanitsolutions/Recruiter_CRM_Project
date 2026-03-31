import re
"""
Department Service - Phase 2
Handles department management within a company
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.department import (
    DepartmentCreate, DepartmentUpdate
)
from app.services.audit_service import AuditService
from app.models.company.audit_log import AuditAction, EntityType


class DepartmentService:
    """Service for department management operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.departments
        self.users_collection = db.users
        self.audit_service = AuditService(db)
    
    async def create_department(
        self,
        dept_data: DepartmentCreate,
        created_by_id: str,
        created_by_name: str,
        created_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Create a new department"""
        try:
            # Check for duplicate name or code
            existing = await self.collection.find_one({
                "$or": [
                    {"name": {"$regex": f"^{re.escape(dept_data.name)}$", "$options": "i"}},
                    {"code": dept_data.code.upper()}
                ],
                "is_deleted": False
            })
            
            if existing:
                if existing.get("name", "").lower() == dept_data.name.lower():
                    return False, "Department with this name already exists", None
                return False, "Department with this code already exists", None
            
            # Validate parent department if provided
            if dept_data.parent_department_id:
                parent = await self.collection.find_one({
                    "_id": dept_data.parent_department_id,
                    "is_deleted": False
                })
                if not parent:
                    return False, "Parent department not found", None
            
            # Validate head user if provided
            if dept_data.head_user_id:
                head = await self.users_collection.find_one({
                    "_id": dept_data.head_user_id,
                    "is_deleted": False
                })
                if not head:
                    return False, "Department head user not found", None
            
            dept_id = str(ObjectId())
            now = datetime.now(timezone.utc)
            
            dept_doc = {
                "_id": dept_id,
                "name": dept_data.name,
                "code": dept_data.code.upper(),
                "description": dept_data.description,
                "head_user_id": dept_data.head_user_id,
                "parent_department_id": dept_data.parent_department_id,
                "is_active": True,
                "sort_order": dept_data.sort_order or 0,
                "created_by": created_by_id,
                "created_at": now,
                "is_deleted": False
            }
            
            await self.collection.insert_one(dept_doc)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.CREATE.value,
                entity_type=EntityType.DEPARTMENT.value,
                entity_id=dept_id,
                entity_name=dept_data.name,
                user_id=created_by_id,
                user_name=created_by_name,
                user_role=created_by_role,
                new_value=dept_doc,
                description=f"Created new department: {dept_data.name}",
                ip_address=ip_address
            )
            
            dept_doc["id"] = dept_doc.pop("_id")
            return True, "Department created successfully", dept_doc
            
        except Exception as e:
            return False, f"Error creating department: {str(e)}", None
    
    async def get_department(self, dept_id: str) -> Optional[Dict]:
        """Get department by ID"""
        dept = await self.collection.find_one({
            "_id": dept_id,
            "is_deleted": False
        })
        
        if dept:
            dept["id"] = dept.pop("_id")
            
            # Get head user name
            if dept.get("head_user_id"):
                head = await self.users_collection.find_one(
                    {"_id": dept["head_user_id"]},
                    {"full_name": 1}
                )
                dept["head_user_name"] = head.get("full_name") if head else None
            
            # Get parent department name
            if dept.get("parent_department_id"):
                parent = await self.collection.find_one(
                    {"_id": dept["parent_department_id"]},
                    {"name": 1}
                )
                dept["parent_department_name"] = parent.get("name") if parent else None
            
            # Get user count
            user_count = await self.users_collection.count_documents({
                "department_id": dept["id"],
                "is_deleted": False
            })
            dept["user_count"] = user_count
        
        return dept
    
    async def list_departments(
        self,
        include_inactive: bool = False,
        parent_id: Optional[str] = None
    ) -> List[Dict]:
        """List all departments"""
        query = {"is_deleted": False}
        
        if not include_inactive:
            query["is_active"] = True
        
        if parent_id:
            query["parent_department_id"] = parent_id
        
        cursor = self.collection.find(query).sort("sort_order", 1).sort("name", 1)
        
        departments = []
        async for dept in cursor:
            dept["id"] = dept.pop("_id")
            
            # Get head user name
            if dept.get("head_user_id"):
                head = await self.users_collection.find_one(
                    {"_id": dept["head_user_id"]},
                    {"full_name": 1}
                )
                dept["head_user_name"] = head.get("full_name") if head else None
            
            # Get parent department name
            if dept.get("parent_department_id"):
                parent = await self.collection.find_one(
                    {"_id": dept["parent_department_id"]},
                    {"name": 1}
                )
                dept["parent_department_name"] = parent.get("name") if parent else None
            
            # Get user count
            user_count = await self.users_collection.count_documents({
                "department_id": dept["id"],
                "is_deleted": False
            })
            dept["user_count"] = user_count
            
            departments.append(dept)
        
        return departments
    
    async def get_department_tree(self) -> List[Dict]:
        """Get departments as a hierarchical tree"""
        departments = await self.list_departments()
        
        # Build tree structure
        dept_map = {d["id"]: d for d in departments}
        root_depts = []
        
        for dept in departments:
            dept["children"] = []
            parent_id = dept.get("parent_department_id")
            
            if parent_id and parent_id in dept_map:
                dept_map[parent_id]["children"].append(dept)
            else:
                root_depts.append(dept)
        
        return root_depts
    
    async def update_department(
        self,
        dept_id: str,
        update_data: DepartmentUpdate,
        updated_by_id: str,
        updated_by_name: str,
        updated_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Update a department"""
        try:
            existing = await self.collection.find_one({
                "_id": dept_id,
                "is_deleted": False
            })
            
            if not existing:
                return False, "Department not found", None
            
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
                    "_id": {"$ne": dept_id},
                    "name": {"$regex": f"^{re.escape(update_dict['name'])}$", "$options": "i"},
                    "is_deleted": False
                })
                if dup:
                    return False, "Department with this name already exists", None
            
            # Check for duplicate code if updating code
            if "code" in update_dict:
                update_dict["code"] = update_dict["code"].upper()
                dup = await self.collection.find_one({
                    "_id": {"$ne": dept_id},
                    "code": update_dict["code"],
                    "is_deleted": False
                })
                if dup:
                    return False, "Department with this code already exists", None
            
            # Validate parent department
            if "parent_department_id" in update_dict:
                if update_dict["parent_department_id"]:
                    # Cannot set self as parent
                    if update_dict["parent_department_id"] == dept_id:
                        return False, "Cannot set department as its own parent", None
                    
                    parent = await self.collection.find_one({
                        "_id": update_dict["parent_department_id"],
                        "is_deleted": False
                    })
                    if not parent:
                        return False, "Parent department not found", None
            
            # Validate head user
            if "head_user_id" in update_dict and update_dict["head_user_id"]:
                head = await self.users_collection.find_one({
                    "_id": update_dict["head_user_id"],
                    "is_deleted": False
                })
                if not head:
                    return False, "Department head user not found", None
            
            update_dict["updated_by"] = updated_by_id
            update_dict["updated_at"] = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": dept_id},
                {"$set": update_dict}
            )
            
            updated_dept = await self.get_department(dept_id)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.UPDATE.value,
                entity_type=EntityType.DEPARTMENT.value,
                entity_id=dept_id,
                entity_name=existing.get("name"),
                user_id=updated_by_id,
                user_name=updated_by_name,
                user_role=updated_by_role,
                old_value=existing,
                new_value=update_dict,
                changed_fields=list(update_dict.keys()),
                description=f"Updated department: {existing.get('name')}",
                ip_address=ip_address
            )
            
            return True, "Department updated successfully", updated_dept
            
        except Exception as e:
            return False, f"Error updating department: {str(e)}", None
    
    async def delete_department(
        self,
        dept_id: str,
        deleted_by_id: str,
        deleted_by_name: str,
        deleted_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Soft delete a department"""
        try:
            dept = await self.collection.find_one({
                "_id": dept_id,
                "is_deleted": False
            })
            
            if not dept:
                return False, "Department not found"
            
            # Check if department has users
            user_count = await self.users_collection.count_documents({
                "department_id": dept_id,
                "is_deleted": False
            })
            
            if user_count > 0:
                return False, f"Cannot delete department: {user_count} users are assigned to this department"
            
            # Check if department has child departments
            child_count = await self.collection.count_documents({
                "parent_department_id": dept_id,
                "is_deleted": False
            })
            
            if child_count > 0:
                return False, f"Cannot delete department: {child_count} sub-departments exist"
            
            now = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": dept_id},
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
                entity_type=EntityType.DEPARTMENT.value,
                entity_id=dept_id,
                entity_name=dept.get("name"),
                user_id=deleted_by_id,
                user_name=deleted_by_name,
                user_role=deleted_by_role,
                old_value=dept,
                description=f"Deleted department: {dept.get('name')}",
                ip_address=ip_address
            )
            
            return True, "Department deleted successfully"
            
        except Exception as e:
            return False, f"Error deleting department: {str(e)}"
    
    async def get_department_users(
        self,
        dept_id: str,
        page: int = 1,
        page_size: int = 20
    ) -> Tuple[List[Dict], int]:
        """Get all users in a department"""
        query = {
            "department_id": dept_id,
            "is_deleted": False
        }
        
        total = await self.users_collection.count_documents(query)
        
        skip = (page - 1) * page_size
        cursor = self.users_collection.find(query).sort("full_name", 1).skip(skip).limit(page_size)
        
        users = []
        async for user in cursor:
            user["id"] = user.pop("_id")
            user.pop("password_hash", None)
            users.append(user)
        
        return users, total