"""
Observability middleware — request IDs + slow-request logging.

Pure-ASGI-level concerns, no new dependencies:

- Every request gets an X-Request-ID (incoming header honored if present, so a
  proxy/CDN-assigned ID is preserved end-to-end; otherwise a short uuid4 is
  generated). The ID is echoed on the response and included in every log line
  this middleware emits, so a user-reported failure can be correlated across
  nginx logs, app logs, and Sentry.
- Requests slower than settings.SLOW_REQUEST_SECONDS are logged at WARNING
  with method, path, status, and duration — the cheap first line of "which
  endpoint is slow in production" before any APM exists.
- 5xx responses are logged at ERROR with the same context (the global
  exception handler already logs unhandled exceptions; this additionally
  catches handled-but-500 responses).

Health/liveness probes and static uploads are excluded to keep noise near zero.
"""

import logging
import time
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from app.core.config import settings

logger = logging.getLogger("app.request")

# Paths that are high-frequency and boring — never logged (they still get an ID)
_QUIET_PREFIXES = ("/health", "/ready", "/live", "/uploads", "/api/v1/uploads")


class ObservabilityMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-ID") or uuid.uuid4().hex[:16]
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            # The global exception handler converts this to a 500 response for
            # the client; log the correlation ID here, then re-raise so that
            # handler (and Sentry, when enabled) still see the exception.
            duration = time.perf_counter() - start
            logger.error(
                "request failed | id=%s %s %s | %.3fs",
                request_id, request.method, request.url.path, duration,
            )
            raise

        response.headers["X-Request-ID"] = request_id

        path = request.url.path
        if not path.startswith(_QUIET_PREFIXES):
            duration = time.perf_counter() - start
            if response.status_code >= 500:
                logger.error(
                    "5xx | id=%s %s %s -> %d | %.3fs",
                    request_id, request.method, path, response.status_code, duration,
                )
            elif duration >= settings.SLOW_REQUEST_SECONDS:
                logger.warning(
                    "slow request | id=%s %s %s -> %d | %.3fs",
                    request_id, request.method, path, response.status_code, duration,
                )
        return response
