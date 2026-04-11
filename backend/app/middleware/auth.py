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
from app.core.database import get_master_db, get_company_db

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

    jti = payload.get("jti")
    _company_id    = payload.get("company_id")
    _is_super_admin = payload.get("is_super_admin", False)
    _is_seller      = payload.get("is_seller", False)
    _user_sub       = payload.get("sub")

    # ── STEP 1: active_session_token check (company users only) ─────────────
    # Must run BEFORE the sessions-table check so that a force-login kick-out
    # is detected here and returns {"sessionExpired": True} — not the plain
    # string that sessions-table would return after _revoke_sessions() marks
    # the old session inactive.
    #
    # Flow when Device B force-logs in:
    #   • _revoke_sessions()     → Device A's sessions row is is_active=False
    #   • active_session_token   → overwritten with Device B's jti (UUID_B)
    #   → Device A's next request: jti=UUID_A  ≠  active_session_token=UUID_B
    #                               ↳ caught HERE, returns sessionExpired=True ✓
    #   → Sessions-table check is never reached for Device A ✓
    if jti and not _is_super_admin and not _is_seller and _company_id:
        _cdb  = get_company_db(_company_id)
        _udoc = await _cdb.users.find_one(
            {"_id": _user_sub},
            {"active_session_token": 1},
        )
        if _udoc is None:
            # Owner may only exist in master_db.tenants (no company_db users row)
            _mdb2   = get_master_db()
            _tenant = await _mdb2.tenants.find_one({"company_id": _company_id})
            _active_token = (
                _tenant.get("owner", {}).get("active_session_token")
                if _tenant else None
            )
        else:
            _active_token = _udoc.get("active_session_token")

        # Only enforce when a token has been recorded (skips pre-feature sessions)
        if _active_token and _active_token != jti:
            logger.warning(
                "[SESSION] Force-login kick-out detected | user=%s | "
                "jwt_jti=%s | db_active=%s",
                _user_sub, jti, _active_token,
            )
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail={
                    "sessionExpired": True,
                    "message": "Your session has been ended because the account logged in on another device.",
                },
                headers={"WWW-Authenticate": "Bearer"},
            )

    # ── STEP 2: sessions-table check — enforces expiry and explicit revocation ─
    # Reached only when the active_session_token check passed (tokens matched),
    # so this path handles: (a) naturally expired sessions, (b) sessions revoked
    # by the user's own explicit logout on the same device.
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
        # Motor returns naive datetimes; normalise to UTC-aware for comparison
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