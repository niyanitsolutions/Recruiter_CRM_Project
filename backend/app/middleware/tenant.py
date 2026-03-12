"""
Tenant Middleware
Injects tenant-specific database connection into request context
"""

from fastapi import HTTPException, status, Depends
from motor.motor_asyncio import AsyncIOMotorDatabase
import logging

from app.core.database import get_company_db, get_master_db
from app.middleware.auth import AuthContext, get_current_user

logger = logging.getLogger(__name__)


async def get_tenant_db(
    auth: AuthContext = Depends(get_current_user)
) -> AsyncIOMotorDatabase:
    """
    Dependency to get tenant-specific database connection
    
    CRITICAL: This enforces tenant isolation
    
    - For company users: Returns company_<id>_db
    - For SuperAdmin: Raises error (SuperAdmin should use master_db)
    
    Usage:
        @router.get("/users")
        async def get_users(
            db: AsyncIOMotorDatabase = Depends(get_tenant_db)
        ):
            users = await db.users.find({}).to_list(100)
            ...
    """
    if auth.is_super_admin:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="SuperAdmin cannot access tenant databases directly"
        )
    
    if not auth.company_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Company ID not found in token"
        )
    
    try:
        db = get_company_db(auth.company_id)
        return db
    except Exception as e:
        logger.error(f"Failed to get tenant database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect to company database"
        )


async def get_master_database() -> AsyncIOMotorDatabase:
    """
    Dependency to get master database connection
    
    Used for:
    - Tenant management
    - Plan management
    - Payment tracking
    - SuperAdmin operations
    
    Usage:
        @router.get("/tenants")
        async def get_tenants(
            db: AsyncIOMotorDatabase = Depends(get_master_database)
        ):
            tenants = await db.tenants.find({}).to_list(100)
            ...
    """
    try:
        return get_master_db()
    except Exception as e:
        logger.error(f"Failed to get master database: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Failed to connect to master database"
        )


class TenantContext:
    """
    Combined tenant context with auth and database
    
    Provides:
    - auth: AuthContext with user info
    - db: Tenant-specific database connection
    """
    
    def __init__(self, auth: AuthContext, db: AsyncIOMotorDatabase):
        self.auth = auth
        self.db = db
    
    @property
    def user_id(self) -> str:
        return self.auth.user_id
    
    @property
    def company_id(self) -> str:
        return self.auth.company_id
    
    @property
    def role(self) -> str:
        return self.auth.role
    
    def has_permission(self, permission: str) -> bool:
        return self.auth.has_permission(permission)


async def get_tenant_context(
    auth: AuthContext = Depends(get_current_user),
    db: AsyncIOMotorDatabase = Depends(get_tenant_db)
) -> TenantContext:
    """
    Combined dependency for auth and tenant database
    
    Usage:
        @router.get("/candidates")
        async def get_candidates(ctx: TenantContext = Depends(get_tenant_context)):
            if not ctx.has_permission("candidates:read"):
                raise HTTPException(403, "Permission denied")
            candidates = await ctx.db.candidates.find({}).to_list(100)
            ...
    """
    return TenantContext(auth, db)