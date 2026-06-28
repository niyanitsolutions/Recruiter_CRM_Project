"""
Public Forms API — Permanent per-user slug-based candidate application forms.

Each authenticated user can generate ONE permanent public URL.
The URL accepts unlimited candidate submissions, each assigned to the form owner.
Completely separate from one-time token forms in candidates.py (which are unchanged).
"""
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile, status as http_status
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid
import secrets
import logging
import os

from app.core.dependencies import get_current_user, get_company_db, require_permissions
from app.core.database import get_master_db, get_company_db as _get_cdb

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/candidates/my-public-form", tags=["Public Forms"])
public_router = APIRouter(prefix="/public", tags=["Public Apply"])

# ── Helpers ────────────────────────────────────────────────────────────────────

def _generate_slug() -> str:
    """16-char URL-safe random slug — doesn't expose any internal ID."""
    return secrets.token_urlsafe(12)  # 12 bytes → 16 base64url chars


async def _find_form_by_slug(slug: str):
    """
    Locate the public_form document and its company_id by slug.
    Returns (form_doc, company_id, company_db) or raises 404.
    """
    master_db = get_master_db()
    tenants = await master_db.tenants.find(
        {"status": "active"},
        {"company_id": 1},
    ).to_list(length=2000)
    for t in tenants:
        cid = t.get("company_id")
        if not cid:
            continue
        company_db = _get_cdb(cid)
        doc = await company_db.public_forms.find_one({"slug": slug, "is_deleted": False})
        if doc:
            return doc, cid, company_db
    raise HTTPException(status_code=404, detail="Form not found.")


def _serialize(doc: dict) -> dict:
    result = {}
    for k, v in doc.items():
        if isinstance(v, datetime):
            result[k] = v.isoformat()
        else:
            result[k] = v
    return result


# ── Authenticated: per-user form management ────────────────────────────────────

@router.get("")
async def get_my_public_form(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Return the current user's public form, or null if they haven't generated one yet."""
    user_id = current_user.get("id")
    doc = await db.public_forms.find_one({"owner_id": user_id, "is_deleted": False})
    if not doc:
        return {"success": True, "data": None}
    doc.pop("is_deleted", None)
    return {"success": True, "data": _serialize(doc)}


@router.post("")
async def generate_my_public_form(
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Generate (or return existing) the current user's permanent public form URL."""
    user_id = current_user.get("id")

    # Idempotent: return existing form if already generated
    existing = await db.public_forms.find_one({"owner_id": user_id, "is_deleted": False})
    if existing:
        existing.pop("is_deleted", None)
        return {"success": True, "data": _serialize(existing), "already_existed": True}

    # Generate a globally unique slug (retry on collision)
    for _ in range(10):
        slug = _generate_slug()
        master_db = get_master_db()
        tenants = await master_db.tenants.find({"status": "active"}, {"company_id": 1}).to_list(1000)
        collision = False
        for t in tenants:
            cid = t.get("company_id")
            if not cid:
                continue
            cdb = _get_cdb(cid)
            if await cdb.public_forms.find_one({"slug": slug}):
                collision = True
                break
        if not collision:
            break
    else:
        raise HTTPException(status_code=500, detail="Could not generate a unique form slug.")

    now = datetime.now(timezone.utc)
    owner_name = (
        current_user.get("full_name")
        or current_user.get("username")
        or ""
    )
    form_doc = {
        "_id": uuid.uuid4().hex,
        "slug": slug,
        "owner_id": user_id,
        "owner_name": owner_name,
        "company_id": current_user.get("company_id"),
        "is_enabled": True,
        "total_views": 0,
        "total_opens": 0,
        "total_submissions": 0,
        "last_submission_at": None,
        "created_at": now,
        "updated_at": now,
        "is_deleted": False,
    }
    await db.public_forms.insert_one(form_doc)
    form_doc.pop("is_deleted", None)
    return {"success": True, "data": _serialize(form_doc), "already_existed": False}


class UpdateFormRequest(BaseModel):
    is_enabled: bool


@router.put("")
async def update_my_public_form(
    body: UpdateFormRequest,
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Activate or deactivate the current user's public form."""
    user_id = current_user.get("id")
    doc = await db.public_forms.find_one({"owner_id": user_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="No public form found. Generate one first.")
    await db.public_forms.update_one(
        {"owner_id": user_id},
        {"$set": {"is_enabled": body.is_enabled, "updated_at": datetime.now(timezone.utc)}},
    )
    updated = await db.public_forms.find_one({"owner_id": user_id})
    updated.pop("is_deleted", None)
    return {"success": True, "data": _serialize(updated)}


@router.get("/qr")
async def get_my_qr_code(
    frontend_base_url: str = "https://app.hireflow.in",
    current_user: dict = Depends(get_current_user),
    db=Depends(get_company_db),
    _perms=Depends(require_permissions("candidates:create")),
):
    """Generate and return a QR code PNG for the current user's public form URL."""
    user_id = current_user.get("id")
    doc = await db.public_forms.find_one({"owner_id": user_id, "is_deleted": False})
    if not doc:
        raise HTTPException(status_code=404, detail="No public form found. Generate one first.")

    slug = doc["slug"]
    form_url = f"{frontend_base_url.rstrip('/')}/apply/public/{slug}"

    try:
        import qrcode
        import io
        from fastapi.responses import Response

        qr = qrcode.QRCode(
            version=1,
            error_correction=qrcode.constants.ERROR_CORRECT_H,
            box_size=10,
            border=4,
        )
        qr.add_data(form_url)
        qr.make(fit=True)
        img = qr.make_image(fill_color="black", back_color="white")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        buf.seek(0)
        return Response(
            content=buf.read(),
            media_type="image/png",
            headers={"Content-Disposition": f'attachment; filename="public-form-qr.png"'},
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
    Returns form status for the apply page to render, plus increments view counter.
    """
    form_doc, company_id, company_db = await _find_form_by_slug(slug)

    # Increment view counter
    await company_db.public_forms.update_one({"slug": slug}, {"$inc": {"total_views": 1}})

    if not form_doc.get("is_enabled", True):
        return {
            "success": False,
            "disabled": True,
            "message": "This application form is currently unavailable.",
        }

    master_db = get_master_db()
    tenant = await master_db.tenants.find_one({"company_id": company_id}, {"company_name": 1})
    company_name = tenant.get("company_name", "") if tenant else ""

    return {
        "success": True,
        "form": {
            "slug": slug,
            "company_name": company_name,
            "is_enabled": True,
        },
    }


@public_router.post("/apply/{slug}/open")
async def track_form_open(slug: str):
    """Increment the opens counter when a candidate starts filling the form."""
    form_doc, company_id, company_db = await _find_form_by_slug(slug)
    await company_db.public_forms.update_one({"slug": slug}, {"$inc": {"total_opens": 1}})
    return {"success": True}


@public_router.post("/apply/{slug}")
async def submit_apply_form(slug: str, data: dict):
    """
    Public endpoint — no auth.
    Accepts candidate submission, creates a Candidate assigned to the form owner.
    Unlimited submissions. Each creates a new candidate.
    """
    form_doc, company_id, company_db = await _find_form_by_slug(slug)

    if not form_doc.get("is_enabled", True):
        raise HTTPException(
            status_code=403,
            detail="This application form is currently unavailable.",
        )

    first_name = (data.get("first_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    if not first_name or not email:
        raise HTTPException(status_code=422, detail="first_name and email are required.")

    existing = await company_db.candidates.find_one({"email": email, "is_deleted": False})
    if existing:
        raise HTTPException(
            status_code=409,
            detail="A candidate with this email already exists.",
        )

    now = datetime.now(timezone.utc)
    candidate_id = uuid.uuid4().hex
    owner_id = form_doc.get("owner_id")

    # Build experience/education from payload (mirrors existing token-form logic)
    work_experience = data.get("work_experience", [])
    current_exp = None
    if work_experience:
        current_exp = next((e for e in work_experience if e.get("is_current")), None)
        if not current_exp and work_experience:
            current_exp = work_experience[-1]

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
        "current_company": (current_exp.get("company_name") if current_exp else None) or data.get("current_company") or None,
        "current_designation": (current_exp.get("designation") if current_exp else None) or data.get("current_designation") or None,
        "current_ctc": data.get("current_ctc"),
        "expected_ctc": data.get("expected_ctc"),
        "notice_period": data.get("notice_period") or None,
        "skills": data.get("skills", []),
        "skill_tags": data.get("skill_tags") or [
            s.get("name", s) if isinstance(s, dict) else s for s in data.get("skills", [])
        ],
        "education": data.get("education", []),
        "work_experience": work_experience,
        "preferred_locations": data.get("preferred_locations", []),
        "willing_to_relocate": bool(data.get("willing_to_relocate", False)),
        "linkedin_url": data.get("linkedin_url") or None,
        "portfolio_url": data.get("portfolio_url") or None,
        "summary": data.get("summary") or None,
        # Ownership — assigned to form owner, not anonymous
        "source": "public_form",
        "public_form_slug": slug,
        "public_form_id": form_doc.get("_id"),
        "status": "active",
        "is_deleted": False,
        "created_by": owner_id,        # assigned to form owner
        "added_by_name": form_doc.get("owner_name", ""),
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


@public_router.post("/apply/{slug}/photo")
async def public_upload_photo(
    slug: str,
    candidate_id: str,
    file: UploadFile = File(...),
):
    """Upload a profile photo for a candidate submitted via public form."""
    form_doc, company_id, company_db = await _find_form_by_slug(slug)
    candidate = await company_db.candidates.find_one({"_id": candidate_id, "is_deleted": False})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

    allowed = ["image/jpeg", "image/jpg", "image/png", "image/webp"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=422, detail="Only JPEG, PNG, or WEBP images are allowed.")

    content = await file.read()
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="Photo must be smaller than 5 MB.")

    from app.core.config import settings as _cfg
    filename = file.filename or "photo.jpg"
    ext = os.path.splitext(filename)[1].lower() or ".jpg"
    upload_dir = os.path.join(_cfg.UPLOAD_DIR, company_id, "photos")
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = f"{candidate_id}_photo{ext}"
    file_path = os.path.join(upload_dir, safe_name)
    with open(file_path, "wb") as f:
        f.write(content)

    photo_url = f"/uploads/{company_id}/photos/{safe_name}"
    await company_db.candidates.update_one(
        {"_id": candidate_id},
        {"$set": {"photo_url": photo_url, "updated_at": datetime.now(timezone.utc)}},
    )
    return {"success": True, "photo_url": photo_url}


@public_router.post("/apply/{slug}/resume")
async def public_upload_resume(
    slug: str,
    candidate_id: str,
    file: UploadFile = File(...),
):
    """Upload a resume for a candidate submitted via public form."""
    form_doc, company_id, company_db = await _find_form_by_slug(slug)
    candidate = await company_db.candidates.find_one({"_id": candidate_id, "is_deleted": False})
    if not candidate:
        raise HTTPException(status_code=404, detail="Candidate not found.")

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
