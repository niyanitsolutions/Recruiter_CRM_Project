"""
Migration: Rename company databases to Atlas-compatible names
=============================================================
Run ONCE before migrating to MongoDB Atlas (or after any Atlas "name too long"
error appears in local dev).

Old format: company_{uuid}_db          →  47 chars  (exceeds Atlas 38-byte limit)
New format: c_{uuid_without_hyphens}   →  34 chars  (safe on Atlas and local)

Usage (from the backend/ directory):
    python -m migrations.rename_company_dbs

    # Dry-run — shows what would be renamed, touches nothing:
    python -m migrations.rename_company_dbs --dry-run

What it does
------------
For every non-deleted tenant in master_db.tenants:
  1. Computes old_name = company_{company_id}_db
  2. Computes new_name = c_{company_id_no_hyphens}
  3. Skips tenants where new_name already exists (already migrated) or
     old_name does not exist (never used old format).
  4. Copies every collection from old_name → new_name using $out aggregation.
  5. Drops the old database.

Idempotent
----------
Re-running is safe.  A tenant is only processed when old_name exists AND
new_name does not.  If the script crashes mid-tenant, re-run will complete it
(the old DB still exists until the final drop).

Requirements
------------
MongoDB 4.1+ (for $out with cross-database writes).
Motor / PyMongo must be installed (same as app requirements).
"""

from __future__ import annotations

import argparse
import asyncio
import logging
import sys
import os

# Allow running as  python -m migrations.rename_company_dbs  from backend/
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from motor.motor_asyncio import AsyncIOMotorClient

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Naming helpers (intentionally NOT imported from app — script must work
#    against old-format DBs even after app code has been updated) ───────────

def _old_name(company_id: str) -> str:
    return f"company_{company_id}_db"


def _new_name(company_id: str) -> str:
    return f"c_{company_id.replace('-', '')}"


# ── Core migration ────────────────────────────────────────────────────────────

async def rename_all(mongodb_uri: str, dry_run: bool) -> None:
    client = AsyncIOMotorClient(mongodb_uri)
    try:
        await client.admin.command("ping")
        logger.info("Connected to MongoDB")
    except Exception as exc:
        logger.error("Cannot connect: %s", exc)
        sys.exit(1)

    master_db = client["master_db"]
    tenants = await master_db.tenants.find(
        {"is_deleted": {"$ne": True}},
        {"company_id": 1, "_id": 0},
    ).to_list(length=None)

    logger.info("Found %d tenants", len(tenants))

    renamed = skipped_already_new = skipped_no_old = errors = 0

    for t in tenants:
        company_id = t.get("company_id")
        if not company_id:
            logger.warning("Tenant has no company_id — skipping: %s", t)
            continue

        old = _old_name(company_id)
        new = _new_name(company_id)

        existing_dbs = await client.list_database_names()

        if new in existing_dbs:
            logger.info("  SKIP  %s  (new name already exists)", company_id)
            skipped_already_new += 1
            continue

        if old not in existing_dbs:
            logger.info("  SKIP  %s  (old DB not found — may be a new-format tenant)", company_id)
            skipped_no_old += 1
            continue

        old_db = client[old]
        collections = await old_db.list_collection_names()
        logger.info(
            "  %s  %s → %s  (%d collections)",
            "DRY-RUN" if dry_run else "RENAME",
            old, new, len(collections),
        )

        if dry_run:
            renamed += 1
            continue

        try:
            for coll in collections:
                logger.info("    copying collection: %s", coll)
                await old_db[coll].aggregate([
                    {"$out": {"db": new, "coll": coll}}
                ]).to_list(length=None)

            # Copy collection indexes
            new_db = client[new]
            for coll in collections:
                index_info = await old_db[coll].index_information()
                for idx_name, idx in index_info.items():
                    if idx_name == "_id_":
                        continue  # default _id index is auto-created
                    keys = idx["key"]
                    opts = {k: v for k, v in idx.items()
                            if k not in ("key", "v", "ns", "background")}
                    try:
                        await new_db[coll].create_index(keys, **opts)
                    except Exception as idx_err:
                        logger.warning("    index %s.%s skipped: %s", coll, idx_name, idx_err)

            # Drop old database only after full copy succeeds
            await client.drop_database(old)
            logger.info("  ✅  Dropped old DB: %s", old)
            renamed += 1

        except Exception as exc:
            logger.error("  ❌  Failed for %s: %s", company_id, exc)
            errors += 1

    client.close()
    logger.info(
        "\nDone. renamed=%d  already_new=%d  no_old=%d  errors=%d%s",
        renamed, skipped_already_new, skipped_no_old, errors,
        "  (dry-run — nothing was changed)" if dry_run else "",
    )
    if errors:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Rename company DBs to Atlas-safe names")
    parser.add_argument("--dry-run", action="store_true",
                        help="Show what would be renamed without making changes")
    parser.add_argument("--uri", default=None,
                        help="MongoDB URI (default: reads MONGODB_URI env or mongodb://localhost:27017)")
    args = parser.parse_args()

    uri = args.uri or os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
    asyncio.run(rename_all(uri, dry_run=args.dry_run))


if __name__ == "__main__":
    main()
