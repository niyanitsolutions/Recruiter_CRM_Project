"""
API v1 Routes - Phase 1 + Phase 2 + Phase 3 + Phase 4 + Phase 5
All API route imports
"""

# ============== Phase 1 - Auth & Tenant Management ==============
from . import auth
from . import super_admin
from . import tenants
from . import plans
from . import payments

# ============== Phase 2 - User Management ==============
from . import users
from . import partners
from . import roles
from . import departments
from . import designations
from . import audit_logs
from . import admin_dashboard

# ============== Phase 3 - Recruitment Core ==============
from . import clients
from . import candidates
from . import jobs
from . import applications
from . import interviews
from . import settings

# ============== Phase 4 - Onboarding & Partner Payout ==============
from . import onboards
from . import payouts
from . import notifications

# ============== Phase 5 - Reports, Analytics, Import/Export, Targets, Audit ==============
from . import reports
from . import analytics
from . import imports_exports
from . import targets
from . import audit
from . import scheduler
from . import tasks


__all__ = [
    # Phase 1
    'auth',
    'super_admin',
    'tenants',
    'plans',
    'payments',
    # Phase 2
    'users',
    'partners',
    'roles',
    'departments',
    'designations',
    'audit_logs',
    'admin_dashboard',
    # Phase 3
    'clients',
    'candidates',
    'jobs',
    'applications',
    'interviews',
    'settings',
    # Phase 4
    'onboards',
    'payouts',
    'notifications',
    # Phase 5
    'reports',
    'analytics',
    'imports_exports',
    'targets',
    'audit',
    'scheduler',
    'tasks',
]