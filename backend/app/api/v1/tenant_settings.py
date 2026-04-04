"""
Tenant Settings API - Phase 6
Complete settings module for tenant admins covering:
  Teams, Branches, Pipeline Stages, Job Categories, Skills,
  Invoice Settings, Commission Rules, Currency/Localization,
  Email Config, Notification Matrix, Security, Data Management,
  Branding, SLA Config, Document Templates, Resume Parsing Rules,
  Interview Settings (extended)
"""
from datetime import datetime, timezone
from typing import List, Optional, Any, Dict
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from bson import ObjectId

from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/tenant-settings", tags=["Tenant Settings"])


# ── Helpers ───────────────────────────────────────────────────────────────────

def _now() -> datetime:
    return datetime.now(timezone.utc)


def _oid() -> str:
    return str(ObjectId())


def _doc_to_dict(doc: dict) -> dict:
    if doc is None:
        return {}
    d = dict(doc)
    if "_id" in d:
        d["id"] = str(d.pop("_id"))
    return d


async def _get_setting(db, company_id: str, key: str) -> dict:
    doc = await db.tenant_settings.find_one({"company_id": company_id, "key": key})
    return _doc_to_dict(doc) if doc else {}


async def _save_setting(db, company_id: str, key: str, data: dict, user_id: str) -> dict:
    now = _now()
    existing = await db.tenant_settings.find_one({"company_id": company_id, "key": key})
    update_data = {**data, "company_id": company_id, "key": key, "updated_at": now, "updated_by": user_id}
    if existing:
        await db.tenant_settings.update_one(
            {"company_id": company_id, "key": key},
            {"$set": update_data}
        )
    else:
        update_data["created_at"] = now
        update_data["created_by"] = user_id
        await db.tenant_settings.insert_one(update_data)
    doc = await db.tenant_settings.find_one({"company_id": company_id, "key": key})
    return _doc_to_dict(doc)


# ═══════════════════════════════════════════════════════════════════════════════
# TEAMS
# ═══════════════════════════════════════════════════════════════════════════════

class TeamCreate(BaseModel):
    name: str
    team_lead: Optional[str] = None
    members: List[str] = []
    department: Optional[str] = None
    description: Optional[str] = None


class TeamUpdate(BaseModel):
    name: Optional[str] = None
    team_lead: Optional[str] = None
    members: Optional[List[str]] = None
    department: Optional[str] = None
    description: Optional[str] = None


@router.get("/teams")
async def list_teams(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.teams.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    teams = [_doc_to_dict(t) async for t in cursor]
    return {"success": True, "data": teams}


@router.post("/teams", status_code=201)
async def create_team(
    data: TeamCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {
        **data.model_dump(),
        "company_id": company_id,
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await db.teams.insert_one(doc)
    created = await db.teams.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Team created"}


@router.put("/teams/{team_id}")
async def update_team(
    team_id: str,
    data: TeamUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.teams.update_one(
        {"_id": ObjectId(team_id), "company_id": company_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Team not found")
    updated = await db.teams.find_one({"_id": ObjectId(team_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Team updated"}


@router.delete("/teams/{team_id}")
async def delete_team(
    team_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.teams.update_one(
        {"_id": ObjectId(team_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Team not found")
    return {"success": True, "message": "Team deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# BRANCHES
# ═══════════════════════════════════════════════════════════════════════════════

class BranchCreate(BaseModel):
    branch_name: str
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: bool = True
    is_head_office: bool = False


class BranchUpdate(BaseModel):
    branch_name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    country: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    is_active: Optional[bool] = None
    is_head_office: Optional[bool] = None


@router.get("/branches")
async def list_branches(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.branches.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    branches = [_doc_to_dict(b) async for b in cursor]
    return {"success": True, "data": branches}


@router.post("/branches", status_code=201)
async def create_branch(
    data: BranchCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    # Ensure only one head office
    if data.is_head_office:
        await db.branches.update_many(
            {"company_id": company_id, "is_head_office": True},
            {"$set": {"is_head_office": False}}
        )
    doc = {
        **data.model_dump(),
        "company_id": company_id,
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await db.branches.insert_one(doc)
    created = await db.branches.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Branch created"}


@router.put("/branches/{branch_id}")
async def update_branch(
    branch_id: str,
    data: BranchUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    if data.is_head_office is True:
        await db.branches.update_many(
            {"company_id": company_id, "is_head_office": True},
            {"$set": {"is_head_office": False}}
        )
    update["updated_at"] = _now()
    result = await db.branches.update_one(
        {"_id": ObjectId(branch_id), "company_id": company_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Branch not found")
    updated = await db.branches.find_one({"_id": ObjectId(branch_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Branch updated"}


@router.delete("/branches/{branch_id}")
async def delete_branch(
    branch_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.branches.update_one(
        {"_id": ObjectId(branch_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Branch not found")
    return {"success": True, "message": "Branch deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# PIPELINE STAGES
# ═══════════════════════════════════════════════════════════════════════════════

class PipelineStageCreate(BaseModel):
    name: str
    color: str = "#6366f1"
    order: int = 0
    is_enabled: bool = True
    is_terminal: bool = False
    description: Optional[str] = None


class PipelineStageUpdate(BaseModel):
    name: Optional[str] = None
    color: Optional[str] = None
    order: Optional[int] = None
    is_enabled: Optional[bool] = None
    is_terminal: Optional[bool] = None
    description: Optional[str] = None


class PipelineStagesReorder(BaseModel):
    stage_ids: List[str]  # Ordered list of IDs


@router.get("/pipeline-stages")
async def list_pipeline_stages(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.pipeline_stages.find(
        {"company_id": company_id, "is_deleted": {"$ne": True}},
        sort=[("order", 1)]
    )
    stages = [_doc_to_dict(s) async for s in cursor]
    return {"success": True, "data": stages}


@router.post("/pipeline-stages", status_code=201)
async def create_pipeline_stage(
    data: PipelineStageCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    # Auto-set order to last position if not specified
    count = await db.pipeline_stages.count_documents({"company_id": company_id, "is_deleted": {"$ne": True}})
    doc = {
        **data.model_dump(),
        "order": data.order if data.order > 0 else count,
        "company_id": company_id,
        "created_by": current_user["id"],
        "created_at": _now(),
        "updated_at": _now(),
    }
    result = await db.pipeline_stages.insert_one(doc)
    created = await db.pipeline_stages.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Pipeline stage created"}


@router.put("/pipeline-stages/reorder")
async def reorder_pipeline_stages(
    data: PipelineStagesReorder,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    for idx, stage_id in enumerate(data.stage_ids):
        await db.pipeline_stages.update_one(
            {"_id": ObjectId(stage_id), "company_id": company_id},
            {"$set": {"order": idx, "updated_at": _now()}}
        )
    return {"success": True, "message": "Stages reordered"}


@router.put("/pipeline-stages/{stage_id}")
async def update_pipeline_stage(
    stage_id: str,
    data: PipelineStageUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.pipeline_stages.update_one(
        {"_id": ObjectId(stage_id), "company_id": company_id},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Stage not found")
    updated = await db.pipeline_stages.find_one({"_id": ObjectId(stage_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Stage updated"}


@router.delete("/pipeline-stages/{stage_id}")
async def delete_pipeline_stage(
    stage_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.pipeline_stages.update_one(
        {"_id": ObjectId(stage_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Stage not found")
    return {"success": True, "message": "Stage deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# JOB CATEGORIES & SKILLS
# ═══════════════════════════════════════════════════════════════════════════════

class JobCategoryCreate(BaseModel):
    name: str
    parent_id: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class JobCategoryUpdate(BaseModel):
    name: Optional[str] = None
    parent_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


class SkillCreate(BaseModel):
    name: str
    category_id: Optional[str] = None
    description: Optional[str] = None
    is_active: bool = True


class SkillUpdate(BaseModel):
    name: Optional[str] = None
    category_id: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/job-categories")
async def list_job_categories(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.job_categories.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    cats = [_doc_to_dict(c) async for c in cursor]
    return {"success": True, "data": cats}


@router.post("/job-categories", status_code=201)
async def create_job_category(
    data: JobCategoryCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {**data.model_dump(), "company_id": company_id, "created_by": current_user["id"],
           "created_at": _now(), "updated_at": _now()}
    result = await db.job_categories.insert_one(doc)
    created = await db.job_categories.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Category created"}


@router.put("/job-categories/{cat_id}")
async def update_job_category(
    cat_id: str,
    data: JobCategoryUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.job_categories.update_one(
        {"_id": ObjectId(cat_id), "company_id": company_id}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Category not found")
    updated = await db.job_categories.find_one({"_id": ObjectId(cat_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Category updated"}


@router.delete("/job-categories/{cat_id}")
async def delete_job_category(
    cat_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.job_categories.update_one(
        {"_id": ObjectId(cat_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Category not found")
    return {"success": True, "message": "Category deleted"}


@router.get("/skills")
async def list_skills(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.skills.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    skills = [_doc_to_dict(s) async for s in cursor]
    return {"success": True, "data": skills}


@router.post("/skills", status_code=201)
async def create_skill(
    data: SkillCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {**data.model_dump(), "company_id": company_id, "created_by": current_user["id"],
           "created_at": _now(), "updated_at": _now()}
    result = await db.skills.insert_one(doc)
    created = await db.skills.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Skill created"}


@router.put("/skills/{skill_id}")
async def update_skill(
    skill_id: str,
    data: SkillUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.skills.update_one(
        {"_id": ObjectId(skill_id), "company_id": company_id}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Skill not found")
    updated = await db.skills.find_one({"_id": ObjectId(skill_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Skill updated"}


@router.delete("/skills/{skill_id}")
async def delete_skill(
    skill_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.skills.update_one(
        {"_id": ObjectId(skill_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Skill not found")
    return {"success": True, "message": "Skill deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# DOCUMENT TEMPLATES
# ═══════════════════════════════════════════════════════════════════════════════

class DocumentTemplateCreate(BaseModel):
    name: str
    type: str = "offer_letter"  # offer_letter, nda, appointment, experience
    content: str = ""
    placeholders: List[str] = []
    is_active: bool = True


class DocumentTemplateUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    content: Optional[str] = None
    placeholders: Optional[List[str]] = None
    is_active: Optional[bool] = None


@router.get("/document-templates")
async def list_document_templates(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.document_templates.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    templates = [_doc_to_dict(t) async for t in cursor]
    return {"success": True, "data": templates}


@router.post("/document-templates", status_code=201)
async def create_document_template(
    data: DocumentTemplateCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {**data.model_dump(), "company_id": company_id, "created_by": current_user["id"],
           "created_at": _now(), "updated_at": _now()}
    result = await db.document_templates.insert_one(doc)
    created = await db.document_templates.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Template created"}


@router.put("/document-templates/{tmpl_id}")
async def update_document_template(
    tmpl_id: str,
    data: DocumentTemplateUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.document_templates.update_one(
        {"_id": ObjectId(tmpl_id), "company_id": company_id}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Template not found")
    updated = await db.document_templates.find_one({"_id": ObjectId(tmpl_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Template updated"}


@router.delete("/document-templates/{tmpl_id}")
async def delete_document_template(
    tmpl_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.document_templates.update_one(
        {"_id": ObjectId(tmpl_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Template not found")
    return {"success": True, "message": "Template deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# COMMISSION RULES
# ═══════════════════════════════════════════════════════════════════════════════

class SlabEntry(BaseModel):
    from_amount: float
    to_amount: Optional[float] = None
    rate: float


class CommissionRuleCreate(BaseModel):
    name: str
    type: str = "percentage"  # percentage | fixed | slab
    rate: Optional[float] = None
    fixed_amount: Optional[float] = None
    slabs: List[SlabEntry] = []
    applicable_to: str = "all"  # all | permanent | contract
    is_active: bool = True


class CommissionRuleUpdate(BaseModel):
    name: Optional[str] = None
    type: Optional[str] = None
    rate: Optional[float] = None
    fixed_amount: Optional[float] = None
    slabs: Optional[List[SlabEntry]] = None
    applicable_to: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/commission-rules")
async def list_commission_rules(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.commission_rules.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    rules = [_doc_to_dict(r) async for r in cursor]
    return {"success": True, "data": rules}


@router.post("/commission-rules", status_code=201)
async def create_commission_rule(
    data: CommissionRuleCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {**data.model_dump(), "company_id": company_id, "created_by": current_user["id"],
           "created_at": _now(), "updated_at": _now()}
    result = await db.commission_rules.insert_one(doc)
    created = await db.commission_rules.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "Commission rule created"}


@router.put("/commission-rules/{rule_id}")
async def update_commission_rule(
    rule_id: str,
    data: CommissionRuleUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.commission_rules.update_one(
        {"_id": ObjectId(rule_id), "company_id": company_id}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Rule not found")
    updated = await db.commission_rules.find_one({"_id": ObjectId(rule_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Rule updated"}


@router.delete("/commission-rules/{rule_id}")
async def delete_commission_rule(
    rule_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.commission_rules.update_one(
        {"_id": ObjectId(rule_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Rule not found")
    return {"success": True, "message": "Rule deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# SINGLE-DOC SETTINGS (GET + PUT pattern)
# ═══════════════════════════════════════════════════════════════════════════════

# ── Invoice Settings ──────────────────────────────────────────────────────────

class InvoiceSettingsRequest(BaseModel):
    prefix: str = "INV"
    next_number: int = 1001
    tax_type: str = "GST"
    tax_rate: float = 18.0
    payment_terms: str = "Net 30"
    bank_name: Optional[str] = None
    bank_account: Optional[str] = None
    bank_ifsc: Optional[str] = None
    bank_branch: Optional[str] = None
    footer_notes: Optional[str] = None
    due_days: int = 30


@router.get("/invoice-settings")
async def get_invoice_settings(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "invoice_settings")
    return {"success": True, "data": data}


@router.put("/invoice-settings")
async def save_invoice_settings(
    data: InvoiceSettingsRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "invoice_settings", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Invoice settings saved"}


# ── Currency & Localization ───────────────────────────────────────────────────

class LocalizationRequest(BaseModel):
    currency: str = "INR"
    currency_symbol: str = "₹"
    date_format: str = "DD/MM/YYYY"
    timezone: str = "Asia/Kolkata"
    number_format: str = "en-IN"
    fiscal_year_start: str = "April"
    language: str = "en"


@router.get("/localization")
async def get_localization(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "localization")
    return {"success": True, "data": data}


@router.put("/localization")
async def save_localization(
    data: LocalizationRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "localization", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Localization settings saved"}


# ── Email Configuration ───────────────────────────────────────────────────────

class EmailConfigRequest(BaseModel):
    smtp_host: Optional[str] = None
    smtp_port: int = 587
    smtp_username: Optional[str] = None
    smtp_password: Optional[str] = None
    smtp_use_tls: bool = True
    from_name: Optional[str] = None
    from_email: Optional[str] = None
    reply_to: Optional[str] = None
    is_enabled: bool = False


@router.get("/email-config")
async def get_email_config(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "email_config")
    # Mask password in response
    if data.get("smtp_password"):
        data["smtp_password"] = "••••••••"
    return {"success": True, "data": data}


@router.put("/email-config")
async def save_email_config(
    data: EmailConfigRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    payload = data.model_dump()
    # Don't overwrite password if masked placeholder was sent
    if payload.get("smtp_password") == "••••••••":
        existing = await _get_setting(db, company_id, "email_config")
        payload["smtp_password"] = existing.get("smtp_password")
    saved = await _save_setting(db, company_id, "email_config", payload, current_user["id"])
    if saved.get("smtp_password"):
        saved["smtp_password"] = "••••••••"
    return {"success": True, "data": saved, "message": "Email configuration saved"}


# ── Notification Matrix ───────────────────────────────────────────────────────

class NotificationMatrixRequest(BaseModel):
    matrix: Dict[str, Dict[str, bool]] = {}
    # e.g. {"new_candidate": {"email": true, "in_app": false}, ...}


@router.get("/notification-matrix")
async def get_notification_matrix(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "notification_matrix")
    return {"success": True, "data": data}


@router.put("/notification-matrix")
async def save_notification_matrix(
    data: NotificationMatrixRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "notification_matrix", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Notification settings saved"}


# ── Security Settings ─────────────────────────────────────────────────────────

class SecuritySettingsRequest(BaseModel):
    min_password_length: int = 8
    require_uppercase: bool = True
    require_lowercase: bool = True
    require_numbers: bool = True
    require_symbols: bool = False
    password_expiry_days: int = 90
    max_login_attempts: int = 5
    lockout_duration_minutes: int = 30
    two_factor_enabled: bool = False
    session_timeout_minutes: int = 480
    ip_whitelist: List[str] = []
    force_password_change: bool = False


@router.get("/security-settings")
async def get_security_settings(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "security_settings")
    return {"success": True, "data": data}


@router.put("/security-settings")
async def save_security_settings(
    data: SecuritySettingsRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "security_settings", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Security settings saved"}


# ── Resume Parsing Rules ──────────────────────────────────────────────────────

class ResumeParsingRequest(BaseModel):
    auto_parse: bool = True
    duplicate_detection: bool = True
    duplicate_threshold: int = 80
    whitelist_skills: List[str] = []
    blacklist_skills: List[str] = []
    extract_contact: bool = True
    extract_education: bool = True
    extract_experience: bool = True
    extract_skills: bool = True
    min_experience_years: int = 0


@router.get("/resume-parsing")
async def get_resume_parsing(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "resume_parsing")
    return {"success": True, "data": data}


@router.put("/resume-parsing")
async def save_resume_parsing(
    data: ResumeParsingRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "resume_parsing", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Resume parsing rules saved"}


# ── Interview Settings ────────────────────────────────────────────────────────

class InterviewRoundType(BaseModel):
    name: str
    is_enabled: bool = True


class InterviewSettingsRequest(BaseModel):
    round_types: List[InterviewRoundType] = []
    default_duration_minutes: int = 60
    buffer_time_minutes: int = 15
    auto_calendar_invite: bool = False
    reminder_hours_before: List[int] = [24, 1]
    feedback_required: bool = True
    feedback_questions: List[str] = []
    allow_reschedule: bool = True
    max_reschedule_count: int = 2


@router.get("/interview-settings")
async def get_interview_settings(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "interview_settings_ext")
    return {"success": True, "data": data}


@router.put("/interview-settings")
async def save_interview_settings(
    data: InterviewSettingsRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "interview_settings_ext", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Interview settings saved"}


# ── Branding ──────────────────────────────────────────────────────────────────

class BrandingRequest(BaseModel):
    primary_color: str = "#6366f1"
    secondary_color: str = "#8b5cf6"
    accent_color: str = "#f59e0b"
    logo_url: Optional[str] = None
    favicon_url: Optional[str] = None
    login_banner_url: Optional[str] = None
    login_banner_text: Optional[str] = None
    company_tagline: Optional[str] = None
    footer_text: Optional[str] = None
    dark_mode_enabled: bool = False


@router.get("/branding")
async def get_branding(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "branding")
    return {"success": True, "data": data}


@router.put("/branding")
async def save_branding(
    data: BrandingRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "branding", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Branding settings saved"}


# ── SLA Configuration ─────────────────────────────────────────────────────────

class EscalationLevel(BaseModel):
    level: int
    notify_role: str
    after_hours: int


class SLARuleCreate(BaseModel):
    name: str
    entity: str = "job"  # job | candidate | client | application
    metric: str = "time_to_fill"
    target_days: int
    warning_days: int
    escalation_levels: List[EscalationLevel] = []
    is_active: bool = True


class SLARuleUpdate(BaseModel):
    name: Optional[str] = None
    entity: Optional[str] = None
    metric: Optional[str] = None
    target_days: Optional[int] = None
    warning_days: Optional[int] = None
    escalation_levels: Optional[List[EscalationLevel]] = None
    is_active: Optional[bool] = None


@router.get("/sla-rules")
async def list_sla_rules(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    cursor = db.sla_rules.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    rules = [_doc_to_dict(r) async for r in cursor]
    return {"success": True, "data": rules}


@router.post("/sla-rules", status_code=201)
async def create_sla_rule(
    data: SLARuleCreate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    doc = {**data.model_dump(), "company_id": company_id, "created_by": current_user["id"],
           "created_at": _now(), "updated_at": _now()}
    result = await db.sla_rules.insert_one(doc)
    created = await db.sla_rules.find_one({"_id": result.inserted_id})
    return {"success": True, "data": _doc_to_dict(created), "message": "SLA rule created"}


@router.put("/sla-rules/{rule_id}")
async def update_sla_rule(
    rule_id: str,
    data: SLARuleUpdate,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump().items() if v is not None}
    update["updated_at"] = _now()
    result = await db.sla_rules.update_one(
        {"_id": ObjectId(rule_id), "company_id": company_id}, {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "SLA rule not found")
    updated = await db.sla_rules.find_one({"_id": ObjectId(rule_id)})
    return {"success": True, "data": _doc_to_dict(updated), "message": "SLA rule updated"}


@router.delete("/sla-rules/{rule_id}")
async def delete_sla_rule(
    rule_id: str,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.sla_rules.update_one(
        {"_id": ObjectId(rule_id), "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "SLA rule not found")
    return {"success": True, "message": "SLA rule deleted"}


# ── Data Management ───────────────────────────────────────────────────────────

class DataManagementRequest(BaseModel):
    auto_backup: bool = False
    backup_frequency: str = "weekly"  # daily | weekly | monthly
    backup_retention_days: int = 90
    candidate_retention_years: int = 5
    audit_log_retention_years: int = 3
    gdpr_enabled: bool = False
    auto_delete_inactive_candidates: bool = False
    inactive_candidate_days: int = 365
    anonymize_on_delete: bool = True


@router.get("/data-management")
async def get_data_management(
    current_user: dict = Depends(require_permissions(["crm_settings:view"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    data = await _get_setting(db, company_id, "data_management")
    return {"success": True, "data": data}


@router.put("/data-management")
async def save_data_management(
    data: DataManagementRequest,
    current_user: dict = Depends(require_permissions(["crm_settings:edit"])),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    saved = await _save_setting(db, company_id, "data_management", data.model_dump(), current_user["id"])
    return {"success": True, "data": saved, "message": "Data management settings saved"}


# ═══════════════════════════════════════════════════════════════════════════════
# CANDIDATE SOURCES
# ═══════════════════════════════════════════════════════════════════════════════

DEFAULT_CANDIDATE_SOURCES = [
    "LinkedIn", "Naukri", "Indeed", "Referral", "Website",
    "Campus", "Job Fair", "HeadHunting", "Walk-in", "Agency", "Internal Transfer",
]


class CandidateSourceCreate(BaseModel):
    name: str
    description: Optional[str] = None
    is_active: bool = True


class CandidateSourceUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None


@router.get("/candidate-sources")
async def list_candidate_sources(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """List all candidate sources (defaults + custom)."""
    company_id = current_user["company_id"]

    # Fetch custom sources from DB
    cursor = db.candidate_sources.find({"company_id": company_id, "is_deleted": {"$ne": True}})
    custom = [_doc_to_dict(d) for d in await cursor.to_list(length=200)]
    custom_names = {s["name"] for s in custom}

    # Merge with defaults (defaults shown as non-editable placeholders)
    defaults = [
        {"id": f"default-{i}", "name": src, "is_active": True, "is_default": True, "description": ""}
        for i, src in enumerate(DEFAULT_CANDIDATE_SOURCES)
        if src not in custom_names
    ]

    # Custom sources first, then remaining defaults
    all_sources = custom + defaults
    return {"success": True, "data": all_sources}


@router.post("/candidate-sources")
async def create_candidate_source(
    data: CandidateSourceCreate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    name = data.name.strip()
    if not name:
        raise HTTPException(400, "Source name is required")

    # Prevent duplicates
    existing = await db.candidate_sources.find_one({
        "company_id": company_id, "name": name, "is_deleted": {"$ne": True}
    })
    if existing:
        raise HTTPException(400, f"Source '{name}' already exists")

    now = _now()
    doc = {
        "_id": _oid(),
        "company_id": company_id,
        "name": name,
        "description": data.description or "",
        "is_active": data.is_active,
        "is_default": False,
        "created_by": current_user["id"],
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    await db.candidate_sources.insert_one(doc)
    return {"success": True, "data": _doc_to_dict(doc), "message": "Source created"}


@router.put("/candidate-sources/{source_id}")
async def update_candidate_source(
    source_id: str,
    data: CandidateSourceUpdate,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    update = {k: v for k, v in data.model_dump(exclude_none=True).items()}
    if not update:
        raise HTTPException(400, "No fields to update")
    update["updated_at"] = _now()

    result = await db.candidate_sources.update_one(
        {"_id": source_id, "company_id": company_id, "is_deleted": {"$ne": True}},
        {"$set": update}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Source not found")
    updated = await db.candidate_sources.find_one({"_id": source_id})
    return {"success": True, "data": _doc_to_dict(updated), "message": "Source updated"}


@router.delete("/candidate-sources/{source_id}")
async def delete_candidate_source(
    source_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    company_id = current_user["company_id"]
    result = await db.candidate_sources.update_one(
        {"_id": source_id, "company_id": company_id},
        {"$set": {"is_deleted": True, "updated_at": _now()}}
    )
    if result.matched_count == 0:
        raise HTTPException(404, "Source not found")
    return {"success": True, "message": "Source deleted"}


# ═══════════════════════════════════════════════════════════════════════════════
# EMAIL CONFIG TEST
# ═══════════════════════════════════════════════════════════════════════════════

class EmailTestRequest(BaseModel):
    to: str


@router.post("/email-config/test")
async def test_email_config(
    data: EmailTestRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
):
    """Send a test email using the tenant's saved SMTP config."""
    import smtplib
    from email.mime.text import MIMEText
    from email.mime.multipart import MIMEMultipart

    company_id = current_user["company_id"]
    cfg_doc = await _get_setting(db, company_id, "email_config")

    if not cfg_doc or not cfg_doc.get("is_enabled"):
        raise HTTPException(400, "Email configuration is disabled. Enable it first.")

    host = cfg_doc.get("smtp_host", "")
    port = int(cfg_doc.get("smtp_port", 587))
    username = cfg_doc.get("smtp_username", "")
    password = cfg_doc.get("smtp_password", "")
    use_tls = cfg_doc.get("smtp_use_tls", True)
    from_name = cfg_doc.get("from_name", "CRM")
    from_email = cfg_doc.get("from_email", username)

    if not host or not username or not password:
        raise HTTPException(400, "SMTP host, username, and password are required.")

    try:
        msg = MIMEMultipart("alternative")
        msg["Subject"] = "CRM Email Test"
        msg["From"] = f"{from_name} <{from_email}>"
        msg["To"] = data.to
        msg.attach(MIMEText(
            f"<p>This is a test email from your CRM. SMTP configuration is working correctly.</p>"
            f"<p><small>Sent at {_now().strftime('%Y-%m-%d %H:%M UTC')}</small></p>",
            "html"
        ))

        with smtplib.SMTP(host, port, timeout=10) as server:
            server.ehlo()
            if use_tls:
                server.starttls()
            server.login(username, password)
            server.sendmail(from_email, data.to, msg.as_string())

        return {"success": True, "message": f"Test email sent to {data.to}"}

    except smtplib.SMTPAuthenticationError:
        raise HTTPException(400, "SMTP authentication failed. Check username and password.")
    except smtplib.SMTPConnectError:
        raise HTTPException(400, f"Cannot connect to {host}:{port}. Check host and port.")
    except Exception as exc:
        raise HTTPException(400, f"Email delivery failed: {str(exc)}")
