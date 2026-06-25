"""HRM — Employee Document Management (multi-upload, status workflow, version history)"""
import os
import re as _re
import uuid
import mimetypes
import pathlib
from typing import Optional, List
from datetime import datetime, timezone

# Absolute path to backend root regardless of CWD where uvicorn is launched
_BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent  # .../backend

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Query, Request
from fastapi.responses import StreamingResponse, FileResponse
from pydantic import BaseModel

from app.core.dependencies import get_company_db, get_company_db_by_id, require_hrm_module, require_permissions, require_any_permission, get_current_user

router = APIRouter(prefix="/hrm/documents", tags=["HRM - Documents"])

# Use absolute path so uploads work regardless of uvicorn launch directory
UPLOAD_DIR = str(_BACKEND_ROOT / "uploads" / "hrm_docs")
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
MAX_SIZE_MB = 10

# Document categories (used in multi-upload form)
DOC_CATEGORIES = [
    "resume", "aadhaar", "pan", "passport", "education", "experience",
    "offer_letter", "payslip", "certificate", "contract",
    "appointment_letter", "relieving_letter", "other",
]

DOC_STATUSES = ["pending", "approved", "rejected", "reupload_required"]


def _allowed(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


def _get_mime(filename: str) -> str:
    mime, _ = mimetypes.guess_type(filename)
    return mime or "application/octet-stream"


class DocumentStatusUpdate(BaseModel):
    status: str          # approved | rejected | reupload_required
    rejection_reason: Optional[str] = None
    comments: Optional[str] = None


class DocumentMetaUpdate(BaseModel):
    favorite: Optional[bool] = None
    tags: Optional[List[str]] = None


def _make_doc_entry(
    doc_type: str,
    doc_name: str,
    file_url: str,
    original_filename: str,
    uploaded_by: str,
    now: datetime,
    version: int = 1,
) -> dict:
    return {
        "doc_id": str(uuid.uuid4()),
        "doc_type": doc_type,
        "doc_name": doc_name,
        "file_url": file_url,
        "original_filename": original_filename,
        "status": "pending",
        "uploaded_by": uploaded_by,
        "uploaded_at": now,
        "approved_by": None,
        "approved_at": None,
        "rejection_reason": None,
        "comments": None,
        "version": version,
        "favorite": False,
        "tags": [],
        "version_history": [],
    }


# ── Upload single document ─────────────────────────────────────────────────────

def _can_write_documents(cu: dict, employee_id: str) -> bool:
    """True when caller may upload/modify documents for employee_id."""
    if cu.get("hrm_employee_id") == employee_id:
        return True  # self-service always allowed
    perms = set(cu.get("permissions") or [])
    return bool(
        cu.get("is_owner") or cu.get("is_super_admin") or
        perms & {"hrm:documents:manage", "hrm:resources:create", "hrm:resources:edit"}
    )


def _can_read_documents(cu: dict, employee_id: str) -> bool:
    """True when caller may read documents for employee_id."""
    if cu.get("hrm_employee_id") == employee_id:
        return True
    perms = set(cu.get("permissions") or [])
    return bool(
        cu.get("is_owner") or cu.get("is_super_admin") or
        perms & {"hrm:employees:view", "hrm:documents:manage"}
    )


@router.post("/upload/{employee_id}", status_code=201)
async def upload_document(
    employee_id: str,
    doc_type: str = Form(...),
    doc_name: str = Form(...),
    file: UploadFile = File(...),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Upload a single document for an employee (self or manager)."""
    if not _can_write_documents(cu, employee_id):
        raise HTTPException(status_code=403, detail="Access denied")
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

    # Check if a document of same type already exists — version it
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        os.remove(file_path)
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = emp.get("documents", [])
    existing_idx = next((i for i, d in enumerate(docs) if d.get("doc_type") == doc_type), None)

    if existing_idx is not None:
        old_doc = docs[existing_idx]
        version = old_doc.get("version", 1) + 1
        # Move old doc to version_history of new entry
        history_entry = {k: v for k, v in old_doc.items() if k != "version_history"}
        history_entry["archived_at"] = now
        new_doc = _make_doc_entry(doc_type, doc_name, file_url, file.filename or stored_name, cu["id"], now, version)
        new_doc["version_history"] = old_doc.get("version_history", []) + [history_entry]
        docs[existing_idx] = new_doc
    else:
        new_doc = _make_doc_entry(doc_type, doc_name, file_url, file.filename or stored_name, cu["id"], now, 1)
        docs.append(new_doc)

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": now}},
    )
    return {"message": "Document uploaded successfully", "document": new_doc}


# ── Multi-document upload (all categories in one submission) ───────────────────

@router.post("/multi-upload/{employee_id}", status_code=201)
async def multi_upload_documents(
    employee_id: str,
    files: List[UploadFile] = File(...),
    doc_types: str = Form(...),   # comma-separated list of doc_type per file
    doc_names: str = Form(...),   # comma-separated list of doc_name per file
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    """Upload multiple documents at once for an employee (self or manager)."""
    if not _can_write_documents(cu, employee_id):
        raise HTTPException(status_code=403, detail="Access denied")
    type_list = [t.strip() for t in doc_types.split(",")]
    name_list = [n.strip() for n in doc_names.split(",")]

    if len(files) != len(type_list) or len(files) != len(name_list):
        raise HTTPException(status_code=400, detail="Mismatch between files, doc_types, and doc_names counts.")

    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    docs = emp.get("documents", [])
    now = datetime.now(timezone.utc)
    uploaded = []

    for file, doc_type, doc_name in zip(files, type_list, name_list):
        if not _allowed(file.filename or ""):
            continue  # skip invalid files silently

        content = await file.read()
        if len(content) > MAX_SIZE_MB * 1024 * 1024:
            continue  # skip oversized files

        ext = os.path.splitext(file.filename or "")[1]
        stored_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(UPLOAD_DIR, stored_name)
        with open(file_path, "wb") as fh:
            fh.write(content)

        file_url = f"/uploads/hrm_docs/{stored_name}"

        # Version if same doc_type already exists
        existing_idx = next((i for i, d in enumerate(docs) if d.get("doc_type") == doc_type), None)
        if existing_idx is not None:
            old_doc = docs[existing_idx]
            version = old_doc.get("version", 1) + 1
            history_entry = {k: v for k, v in old_doc.items() if k != "version_history"}
            history_entry["archived_at"] = now
            new_doc = _make_doc_entry(doc_type, doc_name, file_url, file.filename or stored_name, cu["id"], now, version)
            new_doc["version_history"] = old_doc.get("version_history", []) + [history_entry]
            docs[existing_idx] = new_doc
        else:
            new_doc = _make_doc_entry(doc_type, doc_name, file_url, file.filename or stored_name, cu["id"], now, 1)
            docs.append(new_doc)

        uploaded.append(new_doc)

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": now}},
    )
    return {"message": f"{len(uploaded)} document(s) uploaded", "documents": uploaded}


# ── Approve / Reject document ─────────────────────────────────────────────────

@router.patch("/{employee_id}/{doc_id}/status")
async def update_document_status(
    employee_id: str,
    doc_id: str,
    body: DocumentStatusUpdate,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """Approve, reject, or mark a document for reupload."""
    if body.status not in DOC_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status. Choose from: {DOC_STATUSES}")

    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = emp.get("documents", [])

    # Ensure every document has a doc_id (backwards compat for legacy uploads)
    changed = False
    for i, d in enumerate(docs):
        if not d.get("doc_id"):
            docs[i]["doc_id"] = str(uuid.uuid4())
            changed = True

    # Find by doc_id
    idx = next((i for i, d in enumerate(docs) if d.get("doc_id") == doc_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Document not found")

    now = datetime.now(timezone.utc)
    docs[idx]["status"] = body.status
    docs[idx]["rejection_reason"] = body.rejection_reason
    docs[idx]["comments"] = body.comments
    if body.status == "approved":
        docs[idx]["approved_by"] = cu["id"]
        docs[idx]["approved_at"] = now

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": now}},
    )
    return docs[idx]


# ── List all documents (cross-employee, filterable) ────────────────────────────

@router.get("/all")
async def list_all_documents(
    doc_type: Optional[str] = None,
    status: Optional[str] = None,
    search: Optional[str] = None,
    favorites_only: bool = False,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
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
    if status:
        doc_filter["documents.status"] = status
    if favorites_only:
        doc_filter["documents.favorite"] = True
    if search:
        doc_filter["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"documents.doc_name": {"$regex": search, "$options": "i"}},
        ]
    if doc_filter:
        pipeline.append({"$match": doc_filter})

    count_res = await db.hrm_employees.aggregate(pipeline + [{"$count": "total"}]).to_list(1)
    total = count_res[0]["total"] if count_res else 0

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
            "doc_id": d.get("doc_id", ""),
            "doc_type": d.get("doc_type", ""),
            "doc_name": d.get("doc_name", ""),
            "file_url": d.get("file_url", ""),
            "original_filename": d.get("original_filename", ""),
            "status": d.get("status", "pending"),
            "uploaded_at": d.get("uploaded_at"),
            "uploaded_by": d.get("uploaded_by"),
            "approved_by": d.get("approved_by"),
            "approved_at": d.get("approved_at"),
            "rejection_reason": d.get("rejection_reason"),
            "version": d.get("version", 1),
            "favorite": bool(d.get("favorite", False)),
            "tags": d.get("tags", []),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── List employees with document counts ───────────────────────────────────────

@router.get("/employee-counts")
async def get_employee_document_counts(
    search: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(30, ge=1, le=200),
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:employees:view"])),
):
    """Return employees with document counts (pending/approved/rejected) per employee."""
    match: dict = {"company_id": cu["company_id"], "is_deleted": False}
    if search:
        match["$or"] = [
            {"full_name": {"$regex": search, "$options": "i"}},
            {"employee_id": {"$regex": search, "$options": "i"}},
        ]

    pipeline = [
        {"$match": match},
        {"$project": {
            "full_name": 1, "employee_id": 1, "designation_name": 1,
            "department_name": 1, "profile_picture": 1,
            "total_docs": {"$size": {"$ifNull": ["$documents", []]}},
            "pending_docs": {
                "$size": {
                    "$filter": {
                        "input": {"$ifNull": ["$documents", []]},
                        "as": "d",
                        "cond": {"$eq": ["$$d.status", "pending"]},
                    }
                }
            },
            "approved_docs": {
                "$size": {
                    "$filter": {
                        "input": {"$ifNull": ["$documents", []]},
                        "as": "d",
                        "cond": {"$eq": ["$$d.status", "approved"]},
                    }
                }
            },
            "rejected_docs": {
                "$size": {
                    "$filter": {
                        "input": {"$ifNull": ["$documents", []]},
                        "as": "d",
                        "cond": {"$in": ["$$d.status", ["rejected", "reupload_required"]]},
                    }
                }
            },
        }},
        {"$sort": {"full_name": 1}},
        {"$skip": (page - 1) * page_size},
        {"$limit": page_size},
    ]

    count_pipeline = [{"$match": match}, {"$count": "total"}]
    count_res = await db.hrm_employees.aggregate(count_pipeline).to_list(1)
    total = count_res[0]["total"] if count_res else 0

    raw = await db.hrm_employees.aggregate(pipeline).to_list(page_size)
    items = []
    for r in raw:
        items.append({
            "id": str(r["_id"]),
            "full_name": r.get("full_name", ""),
            "employee_id": r.get("employee_id", ""),
            "designation_name": r.get("designation_name", ""),
            "department_name": r.get("department_name", ""),
            "profile_picture": r.get("profile_picture"),
            "total_docs": r.get("total_docs", 0),
            "pending_docs": r.get("pending_docs", 0),
            "approved_docs": r.get("approved_docs", 0),
            "rejected_docs": r.get("rejected_docs", 0),
        })

    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── Update document metadata (favorite / tags) ─────────────────────────────────

@router.patch("/{employee_id}/{doc_id}/meta")
async def update_document_meta(
    employee_id: str,
    doc_id: str,
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
    idx = next((i for i, d in enumerate(docs) if d.get("doc_id") == doc_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Document not found")

    if body.favorite is not None:
        docs[idx]["favorite"] = bool(body.favorite)
    if body.tags is not None:
        docs[idx]["tags"] = [t.strip() for t in body.tags if t.strip()]

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": datetime.now(timezone.utc)}},
    )
    return docs[idx]


# ── Delete ─────────────────────────────────────────────────────────────────────

@router.delete("/{employee_id}/{doc_id}", status_code=204)
async def delete_document(
    employee_id: str,
    doc_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_any_permission([["hrm:documents:manage"], ["hrm:resources:create"], ["hrm:resources:edit"]])),
):
    """Remove a document from an employee's record by its doc_id."""
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False}
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    docs = emp.get("documents", [])
    idx = next((i for i, d in enumerate(docs) if d.get("doc_id") == doc_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Document not found")

    removed_doc = docs[idx]
    file_url = removed_doc.get("file_url", "")
    if file_url.startswith("/uploads/"):
        disk_path = str(_BACKEND_ROOT / file_url.lstrip("/"))
        if os.path.exists(disk_path):
            try:
                os.remove(disk_path)
            except OSError:
                pass

    docs.pop(idx)
    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": datetime.now(timezone.utc)}},
    )


# ── Secure file serve with proper headers ─────────────────────────────────────

@router.get("/serve/{employee_id}/{doc_id}")
async def serve_document(
    employee_id: str,
    doc_id: str,
    request: Request,
    download: bool = False,
    token: Optional[str] = None,     # Allow ?token= for browser src/href requests
):
    """Serve a document file with proper MIME type and Content-Disposition.
    Accepts auth via Authorization header OR ?token= query param (for browser src= usage).
    """
    from jose import jwt as _jwt, JWTError
    from app.core.config import settings as _settings

    # Resolve token from header or query param
    auth_header = request.headers.get("Authorization", "")
    raw_token = token or (auth_header[7:].strip() if auth_header.startswith("Bearer ") else None)
    if not raw_token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = _jwt.decode(raw_token, _settings.JWT_SECRET_KEY, algorithms=[_settings.JWT_ALGORITHM])
        company_id = payload.get("company_id")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")

    if not company_id:
        raise HTTPException(status_code=401, detail="Invalid token: missing company")

    db = await get_company_db_by_id(company_id)

    # Check employee access
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": company_id, "is_deleted": False},
        {"documents": 1, "crm_user_id": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Authorization: owner/super-admin, holders of hrm:employees:view/manage,
    # or the employee viewing their own document.
    is_self = (
        employee_id == payload.get("hrm_employee_id")
        or emp.get("crm_user_id") == payload.get("sub")
    )
    if not is_self:
        token_permissions = set(payload.get("permissions") or [])
        is_authorized = (
            payload.get("is_owner")
            or payload.get("is_super_admin")
            or bool(token_permissions & {"hrm:employees:view", "hrm:employees:manage"})
        )
        if not is_authorized:
            raise HTTPException(status_code=403, detail="Access denied")

    docs = emp.get("documents", [])

    # Find by doc_id; also accept legacy docs (no doc_id) by checking if doc_id
    # matches the URL-safe base name of the file for backwards compat.
    doc = next((d for d in docs if d.get("doc_id") == doc_id), None)
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")

    file_url = doc.get("file_url", "")
    if not file_url.startswith("/uploads/"):
        raise HTTPException(status_code=404, detail="File not found")

    # Build absolute path regardless of CWD
    relative_part = file_url.lstrip("/")  # e.g. "uploads/hrm_docs/uuid.pdf"
    disk_path = str(_BACKEND_ROOT / relative_part)
    if not os.path.exists(disk_path):
        raise HTTPException(status_code=404, detail=f"File not found on disk: {relative_part}")

    original_filename = doc.get("original_filename") or os.path.basename(disk_path)
    mime_type = _get_mime(original_filename)
    disposition = "attachment" if download else "inline"

    return FileResponse(
        path=disk_path,
        media_type=mime_type,
        headers={
            "Content-Disposition": f'{disposition}; filename="{original_filename}"',
            "Cache-Control": "private, max-age=3600",
        },
    )


# ── Self-service: view own documents ─────────────────────────────────────────

@router.get("/me")
async def get_my_documents(
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
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
        return {"employee_id": None, "documents": [], "message": "No employee profile linked to your account."}

    emp = await db.hrm_employees.find_one(
        {"_id": emp_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1, "full_name": 1, "employee_id": 1},
    )
    if not emp:
        return {"employee_id": emp_id, "documents": [], "message": "Employee profile not found."}

    docs = []
    for i, d in enumerate(emp.get("documents") or []):
        # Backwards compat: old docs may not have doc_id
        doc_id = d.get("doc_id") or f"legacy-{i}"
        docs.append({
            "doc_id": doc_id,
            "doc_type": d.get("doc_type", ""),
            "doc_name": d.get("doc_name", ""),
            "file_url": d.get("file_url", ""),
            "original_filename": d.get("original_filename", ""),
            "status": d.get("status", "pending"),
            "uploaded_at": d.get("uploaded_at"),
            "rejection_reason": d.get("rejection_reason"),
            "comments": d.get("comments"),
            "version": d.get("version", 1),
        })

    return {
        "employee_id": emp_id,
        "full_name": emp.get("full_name", ""),
        "employee_code": emp.get("employee_id", ""),
        "documents": docs,
    }


# ── List (per employee) ────────────────────────────────────────────────────────

@router.get("/{employee_id}")
async def list_documents(
    employee_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
):
    if not _can_read_documents(cu, employee_id):
        raise HTTPException(status_code=403, detail="Access denied")
    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"documents": 1, "full_name": 1, "employee_id": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    # Ensure every document has doc_id — add for legacy docs & persist
    raw_docs = emp.get("documents") or []
    needs_save = False
    for d in raw_docs:
        if not d.get("doc_id"):
            d["doc_id"] = str(uuid.uuid4())
            needs_save = True
        # Ensure status field exists for legacy docs
        if "status" not in d:
            d["status"] = "pending"
            needs_save = True
        # Ensure original_filename exists
        if not d.get("original_filename") and d.get("file_url"):
            d["original_filename"] = os.path.basename(d["file_url"])
            needs_save = True

    if needs_save:
        await db.hrm_employees.update_one(
            {"_id": employee_id},
            {"$set": {"documents": raw_docs, "updated_at": datetime.now(timezone.utc)}},
        )

    return {
        "employee_id": employee_id,
        "full_name": emp.get("full_name", ""),
        "employee_code": emp.get("employee_id", ""),
        "documents": raw_docs,
    }
