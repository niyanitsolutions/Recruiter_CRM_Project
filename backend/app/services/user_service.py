import re
"""
User Service - Phase 2
Complete user management within a company
"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Tuple
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
import bcrypt
import logging

logger = logging.getLogger(__name__)

from app.models.company.user import (
    UserCreate, UserUpdate, UserProfileUpdate,
    UserStatus,
    get_role_display_name, ChangePasswordRequest, ResetPasswordByAdmin
)
from app.models.company.role import ROLE_DEFAULT_PERMISSIONS, SystemRole, Permission
from app.services.audit_service import AuditService
from app.models.company.audit_log import AuditAction, EntityType
from app.models.master.global_user import upsert_global_user, ensure_user_company_map, sync_global_password
from app.core.database import get_master_db


def _compute_role_type(user: dict) -> str:
    """
    Derive explicit role_type from stored user fields.
    Priority: is_owner flag → 'owner' | role == 'admin' → 'admin' | else → 'user'
    This is computed at read-time so no DB migration is needed.
    """
    if user.get("is_owner"):
        return "owner"
    if user.get("role") == "admin":
        return "admin"
    return "user"


class UserService:
    """Service for user management operations"""

    def __init__(self, db: AsyncIOMotorDatabase):
        self.db = db
        self.collection = db.users
        self.audit_service = AuditService(db)
    
    async def create_user(
        self,
        user_data: UserCreate,
        created_by_id: str,
        created_by_name: str,
        created_by_role: str,
        ip_address: Optional[str] = None,
        company_id: Optional[str] = None,
        company_name: str = "",
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Create a new user in the company"""
        try:
            # ── User seat limit check ─────────────────────────────────────────
            # Only check for internal users (not partners — partners have their own limit)
            if user_data.user_type != "partner" and user_data.role != "partner" and company_id:
                from app.core.database import get_master_db
                master_db = get_master_db()
                tenant = await master_db.tenants.find_one({"company_id": company_id})
                if tenant:
                    total_seats = int(tenant.get("max_users", 0))
                    if total_seats > 0:
                        # Count all non-deleted internal users (including the owner)
                        current_count = await self.collection.count_documents({
                            "is_deleted": False,
                            "user_type": {"$ne": "partner"},
                        })
                        if current_count >= total_seats:
                            remaining = max(0, total_seats - current_count)
                            return False, (
                                f"SEAT_LIMIT_REACHED|{total_seats}|{current_count}|{remaining}"
                            ), None

            # Check for duplicates (skipped when admin explicitly overrides)
            if not getattr(user_data, "override_duplicate", False):
                existing = await self.collection.find_one({
                    "$or": [
                        {"username": user_data.username.lower()},
                        {"email": user_data.email.lower()},
                        {"mobile": user_data.mobile}
                    ],
                    "is_deleted": False
                })

                if existing:
                    # Collect ALL duplicate fields so frontend can show them all at once
                    dupes = []
                    if existing.get("username") == user_data.username.lower():
                        dupes.append(f"username:{user_data.username}")
                    if existing.get("email") == user_data.email.lower():
                        dupes.append(f"email:{user_data.email}")
                    if existing.get("mobile") == user_data.mobile:
                        dupes.append(f"mobile:{user_data.mobile}")
                    return False, "DUPLICATE|" + "|".join(dupes), None
            
            # Hash password
            password_hash = bcrypt.hashpw(
                user_data.password.encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')
            
            # Determine permissions:
            # 1. If permissions list provided by caller → use it directly (pre-computed by frontend)
            # 2. Else fetch the role's current permissions from the roles collection
            # 3. Fall back to hardcoded defaults only if the role isn't in the DB yet
            if user_data.permissions is not None:
                role_permissions = list(user_data.permissions)
            else:
                role_doc = await self.db.roles.find_one(
                    {"name": user_data.role, "is_deleted": False}
                )
                if role_doc:
                    role_permissions = role_doc.get("permissions", [])
                else:
                    role_enum = SystemRole(user_data.role) if user_data.role in [r.value for r in SystemRole] else None
                    role_permissions = [p.value for p in ROLE_DEFAULT_PERMISSIONS.get(role_enum, [])] if role_enum else []

            # SAFEGUARD: when override will be active and the resolved list is empty,
            # guarantee at minimum dashboard:view so the sidebar is never completely blank.
            if user_data.permissions is not None and not role_permissions:
                role_permissions = ["dashboard:view"]

            # Create user document
            user_id = str(ObjectId())
            now = datetime.now(timezone.utc)
            
            user_doc = {
                "_id": user_id,
                "username": user_data.username.lower(),
                "email": user_data.email.lower(),
                "full_name": user_data.full_name,
                "mobile": user_data.mobile,
                "password_hash": password_hash,
                "avatar_url": None,
                "date_of_birth": user_data.date_of_birth,
                "gender": user_data.gender,
                "address": user_data.address,
                "city": user_data.city,
                "state": user_data.state,
                "zip_code": user_data.zip_code,
                "country": "India",
                "employee_id": user_data.employee_id,
                "role": user_data.role,
                "role_id": user_data.role_id,
                "permissions": role_permissions,
                # Mark override so _resolve_effective_permissions uses this exact list at login.
                # Without this, login falls back to ROLE_PERMISSIONS["admin"] which has ALL perms.
                "override_permissions": user_data.permissions is not None,
                "user_type": "partner" if user_data.role == "partner" else (user_data.user_type or "internal"),
                "designation": user_data.designation,
                "designation_id": user_data.designation_id,
                "department": user_data.department,
                "department_id": user_data.department_id,
                # Owners always report to themselves; other users use payload value
                "reporting_to": user_id if getattr(user_data, "is_owner", False) else user_data.reporting_to,
                "joining_date": user_data.joining_date,
                # Permission configuration — stored so the edit form can reconstruct
                # the exact UI state without reverse-engineering from permissions[].
                "primary_department": user_data.primary_department,
                "level": user_data.level,
                "assigned_departments": user_data.assigned_departments or [],
                "restricted_modules": user_data.restricted_modules or [],
                "status": user_data.status or UserStatus.ACTIVE.value,
                "is_owner": False,
                "last_login": None,
                "last_login_ip": None,
                "login_count": 0,
                "failed_login_attempts": 0,
                "locked_until": None,
                "password_changed_at": now,
                # Admin-created users must change the admin-assigned password on first login
                "must_change_password": True,
                # New users haven't completed their profile yet (shown as a one-time popup)
                "profile_completed": False,
                "created_by": created_by_id,
                "created_at": now,
                "updated_by": None,
                "updated_at": None,
                "is_deleted": False,
                "deleted_at": None,
                "deleted_by": None
            }
            
            await self.collection.insert_one(user_doc)

            # Register in global identity layer (best-effort — never block user creation)
            if company_id:
                try:
                    master_db = get_master_db()
                    gu_id = await upsert_global_user(
                        master_db,
                        email=user_data.email,
                        mobile=user_data.mobile,
                        password_hash=password_hash,
                    )
                    await ensure_user_company_map(
                        master_db,
                        global_user_id=gu_id,
                        company_id=company_id,
                        local_user_id=user_id,
                        role=user_data.role,
                        is_owner=False,
                    )
                except Exception as _ge:
                    logger.warning("Global user sync failed for %s: %s", user_data.email, _ge)

            # Audit log
            await self.audit_service.log(
                action=AuditAction.CREATE.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user_data.full_name,
                user_id=created_by_id,
                user_name=created_by_name,
                user_role=created_by_role,
                new_value=self._sanitize_for_audit(user_doc),
                description=f"Created new user: {user_data.full_name} ({user_data.username})",
                ip_address=ip_address
            )

            # Send welcome email with credentials (fire-and-forget — never blocks user creation)
            if user_data.email:
                from app.services.email_service import send_welcome_email as _send_welcome, _fire_email
                _fire_email(_send_welcome(
                    to_email=user_data.email,
                    full_name=user_data.full_name,
                    username=user_data.username,
                    company_name=company_name or company_id or "your company",
                    temp_password=user_data.password,
                    company_id=company_id or "",
                ))

            # Return user without password
            user_doc.pop("password_hash", None)
            user_doc["id"] = user_doc.pop("_id")
            user_doc["role_name"] = get_role_display_name(user_data.role)

            return True, "User created successfully", user_doc
            
        except Exception as e:
            return False, f"Error creating user: {str(e)}", None
    
    async def get_user(self, user_id: str) -> Optional[Dict]:
        """Get user by ID"""
        user = await self.collection.find_one({
            "_id": user_id,
            "is_deleted": False
        })
        
        if user:
            user["id"] = user.pop("_id")
            user.pop("password_hash", None)
            user["role_name"] = get_role_display_name(user.get("role", ""))
            user["role_type"] = _compute_role_type(user)

            # Get reporting manager name
            if user.get("reporting_to"):
                manager = await self.collection.find_one(
                    {"_id": user["reporting_to"]},
                    {"full_name": 1}
                )
                user["reporting_to_name"] = manager.get("full_name") if manager else None

        return user
    
    async def get_user_by_username(self, username: str) -> Optional[Dict]:
        """Get user by username (includes password for auth)"""
        return await self.collection.find_one({
            "username": username.lower(),
            "is_deleted": False
        })
    
    async def get_user_by_email(self, email: str) -> Optional[Dict]:
        """Get user by email (includes password for auth)"""
        return await self.collection.find_one({
            "email": email.lower(),
            "is_deleted": False
        })
    
    async def get_user_by_mobile(self, mobile: str) -> Optional[Dict]:
        """Get user by mobile (includes password for auth)"""
        return await self.collection.find_one({
            "mobile": mobile,
            "is_deleted": False
        })
    
    async def list_users(
        self,
        page: int = 1,
        page_size: int = 20,
        search: Optional[str] = None,
        role: Optional[str] = None,
        user_type: Optional[str] = None,
        department_id: Optional[str] = None,
        status: Optional[str] = None,
        reporting_to: Optional[str] = None,
        sort_by: str = "created_at",
        sort_order: int = -1
    ) -> Tuple[List[Dict], int]:
        """List users with filters and pagination"""

        # Build query
        query = {"is_deleted": False}

        if user_type:
            if user_type == "internal":
                # Include documents where user_type is "internal", null, or missing.
                # Pre-existing users created before the user_type field was introduced
                # have user_type=None or no field at all — they are all internal users.
                # MongoDB's $in with None matches both null and missing field values.
                query["user_type"] = {"$in": ["internal", None]}
            else:
                query["user_type"] = user_type

        if search:
            query["$or"] = [
                {"full_name": {"$regex": re.escape(search), "$options": "i"}},
                {"username": {"$regex": re.escape(search), "$options": "i"}},
                {"email": {"$regex": re.escape(search), "$options": "i"}},
                {"mobile": {"$regex": re.escape(search), "$options": "i"}},
                {"employee_id": {"$regex": re.escape(search), "$options": "i"}}
            ]
        
        if role:
            query["role"] = role
        
        if department_id:
            query["department_id"] = department_id
        
        if status:
            query["status"] = status
        
        if reporting_to:
            query["reporting_to"] = reporting_to
        
        # Get total count
        total = await self.collection.count_documents(query)
        
        # Get paginated results
        skip = (page - 1) * page_size
        cursor = self.collection.find(query).sort(sort_by, sort_order).skip(skip).limit(page_size)
        
        users = []
        async for user in cursor:
            user["id"] = user.pop("_id")
            user.pop("password_hash", None)
            user["role_name"] = get_role_display_name(user.get("role", ""))
            user["role_type"] = _compute_role_type(user)

            # Get reporting manager name
            if user.get("reporting_to"):
                manager = await self.collection.find_one(
                    {"_id": user["reporting_to"]},
                    {"full_name": 1}
                )
                user["reporting_to_name"] = manager.get("full_name") if manager else None

            users.append(user)

        # Batch-resolve department and designation names for users that have
        # IDs stored but are missing the corresponding name strings.
        # This handles users created/edited before name-resolution was added.
        dept_ids = list({
            u["department_id"] for u in users
            if u.get("department_id") and not u.get("department")
        })
        desig_ids = list({
            u["designation_id"] for u in users
            if u.get("designation_id") and not u.get("designation")
        })

        dept_map: Dict[str, str] = {}
        if dept_ids:
            async for dept in self.db.departments.find(
                {"_id": {"$in": dept_ids}}, {"name": 1}
            ):
                dept_map[dept["_id"]] = dept.get("name", "")

        desig_map: Dict[str, str] = {}
        if desig_ids:
            async for desig in self.db.designations.find(
                {"_id": {"$in": desig_ids}}, {"name": 1}
            ):
                desig_map[desig["_id"]] = desig.get("name", "")

        for user in users:
            if not user.get("department") and user.get("department_id"):
                user["department"] = dept_map.get(user["department_id"], "")
            if not user.get("designation") and user.get("designation_id"):
                user["designation"] = desig_map.get(user["designation_id"], "")

        return users, total
    
    async def update_user(
        self,
        user_id: str,
        update_data: UserUpdate,
        updated_by_id: str,
        updated_by_name: str,
        updated_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Update a user (Admin operation)"""
        try:
            # Get existing user
            existing = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not existing:
                return False, "User not found", None
            
            # Cannot modify owner account except by owner themselves
            if existing.get("is_owner") and updated_by_id != user_id:
                # Only allow status changes by owner
                pass  # Admins can still update owner, but with restrictions
            
            # Build update document — only skip fields that are literally None
            # (meaning the caller did not send them).
            # False booleans, empty lists [], and 0 are valid update values and MUST pass through.
            update_dict = {}
            for field, value in update_data.model_dump(exclude_unset=True).items():
                if value is not None:
                    update_dict[field] = value
                elif isinstance(value, (bool, list)):
                    # Allow explicit False and explicit [] (e.g. clear permissions)
                    update_dict[field] = value

            if not update_dict:
                # Nothing to change — return current state without error
                current_user = await self.get_user(user_id)
                return True, "No changes made", current_user

            # ── Permission handling ─────────────────────────────────────────────
            # If permissions list is provided, use it directly (pre-computed by frontend)
            if "permissions" in update_dict:
                valid_permissions = {p.value for p in Permission}
                update_dict["permissions"] = [
                    p for p in update_dict["permissions"] if p in valid_permissions
                ]
            # If role changed and no permissions provided, refresh from role
            elif "role" in update_dict:
                role_name = update_dict["role"]
                role_doc = await self.db.roles.find_one(
                    {"name": role_name, "is_deleted": False}
                )
                if role_doc and role_doc.get("permissions"):
                    update_dict["permissions"] = list(role_doc["permissions"])
                else:
                    role_enum = SystemRole(role_name) if role_name in [r.value for r in SystemRole] else None
                    update_dict["permissions"] = [
                        p.value for p in ROLE_DEFAULT_PERMISSIONS.get(role_enum, [])
                    ] if role_enum else []

            # Derive override_permissions from what the caller sent.
            # True  → _resolve_effective_permissions uses this stored list at login.
            # False → login derives from role doc / ROLE_PERMISSIONS (role-driven fallback).
            # Must be computed BEFORE the pop so we keep the value we calculate, not what caller sent.
            if "permissions" in update_dict:
                _new_override = True   # explicit permissions list supplied → honour it
            elif "role" in update_dict:
                _new_override = False  # role changed, no custom perms → revert to role-driven
            else:
                _new_override = None   # neither changed → don't touch the field

            # SAFEGUARD 1 — owners must never have override_permissions=True.
            # Their access is governed solely by the is_owner flag; _resolve_effective_permissions
            # skips the override branch for owners, so setting it True would be a no-op at
            # runtime but could confuse future audits.
            if existing.get("is_owner") and _new_override is True:
                _new_override = False

            # SAFEGUARD 2 — when override is active (True) and the permission list is empty,
            # guarantee dashboard:view so the sidebar is never completely blank.
            if _new_override is True and "permissions" in update_dict and not update_dict["permissions"]:
                update_dict["permissions"] = ["dashboard:view"]

            update_dict.pop("override_permissions", None)  # never let caller set this directly
            if _new_override is not None:
                update_dict["override_permissions"] = _new_override

            # Auto-derive user_type when role changes (if not explicitly set)
            if "role" in update_dict and "user_type" not in update_dict:
                update_dict["user_type"] = "partner" if update_dict["role"] == "partner" else "internal"
            elif "user_type" in update_dict and update_dict["user_type"] is None:
                del update_dict["user_type"]  # ignore explicit None

            # Owners always report to themselves — never allow overriding to another user
            if existing.get("is_owner"):
                update_dict["reporting_to"] = user_id

            update_dict["updated_by"] = updated_by_id
            update_dict["updated_at"] = datetime.now(timezone.utc)

            # Perform update
            await self.collection.update_one(
                {"_id": user_id},
                {"$set": update_dict}
            )

            # Get updated user
            updated_user = await self.get_user(user_id)

            # Audit log
            await self.audit_service.log(
                action=AuditAction.UPDATE.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=existing.get("full_name"),
                user_id=updated_by_id,
                user_name=updated_by_name,
                user_role=updated_by_role,
                old_value=self._sanitize_for_audit(existing),
                new_value=update_dict,
                changed_fields=list(update_dict.keys()),
                description=f"Updated user: {existing.get('full_name')}",
                ip_address=ip_address
            )

            return True, "User updated successfully", updated_user
            
        except Exception as e:
            return False, f"Error updating user: {str(e)}", None
    
    async def update_profile(
        self,
        user_id: str,
        update_data: UserProfileUpdate,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str, Optional[Dict]]:
        """Update user's own profile (limited fields)"""
        try:
            existing = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not existing:
                return False, "User not found", None
            
            # Build update document with only allowed fields
            # Use explicit sentinel check so False booleans (e.g. profile_completed=False)
            # are not accidentally dropped by `if value` style checks.
            update_dict = {}
            for field, value in update_data.model_dump(exclude_unset=True).items():
                if value is not None:
                    update_dict[field] = value

            if not update_dict:
                return False, "No fields to update", None

            update_dict["updated_by"] = user_id
            update_dict["updated_at"] = datetime.now(timezone.utc)

            await self.collection.update_one(
                {"_id": user_id},
                {"$set": update_dict}
            )
            
            updated_user = await self.get_user(user_id)
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.UPDATE.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=existing.get("full_name"),
                user_id=user_id,
                user_name=existing.get("full_name"),
                user_role=existing.get("role"),
                old_value=self._sanitize_for_audit(existing),
                new_value=update_dict,
                changed_fields=list(update_dict.keys()),
                description="Updated own profile",
                ip_address=ip_address
            )
            
            return True, "Profile updated successfully", updated_user
            
        except Exception as e:
            return False, f"Error updating profile: {str(e)}", None
    
    async def change_password(
        self,
        user_id: str,
        password_data: ChangePasswordRequest,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Change user's own password"""
        try:
            user = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not user:
                return False, "User not found"
            
            # Verify current password
            if not bcrypt.checkpw(
                password_data.current_password.encode('utf-8'),
                user["password_hash"].encode('utf-8')
            ):
                return False, "Current password is incorrect"
            
            # Check new password != current
            if password_data.current_password == password_data.new_password:
                return False, "New password must be different from current password"
            
            # Verify confirm password
            if password_data.new_password != password_data.confirm_password:
                return False, "New password and confirm password do not match"
            
            # Hash new password
            new_hash = bcrypt.hashpw(
                password_data.new_password.encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')
            
            await self.collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "password_hash": new_hash,
                        "password_changed_at": datetime.now(timezone.utc),
                        "must_change_password": False,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )

            # Sync new password to global identity layer
            try:
                master_db = get_master_db()
                await sync_global_password(master_db, email=user["email"], new_password_hash=new_hash)
            except Exception as _ge:
                logger.warning("Global password sync failed for user %s: %s", user_id, _ge)

            # Audit log
            await self.audit_service.log(
                action=AuditAction.PASSWORD_CHANGE.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user.get("full_name"),
                user_id=user_id,
                user_name=user.get("full_name"),
                user_role=user.get("role"),
                description="Changed own password",
                ip_address=ip_address
            )

            return True, "Password changed successfully"
            
        except Exception as e:
            return False, f"Error changing password: {str(e)}"
    
    async def reset_password_by_admin(
        self,
        user_id: str,
        password_data: ResetPasswordByAdmin,
        admin_id: str,
        admin_name: str,
        admin_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Reset user's password by admin"""
        try:
            user = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not user:
                return False, "User not found"
            
            # Hash new password
            new_hash = bcrypt.hashpw(
                password_data.new_password.encode('utf-8'),
                bcrypt.gensalt(rounds=12)
            ).decode('utf-8')
            
            await self.collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "password_hash": new_hash,
                        "password_changed_at": datetime.now(timezone.utc),
                        "must_change_password": password_data.must_change_password,
                        "failed_login_attempts": 0,
                        "locked_until": None,
                        "updated_by": admin_id,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )

            # Sync new password to global identity layer
            try:
                master_db = get_master_db()
                await sync_global_password(master_db, email=user["email"], new_password_hash=new_hash)
            except Exception as _ge:
                logger.warning("Global password sync failed for user %s: %s", user_id, _ge)

            # Audit log
            await self.audit_service.log(
                action=AuditAction.PASSWORD_RESET.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user.get("full_name"),
                user_id=admin_id,
                user_name=admin_name,
                user_role=admin_role,
                description=f"Reset password for user: {user.get('full_name')}",
                ip_address=ip_address
            )
            
            return True, "Password reset successfully"
            
        except Exception as e:
            return False, f"Error resetting password: {str(e)}"
    
    async def update_status(
        self,
        user_id: str,
        status: str,
        updated_by_id: str,
        updated_by_name: str,
        updated_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Update user status (activate/deactivate/suspend)"""
        try:
            user = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not user:
                return False, "User not found"
            
            # Cannot deactivate owner
            if user.get("is_owner") and status != UserStatus.ACTIVE.value:
                return False, "Cannot deactivate company owner"
            
            old_status = user.get("status")
            
            await self.collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "status": status,
                        "updated_by": updated_by_id,
                        "updated_at": datetime.now(timezone.utc)
                    }
                }
            )
            
            # Determine audit action
            action = AuditAction.UPDATE.value
            if status == UserStatus.ACTIVE.value:
                action = AuditAction.ACTIVATE.value
            elif status == UserStatus.INACTIVE.value:
                action = AuditAction.DEACTIVATE.value
            elif status == UserStatus.SUSPENDED.value:
                action = AuditAction.SUSPEND.value
            
            # Audit log
            await self.audit_service.log(
                action=action,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user.get("full_name"),
                user_id=updated_by_id,
                user_name=updated_by_name,
                user_role=updated_by_role,
                old_value={"status": old_status},
                new_value={"status": status},
                changed_fields=["status"],
                description=f"Changed user status from {old_status} to {status}: {user.get('full_name')}",
                ip_address=ip_address
            )
            
            return True, f"User status updated to {status}"
            
        except Exception as e:
            return False, f"Error updating status: {str(e)}"
    
    async def delete_user(
        self,
        user_id: str,
        deleted_by_id: str,
        deleted_by_name: str,
        deleted_by_role: str,
        ip_address: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Soft delete a user"""
        try:
            user = await self.collection.find_one({
                "_id": user_id,
                "is_deleted": False
            })
            
            if not user:
                return False, "User not found"
            
            # Cannot delete owner
            if user.get("is_owner"):
                return False, "Cannot delete company owner"
            
            # Cannot delete yourself
            if user_id == deleted_by_id:
                return False, "Cannot delete yourself"
            
            now = datetime.now(timezone.utc)
            
            await self.collection.update_one(
                {"_id": user_id},
                {
                    "$set": {
                        "is_deleted": True,
                        "deleted_at": now,
                        "deleted_by": deleted_by_id,
                        "status": UserStatus.INACTIVE.value,
                        "updated_at": now
                    }
                }
            )
            
            # Audit log
            await self.audit_service.log(
                action=AuditAction.DELETE.value,
                entity_type=EntityType.USER.value,
                entity_id=user_id,
                entity_name=user.get("full_name"),
                user_id=deleted_by_id,
                user_name=deleted_by_name,
                user_role=deleted_by_role,
                old_value=self._sanitize_for_audit(user),
                description=f"Deleted user: {user.get('full_name')} ({user.get('username')})",
                ip_address=ip_address
            )
            
            return True, "User deleted successfully"
            
        except Exception as e:
            return False, f"Error deleting user: {str(e)}"
    
    async def get_dashboard_stats(self) -> Dict:
        """Get user statistics for admin dashboard"""
        total = await self.collection.count_documents({"is_deleted": False})
        active = await self.collection.count_documents({"is_deleted": False, "status": "active"})
        inactive = await self.collection.count_documents({"is_deleted": False, "status": "inactive"})
        suspended = await self.collection.count_documents({"is_deleted": False, "status": "suspended"})
        
        # Users by role
        role_pipeline = [
            {"$match": {"is_deleted": False}},
            {"$group": {"_id": "$role", "count": {"$sum": 1}}}
        ]
        role_stats = {}
        async for doc in self.collection.aggregate(role_pipeline):
            role_stats[doc["_id"]] = doc["count"]
        
        # Recently logged in (last 24 hours)
        from datetime import timedelta
        day_ago = datetime.now(timezone.utc) - timedelta(days=1)
        logged_in_today = await self.collection.count_documents({
            "is_deleted": False,
            "last_login": {"$gte": day_ago}
        })
        
        return {
            "total_users": total,
            "active_users": active,
            "inactive_users": inactive,
            "suspended_users": suspended,
            "logged_in_today": logged_in_today,
            "users_by_role": role_stats
        }
    
    async def get_reporting_hierarchy(self, user_id: str) -> List[Dict]:
        """Get all direct reports of a user"""
        cursor = self.collection.find({
            "reporting_to": user_id,
            "is_deleted": False
        })

        reports = []
        async for user in cursor:
            user["id"] = user.pop("_id")
            user.pop("password_hash", None)
            user["role_name"] = get_role_display_name(user.get("role", ""))
            reports.append(user)

        return reports

    async def get_all_subordinates(self, user_id: str) -> List[str]:
        """Get all subordinate user IDs recursively (BFS) including the user themselves"""
        all_ids = [user_id]
        queue = [user_id]
        visited = {user_id}

        while queue:
            current_id = queue.pop(0)
            cursor = self.collection.find(
                {"reporting_to": current_id, "is_deleted": False},
                {"_id": 1}
            )
            async for sub in cursor:
                sub_id = sub["_id"]
                if sub_id not in visited:
                    visited.add(sub_id)
                    all_ids.append(sub_id)
                    queue.append(sub_id)

        return all_ids
    
    async def validate_field(
        self,
        field: str,
        value: str,
        exclude_user_id: Optional[str] = None
    ) -> Tuple[bool, str]:
        """Validate if a field value is unique"""
        query = {
            field: value.lower() if field in ["username", "email"] else value,
            "is_deleted": False
        }
        
        if exclude_user_id:
            query["_id"] = {"$ne": exclude_user_id}
        
        existing = await self.collection.find_one(query)
        
        if existing:
            return False, f"This {field} is already taken"
        
        return True, f"{field} is available"
    
    def _sanitize_for_audit(self, user_doc: Dict) -> Dict:
        """Remove sensitive fields for audit logging"""
        sanitized = dict(user_doc)
        sanitized.pop("password_hash", None)
        sanitized.pop("_id", None)
        return sanitized

    async def get_org_tree(self) -> List[Dict]:
        """
        Build a hierarchical org tree from all non-deleted users.

        Returns a list of root nodes (users with no manager or whose manager
        is not in the system), each with a recursive 'children' list.
        """
        # Fetch all active users — minimal projection for tree building
        cursor = self.collection.find(
            {"is_deleted": False},
            {
                "_id": 1, "full_name": 1, "role": 1, "status": 1,
                "designation": 1, "designation_id": 1,
                "department": 1, "department_id": 1,
                "reporting_to": 1,
            }
        )
        raw_users = await cursor.to_list(length=None)

        # Batch-resolve missing department / designation names
        dept_ids = list({
            u.get("department_id") for u in raw_users
            if u.get("department_id") and not u.get("department")
        })
        desig_ids = list({
            u.get("designation_id") for u in raw_users
            if u.get("designation_id") and not u.get("designation")
        })

        dept_map: Dict[str, str] = {}
        if dept_ids:
            async for dept in self.db.departments.find(
                {"_id": {"$in": dept_ids}}, {"name": 1}
            ):
                dept_map[dept["_id"]] = dept.get("name", "")

        desig_map: Dict[str, str] = {}
        if desig_ids:
            async for desig in self.db.designations.find(
                {"_id": {"$in": desig_ids}}, {"name": 1}
            ):
                desig_map[desig["_id"]] = desig.get("name", "")

        # Build node map — keyed by user ID
        all_ids: set = {u["_id"] for u in raw_users}
        node_map: Dict[str, Dict] = {}
        for u in raw_users:
            uid = u["_id"]
            node_map[uid] = {
                "id": uid,
                "name": u.get("full_name", ""),
                "role": u.get("role", ""),
                "role_name": get_role_display_name(u.get("role", "")),
                "status": u.get("status", "active"),
                "designation": u.get("designation") or desig_map.get(u.get("designation_id"), ""),
                "department": u.get("department") or dept_map.get(u.get("department_id"), ""),
                "reporting_to": u.get("reporting_to"),
                "children": [],
            }

        # Wire up parent → children relationships; collect roots
        roots: List[Dict] = []
        for uid, node in node_map.items():
            parent_id = node.get("reporting_to")
            if parent_id and parent_id in node_map:
                node_map[parent_id]["children"].append(node)
            else:
                roots.append(node)

        return roots