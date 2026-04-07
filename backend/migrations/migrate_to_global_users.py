"""
Migration: Populate global_users + user_company_map
=====================================================
Run ONCE against a live (or restored) MongoDB instance to back-fill the two
new master_db collections introduced in the global-authentication feature.

Usage (from the backend/ directory):
    python -m migrations.migrate_to_global_users

What it does
------------
For every non-cancelled, non-deleted tenant in master_db.tenants:

  1. Reads the tenant's owner record (stored inline in master_db.tenants.owner)
     and the full owner document from company_db.users.
  2. For each non-deleted user in company_db.users:
     a. Upserts a global_users record keyed on the user's email.
        - If the same email already exists (e.g. a shared email across companies),
          the password_hash is NOT overwritten — the existing record wins.
          This preserves whichever password the user last changed.
     b. Inserts a user_company_map entry linking (global_user_id ↔ company_id ↔ local_user_id).
        Duplicate (global_user_id, company_id) pairs are silently skipped via upsert.

Idempotent
----------
Re-running the script is safe. Every write uses upsert / $setOnInsert so
existing records are never overwritten.

Error handling
--------------
Errors for a single company are logged and skipped; the script continues
with the remaining tenants so a single bad tenant can't abort the whole run.

Dry run
-------
Pass --dry-run to log what would be done without writing anything.
"""

import asyncio
import argparse
import logging
import sys
import uuid
from datetime import datetime, timezone

# ---------------------------------------------------------------------------
# Bootstrap: add the backend root to sys.path so app.* imports resolve
# ---------------------------------------------------------------------------
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.models.master.global_user import ensure_global_indexes

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("migrate_global_users")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _company_db_name(company_id: str) -> str:
    return f"company_{company_id}_db"


async def _upsert_global_user_no_overwrite(
    master_db, *, email: str, mobile: str | None, password_hash: str, dry_run: bool
) -> str:
    """
    Create a global_users record if none exists for this email.
    If one exists, leave the password_hash alone (user may have changed it).
    Returns the global_user _id.
    """
    email_norm = email.lower().strip()
    existing = await master_db.global_users.find_one({"email": email_norm})
    if existing:
        return str(existing["_id"])

    new_id = str(uuid.uuid4())
    if not dry_run:
        await master_db.global_users.insert_one({
            "_id":                   new_id,
            "email":                 email_norm,
            "mobile":                mobile,
            "password_hash":         password_hash,
            "is_active":             True,
            "failed_login_attempts": 0,
            "last_login":            None,
            "created_at":            datetime.now(timezone.utc),
            "updated_at":            datetime.now(timezone.utc),
        })
    return new_id


async def _ensure_ucm(
    master_db, *, global_user_id: str, company_id: str,
    local_user_id: str, role: str, is_owner: bool, dry_run: bool
) -> bool:
    """Insert user_company_map if the pair doesn't exist yet. Returns True if inserted."""
    existing = await master_db.user_company_map.find_one(
        {"global_user_id": global_user_id, "company_id": company_id}
    )
    if existing:
        return False
    if not dry_run:
        await master_db.user_company_map.insert_one({
            "_id":            str(uuid.uuid4()),
            "global_user_id": global_user_id,
            "company_id":     company_id,
            "local_user_id":  local_user_id,
            "role":           role,
            "is_owner":       is_owner,
            "status":         "active",
            "created_at":     datetime.now(timezone.utc),
        })
    return True


# ---------------------------------------------------------------------------
# Per-tenant migration
# ---------------------------------------------------------------------------

async def migrate_tenant(client, master_db, tenant: dict, dry_run: bool) -> dict:
    """
    Migrate one tenant.
    Returns a stats dict: {users_seen, gu_created, ucm_created, errors}.
    """
    company_id   = tenant.get("company_id", "")
    company_name = tenant.get("company_name", company_id)
    stats = {"users_seen": 0, "gu_created": 0, "ucm_created": 0, "errors": 0}

    if not company_id:
        logger.warning("Tenant %s has no company_id — skipped", tenant.get("_id"))
        return stats

    try:
        db_name    = _company_db_name(company_id)
        company_db = client[db_name]

        users_cursor = company_db.users.find({"is_deleted": False})
        async for user in users_cursor:
            stats["users_seen"] += 1
            email    = (user.get("email") or "").strip()
            mobile   = user.get("mobile") or None
            pw_hash  = user.get("password_hash", "")
            user_id  = str(user.get("_id", ""))
            role     = user.get("role", "admin")
            is_owner = bool(user.get("is_owner", False))

            if not email or not pw_hash:
                logger.warning(
                    "  [%s] User %s missing email or password_hash — skipped",
                    company_name, user_id,
                )
                stats["errors"] += 1
                continue

            # For owners, prefer the password_hash from master_db.tenants.owner
            # (that's the authoritative copy for owners at login time).
            if is_owner:
                owner_ph = tenant.get("owner", {}).get("password_hash", "")
                if owner_ph:
                    pw_hash = owner_ph

            try:
                action = "CREATE" if dry_run else "→"
                gu_id = await _upsert_global_user_no_overwrite(
                    master_db,
                    email=email,
                    mobile=mobile,
                    password_hash=pw_hash,
                    dry_run=dry_run,
                )
                # Check if it's new (simple heuristic: look it up)
                if not dry_run:
                    gu_doc = await master_db.global_users.find_one({"email": email.lower()})
                    if gu_doc and str(gu_doc.get("created_at", ""))[:19] == str(datetime.now(timezone.utc))[:19]:
                        stats["gu_created"] += 1
                else:
                    stats["gu_created"] += 1  # in dry-run assume created

                ucm_new = await _ensure_ucm(
                    master_db,
                    global_user_id=gu_id,
                    company_id=company_id,
                    local_user_id=user_id,
                    role=role,
                    is_owner=is_owner,
                    dry_run=dry_run,
                )
                if ucm_new:
                    stats["ucm_created"] += 1

                logger.debug(
                    "  [%s] %s user=%s email=%s owner=%s gu_id=%s ucm_new=%s",
                    company_name, action, user_id, email, is_owner, gu_id, ucm_new,
                )

            except Exception as user_err:
                logger.error(
                    "  [%s] Failed to migrate user %s (%s): %s",
                    company_name, user_id, email, user_err,
                )
                stats["errors"] += 1

    except Exception as tenant_err:
        logger.error("Tenant %s (%s) failed: %s", company_name, company_id, tenant_err)
        stats["errors"] += 1

    return stats


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

async def run(dry_run: bool) -> None:
    logger.info("=" * 60)
    logger.info("Global-users migration  |  dry_run=%s", dry_run)
    logger.info("=" * 60)

    client     = AsyncIOMotorClient(settings.MONGODB_URI)
    master_db  = client[settings.MASTER_DB_NAME]

    # Ensure indexes exist before writing (idempotent)
    if not dry_run:
        await ensure_global_indexes(master_db)
        logger.info("Indexes ensured on global_users and user_company_map")

    # Skip cancelled / deleted tenants
    EXCLUDED_STATUSES = {"cancelled"}
    tenants_cursor = master_db.tenants.find({
        "is_deleted": {"$ne": True},
        "status":     {"$nin": list(EXCLUDED_STATUSES)},
    })

    total_stats = {"tenants": 0, "users_seen": 0, "gu_created": 0, "ucm_created": 0, "errors": 0}

    async for tenant in tenants_cursor:
        company_name = tenant.get("company_name", tenant.get("company_id", "?"))
        logger.info("Processing tenant: %s (%s)", company_name, tenant.get("company_id"))
        stats = await migrate_tenant(client, master_db, tenant, dry_run)
        total_stats["tenants"]    += 1
        total_stats["users_seen"] += stats["users_seen"]
        total_stats["gu_created"] += stats["gu_created"]
        total_stats["ucm_created"]+= stats["ucm_created"]
        total_stats["errors"]     += stats["errors"]
        logger.info(
            "  → users=%d  gu_created=%d  ucm_created=%d  errors=%d",
            stats["users_seen"], stats["gu_created"], stats["ucm_created"], stats["errors"],
        )

    logger.info("=" * 60)
    logger.info("Migration complete")
    logger.info("  Tenants processed : %d", total_stats["tenants"])
    logger.info("  Users seen        : %d", total_stats["users_seen"])
    logger.info("  global_users new  : %d", total_stats["gu_created"])
    logger.info("  user_company_map  : %d", total_stats["ucm_created"])
    logger.info("  Errors            : %d", total_stats["errors"])
    if dry_run:
        logger.info("  *** DRY RUN — no data was written ***")
    logger.info("=" * 60)

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate existing users to global_users + user_company_map")
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Log what would be done without writing to the database",
    )
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))
