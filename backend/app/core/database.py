"""
MongoDB Database Connection Manager
Handles master_db and dynamic company_db connections with tenant isolation
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Any, ClassVar
import asyncio
import logging

from pymongo import IndexModel, ASCENDING, DESCENDING, TEXT

from app.core.config import settings, get_company_db_name, get_company_db_name_legacy

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    MongoDB Connection Manager
    
    Architecture:
    - ONE MongoDB cluster
    - ONE master_db (SuperAdmin: Tenants, Plans, Payments)
    - ONE database per company (c_{company_id_no_hyphens})
    - Complete tenant isolation
    """
    
    client: ClassVar[Any] = None
    
    @classmethod
    async def connect(cls):
        """Initialize MongoDB connection"""
        if cls.client is None:
            # Explicit pool sizing — same single shared client as before, just
            # fewer cold-start connection stalls under concurrent request bursts
            # (library defaults were maxPoolSize=100, minPoolSize=0, no idle
            # timeout). Values are per gunicorn worker process.
            cls.client = AsyncIOMotorClient(
                settings.MONGODB_URI,
                maxPoolSize=200,
                minPoolSize=10,
                maxIdleTimeMS=60_000,
                waitQueueTimeoutMS=10_000,
                retryWrites=True,
            )
            # Verify connection
            await cls.client.admin.command('ping')
            logger.info("✅ MongoDB connection established")
    
    @classmethod
    async def close(cls):
        """Close MongoDB connection"""
        if cls.client is not None:
            cls.client.close()
            cls.client = None
            logger.info("🔴 MongoDB connection closed")
    
    @classmethod
    def get_master_db(cls) -> AsyncIOMotorDatabase:
        """
        Get master database connection
        Used only by SuperAdmin for:
        - Tenants management
        - Plans management
        - Payments tracking
        - Global analytics
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        return cls.client[settings.MASTER_DB_NAME]
    
    # Cache: company_id → resolved db_name (avoids repeated list_database_names calls)
    _db_name_cache: ClassVar[dict] = {}

    @classmethod
    async def resolve_company_db_name(cls, company_id: str) -> str:
        """
        Return the actual database name for a company, trying new format first
        then falling back to the legacy format if needed.

        Caches the result so the listing call only happens once per company per
        process lifetime.  Safe to call at high frequency.
        """
        if company_id in cls._db_name_cache:
            return cls._db_name_cache[company_id]

        new_name = get_company_db_name(company_id)
        legacy_name = get_company_db_name_legacy(company_id)

        if new_name == legacy_name:
            cls._db_name_cache[company_id] = new_name
            return new_name

        existing = await cls.client.list_database_names()
        if new_name in existing:
            resolved = new_name
        elif legacy_name in existing:
            logger.warning(
                "[DB] company_id=%s is still using legacy DB name '%s'. "
                "Run  python -m migrations.rename_company_dbs  to migrate to Atlas-safe name '%s'.",
                company_id, legacy_name, new_name,
            )
            resolved = legacy_name
        else:
            # Neither exists yet — new tenant, use the new format
            resolved = new_name

        cls._db_name_cache[company_id] = resolved
        return resolved

    @classmethod
    def get_company_db(cls, company_id: str) -> AsyncIOMotorDatabase:
        """
        Get company-specific database connection (sync, uses cached name).

        CRITICAL: This enforces tenant isolation.
        On first access for a given company_id the name is NOT resolved
        asynchronously here — use resolve_and_get_company_db() in async contexts
        where you need the legacy-fallback guarantee (e.g. forgot-password scan).
        For normal request handling the name is pre-resolved during tenant setup.
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        # Use cached name if available, otherwise assume new format
        db_name = cls._db_name_cache.get(company_id) or get_company_db_name(company_id)
        return cls.client[db_name]

    @classmethod
    async def resolve_and_get_company_db(cls, company_id: str) -> AsyncIOMotorDatabase:
        """
        Async version that resolves the correct DB name (new or legacy) before
        returning the connection.  Use this anywhere that scans ALL tenants and
        must work on installations with pre-migration legacy-named databases.
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        db_name = await cls.resolve_company_db_name(company_id)
        return cls.client[db_name]
    
    @classmethod
    async def create_company_database(cls, company_id: str) -> AsyncIOMotorDatabase:
        """
        Create and initialize a new company database.
        Called during company registration.

        Uses create_indexes() (batch) instead of sequential create_index() calls so
        all indexes for a collection are sent in a single command — reduces Atlas
        round-trips from ~83 to 23, cutting provisioning time by ~4x.
        """
        db = await cls.resolve_and_get_company_db(company_id)

        def _mk(keys, *, unique=False, sparse=False):
            """Build an IndexModel from a key list (ints or 'text')."""
            # Convert plain int directions to pymongo constants
            converted = []
            for field, direction in keys:
                if direction == 1:
                    converted.append((field, ASCENDING))
                elif direction == -1:
                    converted.append((field, DESCENDING))
                else:
                    converted.append((field, TEXT))
            return IndexModel(converted, unique=unique, sparse=sparse)

        collections_indexes = {
            "users": [
                _mk([("email", 1)], unique=True, sparse=True),
                _mk([("mobile", 1)], unique=True, sparse=True),
                _mk([("username", 1)], unique=True, sparse=True),
                _mk([("role", 1)]),
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("role", 1)]),
            ],
            "roles": [
                _mk([("name", 1)], unique=True),
            ],
            "permissions": [
                _mk([("code", 1)], unique=True),
            ],
            "audit_logs": [
                _mk([("created_at", -1)]),
                _mk([("user_id", 1)]),
                _mk([("action", 1)]),
                _mk([("entity_type", 1), ("entity_id", 1)]),
            ],
            "notifications": [
                _mk([("user_id", 1), ("is_read", 1)]),
                _mk([("created_at", -1)]),
            ],
            # ── Recruitment core ───────────────────────────────────────────────
            "candidates": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("created_at", -1)]),
                _mk([("is_deleted", 1), ("created_by", 1), ("created_at", -1)]),
                _mk([("is_deleted", 1), ("partner_id", 1)]),
                _mk([("email", 1)], sparse=True),
                _mk([("skill_tags", 1)]),
                # Text index for $text search (full_name, email, skill_tags, …)
                _mk([("full_name", "text"), ("email", "text"),
                     ("skill_tags", "text"), ("current_company", "text"),
                     ("current_designation", "text"), ("current_city", "text")]),
            ],
            "jobs": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("client_id", 1)]),
                _mk([("is_deleted", 1), ("created_at", -1)]),
            ],
            "applications": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("candidate_id", 1)]),
                _mk([("is_deleted", 1), ("job_id", 1)]),
                _mk([("is_deleted", 1), ("created_at", -1)]),
                _mk([("candidate_id", 1), ("job_id", 1), ("is_deleted", 1)]),
            ],
            "interviews": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("candidate_id", 1)]),
                _mk([("is_deleted", 1), ("job_id", 1)]),
                _mk([("is_deleted", 1), ("application_id", 1)]),
                _mk([("is_deleted", 1), ("interviewer_ids", 1)]),
                _mk([("is_deleted", 1), ("scheduled_date", 1)]),
                _mk([("is_deleted", 1), ("scheduled_at", -1)]),
            ],
            "clients": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("created_at", -1)]),
            ],
            "onboards": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("is_deleted", 1), ("created_at", -1)]),
            ],
            "targets": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("user_id", 1)]),
            ],
            "departments": [
                _mk([("is_deleted", 1)]),
                _mk([("name", 1)]),
            ],
            "designations": [
                _mk([("is_deleted", 1)]),
                _mk([("name", 1)]),
            ],
            # ── HRM ────────────────────────────────────────────────────────────
            "hrm_employees": [
                _mk([("is_deleted", 1)]),
                _mk([("is_deleted", 1), ("status", 1)]),
                _mk([("company_id", 1), ("is_deleted", 1)]),
                _mk([("email", 1), ("company_id", 1)], sparse=True),
                _mk([("employee_id", 1), ("company_id", 1)], sparse=True),
            ],
            "hrm_assets": [
                _mk([("is_deleted", 1)]),
                _mk([("company_id", 1), ("is_deleted", 1)]),
                _mk([("company_id", 1), ("status", 1), ("is_deleted", 1)]),
                _mk([("asset_tag", 1), ("company_id", 1)], unique=True, sparse=True),
                _mk([("assigned_to_id", 1), ("company_id", 1)], sparse=True),
                _mk([("public_token", 1)], unique=True, sparse=True),
            ],
            "hrm_exit": [
                _mk([("is_deleted", 1)]),
                _mk([("company_id", 1), ("is_deleted", 1)]),
                _mk([("company_id", 1), ("status", 1), ("is_deleted", 1)]),
                _mk([("employee_id", 1), ("company_id", 1), ("is_deleted", 1)]),
            ],
            # Unified token store (candidate_form / employee_onboarding /
            # doc_upload token types — storage-consolidation rollout).
            "tokens": [
                _mk([("token", 1)], unique=True, sparse=True),
                _mk([("company_id", 1), ("employee_id", 1)]),
                _mk([("company_id", 1), ("status", 1)]),
                _mk([("expires_at", 1)], sparse=True),
            ],
        }
        # NOTE: legacy "employees", "payouts", "attendance", "leaves" and
        # "payroll" entries removed — no code reads or writes those bare-name
        # collections (the live ones are hrm_employees / partner_payouts /
        # hrm_attendance / hrm_leaves / hrm_payroll); keeping them here only
        # provisioned empty ghost collections in every new tenant DB.

        # One create_indexes() call per collection, and all collections run
        # concurrently — each collection's indexes are independent of every
        # other collection's (different, brand-new, empty collections), so
        # there is no ordering requirement between them. This turns ~23
        # sequential Atlas round-trips into a single concurrent batch.
        await asyncio.gather(*[
            db[collection_name].create_indexes(index_models)
            for collection_name, index_models in collections_indexes.items()
        ])

        logger.info("✅ Company database created: c_%s", company_id.replace("-", ""))
        return db

    @classmethod
    async def ensure_indexes(cls, company_id: str) -> None:
        """
        Idempotently create/update indexes for an existing company DB.
        Safe to call on startup for all tenants — MongoDB skips existing indexes.

        `create_company_database` and `ensure_company_indexes` cover different,
        independently-useful sets of indexes (e.g. applications' duplicate-guard
        unique index lives only in the latter). They are intentionally isolated
        with their own try/except: a legacy index-name conflict on one
        collection (e.g. from a pre-migration schema) must not silently skip
        index maintenance for every other collection, including ones critical
        to correctness (like the applications uniqueness guard).
        """
        try:
            await cls.create_company_database(company_id)
        except Exception as _base_err:
            logger.warning("Base company index init failed for %s: %s", company_id, _base_err)
        try:
            from app.core.indexes import ensure_company_indexes
            db = cls.get_company_db(company_id)
            await ensure_company_indexes(db)
        except Exception as _idx_err:
            logger.warning("Company index init failed for %s: %s", company_id, _idx_err)

    @classmethod
    async def delete_company_database(cls, company_id: str) -> bool:
        """
        Delete a company database permanently.
        Resolves the correct DB name (new or legacy format) before dropping.
        Returns True if deleted, False if the database did not exist.
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        db_name = await cls.resolve_company_db_name(company_id)
        existing = await cls.client.list_database_names()
        if db_name not in existing:
            logger.warning(
                "⚠️ Company database not found (already removed?): %s", db_name
            )
            # Evict stale cache entry so future accesses use fresh format
            cls._db_name_cache.pop(company_id, None)
            return False
        await cls.client.drop_database(db_name)
        cls._db_name_cache.pop(company_id, None)
        logger.warning("⚠️ Company database permanently deleted: %s", db_name)
        return True


# Convenience functions
async def connect_to_mongo():
    """Connect to MongoDB - called at application startup"""
    await DatabaseManager.connect()


async def close_mongo_connection():
    """Close MongoDB connection - called at application shutdown"""
    await DatabaseManager.close()


def get_master_db() -> AsyncIOMotorDatabase:
    """Get master database instance"""
    return DatabaseManager.get_master_db()


def get_company_db(company_id: str) -> AsyncIOMotorDatabase:
    """Get company database instance by company_id"""
    return DatabaseManager.get_company_db(company_id)