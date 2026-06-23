"""
MongoDB Database Connection Manager
Handles master_db and dynamic company_db connections with tenant isolation
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Any, ClassVar
import logging

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
            cls.client = AsyncIOMotorClient(settings.MONGODB_URI)
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
        Create and initialize a new company database
        Called during company registration
        """
        db = await cls.resolve_and_get_company_db(company_id)
        
        # Create required collections with indexes
        collections_config = {
            "users": [
                {"keys": [("email", 1)], "unique": True, "sparse": True},
                {"keys": [("mobile", 1)], "unique": True, "sparse": True},
                {"keys": [("username", 1)], "unique": True, "sparse": True},
                {"keys": [("role", 1)]},
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("role", 1)]},
            ],
            "roles": [
                {"keys": [("name", 1)], "unique": True},
            ],
            "permissions": [
                {"keys": [("code", 1)], "unique": True},
            ],
            "audit_logs": [
                {"keys": [("created_at", -1)]},
                {"keys": [("user_id", 1)]},
                {"keys": [("action", 1)]},
                {"keys": [("entity_type", 1), ("entity_id", 1)]},
            ],
            "notifications": [
                {"keys": [("user_id", 1), ("is_read", 1)]},
                {"keys": [("created_at", -1)]},
            ],
            # ── Recruitment core ───────────────────────────────────────────────
            "candidates": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
                {"keys": [("is_deleted", 1), ("created_by", 1), ("created_at", -1)]},
                {"keys": [("is_deleted", 1), ("partner_id", 1)]},
                {"keys": [("email", 1)], "sparse": True},
                {"keys": [("skill_tags", 1)]},
                # Text index enables $text search (much faster than $regex)
                {"keys": [("full_name", "text"), ("email", "text"),
                          ("skill_tags", "text"), ("current_company", "text"),
                          ("current_designation", "text"), ("current_city", "text")],
                 "text": True},
            ],
            "jobs": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("client_id", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
            ],
            "applications": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("candidate_id", 1)]},
                {"keys": [("is_deleted", 1), ("job_id", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
                # Compound for duplicate-application detection
                {"keys": [("candidate_id", 1), ("job_id", 1), ("is_deleted", 1)]},
            ],
            "interviews": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("candidate_id", 1)]},
                {"keys": [("is_deleted", 1), ("job_id", 1)]},
                {"keys": [("is_deleted", 1), ("application_id", 1)]},
                {"keys": [("is_deleted", 1), ("interviewer_ids", 1)]},
                {"keys": [("is_deleted", 1), ("scheduled_date", 1)]},
                {"keys": [("is_deleted", 1), ("scheduled_at", -1)]},
            ],
            "clients": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
            ],
            "onboards": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
            ],
            "payouts": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("is_deleted", 1), ("partner_id", 1)]},
                {"keys": [("is_deleted", 1), ("created_at", -1)]},
            ],
            "targets": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("user_id", 1)]},
            ],
            "departments": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("name", 1)]},
            ],
            "designations": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("name", 1)]},
            ],
            # ── HRM ────────────────────────────────────────────────────────────
            "employees": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("employee_id", 1)], "sparse": True},
            ],
            "hrm_employees": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("is_deleted", 1), ("status", 1)]},
                {"keys": [("company_id", 1), ("is_deleted", 1)]},
                {"keys": [("email", 1), ("company_id", 1)], "sparse": True},
                {"keys": [("employee_id", 1), ("company_id", 1)], "sparse": True},
            ],
            "hrm_assets": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("company_id", 1), ("is_deleted", 1)]},
                {"keys": [("company_id", 1), ("status", 1), ("is_deleted", 1)]},
                {"keys": [("asset_tag", 1), ("company_id", 1)], "unique": True, "sparse": True},
                {"keys": [("assigned_to_id", 1), ("company_id", 1)], "sparse": True},
                {"keys": [("public_token", 1)], "unique": True, "sparse": True},
            ],
            "hrm_exit": [
                {"keys": [("is_deleted", 1)]},
                {"keys": [("company_id", 1), ("is_deleted", 1)]},
                {"keys": [("company_id", 1), ("status", 1), ("is_deleted", 1)]},
                {"keys": [("employee_id", 1), ("company_id", 1), ("is_deleted", 1)]},
            ],
            "hrm_doc_upload_tokens": [
                {"keys": [("token", 1)], "unique": True, "sparse": True},
                {"keys": [("company_id", 1), ("employee_id", 1)]},
                {"keys": [("company_id", 1), ("status", 1)]},
                {"keys": [("expires_at", 1)], "sparse": True},
            ],
            "attendance": [
                {"keys": [("employee_id", 1), ("date", -1)]},
                {"keys": [("date", -1)]},
            ],
            "leaves": [
                {"keys": [("employee_id", 1)]},
                {"keys": [("status", 1)]},
            ],
            "payroll": [
                {"keys": [("employee_id", 1), ("month", -1)]},
            ],
        }

        for collection_name, indexes in collections_config.items():
            collection = db[collection_name]
            for index_config in indexes:
                if index_config.get("text"):
                    # Text indexes use a different create_index signature
                    await collection.create_index(index_config["keys"])
                else:
                    await collection.create_index(
                        index_config["keys"],
                        unique=index_config.get("unique", False),
                        sparse=index_config.get("sparse", False),
                    )
        
        logger.info("✅ Company database created: c_%s", company_id.replace("-", ""))
        return db

    @classmethod
    async def ensure_indexes(cls, company_id: str) -> None:
        """
        Idempotently create/update indexes for an existing company DB.
        Safe to call on startup for all tenants — MongoDB skips existing indexes.
        """
        await cls.create_company_database(company_id)

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