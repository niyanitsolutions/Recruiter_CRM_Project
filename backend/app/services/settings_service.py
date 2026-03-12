"""
Settings Service - Phase 3
Business logic for company settings, custom fields, interview stages
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException

from app.models.company.settings import (
    CustomFieldDefinition,
    CustomFieldCreate,
    CustomFieldUpdate,
    InterviewStageDefinition,
    InterviewStageCreate,
    InterviewStageUpdate,
    EmailTemplate,
    EmailTemplateUpdate,
    CompanySettings,
    CompanySettingsUpdate,
    DEFAULT_INTERVIEW_STAGES,
    DEFAULT_EMAIL_TEMPLATES
)
from app.services.audit_service import AuditService


class SettingsService:
    """Service for company settings management"""
    
    CUSTOM_FIELDS_COLLECTION = "custom_fields"
    INTERVIEW_STAGES_COLLECTION = "interview_stages"
    EMAIL_TEMPLATES_COLLECTION = "email_templates"
    COMPANY_SETTINGS_COLLECTION = "company_settings"
    
    # ============== Custom Fields ==============
    
    @staticmethod
    async def create_custom_field(
        db: AsyncIOMotorDatabase,
        field_data: CustomFieldCreate,
        created_by: str
    ) -> CustomFieldDefinition:
        """Create a new custom field"""
        collection = db[SettingsService.CUSTOM_FIELDS_COLLECTION]
        
        # Check for duplicate field name
        existing = await collection.find_one({
            "entity_type": field_data.entity_type,
            "field_name": field_data.field_name,
            "is_active": True
        })
        if existing:
            raise HTTPException(status_code=400, detail="Field with this name already exists")
        
        field_dict = field_data.model_dump()
        field_dict["_id"] = str(ObjectId())
        field_dict["is_active"] = True
        field_dict["is_visible"] = True
        field_dict["created_by"] = created_by
        field_dict["created_at"] = datetime.utcnow()
        
        await collection.insert_one(field_dict)
        
        return CustomFieldDefinition(**field_dict)
    
    @staticmethod
    async def list_custom_fields(
        db: AsyncIOMotorDatabase,
        entity_type: Optional[str] = None
    ) -> List[CustomFieldDefinition]:
        """List custom fields"""
        collection = db[SettingsService.CUSTOM_FIELDS_COLLECTION]
        
        query = {"is_active": True}
        if entity_type:
            query["entity_type"] = entity_type
        
        cursor = collection.find(query).sort("sort_order", 1)
        fields = await cursor.to_list(length=100)
        
        return [CustomFieldDefinition(**f) for f in fields]
    
    @staticmethod
    async def update_custom_field(
        db: AsyncIOMotorDatabase,
        field_id: str,
        update_data: CustomFieldUpdate,
        updated_by: str
    ) -> CustomFieldDefinition:
        """Update a custom field"""
        collection = db[SettingsService.CUSTOM_FIELDS_COLLECTION]
        
        existing = await collection.find_one({"_id": field_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Custom field not found")
        
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.utcnow()
        
        await collection.update_one({"_id": field_id}, {"$set": update_dict})
        
        updated = await collection.find_one({"_id": field_id})
        return CustomFieldDefinition(**updated)
    
    @staticmethod
    async def delete_custom_field(db: AsyncIOMotorDatabase, field_id: str, deleted_by: str) -> bool:
        """Soft delete a custom field"""
        collection = db[SettingsService.CUSTOM_FIELDS_COLLECTION]
        
        result = await collection.update_one(
            {"_id": field_id},
            {"$set": {"is_active": False, "updated_by": deleted_by, "updated_at": datetime.utcnow()}}
        )
        
        return result.modified_count > 0
    
    # ============== Interview Stages ==============
    
    @staticmethod
    async def initialize_interview_stages(db: AsyncIOMotorDatabase, created_by: str) -> List[InterviewStageDefinition]:
        """Initialize default interview stages"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        # Check if already initialized
        count = await collection.count_documents({})
        if count > 0:
            raise HTTPException(status_code=400, detail="Interview stages already initialized")
        
        stages = []
        for stage_data in DEFAULT_INTERVIEW_STAGES:
            stage_dict = {
                "_id": str(ObjectId()),
                **stage_data,
                "is_active": True,
                "created_by": created_by,
                "created_at": datetime.utcnow()
            }
            await collection.insert_one(stage_dict)
            stages.append(InterviewStageDefinition(**stage_dict))
        
        return stages
    
    @staticmethod
    async def create_interview_stage(
        db: AsyncIOMotorDatabase,
        stage_data: InterviewStageCreate,
        created_by: str
    ) -> InterviewStageDefinition:
        """Create a new interview stage"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        # Check for duplicate code
        existing = await collection.find_one({"code": stage_data.code, "is_active": True})
        if existing:
            raise HTTPException(status_code=400, detail="Stage with this code already exists")
        
        stage_dict = stage_data.model_dump()
        stage_dict["_id"] = str(ObjectId())
        stage_dict["is_active"] = True
        stage_dict["created_by"] = created_by
        stage_dict["created_at"] = datetime.utcnow()
        
        await collection.insert_one(stage_dict)
        
        return InterviewStageDefinition(**stage_dict)
    
    @staticmethod
    async def list_interview_stages(db: AsyncIOMotorDatabase) -> List[InterviewStageDefinition]:
        """List interview stages"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        cursor = collection.find({"is_active": True}).sort("stage_order", 1)
        stages = await cursor.to_list(length=50)
        
        return [InterviewStageDefinition(**s) for s in stages]
    
    @staticmethod
    async def update_interview_stage(
        db: AsyncIOMotorDatabase,
        stage_id: str,
        update_data: InterviewStageUpdate,
        updated_by: str
    ) -> InterviewStageDefinition:
        """Update an interview stage"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        existing = await collection.find_one({"_id": stage_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview stage not found")
        
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.utcnow()
        
        await collection.update_one({"_id": stage_id}, {"$set": update_dict})
        
        updated = await collection.find_one({"_id": stage_id})
        return InterviewStageDefinition(**updated)
    
    @staticmethod
    async def delete_interview_stage(db: AsyncIOMotorDatabase, stage_id: str, deleted_by: str) -> bool:
        """Soft delete an interview stage"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        # Check if stage is in use
        interviews_collection = db["interviews"]
        in_use = await interviews_collection.count_documents({
            "stage_id": stage_id,
            "status": {"$nin": ["completed", "cancelled"]},
            "is_deleted": False
        })
        
        if in_use > 0:
            raise HTTPException(status_code=400, detail=f"Stage is in use by {in_use} interviews")
        
        result = await collection.update_one(
            {"_id": stage_id},
            {"$set": {"is_active": False, "updated_by": deleted_by, "updated_at": datetime.utcnow()}}
        )
        
        return result.modified_count > 0
    
    @staticmethod
    async def reorder_interview_stages(
        db: AsyncIOMotorDatabase,
        stage_orders: List[Dict[str, int]],
        updated_by: str
    ) -> List[InterviewStageDefinition]:
        """Reorder interview stages"""
        collection = db[SettingsService.INTERVIEW_STAGES_COLLECTION]
        
        for order_item in stage_orders:
            await collection.update_one(
                {"_id": order_item["id"]},
                {"$set": {"stage_order": order_item["order"], "updated_by": updated_by, "updated_at": datetime.utcnow()}}
            )
        
        return await SettingsService.list_interview_stages(db)
    
    # ============== Email Templates ==============
    
    @staticmethod
    async def initialize_email_templates(db: AsyncIOMotorDatabase, created_by: str) -> List[EmailTemplate]:
        """Initialize default email templates"""
        collection = db[SettingsService.EMAIL_TEMPLATES_COLLECTION]
        
        count = await collection.count_documents({})
        if count > 0:
            raise HTTPException(status_code=400, detail="Email templates already initialized")
        
        templates = []
        for template_data in DEFAULT_EMAIL_TEMPLATES:
            template_dict = {
                "_id": str(ObjectId()),
                **template_data,
                "is_active": True,
                "created_by": created_by,
                "created_at": datetime.utcnow()
            }
            await collection.insert_one(template_dict)
            templates.append(EmailTemplate(**template_dict))
        
        return templates
    
    @staticmethod
    async def list_email_templates(db: AsyncIOMotorDatabase) -> List[EmailTemplate]:
        """List email templates"""
        collection = db[SettingsService.EMAIL_TEMPLATES_COLLECTION]
        
        cursor = collection.find({"is_active": True})
        templates = await cursor.to_list(length=100)
        
        return [EmailTemplate(**t) for t in templates]
    
    @staticmethod
    async def get_email_template(db: AsyncIOMotorDatabase, template_code: str) -> Optional[EmailTemplate]:
        """Get email template by code"""
        collection = db[SettingsService.EMAIL_TEMPLATES_COLLECTION]
        
        template = await collection.find_one({"code": template_code, "is_active": True})
        return EmailTemplate(**template) if template else None
    
    @staticmethod
    async def update_email_template(
        db: AsyncIOMotorDatabase,
        template_id: str,
        update_data: EmailTemplateUpdate,
        updated_by: str
    ) -> EmailTemplate:
        """Update an email template"""
        collection = db[SettingsService.EMAIL_TEMPLATES_COLLECTION]
        
        existing = await collection.find_one({"_id": template_id})
        if not existing:
            raise HTTPException(status_code=404, detail="Email template not found")
        
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.utcnow()
        
        await collection.update_one({"_id": template_id}, {"$set": update_dict})
        
        updated = await collection.find_one({"_id": template_id})
        return EmailTemplate(**updated)
    
    # ============== Company Settings ==============
    
    @staticmethod
    async def get_company_settings(db: AsyncIOMotorDatabase) -> CompanySettings:
        """Get company settings"""
        collection = db[SettingsService.COMPANY_SETTINGS_COLLECTION]
        
        settings = await collection.find_one({})
        if not settings:
            # Return default settings
            return CompanySettings()
        
        return CompanySettings(**settings)
    
    @staticmethod
    async def update_company_settings(
        db: AsyncIOMotorDatabase,
        update_data: CompanySettingsUpdate,
        updated_by: str
    ) -> CompanySettings:
        """Update company settings"""
        collection = db[SettingsService.COMPANY_SETTINGS_COLLECTION]
        
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.utcnow()
        
        # Upsert
        await collection.update_one(
            {},
            {"$set": update_dict},
            upsert=True
        )
        
        await AuditService.log(
            db=db, action="update", entity_type="company_settings",
            entity_id="settings", entity_name="Company Settings",
            user_id=updated_by, new_value=update_dict
        )
        
        return await SettingsService.get_company_settings(db)
    
    # ============== Dropdown Data ==============
    
    @staticmethod
    async def get_interview_stages_dropdown(db: AsyncIOMotorDatabase) -> List[Dict[str, Any]]:
        """Get interview stages for dropdown"""
        stages = await SettingsService.list_interview_stages(db)
        return [
            {"value": s.id, "label": s.name, "code": s.code, "order": s.stage_order}
            for s in stages
        ]