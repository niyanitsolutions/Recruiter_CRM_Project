"""
Authentication Middleware
JWT validation and user context injection
"""

from fastapi import Request, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from typing import Optional, List
from datetime import datetime, timezone
import logging

from app.core.security import verify_access_token
from app.core.database import get_master_db

logger = logging.getLogger(__name__)

# HTTP Bearer scheme for JWT
security = HTTPBearer()


class AuthContext:
    """
    Authentication context containing user and company info
    
    Available after JWT validation:
    - user_id: The authenticated user's ID
    - company_id: The tenant's company ID
    - role: User's role
    - permissions: List of permission codes
    - is_super_admin: True if SuperAdmin
    - is_owner: True if company owner
    """
    
    def __init__(
        self,
        user_id: str,
        company_id: Optional[str],
        role: str,
        permissions: List[str],
        is_super_admin: bool = False,
        is_seller: bool = False,
        seller_id: Optional[str] = None,
        is_owner: bool = False,
        username: str = "",
        full_name: str = "",
        session_id: Optional[str] = None,
    ):
        self.user_id = user_id
        self.company_id = company_id
        self.role = role
        self.permissions = permissions
        self.is_super_admin = is_super_admin
        self.is_seller = is_seller
        self.seller_id = seller_id
        self.is_owner = is_owner
        self.username = username
        self.full_name = full_name
        self.session_id = session_id
    
    def has_permission(self, permission: str) -> bool:
        """Check if user has a specific permission"""
        return permission in self.permissions
    
    def has_any_permission(self, permissions: List[str]) -> bool:
        """Check if user has any of the given permissions"""
        return any(p in self.permissions for p in permissions)
    
    def has_all_permissions(self, permissions: List[str]) -> bool:
        """Check if user has all of the given permissions"""
        return all(p in self.permissions for p in permissions)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> AuthContext:
    """
    Dependency to get current authenticated user
    
    Validates JWT and returns AuthContext
    Raises HTTPException if token is invalid
    """
    token = credentials.credentials

    # Verify token
    payload = verify_access_token(token)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"}
        )

    # Validate session (jti) — enforces single active session per user
    jti = payload.get("jti")
    if jti:
        master_db = get_master_db()
        now = datetime.now(timezone.utc)
        session = await master_db.sessions.find_one({"_id": jti, "is_active": True})
        if not session:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has expired or been terminated. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )
        session_expires = session.get("expires_at", now)
        # Motor returns naive datetimes; normalize to UTC-aware for comparison
        if session_expires and session_expires.tzinfo is None:
            session_expires = session_expires.replace(tzinfo=timezone.utc)
        if session_expires < now:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Session has expired or been terminated. Please log in again.",
                headers={"WWW-Authenticate": "Bearer"},
            )

    # Extract user context
    return AuthContext(
        user_id=payload.get("sub"),
        company_id=payload.get("company_id"),
        role=payload.get("role", ""),
        permissions=payload.get("permissions", []),
        is_super_admin=payload.get("is_super_admin", False),
        is_seller=payload.get("is_seller", False),
        seller_id=payload.get("seller_id"),
        is_owner=payload.get("is_owner", False),
        username=payload.get("username", ""),
        full_name=payload.get("full_name", ""),
        session_id=jti,
    )


async def get_optional_user(
    request: Request
) -> Optional[AuthContext]:
    """
    Dependency to get optional user (for public endpoints that behave differently when authenticated)
    """
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        return None

    token = auth_header.split(" ")[1]
    payload = verify_access_token(token)

    if not payload:
        return None

    return AuthContext(
        user_id=payload.get("sub"),
        company_id=payload.get("company_id"),
        role=payload.get("role", ""),
        permissions=payload.get("permissions", []),
        is_super_admin=payload.get("is_super_admin", False),
        is_seller=payload.get("is_seller", False),
        seller_id=payload.get("seller_id"),
        is_owner=payload.get("is_owner", False),
        username=payload.get("username", ""),
        full_name=payload.get("full_name", ""),
        session_id=payload.get("jti"),
    )


def require_super_admin(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
    """
    Dependency to require SuperAdmin access
    
    Use for endpoints that should only be accessible by SuperAdmin
    """
    if not auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SuperAdmin access required"
        )
    return auth


def require_company_admin(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
    """
    Dependency to require Company Admin access
    
    Use for endpoints that should only be accessible by company admins
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="This endpoint is not accessible by SuperAdmin"
        )
    
    if auth.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Company Admin access required"
        )
    return auth


def require_permission(permission: str):
    """
    Factory function to create permission-checking dependency
    
    Usage:
        @router.get("/candidates")
        async def get_candidates(auth: AuthContext = Depends(require_permission("candidates:read"))):
            ...
    """
    def permission_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if not auth.has_permission(permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permission '{permission}' required"
            )
        return auth
    return permission_checker


def require_any_permission(permissions: List[str]):
    """
    Factory function to require any of the given permissions
    """
    def permission_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if not auth.has_any_permission(permissions):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these permissions required: {', '.join(permissions)}"
            )
        return auth
    return permission_checker


def require_seller(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
    """
    Dependency to require Seller access.
    Use for endpoints accessible only by sellers/resellers.
    """
    if not auth.is_seller:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Seller access required"
        )
    return auth


def require_role(roles: List[str]):
    """
    Factory function to require specific roles
    
    Usage:
        @router.get("/interviews")
        async def get_interviews(auth: AuthContext = Depends(require_role(["candidate_coordinator", "client_coordinator"]))):
            ...
    """
    def role_checker(auth: AuthContext = Depends(get_current_user)) -> AuthContext:
        if auth.role not in roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"One of these roles required: {', '.join(roles)}"
            )
        return auth
    return role_checker