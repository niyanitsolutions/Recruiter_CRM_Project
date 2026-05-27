"""HRM — Attendance Service"""
import asyncio
import ipaddress
from datetime import datetime, date, timezone, timedelta
from typing import Optional, List
from bson import ObjectId

from app.models.company.attendance import AttendanceStatus, WorkMode


# Fallback defaults — used when company_settings has no attendance config.
_DEFAULT_GRACE_MINUTES      = 15
_DEFAULT_HALF_DAY_HOURS     = 4.5
_DEFAULT_FULL_DAY_HOURS     = 8.0
_DEFAULT_OFFICE_START       = "09:00"
_DEFAULT_OFFICE_END         = "18:00"
_DEFAULT_MAX_BREAK_MINUTES  = 90
_DEFAULT_MAX_BREAKS         = 5

# Keep old name as alias so any external callers aren't broken
HALF_DAY_THRESHOLD_HOURS = _DEFAULT_HALF_DAY_HOURS
OVERTIME_THRESHOLD_HOURS = 9.0
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
        }

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
    ) -> dict:
        today = _today_dt()  # naive datetime at midnight — PyMongo 4.x requires datetime, not date
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        existing = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if existing and existing.get("check_in"):
            return self._serialize(existing)

        settings = await self._get_settings()

        # ── IP restriction: only enforced for office mode ────────────────────
        if work_mode == "office" and settings["ip_restriction"] and settings["approved_ips"]:
            if not self._is_ip_allowed(client_ip or "", settings["approved_ips"]):
                raise ValueError(
                    f"Check-in blocked: your IP ({client_ip}) is not in the list of approved office IPs."
                )

        emp = await self._get_employee(employee_id, company_id)
        # Employee's personal shift overrides company default
        shift_start = (emp.get("shift_start_time") or settings["office_start"]) if emp else settings["office_start"]
        grace = settings["grace_minutes"]
        sh, sm = map(int, shift_start.split(":"))
        shift_dt = now.replace(hour=sh, minute=sm, second=0, microsecond=0)
        late_threshold = shift_dt + timedelta(minutes=grace)
        is_late = now > late_threshold
        late_by = max(0, int((now - late_threshold).total_seconds() / 60)) if is_late else 0

        # ── Status determination ─────────────────────────────────────────────
        # WFH takes priority over late; a WFH employee who clocks in late can
        # be seen in the WFH bucket and the is_late flag still records the fact.
        if work_mode == "wfh":
            initial_status = AttendanceStatus.WORK_FROM_HOME
        elif is_late:
            initial_status = AttendanceStatus.LATE
        else:
            initial_status = AttendanceStatus.PRESENT

        geo = None
        if latitude is not None or longitude is not None:
            geo = {"latitude": latitude, "longitude": longitude, "city": geo_city, "country": geo_country}

        doc_id = str(existing["_id"]) if existing else str(ObjectId())
        update = {
            "_id": doc_id,
            "company_id": company_id,
            "employee_id": employee_id,
            "employee_name": emp.get("full_name", "") if emp else "",
            "date": today,
            "check_in": now,
            "status": initial_status,
            "is_late": is_late,
            "late_by_minutes": late_by,
            "work_mode": work_mode,
            "check_in_ip": client_ip,
            "check_in_geo": geo,
            "breaks": [],
            "total_break_minutes": 0.0,
            "work_hours": 0.0,
            "is_half_day": False,
            "overtime_hours": 0.0,
            "auto_punched_out": False,
            "notes": notes,
            "marked_by": marked_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.col.replace_one({"_id": doc_id}, update, upsert=True)

        # Fire punch-in notification (non-blocking)
        crm_user_id = emp.get("crm_user_id") if emp else None
        if crm_user_id:
            try:
                from app.services.notification_service import NotificationService
                check_in_str = now.strftime("%I:%M %p")
                await NotificationService(self.db).notify_punch_in(
                    company_id=company_id,
                    user_id=crm_user_id,
                    check_in_time=check_in_str,
                    work_mode=work_mode,
                )
            except Exception:
                pass

        return self._serialize(update)

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
        record = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if not record or record.get("check_out"):
            return self._serialize(record) if record else {}

        settings = await self._get_settings()

        # Close any open break
        breaks = record.get("breaks", [])
        total_break_minutes = record.get("total_break_minutes", 0.0)
        if breaks and not breaks[-1].get("end"):
            br_start = breaks[-1]["start"]
            dur = (now - br_start).total_seconds() / 60
            breaks[-1]["end"] = now
            breaks[-1]["duration_minutes"] = round(dur, 1)
            total_break_minutes += dur

        work_hours = self._compute_work_hours(record["check_in"], now, total_break_minutes)
        emp = await self._get_employee(employee_id, company_id)
        shift_end_str = (emp.get("shift_end_time") or settings["office_end"]) if emp else settings["office_end"]
        eh, em = map(int, shift_end_str.split(":"))
        shift_end_dt = now.replace(hour=eh, minute=em, second=0, microsecond=0)
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
        # Update status on checkout: half_day overrides present/late (but not on_leave/wfh)
        if is_half_day and record.get("status") not in [AttendanceStatus.ON_LEAVE, AttendanceStatus.WORK_FROM_HOME]:
            upd["status"] = AttendanceStatus.HALF_DAY

        await self.col.update_one({"_id": record["_id"]}, {"$set": upd})
        record.update(upd)

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
        breaks = record.get("breaks", [])
        if breaks and not breaks[-1].get("end"):
            return self._serialize(record)  # already on break
        breaks.append({"start": now, "end": None, "duration_minutes": None, "reason": reason})
        await self.col.update_one({"_id": record["_id"]},
            {"$set": {"breaks": breaks, "updated_at": now}})
        record["breaks"] = breaks
        return self._serialize(record)

    async def end_break(self, employee_id: str, company_id: str) -> dict:
        today = _today_dt()
        now = datetime.now(timezone.utc).replace(tzinfo=None)  # naive UTC — Motor returns naive datetimes
        record = await self.col.find_one({"employee_id": employee_id, "date": today, "company_id": company_id})
        if not record:
            return {}
        breaks = record.get("breaks", [])
        total_break_minutes = record.get("total_break_minutes", 0.0)
        if not breaks or breaks[-1].get("end"):
            return self._serialize(record)  # not on break
        br_start = breaks[-1]["start"]
        dur = round((now - br_start).total_seconds() / 60, 1)
        breaks[-1]["end"] = now
        breaks[-1]["duration_minutes"] = dur
        total_break_minutes += dur
        await self.col.update_one({"_id": record["_id"]},
            {"$set": {"breaks": breaks, "total_break_minutes": total_break_minutes, "updated_at": now}})
        record["breaks"] = breaks
        record["total_break_minutes"] = total_break_minutes
        return self._serialize(record)

    # ── Auto punch-out at midnight (called by scheduler) ─────────────────────

    async def auto_checkout_all(self, company_id: str) -> int:
        """Punch out all employees who are still checked in at midnight."""
        today = _today_dt()
        cursor = self.col.find({
            "company_id": company_id,
            "date": today,
            "check_in": {"$ne": None},
            "check_out": None,
        })
        count = 0
        async for rec in cursor:
            await self.check_out(
                employee_id=rec["employee_id"],
                company_id=company_id,
                marked_by="system",
                auto=True,
            )
            count += 1
        return count

    # ── Read queries ──────────────────────────────────────────────────────────

    async def get_today(self, employee_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"employee_id": employee_id, "date": _today_dt(), "company_id": company_id})
        return self._serialize(doc) if doc else None

    async def get_monthly(self, employee_id: str, company_id: str, year: int, month: int) -> List[dict]:
        start = datetime(year, month, 1)
        end = datetime(year + 1, 1, 1) if month == 12 else datetime(year, month + 1, 1)
        cursor = self.col.find({
            "employee_id": employee_id,
            "company_id": company_id,
            "date": {"$gte": start, "$lt": end},
        }).sort("date", 1)
        return [self._serialize(d) async for d in cursor]

    async def get_team_today(self, company_id: str) -> List[dict]:
        cursor = self.col.find({"company_id": company_id, "date": _today_dt()})
        return [self._serialize(d) async for d in cursor]

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
            existing.update(update_data)
            return self._serialize(existing)
        update_data["_id"] = str(ObjectId())
        update_data["created_at"] = now
        await self.col.insert_one(update_data)
        return self._serialize(update_data)

    # ── Counters ──────────────────────────────────────────────────────────────

    async def count_present_today(self, company_id: str) -> int:
        """Count employees who punched in today — regardless of punch-out status.

        'Present' means the employee showed up (has a check_in record), not that
        they are currently clocked in.  Previously used status-based counting
        which dropped to 0 once employees punched out during testing sessions
        (work_hours < half_day_threshold → status = 'half_day').
        """
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
