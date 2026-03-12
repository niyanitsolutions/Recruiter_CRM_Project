"""
Settings API - Phase 3
Handles company settings, custom fields, interview stages, email templates
"""
from fastapi import APIRouter, Depends, HTTPException, Query
from typing import Optional, List

from app.models.company.settings import (
    CustomFieldCreate, CustomFieldUpdate, CustomFieldDefinition,
    InterviewStageCreate, InterviewStageUpdate, InterviewStageDefinition,
    EmailTemplateCreate, EmailTemplateUpdate, EmailTemplate,
    CompanySettingsUpdate, CompanySettings,
    FieldType, EntityType
)
from app.services.settings_service import SettingsService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/settings", tags=["Settings"])


# ============== Custom Fields ==============

@router.get("/custom-fields")
async def list_custom_fields(
    entity_type: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:view"]))
):
    """List custom fields, optionally filtered by entity type"""
    fields = await SettingsService.list_custom_fields(db, entity_type)
    return {"success": True, "data": fields}


@router.get("/custom-fields/entity-types")
async def get_entity_types(current_user: dict = Depends(get_current_user)):
    """Get available entity types for custom fields"""
    types = [{"value": t.value, "label": t.value.title()} for t in EntityType]
    return {"success": True, "data": types}


@router.get("/custom-fields/field-types")
async def get_field_types(current_user: dict = Depends(get_current_user)):
    """Get available field types for custom fields"""
    from app.models.company.settings import FIELD_TYPE_DISPLAY
    types = [{"value": k, "label": v} for k, v in FIELD_TYPE_DISPLAY.items()]
    return {"success": True, "data": types}


@router.post("/custom-fields")
async def create_custom_field(
    field_data: CustomFieldCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Create a new custom field"""
    field = await SettingsService.create_custom_field(
        db=db,
        field_data=field_data,
        created_by=current_user["id"]
    )
    
    return {"success": True, "message": "Custom field created", "data": field}


@router.put("/custom-fields/{field_id}")
async def update_custom_field(
    field_id: str,
    update_data: CustomFieldUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Update a custom field"""
    field = await SettingsService.update_custom_field(
        db=db,
        field_id=field_id,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Custom field updated", "data": field}


@router.delete("/custom-fields/{field_id}")
async def delete_custom_field(
    field_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Delete a custom field"""
    await SettingsService.delete_custom_field(db, field_id, current_user["id"])
    return {"success": True, "message": "Custom field deleted"}


# ============== Interview Stages ==============

@router.get("/interview-stages")
async def list_interview_stages(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:view"]))
):
    """List interview stages"""
    stages = await SettingsService.list_interview_stages(db)
    return {"success": True, "data": stages}


@router.get("/interview-stages/dropdown")
async def get_interview_stages_dropdown(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interviews:view"]))
):
    """Get interview stages for dropdown"""
    stages = await SettingsService.get_interview_stages_dropdown(db)
    return {"success": True, "data": stages}


@router.post("/interview-stages/initialize")
async def initialize_interview_stages(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:create"]))
):
    """Initialize default interview stages (first-time setup)"""
    stages = await SettingsService.initialize_interview_stages(db, current_user["id"])
    return {"success": True, "message": "Interview stages initialized", "data": stages}


@router.post("/interview-stages")
async def create_interview_stage(
    stage_data: InterviewStageCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:create"]))
):
    """Create a new interview stage"""
    stage = await SettingsService.create_interview_stage(
        db=db,
        stage_data=stage_data,
        created_by=current_user["id"]
    )
    
    return {"success": True, "message": "Interview stage created", "data": stage}


@router.put("/interview-stages/{stage_id}")
async def update_interview_stage(
    stage_id: str,
    update_data: InterviewStageUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:edit"]))
):
    """Update an interview stage"""
    stage = await SettingsService.update_interview_stage(
        db=db,
        stage_id=stage_id,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Interview stage updated", "data": stage}


@router.delete("/interview-stages/{stage_id}")
async def delete_interview_stage(
    stage_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:delete"]))
):
    """Delete an interview stage"""
    await SettingsService.delete_interview_stage(db, stage_id, current_user["id"])
    return {"success": True, "message": "Interview stage deleted"}


@router.put("/interview-stages/reorder")
async def reorder_interview_stages(
    stage_orders: List[dict],  # [{"id": "...", "order": 1}, ...]
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["interview_settings:edit"]))
):
    """Reorder interview stages"""
    stages = await SettingsService.reorder_interview_stages(
        db=db,
        stage_orders=stage_orders,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Stages reordered", "data": stages}


# ============== Email Templates ==============

@router.get("/email-templates")
async def list_email_templates(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:view"]))
):
    """List email templates"""
    templates = await SettingsService.list_email_templates(db)
    return {"success": True, "data": templates}


@router.post("/email-templates/initialize")
async def initialize_email_templates(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Initialize default email templates"""
    templates = await SettingsService.initialize_email_templates(db, current_user["id"])
    return {"success": True, "message": "Email templates initialized", "data": templates}


@router.get("/email-templates/{template_code}")
async def get_email_template(
    template_code: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:view"]))
):
    """Get email template by code"""
    template = await SettingsService.get_email_template(db, template_code)
    if not template:
        raise HTTPException(status_code=404, detail="Template not found")
    return {"success": True, "data": template}


@router.put("/email-templates/{template_id}")
async def update_email_template(
    template_id: str,
    update_data: EmailTemplateUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Update an email template"""
    template = await SettingsService.update_email_template(
        db=db,
        template_id=template_id,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Email template updated", "data": template}


# ============== Company Settings ==============

@router.get("/company")
async def get_company_settings(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:view"]))
):
    """Get company settings"""
    settings = await SettingsService.get_company_settings(db)
    return {"success": True, "data": settings}


@router.put("/company")
async def update_company_settings(
    update_data: CompanySettingsUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["crm_settings:edit"]))
):
    """Update company settings"""
    settings = await SettingsService.update_company_settings(
        db=db,
        update_data=update_data,
        updated_by=current_user["id"]
    )
    
    return {"success": True, "message": "Company settings updated", "data": settings}