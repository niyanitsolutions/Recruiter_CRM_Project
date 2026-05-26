"""HRM — Employee Document Management (upload, list, favorite, tags)"""
import os
import re as _re
import uuid
from typing import Optional, List
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions

router = APIRouter(prefix="/hrm/documents", tags=["HRM - Documents"])

UPLOAD_DIR = "uploads/hrm_docs"
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
MAX_SIZE_MB = 10


def _allowed(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


class DocumentMetaUpdate(BaseModel):
    favorite: Optional[bool] = None
    tags: Optional[List[str]] = None


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
        "favorite": False,
        "tags": [],
    }

    result = await db.hrm_employees.update_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"$push": {"documents": doc_entry}, "$set": {"updated_at": now}},
    )
    if result.matched_count == 0:
        os.remove(file_path)
        raise HTTPException(status_code=404, detail="Employee not found")

    return {"message": "Document uploaded successfully", "document": doc_entry}


# ── List all documents (cross-employee, filterable) ────────────────────────────

@router.get("/all")
async def list_all_documents(
    doc_type: Optional[str] = None,
    search: Optional[str] = None,
    favorites_only: bool = False,
    page: int = 1,
    page_size: int = 50,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    """List all documents across all employees with optional filters."""
    base_match = {"company_id": cu["company_id"], "is_deleted": False}

    pipeline = [
        {"$match": base_match},
        {"$project": {"full_name": 1, "employee_id": 1, "designation_name": 1, "documents": 1}},
        {"$unwind": {"path": "$documents", "includeArrayIndex": "doc_index"}},
    ]

    doc_filter: dict = {}
    if doc_type:
        doc_filter["documents.doc_type"] = doc_type
    if favorites_only:
        doc_filter["documents.favorite"] = True
    if search:
        doc_filter["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"documents.doc_name": {"$regex": search, "$options": "i"}},
        ]
    if doc_filter:
        pipeline.append({"$match": doc_filter})

    # Count
    count_res = await db.hrm_employees.aggregate(pipeline + [{"$count": "total"}]).to_list(1)
    total = count_res[0]["total"] if count_res else 0

    # Page
    pipeline += [
        {"$sort": {"documents.uploaded_at": -1}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size},
        {"$project": {
            "employee_name": "$full_name",
            "employee_num_id": "$employee_id",
            "designation": "$designation_name",
            "doc_index": 1,
            "doc": "$documents",
        }},
    ]

    raw = await db.hrm_employees.aggregate(pipeline).to_list(page_size)

    items = []
    for r in raw:
        d = r.get("doc", {})
        items.append({
            "employee_id": str(r["_id"]),
            "employee_name": r.get("employee_name", ""),
            "employee_num_id": r.get("employee_num_id", ""),
            "designation": r.get("designation", ""),
            "doc_index": int(r.get("doc_index", 0)),
            "doc_type": d.get("doc_type", ""),
            "doc_name": d.get("doc_name", ""),
            "file_url": d.get("file_url", ""),
            "uploaded_at": d.get("uploaded_at"),
            "favorite": bool(d.get("favorite", False)),
            "tags": d.get("tags", []),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── Update document metadata (favorite / tags) ─────────────────────────────────

@router.patch("/{employee_id}/{doc_index}")
async def update_document_meta(
    employee_id: str,
    doc_index: int,
    body: DocumentMetaUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    """Toggle favorite or update tags on a document."""
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = emp.get("documents", [])
    if doc_index < 0 or doc_index >= len(docs):
        raise HTTPException(status_code=400, detail="Invalid document index")

    if body.favorite is not None:
        docs[doc_index]["favorite"] = bool(body.favorite)
    if body.tags is not None:
        docs[doc_index]["tags"] = [t.strip() for t in body.tags if t.strip()]

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": datetime.now(timezone.utc)}},
    )
    return docs[doc_index]


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

    # Remove file from disk if it exists
    removed_doc = docs[doc_index]
    file_url = removed_doc.get("file_url", "")
    if file_url.startswith("/uploads/"):
        disk_path = file_url.lstrip("/")
        if os.path.exists(disk_path):
            try:
                os.remove(disk_path)
            except OSError:
                pass

    docs.pop(doc_index)
    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": datetime.now(timezone.utc)}},
    )


# ── Self-service: view own documents ─────────────────────────────────────────

@router.get("/me")
async def get_my_documents(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:attendance:self"])),
):
    """Return documents for the calling user's linked employee record."""
    emp_id = cu.get("hrm_employee_id")
    if not emp_id:
        user_doc = await db.users.find_one(
            {"_id": cu["id"]}, {"hrm_employee_id": 1, "email": 1}
        )
        if user_doc:
            emp_id = user_doc.get("hrm_employee_id")
            if not emp_id:
                user_email = (user_doc.get("email") or "").strip()
                if user_email:
                    emp_doc = await db.hrm_employees.find_one(
                        {
                            "email": _re.compile(f"^{_re.escape(user_email)}$", _re.IGNORECASE),
                            "company_id": cu["company_id"],
                            "is_deleted": False,
                        },
                        {"_id": 1},
                    )
                    if emp_doc:
                        emp_id = str(emp_doc["_id"])
    if not emp_id:
        return {"documents": []}
    emp = await db.hrm_employees.find_one(
        {"_id": emp_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    return {"documents": emp.get("documents", []) if emp else []}


# ── List (per employee) ────────────────────────────────────────────────────────

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
