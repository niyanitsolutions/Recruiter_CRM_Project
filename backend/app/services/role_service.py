"""
Role Service - Phase 2
Handles role and permission management within a company
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase

from app.models.company.role import (
    RoleCreate, RoleUpdate,
    SystemRole, Permission, ROLE_DEFAULT_PERMISSIONS
)
from app.services.audit_service import AuditService
from app.models.company.audit_log import AuditAction, EntityType


class RoleService:
    """Service for role management operations"""
    
    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.roles
        self.users_collection = db.users
        self.audit_service = AuditService(db)
    
    async def initialize_system_roles(self) -> None:
        """Initialize system roles and sync their permissions to current code-defined defaults.

        Safe to call multiple times. For existing roles the permissions are always
        overwritten with the latest ROLE_DEFAULT_PERMISSIONS so that code changes
        propagate to the DB without manual edits.
        """
        for role in SystemRole:
            permissions = [p.value for p in ROLE_DEFAULT_PERMISSIONS.get(role, [])]
            existing = await self.collection.find_one({
                "name": role.value,
                "is_system_role": True
            })

            if not existing:
                role_doc = {
                    "_id": str(ObjectId()),
                    "name": role.value,
                    "display_name": role.value.replace("_", " ").title(),
                    "description": f"System role: {role.value}",
                    "permissions": permissions,
                    "is_system_role": True,
                    "is_active": True,
                    "created_by": "system",
                    "created_at": datetime.now(timezone.utc),
                    "is_deleted": False
                }
                await self.collection.insert_one(role_doc)
            else:
                # Sync existing role to current defaults
                await self.collection.update_one(
                    {"_id": existing["_id"]},
                    {"$set": {
                        "permissions": permissions,
                        "updated_at": datetime.now(timezone.utc),
                    }}
                )
    
    async def create_role(
        self,
        role_data: RoleCreate,
        created_by_id: str,
        created_by_name: str,
        created_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Create a new custom role"""
        try:
            # Check for duplicate name
            existing = await self.collection.find_one({
                "name": role_data.name.lower().replace(" ", "_"),
                "is_deleted": False
            })
            
            if existing:
                return False, "Role with this name already exists", None
            
            # Validate permissions
            valid_permissions = [p.value for p in Permission]
            invalid_perms = [p for p in role_data.permissions if p not in valid_permissions]
            if invalid_perms:
                return False, f"Invalid permissions: {', '.join(invalid_perms)}", None
            
            role_id = str(ObjectId())
            now = datetime.now(timezone.utc)
            
            role_doc = {
                "_id": role_id,
                "name": role_data.name.lower().replace(" ", "_"),
                "display_name": role_data.display_name,
                "description": role_data.description,
                "permissions": role_data.permissions,
                "is_system_role": False,
                "is_active": True,
                "created_by": created_by_id,
                "created_at": now,
                "is_deleted": False
            }
            
            await self.collection.insert_one(role_doc)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.CREATE.value,
                entity_type=EntityType.ROLE.value,
                entity_id=role_id,
                entity_name=role_data.display_name,
                user_id=created_by_id,
                user_name=created_by_name,
                user_role=created_by_role,
                new_value=role_doc,
                description=f"Created new role: {role_data.display_name}",
                ip_address=ip_address
            )
            
            role_doc["id"] = role_doc.pop("_id")
            return True, "Role created successfully", role_doc
            
        except Exception as e:
            return False, f"Error creating role: {str(e)}", None
    
    async def get_role(self, role_id: str) -> Optional[Dict]:
        """Get role by ID"""
        role = await self.collection.find_one({
            "_id": role_id,
            "is_deleted": False
        })
        
        if role:
            role["id"] = role.pop("_id")
            
            # Sanitize permissions: remove any values that are no longer valid
            valid_permissions = {p.value for p in Permission}
            existing_perms = role.get("permissions", [])
            role["permissions"] = [p for p in existing_perms if p in valid_permissions]
            
            # Get user count with this role
            user_count = await self.users_collection.count_documents({
                "$or": [
                    {"role": role["name"]},
                    {"role_id": role["id"]}
                ],
                "is_deleted": False
            })
            role["user_count"] = user_count
        
        return role
    
    async def get_role_by_name(self, name: str) -> Optional[Dict]:
        """Get role by name"""
        role = await self.collection.find_one({
            "name": name,
            "is_deleted": False
        })
        
        if role:
            role["id"] = role.pop("_id")
        
        return role
    
    async def list_roles(
        self,
        include_system: bool = True,
        include_inactive: bool = False
    ) -> List[Dict]:
        """List all roles"""
        query = {"is_deleted": False}
        
        if not include_system:
            query["is_system_role"] = False
        
        if not include_inactive:
            query["is_active"] = True
        
        cursor = self.collection.find(query).sort("is_system_role", -1).sort("display_name", 1)
        
        roles = []
        async for role in cursor:
            role["id"] = role.pop("_id")
            
            # Sanitize permissions for each role before returning
            valid_permissions = {p.value for p in Permission}
            existing_perms = role.get("permissions", [])
            role["permissions"] = [p for p in existing_perms if p in valid_permissions]
            
            # Get user count
            user_count = await self.users_collection.count_documents({
                "$or": [
                    {"role": role["name"]},
                    {"role_id": role["id"]}
                ],
                "is_deleted": False
            })
            role["user_count"] = user_count
            
            roles.append(role)
        
        return roles
    
    async def update_role(
        self,
        role_id: str,
        update_data: RoleUpdate,
        updated_by_id: str,
        updated_by_name: str,
        updated_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Update a role"""
        try:
            existing = await self.collection.find_one({
                "_id": role_id,
                "is_deleted": False
            })
            
            if not existing:
                return False, "Role not found", None
            
            # System roles can only have permissions updated
            if existing.get("is_system_role"):
                if update_data.display_name or update_data.description:
                    return False, "Cannot modify system role name or description", None
            
            # Build update document
            update_dict = {}
            for field, value in update_data.model_dump(exclude_unset=True).items():
                if value is not None:
                    update_dict[field] = value
            
            if not update_dict:
                return False, "No fields to update", None
            
            # Sanitize permissions if updating: keep only valid values
            if "permissions" in update_dict:
                valid_permissions = {p.value for p in Permission}
                cleaned = [p for p in update_dict["permissions"] if p in valid_permissions]
                update_dict["permissions"] = cleaned
            
            update_dict["updated_by"] = updated_by_id
            update_dict["updated_at"] = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": role_id},
                {"$set": update_dict}
            )

            updated_role = await self.get_role(role_id)

            # Cascade permission changes to all users with this role
            if "permissions" in update_dict:
                role_name = existing.get("name", "")
                await self.users_collection.update_many(
                    {"role": role_name, "is_deleted": False},
                    {"$set": {"permissions": update_dict["permissions"]}}
                )

            # Audit log
            await self.audit_service.log(
                action=AuditAction.UPDATE.value,
                entity_type=EntityType.ROLE.value,
                entity_id=role_id,
                entity_name=existing.get("display_name"),
                user_id=updated_by_id,
                user_name=updated_by_name,
                user_role=updated_by_role,
                old_value=existing,
                new_value=update_dict,
                changed_fields=list(update_dict.keys()),
                description=f"Updated role: {existing.get('display_name')}",
                ip_address=ip_address
            )

            return True, "Role updated successfully", updated_role
            
        except Exception as e:
            return False, f"Error updating role: {str(e)}", None
    
    async def delete_role(
        self,
        role_id: str,
        deleted_by_id: str,
        deleted_by_name: str,
        deleted_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Soft delete a role"""
        try:
            role = await self.collection.find_one({
                "_id": role_id,
                "is_deleted": False
            })
            
            if not role:
                return False, "Role not found"
            
            # Cannot delete system roles
            if role.get("is_system_role"):
                return False, "Cannot delete system roles"
            
            # Check if role is in use
            user_count = await self.users_collection.count_documents({
                "$or": [
                    {"role": role["name"]},
                    {"role_id": role_id}
                ],
                "is_deleted": False
            })
            
            if user_count > 0:
                return False, f"Cannot delete role: {user_count} users are assigned to this role"
            
            now = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": role_id},
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
                entity_type=EntityType.ROLE.value,
                entity_id=role_id,
                entity_name=role.get("display_name"),
                user_id=deleted_by_id,
                user_name=deleted_by_name,
                user_role=deleted_by_role,
                old_value=role,
                description=f"Deleted role: {role.get('display_name')}",
                ip_address=ip_address
            )
            
            return True, "Role deleted successfully"
            
        except Exception as e:
            return False, f"Error deleting role: {str(e)}"
    
    async def get_all_permissions(self) -> List[Dict]:
        """Get all available permissions grouped by category"""
        permissions = []
        
        # Group permissions by prefix
        categories = {}
        for perm in Permission:
            category = perm.value.split(":")[0]
            if category not in categories:
                categories[category] = []
            categories[category].append({
                "value": perm.value,
                "name": perm.name,
                "display": perm.value.replace(":", " - ").replace("_", " ").title()
            })
        
        for category, perms in categories.items():
            permissions.append({
                "category": category.title(),
                "permissions": perms
            })
        
        return permissions
    
    async def assign_role_to_user(
        self,
        user_id: str,
        role_name: str,
        assigned_by_id: str,
        assigned_by_name: str,
        assigned_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Assign a role to a user"""
        try:
            # Get role
            role = await self.get_role_by_name(role_name)
            if not role:
                return False, "Role not found"
            
            # Get user
            user = await self.users_collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not user:
                return False, "User not found"
            
            old_role = user.get("role")
            
            # Get permissions for new role: prefer DB role document; fall back
            # to hardcoded defaults only if the role document has no permissions.
            permissions = role.get("permissions", []) or []
            if not permissions and role_name in [r.value for r in SystemRole]:
                role_enum = SystemRole(role_name)
                permissions = [p.value for p in ROLE_DEFAULT_PERMISSIONS.get(role_enum, [])]
            
            await self.users_collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "role": role_name,
                        "role_id": role.get("id"),
                        "permissions": permissions,
                        "updated_by": assigned_by_id,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.ROLE_ASSIGN.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user.get("full_name"),
                user_id=assigned_by_id,
                user_name=assigned_by_name,
                user_role=assigned_by_role,
                old_value={"role": old_role},
                new_value={"role": role_name},
                changed_fields=["role", "permissions"],
                description=f"Assigned role '{role_name}' to user: {user.get('full_name')}",
                ip_address=ip_address
            )
            
            return True, f"Role '{role_name}' assigned successfully"
            
        except Exception as e:
            return False, f"Error assigning role: {str(e)}"