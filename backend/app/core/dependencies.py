"""
Core Dependencies - Phase 2
Handles authentication, authorization, and database connections
"""
from fastapi import Depends, HTTPException, status, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import List, Callable
from jose import jwt, JWTError
from datetime import datetime, timezone

from app.core.config import settings

# Security scheme
security = HTTPBearer()

# Database connection manager (simplified - in production use proper connection pooling)
_master_db = None
_company_dbs = {}


async def get_master_db():
    """Get master database connection"""
    global _master_db
    if _master_db is None:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        _master_db = client[settings.MASTER_DB_NAME]
    return _master_db


async def get_company_db_by_id(company_id: str):
    """Get company-specific database connection"""
    global _company_dbs
    if company_id not in _company_dbs:
        from motor.motor_asyncio import AsyncIOMotorClient
        client = AsyncIOMotorClient(settings.MONGODB_URI)
        _company_dbs[company_id] = client[f"company_{company_id}_db"]
    return _company_dbs[company_id]


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
    Returns current_user dict so it can be used as: current_user = Depends(require_permissions(...))"""
    async def check_permissions(
        current_user: dict = Depends(get_current_user)
    ) -> dict:
        # Super admin has all permissions
        if current_user.get("is_super_admin"):
            return current_user

        # Owner has all permissions in their company
        if current_user.get("is_owner"):
            return current_user

        user_permissions = current_user.get("permissions", [])

        # Check if user has all required permissions
        missing = [p for p in required_permissions if p not in user_permissions]

        if missing:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Missing required permissions: {', '.join(missing)}"
            )

        return current_user

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