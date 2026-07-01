"""
Super Admin Communication Center — Service Layer.

Backward-compatible: existing announcement documents continue to work.
New documents gain extended audience targeting, analytics, and status.
"""
from __future__ import annotations

import logging
import uuid
from datetime import datetime, timezone
from typing import Any, Optional

from app.models.master.communication import (
    SuperAnnouncementCreate,
    SuperAnnouncementUpdate,
)

logger = logging.getLogger(__name__)

_COLLECTION = "super_announcements"
_PRIORITY_ORDER = {"critical": 0, "high": 1, "medium": 2, "low": 3}


def _serialize(doc: dict) -> dict:
    """Convert MongoDB document to JSON-safe dict."""
    doc = dict(doc)
    doc["id"] = str(doc.pop("_id", doc.get("id", "")))
    # Ensure analytics exists (backward compat for old docs)
    if "analytics" not in doc:
        doc["analytics"] = {"views": 0, "dismiss_count": 0, "cta_clicks": 0}
    # Ensure new fields exist (backward compat)
    doc.setdefault("image_path", "")
    doc.setdefault("cta_target", "new_tab")
    doc.setdefault("status", "published")
    doc.setdefault("never_expire", False)
    doc.setdefault("timezone", "UTC")
    # Ensure extended target_audience fields exist
    ta = doc.get("target_audience", {})
    if ta:
        ta.setdefault("audience_groups", ["everyone"])
        ta.setdefault("tenant_filter", ta.get("type", "all"))
        ta.setdefault("user_roles", [])
        ta.setdefault("specific_user_ids", [])
        ta.setdefault("departments", [])
        ta.setdefault("role_slugs", [])
    return doc


class CommunicationService:
    """CRUD + query service for super-admin announcements."""

    def __init__(self, master_db):
        self.db = master_db
        self.col = master_db[_COLLECTION]

    # ── CREATE ────────────────────────────────────────────────────────────────

    async def create(self, data: SuperAnnouncementCreate, admin_id: str) -> dict:
        now = datetime.now(timezone.utc)
        ta = data.target_audience.model_dump()
        # Sync legacy field with extended field
        ta["type"] = ta.get("tenant_filter", ta.get("type", "all"))

        doc: dict[str, Any] = {
            "_id":               str(uuid.uuid4()),
            "title":             data.title,
            "description":       data.description,
            "rich_text":         data.rich_text,
            "image_url":         data.image_url,
            "image_path":        data.image_path,
            "announcement_type": data.announcement_type,
            "display_locations": data.display_locations or [],
            "target_audience":   ta,
            "priority":          data.priority,
            "status":            data.status,
            "cta_button_text":   data.cta_button_text,
            "cta_url":           data.cta_url,
            "cta_target":        data.cta_target,
            "start_date":        data.start_date,
            "end_date":          data.end_date,
            "never_expire":      data.never_expire,
            "timezone":          data.timezone,
            "is_active":         data.is_active and data.status == "published",
            "analytics":         {"views": 0, "dismiss_count": 0, "cta_clicks": 0},
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
        status: Optional[str] = None,
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
        if status:
            filt["status"] = status

        total = await self.col.count_documents(filt)
        docs = await self.col.find(filt).sort([("created_at", -1)]).skip(skip).limit(limit).to_list(None)
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
            if k == "target_audience":
                ta = v if isinstance(v, dict) else v.model_dump()
                ta["type"] = ta.get("tenant_filter", ta.get("type", "all"))
                updates[k] = ta
            else:
                updates[k] = v

        # Sync is_active with status
        if "status" in updates:
            if updates["status"] == "draft":
                updates["is_active"] = False
            elif updates["status"] == "published":
                updates.setdefault("is_active", True)
        if "is_active" in updates and updates.get("status", "published") == "draft":
            updates["is_active"] = False

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

    # ── ANALYTICS ─────────────────────────────────────────────────────────────

    async def track(self, announcement_id: str, event: str) -> None:
        """Increment analytics counter. event = 'views' | 'dismiss_count' | 'cta_clicks'"""
        valid = {"views", "dismiss_count", "cta_clicks"}
        if event not in valid:
            return
        await self.col.update_one(
            {"_id": announcement_id, "is_deleted": False},
            {"$inc": {f"analytics.{event}": 1}},
        )

    async def get_analytics(self, announcement_id: str) -> Optional[dict]:
        doc = await self.col.find_one(
            {"_id": announcement_id, "is_deleted": False},
            {"analytics": 1, "title": 1},
        )
        if not doc:
            return None
        return {
            "id":        announcement_id,
            "title":     doc.get("title", ""),
            "analytics": doc.get("analytics", {"views": 0, "dismiss_count": 0, "cta_clicks": 0}),
        }

    # ── SET IMAGE PATH ────────────────────────────────────────────────────────

    async def set_image(self, announcement_id: str, image_path: str) -> Optional[dict]:
        result = await self.col.update_one(
            {"_id": announcement_id, "is_deleted": False},
            {"$set": {
                "image_path": image_path,
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        if result.matched_count == 0:
            return None
        return await self.get_by_id(announcement_id)

    # ── TENANT-FACING QUERY ───────────────────────────────────────────────────

    async def get_active_for_tenant(
        self,
        tenant: dict,
        display_location: Optional[str] = None,
        dismissed_ids: Optional[list[str]] = None,
        current_user: Optional[dict] = None,
    ) -> list[dict]:
        """
        Return active announcements visible to this tenant right now.
        Filters: active, published, within schedule, audience match, location.
        Sorted by priority (critical first).
        """
        now = datetime.now(timezone.utc)

        filt: dict[str, Any] = {
            "is_deleted": False,
            "is_active":  True,
            "$and": [
                {"$or": [{"start_date": None}, {"start_date": {"$lte": now}}]},
                {"$or": [
                    {"never_expire": True},
                    {"end_date": None},
                    {"end_date": {"$gte": now}},
                ]},
            ],
        }

        if display_location:
            filt["display_locations"] = {"$in": [display_location]}

        docs = await self.col.find(filt).to_list(None)

        # Extract tenant context for filtering
        plan_name   = (tenant.get("subscription") or {}).get("plan_name", "").lower()
        tenant_id   = str(tenant.get("_id", ""))
        ten_status  = tenant.get("status", "active")
        user_role   = (current_user or {}).get("role", "")
        user_id     = (current_user or {}).get("id", "")

        result = []
        for doc in docs:
            ta      = doc.get("target_audience") or {}
            groups  = ta.get("audience_groups") or ["everyone"]

            if "everyone" in groups:
                pass  # always include

            elif "tenant_based" in groups:
                tf = ta.get("tenant_filter") or ta.get("type", "all")
                if tf == "trial":
                    if ten_status != "trial":
                        continue
                elif tf == "active_subscriber":
                    if ten_status not in ("active",):
                        continue
                elif tf == "expired":
                    if ten_status != "expired":
                        continue
                elif tf == "enterprise":
                    if "enterprise" not in plan_name:
                        continue
                elif tf == "professional":
                    if "professional" not in plan_name and "quantum" not in plan_name:
                        continue
                elif tf == "starter":
                    if "starter" not in plan_name and "neon" not in plan_name:
                        continue
                elif tf == "specific":
                    if tenant_id not in (ta.get("tenant_ids") or []):
                        continue
                # "all" → always pass

            else:
                # Non-everyone groups — need at least one match
                matched = False

                if "tenant_based" in groups:
                    tf = ta.get("tenant_filter") or ta.get("type", "all")
                    if tf == "all":
                        matched = True
                    elif tf == "trial" and ten_status == "trial":
                        matched = True
                    elif tf == "active_subscriber" and ten_status == "active":
                        matched = True
                    elif tf == "expired" and ten_status == "expired":
                        matched = True
                    elif tf == "specific" and tenant_id in (ta.get("tenant_ids") or []):
                        matched = True

                if "user_based" in groups:
                    user_roles = ta.get("user_roles") or []
                    specific_users = ta.get("specific_user_ids") or []
                    if not user_roles and not specific_users:
                        matched = True
                    elif user_role in user_roles:
                        matched = True
                    elif user_id in specific_users:
                        matched = True

                if "department_based" in groups:
                    deps = ta.get("departments") or []
                    user_dept = (current_user or {}).get("department", "")
                    if not deps or user_dept in deps:
                        matched = True

                if "role_based" in groups:
                    role_slugs = ta.get("role_slugs") or []
                    if not role_slugs or user_role in role_slugs:
                        matched = True

                if not matched:
                    continue

            # Backward-compat: also respect legacy `type` field if audience_groups missing
            if "everyone" not in groups and "tenant_based" not in groups:
                legacy_type = ta.get("type", "all")
                if legacy_type not in ("all", "everyone") and not groups:
                    # Apply legacy filtering
                    if legacy_type == "trial" and ten_status != "trial":
                        continue
                    elif legacy_type == "active_subscriber" and ten_status != "active":
                        continue
                    elif legacy_type == "expired" and ten_status != "expired":
                        continue
                    elif legacy_type == "specific" and tenant_id not in (ta.get("tenant_ids") or []):
                        continue

            if dismissed_ids and doc["_id"] in dismissed_ids:
                continue

            result.append(_serialize(doc))

        result.sort(key=lambda x: _PRIORITY_ORDER.get(x.get("priority", "low"), 3))
        return result

    # ── PUBLIC (login page — no tenant context) ───────────────────────────────

    async def get_public_announcements(self) -> list[dict]:
        """
        Return announcements for the login page (no authentication required).
        Only returns announcements with display_location 'login'.
        Only returns 'everyone' audience type for security.
        """
        now = datetime.now(timezone.utc)
        filt: dict[str, Any] = {
            "is_deleted":       False,
            "is_active":        True,
            "display_locations": {"$in": ["login"]},
            "$and": [
                {"$or": [{"start_date": None}, {"start_date": {"$lte": now}}]},
                {"$or": [
                    {"never_expire": True},
                    {"end_date": None},
                    {"end_date": {"$gte": now}},
                ]},
            ],
        }
        docs = await self.col.find(filt).to_list(None)
        # Only return 'everyone' audience announcements for public endpoint
        result = []
        for doc in docs:
            ta = doc.get("target_audience") or {}
            groups = ta.get("audience_groups") or ["everyone"]
            ta_type = ta.get("type", "all")
            if "everyone" in groups or ta_type == "all":
                result.append(_serialize(doc))

        result.sort(key=lambda x: _PRIORITY_ORDER.get(x.get("priority", "low"), 3))
        return result
