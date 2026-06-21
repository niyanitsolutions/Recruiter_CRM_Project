"""HRM — Attendance Service"""
import asyncio
import ipaddress
import math
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from app.models.company.attendance import AttendanceStatus, WorkMode


# Fallback defaults — used when company_settings has no attendance config.
_DEFAULT_GRACE_MINUTES           = 15
_DEFAULT_HALF_DAY_HOURS          = 4.5
_DEFAULT_FULL_DAY_HOURS          = 8.0
_DEFAULT_OFFICE_START            = "09:00"
_DEFAULT_OFFICE_END              = "18:00"
_DEFAULT_MAX_BREAK_MINUTES       = 90
_DEFAULT_MAX_BREAKS              = 5
_DEFAULT_OVERTIME_THRESHOLD_HOURS = 9.0

# Keep old names as aliases so any external callers aren't broken
HALF_DAY_THRESHOLD_HOURS = _DEFAULT_HALF_DAY_HOURS
OVERTIME_THRESHOLD_HOURS = _DEFAULT_OVERTIME_THRESHOLD_HOURS
MIDNIGHT_AUTO_CHECKOUT_HOUR = 0


def _today_dt() -> datetime:
    """Return today's date as a naive datetime at midnight.

    PyMongo 4.x cannot encode Python datetime.date objects — only datetime.datetime.
    Using midnight naive datetime ensures consistent date-keyed queries and inserts.
    Naive (no tzinfo) matches what Motor stores/returns for date fields.
    """
    d = date.today()
    return datetime(d.year, d.month, d.day)


class AttendanceService:
    COL = "hrm_attendance"
    EMP_COL = "hrm_employees"
    SETTINGS_COL = "company_settings"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    # ── Settings ──────────────────────────────────────────────────────────────

    async def _get_settings(self) -> dict:
        """Load attendance config from company_settings with safe fallbacks."""
        doc = await self.db[self.SETTINGS_COL].find_one({}) or {}
        return {
            "office_start":         doc.get("attendance_office_start",    _DEFAULT_OFFICE_START),
            "office_end":           doc.get("attendance_office_end",      _DEFAULT_OFFICE_END),
            "grace_minutes":        int(doc.get("attendance_grace_minutes",    _DEFAULT_GRACE_MINUTES)),
            "half_day_hours":       float(doc.get("attendance_half_day_hours",  _DEFAULT_HALF_DAY_HOURS)),
            "full_day_hours":       float(doc.get("attendance_full_day_hours",  _DEFAULT_FULL_DAY_HOURS)),
            "max_break_minutes":    int(doc.get("attendance_max_break_minutes", _DEFAULT_MAX_BREAK_MINUTES)),
            "max_breaks":           int(doc.get("attendance_max_breaks",        _DEFAULT_MAX_BREAKS)),
            "ip_restriction":       bool(doc.get("attendance_ip_restriction_enabled", False)),
            "approved_ips":         doc.get("approved_office_ips", []),
            # Geo-fence
            "geo_fence_enabled":    bool(doc.get("attendance_geo_fence_enabled", False)),
            "geo_fence_radius":     int(doc.get("attendance_geo_fence_radius_meters", 100)),
            "geo_fence_lat":        doc.get("attendance_geo_fence_latitude"),
            "geo_fence_lon":        doc.get("attendance_geo_fence_longitude"),
            # Working days: 0=Mon, 1=Tue, 2=Wed, 3=Thu, 4=Fri, 5=Sat, 6=Sun
            # Default Mon-Fri. Stored as JSON array in company_settings.
            "working_days":         doc.get("attendance_working_days", [0, 1, 2, 3, 4]),
            # Tenant timezone (IANA name, e.g. "Asia/Kolkata", "America/New_York")
            "timezone":             doc.get("timezone", "UTC"),
            # Overtime: work hours beyond this threshold count as overtime
            "overtime_threshold_hours": float(doc.get("attendance_overtime_threshold_hours", _DEFAULT_OVERTIME_THRESHOLD_HOURS)),
        }

    def _get_effective_working_days(self, settings: dict, emp: Optional[dict]) -> list:
        """Return working day indices (0=Mon..6=Sun), preferring employee override over company config."""
        if emp and emp.get("working_days") is not None:
            return emp["working_days"]
        return settings.get("working_days", [0, 1, 2, 3, 4])

    async def _check_today_holiday(self, company_id: str, department: Optional[str] = None) -> Optional[str]:
        """Return holiday name if today is a company holiday, else None."""
        today_str = date.today().isoformat()
        query: dict = {
            "company_id": company_id,
            "date": today_str,
            "is_active": True,
            "is_deleted": False,
        }
        if department:
            query["$or"] = [
                {"applicable_departments": []},
                {"applicable_departments": department},
            ]
        doc = await self.db["hrm_holidays"].find_one(query)
        return doc["name"] if doc else None

    @staticmethod
    def _haversine_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
        """Haversine great-circle distance in metres between two WGS-84 points."""
        R = 6_371_000  # Earth radius in metres
        phi1, phi2 = math.radians(lat1), math.radians(lat2)
        dphi = math.radians(lat2 - lat1)
        dlam = math.radians(lon2 - lon1)
        a = math.sin(dphi / 2) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(dlam / 2) ** 2
        return 2 * R * math.asin(math.sqrt(a))

    @staticmethod
    def _is_ip_allowed(client_ip: str, approved_ips: List[str]) -> bool:
        """Check if client_ip matches any entry in approved_ips (exact or CIDR)."""
        try:
            client = ipaddress.ip_address(client_ip)
        except ValueError:
            return False
        for entry in approved_ips:
            try:
                if '/' in entry:
                    if client in ipaddress.ip_network(entry, strict=False):
                        return True
                elif client == ipaddress.ip_address(entry):
                    return True
            except ValueError:
                continue
        return False

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))

        # Normalize datetime fields → explicit UTC ISO strings with 'Z' suffix.
        # Motor returns naive datetimes (no tzinfo); JavaScript's Date constructor
        # treats strings without a timezone as LOCAL time, not UTC.  Without 'Z'
        # a check-in stored at 09:30 UTC appears as 09:30 local (wrong in any
        # non-UTC timezone) causing the timer to be off by the UTC offset.
        for field in ("check_in", "check_out", "created_at", "updated_at"):
            val = doc.get(field)
            if isinstance(val, datetime):
                doc[field] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

        # Normalize break-session timestamps (same UTC issue)
        for br in doc.get("breaks", []):
            for ts_field in ("start", "end"):
                val = br.get(ts_field)
                if isinstance(val, datetime):
                    br[ts_field] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"

        # date field may be stored as datetime (midnight) or date — normalize to ISO string
        date_val = doc.get("date")
        if isinstance(date_val, datetime):
            doc["date"] = date_val.strftime("%Y-%m-%d")
        elif isinstance(date_val, date):
            doc["date"] = date_val.isoformat()
        return doc

    async def _get_employee(self, emp_id: str, company_id: str) -> Optional[dict]:
        return await self.db[self.EMP_COL].find_one({"_id": emp_id, "company_id": company_id, "is_deleted": False})

    def _compute_work_hours(self, check_in: datetime, check_out: datetime, total_break_minutes: float) -> float:
        gross = (check_out - check_in).total_seconds() / 3600
        net = gross - (total_break_minutes / 60)
        return round(max(0.0, net), 2)

    # ── Work Mode / Exception helpers ──────────────────────────────────────────

    async def _get_active_work_mode_request(
        self, employee_id: str, company_id: str, today_str: str
    ) -> Optional[dict]:
        """Return the approved WMR active for today, or None."""
        return await self.db["hrm_work_mode_requests"].find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "approved",
            "from_date": {"$lte": today_str},
            "to_date": {"$gte": today_str},
        })

    async def _get_active_exception(
        self, employee_id: str, company_id: str, at_time: datetime
    ) -> Optional[dict]:
        """Return the active attendance exception at at_time (naive UTC), or None."""
        return await self.db["hrm_attendance_exceptions"].find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "is_deleted": False,
            "allow_login": True,
            "from_datetime": {"$lte": at_time},
            "to_datetime": {"$gte": at_time},
        })

    # ── Active shift lookup (Phase 5) ─────────────────────────────────────────

    async def _get_active_shift(self, employee_id: str, company_id: str, today_str: str, settings: dict, emp: Optional[dict]) -> dict:
        """Return the shift that's effective today, in priority order:
        1. hrm_shift_assignments (time-bounded)
        2. employee.shift_id (legacy simple assignment)
        3. company default shift
        4. settings office hours fallback
        """
        # 1. Time-bounded assignment
        assignment = await self.db["hrm_shift_assignments"].find_one(
            {
                "company_id":    company_id,
                "employee_id":   employee_id,
                "is_deleted":    False,
                "effective_from": {"$lte": today_str},
                "$or": [
                    {"effective_to": None},
                    {"effective_to": {"$gte": today_str}},
                ],
            },
            sort=[("effective_from", -1)],
        )
        if assignment:
            return {
                "start":      assignment.get("shift_start") or settings["office_start"],
                "end":        assignment.get("shift_end")   or settings["office_end"],
                "grace":      assignment.get("grace_minutes", settings["grace_minutes"]),
                "is_overnight": assignment.get("is_overnight", False),
                "shift_id":   assignment.get("shift_id"),
                "shift_name": assignment.get("shift_name", ""),
            }

        # 2. Legacy employee.shift_id
        shift_id = emp.get("shift_id") if emp else None
        if shift_id:
            shift = await self.db["hrm_shifts"].find_one({"_id": shift_id, "company_id": company_id, "is_deleted": False})
            if shift:
                return {
                    "start":      shift.get("start_time", settings["office_start"]),
                    "end":        shift.get("end_time",   settings["office_end"]),
                    "grace":      shift.get("grace_minutes", settings["grace_minutes"]),
                    "is_overnight": shift.get("is_overnight", False),
                    "shift_id":   shift_id,
                    "shift_name": shift.get("name", ""),
                }

        # 3. Employee-level direct time fields (very old data)
        if emp and (emp.get("shift_start_time") or emp.get("shift_end_time")):
            return {
                "start":      emp.get("shift_start_time") or settings["office_start"],
                "end":        emp.get("shift_end_time")   or settings["office_end"],
                "grace":      settings["grace_minutes"],
                "is_overnight": False,
                "shift_id":   None,
                "shift_name": "",
            }

        # 4. Company default shift
        default_shift = await self.db["hrm_shifts"].find_one(
            {"company_id": company_id, "is_default": True, "is_deleted": False}
        )
        if default_shift:
            return {
                "start":      default_shift.get("start_time", settings["office_start"]),
                "end":        default_shift.get("end_time",   settings["office_end"]),
                "grace":      default_shift.get("grace_minutes", settings["grace_minutes"]),
                "is_overnight": default_shift.get("is_overnight", False),
                "shift_id":   str(default_shift.get("_id", "")),
                "shift_name": default_shift.get("name", ""),
            }

        # 5. Fallback to settings
        return {
            "start":      settings["office_start"],
            "end":        settings["office_end"],
            "grace":      settings["grace_minutes"],
            "is_overnight": False,
            "shift_id":   None,
            "shift_name": "",
        }

    # ── Comp Off Credit (Phase 4) ──────────────────────────────────────────────

    async def _auto_create_comp_off(
        self,
        employee_id: str,
        company_id: str,
        work_date: str,
        reason: str,
        credits: float = 1.0,
    ) -> None:
        """Create a comp off credit when employee works on a holiday or weekend."""
        from bson import ObjectId
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        existing = await self.db["hrm_comp_off_credits"].find_one({
            "company_id": company_id,
            "employee_id": employee_id,
            "work_date": work_date,
            "is_deleted": False,
        })
        if existing:
            return  # already credited for this day
        await self.db["hrm_comp_off_credits"].insert_one({
            "_id": str(ObjectId()),
            "company_id":  company_id,
            "employee_id": employee_id,
            "work_date":   work_date,
            "reason":      reason,
            "credits":     credits,
            "status":      "available",   # available | used | expired
            "is_deleted":  False,
            "created_at":  now,
            "updated_at":  now,
        })

    # ── Check In ──────────────────────────────────────────────────────────────

    async def check_in(
        self,
        employee_id: str,
        company_id: str,
        marked_by: str,
        notes: str = "",
        work_mode: str = "office",
        client_ip: Optional[str] = None,
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        geo_city: Optional[str] = None,
        geo_country: Optional[str] = None,
        is_self: bool = True,
        is_owner: bool = False,     # Phase 12: owner bypasses geo/IP
    ) -> dict:
        today = _today_dt()  # naive datetime at midnight — PyMongo 4.x requires datetime, not date
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        today_str = date.today().isoformat()

        existing = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if existing and existing.get("check_in"):
            # Already punched in today — return existing record unchanged
            return self._serialize(dict(existing))

        settings = await self._get_settings()
        emp = await self._get_employee(employee_id, company_id)
        dept = emp.get("department") if emp else None

        # Phase 14 — Validation order:
        # 1-2. User/tenant active: handled by JWT middleware (already enforced before this call)
        # 3. Attendance Exception
        # 4. Approved Work Mode
        # 5. Shift Assignment
        # 6. Employee / Company working days
        # 7. Company Holiday
        # 8. Weekend
        # 9. Geo Fence
        # 10. IP Restriction
        # 11. Punch-In Window (shift timing + grace)

        # Phase 12: Owner always bypasses geo/IP (prevent lockout)
        if is_owner:
            is_self = False  # treat like admin — no auto geo-determination

        if is_self:
            # 3. Exception check
            active_exc = await self._get_active_exception(employee_id, company_id, now)
            bypass_geo = bool(active_exc and active_exc.get("bypass_geo_fence"))
            bypass_ip  = bool(active_exc and active_exc.get("bypass_ip_restriction"))

            # 4. Approved work mode
            active_wmr = await self._get_active_work_mode_request(employee_id, company_id, today_str)
            approved_mode = active_wmr.get("work_mode") if active_wmr else None

            # 9. Geo fence
            if settings["geo_fence_enabled"] and not bypass_geo:
                if (settings["geo_fence_lat"] is not None
                        and settings["geo_fence_lon"] is not None
                        and latitude is not None
                        and longitude is not None):
                    distance = self._haversine_meters(
                        latitude, longitude,
                        settings["geo_fence_lat"], settings["geo_fence_lon"],
                    )
                    if distance <= settings["geo_fence_radius"]:
                        work_mode = "office"
                    else:
                        if approved_mode:
                            work_mode = approved_mode
                        elif active_exc:
                            work_mode = "office"
                        else:
                            raise ValueError(
                                "You are not in the office location required by your organization. "
                                "Please contact HR if you require remote access approval."
                            )
                else:
                    if approved_mode:
                        work_mode = approved_mode
                    elif active_exc:
                        work_mode = "office"
                    else:
                        raise ValueError(
                            "Your organization uses geo-fenced attendance. "
                            "Please enable location access or contact HR for remote access approval."
                        )
            else:
                if approved_mode:
                    work_mode = approved_mode

            # 10. IP restriction
            if settings["ip_restriction"] and settings["approved_ips"] and not bypass_ip:
                if work_mode == "office":
                    if not self._is_ip_allowed(client_ip or "", settings["approved_ips"]):
                        raise ValueError(
                            f"Check-in blocked: your IP ({client_ip}) is not in the list of approved office IPs."
                        )

        elif not is_owner:
            # Admin/HR check-in (no is_self, not owner): legacy geo/IP checks
            if work_mode == "office" and settings["ip_restriction"] and settings["approved_ips"]:
                if not self._is_ip_allowed(client_ip or "", settings["approved_ips"]):
                    raise ValueError(
                        f"Check-in blocked: your IP ({client_ip}) is not in the list of approved office IPs."
                    )
            if (work_mode == "office"
                    and settings["geo_fence_enabled"]
                    and settings["geo_fence_lat"] is not None
                    and settings["geo_fence_lon"] is not None):
                if latitude is not None and longitude is not None:
                    distance = self._haversine_meters(
                        latitude, longitude,
                        settings["geo_fence_lat"], settings["geo_fence_lon"],
                    )
                    if distance > settings["geo_fence_radius"]:
                        raise ValueError(
                            f"You are not in the office location required by your organization "
                            f"(distance: {int(distance)}m, allowed radius: {settings['geo_fence_radius']}m). "
                            "Please contact HR if you require remote access approval."
                        )
        # is_owner==True falls through without any geo/IP checks

        # 5. Active shift
        shift = await self._get_active_shift(employee_id, company_id, today_str, settings, emp)
        shift_start = shift["start"]
        grace = shift["grace"]

        # 7. Holiday check
        holiday_name = await self._check_today_holiday(company_id, dept)

        # 8. Weekend check (configurable, Phase 2)
        working_days = self._get_effective_working_days(settings, emp)
        is_today_weekend = date.today().weekday() not in working_days

        # 11. Late calculation
        sh, sm = map(int, shift_start.split(":"))
        shift_dt = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
        late_threshold = shift_dt + timedelta(minutes=grace)
        is_late = now > late_threshold
        late_by = max(0, int((now - late_threshold).total_seconds() / 60)) if is_late else 0

        # ── Status determination ─────────────────────────────────────────────
        if holiday_name:
            initial_status = AttendanceStatus.HOLIDAY
        elif work_mode == "wfh":
            initial_status = AttendanceStatus.WORK_FROM_HOME
        elif work_mode == "hybrid":
            initial_status = AttendanceStatus.HYBRID
        elif work_mode == "field":
            initial_status = AttendanceStatus.FIELD_WORK
        elif is_late:
            initial_status = AttendanceStatus.LATE
        else:
            initial_status = AttendanceStatus.PRESENT

        geo = None
        if latitude is not None or longitude is not None:
            geo = {"latitude": latitude, "longitude": longitude, "city": geo_city, "country": geo_country}

        emp_name = emp.get("full_name", "") if emp else ""

        checkin_fields = {
            "check_in": now,
            "status": initial_status,
            "is_late": is_late,
            "late_by_minutes": late_by,
            "is_holiday_worked": bool(holiday_name),
            "is_weekend_worked": bool(is_today_weekend),   # Phase 4: track for comp off
            "holiday_name": holiday_name,
            "work_mode": work_mode,
            "check_in_ip": client_ip,
            "check_in_geo": geo,
            "shift_id": shift.get("shift_id"),
            "shift_name": shift.get("shift_name"),
            "auto_punched_out": False,
            "notes": notes,
            "marked_by": marked_by,
            "updated_at": now,
        }

        if existing:
            # Existing record without check_in (e.g., a leave placeholder).
            # Update it in place using the original MongoDB _id to avoid
            # string/ObjectId type mismatch that caused upsert failures.
            await self.col.update_one(
                {"_id": existing["_id"]},
                {"$set": checkin_fields},
            )
            result = dict(existing)
            result.update(checkin_fields)
        else:
            # No record yet — create a fresh one via insert_one.
            doc_id = str(ObjectId())
            result = {
                "_id": doc_id,
                "company_id": company_id,
                "employee_id": employee_id,
                "employee_name": emp_name,
                "date": today,
                "breaks": [],
                "total_break_minutes": 0.0,
                "work_hours": 0.0,
                "is_half_day": False,
                "overtime_hours": 0.0,
                "created_at": now,
                **checkin_fields,
            }
            await self.col.insert_one(result)

        # Fire punch-in notification (non-blocking)
        crm_user_id = emp.get("crm_user_id") if emp else None
        if crm_user_id:
            try:
                from app.services.notification_service import NotificationService
                from zoneinfo import ZoneInfo, ZoneInfoNotFoundError
                _tz_name = settings.get("timezone", "UTC")
                try:
                    _tz = ZoneInfo(_tz_name)
                    _now_aware = datetime.now(timezone.utc)
                    check_in_str = _now_aware.astimezone(_tz).strftime("%I:%M %p")
                except (ZoneInfoNotFoundError, Exception):
                    check_in_str = datetime.now(timezone.utc).strftime("%I:%M %p")
                await NotificationService(self.db).notify_punch_in(
                    company_id=company_id,
                    user_id=crm_user_id,
                    check_in_time=check_in_str,
                    work_mode=work_mode,
                )
            except Exception:
                pass

        return self._serialize(result)

    # ── Check Out ─────────────────────────────────────────────────────────────

    async def check_out(
        self,
        employee_id: str,
        company_id: str,
        marked_by: str,
        notes: str = "",
        latitude: Optional[float] = None,
        longitude: Optional[float] = None,
        geo_city: Optional[str] = None,
        geo_country: Optional[str] = None,
        auto: bool = False,
    ) -> dict:
        today = _today_dt()
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes

        # Try today's record first (most common path).
        # Fall back to yesterday's record to handle midnight-boundary edge cases
        # where the client fires the punch-out just after midnight local time but
        # the open record lives on the previous calendar day.
        record = await self.col.find_one({
            "employee_id": employee_id,
            "company_id": company_id,
            "date": today,
            "check_in": {"$ne": None},
            "check_out": None,
        })
        if not record:
            yesterday = today - timedelta(days=1)
            record = await self.col.find_one({
                "employee_id": employee_id,
                "company_id": company_id,
                "date": yesterday,
                "check_in": {"$ne": None},
                "check_out": None,
            })

        if not record:
            return {}

        settings = await self._get_settings()

        # Close any open break
        breaks = list(record.get("breaks", []))
        total_break_minutes = float(record.get("total_break_minutes", 0.0))
        if breaks and not breaks[-1].get("end"):
            br_start = breaks[-1]["start"]
            dur = (now - br_start).total_seconds() / 60
            breaks[-1]["end"] = now
            breaks[-1]["duration_minutes"] = round(dur, 1)
            total_break_minutes += dur

        # For recovered records, add work done in prior sessions before recovery gaps
        pre_recovery_hours = float(record.get("pre_recovery_work_hours", 0.0))
        session_work_hours = self._compute_work_hours(record["check_in"], now, total_break_minutes)
        work_hours = round(pre_recovery_hours + session_work_hours, 2)

        emp = await self._get_employee(employee_id, company_id)
        today_str_checkout = record.get("date")
        if isinstance(today_str_checkout, datetime):
            today_str_checkout = today_str_checkout.strftime("%Y-%m-%d")
        elif isinstance(today_str_checkout, date):
            today_str_checkout = today_str_checkout.isoformat()
        # Get shift for this record's date
        shift = await self._get_active_shift(
            employee_id, company_id,
            today_str_checkout or date.today().isoformat(),
            settings, emp,
        )
        shift_end_str = shift["end"]
        eh, em = map(int, shift_end_str.split(":"))
        shift_end_dt = now.replace(hour=eh, minute=em, second=0, microsecond=0)
        # Night shift: if shift ends next day, adjust
        if shift.get("is_overnight") and shift_end_dt < now.replace(hour=12, minute=0, second=0, microsecond=0):
            shift_end_dt += timedelta(days=1)
        overtime = max(0.0, round((now - shift_end_dt).total_seconds() / 3600, 2)) if now > shift_end_dt else 0.0
        is_half_day = work_hours < settings["half_day_hours"]

        geo = None
        if latitude is not None or longitude is not None:
            geo = {"latitude": latitude, "longitude": longitude, "city": geo_city, "country": geo_country}

        upd = {
            "check_out": now,
            "work_hours": work_hours,
            "total_break_minutes": total_break_minutes,
            "breaks": breaks,
            "overtime_hours": overtime,
            "is_half_day": is_half_day,
            "check_out_geo": geo,
            "auto_punched_out": auto,
            "updated_at": now,
        }
        # Update status on checkout:
        # half_day overrides present/late but not on_leave, wfh, hybrid, field_work
        _PRESERVE_STATUS = {
            AttendanceStatus.ON_LEAVE,
            AttendanceStatus.WORK_FROM_HOME,
            AttendanceStatus.HYBRID,
            AttendanceStatus.FIELD_WORK,
            AttendanceStatus.HOLIDAY,
        }
        current_status = record.get("status")
        if is_half_day and current_status not in _PRESERVE_STATUS:
            upd["status"] = AttendanceStatus.HALF_DAY

        await self.col.update_one({"_id": record["_id"]}, {"$set": upd})
        record = dict(record)
        record.update(upd)

        # Phase 4: Auto comp off credit on holiday/weekend work
        # Only credit if the employee actually worked (not auto-closed due to absence)
        if not auto and work_hours > 0 and today_str_checkout:
            if record.get("is_holiday_worked"):
                try:
                    holiday_label = record.get("holiday_name") or "Holiday"
                    await self._auto_create_comp_off(
                        employee_id, company_id, today_str_checkout,
                        reason=f"Worked on {holiday_label}", credits=1.0,
                    )
                except Exception:
                    pass
            elif record.get("is_weekend_worked"):
                try:
                    await self._auto_create_comp_off(
                        employee_id, company_id, today_str_checkout,
                        reason="Worked on weekend", credits=1.0,
                    )
                except Exception:
                    pass

        # Fire punch-out notification (non-blocking)
        if not auto:
            crm_user_id = emp.get("crm_user_id") if emp else None
            if crm_user_id:
                try:
                    from app.services.notification_service import NotificationService
                    await NotificationService(self.db).notify_punch_out(
                        company_id=company_id,
                        user_id=crm_user_id,
                        work_hours=work_hours,
                    )
                except Exception:
                    pass

        return self._serialize(record)

    # ── Break Tracking ────────────────────────────────────────────────────────

    async def start_break(self, employee_id: str, company_id: str, reason: str = "") -> dict:
        today = _today_dt()
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        record = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if not record or not record.get("check_in") or record.get("check_out"):
            return {}
        breaks = list(record.get("breaks", []))
        if breaks and not breaks[-1].get("end"):
            return self._serialize(dict(record))  # already on break
        breaks.append({"start": now, "end": None, "duration_minutes": None, "reason": reason})
        await self.col.update_one({"_id": record["_id"]},
            {"$set": {"breaks": breaks, "updated_at": now}})
        record = dict(record)
        record["breaks"] = breaks
        return self._serialize(record)

    async def end_break(self, employee_id: str, company_id: str) -> dict:
        today = _today_dt()
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        record = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if not record:
            return {}
        breaks = list(record.get("breaks", []))
        total_break_minutes = float(record.get("total_break_minutes", 0.0))
        if not breaks or breaks[-1].get("end"):
            return self._serialize(dict(record))  # not on break
        br_start = breaks[-1]["start"]
        dur = round((now - br_start).total_seconds() / 60, 1)
        breaks[-1]["end"] = now
        breaks[-1]["duration_minutes"] = dur
        total_break_minutes += dur
        await self.col.update_one({"_id": record["_id"]},
            {"$set": {"breaks": breaks, "total_break_minutes": total_break_minutes, "updated_at": now}})
        record = dict(record)
        record["breaks"] = breaks
        record["total_break_minutes"] = total_break_minutes
        return self._serialize(record)

    # ── Attendance Recovery ───────────────────────────────────────────────────

    async def recover_attendance(
        self,
        attendance_id: str,
        company_id: str,
        recovered_by: str,
        recovered_by_name: str,
        recovery_reason: str,
    ) -> dict:
        """Reopen a closed attendance record so the employee can continue working.

        Mechanism:
        - The recovery gap (accidental punch-out → recovery time) is injected as a
          BreakRecord with reason="recovery_gap" so the existing checkout formula
          naturally deducts it from gross hours.
        - pre_recovery_work_hours accumulates work done BEFORE each recovery so
          the final checkout total is preserved across multiple recovery cycles.
        """
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        record = await self.col.find_one({"_id": attendance_id, "company_id": company_id})
        if not record:
            return {}

        check_in = record.get("check_in")
        check_out = record.get("check_out")

        if not check_in:
            raise ValueError("Cannot recover: attendance record has no check-in")
        if not check_out:
            raise ValueError("Cannot recover: attendance is still open (not punched out)")

        # Recovery gap: from accidental punch-out to now (recovery time)
        gap_start = check_out
        gap_end = now
        gap_minutes = round((gap_end - gap_start).total_seconds() / 60, 1)

        # The pre_recovery_work_hours must account for time already worked
        # (it accumulates across multiple recovery cycles)
        prior_pre_recovery = float(record.get("pre_recovery_work_hours", 0.0))
        current_work_hours = float(record.get("work_hours", 0.0))
        new_pre_recovery = prior_pre_recovery + current_work_hours

        # Inject the gap as a recovery BreakRecord so checkout subtracts it
        breaks = list(record.get("breaks", []))
        breaks.append({
            "start": gap_start,
            "end": gap_end,
            "duration_minutes": gap_minutes,
            "reason": "recovery_gap",
        })

        # Update total_break_minutes to include the gap
        total_break_minutes = float(record.get("total_break_minutes", 0.0)) + gap_minutes

        # Append to audit trail
        recovery_sessions = list(record.get("recovery_sessions", []))
        recovery_sessions.append({
            "recovered_at": now,
            "recovered_by": recovered_by,
            "recovered_by_name": recovered_by_name,
            "recovery_reason": recovery_reason,
            "original_check_out": check_out,
            "gap_start": gap_start,
            "gap_end": gap_end,
        })

        upd = {
            "check_out": None,          # reopen the session
            "work_hours": 0.0,          # will be recalculated on final checkout
            "is_recovered": True,
            "pre_recovery_work_hours": new_pre_recovery,
            "recovery_sessions": recovery_sessions,
            "breaks": breaks,
            "total_break_minutes": total_break_minutes,
            "auto_punched_out": False,
            "is_half_day": False,       # reset; will be recalculated on checkout
            "updated_at": now,
        }
        await self.col.update_one({"_id": record["_id"]}, {"$set": upd})
        record = dict(record)
        record.update(upd)
        return self._serialize(record)

    # ── Auto punch-out (called by scheduler / midnight loop) ─────────────────

    async def auto_checkout_all(self, company_id: str, source: str = "scheduler") -> int:
        """Close all open attendance records from PREVIOUS days.

        This is intentionally NOT limited to today.  The midnight loop runs at
        00:00 UTC which is already 'tomorrow' from the perspective of the open
        records (which were created on 'yesterday').  Filtering by yesterday
        (and any older un-closed records) is correct; filtering by today would
        miss every open record. This same query also makes the function safe
        to call repeatedly as a recovery check (e.g. on startup/login/dashboard
        load) — it only ever touches records that are still open from a past
        day, never today's record or one that already has a check_out.

        check_out time uses the standard priority: employee shift end time →
        company attendance-rule office end time → hardcoded default ("18:00"
        via settings fallback). Falls back to 23:59 of the record's date if
        the resolved time would be before check_in (e.g. overnight shifts).

        `source` is recorded on the closed record (auto_punch_out_source) purely
        for traceability of which trigger closed it ("scheduler" = normal hourly
        midnight loop, anything else = a recovery sweep).

        Status is set to AUTO_CLOSED to distinguish from normal check-outs.
        """
        today = _today_dt()
        now_utc = datetime.now(timezone.utc).replace(tzinfo=None)
        settings = await self._get_settings()

        cursor = self.col.find({
            "company_id": company_id,
            "date": {"$lt": today},      # Only PREVIOUS days — not the current day
            "check_in": {"$ne": None},
            "check_out": None,
        })

        count = 0
        async for rec in cursor:
            rec_date = rec["date"]
            emp = await self._get_employee(rec["employee_id"], company_id)
            rec_date_str = rec_date.strftime("%Y-%m-%d") if isinstance(rec_date, (datetime, date)) else str(rec_date)[:10]
            shift = await self._get_active_shift(rec["employee_id"], company_id, rec_date_str, settings, emp)
            shift_end_str = shift.get("end") or settings["office_end"]
            try:
                eh, em = map(int, shift_end_str.split(":"))
            except (ValueError, AttributeError):
                try:
                    eh, em = map(int, settings["office_end"].split(":"))
                except (ValueError, AttributeError):
                    eh, em = 18, 0  # absolute last resort

            if isinstance(rec_date, datetime):
                checkout_time = rec_date.replace(hour=eh, minute=em, second=0, microsecond=0)
            else:
                checkout_time = datetime(rec_date.year, rec_date.month, rec_date.day, eh, em, 0)

            # Shift end time must be after check_in (handles overnight/late edge
            # cases) — otherwise fall back to end-of-day for that calendar date.
            if checkout_time <= rec["check_in"]:
                if isinstance(rec_date, datetime):
                    checkout_time = rec_date.replace(hour=23, minute=59, second=0, microsecond=0)
                else:
                    checkout_time = datetime(rec_date.year, rec_date.month, rec_date.day, 23, 59, 0)

            # Close any open break
            breaks = list(rec.get("breaks", []))
            total_break_minutes = float(rec.get("total_break_minutes", 0.0))
            if breaks and not breaks[-1].get("end"):
                br_start = breaks[-1]["start"]
                if isinstance(br_start, datetime):
                    break_dur = max(0.0, (checkout_time - br_start).total_seconds() / 60)
                else:
                    break_dur = 0.0
                breaks[-1]["end"] = checkout_time
                breaks[-1]["duration_minutes"] = round(break_dur, 1)
                total_break_minutes += break_dur

            work_hours = self._compute_work_hours(rec["check_in"], checkout_time, total_break_minutes)
            is_half_day = work_hours < settings["half_day_hours"]

            await self.col.update_one(
                {"_id": rec["_id"]},
                {"$set": {
                    "check_out": checkout_time,
                    "work_hours": work_hours,
                    "total_break_minutes": total_break_minutes,
                    "breaks": breaks,
                    "is_half_day": is_half_day,
                    "auto_punched_out": True,
                    "auto_punch_out_source": source,
                    "status": AttendanceStatus.AUTO_CLOSED,
                    "updated_at": now_utc,
                }},
            )
            count += 1

        return count

    # ── Today's status (used by /me/today to decide popup visibility) ─────────

    async def get_today_context(self, employee_id: str, company_id: str) -> dict:
        """Return context needed to decide whether to show the punch-in popup.

        Checks (in priority order):
          1. Is today a company holiday?
          2. Is today a weekend?
          3. Does the employee have approved leave covering today?
          4. Does the employee already have an attendance record today?
          5. Is there an active work mode approval for today?
          6. Is geo-fence enabled? (include settings for frontend location check)
        """
        today_date = date.today()
        today_str = today_date.isoformat()
        today_dt = _today_dt()
        now = datetime.now(timezone.utc).replace(tzinfo=None)

        emp = await self._get_employee(employee_id, company_id)
        dept = emp.get("department") if emp else None
        settings = await self._get_settings()
        working_days = self._get_effective_working_days(settings, emp)
        is_weekend = today_date.weekday() not in working_days
        holiday_name = await self._check_today_holiday(company_id, dept)

        attendance = await self.col.find_one({
            "employee_id": employee_id,
            "company_id": company_id,
            "date": today_dt,
        })

        # Only check leave if no active check-in (employee may have come to work
        # despite a leave approval — their check-in takes priority)
        leave = None
        if not (attendance and attendance.get("check_in")):
            leave_doc = await self.db["hrm_leaves"].find_one({
                "company_id": company_id,
                "employee_id": employee_id,
                "status": "approved",
                "from_date": {"$lte": today_str},
                "to_date": {"$gte": today_str},
            })
            if leave_doc:
                leave = {
                    "id": str(leave_doc.get("_id", "")),
                    "leave_type": leave_doc.get("leave_type", ""),
                    "from_date": leave_doc.get("from_date", ""),
                    "to_date": leave_doc.get("to_date", ""),
                    "status": leave_doc.get("status", ""),
                    "duration": leave_doc.get("duration", "full_day"),
                }

        # Active work mode request for today
        active_wmr_doc = await self._get_active_work_mode_request(employee_id, company_id, today_str)
        active_work_mode = None
        if active_wmr_doc:
            active_work_mode = {
                "id": str(active_wmr_doc.get("_id", "")),
                "work_mode": active_wmr_doc.get("work_mode"),
                "from_date": active_wmr_doc.get("from_date"),
                "to_date": active_wmr_doc.get("to_date"),
                "status": active_wmr_doc.get("status"),
            }

        # Active exception
        active_exc = await self._get_active_exception(employee_id, company_id, now)
        active_exception = None
        if active_exc:
            active_exception = {
                "id": str(active_exc.get("_id", "")),
                "bypass_geo_fence": active_exc.get("bypass_geo_fence", False),
                "bypass_ip_restriction": active_exc.get("bypass_ip_restriction", False),
                "to_datetime": active_exc.get("to_datetime").strftime("%Y-%m-%dT%H:%M:%S") + "Z"
                    if isinstance(active_exc.get("to_datetime"), datetime) else None,
            }

        # Phase 6: Active shift for today (start/end/grace for punch window)
        shift = await self._get_active_shift(employee_id, company_id, today_str, settings, emp)

        return {
            "is_weekend": is_weekend,
            "is_holiday": bool(holiday_name),
            "holiday_name": holiday_name or None,
            "is_on_leave": bool(leave),
            "leave": leave,
            "active_work_mode": active_work_mode,
            "active_exception": active_exception,
            "geo_fence_enabled": settings["geo_fence_enabled"],
            "geo_fence_radius": settings["geo_fence_radius"],
            "office_lat": settings["geo_fence_lat"],
            "office_lon": settings["geo_fence_lon"],
            "ip_restriction_enabled": settings["ip_restriction"],
            "working_days": working_days,
            # Phase 6: shift window info for frontend punch-in gate
            "shift_start":      shift["start"],
            "shift_end":        shift["end"],
            "shift_grace":      shift["grace"],
            "shift_is_overnight": shift.get("is_overnight", False),
            "shift_id":         shift.get("shift_id"),
            "shift_name":       shift.get("shift_name", ""),
        }

    # ── Leave-attendance backfill ─────────────────────────────────────────────

    async def _backfill_leave_attendance(
        self,
        employee_id: str,
        company_id: str,
        start_date: datetime,
        end_date: datetime,
    ) -> None:
        """Create on_leave attendance placeholders for approved leave days that have no record.

        Idempotent — safe to call on every attendance read.  Only inserts records
        for working days (Mon-Fri) within each approved leave that fall inside
        [start_date, end_date] and have no existing hrm_attendance document.

        This covers two gaps:
          1. Leaves approved before create_attendance_for_leave was deployed.
          2. Any silent exception in the approval-time creation path.
        """
        start_str = start_date.strftime("%Y-%m-%d")
        end_str = end_date.strftime("%Y-%m-%d")

        cursor = self.db["hrm_leaves"].find({
            "company_id": company_id,
            "employee_id": employee_id,
            "status": "approved",
            "from_date": {"$lte": end_str},
            "to_date":   {"$gte": start_str},
        })

        now = datetime.now(timezone.utc).replace(tzinfo=None)

        async for leave in cursor:
            from_str = leave.get("from_date", "")
            to_str   = leave.get("to_date",   "")
            if not from_str or not to_str:
                continue
            try:
                leave_from = date.fromisoformat(from_str)
                leave_to   = date.fromisoformat(to_str)
            except (ValueError, TypeError):
                continue

            leave_id      = str(leave.get("_id") or "")
            leave_type    = leave.get("leave_type", "")
            employee_name = leave.get("employee_name", "")

            # Clamp to the requested date window
            current = max(leave_from, start_date.date())
            end_day = min(leave_to,   end_date.date())

            while current <= end_day:
                if current.weekday() >= 5:          # skip Saturday / Sunday
                    current += timedelta(days=1)
                    continue

                day_dt = datetime(current.year, current.month, current.day)

                existing = await self.col.find_one({
                    "employee_id": employee_id,
                    "company_id":  company_id,
                    "date":        day_dt,
                })

                if not existing:
                    try:
                        await self.col.insert_one({
                            "_id":                str(ObjectId()),
                            "company_id":          company_id,
                            "employee_id":         employee_id,
                            "employee_name":       employee_name,
                            "date":                day_dt,
                            "status":              AttendanceStatus.ON_LEAVE,
                            "leave_id":            leave_id,
                            "leave_type":          leave_type,
                            "check_in":            None,
                            "check_out":           None,
                            "work_mode":           "office",
                            "breaks":              [],
                            "total_break_minutes": 0.0,
                            "work_hours":          0.0,
                            "is_late":             False,
                            "late_by_minutes":     0,
                            "is_half_day":         False,
                            "overtime_hours":      0.0,
                            "auto_punched_out":    False,
                            "notes":               f"Approved {leave_type.replace('_', ' ')} leave",
                            "marked_by":           "system",
                            "created_at":          now,
                            "updated_at":          now,
                        })
                    except Exception:
                        pass  # DuplicateKey race — harmless, another writer created it first

                current += timedelta(days=1)

    # ── Read queries ──────────────────────────────────────────────────────────

    async def get_today(self, employee_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"employee_id": employee_id, "date": _today_dt(), "company_id": company_id})
        return self._serialize(dict(doc)) if doc else None

    async def get_monthly(self, employee_id: str, company_id: str, year: int, month: int) -> List[dict]:
        start = datetime(year, month, 1)
        end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        cursor = self.col.find({
            "employee_id": employee_id,
            "company_id": company_id,
            "date": {"$gte": start, "$lt": end},
        }).sort("date", 1)
        return [self._serialize(dict(d)) async for d in cursor]

    async def get_team_today(self, company_id: str) -> List[dict]:
        cursor = self.col.find({"company_id": company_id, "date": _today_dt()})
        return [self._serialize(dict(d)) async for d in cursor]

    async def manual_update(self, company_id: str, update_data: dict) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        emp_id = update_data["employee_id"]
        raw_d = update_data["date"]
        # Normalize to naive midnight datetime so PyMongo 4.x can encode it
        if isinstance(raw_d, datetime):
            d = raw_d.replace(hour=0, minute=0, second=0, microsecond=0, tzinfo=None)
        elif isinstance(raw_d, date):
            d = datetime(raw_d.year, raw_d.month, raw_d.day)
        else:
            d = raw_d
        update_data["date"] = d
        update_data["updated_at"] = now
        update_data["company_id"] = company_id
        existing = await self.col.find_one({"employee_id": emp_id, "date": d, "company_id": company_id})
        if existing:
            await self.col.update_one({"_id": existing["_id"]}, {"$set": update_data})
            existing = dict(existing)
            existing.update(update_data)
            return self._serialize(existing)
        update_data["_id"] = str(ObjectId())
        update_data["created_at"] = now
        await self.col.insert_one(update_data)
        return self._serialize(update_data)

    # ── Counters ──────────────────────────────────────────────────────────────

    async def count_present_today(self, company_id: str) -> int:
        """Count employees who punched in today — regardless of punch-out status."""
        return await self.col.count_documents({
            "company_id": company_id,
            "date": _today_dt(),
            "check_in": {"$ne": None},
        })

    async def count_currently_working(self, company_id: str) -> int:
        """Count employees clocked in but not yet clocked out."""
        return await self.col.count_documents({
            "company_id": company_id,
            "date": _today_dt(),
            "check_in": {"$ne": None},
            "check_out": None,
        })

    async def count_on_break(self, company_id: str) -> int:
        """Count employees currently on a break (break started, not ended)."""
        today = _today_dt()
        pipeline = [
            {"$match": {
                "company_id": company_id,
                "date": today,
                "check_in": {"$ne": None},
                "check_out": None,
            }},
            {"$project": {"last_break": {"$arrayElemAt": ["$breaks", -1]}}},
            {"$match": {
                "last_break": {"$ne": None},
                "last_break.end": None,
            }},
            {"$count": "total"},
        ]
        result = await self.col.aggregate(pipeline).to_list(1)
        return result[0]["total"] if result else 0

    async def count_late_today(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "date": _today_dt(),
            "is_late": True,
        })

    async def count_half_day_today(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "date": _today_dt(),
            "is_half_day": True,
        })

    async def count_wfh_today(self, company_id: str) -> int:
        return await self.col.count_documents({
            "company_id": company_id,
            "date": _today_dt(),
            "work_mode": "wfh",
            "check_in": {"$ne": None},
        })

    # ── Historical range queries ──────────────────────────────────────────────

    async def get_history(
        self,
        company_id: str,
        start_date: datetime,
        end_date: datetime,
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
        work_mode: Optional[str] = None,
        search: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        """Paginated attendance records across a date range for HR/team view.

        When a specific employee_id is provided, runs a lazy backfill so
        approved leave days appear as on_leave entries in the HR view.
        """
        if employee_id:
            try:
                await self._backfill_leave_attendance(employee_id, company_id, start_date, end_date)
            except Exception:
                pass

        end_inclusive = end_date + timedelta(days=1)
        query: dict = {
            "company_id": company_id,
            "date": {"$gte": start_date, "$lt": end_inclusive},
        }
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        if work_mode:
            query["work_mode"] = work_mode
        if search:
            import re as _re
            query["employee_name"] = {"$regex": _re.escape(search), "$options": "i"}

        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = (
            self.col.find(query)
            .sort([("date", -1), ("employee_name", 1)])
            .skip(skip)
            .limit(page_size)
        )
        items = [self._serialize(dict(d)) async for d in cursor]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
        }

    async def get_my_history(
        self,
        employee_id: str,
        company_id: str,
        start_date: datetime,
        end_date: datetime,
        page: int = 1,
        page_size: int = 62,
    ) -> dict:
        """Paginated attendance records for a single employee across a date range.

        Runs a lazy backfill first so approved leave days always appear as
        on_leave attendance entries even if they were approved before the
        approval-time creation was deployed.
        """
        try:
            await self._backfill_leave_attendance(employee_id, company_id, start_date, end_date)
        except Exception:
            pass  # never block a read because the backfill failed

        end_inclusive = end_date + timedelta(days=1)
        query = {
            "employee_id": employee_id,
            "company_id": company_id,
            "date": {"$gte": start_date, "$lt": end_inclusive},
        }
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("date", -1).skip(skip).limit(page_size)
        items = [self._serialize(dict(d)) async for d in cursor]
        return {
            "items": items,
            "total": total,
            "page": page,
            "page_size": page_size,
            "pages": max(1, (total + page_size - 1) // page_size),
        }

    async def export_data(
        self,
        company_id: str,
        start_date: datetime,
        end_date: datetime,
        employee_id: Optional[str] = None,
        status: Optional[str] = None,
    ) -> List[dict]:
        """Return all rows in a date range (no pagination) for CSV export.

        Backfills leave attendance for a specific employee so the CSV
        always includes on_leave rows for approved leaves.
        """
        if employee_id:
            try:
                await self._backfill_leave_attendance(employee_id, company_id, start_date, end_date)
            except Exception:
                pass

        end_inclusive = end_date + timedelta(days=1)
        query: dict = {
            "company_id": company_id,
            "date": {"$gte": start_date, "$lt": end_inclusive},
        }
        if employee_id:
            query["employee_id"] = employee_id
        if status:
            query["status"] = status
        cursor = self.col.find(query).sort([("date", 1), ("employee_name", 1)])
        return [self._serialize(dict(d)) async for d in cursor]

    async def get_range_stats(self, company_id: str, start_date: datetime, end_date: datetime) -> dict:
        """Aggregated attendance counters + daily trend for a date range."""
        end_inclusive = end_date + timedelta(days=1)
        match: dict = {"company_id": company_id, "date": {"$gte": start_date, "$lt": end_inclusive}}

        # Statuses that mean the employee attended work (present in any form)
        _ATTENDED = ["present", "late", "half_day", "wfh", "hybrid", "field_work"]

        pipeline_totals = [
            {"$match": match},
            {"$group": {
                "_id": None,
                "total_records":         {"$sum": 1},
                "attended":              {"$sum": {"$cond": [{"$in": ["$status", _ATTENDED]}, 1, 0]}},
                "present":               {"$sum": {"$cond": [{"$eq": ["$status", "present"]},     1, 0]}},
                "late":                  {"$sum": {"$cond": [{"$eq": ["$status", "late"]},        1, 0]}},
                "absent":                {"$sum": {"$cond": [{"$eq": ["$status", "absent"]},      1, 0]}},
                "half_day":              {"$sum": {"$cond": [{"$eq": ["$status", "half_day"]},    1, 0]}},
                "on_leave":              {"$sum": {"$cond": [{"$eq": ["$status", "on_leave"]},    1, 0]}},
                "wfh":                   {"$sum": {"$cond": [{"$eq": ["$status", "wfh"]},         1, 0]}},
                "hybrid":                {"$sum": {"$cond": [{"$eq": ["$status", "hybrid"]},      1, 0]}},
                "field_work":            {"$sum": {"$cond": [{"$eq": ["$status", "field_work"]},  1, 0]}},
                "holiday":               {"$sum": {"$cond": [{"$eq": ["$status", "holiday"]},     1, 0]}},
                "weekend":               {"$sum": {"$cond": [{"$eq": ["$status", "weekend"]},     1, 0]}},
                "auto_closed":           {"$sum": {"$cond": [{"$eq": ["$status", "auto_closed"]}, 1, 0]}},
                "total_work_hours":      {"$sum": {"$ifNull": ["$work_hours",      0]}},
                "total_overtime_hours":  {"$sum": {"$ifNull": ["$overtime_hours",  0]}},
            }},
        ]

        pipeline_trend = [
            {"$match": match},
            {"$group": {
                "_id": "$date",
                "present": {"$sum": {"$cond": [{"$in": ["$status", _ATTENDED]},   1, 0]}},
                "absent":  {"$sum": {"$cond": [{"$eq":  ["$status", "absent"]},   1, 0]}},
                "late":    {"$sum": {"$cond": [{"$eq":  ["$status", "late"]},     1, 0]}},
            }},
            {"$sort": {"_id": 1}},
        ]

        totals_res, trend_res = await asyncio.gather(
            self.col.aggregate(pipeline_totals).to_list(1),
            self.col.aggregate(pipeline_trend).to_list(400),
        )

        totals = {k: v for k, v in (totals_res[0] if totals_res else {}).items() if k != "_id"}

        trend = []
        for t in trend_res:
            d_val = t["_id"]
            date_str = d_val.strftime("%Y-%m-%d") if isinstance(d_val, datetime) else str(d_val)[:10]
            trend.append({"date": date_str, "present": t["present"], "absent": t["absent"], "late": t["late"]})

        return {**totals, "trend": trend}

    async def get_today_stats(self, company_id: str) -> dict:
        """All today's attendance counters in parallel for efficiency."""
        today = _today_dt()

        present, currently_working, late, half_day, wfh, on_break = await asyncio.gather(
            self.col.count_documents({
                "company_id": company_id, "date": today, "check_in": {"$ne": None},
            }),
            self.col.count_documents({
                "company_id": company_id, "date": today,
                "check_in": {"$ne": None}, "check_out": None,
            }),
            self.col.count_documents({
                "company_id": company_id, "date": today, "is_late": True,
            }),
            self.col.count_documents({
                "company_id": company_id, "date": today, "is_half_day": True,
            }),
            self.col.count_documents({
                "company_id": company_id, "date": today,
                "work_mode": "wfh", "check_in": {"$ne": None},
            }),
            self.count_on_break(company_id),
        )
        return {
            "present":           present,
            "currently_working": currently_working,
            "on_break":          on_break,
            "late":              late,
            "half_day":          half_day,
            "wfh":               wfh,
        }


# ── Recovery auto punch-out (Layer 2) ──────────────────────────────────────────
# Catches attendance records left open because the midnight loop never got to
# run for that company (server was down/restarting/offline over its shift-end
# window). Safe to call from many trigger points — app startup, login,
# attendance dashboard load, daily cron — because auto_checkout_all() only
# ever touches records strictly before today that are still missing a
# check_out, so it can never affect today's open record or a closed one.
_RECOVERY_THROTTLE_SECONDS = 300  # avoid re-querying the same tenant on every page hit
_last_recovery_run: dict[str, float] = {}


async def recover_missed_punch_outs(db, company_id: str, source: str = "recovery") -> int:
    """Throttled wrapper around AttendanceService.auto_checkout_all for recovery triggers.

    Never raises — callers (login, dashboard load, startup) must not fail because
    of this best-effort sweep.
    """
    import time
    import logging
    logger = logging.getLogger(__name__)

    last_run = _last_recovery_run.get(company_id, 0.0)
    now = time.monotonic()
    if now - last_run < _RECOVERY_THROTTLE_SECONDS:
        return 0
    _last_recovery_run[company_id] = now

    try:
        count = await AttendanceService(db).auto_checkout_all(company_id, source=source)
        if count:
            logger.info(
                "Recovery auto punch-out (%s): closed %d orphan record(s) for company %s",
                source, count, company_id,
            )
        return count
    except Exception as exc:
        logger.warning("recover_missed_punch_outs failed for company %s (source=%s): %s", company_id, source, exc)
        return 0
