"""HRM — Document Template Service (Enterprise Edition)"""
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
import re
import math

from app.models.company.hrm_document_template import (
    TemplateCreate, TemplateUpdate, GenerateDocumentRequest,
    CloneTemplateRequest, ContentBlockCreate, RestoreVersionRequest,
    DOCUMENT_TYPE_FIELDS, PLACEHOLDER_GROUPS, DOCUMENT_TYPE_LABELS,
)


class DocumentTemplateService:
    COL       = "hrm_document_templates"
    GEN_COL   = "hrm_document_generations"
    BLOCK_COL = "hrm_content_blocks"
    MAX_VERSIONS = 10

    def __init__(self, db):
        self.db  = db
        self.col = db[self.COL]

    @staticmethod
    def _ser(doc: dict) -> dict:
        if not doc:
            return {}
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id", ""))
        # Don't ship the full version_history in list views — too large
        return doc

    @staticmethod
    def _ser_list(doc: dict) -> dict:
        if not doc:
            return {}
        doc = dict(doc)
        doc["id"] = str(doc.pop("_id", ""))
        doc.pop("version_history", None)   # omit from list
        doc.pop("blocks", None)            # omit heavy blocks from list
        return doc

    # ─── Create ───────────────────────────────────────────────────────────────

    async def create(self, company_id: str, data: TemplateCreate, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        doc_id = str(ObjectId())

        doc = {
            "_id": doc_id,
            "company_id": company_id,
            "name": data.name,
            "description": data.description or "",
            "doc_type": data.doc_type if isinstance(data.doc_type, str) else data.doc_type.value,
            "category": data.category if isinstance(data.category, str) else data.category.value,
            "is_active": bool(data.is_active),
            "is_default": data.is_default,
            "is_deleted": False,
            "version": 1,
            "page_config":  data.page_config  or {"size": "A4", "orientation": "portrait", "margin_top": 20, "margin_right": 20, "margin_bottom": 20, "margin_left": 20},
            "branding":     data.branding     or {"primary_color": "#1e3a5f", "secondary_color": "#4a90d9", "font_family": "Helvetica", "font_size": 11, "text_color": "#1a1a1a", "heading_color": "#1e3a5f"},
            "header":       data.header       or {"enabled": True, "logo_position": "left", "show_company_name": True, "show_address": True, "border_bottom": True},
            "footer":       data.footer       or {"enabled": True, "show_page_numbers": True, "show_generated_date": True, "disclaimer": "", "border_top": True},
            "watermark":    data.watermark    or {"enabled": False, "type": "text", "text": "CONFIDENTIAL", "opacity": 0.10, "rotation": -45, "font_size": 60},
            "blocks":       data.blocks       or [],
            "signatures":   data.signatures   or [],
            "allowed_roles": data.allowed_roles or [],
            "tags":          data.tags or [],
            "version_history": [],
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "last_generated_at": None,
            "generation_count": 0,
        }

        if data.is_default:
            await self.col.update_many(
                {"company_id": company_id, "doc_type": doc["doc_type"], "is_deleted": False},
                {"$set": {"is_default": False}},
            )

        await self.col.insert_one(doc)
        return self._ser(doc)

    # ─── List ─────────────────────────────────────────────────────────────────

    async def list(
        self,
        company_id: str,
        doc_type: Optional[str] = None,
        category: Optional[str] = None,
        search: Optional[str] = None,
        is_active: Optional[bool] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if doc_type:
            query["doc_type"] = doc_type
        if category:
            query["category"] = category
        if search:
            query["$or"] = [
                {"name":        {"$regex": search, "$options": "i"}},
                {"description": {"$regex": search, "$options": "i"}},
                {"tags":        {"$elemMatch": {"$regex": search, "$options": "i"}}},
            ]
        if is_active is not None:
            query["is_active"] = is_active

        total = await self.col.count_documents(query)
        skip  = (page - 1) * page_size
        cursor = self.col.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items  = [self._ser_list(d) async for d in cursor]

        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, math.ceil(total / page_size)) if page_size else 1,
        }

    # ─── Get ──────────────────────────────────────────────────────────────────

    async def get(self, template_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False}
        )
        return self._ser(doc) if doc else None

    # ─── Update ───────────────────────────────────────────────────────────────

    async def update(
        self, template_id: str, company_id: str, data: TemplateUpdate, updated_by: str
    ) -> Optional[dict]:
        existing = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False}
        )
        if not existing:
            return None

        # Save version snapshot before modifying
        await self._save_version(existing, updated_by, data.version_note or "")

        updates: dict = {"updated_at": datetime.now(timezone.utc)}
        for field in ["name", "description", "is_active", "is_default", "page_config",
                      "branding", "header", "footer", "watermark", "blocks",
                      "signatures", "allowed_roles", "tags"]:
            val = getattr(data, field, None)
            if val is not None:
                updates[field] = val
        if data.doc_type is not None:
            updates["doc_type"] = data.doc_type if isinstance(data.doc_type, str) else data.doc_type.value
        if data.category is not None:
            updates["category"] = data.category if isinstance(data.category, str) else data.category.value

        updates["version"] = existing.get("version", 1) + 1

        if updates.get("is_default"):
            await self.col.update_many(
                {"company_id": company_id, "doc_type": existing["doc_type"], "is_deleted": False, "_id": {"$ne": template_id}},
                {"$set": {"is_default": False}},
            )

        await self.col.update_one({"_id": template_id}, {"$set": updates})
        return await self.get(template_id, company_id)

    # ─── Delete ───────────────────────────────────────────────────────────────

    async def delete(self, template_id: str, company_id: str) -> bool:
        result = await self.col.update_one(
            {"_id": template_id, "company_id": company_id},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}},
        )
        return result.modified_count > 0

    # ─── Clone ────────────────────────────────────────────────────────────────

    async def clone(
        self, template_id: str, company_id: str,
        data: CloneTemplateRequest, created_by: str
    ) -> Optional[dict]:
        src = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False}
        )
        if not src:
            return None

        now = datetime.now(timezone.utc)
        new_id = str(ObjectId())
        clone_doc = {
            **{k: v for k, v in src.items() if k != "_id"},
            "_id": new_id,
            "name": data.name,
            "doc_type": (data.doc_type.value if data.doc_type else src["doc_type"]),
            "is_default": False,
            "version": 1,
            "version_history": [],
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "last_generated_at": None,
            "generation_count": 0,
        }
        await self.col.insert_one(clone_doc)
        return self._ser(clone_doc)

    # ─── Version Control ──────────────────────────────────────────────────────

    async def _save_version(self, existing: dict, saved_by: str, note: str) -> None:
        """Push current state into version_history (capped at MAX_VERSIONS)."""
        history: list = existing.get("version_history", [])
        snapshot = {k: v for k, v in existing.items() if k != "version_history"}
        history.append({
            "version":  existing.get("version", 1),
            "saved_at": datetime.now(timezone.utc),
            "saved_by": saved_by,
            "note":     note,
            "snapshot": snapshot,
        })
        # Keep only the last MAX_VERSIONS entries
        if len(history) > self.MAX_VERSIONS:
            history = history[-self.MAX_VERSIONS:]
        await self.col.update_one(
            {"_id": existing["_id"]},
            {"$set": {"version_history": history}},
        )

    async def get_version_history(self, template_id: str, company_id: str) -> List[dict]:
        doc = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False},
            {"version_history": 1, "version": 1, "name": 1},
        )
        if not doc:
            return []
        history = doc.get("version_history", [])
        # Return metadata without the heavy snapshot blob
        return [
            {
                "version":  h["version"],
                "saved_at": h["saved_at"],
                "saved_by": h["saved_by"],
                "note":     h["note"],
            }
            for h in reversed(history)
        ]

    async def restore_version(
        self, template_id: str, company_id: str,
        req: RestoreVersionRequest, restored_by: str
    ) -> Optional[dict]:
        doc = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False}
        )
        if not doc:
            return None
        history = doc.get("version_history", [])
        target = next((h for h in history if h["version"] == req.version), None)
        if not target:
            return None

        # Save current state before restoring
        await self._save_version(doc, restored_by, f"Before restoring v{req.version}")

        snap = target["snapshot"]
        restore_fields = {k: v for k, v in snap.items()
                          if k not in ("_id", "company_id", "created_by", "created_at",
                                       "version_history", "generation_count")}
        restore_fields["version"] = doc.get("version", 1) + 1
        restore_fields["updated_at"] = datetime.now(timezone.utc)
        restore_fields["_restored_from_version"] = req.version

        await self.col.update_one({"_id": template_id}, {"$set": restore_fields})
        return await self.get(template_id, company_id)

    # ─── Reusable Content Blocks ──────────────────────────────────────────────

    async def create_content_block(
        self, company_id: str, data: ContentBlockCreate, created_by: str
    ) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "name": data.name,
            "description": data.description,
            "category": data.category,
            "block_data": data.block_data,
            "is_deleted": False,
            "created_by": created_by,
            "created_at": now,
        }
        await self.db[self.BLOCK_COL].insert_one(doc)
        return self._ser(doc)

    async def list_content_blocks(self, company_id: str, category: Optional[str] = None) -> List[dict]:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if category:
            query["category"] = category
        cursor = self.db[self.BLOCK_COL].find(query).sort("created_at", -1)
        return [self._ser(d) async for d in cursor]

    async def delete_content_block(self, block_id: str, company_id: str) -> bool:
        result = await self.db[self.BLOCK_COL].update_one(
            {"_id": block_id, "company_id": company_id},
            {"$set": {"is_deleted": True}},
        )
        return result.modified_count > 0

    # ─── Placeholder Engine ───────────────────────────────────────────────────

    def resolve_placeholders(self, text: str, fields: dict) -> str:
        """Replace {{key}} with field values. Auto-formats dates and currency."""
        if not text:
            return text

        def _replace(match: re.Match) -> str:
            key = match.group(1).strip().lower().replace(" ", "_")
            val = fields.get(key)
            if val is None:
                return match.group(0)     # leave unreplaced if not provided
            return str(val)

        return re.sub(r"\{\{([^}]+)\}\}", _replace, text)

    def resolve_blocks(self, blocks: list, fields: dict) -> list:
        """Run placeholder replacement across all block content."""
        resolved = []
        for block in blocks:
            b = dict(block)
            content = b.get("content", "")
            if isinstance(content, str):
                b["content"] = self.resolve_placeholders(content, fields)
            elif isinstance(content, dict):
                # For table/salary blocks, replace inside cells
                b["content"] = self._resolve_dict_content(content, fields)
            resolved.append(b)
        return resolved

    def _resolve_dict_content(self, obj: Any, fields: dict) -> Any:
        if isinstance(obj, str):
            return self.resolve_placeholders(obj, fields)
        if isinstance(obj, dict):
            return {k: self._resolve_dict_content(v, fields) for k, v in obj.items()}
        if isinstance(obj, list):
            return [self._resolve_dict_content(item, fields) for item in obj]
        return obj

    # ─── Auto-fill from Employee/Candidate ───────────────────────────────────

    async def auto_fill_from_employee(self, employee_id: str, company_id: str) -> dict:
        """Return a field_data dict pre-filled from HRM employee record."""
        emp = await self.db["hrm_employees"].find_one(
            {"_id": employee_id, "company_id": company_id, "is_deleted": False}
        )
        if not emp:
            return {}

        fields: dict = {
            "employee_name":   emp.get("full_name", ""),
            "employee_id":     emp.get("employee_id", ""),
            "employee_email":  emp.get("email", ""),
            "employee_phone":  emp.get("phone", ""),
            "designation":     emp.get("designation", ""),
            "department":      emp.get("department", ""),
            "joining_date":    str(emp.get("date_of_joining", "")) if emp.get("date_of_joining") else "",
            "date_of_joining": str(emp.get("date_of_joining", "")) if emp.get("date_of_joining") else "",
            "employment_type": emp.get("employment_type", ""),
            "reporting_manager": emp.get("reporting_manager", ""),
            "bank_account":    emp.get("bank_account_number", ""),
            "uan_number":      emp.get("uan_number", ""),
            "pan_number":      emp.get("pan_number", ""),
            "date_of_birth":   str(emp.get("date_of_birth", "")) if emp.get("date_of_birth") else "",
        }
        return {k: v for k, v in fields.items() if v}

    async def auto_fill_from_candidate(self, candidate_id: str, company_id: str) -> dict:
        """Return a field_data dict pre-filled from candidates record."""
        cand = await self.db["candidates"].find_one(
            {"_id": candidate_id, "company_id": company_id, "is_deleted": {"$ne": True}}
        )
        if not cand:
            return {}

        fields: dict = {
            "candidate_name":  cand.get("full_name", cand.get("name", "")),
            "candidate_email": cand.get("email", ""),
            "candidate_phone": cand.get("phone", ""),
        }
        return {k: v for k, v in fields.items() if v}

    async def auto_fill_from_company(self, company_id: str) -> dict:
        """Return company info for auto-filling company placeholders."""
        tenant = await self.db.get("settings", None)
        # Try company_settings collection
        settings = await self.db["company_settings"].find_one({"company_id": company_id})
        if not settings:
            # Try tenants in master db (can't do cross-db easily, so use what's available)
            return {}

        return {
            "company_name":    settings.get("company_name", ""),
            "company_address": settings.get("address", ""),
            "company_city":    settings.get("city", ""),
            "company_state":   settings.get("state", ""),
            "company_country": settings.get("country", "India"),
            "company_phone":   settings.get("phone", ""),
            "company_email":   settings.get("email", ""),
            "company_website": settings.get("website", ""),
            "company_gst":     settings.get("gst_number", ""),
        }

    # ─── Generate Document ────────────────────────────────────────────────────

    async def generate(
        self,
        template_id: str,
        company_id: str,
        req: GenerateDocumentRequest,
        generated_by: str,
    ) -> Optional[dict]:
        template = await self.col.find_one(
            {"_id": template_id, "company_id": company_id, "is_deleted": False}
        )
        if not template:
            return None

        # Merge auto-fill + provided fields
        field_data = dict(req.field_data)

        # Add system date fields
        now = datetime.now(timezone.utc)
        from datetime import date as _date
        import calendar as _calendar
        field_data.setdefault("date_today",      now.strftime("%d %B %Y"))
        field_data.setdefault("date_formatted",  now.strftime("%d %B %Y"))
        field_data.setdefault("current_month",   now.strftime("%B"))
        field_data.setdefault("current_year",    str(now.year))
        field_data.setdefault("document_date",   now.strftime("%d %B %Y"))

        # Auto-generate document number
        count = (template.get("generation_count") or 0) + 1
        doc_type_short = template["doc_type"][:3].upper()
        field_data.setdefault("document_number", f"{doc_type_short}-{now.year}-{count:04d}")

        # Auto-fill from employee if provided
        if req.employee_id:
            emp_fields = await self.auto_fill_from_employee(req.employee_id, company_id)
            for k, v in emp_fields.items():
                field_data.setdefault(k, v)

        # Auto-fill from candidate if provided
        if req.candidate_id:
            cand_fields = await self.auto_fill_from_candidate(req.candidate_id, company_id)
            for k, v in cand_fields.items():
                field_data.setdefault(k, v)

        # Company info
        co_fields = await self.auto_fill_from_company(company_id)
        for k, v in co_fields.items():
            field_data.setdefault(k, v)

        # Resolve placeholders in all blocks
        resolved_blocks = self.resolve_blocks(template.get("blocks", []), field_data)

        # Build rendered HTML
        rendered_html = self._render_html(template, resolved_blocks, field_data)

        # Increment generation count
        await self.col.update_one(
            {"_id": template_id},
            {"$set": {"last_generated_at": now, "generation_count": count}},
        )

        # Save generation record if requested
        gen_id = str(ObjectId())
        if req.save_record:
            gen_doc = {
                "_id": gen_id,
                "company_id": company_id,
                "template_id": template_id,
                "template_name": template["name"],
                "doc_type": template["doc_type"],
                "generated_for_employee_id":    req.employee_id,
                "generated_for_employee_name":  field_data.get("employee_name"),
                "generated_for_candidate_id":   req.candidate_id,
                "generated_for_candidate_name": field_data.get("candidate_name"),
                "field_data":     field_data,
                "rendered_html":  rendered_html,
                "document_number": field_data.get("document_number"),
                "status":         "generated",
                "generated_by":   generated_by,
                "generated_at":   now,
                "is_deleted":     False,
            }
            await self.db[self.GEN_COL].insert_one(gen_doc)

        return {
            "generation_id":  gen_id,
            "template_id":    template_id,
            "template_name":  template["name"],
            "doc_type":       template["doc_type"],
            "rendered_html":  rendered_html,
            "field_data":     field_data,
            "document_number": field_data.get("document_number"),
            "template":       self._ser(dict(template)),
        }

    # ─── HTML Renderer (for preview / export base) ────────────────────────────

    def _render_html(self, template: dict, resolved_blocks: list, fields: dict) -> str:
        """Build a complete HTML document from the template + resolved blocks."""
        branding    = template.get("branding", {})
        header_cfg  = template.get("header", {})
        footer_cfg  = template.get("footer", {})
        watermark   = template.get("watermark", {})
        page_cfg    = template.get("page_config", {})

        primary_color  = branding.get("primary_color", "#1e3a5f")
        font_family    = branding.get("font_family", "Arial, sans-serif")
        font_size      = branding.get("font_size", 11)
        text_color     = branding.get("text_color", "#1a1a1a")
        heading_color  = branding.get("heading_color", "#1e3a5f")

        margin_top    = page_cfg.get("margin_top", 20)
        margin_right  = page_cfg.get("margin_right", 20)
        margin_bottom = page_cfg.get("margin_bottom", 20)
        margin_left   = page_cfg.get("margin_left", 20)

        # Watermark style
        wm_style = ""
        if watermark.get("enabled"):
            opacity  = watermark.get("opacity", 0.10)
            rotation = watermark.get("rotation", -45)
            wm_text  = watermark.get("text", "CONFIDENTIAL")
            wm_size  = watermark.get("font_size", 60)
            wm_color = watermark.get("color", "#cccccc")
            wm_style = f"""
            <div style="position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate({rotation}deg);
                        font-size:{wm_size}pt;color:{wm_color};opacity:{opacity};
                        white-space:nowrap;font-weight:bold;pointer-events:none;z-index:0;">
                {wm_text}
            </div>"""

        # Header HTML
        header_html = ""
        if header_cfg.get("enabled", True):
            logo_url  = header_cfg.get("logo_url") or fields.get("company_logo_url", "")
            logo_pos  = header_cfg.get("logo_position", "left")
            co_name   = fields.get("company_name", "")
            co_addr   = fields.get("company_address", "")
            co_phone  = fields.get("company_phone", "")
            co_email  = fields.get("company_email", "")
            co_web    = fields.get("company_website", "")

            logo_html = ""
            if logo_url:
                logo_html = f'<img src="{logo_url}" style="height:50px;max-width:160px;object-fit:contain;" />'

            info_lines = []
            if header_cfg.get("show_company_name") and co_name:
                info_lines.append(f'<strong style="font-size:14pt;color:{primary_color};">{co_name}</strong>')
            if header_cfg.get("show_address") and co_addr:
                info_lines.append(f'<span style="font-size:9pt;color:#555;">{co_addr}</span>')
            if header_cfg.get("show_phone") and co_phone:
                info_lines.append(f'<span style="font-size:9pt;color:#555;">Tel: {co_phone}</span>')
            if header_cfg.get("show_email") and co_email:
                info_lines.append(f'<span style="font-size:9pt;color:#555;">Email: {co_email}</span>')
            if header_cfg.get("show_website") and co_web:
                info_lines.append(f'<span style="font-size:9pt;color:#555;">{co_web}</span>')

            info_html = '<br>'.join(info_lines)

            if logo_pos == "center":
                header_inner = f'<div style="text-align:center;">{logo_html}<br>{info_html}</div>'
            elif logo_pos == "right":
                header_inner = f'<table style="width:100%;"><tr><td>{info_html}</td><td style="text-align:right;">{logo_html}</td></tr></table>'
            else:
                header_inner = f'<table style="width:100%;"><tr><td>{logo_html}</td><td style="text-align:right;">{info_html}</td></tr></table>'

            border_style = f'border-bottom:2px solid {primary_color};' if header_cfg.get("border_bottom") else ""
            header_html = f'<div style="padding-bottom:12px;margin-bottom:16px;{border_style}">{header_inner}</div>'

        # Footer HTML
        footer_html = ""
        if footer_cfg.get("enabled", True):
            parts = []
            if footer_cfg.get("show_generated_date"):
                from datetime import datetime as _dt
                parts.append(f'Generated: {_dt.now().strftime("%d %b %Y")}')
            if footer_cfg.get("disclaimer"):
                parts.append(footer_cfg["disclaimer"])
            if footer_cfg.get("show_page_numbers"):
                parts.append("Page 1")
            border_style = f'border-top:1px solid {primary_color};' if footer_cfg.get("border_top") else ""
            footer_html = f'<div style="margin-top:24px;padding-top:10px;{border_style}font-size:8pt;color:#888;text-align:center;">' + " &nbsp;|&nbsp; ".join(parts) + '</div>'

        # Render content blocks
        blocks_html = self._render_blocks_html(resolved_blocks, branding)

        # Signature blocks
        sigs_html = self._render_signatures_html(template.get("signatures", []), primary_color)

        return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: {font_family};
    font-size: {font_size}pt;
    color: {text_color};
    line-height: 1.5;
    background: #fff;
  }}
  .page {{
    max-width: 800px;
    margin: 0 auto;
    padding: {margin_top}mm {margin_right}mm {margin_bottom}mm {margin_left}mm;
    background: #fff;
    position: relative;
  }}
  h1,h2,h3,h4 {{ color: {heading_color}; }}
  table {{ border-collapse: collapse; width: 100%; }}
  td, th {{ padding: 6px 10px; }}
  .salary-table th {{ background: {primary_color}; color: #fff; }}
  .salary-table td {{ border-bottom: 1px solid #eee; }}
  .salary-table .total-row {{ font-weight: bold; background: #f8f9fa; }}
  @media print {{ body {{ -webkit-print-color-adjust: exact; }} }}
</style>
</head>
<body>
<div class="page">
  {wm_style}
  {header_html}
  {blocks_html}
  {sigs_html}
  {footer_html}
</div>
</body>
</html>"""

    def _render_blocks_html(self, blocks: list, branding: dict) -> str:
        html_parts = []
        for block in sorted(blocks, key=lambda b: b.get("order", 0)):
            block_type = block.get("type", "text")
            content    = block.get("content", "")
            props      = block.get("properties", {})

            mt = props.get("margin_top", 6)
            mb = props.get("margin_bottom", 6)
            align = props.get("text_align", "left")
            color = props.get("color") or branding.get("text_color", "#1a1a1a")
            bg    = props.get("background_color", "")
            fs    = props.get("font_size")
            fw    = props.get("font_weight", "")
            fi    = props.get("font_style", "")

            style = f"margin-top:{mt}px;margin-bottom:{mb}px;text-align:{align};"
            if color:  style += f"color:{color};"
            if bg:     style += f"background-color:{bg};"
            if fs:     style += f"font-size:{fs}pt;"
            if fw:     style += f"font-weight:{fw};"
            if fi:     style += f"font-style:{fi};"

            if block_type == "heading":
                size = props.get("font_size", 16)
                tag  = "h1" if size >= 20 else "h2" if size >= 16 else "h3"
                html_parts.append(f'<{tag} style="{style}">{content}</{tag}>')

            elif block_type in ("text", "paragraph"):
                html_parts.append(f'<div style="{style}">{content}</div>')

            elif block_type == "divider":
                clr = props.get("color", "#e2e8f0")
                html_parts.append(f'<hr style="margin:{mt}px 0 {mb}px;border:none;border-top:1px solid {clr};">')

            elif block_type == "spacer":
                h = props.get("height", "20px")
                html_parts.append(f'<div style="height:{h};"></div>')

            elif block_type == "page_break":
                html_parts.append('<div style="page-break-after:always;"></div>')

            elif block_type == "list_items":
                if isinstance(content, list):
                    items_html = "".join(f"<li>{item}</li>" for item in content)
                else:
                    items_html = f"<li>{content}</li>"
                html_parts.append(f'<ul style="{style}padding-left:20px;">{items_html}</ul>')

            elif block_type == "table":
                html_parts.append(self._render_table_html(content, props))

            elif block_type == "salary_table":
                html_parts.append(self._render_salary_table_html(content, branding))

            elif block_type == "employee_details":
                html_parts.append(self._render_emp_details_html(content, props, branding))

            elif block_type == "company_details":
                html_parts.append(self._render_company_details_html(content, props, branding))

            elif block_type == "signature_block":
                html_parts.append(self._render_inline_signature_html(content, props, branding))

            elif block_type == "image":
                url = content if isinstance(content, str) else (content or {}).get("url", "")
                w   = props.get("width", "auto")
                html_parts.append(f'<div style="{style}"><img src="{url}" style="max-width:{w};height:auto;" /></div>')

            elif block_type == "qr_code":
                verify_url = content or ""
                html_parts.append(f'<div style="{style};font-size:8pt;color:#888;border:1px solid #ddd;padding:8px;display:inline-block;">[ QR Code — {verify_url} ]</div>')

            elif block_type == "two_column":
                if isinstance(content, dict):
                    left  = content.get("left", "")
                    right = content.get("right", "")
                    html_parts.append(f'<table style="width:100%;margin:{mt}px 0 {mb}px;"><tr><td style="width:50%;vertical-align:top;padding-right:12px;">{left}</td><td style="width:50%;vertical-align:top;">{right}</td></tr></table>')

        return "\n".join(html_parts)

    def _render_table_html(self, content: Any, props: dict) -> str:
        if not isinstance(content, dict):
            return ""
        headers  = content.get("headers", [])
        rows     = content.get("rows", [])
        has_hdr  = content.get("has_header", True)
        border   = content.get("border_style", "full")
        hdr_bg   = content.get("header_bg", "#1e3a5f")
        hdr_clr  = content.get("header_color", "#ffffff")
        stripe   = content.get("stripe_rows", True)

        border_css = "border:1px solid #ccc;" if border != "none" else ""
        th_css = f"background:{hdr_bg};color:{hdr_clr};padding:7px 10px;text-align:left;"
        td_css = "padding:6px 10px;"

        html = f'<table style="width:100%;border-collapse:collapse;margin:8px 0;">'
        if has_hdr and headers:
            html += '<thead><tr>'
            for h in headers:
                html += f'<th style="{th_css}">{h}</th>'
            html += '</tr></thead>'
        html += '<tbody>'
        for i, row in enumerate(rows):
            bg = "#f8f9fa" if stripe and i % 2 == 0 else "#ffffff"
            html += f'<tr style="background:{bg};">'
            for cell in row:
                html += f'<td style="{td_css}{border_css}">{cell}</td>'
            html += '</tr>'
        html += '</tbody></table>'
        return html

    def _render_salary_table_html(self, content: Any, branding: dict) -> str:
        if not isinstance(content, dict):
            return ""
        primary = branding.get("primary_color", "#1e3a5f")
        earnings   = content.get("earnings", [])
        deductions = content.get("deductions", [])

        def _sum(items):
            total = 0
            for item in items:
                try:
                    total += float(str(item.get("value", 0)).replace(",", "").replace("₹", "").strip() or 0)
                except (ValueError, TypeError):
                    pass
            return total

        gross  = _sum(earnings)
        deduct = _sum(deductions)
        net    = gross - deduct

        earn_rows  = "".join(f'<tr><td style="padding:6px 10px;">{e["label"]}</td><td style="padding:6px 10px;text-align:right;">₹{e.get("value","")}</td></tr>' for e in earnings)
        deduct_rows = "".join(f'<tr><td style="padding:6px 10px;">{d["label"]}</td><td style="padding:6px 10px;text-align:right;">₹{d.get("value","")}</td></tr>' for d in deductions)

        return f"""
<table class="salary-table" style="width:100%;border-collapse:collapse;margin:10px 0;">
  <thead>
    <tr>
      <th colspan="2" style="background:{primary};color:#fff;padding:8px 10px;text-align:left;">Salary Breakdown</th>
    </tr>
    <tr>
      <th style="background:{primary};color:#fff;padding:6px 10px;text-align:left;width:50%;">Earnings</th>
      <th style="background:{primary};color:#fff;padding:6px 10px;text-align:right;width:50%;">Deductions</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="vertical-align:top;padding:0;">
        <table style="width:100%;">
          {earn_rows}
          <tr class="total-row" style="font-weight:bold;background:#f0f4f8;">
            <td style="padding:7px 10px;">Gross Salary</td>
            <td style="padding:7px 10px;text-align:right;">₹{gross:,.2f}</td>
          </tr>
        </table>
      </td>
      <td style="vertical-align:top;padding:0;">
        <table style="width:100%;">
          {deduct_rows}
          <tr class="total-row" style="font-weight:bold;background:#f0f4f8;">
            <td style="padding:7px 10px;">Total Deductions</td>
            <td style="padding:7px 10px;text-align:right;">₹{deduct:,.2f}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr style="background:{primary};color:#fff;font-weight:bold;font-size:11pt;">
      <td colspan="2" style="padding:10px;">
        Net Pay: ₹{net:,.2f}
      </td>
    </tr>
  </tbody>
</table>"""

    def _render_emp_details_html(self, content: Any, props: dict, branding: dict) -> str:
        primary = branding.get("primary_color", "#1e3a5f")
        if isinstance(content, dict):
            pairs = [(k.replace("_", " ").title(), v) for k, v in content.items() if v]
        else:
            pairs = []

        rows = "".join(
            f'<tr><td style="padding:5px 10px;font-weight:600;color:{primary};width:35%;">{k}</td><td style="padding:5px 10px;">{v}</td></tr>'
            for k, v in pairs
        )
        return f'<table style="width:100%;border-collapse:collapse;margin:8px 0;border:1px solid #e2e8f0;">{rows}</table>'

    def _render_company_details_html(self, content: Any, props: dict, branding: dict) -> str:
        return self._render_emp_details_html(content, props, branding)

    def _render_inline_signature_html(self, content: Any, props: dict, branding: dict) -> str:
        primary = branding.get("primary_color", "#1e3a5f")
        if isinstance(content, list):
            sigs = content
        elif isinstance(content, dict):
            sigs = [content]
        else:
            sigs = []

        parts = []
        for sig in sigs:
            name  = sig.get("name", "")
            desig = sig.get("designation", "")
            img   = sig.get("image_url", "")
            img_html = f'<img src="{img}" style="height:40px;max-width:120px;" /><br>' if img else '<div style="height:40px;border-bottom:1px solid #333;width:120px;margin-bottom:4px;"></div>'
            parts.append(f'<div style="display:inline-block;text-align:center;margin:0 24px 0 0;">{img_html}<strong>{name}</strong><br><span style="font-size:9pt;color:#666;">{desig}</span></div>')

        return f'<div style="margin-top:30px;">' + "".join(parts) + '</div>'

    def _render_signatures_html(self, signatures: list, primary_color: str) -> str:
        if not signatures:
            return ""
        parts = []
        for sig in signatures:
            label = sig.get("label", "Authorized Signatory")
            name  = sig.get("name", "")
            desig = sig.get("designation", "")
            img   = sig.get("image_url", "")
            pos   = sig.get("position", "left")

            img_html = f'<img src="{img}" style="height:50px;max-width:150px;" /><br>' if img else '<div style="height:50px;border-bottom:2px solid #333;width:150px;margin-bottom:4px;"></div>'
            parts.append(
                f'<div style="display:inline-block;text-align:center;margin:0 40px 0 0;vertical-align:bottom;">'
                f'{img_html}'
                f'<div style="font-weight:bold;">{name or label}</div>'
                f'<div style="font-size:9pt;color:#666;">{desig}</div>'
                f'<div style="font-size:8pt;color:#999;">{label}</div>'
                f'</div>'
            )

        return f'<div style="margin-top:40px;padding-top:20px;border-top:1px solid #e2e8f0;">' + "".join(parts) + '</div>'

    # ─── Generation History ───────────────────────────────────────────────────

    async def list_generations(
        self,
        company_id: str,
        template_id: Optional[str] = None,
        employee_id: Optional[str] = None,
        page: int = 1,
        page_size: int = 20,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if template_id:
            query["template_id"] = template_id
        if employee_id:
            query["generated_for_employee_id"] = employee_id

        total = await self.db[self.GEN_COL].count_documents(query)
        skip  = (page - 1) * page_size
        cursor = self.db[self.GEN_COL].find(
            query, {"rendered_html": 0, "field_data": 0}
        ).sort("generated_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]

        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_generation(self, gen_id: str, company_id: str) -> Optional[dict]:
        doc = await self.db[self.GEN_COL].find_one(
            {"_id": gen_id, "company_id": company_id, "is_deleted": False}
        )
        return self._ser(doc) if doc else None

    # ─── Static Schema Helpers ────────────────────────────────────────────────

    @staticmethod
    def get_form_fields(doc_type: str) -> List[dict]:
        return DOCUMENT_TYPE_FIELDS.get(doc_type, DOCUMENT_TYPE_FIELDS["custom"])

    @staticmethod
    def get_placeholder_groups() -> dict:
        return PLACEHOLDER_GROUPS

    @staticmethod
    def get_doc_type_labels() -> dict:
        return DOCUMENT_TYPE_LABELS
