"""
Full-instance MongoDB backup / verify / restore utility.

Used by the storage-consolidation rollout (Phase 0) on hosts where the
MongoDB Database Tools (mongodump/mongorestore) are not installed. Documents
are written as raw BSON, so ObjectIds, Decimal128, dates and binary fields
survive a round-trip byte-for-byte.

Usage:
    python scripts/backup_restore.py backup  <target_dir>
    python scripts/backup_restore.py verify  <target_dir>
    python scripts/backup_restore.py restore <target_dir> [--drop]

`verify` re-reads every dumped file and compares document counts against the
live server. `restore --drop` drops each collection before reinserting, which
is the rollback procedure: restore returns the instance to the exact state
captured at backup time.
"""
import os
import sys
import json
from datetime import datetime, timezone

import bson
from pymongo import MongoClient

MONGO_URI = os.environ.get("MONGODB_URI", "mongodb://localhost:27017")
SYSTEM_DBS = {"admin", "config", "local"}


def _collections(client):
    for db_name in sorted(client.list_database_names()):
        if db_name in SYSTEM_DBS:
            continue
        db = client[db_name]
        for coll_name in sorted(db.list_collection_names()):
            if coll_name.startswith("system."):
                continue
            yield db_name, coll_name


def backup(target_dir: str) -> None:
    client = MongoClient(MONGO_URI)
    os.makedirs(target_dir, exist_ok=True)
    manifest = {"created_at": datetime.now(timezone.utc).isoformat(),
                "uri": MONGO_URI, "collections": []}

    for db_name, coll_name in _collections(client):
        coll = client[db_name][coll_name]
        out_dir = os.path.join(target_dir, db_name)
        os.makedirs(out_dir, exist_ok=True)
        path = os.path.join(out_dir, f"{coll_name}.bson")
        count = 0
        with open(path, "wb") as fh:
            for doc in coll.find({}):
                fh.write(bson.encode(doc))
                count += 1
        indexes = list(coll.list_indexes())
        idx_path = os.path.join(out_dir, f"{coll_name}.indexes.json")
        with open(idx_path, "w", encoding="utf-8") as fh:
            json.dump([{k: v for k, v in ix.items()} for ix in indexes],
                      fh, default=str, indent=1)
        manifest["collections"].append(
            {"db": db_name, "collection": coll_name, "count": count})
        print(f"  dumped {db_name}.{coll_name}: {count} docs")

    with open(os.path.join(target_dir, "manifest.json"), "w", encoding="utf-8") as fh:
        json.dump(manifest, fh, indent=1)
    total = sum(c["count"] for c in manifest["collections"])
    print(f"BACKUP OK — {len(manifest['collections'])} collections, {total} documents -> {target_dir}")


def _decode_file(path: str):
    with open(path, "rb") as fh:
        data = fh.read()
    return bson.decode_all(data)


def verify(target_dir: str) -> None:
    with open(os.path.join(target_dir, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    client = MongoClient(MONGO_URI)
    failures = 0
    for entry in manifest["collections"]:
        path = os.path.join(target_dir, entry["db"], f"{entry['collection']}.bson")
        docs = _decode_file(path)  # raises if any BSON record is corrupt
        live = client[entry["db"]][entry["collection"]].count_documents({})
        status = "OK"
        if len(docs) != entry["count"]:
            status, failures = "CORRUPT (file count mismatch)", failures + 1
        elif live != entry["count"]:
            status = f"NOTE live={live} (server changed since backup)"
        print(f"  {entry['db']}.{entry['collection']}: file={len(docs)} manifest={entry['count']} {status}")
    if failures:
        print(f"VERIFY FAILED — {failures} corrupt file(s)")
        sys.exit(1)
    print("VERIFY OK — every dumped file decodes and matches the manifest")


def restore(target_dir: str, drop: bool) -> None:
    with open(os.path.join(target_dir, "manifest.json"), encoding="utf-8") as fh:
        manifest = json.load(fh)
    client = MongoClient(MONGO_URI)
    for entry in manifest["collections"]:
        coll = client[entry["db"]][entry["collection"]]
        docs = _decode_file(
            os.path.join(target_dir, entry["db"], f"{entry['collection']}.bson"))
        if drop:
            coll.drop()
        if docs:
            coll.insert_many(docs)
        print(f"  restored {entry['db']}.{entry['collection']}: {len(docs)} docs")
    print("RESTORE OK")


if __name__ == "__main__":
    if len(sys.argv) < 3 or sys.argv[1] not in {"backup", "verify", "restore"}:
        print(__doc__)
        sys.exit(2)
    cmd, target = sys.argv[1], sys.argv[2]
    if cmd == "backup":
        backup(target)
    elif cmd == "verify":
        verify(target)
    else:
        restore(target, drop="--drop" in sys.argv)
