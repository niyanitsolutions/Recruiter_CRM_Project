"""
migrate_existing_data.py
========================
One-time (idempotent) migration that backfills every company database
AND the master database so that ALL existing documents have the same
fields that new documents receive.

Why this is needed
------------------
MongoDB is schema-less.  When we add a new field to the Python model
(e.g. profile_completed, must_change_password, user_type) and set a
default in Python code, that default ONLY applies to documents created
AFTER the code change.  Every document created before the change has no
field at all in MongoDB.

At read-time, Python compensates with  .get("field", default), but:
  - The frontend gets the raw JSON — missing keys behave differently
    from explicit True/False.
  - Search/filter queries on missing fields behave differently from
    queries on False fields.
  - Any future migration that checks the field value would be wrong.

This script uses  $exists: false  conditions so it is completely
idempotent — re-running it never overwrites values that were explicitly
set by the application.

Usage
-----
From the project root:
    python -m backend.migrations.migrate_existing_data

Or from the backend/ directory:
    python -m migrations.migrate_existing_data

Environment
-----------
Reads MONGODB_URI and MASTER_DB_NAME from the same .env / settings
that the FastAPI app uses.
"""

import asyncio
import random
import re
import sys
import logging
from datetime import datetime, timezone

from motor.motor_asyncio import AsyncIOMotorClient

# ── Allow running from either project root or backend/ dir ────────────────────
import os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.core.config import settings, get_company_db_name   # noqa: E402

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("migration")


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _generate_dept_code(name: str) -> str:
    """Same logic used in department_service.py."""
    words    = re.split(r"\s+", name.strip())
    initials = "".join(w[0].upper() for w in words if w)
    if not initials:
        initials = re.sub(r"[^A-Z]", "", name.upper())[:3] or "DEPT"
    return initials + str(random.randint(100, 999))


async def _migrate_users(company_db, company_id: str) -> dict:
    """
    Backfill missing fields on every user document in a company DB.

    Rules
    -----
    profile_completed   missing → True   (existing users already have data)
    must_change_password missing → False  (existing users are already active)
    user_type           missing → derived from role ("partner" if role=="partner",
                                  else "internal")
    is_deleted          missing → False
    override_permissions missing → False
    login_count         missing → 0
    failed_login_attempts missing → 0
    """
    col     = company_db.users
    counts  = {}

    # ── profile_completed ─────────────────────────────────────────────────────
    r = await col.update_many(
        {"profile_completed": {"$exists": False}},
        {"$set": {"profile_completed": True}},
    )
    counts["profile_completed"] = r.modified_count

    # ── must_change_password ──────────────────────────────────────────────────
    r = await col.update_many(
        {"must_change_password": {"$exists": False}},
        {"$set": {"must_change_password": False}},
    )
    counts["must_change_password"] = r.modified_count

    # ── user_type (use aggregation pipeline so we can read `role` per-doc) ────
    r = await col.update_many(
        {"user_type": {"$exists": False}},
        [
            {
                "$set": {
                    "user_type": {
                        "$cond": {
                            "if":   {"$eq": ["$role", "partner"]},
                            "then": "partner",
                            "else": "internal",
                        }
                    }
                }
            }
        ],
    )
    counts["user_type"] = r.modified_count

    # ── is_deleted ────────────────────────────────────────────────────────────
    r = await col.update_many(
        {"is_deleted": {"$exists": False}},
        {"$set": {"is_deleted": False}},
    )
    counts["is_deleted"] = r.modified_count

    # ── override_permissions ──────────────────────────────────────────────────
    r = await col.update_many(
        {"override_permissions": {"$exists": False}},
        {"$set": {"override_permissions": False}},
    )
    counts["override_permissions"] = r.modified_count

    # ── login_count ───────────────────────────────────────────────────────────
    r = await col.update_many(
        {"login_count": {"$exists": False}},
        {"$set": {"login_count": 0}},
    )
    counts["login_count"] = r.modified_count

    # ── failed_login_attempts ─────────────────────────────────────────────────
    r = await col.update_many(
        {"failed_login_attempts": {"$exists": False}},
        {"$set": {"failed_login_attempts": 0}},
    )
    counts["failed_login_attempts"] = r.modified_count

    return counts


async def _migrate_departments(company_db, company_id: str) -> dict:
    """
    Backfill missing `code` field on department documents.
    Each department gets a unique auto-generated code (initials + 3-digit number).
    """
    col    = company_db.departments
    counts = {"code": 0}

    cursor = col.find({"code": {"$exists": False}, "is_deleted": {"$ne": True}})
    async for dept in cursor:
        code = _generate_dept_code(dept.get("name", "DEPT"))
        # Ensure uniqueness within this company DB
        while await col.find_one({"code": code, "_id": {"$ne": dept["_id"]}}):
            code = _generate_dept_code(dept.get("name", "DEPT"))
        await col.update_one({"_id": dept["_id"]}, {"$set": {"code": code}})
        counts["code"] += 1

    return counts


async def _migrate_master_tenants(master_db) -> dict:
    """
    Backfill missing fields on master_db.tenants documents themselves
    (not the owner sub-document — that is handled via the company DB).
    """
    col    = master_db.tenants
    counts = {}

    # is_deleted
    r = await col.update_many(
        {"is_deleted": {"$exists": False}},
        {"$set": {"is_deleted": False}},
    )
    counts["is_deleted"] = r.modified_count

    # email_verified (older tenants created before this field was added)
    r = await col.update_many(
        {"email_verified": {"$exists": False}},
        {"$set": {"email_verified": True}},   # existing = already verified
    )
    counts["email_verified"] = r.modified_count

    return counts


# ─────────────────────────────────────────────────────────────────────────────
# Main entry point
# ─────────────────────────────────────────────────────────────────────────────

async def run_migration():
    log.info("=" * 60)
    log.info("  CRM Multi-Tenant Data Migration")
    log.info("  Target : %s", settings.MONGODB_URI)
    log.info("  Master : %s", settings.MASTER_DB_NAME)
    log.info("=" * 60)

    client     = AsyncIOMotorClient(settings.MONGODB_URI)
    master_db  = client[settings.MASTER_DB_NAME]

    # ── 1. Master DB ──────────────────────────────────────────────────────────
    log.info("\n[master_db] Migrating tenants collection …")
    master_counts = await _migrate_master_tenants(master_db)
    for field, n in master_counts.items():
        log.info("  %-30s  %d documents updated", field, n)

    # ── 2. Each company DB ────────────────────────────────────────────────────
    tenants_cursor = master_db.tenants.find({"is_deleted": {"$ne": True}})
    tenants        = await tenants_cursor.to_list(length=None)

    log.info("\nFound %d active tenant(s) to migrate.\n", len(tenants))

    total_users = 0
    total_depts = 0

    for tenant in tenants:
        company_id   = tenant.get("company_id")
        company_name = tenant.get("company_name", company_id)

        if not company_id:
            log.warning("  Tenant missing company_id — skipping: %s", tenant.get("_id"))
            continue

        db_name    = get_company_db_name(company_id)
        company_db = client[db_name]

        log.info("─── %s  (%s)", company_name, db_name)

        # Users
        user_counts = await _migrate_users(company_db, company_id)
        u_changed   = sum(user_counts.values())
        total_users += u_changed
        for field, n in user_counts.items():
            if n:
                log.info("  users.%-26s  %d updated", field, n)

        # Departments
        dept_counts = await _migrate_departments(company_db, company_id)
        d_changed   = sum(dept_counts.values())
        total_depts += d_changed
        for field, n in dept_counts.items():
            if n:
                log.info("  departments.%-22s  %d updated", field, n)

        if u_changed == 0 and d_changed == 0:
            log.info("  (nothing to migrate — all fields already present)")

    # ── Summary ───────────────────────────────────────────────────────────────
    log.info("\n" + "=" * 60)
    log.info("  Migration complete")
    log.info("  Total user field updates : %d", total_users)
    log.info("  Total dept field updates : %d", total_depts)
    log.info("=" * 60)

    client.close()


if __name__ == "__main__":
    asyncio.run(run_migration())
