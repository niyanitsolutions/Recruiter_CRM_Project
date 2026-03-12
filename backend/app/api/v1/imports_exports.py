"""
Import/Export API Routes - Phase 5
Handles bulk data import and export endpoints
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status, UploadFile, File
from fastapi.responses import StreamingResponse
from typing import Optional, List
import io
import csv
import json

from app.core.dependencies import (
    get_current_user,
    get_company_db,
    require_permissions
)
from app.models.company.import_export import (
    ImportExportType, ImportStatus, ExportStatus, ExportFormat, ImportAction,
    StartImportRequest, ValidateImportRequest, ValidateImportResponse,
    CreateExportRequest,
    ImportJobResponse, ImportJobListResponse,
    ExportJobResponse, ExportJobListResponse,
    TemplateResponse, TemplateListResponse,
    ColumnMapping
)
from app.services.import_service import ImportService
from app.services.export_service import ExportService

router = APIRouter(prefix="/data", tags=["Import/Export"])


# ============== Templates ==============

@router.get("/import/templates", response_model=TemplateListResponse)
async def get_import_templates(
    entity_type: Optional[ImportExportType] = None,
    current_user: dict = Depends(require_permissions(["imports:view"])),
    db = Depends(get_company_db)
):
    """Get available import templates"""
    service = ImportService(db)
    
    return await service.get_templates(
        company_id=current_user["company_id"],
        entity_type=entity_type
    )


@router.get("/import/templates/{entity_type}/fields")
async def get_template_fields(
    entity_type: ImportExportType,
    current_user: dict = Depends(require_permissions(["imports:view"])),
    db = Depends(get_company_db)
):
    """Get field definitions for import template"""
    service = ImportService(db)
    
    fields = await service.get_template_fields(entity_type)
    
    return {
        "entity_type": entity_type.value,
        "fields": [f.model_dump() for f in fields]
    }


@router.get("/import/templates/{entity_type}/download")
async def download_import_template(
    entity_type: ImportExportType,
    current_user: dict = Depends(require_permissions(["imports:view"])),
    db = Depends(get_company_db)
):
    """Download import template as Excel"""
    service = ImportService(db)
    
    fields = await service.get_template_fields(entity_type)
    
    # Generate CSV template
    output = io.StringIO()
    writer = csv.writer(output)
    
    # Headers
    headers = [f.display_name for f in fields]
    writer.writerow(headers)
    
    # Example row
    examples = [f.example or "" for f in fields]
    writer.writerow(examples)
    
    content = output.getvalue()
    
    return StreamingResponse(
        io.StringIO(content),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={entity_type.value}_template.csv"}
    )


# ============== Import ==============

@router.post("/import/validate", response_model=ValidateImportResponse)
async def validate_import(
    entity_type: ImportExportType,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permissions(["imports:create"])),
    db = Depends(get_company_db)
):
    """Validate import file and suggest mappings"""
    service = ImportService(db)
    
    # Read file content
    content = await file.read()
    
    # Parse file based on type
    if file.filename.endswith(".csv"):
        file_data = parse_csv(content.decode("utf-8"))
    elif file.filename.endswith(".json"):
        file_data = json.loads(content.decode("utf-8"))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format. Use CSV or JSON."
        )
    
    request = ValidateImportRequest(
        entity_type=entity_type,
        file_url="",
        skip_first_row=True,
        sample_rows=10
    )
    
    return await service.validate_import(
        data=request,
        company_id=current_user["company_id"],
        file_data=file_data
    )


@router.post("/import/start", response_model=ImportJobResponse)
async def start_import(
    data: StartImportRequest,
    file: UploadFile = File(...),
    current_user: dict = Depends(require_permissions(["imports:create"])),
    db = Depends(get_company_db)
):
    """Start an import job"""
    service = ImportService(db)
    
    # Read and parse file
    content = await file.read()
    
    if file.filename.endswith(".csv"):
        file_data = parse_csv(content.decode("utf-8"))
    elif file.filename.endswith(".json"):
        file_data = json.loads(content.decode("utf-8"))
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Unsupported file format"
        )
    
    # Skip header row if specified
    if data.skip_first_row and file_data:
        # For CSV, first row is already used as headers in parse_csv
        pass
    
    return await service.start_import(
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"],
        file_data=file_data
    )


@router.get("/import/jobs", response_model=ImportJobListResponse)
async def list_imports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    entity_type: Optional[ImportExportType] = None,
    status: Optional[ImportStatus] = None,
    current_user: dict = Depends(require_permissions(["imports:view"])),
    db = Depends(get_company_db)
):
    """List import jobs"""
    service = ImportService(db)
    
    return await service.list_imports(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        entity_type=entity_type,
        status=status
    )


@router.get("/import/jobs/{import_id}", response_model=ImportJobResponse)
async def get_import(
    import_id: str,
    current_user: dict = Depends(require_permissions(["imports:view"])),
    db = Depends(get_company_db)
):
    """Get import job details"""
    service = ImportService(db)
    
    result = await service.get_import(
        import_id=import_id,
        company_id=current_user["company_id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Import job not found"
        )
    
    return result


# ============== Export ==============

@router.post("/export", response_model=ExportJobResponse)
async def create_export(
    data: CreateExportRequest,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db = Depends(get_company_db)
):
    """Create an export job"""
    service = ExportService(db)
    
    return await service.create_export(
        data=data,
        company_id=current_user["company_id"],
        user_id=current_user["id"]
    )


@router.get("/export/jobs", response_model=ExportJobListResponse)
async def list_exports(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    entity_type: Optional[ImportExportType] = None,
    status: Optional[ExportStatus] = None,
    current_user: dict = Depends(require_permissions(["exports:view"])),
    db = Depends(get_company_db)
):
    """List export jobs"""
    service = ExportService(db)
    
    return await service.list_exports(
        company_id=current_user["company_id"],
        page=page,
        page_size=page_size,
        entity_type=entity_type,
        status=status
    )


@router.get("/export/jobs/{export_id}", response_model=ExportJobResponse)
async def get_export(
    export_id: str,
    current_user: dict = Depends(require_permissions(["exports:view"])),
    db = Depends(get_company_db)
):
    """Get export job details"""
    service = ExportService(db)
    
    result = await service.get_export(
        export_id=export_id,
        company_id=current_user["company_id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export job not found"
        )
    
    return result


@router.get("/export/jobs/{export_id}/download")
async def download_export(
    export_id: str,
    current_user: dict = Depends(require_permissions(["exports:view"])),
    db = Depends(get_company_db)
):
    """Download export file"""
    service = ExportService(db)
    
    result = await service.get_export(
        export_id=export_id,
        company_id=current_user["company_id"]
    )
    
    if not result:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Export job not found"
        )
    
    if result.status != ExportStatus.COMPLETED.value:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Export not ready for download"
        )
    
    # In production, redirect to file URL or stream from storage
    return {
        "download_url": result.file_url,
        "file_name": result.file_name,
        "expires_at": result.expires_at
    }


# ============== Quick Export ==============

@router.get("/export/candidates")
async def export_candidates(
    format: ExportFormat = ExportFormat.EXCEL,
    status: Optional[str] = None,
    source: Optional[str] = None,
    current_user: dict = Depends(require_permissions(["exports:create"])),
    db = Depends(get_company_db)
):
    """Quick export candidates"""
    service = ExportService(db)
    
    filters = {}
    if status:
        filters["status"] = status
    if source:
        filters["source"] = source
    
    content = await service.export_candidates(
        company_id=current_user["company_id"],
        filters=filters,
        format=format
    )
    
    # Determine content type
    if format == ExportFormat.EXCEL:
        content_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        filename = "candidates_export.xlsx"
    elif format == ExportFormat.CSV:
        content_type = "text/csv"
        filename = "candidates_export.csv"
    else:
        content_type = "application/json"
        filename = "candidates_export.json"
    
    if isinstance(content, bytes):
        return StreamingResponse(
            io.BytesIO(content),
            media_type=content_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
    else:
        return StreamingResponse(
            io.StringIO(content),
            media_type=content_type,
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )


# ============== Helper Functions ==============

def parse_csv(content: str) -> List[dict]:
    """Parse CSV content to list of dictionaries"""
    reader = csv.DictReader(io.StringIO(content))
    return list(reader)