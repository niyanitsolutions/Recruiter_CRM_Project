"""
MongoDB Database Connection Manager
Handles master_db and dynamic company_db connections with tenant isolation
"""

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase
from typing import Optional
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
    
    client: Optional[AsyncIOMotorClient] = None
    
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
                {"keys": [("email", 1)], "unique": True},
                {"keys": [("mobile", 1)], "unique": True},
                {"keys": [("username", 1)], "unique": True},
                {"keys": [("role", 1)]},
                {"keys": [("is_deleted", 1)]},
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
        }
        
        for collection_name, indexes in collections_config.items():
            collection = db[collection_name]
            for index_config in indexes:
                await collection.create_index(
                    index_config["keys"],
                    unique=index_config.get("unique", False)
                )
        
        logger.info(f"✅ Company database created: company_{company_id}_db")
        return db
    
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
        logger.warning(f"⚠️ Company database deleted: {db_name}")


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