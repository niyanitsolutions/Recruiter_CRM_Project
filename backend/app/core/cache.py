"""
Caching Utilities

High-level caching decorators and helpers built on top of redis.py.
Used to cache expensive MongoDB queries (tenant info, plan limits, etc.)
"""

import json
import logging
from functools import wraps
from typing import Optional, Any

from app.core.redis import get_redis

logger = logging.getLogger(__name__)

DEFAULT_TTL = 300       # 5 minutes
TENANT_TTL = 600        # 10 minutes — tenant info changes rarely
PLAN_TTL = 3600         # 1 hour — plan details rarely change


# ─── Generic Get/Set ───────────────────────────────────────────────────────────

async def cache_get(key: str) -> Optional[Any]:
    """Get a JSON-serialized value from Redis cache."""
    client = get_redis()
    if not client:
        return None
    try:
        data = await client.get(key)
        return json.loads(data) if data else None
    except Exception as e:
        logger.warning(f"cache_get({key}) failed: {e}")
        return None


async def cache_set(key: str, value: Any, ttl: int = DEFAULT_TTL) -> bool:
    """Set a JSON-serialized value in Redis cache with TTL."""
    client = get_redis()
    if not client:
        return False
    try:
        await client.setex(key, ttl, json.dumps(value, default=str))
        return True
    except Exception as e:
        logger.warning(f"cache_set({key}) failed: {e}")
        return False


async def cache_delete(key: str) -> bool:
    """Delete a key from cache."""
    client = get_redis()
    if not client:
        return False
    try:
        await client.delete(key)
        return True
    except Exception as e:
        logger.warning(f"cache_delete({key}) failed: {e}")
        return False


async def cache_delete_pattern(pattern: str) -> int:
    """Delete all keys matching a pattern (e.g., 'tenant:*')."""
    client = get_redis()
    if not client:
        return 0
    try:
        keys = await client.keys(pattern)
        if keys:
            return await client.delete(*keys)
        return 0
    except Exception as e:
        logger.warning(f"cache_delete_pattern({pattern}) failed: {e}")
        return 0


# ─── Domain-Specific Cache Keys ────────────────────────────────────────────────

def tenant_key(company_id: str) -> str:
    return f"tenant:{company_id}"


def plan_key(plan_id: str) -> str:
    return f"plan:{plan_id}"


def user_key(user_id: str) -> str:
    return f"user:{user_id}"


def company_stats_key(company_id: str) -> str:
    return f"stats:{company_id}"


# ─── Tenant Cache ──────────────────────────────────────────────────────────────

async def get_cached_tenant(company_id: str) -> Optional[dict]:
    """Get tenant data from cache."""
    return await cache_get(tenant_key(company_id))


async def set_cached_tenant(company_id: str, tenant_data: dict) -> bool:
    """Cache tenant data for 10 minutes."""
    return await cache_set(tenant_key(company_id), tenant_data, TENANT_TTL)


async def invalidate_tenant_cache(company_id: str) -> None:
    """Invalidate tenant cache (call after tenant update)."""
    await cache_delete(tenant_key(company_id))
    # Also invalidate related stats
    await cache_delete(company_stats_key(company_id))


# ─── Plan Cache ────────────────────────────────────────────────────────────────

async def get_cached_plan(plan_id: str) -> Optional[dict]:
    """Get plan data from cache."""
    return await cache_get(plan_key(plan_id))


async def set_cached_plan(plan_id: str, plan_data: dict) -> bool:
    """Cache plan data for 1 hour."""
    return await cache_set(plan_key(plan_id), plan_data, PLAN_TTL)


# ─── Cache-Aside Helper ────────────────────────────────────────────────────────

async def get_or_set(key: str, fetch_fn, ttl: int = DEFAULT_TTL) -> Any:
    """
    Cache-aside pattern: get from cache, or call fetch_fn and cache the result.

    Usage:
        data = await get_or_set(
            f"tenant:{company_id}",
            lambda: db.tenants.find_one({"_id": company_id}),
            ttl=600
        )
    """
    cached = await cache_get(key)
    if cached is not None:
        return cached

    # Cache miss — fetch from DB
    result = await fetch_fn()
    if result is not None:
        await cache_set(key, result, ttl)
    return result
