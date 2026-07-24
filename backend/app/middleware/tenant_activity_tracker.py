"""
Tenant Activity Tracker Middleware (additive)
──────────────────────────────────────────────
Feeds the Super Admin Tenant Activity Monitoring feature. Does NOT touch
app/core/dependencies.py or app/middleware/auth.py — it reuses the existing
`decode_token()` helper (read-only import) purely to read `company_id` /
`is_super_admin` off the bearer token, and never raises, blocks, or alters
the response for any request.
"""

import asyncio
import logging

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger(__name__)


class TenantActivityTrackerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        try:
            if response.status_code < 400:
                auth_header = request.headers.get("authorization", "")
                if auth_header.lower().startswith("bearer "):
                    token = auth_header[7:].strip()
                    if token:
                        from app.core.dependencies import decode_token
                        payload = decode_token(token)
                        company_id = payload.get("company_id")
                        is_super_admin = payload.get("is_super_admin", False)
                        if company_id and not is_super_admin:
                            from app.services.tenant_monitoring_service import touch_tenant_activity
                            asyncio.ensure_future(touch_tenant_activity(company_id))
        except Exception as exc:
            logger.debug("[TenantActivityTracker] skipped: %s", exc)

        return response
