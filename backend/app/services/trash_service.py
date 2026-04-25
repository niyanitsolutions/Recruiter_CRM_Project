"""
Trash Service - Phase 6
Lists soft-deleted records, restores them, and hard-deletes them.

DB is already scoped per-tenant (one MongoDB database per company), so
company_id filtering within the collection is not required for isolation —
the DB itself provides tenant separation. company_id is stored on new records
for forward compatibility but is NOT used as a filter here.
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


# Map frontend module names → MongoDB collection names + display label fields
MODULE_MAP = {
    "candidates": {
        "collection": "candidates",
        "label_fields": ["full_name", "name", "email"],
    },
    "jobs": {
        "collection": "jobs",
        "label_fields": ["title", "job_title"],
    },
    "clients": {
        "collection": "clients",
        "label_fields": ["company_name", "name"],
    },
    "users": {
        "collection": "users",
        "label_fields": ["full_name", "name", "email"],
    },
    "interviews": {
        "collection": "interviews",
        "label_fields": ["title", "candidate_name"],
    },
    "onboards": {
        "collection": "onboards",
        "label_fields": ["candidate_name", "title"],
    },
}


def _pick_label(doc: dict, fields: list) -> str:
    for f in fields:
        v = doc.get(f)
        if v:
            return str(v)
    return f"#{str(doc.get('_id', ''))[:8]}"


def _serialize(doc: dict, label_fields: list) -> dict:
    deleted_at = doc.get("deleted_at")
    return {
        "id":         str(doc["_id"]),
        "label":      _pick_label(doc, label_fields),
        "email":      doc.get("email") or doc.get("contact_email"),
        "status":     doc.get("status"),
        "title":      doc.get("title") or doc.get("job_title"),
        "deleted_at": deleted_at.isoformat() if isinstance(deleted_at, datetime) else deleted_at,
        "deleted_by": doc.get("deleted_by"),
    }


class TrashService:
    def __init__(self, db):
        self.db = db

    # ── List ───────────────────────────────────────────────────────────────────

    async def list_deleted(self, module: Optional[str] = None) -> dict:
        modules_to_query = (
            {module: MODULE_MAP[module]} if module and module in MODULE_MAP
            else MODULE_MAP
        )
        groups = []
        for mod_name, cfg in modules_to_query.items():
            col = self.db[cfg["collection"]]
            docs = await col.find(
                {"is_deleted": True}
            ).sort("deleted_at", -1).limit(200).to_list(length=200)

            if not docs:
                continue

            items = [_serialize(d, cfg["label_fields"]) for d in docs]
            groups.append({
                "module": mod_name,
                "total":  len(items),
                "items":  items,
            })

        return {"modules": groups}

    # ── Restore ────────────────────────────────────────────────────────────────

    async def restore(self, module: str, record_id: str) -> dict:
        if module not in MODULE_MAP:
            raise ValueError(f"Unknown module: {module}")

        col = self.db[MODULE_MAP[module]["collection"]]

        # Support both string _id (used by candidates/jobs) and ObjectId
        oid = _to_id(record_id)
        result = await col.update_one(
            {"_id": oid, "is_deleted": True},
            {"$set": {
                "is_deleted":  False,
                "deleted_at":  None,
                "deleted_by":  None,
                "restored_at": datetime.now(timezone.utc),
            }}
        )
        if result.matched_count == 0:
            # Retry with the other id type before giving up
            alt_oid = record_id if isinstance(oid, ObjectId) else _try_object_id(record_id)
            if alt_oid:
                result = await col.update_one(
                    {"_id": alt_oid, "is_deleted": True},
                    {"$set": {
                        "is_deleted":  False,
                        "deleted_at":  None,
                        "deleted_by":  None,
                        "restored_at": datetime.now(timezone.utc),
                    }}
                )
        if result.matched_count == 0:
            raise ValueError("Record not found or already restored")
        return {"success": True, "message": "Record restored"}

    # ── Permanent delete ───────────────────────────────────────────────────────

    async def permanent_delete(self, module: str, record_id: str) -> dict:
        if module not in MODULE_MAP:
            raise ValueError(f"Unknown module: {module}")

        col = self.db[MODULE_MAP[module]["collection"]]
        oid = _to_id(record_id)
        result = await col.delete_one({"_id": oid, "is_deleted": True})
        if result.deleted_count == 0:
            # Retry with the other id type
            alt_oid = record_id if isinstance(oid, ObjectId) else _try_object_id(record_id)
            if alt_oid:
                result = await col.delete_one({"_id": alt_oid, "is_deleted": True})
        if result.deleted_count == 0:
            raise ValueError("Record not found in trash")
        return {"success": True, "message": "Permanently deleted"}


def _try_object_id(value: str):
    try:
        return ObjectId(value)
    except Exception:
        return None


def _to_id(value: str):
    """Candidate/job services store _id as plain string (str(ObjectId())).
    Try plain string first; fall back to ObjectId for other collections."""
    return value  # default: plain string (matches candidates/jobs)
