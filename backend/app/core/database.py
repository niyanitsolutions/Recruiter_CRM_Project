"""
MongoDB Database Connection Manager
Handles master_db and dynamic company_db connections with tenant isolation
"""
from __future__ import annotations

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Any, ClassVar
import logging

from app.core.config import settings, get_company_db_name

logger = logging.getLogger(__name__)


class DatabaseManager:
    """
    MongoDB Connection Manager
    
    Architecture:
    - ONE MongoDB cluster
    - ONE master_db (SuperAdmin: Tenants, Plans, Payments)
    - ONE database per company (company_<id>_db)
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
    
    @classmethod
    def get_company_db(cls, company_id: str) -> AsyncIOMotorDatabase:
        """
        Get company-specific database connection
        
        CRITICAL: This enforces tenant isolation
        Each company has its own database with:
        - users
        - candidates
        - jobs
        - interviews
        - onboards
        - partners
        - invoices
        - audit_logs
        - notifications
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        db_name = get_company_db_name(company_id)
        return cls.client[db_name]
    
    @classmethod
    async def create_company_database(cls, company_id: str) -> AsyncIOMotorDatabase:
        """
        Create and initialize a new company database
        Called during company registration
        """
        db = cls.get_company_db(company_id)
        
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
        
        logger.info("✅ Company database created: company_%s_db", company_id)
        return db

    @classmethod
    async def ensure_indexes(cls, company_id: str) -> None:
        """
        Idempotently create/update indexes for an existing company DB.
        Safe to call on startup for all tenants — MongoDB skips existing indexes.
        """
        await cls.create_company_database(company_id)

    @classmethod
    async def delete_company_database(cls, company_id: str):
        """
        Delete a company database (soft delete preferred in production)
        Used only by SuperAdmin for complete tenant removal
        """
        if cls.client is None:
            raise RuntimeError("Database not connected. Call connect() first.")
        db_name = get_company_db_name(company_id)
        await cls.client.drop_database(db_name)
        logger.warning("⚠️ Company database deleted: %s", db_name)


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