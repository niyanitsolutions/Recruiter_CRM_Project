"""HRM — Offer Template Service"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
import re

from app.models.company.hrm_offer_template import OfferTemplateCreate, OfferTemplateUpdate


class OfferTemplateService:
    COL = "hrm_offer_templates"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _ser(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    # ── CRUD ──────────────────────────────────────────────────────────────────

    async def create(self, company_id: str, data: OfferTemplateCreate, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        if data.is_default:
            await self.col.update_many(
                {"company_id": company_id, "template_type": data.template_type, "is_deleted": False},
                {"$set": {"is_default": False}},
            )
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            **data.model_dump(exclude_none=True),
            "salary_components": [c.model_dump() for c in (data.salary_components or [])],
            "policies": data.policies or [],
            "rules": data.rules or [],
            "is_active": True,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.col.insert_one(doc)
        return self._ser(doc)

    async def list(self, company_id: str, template_type: Optional[str] = None,
                   page: int = 1, page_size: int = 20) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if template_type:
            query["template_type"] = template_type
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, template_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": template_id, "company_id": company_id, "is_deleted": False})
        return self._ser(doc) if doc else None

    async def update(self, template_id: str, company_id: str, data: OfferTemplateUpdate) -> Optional[dict]:
        updates = {k: v for k, v in data.model_dump(exclude_none=True).items() if v is not None}
        if not updates:
            return await self.get(template_id, company_id)
        if updates.get("is_default"):
            doc = await self.col.find_one({"_id": template_id, "company_id": company_id})
            if doc:
                await self.col.update_many(
                    {"company_id": company_id, "template_type": doc["template_type"], "is_deleted": False},
                    {"$set": {"is_default": False}},
                )
        updates["updated_at"] = datetime.now(timezone.utc)
        await self.col.update_one({"_id": template_id, "company_id": company_id}, {"$set": updates})
        return await self.get(template_id, company_id)

    async def delete(self, template_id: str, company_id: str) -> bool:
        result = await self.col.update_one(
            {"_id": template_id, "company_id": company_id},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0

    # ── Generation ─────────────────────────────────────────────────────────────

    async def generate(self, template_id: str, company_id: str, fields: dict) -> Optional[dict]:
        """Render the template body with supplied placeholder values."""
        doc = await self.col.find_one({"_id": template_id, "company_id": company_id, "is_deleted": False})
        if not doc:
            return None

        body = doc.get("body", "")
        subject = doc.get("subject", "")

        # Replace {{placeholder}} with field values (case-insensitive keys)
        def replace(match):
            key = match.group(1).strip().lower().replace(" ", "_")
            return str(fields.get(key, match.group(0)))

        rendered_body    = re.sub(r"\{\{(.*?)\}\}", replace, body)
        rendered_subject = re.sub(r"\{\{(.*?)\}\}", replace, subject)

        return {
            "template_id":   template_id,
            "template_name": doc.get("name"),
            "template_type": doc.get("template_type"),
            "subject":       rendered_subject,
            "body":          rendered_body,
            "salary_components": doc.get("salary_components", []),
            "policies":      doc.get("policies", []),
            "rules":         doc.get("rules", []),
        }
