"""
Trash Service - Phase 6
Lists soft-deleted records, restores them, and hard-deletes them.
Soft-deleted docs are identified by is_deleted=True.
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


# Map frontend module names → MongoDB collection names + display label field
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
    return {
        "id":         str(doc["_id"]),
        "label":      _pick_label(doc, label_fields),
        "email":      doc.get("email") or doc.get("contact_email"),
        "status":     doc.get("status"),
        "title":      doc.get("title") or doc.get("job_title"),
        "deleted_at": doc.get("deleted_at").isoformat() if isinstance(doc.get("deleted_at"), datetime) else doc.get("deleted_at"),
        "deleted_by": doc.get("deleted_by"),
    }


class TrashService:
    def __init__(self, db):
        self.db = db

    # ── List ───────────────────────────────────────────────────────────────────

    async def list_deleted(self, company_id: str, module: Optional[str] = None) -> dict:
        modules_to_query = (
            {module: MODULE_MAP[module]} if module and module in MODULE_MAP
            else MODULE_MAP
        )
        groups = []
        for mod_name, cfg in modules_to_query.items():
            col = self.db[cfg["collection"]]
            docs = await col.find(
                {"company_id": company_id, "is_deleted": True}
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

    async def restore(self, company_id: str, module: str, record_id: str) -> dict:
        if module not in MODULE_MAP:
            raise ValueError(f"Unknown module: {module}")

        col = self.db[MODULE_MAP[module]["collection"]]
        result = await col.update_one(
            {"_id": ObjectId(record_id), "company_id": company_id, "is_deleted": True},
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

    async def permanent_delete(self, company_id: str, module: str, record_id: str) -> dict:
        if module not in MODULE_MAP:
            raise ValueError(f"Unknown module: {module}")

        col = self.db[MODULE_MAP[module]["collection"]]
        result = await col.delete_one(
            {"_id": ObjectId(record_id), "company_id": company_id, "is_deleted": True}
        )
        if result.deleted_count == 0:
            raise ValueError("Record not found in trash")
        return {"success": True, "message": "Permanently deleted"}
