"""
Middleware Module
Authentication, tenant isolation, and plan validation
"""

from app.middleware.auth import (
    AuthContext,
    get_current_user,
    get_optional_user,
    require_super_admin,
    require_company_admin,
    require_permission,
    require_any_permission,
    require_role
)
from app.middleware.tenant import (
    get_tenant_db,
    get_master_database,
    TenantContext,
    get_tenant_context
)
from app.middleware.plan_checker import (
    PlanChecker,
    validate_plan,
    check_resource_limit
)

__all__ = [
    # Auth
    "AuthContext",
    "get_current_user",
    "get_optional_user",
    "require_super_admin",
    "require_company_admin",
    "require_permission",
    "require_any_permission",
    "require_role",
    # Tenant
    "get_tenant_db",
    "get_master_database",
    "TenantContext",
    "get_tenant_context",
    # Plan
    "PlanChecker",
    "validate_plan",
    "check_resource_limit"
]