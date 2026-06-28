"""
Public Forms API — Permanent slug-based candidate application forms.

Separate from the one-time token forms in candidates.py (which must remain unchanged).
Each public form:
  - Has a unique slug generated from secrets
  - Belongs to a job in a company
  - Accepts unlimited submissions, each creating a new Candidate
  - Tracks views, opens, and submissions
  - Can be enabled/disabled and given an optional expiry date
  - Can generate a QR code
"""
from fastapi import APIRouter, Depends, HTTPException, File, Form, UploadFile, status as http_status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone, timedelta
import uuid
import secrets
import logging

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.core.database import get_master_db, get_company_db as _get_cdb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidates/public-forms", tags=["Public Forms"])
public_router = APIRouter(prefix="/public", tags=["Public Apply"])

# ── Helpers ────────────────────────────────────────────────────────────────────

def _generate_slug() -> str:
    """Generate a 12-char URL-safe random slug."""
    return secrets.token_urlsafe(9)  # 9 bytes → 12 base64url chars


async def _find_form_by_slug(slug: str) -> tuple[Optional[dict], Optional[str]]:
    """
    Find a public form document by slug, searching across all company DBs.
    Returns (form_doc, company_id) or (None, None).
    """
    master_db = get_master_db()
    tenants = await master_db.tenants.find(
        {"status": "active"},
        {"company_id": 1},
    ).to_list(length=1000)
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        company_db = _get_cdb(cid)
        doc = await company_db.public_forms.find_one({"slug": slug, "is_deleted": False})
        if doc:
            return doc, cid
    return None, None


# ── Authenticated CRUD ─────────────────────────────────────────────────────────

class CreatePublicFormRequest(BaseModel):
    job_id: str
    expiry_date: Optional[str] = None  # ISO date string or null


class UpdatePublicFormRequest(BaseModel):
    is_enabled: Optional[bool] = None
    expiry_date: Optional[str] = None


@router.post("")
async def create_public_form(
    body: CreatePublicFormRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Create a new permanent public application form for a job."""
    # Verify the job exists and belongs to this company
    job = await db.jobs.find_one({"_id": body.job_id, "is_deleted": {"$ne": True}})
    if not job:
        raise HTTPException(status_code=404, detail="Job not found.")

    # Check if a public form for this job already exists
    existing = await db.public_forms.find_one({"job_id": body.job_id, "is_deleted": False})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A public form for this job already exists. Disable or delete it first.",
        )

    # Generate a unique slug (retry on collision)
    for _ in range(5):
        slug = _generate_slug()
        collision = await db.public_forms.find_one({"slug": slug})
        if not collision:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate a unique form slug.")

    expiry_date = None
    if body.expiry_date:
        try:
            expiry_date = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00"))
        except ValueError:
            raise HTTPException(status_code=422, detail="Invalid expiry_date format.")

    now = datetime.now(timezone.utc)
    company_id = current_user.get("company_id")
    form_doc = {
        "_id": uuid.uuid4().hex,
        "slug": slug,
        "job_id": body.job_id,
        "job_title": job.get("title") or "",
        "company_id": company_id,
        "is_enabled": True,
        "expiry_date": expiry_date,
        "total_views": 0,
        "total_opens": 0,
        "total_submissions": 0,
        "last_submission_at": None,
        "created_by": current_user.get("id"),
        "created_by_name": current_user.get("full_name") or current_user.get("username") or "",
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    await db.public_forms.insert_one(form_doc)
    form_doc.pop("is_deleted", None)
    return {"success": True, "data": _serialize(form_doc)}


@router.get("")
async def list_public_forms(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:view")),
):
    """List all public forms for this company."""
    docs = await db.public_forms.find({"is_deleted": False}).sort("created_at", -1).to_list(length=500)
    for d in docs:
        d.pop("is_deleted", None)
    return {"success": True, "data": [_serialize(d) for d in docs]}


@router.get("/{form_id}")
async def get_public_form(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:view")),
):
    """Get a single public form by its internal ID."""
    doc = await db.public_forms.find_one({"_id": form_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Public form not found.")
    doc.pop("is_deleted", None)
    return {"success": True, "data": _serialize(doc)}


@router.put("/{form_id}")
async def update_public_form(
    form_id: str,
    body: UpdatePublicFormRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Update enabled status or expiry of a public form."""
    doc = await db.public_forms.find_one({"_id": form_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Public form not found.")

    updates: dict = {"updated_at": datetime.now(timezone.utc)}
    if body.is_enabled is not None:
        updates["is_enabled"] = body.is_enabled
    if body.expiry_date is not None:
        if body.expiry_date == "":
            updates["expiry_date"] = None
        else:
            try:
                updates["expiry_date"] = datetime.fromisoformat(body.expiry_date.replace("Z", "+00:00"))
            except ValueError:
                raise HTTPException(status_code=422, detail="Invalid expiry_date format.")

    await db.public_forms.update_one({"_id": form_id}, {"$set": updates})
    updated = await db.public_forms.find_one({"_id": form_id})
    updated.pop("is_deleted", None)
    return {"success": True, "data": _serialize(updated)}


@router.delete("/{form_id}")
async def delete_public_form(
    form_id: str,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Soft-delete a public form."""
    doc = await db.public_forms.find_one({"_id": form_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Public form not found.")
    await db.public_forms.update_one(
        {"_id": form_id},
        {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "message": "Public form deleted."}


@router.get("/{form_id}/qr")
async def get_qr_code(
    form_id: str,
    frontend_base_url: str = "https://app.hireflow.in",
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:view")),
):
    """Generate and return a QR code PNG for the public form URL."""
    doc = await db.public_forms.find_one({"_id": form_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="Public form not found.")

    slug = doc["slug"]
    form_url = f"{frontend_base_url.rstrip('/')}/apply/public/{slug}"

    try:
        import qrcode
        import io
        from fastapi.responses import Response

        qr = qrcode.QRCode(version=1, error_correction=qrcode.constants.ERROR_CORRECT_H, box_size=8, border=4)
        qr.add_data(form_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="image/png",
            headers={"Content-Disposition": f'attachment; filename="form-qr-{slug}.png"'},
        )
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="QR code generation requires the 'qrcode[pil]' package.",
        )


# ── Public submission endpoints (no auth) ─────────────────────────────────────

@public_router.get("/apply/{slug}")
async def get_apply_form_meta(slug: str):
    """
    Public endpoint — no auth.
    Returns form metadata (job title, company name, enabled/expiry status)
    for the apply page to render. Also increments view counter.
    """
    form_doc, company_id = await _find_form_by_slug(slug)
    if not form_doc:
        raise HTTPException(status_code=404, detail="Form not found.")

    # Increment view counter (fire-and-forget style)
    company_db = _get_cdb(company_id)
    await company_db.public_forms.update_one(
        {"slug": slug},
        {"$inc": {"total_views": 1}},
    )

    # Check expiry
    expiry = form_doc.get("expiry_date")
    if expiry:
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry:
            return {
                "success": False,
                "expired": True,
                "message": "This application form has expired.",
                "job_title": form_doc.get("job_title", ""),
            }

    if not form_doc.get("is_enabled", True):
        return {
            "success": False,
            "disabled": True,
            "message": "This application form is currently disabled.",
            "job_title": form_doc.get("job_title", ""),
        }

    # Get company name for display
    master_db = get_master_db()
    tenant = await master_db.tenants.find_one({"company_id": company_id}, {"company_name": 1})
    company_name = tenant.get("company_name", "") if tenant else ""

    return {
        "success": True,
        "form": {
            "slug": slug,
            "job_title": form_doc.get("job_title", ""),
            "company_name": company_name,
            "is_enabled": True,
        },
    }


@public_router.post("/apply/{slug}/open")
async def track_form_open(slug: str):
    """Increment the 'opens' counter when a candidate starts filling the form."""
    form_doc, company_id = await _find_form_by_slug(slug)
    if not form_doc:
        raise HTTPException(status_code=404, detail="Form not found.")
    company_db = _get_cdb(company_id)
    await company_db.public_forms.update_one(
        {"slug": slug},
        {"$inc": {"total_opens": 1}},
    )
    return {"success": True}


@public_router.post("/apply/{slug}")
async def submit_apply_form(slug: str, data: dict):
    """
    Public endpoint — no auth.
    Accepts candidate details and creates a new Candidate record.
    Allows multiple submissions (each creates a new candidate unless email already exists).
    """
    form_doc, company_id = await _find_form_by_slug(slug)
    if not form_doc:
        raise HTTPException(status_code=404, detail="Form not found.")

    # Guard: disabled or expired
    if not form_doc.get("is_enabled", True):
        raise HTTPException(status_code=403, detail="This application form is currently disabled.")
    expiry = form_doc.get("expiry_date")
    if expiry:
        if expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if datetime.now(timezone.utc) > expiry:
            raise HTTPException(status_code=410, detail="This application form has expired.")

    company_db = _get_cdb(company_id)

    # Validate required fields
    first_name = (data.get("first_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    if not first_name or not email:
        raise HTTPException(status_code=422, detail="first_name and email are required.")

    # Check duplicate email
    existing = await company_db.candidates.find_one({"email": email, "is_deleted": False})
    if existing:
        raise HTTPException(status_code=409, detail="A candidate with this email already exists.")

    now = datetime.now(timezone.utc)
    candidate_id = uuid.uuid4().hex

    candidate = {
        "_id": candidate_id,
        "first_name": first_name,
        "last_name": (data.get("last_name") or "").strip() or None,
        "email": email,
        "mobile": (data.get("mobile") or "").strip() or None,
        "alternate_mobile": (data.get("alternate_mobile") or "").strip() or None,
        "date_of_birth": data.get("date_of_birth") or None,
        "gender": data.get("gender") or None,
        "current_city": data.get("current_city") or None,
        "current_state": data.get("current_state") or None,
        "total_experience_years": data.get("total_experience_years"),
        "current_company": data.get("current_company") or None,
        "current_designation": data.get("current_designation") or None,
        "current_ctc": data.get("current_ctc"),
        "expected_ctc": data.get("expected_ctc"),
        "notice_period": data.get("notice_period") or None,
        "skills": data.get("skills", []),
        "skill_tags": data.get("skill_tags") or [
            s.get("name", s) if isinstance(s, dict) else s for s in data.get("skills", [])
        ],
        "education": data.get("education", []),
        "percentage": data.get("percentage"),
        "preferred_locations": data.get("preferred_locations", []),
        "willing_to_relocate": bool(data.get("willing_to_relocate", False)),
        "linkedin_url": data.get("linkedin_url") or None,
        "portfolio_url": data.get("portfolio_url") or None,
        "notes": data.get("summary") or None,
        "source": "public_form",
        "public_form_slug": slug,
        "job_id": form_doc.get("job_id"),
        "status": "active",
        "is_deleted": False,
        "created_by": None,
        "created_at": now,
        "updated_at": now,
    }

    await company_db.candidates.insert_one(candidate)

    # Update form stats
    await company_db.public_forms.update_one(
        {"slug": slug},
        {"$inc": {"total_submissions": 1}, "$set": {"last_submission_at": now}},
    )

    return {
        "success": True,
        "message": "Thank you! Your application has been submitted successfully.",
        "candidate_id": candidate_id,
    }


@public_router.post("/apply/{slug}/resume")
async def public_upload_resume(
    slug: str,
    candidate_id: str,
    file: UploadFile = File(...),
):
    """
    Public endpoint — no auth.
    Upload a resume for a candidate created via the public form.
    """
    import os

    form_doc, company_id = await _find_form_by_slug(slug)
    if not form_doc:
        raise HTTPException(status_code=404, detail="Form not found.")

    company_db = _get_cdb(company_id)
    candidate = await company_db.candidates.find_one({"_id": candidate_id, "is_deleted": False})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    # File type + size validation
    filename = file.filename or ""
    ext = os.path.splitext(filename)[1].lower()

    try:
        from app.services.platform_settings_service import get_allowed_resume_types, get_max_resume_size_mb
        allowed_types = await get_allowed_resume_types()
        max_size_mb = await get_max_resume_size_mb()
    except Exception:
        allowed_types = ["pdf", "doc", "docx"]
        max_size_mb = 10

    if ext.lstrip(".") not in allowed_types:
        raise HTTPException(
            status_code=422,
            detail=f"File type not allowed. Allowed: {', '.join(allowed_types)}",
        )

    content = await file.read()
    if len(content) > max_size_mb * 1024 * 1024:
        raise HTTPException(status_code=413, detail=f"File exceeds maximum size of {max_size_mb} MB.")

    # Save to uploads directory
    from app.core.config import settings as _cfg
    upload_dir = os.path.join(_cfg.UPLOAD_DIR, company_id, "resumes")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{candidate_id}_resume{ext}"
    file_path = os.path.join(upload_dir, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    resume_url = f"/uploads/{company_id}/resumes/{safe_name}"
    await company_db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"resume_url": resume_url, "resume_filename": filename, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "resume_url": resume_url}


# ── Serialization helper ───────────────────────────────────────────────────────

def _serialize(doc: dict) -> dict:
    """Convert MongoDB document to JSON-serializable dict."""
    result = {}
    for k, v in doc.items():
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result
