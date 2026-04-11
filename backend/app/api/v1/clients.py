"""
Clients API - Phase 3
Handles client (hiring company) management
"""
from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from typing import Optional, List

from app.models.company.client import (
    ClientCreate, ClientUpdate, ClientResponse, ClientListResponse,
    ClientStatus, ClientType
)
from app.services.client_service import ClientService
from app.core.dependencies import get_current_user, get_company_db, require_permissions

router = APIRouter(prefix="/clients", tags=["Clients"])


# ── Bulk import helpers ───────────────────────────────────────────────────────

_IMPORT_FIELD_MAP = {
    # ── Company Name (required) ───────────────────────────────────────────────
    "company name": "name", "company_name": "name", "name": "name",
    "client name": "name", "client_name": "name", "organization": "name",
    "organisation": "name", "firm name": "name", "firm_name": "name",
    "business name": "name", "business_name": "name", "company": "name",
    "employer": "name", "client": "name", "account name": "name",
    "account_name": "name",
    # ── Client Code ───────────────────────────────────────────────────────────
    "code": "code", "client code": "code", "client_code": "code",
    "company code": "code", "company_code": "code", "client id": "code",
    "client_id": "code", "account code": "code", "acc code": "code",
    "client number": "code",
    # ── Client Type ───────────────────────────────────────────────────────────
    "client type": "client_type", "client_type": "client_type",
    "type": "client_type", "category": "client_type",
    "client category": "client_type", "account type": "client_type",
    "engagement type": "client_type",
    # ── Industry ──────────────────────────────────────────────────────────────
    "industry": "industry", "sector": "industry",
    "business sector": "industry", "domain": "industry",
    "vertical": "industry", "industry sector": "industry",
    "industry type": "industry", "business domain": "industry",
    # ── Website ───────────────────────────────────────────────────────────────
    "website": "website", "web": "website", "url": "website",
    "website url": "website", "web url": "website",
    "company website": "website", "company url": "website",
    "site": "website",
    # ── Address ───────────────────────────────────────────────────────────────
    "address": "address", "company address": "address",
    "street": "address", "street address": "address",
    "office address": "address", "registered address": "address",
    "head office address": "address", "hq address": "address",
    # ── City ──────────────────────────────────────────────────────────────────
    "city": "city", "location": "city", "company city": "city",
    "hq city": "city", "headquarter city": "city", "office city": "city",
    "base city": "city", "office location": "city",
    # ── State ─────────────────────────────────────────────────────────────────
    "state": "state", "province": "state", "company state": "state",
    "hq state": "state",
    # ── Country ───────────────────────────────────────────────────────────────
    "country": "country", "company country": "country", "nation": "country",
    # ── Zip / Pincode ─────────────────────────────────────────────────────────
    "zip": "zip_code", "zip code": "zip_code", "zip_code": "zip_code",
    "pincode": "zip_code", "pin code": "zip_code",
    "postal code": "zip_code", "postal_code": "zip_code",
    # ── Company Email ─────────────────────────────────────────────────────────
    "email": "email", "company email": "email", "email address": "email",
    "office email": "email", "business email": "email", "email id": "email",
    "corporate email": "email", "general email": "email",
    # ── Company Phone ─────────────────────────────────────────────────────────
    "phone": "phone", "telephone": "phone", "company phone": "phone",
    "office phone": "phone", "phone number": "phone", "landline": "phone",
    "office number": "phone", "tel": "phone", "contact no": "phone",
    # ── Primary Contact Name ──────────────────────────────────────────────────
    "contact name": "contact_name", "contact_name": "contact_name",
    "contact person": "contact_name", "contact_person": "contact_name",
    "poc name": "contact_name", "poc": "contact_name",
    "point of contact": "contact_name", "primary contact": "contact_name",
    "hr name": "contact_name", "hr contact": "contact_name",
    "person name": "contact_name", "contact person name": "contact_name",
    "spoc name": "contact_name", "spoc": "contact_name",
    "contact full name": "contact_name",
    # ── Contact Designation ───────────────────────────────────────────────────
    "contact designation": "contact_designation",
    "contact_designation": "contact_designation",
    "poc designation": "contact_designation",
    "contact title": "contact_designation",
    "contact position": "contact_designation",
    "person designation": "contact_designation",
    "spoc designation": "contact_designation",
    # ── Contact Email ─────────────────────────────────────────────────────────
    "contact email": "contact_email", "contact_email": "contact_email",
    "poc email": "contact_email", "hr email": "contact_email",
    "contact person email": "contact_email", "primary email": "contact_email",
    "spoc email": "contact_email", "person email": "contact_email",
    # ── Contact Mobile / Phone ────────────────────────────────────────────────
    "contact mobile": "contact_mobile", "contact_mobile": "contact_mobile",
    "contact phone": "contact_mobile", "contact_phone": "contact_mobile",
    "poc mobile": "contact_mobile", "poc phone": "contact_mobile",
    "hr mobile": "contact_mobile", "hr phone": "contact_mobile",
    "contact number": "contact_mobile", "person mobile": "contact_mobile",
    "spoc mobile": "contact_mobile", "person phone": "contact_mobile",
    # ── Business Details ──────────────────────────────────────────────────────
    "gstin": "gstin", "gst": "gstin", "gst number": "gstin",
    "gstin number": "gstin", "gst no": "gstin", "gst_no": "gstin",
    "gst registration": "gstin",
    "pan": "pan", "pan number": "pan", "pan no": "pan",
    "pan card": "pan", "company pan": "pan", "pan_no": "pan",
    # ── Commission ────────────────────────────────────────────────────────────
    "commission": "commission_percentage",
    "commission percentage": "commission_percentage",
    "commission_percentage": "commission_percentage",
    "commission percent": "commission_percentage",
    "placement fee": "commission_percentage",
    "fee percentage": "commission_percentage", "fee percent": "commission_percentage",
    # ── Payment Terms ─────────────────────────────────────────────────────────
    "payment terms": "payment_terms", "payment_terms": "payment_terms",
    "credit days": "payment_terms", "payment days": "payment_terms",
    "net days": "payment_terms", "credit period": "payment_terms",
    "payment period": "payment_terms",
    # ── Agreement Dates ───────────────────────────────────────────────────────
    "agreement start": "agreement_start", "agreement_start": "agreement_start",
    "contract start": "agreement_start", "start date": "agreement_start",
    "agreement start date": "agreement_start", "contract start date": "agreement_start",
    "agreement end": "agreement_end", "agreement_end": "agreement_end",
    "contract end": "agreement_end", "end date": "agreement_end",
    "agreement end date": "agreement_end", "contract end date": "agreement_end",
    "expiry date": "agreement_end", "agreement expiry": "agreement_end",
    # ── Status ────────────────────────────────────────────────────────────────
    "status": "status", "client status": "status", "account status": "status",
    # ── Notes ─────────────────────────────────────────────────────────────────
    "notes": "notes", "remarks": "remarks_raw", "comments": "notes",
    "description": "notes", "additional notes": "notes", "about": "notes",
}

_IMPORT_MAP_SORTED = sorted(_IMPORT_FIELD_MAP.keys(), key=len, reverse=True)


def _normalize_header(raw_key: str) -> str:
    import re as _re
    k = raw_key.lower().strip()
    k = _re.sub(r'\s*\([^)]*\)', '', k)   # strip "(…)"
    k = _re.sub(r'[^a-z0-9 ]', ' ', k)   # keep only letters, digits, spaces
    return _re.sub(r'\s+', ' ', k).strip()


def _parse_import_file(content: bytes, ext: str) -> list:
    """Parse uploaded file bytes into a list of raw dicts."""
    import io, csv
    rows = []
    if ext == ".csv":
        text = content.decode("utf-8-sig", errors="ignore")
        reader = csv.DictReader(io.StringIO(text))
        rows = [dict(r) for r in reader]
    elif ext in (".xlsx", ".xls"):
        try:
            import openpyxl
            import io as _io
            wb = openpyxl.load_workbook(_io.BytesIO(content), read_only=True, data_only=True)
            ws = wb.active
            headers = []
            for i, row in enumerate(ws.iter_rows(values_only=True)):
                if i == 0:
                    headers = [str(c).strip() if c is not None else "" for c in row]
                else:
                    if all(v is None for v in row):
                        continue
                    rows.append({
                        headers[j]: (str(row[j]).strip() if row[j] is not None else "")
                        for j in range(len(headers))
                    })
        except ImportError:
            raise HTTPException(
                status_code=400,
                detail="openpyxl is not installed on the server. Please contact your administrator."
            )
        except Exception as exc:
            raise HTTPException(
                status_code=400,
                detail=f"Failed to read Excel file: {exc}. Please save as .xlsx and try again."
            )
    elif ext == ".pdf":
        try:
            from pypdf import PdfReader
            import io as _io
            reader = PdfReader(_io.BytesIO(content))
            text = "\n".join(page.extract_text() or "" for page in reader.pages)
        except Exception:
            text = content.decode("utf-8", errors="ignore")
        current: dict = {}
        for line in text.splitlines():
            line = line.strip()
            if not line:
                if current:
                    rows.append(current)
                    current = {}
                continue
            if ":" in line:
                k, _, v = line.partition(":")
                current[k.strip()] = v.strip()
        if current:
            rows.append(current)
    return rows


def _map_import_row(raw: dict) -> dict:
    """
    Map raw Excel/CSV column headers to canonical client field names.
    3-pass resolution: exact → normalized-exact → longest-fuzzy.
    """
    mapped = {}
    for k, v in raw.items():
        # Pass 1: exact (lowercase + strip)
        canon = _IMPORT_FIELD_MAP.get(k.lower().strip())

        if canon is None:
            norm = _normalize_header(k)
            # Pass 2: exact on normalized form
            canon = _IMPORT_FIELD_MAP.get(norm)

            if canon is None and norm:
                # Pass 3: longest key that is a substring of norm (or vice versa)
                for candidate_key in _IMPORT_MAP_SORTED:
                    if candidate_key in norm or norm in candidate_key:
                        canon = _IMPORT_FIELD_MAP[candidate_key]
                        break

        if canon and canon not in mapped:
            mapped[canon] = v
    return mapped


def _normalize_client_type(raw: str) -> str:
    """Map user-friendly type strings to ClientType enum values."""
    val = raw.lower().strip()
    if val in ("direct", "direct client", "d"):
        return "direct"
    if val in ("vendor", "v"):
        return "vendor"
    if val in ("recruitment", "recruitment agency", "agency", "r", "rec"):
        return "recruitment"
    return "direct"  # default


def _normalize_status(raw: str) -> str:
    """Map status string to ClientStatus enum values."""
    val = raw.lower().strip().replace(" ", "_")
    valid = {"active", "inactive", "on_hold", "blacklisted", "rejected"}
    return val if val in valid else "active"


@router.get("/")
async def list_clients(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[str] = None,
    client_type: Optional[str] = None,
    city: Optional[str] = None,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """List all clients with filters and pagination"""
    result = await ClientService.list_clients(
        db=db,
        page=page,
        page_size=page_size,
        search=search,
        status_filter=status,
        client_type=client_type,
        city=city
    )
    
    return {"success": True, **result}


@router.get("/dropdown")
async def get_clients_dropdown(
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """Get clients for dropdown"""
    clients = await ClientService.get_client_dropdown(db)
    return {"success": True, "data": clients}


@router.get("/statuses")
async def get_client_statuses(
    current_user: dict = Depends(get_current_user)
):
    """Get available client statuses"""
    statuses = [{"value": s.value, "label": s.value.replace("_", " ").title()} for s in ClientStatus]
    return {"success": True, "data": statuses}


@router.get("/types")
async def get_client_types(
    current_user: dict = Depends(get_current_user)
):
    """Get available client types"""
    types = [{"value": t.value, "label": t.value.replace("_", " ").title()} for t in ClientType]
    return {"success": True, "data": types}


@router.post("/")
async def create_client(
    client_data: ClientCreate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:create"]))
):
    """Create a new client"""
    client = await ClientService.create_client(
        db=db,
        client_data=client_data,
        created_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )
    
    return {"success": True, "message": "Client created successfully", "data": client}


@router.get("/{client_id}")
async def get_client(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:view"]))
):
    """Get client by ID"""
    client = await ClientService.get_client(db, client_id)
    return {"success": True, "data": client}


@router.put("/{client_id}")
async def update_client(
    client_id: str,
    update_data: ClientUpdate,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:edit"]))
):
    """Update a client"""
    client = await ClientService.update_client(
        db=db,
        client_id=client_id,
        update_data=update_data,
        updated_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )
    
    return {"success": True, "message": "Client updated successfully", "data": client}


@router.delete("/{client_id}")
async def delete_client(
    client_id: str,
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:delete"]))
):
    """Soft delete a client"""
    await ClientService.delete_client(
        db=db,
        client_id=client_id,
        deleted_by=current_user["id"],
        user_name=current_user.get("full_name", "")
    )
    
    return {"success": True, "message": "Client deleted successfully"}


# ── Bulk Import ───────────────────────────────────────────────────────────────

@router.post("/bulk-import/preview")
async def preview_bulk_import(
    file: UploadFile = File(...),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:create"]))
):
    """
    Parse an uploaded file and return a preview of rows with validation status.
    Does NOT write anything to the database.
    Accepts: .xlsx, .xls, .csv, .pdf
    """
    import os
    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(
            status_code=400,
            detail="Only .xlsx, .xls, .csv, or .pdf files are supported."
        )

    content = await file.read()
    raw_rows = _parse_import_file(content, ext)
    mapped_rows = [_map_import_row(r) for r in raw_rows]

    # Bulk duplicate check — by name (case-insensitive)
    client_names = [
        m["name"].strip().lower()
        for m in mapped_rows
        if m.get("name")
    ]
    existing_names: set = set()
    if client_names:
        cursor = db["clients"].find(
            {"name": {"$regex": f"^({'|'.join(client_names)})$", "$options": "i"}, "is_deleted": False},
            {"name": 1}
        )
        async for doc in cursor:
            existing_names.add(doc["name"].lower())

    preview_rows = []
    for idx, m in enumerate(mapped_rows, start=2):
        errors = []
        if not m.get("name"):
            errors.append("Missing company name")

        name_lower = m.get("name", "").strip().lower()
        is_duplicate = bool(name_lower and name_lower in existing_names)

        preview_rows.append({
            "row": idx,
            "fields": {
                "name":              m.get("name", ""),
                "client_type":       m.get("client_type", ""),
                "industry":          m.get("industry", ""),
                "city":              m.get("city", ""),
                "email":             m.get("email", ""),
                "phone":             m.get("phone", ""),
                "contact_name":      m.get("contact_name", ""),
                "contact_email":     m.get("contact_email", ""),
                "contact_mobile":    m.get("contact_mobile", ""),
                "commission_percentage": m.get("commission_percentage", ""),
                "status":            m.get("status", ""),
            },
            "errors": errors,
            "is_duplicate": is_duplicate,
            "valid": len(errors) == 0 and not is_duplicate,
        })

    valid_count = sum(1 for r in preview_rows if r["valid"])
    return {
        "success": True,
        "total": len(preview_rows),
        "valid": valid_count,
        "rows": preview_rows,
    }


@router.post("/bulk-import")
async def bulk_import_clients(
    file: UploadFile = File(...),
    current_user: dict = Depends(get_current_user),
    db = Depends(get_company_db),
    _: bool = Depends(require_permissions(["clients:create"]))
):
    """
    Bulk import clients from Excel (.xlsx/.xls), CSV, or PDF.
    Returns inserted count, skipped duplicates, and failed rows.
    """
    import os, uuid as _uuid, re as _re
    from datetime import datetime, timezone

    _, ext = os.path.splitext((file.filename or "").lower())
    if ext not in {".xlsx", ".xls", ".csv", ".pdf"}:
        raise HTTPException(
            status_code=400,
            detail="Only .xlsx, .xls, .csv, or .pdf files are supported."
        )

    content = await file.read()
    rows = _parse_import_file(content, ext)

    inserted = 0
    skipped_duplicates = []
    failed = []
    now = datetime.now(timezone.utc)

    def _safe_float(v):
        try:
            return float(v) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None

    def _safe_int(v):
        try:
            return int(float(v)) if v not in (None, "") else None
        except (ValueError, TypeError):
            return None

    def _safe_date(v):
        if not v:
            return None
        try:
            from dateutil import parser as _dp
            return _dp.parse(str(v), dayfirst=True)
        except Exception:
            return None

    def _clean_phone(v):
        if not v:
            return None
        cleaned = _re.sub(r'[^0-9]', '', str(v))
        # Accept 10-digit Indian mobile or longer international numbers
        return cleaned if len(cleaned) >= 10 else None

    for idx, raw_row in enumerate(rows, start=2):
        m = _map_import_row(raw_row)

        name = (m.get("name") or "").strip()
        if not name:
            failed.append({"row": idx, "reason": "Missing required field: company name"})
            continue

        # Duplicate check (case-insensitive)
        existing = await db["clients"].find_one(
            {"name": {"$regex": f"^{_re.escape(name)}$", "$options": "i"}, "is_deleted": False}
        )
        if existing:
            skipped_duplicates.append(name)
            continue

        # Build contact_persons list from flat contact columns
        contact_persons = []
        c_name = (m.get("contact_name") or "").strip()
        if c_name:
            contact_persons.append({
                "name":        c_name,
                "designation": (m.get("contact_designation") or "").strip() or None,
                "email":       (m.get("contact_email") or "").strip() or None,
                "mobile":      _clean_phone(m.get("contact_mobile")),
                "is_primary":  True,
            })

        # Normalize client_type
        raw_type = (m.get("client_type") or "").strip()
        client_type = _normalize_client_type(raw_type) if raw_type else "direct"

        # Normalize status
        raw_status = (m.get("status") or "").strip()
        status = _normalize_status(raw_status) if raw_status else "active"

        commission = _safe_float(m.get("commission_percentage"))

        doc = {
            "_id":                   str(_uuid.uuid4()),
            "name":                  name,
            "code":                  (m.get("code") or "").strip() or None,
            "client_type":           client_type,
            "industry":              (m.get("industry") or "").strip() or None,
            "website":               (m.get("website") or "").strip() or None,
            "address":               (m.get("address") or "").strip() or None,
            "city":                  (m.get("city") or "").strip() or None,
            "state":                 (m.get("state") or "").strip() or None,
            "country":               (m.get("country") or "").strip() or "India",
            "zip_code":              (m.get("zip_code") or "").strip() or None,
            "email":                 (m.get("email") or "").strip() or None,
            "phone":                 _clean_phone(m.get("phone")),
            "contact_persons":       contact_persons,
            "gstin":                 (m.get("gstin") or "").strip() or None,
            "pan":                   (m.get("pan") or "").strip() or None,
            "commission_percentage": commission if commission is not None else 8.33,
            "payment_terms":         _safe_int(m.get("payment_terms")),
            "agreement_start":       _safe_date(m.get("agreement_start")),
            "agreement_end":         _safe_date(m.get("agreement_end")),
            "status":                status,
            "notes":                 (m.get("notes") or "").strip() or None,
            "total_jobs":            0,
            "active_jobs":           0,
            "total_placements":      0,
            "created_by":            current_user["id"],
            "created_at":            now,
            "is_deleted":            False,
        }

        try:
            await db["clients"].insert_one(doc)
            inserted += 1
        except Exception as e:
            failed.append({"row": idx, "name": name, "reason": str(e)})

    return {
        "success": True,
        "inserted": inserted,
        "skipped_duplicates": len(skipped_duplicates),
        "duplicate_names": skipped_duplicates,
        "failed": len(failed),
        "failed_rows": failed,
        "message": f"Import complete: {inserted} inserted, {len(skipped_duplicates)} skipped, {len(failed)} failed.",
    }