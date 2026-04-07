"""
Migration: Backfill override_permissions on existing company users
==================================================================
Before this fix, users created via UserForm had a custom permissions[]
list stored in the DB but override_permissions was never set (defaulted
to False / missing).  At login, _resolve_effective_permissions() would
see override_permissions=False and fall back to ROLE_PERMISSIONS["admin"],
giving admin-role users ALL permissions regardless of their saved list.

This script sets:
  override_permissions = True   for every user who has a non-empty
                                permissions[] that differs from the full
                                admin default set (i.e. they have a
                                customised list).
  override_permissions = False  for users whose permissions[] matches
                                the admin default exactly (no custom config).

Owners always have override_permissions = False because their access is
governed entirely by the is_owner flag — not the permissions list.

Usage (from backend/ directory):
    python -m migrations.backfill_override_permissions
    python -m migrations.backfill_override_permissions --dry-run
"""

import asyncio
import argparse
import logging
import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from motor.motor_asyncio import AsyncIOMotorClient
from app.core.config import settings
from app.models.company.user import ROLE_PERMISSIONS

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger("backfill_override_permissions")

# The full admin permission set — users whose stored list equals this
# have no customisation, so override_permissions should be False.
ADMIN_FULL = set(ROLE_PERMISSIONS.get("admin", []))


def _company_db_name(company_id: str) -> str:
    return f"company_{company_id}_db"


async def process_tenant(client, tenant: dict, dry_run: bool) -> dict:
    company_id = tenant.get("company_id", "")
    stats = {"seen": 0, "set_true": 0, "set_false": 0, "skipped_owner": 0, "errors": 0}

    if not company_id:
        return stats

    try:
        db = client[_company_db_name(company_id)]
        cursor = db.users.find({"is_deleted": False})

        async for user in cursor:
            stats["seen"] += 1
            user_id = str(user.get("_id", ""))

            # Owners: override_permissions must be False — is_owner flag grants all access
            if user.get("is_owner"):
                if user.get("override_permissions") is not False:
                    if not dry_run:
                        await db.users.update_one(
                            {"_id": user_id},
                            {"$set": {"override_permissions": False}},
                        )
                    logger.debug("  [%s] owner %s → override_permissions=False", company_id, user_id)
                stats["skipped_owner"] += 1
                continue

            stored_perms = set(user.get("permissions") or [])
            role = user.get("role", "")

            # A user has a custom permission set when:
            # 1. They have permissions stored AND
            # 2. The list is not identical to the default for their role
            role_default = set(ROLE_PERMISSIONS.get(role, []))
            has_custom = bool(stored_perms) and stored_perms != role_default

            new_val = has_custom  # True = custom list, False = role-driven

            current_val = user.get("override_permissions")
            if current_val == new_val:
                continue  # already correct

            if not dry_run:
                await db.users.update_one(
                    {"_id": user_id},
                    {"$set": {"override_permissions": new_val}},
                )
            if new_val:
                stats["set_true"] += 1
                logger.debug("  [%s] user %s role=%s → override_permissions=True (custom perms)", company_id, user_id, role)
            else:
                stats["set_false"] += 1
                logger.debug("  [%s] user %s role=%s → override_permissions=False (matches role default)", company_id, user_id, role)

    except Exception as e:
        logger.error("Tenant %s failed: %s", company_id, e)
        stats["errors"] += 1

    return stats


async def run(dry_run: bool) -> None:
    logger.info("=" * 60)
    logger.info("Backfill override_permissions  |  dry_run=%s", dry_run)
    logger.info("=" * 60)

    client    = AsyncIOMotorClient(settings.MONGODB_URI)
    master_db = client[settings.MASTER_DB_NAME]

    cursor = master_db.tenants.find({"is_deleted": {"$ne": True}})

    totals = {"tenants": 0, "seen": 0, "set_true": 0, "set_false": 0, "skipped_owner": 0, "errors": 0}

    async for tenant in cursor:
        name = tenant.get("company_name", tenant.get("company_id", "?"))
        logger.info("Processing: %s (%s)", name, tenant.get("company_id"))
        stats = await process_tenant(client, tenant, dry_run)
        totals["tenants"]       += 1
        totals["seen"]          += stats["seen"]
        totals["set_true"]      += stats["set_true"]
        totals["set_false"]     += stats["set_false"]
        totals["skipped_owner"] += stats["skipped_owner"]
        totals["errors"]        += stats["errors"]
        logger.info(
            "  → seen=%d  set_true=%d  set_false=%d  owners_skipped=%d  errors=%d",
            stats["seen"], stats["set_true"], stats["set_false"],
            stats["skipped_owner"], stats["errors"],
        )

    logger.info("=" * 60)
    logger.info("Done")
    logger.info("  Tenants   : %d", totals["tenants"])
    logger.info("  Users seen: %d", totals["seen"])
    logger.info("  Set True  : %d  (custom permission lists honoured at login)", totals["set_true"])
    logger.info("  Set False : %d  (reverted to role-driven defaults)", totals["set_false"])
    logger.info("  Owners    : %d  (skipped — is_owner flag governs access)", totals["skipped_owner"])
    logger.info("  Errors    : %d", totals["errors"])
    if dry_run:
        logger.info("  *** DRY RUN — no data was written ***")
    logger.info("=" * 60)

    client.close()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Backfill override_permissions on existing users")
    parser.add_argument("--dry-run", action="store_true", help="Log changes without writing")
    args = parser.parse_args()
    asyncio.run(run(dry_run=args.dry_run))
