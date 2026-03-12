"""
Database Seed Script
Initialize the database with default data
"""

import asyncio
import sys
import os
from datetime import datetime, timezone
import uuid

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.database import connect_to_mongo, close_mongo_connection, get_master_db
from app.core.security import hash_password
from app.models.master.plan import DEFAULT_PLANS, PlanStatus
from app.models.master.super_admin import SuperAdminStatus


async def seed_plans():
    """Seed default subscription plans"""
    master_db = get_master_db()
    
    print("🌱 Seeding plans...")
    
    for plan_data in DEFAULT_PLANS:
        existing = await master_db.plans.find_one({"name": plan_data["name"]})
        if existing:
            print(f"  ⏭️  Plan '{plan_data['name']}' already exists")
            continue
        
        plan = {
            "_id": str(uuid.uuid4()),
            **plan_data,
            "status": PlanStatus.ACTIVE,
            "features": [],
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc)
        }
        
        await master_db.plans.insert_one(plan)
        print(f"  ✅ Created plan: {plan_data['name']}")
    
    print("✅ Plans seeded successfully")


async def seed_super_admin():
    """Seed default SuperAdmin user"""
    master_db = get_master_db()
    
    print("🌱 Seeding SuperAdmin...")
    
    existing = await master_db.super_admins.find_one({"username": "superadmin"})
    if existing:
        print("  ⏭️  SuperAdmin already exists")
        return
    
    super_admin = {
        "_id": str(uuid.uuid4()),
        "username": "superadmin",
        "email": "superadmin@crm.local",
        "full_name": "Super Administrator",
        "mobile": "+919999999999",
        "password_hash": hash_password("SuperAdmin@123"),
        "status": SuperAdminStatus.ACTIVE,
        "is_primary": True,
        "permissions": [
            "tenants:read",
            "tenants:write",
            "tenants:delete",
            "plans:read",
            "plans:write",
            "payments:read",
            "analytics:read",
            "super_admins:read",
            "super_admins:write"
        ],
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc),
        "created_by": "system",
        "is_deleted": False
    }
    
    await master_db.super_admins.insert_one(super_admin)
    print("  ✅ Created SuperAdmin")
    print("     Username: superadmin")
    print("     Password: SuperAdmin@123")
    print("     ⚠️  Change this password immediately in production!")
    
    print("✅ SuperAdmin seeded successfully")


async def create_indexes():
    """Create database indexes"""
    master_db = get_master_db()
    
    print("🔧 Creating indexes...")
    
    # Tenants indexes
    await master_db.tenants.create_index([("company_id", 1)], unique=True)
    await master_db.tenants.create_index([("owner.email", 1)])
    await master_db.tenants.create_index([("owner.username", 1)])
    await master_db.tenants.create_index([("owner.mobile", 1)])
    await master_db.tenants.create_index([("status", 1)])
    await master_db.tenants.create_index([("is_deleted", 1)])
    print("  ✅ Tenants indexes created")
    
    # Plans indexes
    await master_db.plans.create_index([("name", 1)], unique=True)
    await master_db.plans.create_index([("status", 1)])
    print("  ✅ Plans indexes created")
    
    # Payments indexes
    await master_db.payments.create_index([("tenant_id", 1)])
    await master_db.payments.create_index([("company_id", 1)])
    await master_db.payments.create_index([("razorpay_order_id", 1)])
    await master_db.payments.create_index([("status", 1)])
    await master_db.payments.create_index([("created_at", -1)])
    print("  ✅ Payments indexes created")
    
    # SuperAdmins indexes
    await master_db.super_admins.create_index([("username", 1)], unique=True)
    await master_db.super_admins.create_index([("email", 1)], unique=True)
    print("  ✅ SuperAdmins indexes created")
    
    print("✅ All indexes created successfully")


async def main():
    """Main seed function"""
    print("=" * 50)
    print("🚀 CRM Database Seed Script")
    print("=" * 50)
    
    try:
        # Connect to database
        print("\n📡 Connecting to MongoDB...")
        await connect_to_mongo()
        print("✅ Connected to MongoDB")
        
        # Run seeds
        print("\n" + "-" * 50)
        await create_indexes()
        
        print("\n" + "-" * 50)
        await seed_plans()
        
        print("\n" + "-" * 50)
        await seed_super_admin()
        
        print("\n" + "=" * 50)
        print("🎉 Database seeding completed successfully!")
        print("=" * 50)
        
    except Exception as e:
        print(f"\n❌ Error: {e}")
        raise
    finally:
        await close_mongo_connection()


if __name__ == "__main__":
    asyncio.run(main())