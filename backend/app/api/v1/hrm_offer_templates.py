"""HRM — Offer Template API Routes"""
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions
from app.models.company.hrm_offer_template import (
    OfferTemplateCreate, OfferTemplateUpdate, GenerateDocumentRequest,
)
from app.services.hrm_offer_template_service import OfferTemplateService

router = APIRouter(prefix="/hrm/offer-templates", tags=["HRM - Offer Templates"])


@router.post("", status_code=201)
async def create_template(
    data: OfferTemplateCreate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:manage"])),
):
    return await OfferTemplateService(db).create(cu["company_id"], data, cu["id"])


@router.get("")
async def list_templates(
    template_type: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:view"])),
):
    return await OfferTemplateService(db).list(cu["company_id"], template_type, page, page_size)


@router.get("/{template_id}")
async def get_template(
    template_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:view"])),
):
    tmpl = await OfferTemplateService(db).get(template_id, cu["company_id"])
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.put("/{template_id}")
async def update_template(
    template_id: str,
    data: OfferTemplateUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:manage"])),
):
    tmpl = await OfferTemplateService(db).update(template_id, cu["company_id"], data)
    if not tmpl:
        raise HTTPException(status_code=404, detail="Template not found")
    return tmpl


@router.delete("/{template_id}", status_code=204)
async def delete_template(
    template_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:manage"])),
):
    deleted = await OfferTemplateService(db).delete(template_id, cu["company_id"])
    if not deleted:
        raise HTTPException(status_code=404, detail="Template not found")


@router.post("/{template_id}/generate")
async def generate_document(
    template_id: str,
    data: GenerateDocumentRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:offer_templates:view"])),
):
    """Render a template with candidate/employee data and return the filled document."""
    fields = {
        "candidate_name":  data.candidate_name or "",
        "candidate_email": data.candidate_email or "",
        "position":        data.position or "",
        "department":      data.department or "",
        "ctc":             data.ctc or "",
        "joining_date":    data.joining_date or "",
        "company_name":    data.company_name or "",
        "manager_name":    data.manager_name or "",
        "location":        data.location or "",
        **(data.extra_fields or {}),
    }
    result = await OfferTemplateService(db).generate(template_id, cu["company_id"], fields)
    if not result:
        raise HTTPException(status_code=404, detail="Template not found")
    return result
