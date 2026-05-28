"""HRM — Holiday Service"""
import csv
import io
from datetime import datetime, date, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.hrm_holiday import HolidayType


class HolidayService:
    COL = "hrm_holidays"
    AUDIT_COL = "hrm_audit_logs"

    def __init__(self, db):
        self.db = db
        self.col = db[self.COL]

    @staticmethod
    def _serialize(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        for f in ("created_at", "updated_at"):
            val = doc.get(f)
            if isinstance(val, datetime):
                doc[f] = val.strftime("%Y-%m-%dT%H:%M:%S") + "Z"
        return doc

    async def _audit(self, action: str, entity_id: str, user_id: str,
                     company_id: str, changes: Optional[dict] = None, ip: Optional[str] = None):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        await self.db[self.AUDIT_COL].insert_one({
            "_id": str(ObjectId()),
            "company_id": company_id,
            "module": "holidays",
            "action": action,
            "entity_type": "holiday",
            "entity_id": entity_id,
            "user_id": user_id,
            "ip_address": ip,
            "changes": changes or {},
            "timestamp": now,
        })

    # ── CRUD ─────────────────────────────────────────────────────────────────

    async def create(self, data: dict, company_id: str, created_by: str,
                     ip: Optional[str] = None) -> dict:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        # Duplicate check: same company + same date
        existing = await self.col.find_one({
            "company_id": company_id,
            "date": data["date"],
            "is_deleted": False,
        })
        if existing:
            raise ValueError(f"A holiday already exists on {data['date']}")

        doc_id = str(ObjectId())
        doc = {
            "_id": doc_id,
            "company_id": company_id,
            "name": data["name"],
            "date": data["date"],
            "holiday_type": data.get("holiday_type", HolidayType.NATIONAL),
            "description": data.get("description"),
            "is_paid": data.get("is_paid", True),
            "is_recurring": data.get("is_recurring", False),
            "applicable_departments": data.get("applicable_departments", []),
            "applicable_locations": data.get("applicable_locations", []),
            "is_active": True,
            "created_by": created_by,
            "updated_by": None,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.col.insert_one(doc)
        await self._audit("holiday_created", doc_id, created_by, company_id,
                          {"name": doc["name"], "date": doc["date"]}, ip)
        return self._serialize(doc)

    async def list(
        self,
        company_id: str,
        year: Optional[int] = None,
        holiday_type: Optional[str] = None,
        department: Optional[str] = None,
        page: int = 1,
        page_size: int = 50,
    ) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if year:
            query["date"] = {"$gte": f"{year}-01-01", "$lte": f"{year}-12-31"}
        if holiday_type:
            query["holiday_type"] = holiday_type
        if department:
            query["$or"] = [
                {"applicable_departments": []},
                {"applicable_departments": department},
            ]
        total = await self.col.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.col.find(query).sort("date", 1).skip(skip).limit(page_size)
        items = [self._serialize(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get(self, holiday_id: str, company_id: str) -> Optional[dict]:
        doc = await self.col.find_one({"_id": holiday_id, "company_id": company_id, "is_deleted": False})
        return self._serialize(doc) if doc else None

    async def update(self, holiday_id: str, data: dict, company_id: str,
                     updated_by: str, ip: Optional[str] = None) -> Optional[dict]:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        existing = await self.col.find_one({"_id": holiday_id, "company_id": company_id, "is_deleted": False})
        if not existing:
            return None
        # Duplicate date check (exclude self)
        if "date" in data and data["date"] != existing["date"]:
            dup = await self.col.find_one({
                "company_id": company_id,
                "date": data["date"],
                "is_deleted": False,
                "_id": {"$ne": holiday_id},
            })
            if dup:
                raise ValueError(f"Another holiday already exists on {data['date']}")

        changes_before = {k: existing.get(k) for k in data}
        update_set = {**{k: v for k, v in data.items() if v is not None},
                      "updated_by": updated_by, "updated_at": now}
        await self.col.update_one({"_id": holiday_id}, {"$set": update_set})
        await self._audit("holiday_updated", holiday_id, updated_by, company_id,
                          {"before": changes_before, "after": data}, ip)
        existing.update(update_set)
        return self._serialize(existing)

    async def delete(self, holiday_id: str, company_id: str, deleted_by: str,
                     ip: Optional[str] = None) -> bool:
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        result = await self.col.update_one(
            {"_id": holiday_id, "company_id": company_id, "is_deleted": False},
            {"$set": {"is_deleted": True, "updated_at": now, "updated_by": deleted_by}},
        )
        if result.modified_count:
            await self._audit("holiday_deleted", holiday_id, deleted_by, company_id, ip=ip)
        return result.modified_count > 0

    # ── Utility ───────────────────────────────────────────────────────────────

    async def is_holiday(self, check_date: str, company_id: str,
                         department: Optional[str] = None) -> Optional[dict]:
        """Return holiday doc if date is a holiday for company/department, else None."""
        query: dict = {
            "company_id": company_id,
            "date": check_date,
            "is_active": True,
            "is_deleted": False,
        }
        if department:
            query["$or"] = [
                {"applicable_departments": []},
                {"applicable_departments": department},
            ]
        doc = await self.col.find_one(query)
        return self._serialize(doc) if doc else None

    async def get_holidays_in_range(self, company_id: str, from_date: str,
                                    to_date: str, department: Optional[str] = None) -> List[str]:
        """Return list of holiday date strings in range for overlap detection."""
        query: dict = {
            "company_id": company_id,
            "date": {"$gte": from_date, "$lte": to_date},
            "is_active": True,
            "is_deleted": False,
        }
        if department:
            query["$or"] = [
                {"applicable_departments": []},
                {"applicable_departments": department},
            ]
        cursor = self.col.find(query, {"date": 1})
        return [doc["date"] async for doc in cursor]

    # ── Import / Export ───────────────────────────────────────────────────────

    async def import_from_csv(self, csv_content: str, company_id: str,
                               created_by: str, ip: Optional[str] = None) -> dict:
        """
        Parse CSV with columns: name, date (YYYY-MM-DD), type, description, is_paid, is_recurring
        Returns {"created": N, "skipped": N, "errors": [...]}
        """
        reader = csv.DictReader(io.StringIO(csv_content.strip()))
        created = skipped = 0
        errors: List[str] = []
        for i, row in enumerate(reader, start=2):
            try:
                name = (row.get("name") or "").strip()
                dt = (row.get("date") or "").strip()
                if not name or not dt:
                    errors.append(f"Row {i}: name and date are required")
                    skipped += 1
                    continue
                # Validate date format
                datetime.strptime(dt, "%Y-%m-%d")
                holiday_type_raw = (row.get("type") or "national").strip().lower()
                try:
                    h_type = HolidayType(holiday_type_raw)
                except ValueError:
                    h_type = HolidayType.COMPANY
                await self.create({
                    "name": name, "date": dt, "holiday_type": h_type,
                    "description": (row.get("description") or "").strip() or None,
                    "is_paid": str(row.get("is_paid", "true")).lower() in ("1", "true", "yes"),
                    "is_recurring": str(row.get("is_recurring", "false")).lower() in ("1", "true", "yes"),
                }, company_id, created_by, ip)
                created += 1
            except ValueError as e:
                errors.append(f"Row {i}: {e}")
                skipped += 1
        return {"created": created, "skipped": skipped, "errors": errors}

    def export_to_csv(self, holidays: List[dict]) -> str:
        """Convert list of holiday dicts to CSV string."""
        output = io.StringIO()
        fields = ["name", "date", "holiday_type", "description", "is_paid", "is_recurring"]
        writer = csv.DictWriter(output, fieldnames=fields, extrasaction="ignore")
        writer.writeheader()
        for h in holidays:
            writer.writerow(h)
        return output.getvalue()

    # ── Copy to next year ─────────────────────────────────────────────────────

    async def copy_to_next_year(self, company_id: str, created_by: str,
                                 ip: Optional[str] = None) -> dict:
        """
        Duplicate all recurring (or all, if include_all=True) holidays to next year.
        Returns {"created": N, "skipped": N}
        """
        current_year = date.today().year
        next_year = current_year + 1
        cursor = self.col.find({
            "company_id": company_id,
            "is_deleted": False,
            "is_recurring": True,
        })
        created = skipped = 0
        async for h in cursor:
            old_date = h["date"]  # YYYY-MM-DD
            try:
                dt = datetime.strptime(old_date, "%Y-%m-%d")
                new_date = dt.replace(year=next_year).strftime("%Y-%m-%d")
            except ValueError:
                skipped += 1
                continue
            # Skip if already exists
            dup = await self.col.find_one({
                "company_id": company_id,
                "date": new_date,
                "is_deleted": False,
            })
            if dup:
                skipped += 1
                continue
            try:
                await self.create({
                    "name": h["name"],
                    "date": new_date,
                    "holiday_type": h.get("holiday_type", HolidayType.NATIONAL),
                    "description": h.get("description"),
                    "is_paid": h.get("is_paid", True),
                    "is_recurring": True,
                    "applicable_departments": h.get("applicable_departments", []),
                    "applicable_locations": h.get("applicable_locations", []),
                }, company_id, created_by, ip)
                created += 1
            except ValueError:
                skipped += 1
        return {"created": created, "skipped": skipped, "year": next_year}
