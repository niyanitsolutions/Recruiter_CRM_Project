"""HRM — Secure employee document upload token system.

HR generates a one-time token link.
Employee opens the link and uploads documents.
Token is invalidated after use or expiry.
"""
import os
import pathlib
import secrets
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional, List

_BACKEND_ROOT = pathlib.Path(__file__).resolve().parent.parent.parent.parent

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from app.core.dependencies import get_company_db, require_hrm_module, require_permissions

router = APIRouter(prefix="/hrm/doc-upload-tokens", tags=["HRM - Doc Upload Tokens"])

UPLOAD_DIR = str(_BACKEND_ROOT / "uploads" / "hrm_docs")
ALLOWED_EXTENSIONS = {".pdf", ".jpg", ".jpeg", ".png", ".docx"}
MAX_SIZE_MB = 10
DEFAULT_EXPIRY_HOURS = 72


def _allowed(filename: str) -> bool:
    return os.path.splitext(filename.lower())[1] in ALLOWED_EXTENSIONS


def _to_utc(dt) -> "datetime | None":
    """Motor returns datetimes as UTC-naive. Make them UTC-aware for comparison."""
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


class GenerateTokenRequest(BaseModel):
    employee_id: str
    expiry_hours: int = DEFAULT_EXPIRY_HOURS
    message: Optional[str] = None   # Optional message shown to employee
    doc_types_requested: Optional[List[str]] = None  # Which doc types to request


class ReactivateTokenRequest(BaseModel):
    expiry_hours: int = DEFAULT_EXPIRY_HOURS


# ── HR: Generate token ─────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def generate_upload_token(
    body: GenerateTokenRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """HR generates a secure one-time upload link for an employee."""
    emp = await db.hrm_employees.find_one(
        {"_id": body.employee_id, "company_id": cu["company_id"], "is_deleted": False},
        {"full_name": 1, "employee_id": 1, "email": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee not found")

    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(hours=body.expiry_hours)
    token = secrets.token_urlsafe(32)

    doc = {
        "_id": str(uuid.uuid4()),
        "company_id": cu["company_id"],
        "token": token,
        "employee_id": body.employee_id,
        "employee_name": emp.get("full_name", ""),
        "employee_code": emp.get("employee_id", ""),
        "status": "active",    # active | used | expired | revoked
        "message": body.message,
        "doc_types_requested": body.doc_types_requested or [],
        "created_by": cu["id"],
        "created_at": now,
        "expires_at": expires_at,
        "used_at": None,
        "upload_count": 0,
    }
    await db.hrm_doc_upload_tokens.insert_one(doc)

    return {
        "token_id": doc["_id"],
        "token": token,
        "employee_name": emp.get("full_name", ""),
        "expires_at": expires_at.isoformat(),
        "upload_url": f"/document-upload/{token}",
    }


# ── HR: List tokens ────────────────────────────────────────────────────────────

@router.get("")
async def list_upload_tokens(
    employee_id: Optional[str] = None,
    status: Optional[str] = None,
    page: int = 1,
    page_size: int = 20,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """List all upload tokens (HR view)."""
    # Mark expired tokens
    now = datetime.now(timezone.utc)
    await db.hrm_doc_upload_tokens.update_many(
        {"company_id": cu["company_id"], "status": "active", "expires_at": {"$lt": now}},
        {"$set": {"status": "expired"}},
    )

    query: dict = {"company_id": cu["company_id"]}
    if employee_id:
        query["employee_id"] = employee_id
    if status:
        query["status"] = status

    total = await db.hrm_doc_upload_tokens.count_documents(query)
    skip = (page - 1) * page_size
    cursor = db.hrm_doc_upload_tokens.find(query).sort("created_at", -1).skip(skip).limit(page_size)
    items = await cursor.to_list(page_size)
    for item in items:
        item["id"] = item.pop("_id")
        # Only expose the token value if the link is active (for copy functionality)
        if item.get("status") != "active":
            item.pop("token", None)
    return {"items": items, "total": total, "page": page, "page_size": page_size}


# ── HR: Reactivate / extend token ─────────────────────────────────────────────

@router.post("/{token_id}/reactivate")
async def reactivate_token(
    token_id: str,
    body: ReactivateTokenRequest,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    """Reactivate an expired or used token (generates a new token value)."""
    now = datetime.now(timezone.utc)
    new_token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(hours=body.expiry_hours)

    result = await db.hrm_doc_upload_tokens.find_one_and_update(
        {"_id": token_id, "company_id": cu["company_id"]},
        {"$set": {
            "token": new_token,
            "status": "active",
            "expires_at": expires_at,
            "used_at": None,
            "upload_count": 0,
            "reactivated_at": now,
            "reactivated_by": cu["id"],
        }},
        return_document=True,
    )
    if not result:
        raise HTTPException(status_code=404, detail="Token not found")

    return {
        "token_id": token_id,
        "token": new_token,
        "employee_name": result.get("employee_name", ""),
        "expires_at": expires_at.isoformat(),
        "upload_url": f"/document-upload/{new_token}",
    }


# ── HR: Revoke token ──────────────────────────────────────────────────────────

@router.delete("/{token_id}")
async def revoke_token(
    token_id: str,
    cu: dict = Depends(require_hrm_module),
    db=Depends(get_company_db),
    _perm=Depends(require_permissions(["hrm:documents:manage"])),
):
    result = await db.hrm_doc_upload_tokens.update_one(
        {"_id": token_id, "company_id": cu["company_id"]},
        {"$set": {"status": "revoked"}},
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Token not found")
    return {"message": "Token revoked"}


async def _find_token_across_companies(token: str):
    """Search all tenant DBs for a token record (no auth required).

    IMPORTANT: tenant._id is the UUID used for master-DB identity, but the
    company database is named after tenant.company_id (the short key stored in
    JWT and used by get_company_db). We must query by company_id, not _id.
    """
    from app.core.database import DatabaseManager, get_master_db as _get_master
    master = _get_master()
    # Use company_id field (short key) — this is what get_company_db uses
    company_ids = await master.tenants.distinct("company_id", {"is_deleted": {"$ne": True}})
    for cid in company_ids:
        if not cid:
            continue
        try:
            db = DatabaseManager.get_company_db(str(cid))
        except Exception:
            continue
        try:
            rec = await db.hrm_doc_upload_tokens.find_one({"token": token})
        except Exception:
            continue
        if rec:
            return rec, db
    return None, None


# ── Public: Validate token (no auth needed) ───────────────────────────────────

@router.get("/validate/{token}")
async def validate_token(token: str):
    """Validate an upload token and return employee info (public endpoint — no auth)."""
    now = datetime.now(timezone.utc)
    rec, db = await _find_token_across_companies(token)
    if not rec or db is None:
        raise HTTPException(status_code=404, detail="Invalid upload link.")

    if rec.get("status") == "used":
        raise HTTPException(status_code=410, detail="This upload link has already been used.")
    if rec.get("status") == "revoked":
        raise HTTPException(status_code=410, detail="This upload link has been revoked.")
    expires_at = _to_utc(rec.get("expires_at"))
    if rec.get("status") == "expired" or (expires_at and expires_at < now):
        await db.hrm_doc_upload_tokens.update_one(
            {"_id": rec["_id"]}, {"$set": {"status": "expired"}}
        )
        raise HTTPException(status_code=410, detail="This upload link has expired.")

    return {
        "valid": True,
        "employee_name": rec.get("employee_name", ""),
        "message": rec.get("message"),
        "doc_types_requested": rec.get("doc_types_requested", []),
        "expires_at": rec.get("expires_at"),
    }


# ── Public: Upload via token (no auth needed) ─────────────────────────────────

@router.post("/upload/{token}", status_code=201)
async def upload_via_token(
    token: str,
    files: List[UploadFile] = File(...),
    doc_types: str = Form(...),
    doc_names: str = Form(...),
):
    """Employee uploads documents via their secure token link (no login required)."""
    now = datetime.now(timezone.utc)
    rec, db = await _find_token_across_companies(token)
    if not rec or db is None:
        raise HTTPException(status_code=404, detail="Invalid upload link.")
    if rec.get("status") != "active":
        raise HTTPException(status_code=410, detail="This upload link has expired or already been used.")
    expires_at = _to_utc(rec.get("expires_at"))
    if expires_at and expires_at < now:
        await db.hrm_doc_upload_tokens.update_one({"_id": rec["_id"]}, {"$set": {"status": "expired"}})
        raise HTTPException(status_code=410, detail="This upload link has expired.")

    employee_id = rec["employee_id"]
    company_id  = rec["company_id"]

    emp = await db.hrm_employees.find_one(
        {"_id": employee_id, "company_id": company_id, "is_deleted": False},
        {"documents": 1},
    )
    if not emp:
        raise HTTPException(status_code=404, detail="Employee record not found.")

    type_list = [t.strip() for t in doc_types.split(",")]
    name_list = [n.strip() for n in doc_names.split(",")]

    if len(files) != len(type_list):
        raise HTTPException(status_code=400, detail="Mismatch between files and doc_types.")

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    docs = emp.get("documents", [])
    uploaded = []

    for file, doc_type, doc_name in zip(files, type_list, name_list):
        if not _allowed(file.filename or ""):
            continue
        content = await file.read()
        if len(content) > MAX_SIZE_MB * 1024 * 1024:
            continue

        ext = os.path.splitext(file.filename or "")[1]
        stored_name = f"{uuid.uuid4()}{ext}"
        file_path = os.path.join(UPLOAD_DIR, stored_name)
        with open(file_path, "wb") as fh:
            fh.write(content)

        file_url = f"/uploads/hrm_docs/{stored_name}"
        existing_idx = next((i for i, d in enumerate(docs) if d.get("doc_type") == doc_type), None)

        if existing_idx is not None:
            old_doc = docs[existing_idx]
            version = old_doc.get("version", 1) + 1
            history_entry = {k: v for k, v in old_doc.items() if k != "version_history"}
            history_entry["archived_at"] = now
            new_doc = {
                "doc_id": str(uuid.uuid4()),
                "doc_type": doc_type, "doc_name": doc_name,
                "file_url": file_url, "original_filename": file.filename or stored_name,
                "status": "pending", "uploaded_by": f"token:{rec['_id']}",
                "uploaded_at": now, "approved_by": None, "approved_at": None,
                "rejection_reason": None, "comments": None,
                "version": version, "favorite": False, "tags": [],
                "version_history": old_doc.get("version_history", []) + [history_entry],
            }
            docs[existing_idx] = new_doc
        else:
            new_doc = {
                "doc_id": str(uuid.uuid4()),
                "doc_type": doc_type, "doc_name": doc_name,
                "file_url": file_url, "original_filename": file.filename or stored_name,
                "status": "pending", "uploaded_by": f"token:{rec['_id']}",
                "uploaded_at": now, "approved_by": None, "approved_at": None,
                "rejection_reason": None, "comments": None,
                "version": 1, "favorite": False, "tags": [],
                "version_history": [],
            }
            docs.append(new_doc)
        uploaded.append(new_doc)

    await db.hrm_employees.update_one(
        {"_id": employee_id},
        {"$set": {"documents": docs, "updated_at": now}},
    )

    # Mark token as used
    await db.hrm_doc_upload_tokens.update_one(
        {"_id": rec["_id"]},
        {"$set": {"status": "used", "used_at": now}, "$inc": {"upload_count": len(uploaded)}},
    )

    return {"message": f"{len(uploaded)} document(s) uploaded successfully.", "count": len(uploaded)}
