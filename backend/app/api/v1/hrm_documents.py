"""HRM — Employee Document Management (upload + generate)"""
import os
import uuid
from typing import Optional
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import JSONResponse

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions

router = APIRouter(prefix="/hrm/documents", tags=["HRM - Documents"])

UPLOAD_DIR = "uploads/hrm_docs"
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
MAX_SIZE_MB = 10


def _allowed(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


# ── Upload ─────────────────────────────────────────────────────────────────────

@router.post("/upload/{employee_id}", status_code=201)
async def upload_document(
    employee_id: str,
    doc_type: str = Form(...),
    doc_name: str = Form(...),
    file: UploadFile = File(...),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """Upload a document for an employee (PDF / image, max 10 MB)."""
    if not _allowed(file.filename or ""):
        raise HTTPException(status_code=400, detail="File type not allowed. Use PDF, JPG, PNG, or DOCX.")

    content = await file.read()
    if len(content) > MAX_SIZE_MB * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds {MAX_SIZE_MB} MB limit.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{uuid.uuid4()}{ext}"
    file_path = os.path.join(UPLOAD_DIR, stored_name)
    with open(file_path, "wb") as fh:
        fh.write(content)

    file_url = f"/uploads/hrm_docs/{stored_name}"
    now = datetime.now(timezone.utc)

    doc_entry = {
        "doc_type": doc_type,
        "doc_name": doc_name,
        "file_url": file_url,
        "uploaded_at": now,
        "uploaded_by": cu["id"],
    }

    result = await db.hrm_employees.update_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$push": {"documents": doc_entry}, "$set": {"updated_at": now}},
    )
    if result.matched_count == 0:
        os.remove(file_path)
        raise HTTPException(status_code=404, detail="Employee not found")

    return {"message": "Document uploaded successfully", "document": doc_entry}


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{employee_id}/{doc_index}", status_code=204)
async def delete_document(
    employee_id: str,
    doc_index: int,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """Remove a document from an employee's record by its list index."""
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = emp.get("documents", [])
    if doc_index < 0 or doc_index >= len(docs):
        raise HTTPException(status_code=400, detail="Invalid document index")

    docs.pop(doc_index)
    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": datetime.now(timezone.utc)}},
    )


# ── List ───────────────────────────────────────────────────────────────────────

@router.get("/{employee_id}")
async def list_documents(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")
    return {"documents": emp.get("documents", [])}
