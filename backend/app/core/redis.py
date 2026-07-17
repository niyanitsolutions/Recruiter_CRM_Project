"""
Redis Connection Manager

Used for:
- Session / token storage (sub-ms lookup vs ~10ms MongoDB)
- JWT token blacklist (invalidated tokens stored with TTL)
- Permission & tenant data caching (avoid DB hit on every request)
- Application-level rate limiting
"""

import redis.asyncio as aioredis
from typing import Optional
import logging

from app.core.config import settings

logger = logging.getLogger(__name__)

# Module-level singleton client
_redis_client: Optional[aioredis.Redis] = None


async def init_redis() -> None:
    """
    Initialize Redis connection pool.
    Called from FastAPI lifespan startup.
    """
    global _redis_client
    try:
        _redis_client = aioredis.from_url(
            settings.REDIS_URL,
            encoding="utf-8",
            decode_responses=True,
            max_connections=settings.REDIS_MAX_CONNECTIONS,
            socket_connect_timeout=5,
            socket_timeout=5,
            retry_on_timeout=True,
            health_check_interval=30,
        )
        # Verify connection
        await _redis_client.ping()
        logger.info(f"Redis connected: {settings.REDIS_URL}")
    except Exception as e:
        logger.error(f"Redis connection failed: {e}")
        # Don't crash the app — Redis is optional (falls back to MongoDB)
        _redis_client = None


async def close_redis() -> None:
    """
    Close Redis connection pool.
    Called from FastAPI lifespan shutdown.
    """
    global _redis_client
    if _redis_client:
        await _redis_client.aclose()
        _redis_client = None
        logger.info("Redis connection closed")


def get_redis() -> Optional[aioredis.Redis]:
    """
    Get the Redis client.
    Returns None if Redis is not connected (fallback to MongoDB gracefully).
    """
    return _redis_client


# ─── Session Management ────────────────────────────────────────────────────────

SESSION_PREFIX = "session:"
BLACKLIST_PREFIX = "blacklist:"
PERMISSION_PREFIX = "perms:"
TENANT_PREFIX = "tenant:"
RATELIMIT_PREFIX = "rl:"


async def set_session(jti: str, user_id: str, ttl_seconds: int) -> bool:
    """Store a session token ID in Redis with TTL."""
    client = get_redis()
    if not client:
        return False
    try:
        key = f"{SESSION_PREFIX}{jti}"
        await client.setex(key, ttl_seconds, user_id)
        return True
    except Exception as e:
        logger.warning(f"Redis set_session failed: {e}")
        return False


async def get_session(jti: str) -> Optional[str]:
    """
    Check if a session (jti) is active in Redis.
    Returns user_id if active, None if expired/not found.
    """
    client = get_redis()
    if not client:
        return None
    try:
        return await client.get(f"{SESSION_PREFIX}{jti}")
    except Exception as e:
        logger.warning(f"Redis get_session failed: {e}")
        return None


async def delete_session(jti: str) -> bool:
    """Delete a session from Redis (logout / forced logout)."""
    client = get_redis()
    if not client:
        return False
    try:
        await client.delete(f"{SESSION_PREFIX}{jti}")
        return True
    except Exception as e:
        logger.warning(f"Redis delete_session failed: {e}")
        return False


async def blacklist_token(jti: str, ttl_seconds: int) -> bool:
    """
    Add a JWT jti to the blacklist (used when token is revoked before expiry).
    Token will auto-expire from Redis after TTL.
    """
    client = get_redis()
    if not client:
        return False
    try:
        await client.setex(f"{BLACKLIST_PREFIX}{jti}", ttl_seconds, "1")
        return True
    except Exception as e:
        logger.warning(f"Redis blacklist_token failed: {e}")
        return False


async def is_token_blacklisted(jti: str) -> bool:
    """Check if a JWT is blacklisted."""
    client = get_redis()
    if not client:
        return False
    try:
        return await client.exists(f"{BLACKLIST_PREFIX}{jti}") > 0
    except Exception as e:
        logger.warning(f"Redis is_token_blacklisted failed: {e}")
        return False


# ─── Per-request session-state cache ──────────────────────────────────────────
# get_current_user() validates the JWT's jti against master_db.sessions on every
# API request. These helpers cache that lookup so steady-state traffic doesn't
# pay a MongoDB round trip per call. Semantics are preserved exactly:
#   - active sessions are cached for a short TTL only (ACTIVE_TTL)
#   - every explicit revocation path (logout, force-login, revoke endpoints)
#     writes a "revoked" marker immediately, so force-logout still takes effect
#     on the displaced device's very next API call — no stale-active window.
# A session id (jti) is never reused after revocation (new logins mint a new
# uuid4 jti), so a cached "revoked" marker can never mask a legitimate session.

SESSION_STATE_PREFIX = "sessactive:"
SESSION_STATE_ACTIVE_TTL = 30       # seconds an "active" verdict may be reused
SESSION_STATE_REVOKED_TTL = 3600    # revoked markers only exist to short-circuit


async def get_cached_session_state(jti: str) -> Optional[bool]:
    """Return True (active) / False (revoked) from cache, or None on miss/unavailable."""
    client = get_redis()
    if not client:
        return None
    try:
        val = await client.get(f"{SESSION_STATE_PREFIX}{jti}")
        if val == "1":
            return True
        if val == "0":
            return False
        return None
    except Exception as e:
        logger.warning(f"Redis get_cached_session_state failed: {e}")
        return None


async def cache_session_active(jti: str) -> None:
    """Mark a session as verified-active for a short TTL."""
    client = get_redis()
    if not client:
        return
    try:
        await client.setex(f"{SESSION_STATE_PREFIX}{jti}", SESSION_STATE_ACTIVE_TTL, "1")
    except Exception as e:
        logger.warning(f"Redis cache_session_active failed: {e}")


async def mark_sessions_revoked(jtis: list) -> None:
    """Overwrite cache entries for revoked session ids so the displaced device
    is rejected immediately (not after the active-TTL lapses)."""
    client = get_redis()
    if not client or not jtis:
        return
    try:
        pipe = client.pipeline()
        for jti in jtis:
            if jti:
                pipe.setex(f"{SESSION_STATE_PREFIX}{jti}", SESSION_STATE_REVOKED_TTL, "0")
        await pipe.execute()
    except Exception as e:
        logger.warning(f"Redis mark_sessions_revoked failed: {e}")


# ─── Permission & Tenant Caching ───────────────────────────────────────────────

async def cache_permissions(user_id: str, permissions: list, ttl_seconds: int = 300) -> bool:
    """Cache user permissions list in Redis (5 min default TTL)."""
    client = get_redis()
    if not client:
        return False
    try:
        import json
        key = f"{PERMISSION_PREFIX}{user_id}"
        await client.setex(key, ttl_seconds, json.dumps(permissions))
        return True
    except Exception as e:
        logger.warning(f"Redis cache_permissions failed: {e}")
        return False


async def get_cached_permissions(user_id: str) -> Optional[list]:
    """Get cached permissions for a user. Returns None on cache miss."""
    client = get_redis()
    if not client:
        return None
    try:
        import json
        data = await client.get(f"{PERMISSION_PREFIX}{user_id}")
        return json.loads(data) if data else None
    except Exception as e:
        logger.warning(f"Redis get_cached_permissions failed: {e}")
        return None


async def invalidate_user_cache(user_id: str) -> None:
    """Invalidate all cached data for a user (call after permission update)."""
    client = get_redis()
    if not client:
        return
    try:
        await client.delete(f"{PERMISSION_PREFIX}{user_id}")
    except Exception as e:
        logger.warning(f"Redis invalidate_user_cache failed: {e}")


# ─── Generic key/value cache ──────────────────────────────────────────────────

async def get_cache(key: str):
    """Return deserialized value for key, or None on miss / Redis unavailable."""
    client = get_redis()
    if not client:
        return None
    try:
        import json
        raw = await client.get(key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.warning(f"Redis get_cache failed: {e}")
        return None


async def set_cache(key: str, value, ttl_seconds: int = 60) -> bool:
    """Serialize value and store with TTL. Non-serialisable types become strings."""
    client = get_redis()
    if not client:
        return False
    try:
        import json
        await client.setex(key, ttl_seconds, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.warning(f"Redis set_cache failed: {e}")
        return False


async def delete_cache(key: str) -> bool:
    """Delete a cache entry (call after mutating operations)."""
    client = get_redis()
    if not client:
        return False
    try:
        await client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"Redis delete_cache failed: {e}")
        return False


async def invalidate_dashboard_cache(company_id: str) -> None:
    """
    Invalidate every cached admin-dashboard entry for a company (all users,
    all period filters). Cache keys are `dashboard:{company_id}:{user_id}:{days}`,
    so a targeted delete_cache() can't know every user/period combination —
    must scan the company's key space instead. Call after any write that
    changes a count shown on the dashboard (candidate/job/application create).
    """
    client = get_redis()
    if not client or not company_id:
        return
    try:
        pattern = f"dashboard:{company_id}:*"
        keys = [key async for key in client.scan_iter(match=pattern)]
        if keys:
            await client.delete(*keys)
    except Exception as e:
        logger.warning(f"Redis invalidate_dashboard_cache failed: {e}")


# ─── Rate Limiting ─────────────────────────────────────────────────────────────

async def check_rate_limit(key: str, max_requests: int, window_seconds: int) -> tuple[bool, int]:
    """
    Sliding window rate limiter using Redis.

    Args:
        key: Unique identifier (e.g., "ip:1.2.3.4" or "user:abc123")
        max_requests: Maximum allowed requests in window
        window_seconds: Time window in seconds

    Returns:
        (allowed: bool, remaining: int)
    """
    client = get_redis()
    if not client:
        return True, max_requests  # Allow if Redis unavailable

    try:
        redis_key = f"{RATELIMIT_PREFIX}{key}"
        pipe = client.pipeline()
        pipe.incr(redis_key)
        pipe.expire(redis_key, window_seconds)
        results = await pipe.execute()
        count = results[0]
        remaining = max(0, max_requests - count)
        return count <= max_requests, remaining
    except Exception as e:
        logger.warning(f"Redis rate_limit check failed: {e}")
        return True, max_requests  # Fail open
