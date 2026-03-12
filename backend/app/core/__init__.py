"""
Core Module - Phase 1 + Phase 2
Contains configuration, database, security, tenant resolution, and dependencies
"""

# Phase 1 - Config
from app.core.config import settings, get_company_db_name

# Phase 1 - Database
from app.core.database import (
    DatabaseManager,
    connect_to_mongo,
    close_mongo_connection,
    get_master_db,
    get_company_db
)

# Phase 1 - Security
from app.core.security import (
    hash_password,
    verify_password,
    create_access_token,
    create_refresh_token,
    decode_token,
    verify_access_token,
    verify_refresh_token,
    generate_reset_token,
    generate_verification_code
)

# Phase 1 - Tenant Resolver
from app.core.tenant_resolver import TenantResolver, tenant_resolver

# Phase 2 - Dependencies (Auth, Permissions, DB injection)
from app.core.dependencies import (
    get_current_user,
    get_company_db_by_id,
    require_permissions,
    require_role,
    require_super_admin,
    require_owner,
    get_client_ip
)

__all__ = [
    # Phase 1 - Config
    "settings",
    "get_company_db_name",
    
    # Phase 1 - Database
    "DatabaseManager",
    "connect_to_mongo",
    "close_mongo_connection",
    "get_master_db",
    "get_company_db",
    
    # Phase 1 - Security
    "hash_password",
    "verify_password",
    "create_access_token",
    "create_refresh_token",
    "decode_token",
    "verify_access_token",
    "verify_refresh_token",
    "generate_reset_token",
    "generate_verification_code",
    
    # Phase 1 - Tenant Resolver
    "TenantResolver",
    "tenant_resolver",
    
    # Phase 2 - Dependencies
    "get_current_user",
    "get_company_db_by_id",
    "require_permissions",
    "require_role",
    "require_super_admin",
    "require_owner",
    "get_client_ip"
]