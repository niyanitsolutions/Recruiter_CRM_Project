"""
Attendance Login Validator — Step 14A

Called from AuthService._complete_company_login() AFTER punch-out recovery
and BEFORE session/JWT creation.

Determines whether login should be allowed based on:
  14A.1  Active attendance exception (may grant bypass)
  14A.2  Effective work mode (WFH/Hybrid/Field skip all checks)
  14A.3  Geo fence check (OFFICE mode, only if tenant enabled)
  14A.4  IP restriction check (OFFICE mode, only if tenant enabled)

Rules:
  - Owner always passes (unconditional bypass)
  - Users with no HRM employee record always pass
  - Geo fence is DISABLED by default; never touches other tenants
  - WFH / Hybrid / Field mode: both geo and IP checks skipped
  - OFFICE mode: geo checked if enabled + lat/lon provided; IP checked if restriction enabled

Returns (allowed: bool, deny_reason: str).
When allowed=False the caller MUST NOT create a session or JWT.
"""

import ipaddress
import logging
import math
from datetime import datetime, date, timezone
from typing import Optional, Tuple

from bson import ObjectId

logger = logging.getLogger(__name__)

_REMOTE_MODES = ("wfh", "hybrid", "field")
_LOCKOUT_ATTEMPTS = 5
_LOCKOUT_MINUTES  = 15


# ─────────────────────────────────────────────────────────────────────────────
# Helpers (duplicated deliberately — this module must be self-contained and
# must NEVER import from attendance_service to avoid circular deps)
# ─────────────────────────────────────────────────────────────────────────────

def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Great-circle distance in metres (Haversine formula)."""
    R = 6_371_000
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlam = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
    return 2 * R * math.asin(math.sqrt(a))


def _is_ip_allowed(client_ip: str, approved_ips: list) -> bool:
    """True if client_ip matches any approved IP (exact match or CIDR range)."""
    if not client_ip:
        return False
    try:
        client = ipaddress.ip_address(client_ip)
    except ValueError:
        return False
    for entry in approved_ips:
        try:
            if "/" in entry:
                if client in ipaddress.ip_network(entry, strict=False):
                    return True
            elif client == ipaddress.ip_address(entry):
                return True
        except ValueError:
            continue
    return False


# ─────────────────────────────────────────────────────────────────────────────
# Main validator
# ─────────────────────────────────────────────────────────────────────────────

async def validate_login_access(
    user: dict,
    company_id: str,
    company_db,
    ip_address: str = "",
    latitude: Optional[float] = None,
    longitude: Optional[float] = None,
) -> Tuple[bool, str]:
    """
    Step 14A: Attendance Access Validation.

    Returns (True, "") on pass, (False, reason) on deny.
    Any unexpected exception causes a pass (non-blocking safety net).
    """
    # ── 14A-0: Owner unconditional bypass ─────────────────────────────────────
    if user.get("is_owner"):
        return True, ""

    # ── 14A-0: No HRM employee record → not an attendance-tracked user ─────────
    emp_id = user.get("hrm_employee_id")
    if not emp_id:
        return True, ""

    # ── Load tenant attendance settings ───────────────────────────────────────
    settings_doc = await company_db["company_settings"].find_one({}) or {}
    geo_enabled   = bool(settings_doc.get("attendance_geo_fence_enabled", False))
    ip_enabled    = bool(settings_doc.get("attendance_ip_restriction_enabled", False))

    # Fast-exit if both are disabled (default state)
    if not geo_enabled and not ip_enabled:
        return True, ""

    now_naive = datetime.now(timezone.utc).replace(tzinfo=None)
    today_str = date.today().isoformat()

    # ── 14A.1: Exception check ─────────────────────────────────────────────────
    exception = await company_db["hrm_attendance_exceptions"].find_one({
        "company_id":   company_id,
        "employee_id":  emp_id,
        "is_deleted":   False,
        "allow_login":  True,
        "from_datetime": {"$lte": now_naive},
        "to_datetime":   {"$gte": now_naive},
    })
    bypass_geo = bool(exception and exception.get("bypass_geo_fence"))
    bypass_ip  = bool(exception and exception.get("bypass_ip_restriction"))

    # ── 14A.2: Effective work mode ─────────────────────────────────────────────
    # Priority: approved WMR → employee default → "office"
    wmr = await company_db["hrm_work_mode_requests"].find_one({
        "company_id":  company_id,
        "employee_id": emp_id,
        "status":      "approved",
        "from_date":   {"$lte": today_str},
        "to_date":     {"$gte": today_str},
    })
    if wmr:
        effective_mode = wmr.get("work_mode", "office")
    else:
        emp = await company_db["hrm_employees"].find_one(
            {"_id": emp_id, "is_deleted": False},
            {"default_work_mode": 1},
        )
        effective_mode = (emp.get("default_work_mode") or "office") if emp else "office"

    # ── 14A.3/14A.4: WFH / Hybrid / Field → bypass ALL location checks ────────
    if effective_mode in _REMOTE_MODES:
        await _audit(company_db, company_id, emp_id, effective_mode,
                     latitude, longitude, ip_address, "allowed", "remote_mode")
        return True, ""

    # ── OFFICE MODE: apply geo fence + IP restriction ──────────────────────────
    deny_reason = ""

    # Geo fence
    if geo_enabled and not bypass_geo:
        office_lat = settings_doc.get("attendance_geo_fence_latitude")
        office_lon = settings_doc.get("attendance_geo_fence_longitude")
        radius_m   = int(settings_doc.get("attendance_geo_fence_radius_meters", 100))

        if office_lat is not None and office_lon is not None:
            if latitude is not None and longitude is not None:
                dist = _haversine_meters(latitude, longitude, office_lat, office_lon)
                if dist > radius_m:
                    deny_reason = (
                        "You are not in the office location required by your organization. "
                        "Please contact HR if you require remote access approval."
                    )
            # If lat/lon not provided by client → geo check skipped (backward compatible)

    # IP restriction (only if geo did not already deny)
    if not deny_reason and ip_enabled and not bypass_ip:
        approved_ips = settings_doc.get("approved_office_ips", [])
        if approved_ips:
            if not _is_ip_allowed(ip_address, approved_ips):
                deny_reason = (
                    "You are not authorized to access the system from your current network. "
                    "Please contact HR or your administrator."
                )

    # ── Audit log ──────────────────────────────────────────────────────────────
    result_tag = "denied" if deny_reason else "allowed"
    audit_note = (deny_reason[:120] if deny_reason else "office_mode_ok")
    await _audit(
        company_db, company_id, emp_id, effective_mode,
        latitude, longitude, ip_address, result_tag, audit_note,
    )

    if deny_reason:
        logger.info(
            "[14A] Login denied | company=%s emp=%s mode=%s ip=%s lat=%s lon=%s reason=%s",
            company_id, emp_id, effective_mode, ip_address, latitude, longitude, deny_reason[:80],
        )
        return False, deny_reason

    return True, ""


# ─────────────────────────────────────────────────────────────────────────────
# Geo Fence Audit Logging
# ─────────────────────────────────────────────────────────────────────────────

async def _audit(
    company_db,
    company_id: str,
    employee_id: str,
    work_mode: str,
    latitude: Optional[float],
    longitude: Optional[float],
    ip_address: str,
    result: str,
    reason: str,
) -> None:
    """Write one record to hrm_geo_fence_audit (fire-and-forget; never raises)."""
    try:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await company_db["hrm_geo_fence_audit"].insert_one({
            "_id":         str(ObjectId()),
            "company_id":  company_id,
            "employee_id": employee_id,
            "work_mode":   work_mode,
            "latitude":    latitude,
            "longitude":   longitude,
            "ip_address":  ip_address,
            "result":      result,    # "allowed" | "denied"
            "reason":      reason,
            "event_type":  "login",
            "created_at":  now,
        })
    except Exception:
        pass  # Audit logging must never block login


# ─────────────────────────────────────────────────────────────────────────────
# Fraud Detection — Attendance-level (called from attendance_service.check_in)
# ─────────────────────────────────────────────────────────────────────────────

async def flag_location_fraud(
    company_db,
    company_id: str,
    employee_id: str,
    work_mode: str,
    latitude: Optional[float],
    longitude: Optional[float],
    office_lat: Optional[float],
    office_lon: Optional[float],
    radius_m: int,
    previous_check_in: Optional[dict],
    check_in_time: datetime,
) -> None:
    """
    Analyse punch-in data for suspicious patterns and emit audit events.
    NEVER blocks punch-in — generates audit records only.

    Detections:
      A. Office mode punched while outside office radius
      B. Impossible location jump (too fast movement since last check-in)
    """
    try:
        flags = []

        # A: Office mode outside radius
        if (
            work_mode == "office"
            and latitude is not None and longitude is not None
            and office_lat is not None and office_lon is not None
        ):
            dist = _haversine_meters(latitude, longitude, office_lat, office_lon)
            if dist > radius_m:
                flags.append({
                    "type":    "office_outside_radius",
                    "detail":  f"distance={int(dist)}m radius={radius_m}m",
                })

        # B: Impossible location jump
        if previous_check_in and latitude is not None and longitude is not None:
            prev_geo = previous_check_in.get("check_in_geo") or {}
            prev_lat = prev_geo.get("latitude")
            prev_lon = prev_geo.get("longitude")
            prev_time = previous_check_in.get("check_in")
            if (
                prev_lat is not None and prev_lon is not None
                and prev_time is not None and isinstance(prev_time, datetime)
            ):
                elapsed_seconds = max(1, (check_in_time - prev_time).total_seconds())
                dist_m = _haversine_meters(latitude, longitude, prev_lat, prev_lon)
                # Speed in km/h — flag if > 900 km/h (faster than any commercial flight)
                speed_kmh = (dist_m / 1000) / (elapsed_seconds / 3600)
                if speed_kmh > 900:
                    flags.append({
                        "type":   "impossible_location_jump",
                        "detail": f"speed={int(speed_kmh)}km/h dist={int(dist_m)}m elapsed={int(elapsed_seconds)}s",
                    })

        if flags:
            now = datetime.now(timezone.utc).replace(tzinfo=None)
            await company_db["hrm_fraud_audit"].insert_one({
                "_id":         str(ObjectId()),
                "company_id":  company_id,
                "employee_id": employee_id,
                "work_mode":   work_mode,
                "latitude":    latitude,
                "longitude":   longitude,
                "flags":       flags,
                "event_type":  "check_in_fraud_scan",
                "created_at":  now,
            })
    except Exception:
        pass  # Fraud detection never blocks attendance operations
