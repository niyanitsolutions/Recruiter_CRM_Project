"""
Import Service - Phase 5
Handles bulk data import from Excel/CSV files
"""
from datetime import datetime
from typing import Optional, List, Dict, Any
from bson import ObjectId
import re

from app.models.company.import_export import (
    ImportExportType, ImportStatus, ImportAction,
    ColumnMapping, ValidationError, ImportRow, FieldDefinition,
    ImportJobResponse, ImportJobListResponse,
    StartImportRequest, ValidateImportRequest, ValidateImportResponse,
    TemplateResponse, TemplateListResponse,
    CANDIDATE_IMPORT_FIELDS, CLIENT_IMPORT_FIELDS, JOB_IMPORT_FIELDS,
    IMPORT_EXPORT_TYPE_DISPLAY
)


class ImportService:
    """Service for data import operations"""
    
    def __init__(self, db):
        self.db = db
        self.import_jobs = db.import_jobs
        self.import_templates = db.import_templates
    
    # ============== Template Management ==============
    
    async def get_templates(
        self,
        company_id: str,
        entity_type: Optional[ImportExportType] = None
    ) -> TemplateListResponse:
        """Get import templates"""
        query = {
            "$or": [
                {"company_id": company_id},
                {"is_system": True}
            ],
            "is_active": True
        }
        
        if entity_type:
            query["entity_type"] = entity_type.value
        
        cursor = self.import_templates.find(query)
        
        items = []
        async for template in cursor:
            response = TemplateResponse(**template)
            response.entity_type_display = IMPORT_EXPORT_TYPE_DISPLAY.get(
                ImportExportType(template["entity_type"]), template["entity_type"]
            )
            items.append(response)
        
        # If no templates found, return defaults
        if not items:
            items = self._get_default_templates()
        
        return TemplateListResponse(
            items=items,
            total=len(items)
        )
    
    def _get_default_templates(self) -> List[TemplateResponse]:
        """Get default import templates"""
        templates = []
        
        # Candidates template
        templates.append(TemplateResponse(
            id="default_candidates",
            entity_type=ImportExportType.CANDIDATES,
            name="Candidates Import Template",
            description="Import candidates with contact and experience details",
            fields=CANDIDATE_IMPORT_FIELDS,
            required_fields=["full_name", "email", "mobile"],
            is_system=True,
            is_active=True,
            entity_type_display="Candidates"
        ))
        
        # Clients template
        templates.append(TemplateResponse(
            id="default_clients",
            entity_type=ImportExportType.CLIENTS,
            name="Clients Import Template",
            description="Import client companies with contact details",
            fields=CLIENT_IMPORT_FIELDS,
            required_fields=["name", "contact_name", "contact_email"],
            is_system=True,
            is_active=True,
            entity_type_display="Clients"
        ))
        
        # Jobs template
        templates.append(TemplateResponse(
            id="default_jobs",
            entity_type=ImportExportType.JOBS,
            name="Jobs Import Template",
            description="Import job openings",
            fields=JOB_IMPORT_FIELDS,
            required_fields=["title", "client_name", "positions"],
            is_system=True,
            is_active=True,
            entity_type_display="Jobs"
        ))
        
        return templates
    
    async def get_template_fields(
        self,
        entity_type: ImportExportType
    ) -> List[FieldDefinition]:
        """Get field definitions for an entity type"""
        if entity_type == ImportExportType.CANDIDATES:
            return CANDIDATE_IMPORT_FIELDS
        elif entity_type == ImportExportType.CLIENTS:
            return CLIENT_IMPORT_FIELDS
        elif entity_type == ImportExportType.JOBS:
            return JOB_IMPORT_FIELDS
        else:
            return []
    
    # ============== Import Validation ==============
    
    async def validate_import(
        self,
        data: ValidateImportRequest,
        company_id: str,
        file_data: List[Dict[str, Any]]
    ) -> ValidateImportResponse:
        """Validate import file and suggest mappings"""
        if not file_data:
            return ValidateImportResponse(
                is_valid=False,
                total_rows=0,
                sample_data=[],
                detected_columns=[],
                suggested_mapping=[],
                validation_errors=[ValidationError(
                    row_number=0,
                    column="file",
                    value=None,
                    error="File is empty or could not be parsed"
                )]
            )
        
        # Get detected columns
        detected_columns = list(file_data[0].keys()) if file_data else []
        
        # Get expected fields
        expected_fields = await self.get_template_fields(data.entity_type)
        
        # Suggest mappings
        suggested_mapping = self._suggest_column_mapping(detected_columns, expected_fields)
        
        # Validate sample data
        sample_data = file_data[:data.sample_rows]
        validation_errors = await self._validate_data(
            sample_data,
            suggested_mapping,
            expected_fields,
            data.entity_type,
            company_id
        )
        
        is_valid = len([e for e in validation_errors if e.severity == "error"]) == 0
        
        return ValidateImportResponse(
            is_valid=is_valid,
            total_rows=len(file_data),
            sample_data=sample_data,
            detected_columns=detected_columns,
            suggested_mapping=suggested_mapping,
            validation_errors=validation_errors
        )
    
    def _suggest_column_mapping(
        self,
        detected_columns: List[str],
        expected_fields: List[FieldDefinition]
    ) -> List[ColumnMapping]:
        """Suggest column mappings based on similarity"""
        mappings = []
        
        for field in expected_fields:
            best_match = None
            best_score = 0
            
            for col in detected_columns:
                score = self._similarity_score(col.lower(), field.field_name.lower())
                display_score = self._similarity_score(col.lower(), field.display_name.lower())
                max_score = max(score, display_score)
                
                if max_score > best_score and max_score > 0.5:
                    best_score = max_score
                    best_match = col
            
            mappings.append(ColumnMapping(
                file_column=best_match or "",
                db_field=field.field_name,
                is_required=field.is_required
            ))
        
        return mappings
    
    def _similarity_score(self, s1: str, s2: str) -> float:
        """Calculate similarity score between two strings"""
        # Simple similarity based on common characters
        s1 = s1.replace("_", " ").replace("-", " ")
        s2 = s2.replace("_", " ").replace("-", " ")
        
        if s1 == s2:
            return 1.0
        
        if s1 in s2 or s2 in s1:
            return 0.8
        
        # Check word overlap
        words1 = set(s1.split())
        words2 = set(s2.split())
        
        if words1 & words2:
            return 0.6
        
        return 0.0
    
    async def _validate_data(
        self,
        data: List[Dict[str, Any]],
        mapping: List[ColumnMapping],
        fields: List[FieldDefinition],
        entity_type: ImportExportType,
        company_id: str
    ) -> List[ValidationError]:
        """Validate import data"""
        errors = []
        field_map = {f.field_name: f for f in fields}
        
        for row_num, row in enumerate(data, 1):
            for col_mapping in mapping:
                if not col_mapping.file_column:
                    continue
                
                value = row.get(col_mapping.file_column)
                field_def = field_map.get(col_mapping.db_field)
                
                if not field_def:
                    continue
                
                # Check required fields
                if field_def.is_required and not value:
                    errors.append(ValidationError(
                        row_number=row_num,
                        column=col_mapping.file_column,
                        value=value,
                        error=f"{field_def.display_name} is required"
                    ))
                    continue
                
                if not value:
                    continue
                
                # Validate data type
                error = self._validate_field_value(value, field_def)
                if error:
                    errors.append(ValidationError(
                        row_number=row_num,
                        column=col_mapping.file_column,
                        value=value,
                        error=error
                    ))
        
        return errors
    
    def _validate_field_value(self, value: Any, field: FieldDefinition) -> Optional[str]:
        """Validate a single field value"""
        str_value = str(value).strip()
        
        if field.data_type == "email":
            if not re.match(r"[^@]+@[^@]+\.[^@]+", str_value):
                return "Invalid email format"
        
        elif field.data_type == "phone":
            # Remove common formatting
            phone = re.sub(r"[\s\-\(\)\+]", "", str_value)
            if not phone.isdigit() or len(phone) < 10:
                return "Invalid phone number"
        
        elif field.data_type == "number":
            try:
                float(str_value)
            except ValueError:
                return "Must be a number"
        
        elif field.data_type == "date":
            # Try common date formats
            date_formats = ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]
            valid = False
            for fmt in date_formats:
                try:
                    datetime.strptime(str_value, fmt)
                    valid = True
                    break
                except ValueError:
                    continue
            if not valid:
                return "Invalid date format"
        
        elif field.data_type == "enum":
            if field.allowed_values and str_value.lower() not in [v.lower() for v in field.allowed_values]:
                return f"Must be one of: {', '.join(field.allowed_values)}"
        
        if field.max_length and len(str_value) > field.max_length:
            return f"Maximum length is {field.max_length} characters"
        
        return None
    
    # ============== Import Processing ==============
    
    async def start_import(
        self,
        data: StartImportRequest,
        company_id: str,
        user_id: str,
        file_data: List[Dict[str, Any]]
    ) -> ImportJobResponse:
        """Start an import job"""
        job = {
            "id": str(ObjectId()),
            "company_id": company_id,
            "entity_type": data.entity_type.value,
            "file_name": data.file_name,
            "file_url": data.file_url,
            "file_size": 0,
            "column_mapping": [m.model_dump() for m in data.column_mapping],
            "duplicate_action": data.duplicate_action.value,
            "duplicate_check_fields": data.duplicate_check_fields,
            "skip_first_row": data.skip_first_row,
            "status": ImportStatus.PENDING.value,
            "total_rows": len(file_data),
            "processed_rows": 0,
            "successful_rows": 0,
            "failed_rows": 0,
            "skipped_rows": 0,
            "validation_errors": [],
            "row_results": [],
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
            "created_by": user_id,
            "is_deleted": False
        }
        
        await self.import_jobs.insert_one(job)
        
        # Process import (in production, this would be async/background)
        await self._process_import(job["id"], company_id, file_data, user_id)
        
        # Get updated job
        updated_job = await self.import_jobs.find_one({"id": job["id"]})
        
        response = ImportJobResponse(**updated_job)
        response.entity_type_display = IMPORT_EXPORT_TYPE_DISPLAY.get(
            ImportExportType(updated_job["entity_type"]), updated_job["entity_type"]
        )
        response.status_display = updated_job["status"].replace("_", " ").title()
        response.progress_percentage = int(
            (updated_job["processed_rows"] / updated_job["total_rows"] * 100)
            if updated_job["total_rows"] > 0 else 0
        )
        
        return response
    
    async def _process_import(
        self,
        import_id: str,
        company_id: str,
        file_data: List[Dict[str, Any]],
        user_id: str
    ):
        """Process an import job"""
        job = await self.import_jobs.find_one({"id": import_id})
        if not job:
            return
        
        try:
            # Update status
            await self.import_jobs.update_one(
                {"id": import_id},
                {"$set": {
                    "status": ImportStatus.PROCESSING.value,
                    "started_at": datetime.utcnow()
                }}
            )
            
            entity_type = ImportExportType(job["entity_type"])
            column_mapping = [ColumnMapping(**m) for m in job["column_mapping"]]
            duplicate_action = ImportAction(job["duplicate_action"])
            duplicate_fields = job["duplicate_check_fields"]
            
            # Get collection
            collection = self._get_collection_for_entity(entity_type)
            
            row_results = []
            successful = 0
            failed = 0
            skipped = 0
            
            for row_num, row in enumerate(file_data, 1):
                try:
                    # Map columns
                    mapped_data = {}
                    for mapping in column_mapping:
                        if mapping.file_column and mapping.file_column in row:
                            value = row[mapping.file_column]
                            # Apply transform if specified
                            if mapping.transform:
                                value = self._apply_transform(value, mapping.transform)
                            mapped_data[mapping.db_field] = value
                        elif mapping.default_value is not None:
                            mapped_data[mapping.db_field] = mapping.default_value
                    
                    # Check for duplicates
                    if duplicate_fields:
                        is_duplicate, existing_id = await self._check_duplicate(
                            collection, company_id, mapped_data, duplicate_fields
                        )
                        
                        if is_duplicate:
                            if duplicate_action == ImportAction.SKIP:
                                row_results.append(ImportRow(
                                    row_number=row_num,
                                    status="skipped",
                                    action="skipped",
                                    errors=["Duplicate record found"]
                                ))
                                skipped += 1
                                continue
                            elif duplicate_action == ImportAction.UPDATE:
                                # Update existing record
                                mapped_data["updated_at"] = datetime.utcnow()
                                mapped_data["updated_by"] = user_id
                                await collection.update_one(
                                    {"id": existing_id},
                                    {"$set": mapped_data}
                                )
                                row_results.append(ImportRow(
                                    row_number=row_num,
                                    status="success",
                                    action="updated",
                                    record_id=existing_id
                                ))
                                successful += 1
                                continue
                    
                    # Create new record
                    record_id = str(ObjectId())
                    mapped_data["id"] = record_id
                    mapped_data["company_id"] = company_id
                    mapped_data["created_at"] = datetime.utcnow()
                    mapped_data["updated_at"] = datetime.utcnow()
                    mapped_data["created_by"] = user_id
                    mapped_data["is_deleted"] = False
                    
                    # Add entity-specific defaults
                    mapped_data = self._add_entity_defaults(entity_type, mapped_data)
                    
                    await collection.insert_one(mapped_data)
                    
                    row_results.append(ImportRow(
                        row_number=row_num,
                        status="success",
                        action="created",
                        record_id=record_id
                    ))
                    successful += 1
                    
                except Exception as e:
                    row_results.append(ImportRow(
                        row_number=row_num,
                        status="error",
                        errors=[str(e)]
                    ))
                    failed += 1
                
                # Update progress periodically
                if row_num % 100 == 0:
                    await self.import_jobs.update_one(
                        {"id": import_id},
                        {"$set": {
                            "processed_rows": row_num,
                            "successful_rows": successful,
                            "failed_rows": failed,
                            "skipped_rows": skipped
                        }}
                    )
            
            # Final update
            final_status = ImportStatus.COMPLETED.value
            if failed > 0 and successful > 0:
                final_status = ImportStatus.COMPLETED_WITH_ERRORS.value
            elif failed > 0 and successful == 0:
                final_status = ImportStatus.FAILED.value
            
            await self.import_jobs.update_one(
                {"id": import_id},
                {"$set": {
                    "status": final_status,
                    "completed_at": datetime.utcnow(),
                    "processed_rows": len(file_data),
                    "successful_rows": successful,
                    "failed_rows": failed,
                    "skipped_rows": skipped,
                    "row_results": [r.model_dump() for r in row_results[:1000]]  # Limit stored results
                }}
            )
            
        except Exception as e:
            await self.import_jobs.update_one(
                {"id": import_id},
                {"$set": {
                    "status": ImportStatus.FAILED.value,
                    "completed_at": datetime.utcnow(),
                    "validation_errors": [{"row_number": 0, "column": "system", "value": None, "error": str(e)}]
                }}
            )
    
    def _get_collection_for_entity(self, entity_type: ImportExportType):
        """Get database collection for entity type"""
        if entity_type == ImportExportType.CANDIDATES:
            return self.db.candidates
        elif entity_type == ImportExportType.CLIENTS:
            return self.db.clients
        elif entity_type == ImportExportType.JOBS:
            return self.db.jobs
        elif entity_type == ImportExportType.USERS:
            return self.db.users
        elif entity_type == ImportExportType.APPLICATIONS:
            return self.db.applications
        elif entity_type == ImportExportType.CONTACTS:
            return self.db.contacts
        else:
            raise ValueError(f"Unknown entity type: {entity_type}")
    
    def _apply_transform(self, value: Any, transform: str) -> Any:
        """Apply transformation to value"""
        if value is None:
            return None
        
        str_value = str(value).strip()
        
        if transform == "uppercase":
            return str_value.upper()
        elif transform == "lowercase":
            return str_value.lower()
        elif transform == "titlecase":
            return str_value.title()
        elif transform == "trim":
            return str_value
        elif transform == "date":
            # Parse date
            for fmt in ["%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%m/%d/%Y"]:
                try:
                    return datetime.strptime(str_value, fmt).date().isoformat()
                except ValueError:
                    continue
            return str_value
        
        return str_value
    
    async def _check_duplicate(
        self,
        collection,
        company_id: str,
        data: Dict[str, Any],
        check_fields: List[str]
    ) -> tuple:
        """Check if record is duplicate"""
        query = {"company_id": company_id, "is_deleted": False}
        
        for field in check_fields:
            if field in data:
                query[field] = data[field]
        
        existing = await collection.find_one(query)
        
        if existing:
            return True, existing.get("id")
        return False, None
    
    def _add_entity_defaults(
        self,
        entity_type: ImportExportType,
        data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Add default values for entity type"""
        if entity_type == ImportExportType.CANDIDATES:
            data.setdefault("status", "active")
            data.setdefault("source", "import")
        elif entity_type == ImportExportType.CLIENTS:
            data.setdefault("status", "active")
        elif entity_type == ImportExportType.JOBS:
            data.setdefault("status", "open")
            data.setdefault("positions_filled", 0)
        
        return data
    
    # ============== Import Job Management ==============
    
    async def get_import(
        self,
        import_id: str,
        company_id: str
    ) -> Optional[ImportJobResponse]:
        """Get import job by ID"""
        job = await self.import_jobs.find_one({
            "id": import_id,
            "company_id": company_id,
            "is_deleted": False
        })
        
        if job:
            response = ImportJobResponse(**job)
            response.entity_type_display = IMPORT_EXPORT_TYPE_DISPLAY.get(
                ImportExportType(job["entity_type"]), job["entity_type"]
            )
            response.status_display = job["status"].replace("_", " ").title()
            response.progress_percentage = int(
                (job["processed_rows"] / job["total_rows"] * 100)
                if job["total_rows"] > 0 else 0
            )
            return response
        return None
    
    async def list_imports(
        self,
        company_id: str,
        page: int = 1,
        page_size: int = 20,
        entity_type: Optional[ImportExportType] = None,
        status: Optional[ImportStatus] = None
    ) -> ImportJobListResponse:
        """List import jobs"""
        query = {"company_id": company_id, "is_deleted": False}
        
        if entity_type:
            query["entity_type"] = entity_type.value
        if status:
            query["status"] = status.value
        
        total = await self.import_jobs.count_documents(query)
        skip = (page - 1) * page_size
        
        cursor = self.import_jobs.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        
        items = []
        async for job in cursor:
            response = ImportJobResponse(**job)
            response.entity_type_display = IMPORT_EXPORT_TYPE_DISPLAY.get(
                ImportExportType(job["entity_type"]), job["entity_type"]
            )
            response.status_display = job["status"].replace("_", " ").title()
            response.progress_percentage = int(
                (job["processed_rows"] / job["total_rows"] * 100)
                if job["total_rows"] > 0 else 0
            )
            items.append(response)
        
        return ImportJobListResponse(
            items=items,
            total=total,
            page=page,
            page_size=page_size
        )