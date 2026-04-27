"""
Core Dependencies - Phase 2
Handles authentication, authorization, and database connections
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Callable
from jose import jwt, JWTError
from datetime import datetime, timezone
import logging

from app.core.config import settings
from app.core.database import get_master_db as _db_get_master_db, get_company_db as _db_get_company_db

logger = logging.getLogger(__name__)

# Security scheme
security = HTTPBearer()


async def get_master_db():
    """Get master database connection via the shared DatabaseManager."""
    return _db_get_master_db()


async def get_company_db_by_id(company_id: str):
    """Get company-specific database via the shared DatabaseManager."""
    return _db_get_company_db(company_id)


def decode_token(token: str) -> dict:
    """Decode and validate JWT token"""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET_KEY, algorithms=[settings.JWT_ALGORITHM])
        
        # Check expiration
        exp = payload.get("exp")
        if exp and datetime.now(timezone.utc).timestamp() > exp:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Token has expired"
            )
        
        return payload
    except JWTError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid token: {str(e)}"
        )


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> dict:
    """Get current authenticated user from JWT token"""
    token = credentials.credentials
    payload = decode_token(token)

    # Extract user info from token
    user = {
        "id": payload.get("sub"),
        "company_id": payload.get("company_id"),
        "role": payload.get("role"),
        "user_type": payload.get("user_type", "internal"),
        "permissions": payload.get("permissions", []),
        "is_super_admin": payload.get("is_super_admin", False),
        "is_owner": payload.get("is_owner", False),
        "username": payload.get("username"),
        "full_name": payload.get("full_name"),
        "email": payload.get("email"),
        "department_id": payload.get("department_id"),
        "reporting_to": payload.get("reporting_to"),
    }

    if not user["id"]:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid token payload"
        )

    # ── Single-session enforcement ────────────────────────────────────────────
    # Verify the JWT's jti (session ID) is still marked active in master_db.sessions.
    # When another device force-logs in, _revoke_sessions() sets is_active=False for
    # all prior sessions, so this check will fail for the displaced device on its
    # very next API call — regardless of how much time remains on the JWT.
    jti = payload.get("jti")
    if jti:
        try:
            master_db = _db_get_master_db()
            session_doc = await master_db.sessions.find_one(
                {"_id": jti}, {"is_active": 1}
            )
            if not session_doc or not session_doc.get("is_active"):
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail={
                        "sessionExpired": True,
                        "message": "Your session was ended because this account logged in on another device.",
                    },
                )
        except HTTPException:
            raise
        except Exception as _sess_err:
            # DB unreachable — log and allow through rather than locking all users out
            logger.warning("Session validation DB error for jti=%s: %s", jti, _sess_err)

    return user


async def get_company_db(
    current_user: dict = Depends(get_current_user)
):
    """Get company database for current user"""
    company_id = current_user.get("company_id")
    
    if not company_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No company associated with this user"
        )
    
    return await get_company_db_by_id(company_id)


def require_permissions(required_permissions: List[str]) -> Callable:
    """Dependency factory to check if user has required permissions.

    Permission check order:
    1. Super-admin / Owner → always allowed.
    2. JWT token permissions → fast path (no DB query needed).
    3. DB fallback → if JWT is stale (e.g. permissions were updated after login),
       check the live DB record.  This ensures that an admin un-restricting a
       module takes effect immediately without forcing the user to re-login.

    Returns current_user dict so it can be used as:
        current_user = Depends(require_permissions(...))
    """
    async def check_permissions(
        current_user: dict = Depends(get_current_user),
        db = Depends(get_company_db),
    ) -> dict:
        # Super admin has all permissions
        if current_user.get("is_super_admin"):
            return current_user

        # Owner has all permissions in their company
        if current_user.get("is_owner"):
            return current_user

        user_permissions = set(current_user.get("permissions") or [])
        missing = [p for p in required_permissions if p not in user_permissions]

        if not missing:
            return current_user  # JWT already has all required permissions

        # ── DB fallback: permissions may have been updated since last login ──
        # This handles the "unrestrict" case where the JWT is stale.
        try:
            user_doc = await db["users"].find_one(
                {"_id": current_user["id"], "is_deleted": False},
                {"permissions": 1, "is_owner": 1}
            )
            if user_doc:
                if user_doc.get("is_owner"):
                    return current_user  # owner found in DB

                db_permissions = set(user_doc.get("permissions") or [])
                still_missing = [p for p in required_permissions if p not in db_permissions]
                if not still_missing:
                    # DB has the permission — update the in-request user dict so
                    # downstream code sees fresh permissions, then allow.
                    current_user["permissions"] = list(db_permissions)
                    return current_user
        except Exception as _db_err:
            logger.warning("Permission DB fallback failed for user %s: %s", current_user.get("id"), _db_err)

        logger.warning(
            "Permission denied | user=%s | role=%s | required=%s | missing=%s",
            current_user.get("id", "?"),
            current_user.get("role", "?"),
            required_permissions,
            missing,
        )
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Missing required permissions: {', '.join(missing)}"
        )

    return check_permissions


def require_any_permission(permission_sets: List[List[str]]) -> Callable:
    """Dependency factory that passes if user has ALL permissions in ANY one of the given sets.
    E.g. require_any_permission([["interview_settings:delete"], ["jobs:delete"]])
    passes if user has interview_settings:delete OR jobs:delete."""
    async def check_permissions(
        current_user: dict = Depends(get_current_user)
    ) -> dict:
        if current_user.get("is_super_admin") or current_user.get("is_owner"):
            return current_user

        user_permissions = set(current_user.get("permissions", []))

        for perm_set in permission_sets:
            if all(p in user_permissions for p in perm_set):
                return current_user

        all_options = " OR ".join("+".join(s) for s in permission_sets)
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Requires one of: {all_options}",
        )

    return check_permissions


def require_role(allowed_roles: List[str]) -> Callable:
    """Dependency factory to check if user has required role.
    Returns current_user dict so it can be used as: current_user = Depends(require_role(...))"""
    async def check_role(
        current_user: dict = Depends(get_current_user)
    ) -> dict:
        # Super admin can access anything
        if current_user.get("is_super_admin"):
            return current_user

        # Owner has admin role implicitly
        if current_user.get("is_owner") and "admin" in allowed_roles:
            return current_user

        user_role = current_user.get("role")

        if user_role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{user_role}' is not authorized for this action"
            )

        return current_user

    return check_role


def require_super_admin() -> Callable:
    """Dependency to require super admin access"""
    async def check_super_admin(
        current_user: dict = Depends(get_current_user)
    ) -> bool:
        if not current_user.get("is_super_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Super admin access required"
            )
        return True
    
    return check_super_admin


def require_owner() -> Callable:
    """Dependency to require company owner access"""
    async def check_owner(
        current_user: dict = Depends(get_current_user)
    ) -> bool:
        if not current_user.get("is_owner") and not current_user.get("is_super_admin"):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Company owner access required"
            )
        return True
    
    return check_owner


async def get_client_ip(request: Request) -> str:
    """Extract client IP from request"""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"