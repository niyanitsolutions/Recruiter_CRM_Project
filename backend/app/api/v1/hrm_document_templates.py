"""HRM — Document Template API Routes (Enterprise Edition)"""
import logging
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_document_template import (
    TemplateCreate, TemplateUpdate, GenerateDocumentRequest,
    CloneTemplateRequest, ContentBlockCreate, RestoreVersionRequest,
    DOCUMENT_TYPE_FIELDS, PLACEHOLDER_GROUPS, DOCUMENT_TYPE_LABELS,
)
from app.services.document_template_service import DocumentTemplateService
from app.services.document_generator_service import DocumentGeneratorService

router = APIRouter(prefix="/hrm/document-templates", tags=["HRM - Document Templates"])
logger = logging.getLogger(__name__)


# ─── Template CRUD ────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_template(
    data: TemplateCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    logger.info(
        "[DOC_TMPL][CREATE] user=%s company=%s name=%r doc_type=%s blocks=%d",
        cu.get("id"), cu.get("company_id"), data.name, data.doc_type,
        len(data.blocks or []),
    )
    try:
        result = await DocumentTemplateService(db).create(cu["company_id"], data, cu["id"])
        logger.info("[DOC_TMPL][CREATE] SUCCESS id=%s", result.get("id"))
        return result
    except Exception as exc:
        logger.error("[DOC_TMPL][CREATE] FAILED user=%s company=%s error=%s",
                     cu.get("id"), cu.get("company_id"), exc, exc_info=True)
        raise


@router.get("")
async def list_templates(
    doc_type:  Optional[str]  = None,
    category:  Optional[str]  = None,
    search:    Optional[str]  = None,
    is_active: Optional[bool] = None,
    page:      int = Query(1,  ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    logger.info(
        "[DOC_TMPL][LIST] user=%s company=%s doc_type=%s category=%s search=%r is_active=%s page=%d",
        cu.get("id"), cu.get("company_id"), doc_type, category, search, is_active, page,
    )
    result = await DocumentTemplateService(db).list(
        cu["company_id"], doc_type, category, search, is_active, page, page_size
    )
    logger.info("[DOC_TMPL][LIST] returned total=%s items=%d", result.get("total"), len(result.get("items", [])))
    return result


@router.get("/schema/fields")
async def get_form_fields(
    doc_type: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return the dynamic form fields for a given document type."""
    return {"doc_type": doc_type, "fields": DocumentTemplateService.get_form_fields(doc_type)}


@router.get("/schema/placeholders")
async def get_placeholder_groups(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return all placeholder groups for the template builder."""
    return DocumentTemplateService.get_placeholder_groups()


@router.get("/schema/doc-types")
async def get_doc_type_labels(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return all supported document type labels."""
    return DocumentTemplateService.get_doc_type_labels()


@router.get("/schema/all")
async def get_full_schema(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Return document type fields, placeholder groups, and labels in one call."""
    return {
        "doc_type_fields":    DOCUMENT_TYPE_FIELDS,
        "placeholder_groups": PLACEHOLDER_GROUPS,
        "doc_type_labels":    DOCUMENT_TYPE_LABELS,
    }


# ─── Auto-fill ────────────────────────────────────────────────────────────────
# NOTE: these must be registered BEFORE /{template_id} so FastAPI does not
#       capture "auto-fill" as a template_id on single-segment GET requests.

@router.get("/auto-fill/employee/{employee_id}")
async def auto_fill_employee(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    """Return auto-fill field data from an HRM employee record."""
    fields = await DocumentTemplateService(db).auto_fill_from_employee(employee_id, cu["company_id"])
    return {"employee_id": employee_id, "field_data": fields}


@router.get("/auto-fill/candidate/{candidate_id}")
async def auto_fill_candidate(
    candidate_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    """Return auto-fill field data from a candidate record."""
    fields = await DocumentTemplateService(db).auto_fill_from_candidate(candidate_id, cu["company_id"])
    return {"candidate_id": candidate_id, "field_data": fields}


# ─── Generation History ───────────────────────────────────────────────────────
# NOTE: must be before /{template_id} even though 2-segment paths don't conflict
#       today — prevents future regressions if single-segment catch-all is widened.

@router.get("/generations/history")
async def list_generation_history(
    template_id:  Optional[str] = None,
    employee_id:  Optional[str] = None,
    page:      int = Query(1,  ge=1),
    page_size: int = Query(20, ge=1, le=100),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    return await DocumentTemplateService(db).list_generations(
        cu["company_id"], template_id, employee_id, page, page_size
    )


@router.get("/generations/{gen_id}")
async def get_generation(
    gen_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    gen = await DocumentTemplateService(db).get_generation(gen_id, cu["company_id"])
    if not gen:
        raise HTTPException(status_code=404, detail="Generation record not found")
    return gen


# ─── Reusable Content Blocks ──────────────────────────────────────────────────
# CRITICAL: GET /content-blocks MUST be before GET /{template_id}.
# FastAPI matches routes in registration order; "content-blocks" is a single
# path segment that would otherwise be captured by /{template_id}, returning
# 404 "Template not found" instead of the content-blocks list.

@router.post("/content-blocks", status_code=201)
async def create_content_block(
    data: ContentBlockCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    return await DocumentTemplateService(db).create_content_block(cu["company_id"], data, cu["id"])


@router.get("/content-blocks")
async def list_content_blocks(
    category: Optional[str] = None,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    return await DocumentTemplateService(db).list_content_blocks(cu["company_id"], category)


@router.delete("/content-blocks/{block_id}", status_code=204)
async def delete_content_block(
    block_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    ok = await DocumentTemplateService(db).delete_content_block(block_id, cu["company_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Content block not found")


# ─── Template by ID (dynamic route — must stay AFTER all static-prefix routes) ─

@router.get("/{template_id}")
async def get_template(
    template_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    tmpl = await DocumentTemplateService(db).get(template_id, cu["company_id"])
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    data: TemplateUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    result = await DocumentTemplateService(db).update(template_id, cu["company_id"], data, cu["id"])
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    ok = await DocumentTemplateService(db).delete(template_id, cu["company_id"])
    if not ok:
        raise HTTPException(status_code=404, detail="Template not found")


# ─── Clone ────────────────────────────────────────────────────────────────────

@router.post("/{template_id}/clone", status_code=201)
async def clone_template(
    template_id: str,
    data: CloneTemplateRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    result = await DocumentTemplateService(db).clone(template_id, cu["company_id"], data, cu["id"])
    if not result:
        raise HTTPException(status_code=404, detail="Source template not found")
    return result


# ─── Version Control ──────────────────────────────────────────────────────────

@router.get("/{template_id}/versions")
async def get_version_history(
    template_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:view"])),
):
    return await DocumentTemplateService(db).get_version_history(template_id, cu["company_id"])


@router.post("/{template_id}/versions/restore")
async def restore_version(
    template_id: str,
    req: RestoreVersionRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:manage"])),
):
    result = await DocumentTemplateService(db).restore_version(
        template_id, cu["company_id"], req, cu["id"]
    )
    if not result:
        raise HTTPException(status_code=404, detail="Template or version not found")
    return result


# ─── Document Generation ──────────────────────────────────────────────────────

@router.post("/{template_id}/generate")
async def generate_document(
    template_id: str,
    req: GenerateDocumentRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:generate"])),
):
    """
    Generate a document from a template.
    Returns rendered HTML by default; use export_format=pdf or docx for binary.
    """
    svc = DocumentTemplateService(db)
    result = await svc.generate(template_id, cu["company_id"], req, cu["id"])
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")

    if req.export_format.lower() == "pdf":
        try:
            gen_svc = DocumentGeneratorService()
            template_doc = result["template"]
            resolved_blocks = svc.resolve_blocks(
                template_doc.get("blocks", []), result["field_data"]
            )
            pdf_bytes = gen_svc.generate_pdf(template_doc, resolved_blocks, result["field_data"])
            return Response(
                content=pdf_bytes,
                media_type="application/pdf",
                headers={"Content-Disposition": f'attachment; filename="{result["template_name"].replace(" ", "_")}.pdf"'},
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"PDF generation failed: {str(e)}")

    if req.export_format.lower() == "docx":
        try:
            gen_svc = DocumentGeneratorService()
            template_doc = result["template"]
            resolved_blocks = svc.resolve_blocks(
                template_doc.get("blocks", []), result["field_data"]
            )
            docx_bytes = gen_svc.generate_docx(template_doc, resolved_blocks, result["field_data"])
            return Response(
                content=docx_bytes,
                media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                headers={"Content-Disposition": f'attachment; filename="{result["template_name"].replace(" ", "_")}.docx"'},
            )
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"DOCX generation failed: {str(e)}")

    # Default: return HTML + metadata
    return result


@router.post("/{template_id}/export/pdf")
async def export_pdf(
    template_id: str,
    req: GenerateDocumentRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:generate"])),
):
    """Dedicated PDF export endpoint."""
    req.export_format = "pdf"
    return await generate_document(template_id, req, cu, db, None)


@router.post("/{template_id}/export/docx")
async def export_docx(
    template_id: str,
    req: GenerateDocumentRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:doc_templates:generate"])),
):
    """Dedicated DOCX export endpoint."""
    req.export_format = "docx"
    return await generate_document(template_id, req, cu, db, None)


