"""
Document Center API - v1
REST endpoints for the HR Document Management System.
"""
import logging
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File, Form
from fastapi.responses import Response

logger = logging.getLogger(__name__)

from app.core.dependencies import get_current_user, get_company_db, require_permissions, require_any_permission
from app.models.company.document_center import (
    DocCategoryCreate, DocCategoryUpdate,
    DocTemplateCreate, DocTemplateUpdate,
    DocGenerateRequest,
    DocApprovalCreate, DocApprovalReview,
)
from app.services.document_center_service import document_center_service

router = APIRouter(prefix="/doc-center", tags=["Document Center"])

# Permission callables — accept both legacy docs: strings and new documents: strings
PERM_VIEW     = require_any_permission([["docs:view"],     ["documents:view"]])
PERM_CREATE   = require_any_permission([["docs:create"],   ["documents:create"]])
PERM_DELETE   = require_permissions("docs:delete")
PERM_GENERATE = require_permissions("docs:generate")
PERM_APPROVE  = require_permissions("docs:approve")
PERM_MANAGE   = require_any_permission([["docs:manage"],   ["documents:edit"]])


# ═══════════════════════════════════════════════════════════════════════════════
# CATEGORIES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/categories")
async def list_categories(
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    cats = await document_center_service.list_categories(db)
    return {"success": True, "data": cats}


@router.post("/categories", status_code=201)
async def create_category(
    data: DocCategoryCreate,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    cat = await document_center_service.create_category(db, data, user["_id"])
    return {"success": True, "message": "Category created", "data": cat}


@router.put("/categories/{category_id}")
async def update_category(
    category_id: str,
    data: DocCategoryUpdate,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg = await document_center_service.update_category(db, category_id, data)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}


@router.delete("/categories/{category_id}")
async def delete_category(
    category_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_DELETE),
):
    ok, msg = await document_center_service.delete_category(db, category_id)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}


# ═══════════════════════════════════════════════════════════════════════════════
# TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/templates")
async def list_templates(
    category_id:   Optional[str]  = Query(None),
    status:        Optional[str]  = Query(None),
    template_type: Optional[str]  = Query(None),
    is_favorite:   Optional[bool] = Query(None),
    is_archived:   Optional[bool] = Query(None),
    search:        Optional[str]  = Query(None),
    tags:          Optional[str]  = Query(None),
    skip:          int            = Query(0, ge=0),
    limit:         int            = Query(50, le=200),
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    tag_list = [t.strip() for t in tags.split(",")] if tags else None
    docs, total = await document_center_service.list_templates(
        db,
        category_id=category_id,
        status=status,
        template_type=template_type,
        is_favorite=is_favorite,
        is_archived=is_archived,
        search=search,
        tags=tag_list,
        skip=skip,
        limit=limit,
    )
    return {"success": True, "data": {"templates": docs, "total": total, "skip": skip, "limit": limit}}


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    doc = await document_center_service.get_template(db, template_id)
    if not doc:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True, "data": doc}


@router.post("/templates", status_code=201)
async def create_template(
    data: DocTemplateCreate,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    try:
        doc = await document_center_service.create_template(
            db, data,
            user["_id"],
            user.get("full_name", user.get("username", "")),
        )
        return {"success": True, "message": "Template created", "data": doc}
    except Exception as exc:
        logger.error("create_template failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to create template: {exc}")


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    data: DocTemplateUpdate,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    try:
        ok, msg = await document_center_service.update_template(
            db, template_id, data,
            user["_id"],
            user.get("full_name", user.get("username", "")),
        )
        if not ok:
            raise HTTPException(status_code=404, detail=msg)
        return {"success": True, "message": msg}
    except HTTPException:
        raise
    except Exception as exc:
        logger.error("update_template(%s) failed: %s", template_id, exc, exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to update template: {exc}")


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_DELETE),
):
    ok, msg = await document_center_service.delete_template(db, template_id)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}


@router.post("/templates/{template_id}/duplicate", status_code=201)
async def duplicate_template(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg, doc = await document_center_service.duplicate_template(
        db, template_id,
        user["_id"],
        user.get("full_name", user.get("username", "")),
    )
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg, "data": doc}


@router.post("/templates/{template_id}/favorite")
async def toggle_favorite(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    ok, msg, new_val = await document_center_service.toggle_favorite(db, template_id)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg, "is_favorite": new_val}


# ── Version History ────────────────────────────────────────────────────────────

@router.get("/templates/{template_id}/versions")
async def list_versions(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    versions = await document_center_service.list_versions(db, template_id)
    return {"success": True, "data": versions}


@router.post("/templates/{template_id}/versions/{version_id}/restore")
async def restore_version(
    template_id: str,
    version_id:  str,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg = await document_center_service.restore_version(
        db, template_id, version_id,
        user["_id"], user.get("full_name", ""),
    )
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}


@router.delete("/templates/{template_id}/versions/{version_id}")
async def delete_version(
    template_id: str,
    version_id:  str,
    db   = Depends(get_company_db),
    user = Depends(PERM_DELETE),
):
    ok, msg = await document_center_service.delete_version(db, template_id, version_id)
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT GENERATION
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/generate")
async def generate_document(
    req:  DocGenerateRequest,
    db   = Depends(get_company_db),
    user = Depends(PERM_GENERATE),
):
    ok, msg, doc = await document_center_service.generate_document(
        db, req,
        user["_id"],
        user.get("full_name", user.get("username", "")),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    doc.pop("_pdf_bytes",  None)
    doc.pop("_docx_bytes", None)
    return {"success": True, "message": msg, "data": doc}


@router.get("/generate/{doc_id}/pdf")
async def download_pdf(
    doc_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    gen = await db.doc_generated.find_one({"_id": doc_id, "is_deleted": {"$ne": True}})
    if not gen:
        raise HTTPException(status_code=404, detail="Document not found")

    if gen.get("pdf_url"):
        return {"success": True, "pdf_url": gen["pdf_url"]}

    tmpl = await db.doc_templates.find_one({"_id": gen["template_id"]})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    from app.models.company.document_center import TemplateContent, DocTemplate as DocTemplateModel
    content_obj = TemplateContent(**tmpl.get("content", {}))
    tmpl_obj    = DocTemplateModel(**{**tmpl, "content": content_obj})

    from app.services.document_center_service import _generate_pdf
    pdf_bytes = _generate_pdf(tmpl_obj, gen.get("html_content", ""), gen.get("field_values", {}))
    filename  = gen.get("document_name", "document").replace(" ", "_")
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}.pdf"'},
    )


@router.get("/generate/{doc_id}/docx")
async def download_docx(
    doc_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    gen = await db.doc_generated.find_one({"_id": doc_id, "is_deleted": {"$ne": True}})
    if not gen:
        raise HTTPException(status_code=404, detail="Document not found")

    tmpl = await db.doc_templates.find_one({"_id": gen["template_id"]})
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")

    from app.models.company.document_center import TemplateContent, DocTemplate as DocTemplateModel
    content_obj = TemplateContent(**tmpl.get("content", {}))
    tmpl_obj    = DocTemplateModel(**{**tmpl, "content": content_obj})

    from app.services.document_center_service import _generate_docx
    docx_bytes = _generate_docx(tmpl_obj, gen.get("html_content", ""), gen.get("field_values", {}))
    filename   = gen.get("document_name", "document").replace(" ", "_")
    return Response(
        content=docx_bytes,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}.docx"'},
    )


@router.get("/generated")
async def list_generated(
    template_id: Optional[str]  = Query(None),
    employee_id: Optional[str]  = Query(None),
    status:      Optional[str]  = Query(None),
    search:      Optional[str]  = Query(None),
    skip:        int             = Query(0, ge=0),
    limit:       int             = Query(50, le=200),
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    docs, total = await document_center_service.list_generated(
        db,
        template_id=template_id,
        employee_id=employee_id,
        status=status,
        search=search,
        skip=skip,
        limit=limit,
    )
    return {"success": True, "data": {"documents": docs, "total": total}}


@router.post("/generated/{doc_id}/archive")
async def archive_generated(
    doc_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    from datetime import datetime, timezone
    result = await db.doc_generated.update_one(
        {"_id": doc_id, "is_deleted": {"$ne": True}},
        {"$set": {"status": "archived", "updated_at": datetime.now(timezone.utc)}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Document not found")
    return {"success": True, "message": "Document archived"}


@router.delete("/generated/{doc_id}")
async def delete_generated(
    doc_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_DELETE),
):
    ok, msg = await document_center_service.delete_generated(db, doc_id)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}


# ═══════════════════════════════════════════════════════════════════════════════
# APPROVALS
# ═══════════════════════════════════════════════════════════════════════════════

@router.post("/approvals")
async def request_approval(
    data: DocApprovalCreate,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg, doc = await document_center_service.request_approval(
        db, data, user["_id"], user.get("full_name", ""),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "data": doc}


@router.get("/approvals")
async def list_approvals(
    status: Optional[str] = Query(None),
    mine:   bool          = Query(False),
    skip:   int           = Query(0, ge=0),
    limit:  int           = Query(50, le=200),
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    user_filter = user["_id"] if mine else None
    docs, total = await document_center_service.list_approvals(
        db, status=status, user_id=user_filter, skip=skip, limit=limit,
    )
    return {"success": True, "data": {"approvals": docs, "total": total}}


@router.post("/approvals/{approval_id}/review")
async def review_approval(
    approval_id: str,
    data: DocApprovalReview,
    db   = Depends(get_company_db),
    user = Depends(PERM_APPROVE),
):
    ok, msg = await document_center_service.review_approval(
        db, approval_id, data, user["_id"], user.get("full_name", ""),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg}


# ═══════════════════════════════════════════════════════════════════════════════
# IMPORT
# ═══════════════════════════════════════════════════════════════════════════════

ALLOWED_EXTENSIONS = {"pdf", "docx", "html", "htm"}


@router.post("/import", status_code=201)
async def import_document(
    file:        UploadFile     = File(...),
    name:        str            = Form(...),
    description: str            = Form(""),
    category_id: Optional[str] = Form(None),
    tags:        str            = Form(""),
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ext = (file.filename or "").rsplit(".", 1)[-1].lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    file_type = "html" if ext in ("html", "htm") else ext

    contents = await file.read()
    if len(contents) > 20 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large (max 20 MB)")

    tag_list = [t.strip() for t in tags.split(",") if t.strip()] if tags else []
    ok, msg, doc = await document_center_service.import_file(
        db,
        filename=file.filename or "document",
        file_bytes=contents,
        file_type=file_type,
        name=name,
        description=description,
        category_id=category_id or None,
        tags=tag_list,
        user_id=user["_id"],
        user_name=user.get("full_name", ""),
    )
    if not ok:
        raise HTTPException(status_code=400, detail=msg)
    return {"success": True, "message": msg, "data": doc}


# ═══════════════════════════════════════════════════════════════════════════════
# GLOBAL VERSION HISTORY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/versions")
async def list_all_versions(
    template_id: Optional[str] = Query(None),
    search:      Optional[str] = Query(None),
    skip:        int            = Query(0, ge=0),
    limit:       int            = Query(50, le=200),
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    docs, total = await document_center_service.list_all_versions(
        db, template_id=template_id, search=search, skip=skip, limit=limit,
    )
    return {"success": True, "data": {"versions": docs, "total": total}}


# ═══════════════════════════════════════════════════════════════════════════════
# TEMPLATE LIBRARY
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/library")
async def get_library(
    user = Depends(PERM_VIEW),
):
    items = document_center_service.get_library_list()
    return {"success": True, "data": items}


@router.post("/library/{key}/create")
async def create_from_library(
    key:         str,
    category_id: Optional[str] = Query(None),
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg, doc = await document_center_service.create_from_library(
        db, key, user["_id"], user.get("full_name", ""), category_id=category_id,
    )
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg, "data": doc}


# ═══════════════════════════════════════════════════════════════════════════════
# ARCHIVE
# ═══════════════════════════════════════════════════════════════════════════════

@router.get("/archive")
async def list_archive(
    skip:  int = Query(0, ge=0),
    limit: int = Query(50, le=200),
    db   = Depends(get_company_db),
    user = Depends(PERM_VIEW),
):
    docs, total = await document_center_service.list_archived(db, skip=skip, limit=limit)
    return {"success": True, "data": {"templates": docs, "total": total}}


@router.post("/archive/{template_id}/restore")
async def unarchive(
    template_id: str,
    db   = Depends(get_company_db),
    user = Depends(PERM_CREATE),
):
    ok, msg = await document_center_service.unarchive_template(db, template_id)
    if not ok:
        raise HTTPException(status_code=404, detail=msg)
    return {"success": True, "message": msg}
