"""
Super Admin Communication Center — Service Layer.

Manages CRUD for super-announcements stored in master_db.super_announcements.
Also provides the tenant-facing query for fetching active announcements.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.master.communication import (
    SuperAnnouncementCreate,
    SuperAnnouncementUpdate,
    TargetAudienceType,
)

logger = logging.getLogger(__name__)

_COLLECTION = "super_announcements"
_PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _serialize(doc: dict) -> dict:
    """Convert MongoDB document to JSON-safe dict."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", doc.get("id", "")))
    return doc


class CommunicationService:
    """CRUD + query service for super-admin announcements."""

    def __init__(self, master_db):
        self.db = master_db
        self.col = master_db[_COLLECTION]

    # ── CREATE ────────────────────────────────────────────────────────────────

    async def create(self, data: SuperAnnouncementCreate, admin_id: str) -> dict:
        now = datetime.now(timezone.utc)
        doc: dict[str, Any] = {
            "_id":               str(uuid.uuid4()),
            "title":             data.title,
            "description":       data.description,
            "rich_text":         data.rich_text,
            "image_url":         data.image_url,
            "announcement_type": data.announcement_type,
            "display_locations": data.display_locations or [],
            "target_audience":   data.target_audience.model_dump(),
            "priority":          data.priority,
            "cta_button_text":   data.cta_button_text,
            "cta_url":           data.cta_url,
            "start_date":        data.start_date,
            "end_date":          data.end_date,
            "is_active":         data.is_active,
            "created_at":        now,
            "updated_at":        now,
            "created_by":        admin_id,
            "is_deleted":        False,
        }
        await self.col.insert_one(doc)
        return _serialize(doc)

    # ── LIST ──────────────────────────────────────────────────────────────────

    async def list_all(
        self,
        announcement_type: Optional[str] = None,
        is_active: Optional[bool] = None,
        priority: Optional[str] = None,
        skip: int = 0,
        limit: int = 50,
    ) -> dict:
        filt: dict[str, Any] = {"is_deleted": False}
        if announcement_type:
            filt["announcement_type"] = announcement_type
        if is_active is not None:
            filt["is_active"] = is_active
        if priority:
            filt["priority"] = priority

        total = await self.col.count_documents(filt)
        cursor = self.col.find(filt).sort([
            ("priority", 1),   # use _PRIORITY_ORDER via application sort below
            ("created_at", -1),
        ]).skip(skip).limit(limit)
        docs = await cursor.to_list(None)
        items = sorted(
            [_serialize(d) for d in docs],
            key=lambda x: (_PRIORITY_ORDER.get(x.get("priority", "low"), 3), 0),
        )
        return {"total": total, "items": items}

    # ── GET ONE ───────────────────────────────────────────────────────────────

    async def get_by_id(self, announcement_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": announcement_id, "is_deleted": False})
        return _serialize(doc) if doc else None

    # ── UPDATE ────────────────────────────────────────────────────────────────

    async def update(self, announcement_id: str, data: SuperAnnouncementUpdate, admin_id: str) -> Optional[dict]:
        updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
        payload = data.model_dump(exclude_none=True)
        for k, v in payload.items():
            if k == "target_audience" and hasattr(v, "model_dump"):
                updates[k] = v.model_dump()
            else:
                updates[k] = v

        result = await self.col.update_one(
            {"_id": announcement_id, "is_deleted": False},
            {"$set": updates},
        )
        if result.matched_count == 0:
            return None
        return await self.get_by_id(announcement_id)

    # ── DELETE (soft) ─────────────────────────────────────────────────────────

    async def delete(self, announcement_id: str) -> bool:
        result = await self.col.update_one(
            {"_id": announcement_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}},
        )
        return result.matched_count > 0

    # ── TOGGLE active ─────────────────────────────────────────────────────────

    async def set_active(self, announcement_id: str, is_active: bool) -> Optional[dict]:
        result = await self.col.update_one(
            {"_id": announcement_id, "is_deleted": False},
            {"$set": {"is_active": is_active, "updated_at": datetime.now(timezone.utc)}},
        )
        if result.matched_count == 0:
            return None
        return await self.get_by_id(announcement_id)

    # ── TENANT-FACING QUERY ───────────────────────────────────────────────────

    async def get_active_for_tenant(
        self,
        tenant: dict,                       # tenant doc from master_db
        display_location: Optional[str] = None,
        dismissed_ids: Optional[list[str]] = None,
    ) -> list[dict]:
        """
        Return announcements visible to this tenant right now.
        Filters: active, within schedule, audience match, optionally by location.
        Sorted by priority (critical first).
        """
        now = datetime.now(timezone.utc)

        filt: dict[str, Any] = {
            "is_deleted": False,
            "is_active":  True,
            "$or": [
                {"start_date": None},
                {"start_date": {"$lte": now}},
            ],
        }

        # Also require end_date is None or in the future
        filt["$and"] = [
            {"$or": [{"end_date": None}, {"end_date": {"$gte": now}}]},
        ]

        if display_location:
            filt["display_locations"] = {"$in": [display_location]}

        docs = await self.col.find(filt).to_list(None)

        # Filter by target audience in Python (simple logic)
        plan_name = (tenant.get("subscription", {}) or {}).get("plan_name", "").lower()
        tenant_id = str(tenant.get("_id", ""))
        status = tenant.get("status", "active")

        result = []
        for doc in docs:
            ta = doc.get("target_audience", {})
            ta_type = ta.get("type", "all")

            if ta_type == "all":
                pass
            elif ta_type == "trial":
                if status != "trial":
                    continue
            elif ta_type == "active_subscriber":
                if status not in ("active",):
                    continue
            elif ta_type == "expired":
                if status != "expired":
                    continue
            elif ta_type == "enterprise":
                if "enterprise" not in plan_name:
                    continue
            elif ta_type == "professional":
                if "professional" not in plan_name and "quantum" not in plan_name:
                    continue
            elif ta_type == "starter":
                if "starter" not in plan_name and "neon" not in plan_name:
                    continue
            elif ta_type == "specific":
                if tenant_id not in (ta.get("tenant_ids") or []):
                    continue

            # Filter out dismissed
            if dismissed_ids and doc["_id"] in dismissed_ids:
                continue

            result.append(_serialize(doc))

        # Sort by priority
        result.sort(key=lambda x: _PRIORITY_ORDER.get(x.get("priority", "low"), 3))
        return result
