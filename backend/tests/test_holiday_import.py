"""Regression tests for the Holiday import fix.

Root cause covered: the importer read fixed lowercase headers (name/date/type/…)
while real files use "Holiday Name", "Date", "Type", "Paid Holiday", "Recurring
Every Year" — so every row was skipped. These tests lock in the robust header
mapping, flexible date/boolean/type parsing, duplicate detection, and detailed
error reporting, plus Excel (.xlsx) import.
"""
import asyncio
import io

import pytest

from app.models.company.hrm_holiday import HolidayType
from app.services.hrm_holiday_service import (
    HolidayService, _parse_date, _parse_bool, _parse_holiday_type,
    _norm_header, _ALIAS_TO_FIELD,
)


# ── Fake Mongo collection (async) ──────────────────────────────────────────────
class _FakeColl:
    def __init__(self):
        self.docs = []

    def find(self, query, projection=None):
        docs = [d for d in self.docs if not d.get("is_deleted")]

        class _Cur:
            def __aiter__(self_):
                self_._it = iter(docs)
                return self_

            async def __anext__(self_):
                try:
                    return next(self_._it)
                except StopIteration:
                    raise StopAsyncIteration
        return _Cur()

    async def insert_many(self, docs):
        self.docs.extend(docs)

    async def insert_one(self, doc):
        self.docs.append(doc)


class _FakeDB:
    def __init__(self):
        self._h = _FakeColl()
        self._a = _FakeColl()

    def __getitem__(self, name):
        return self._a if name == "hrm_audit_logs" else self._h


# ── Pure helpers ───────────────────────────────────────────────────────────────
class TestHeaderMapping:
    @pytest.mark.parametrize("variant", [
        "Holiday Name", "holiday name", "HOLIDAY NAME", "Holiday_Name", "holiday_name",
    ])
    def test_name_variants(self, variant):
        assert _ALIAS_TO_FIELD.get(_norm_header(variant)) == "name"

    def test_all_expected_columns_map(self):
        assert _ALIAS_TO_FIELD[_norm_header("Date")] == "date"
        assert _ALIAS_TO_FIELD[_norm_header("Type")] == "holiday_type"
        assert _ALIAS_TO_FIELD[_norm_header("Description")] == "description"
        assert _ALIAS_TO_FIELD[_norm_header("Paid Holiday")] == "is_paid"
        assert _ALIAS_TO_FIELD[_norm_header("Recurring Every Year")] == "is_recurring"

    def test_exported_template_headers_still_map(self):
        # The app's own export writes name/date/holiday_type/description/is_paid/is_recurring
        for h, field in [("name", "name"), ("holiday_type", "holiday_type"),
                         ("is_paid", "is_paid"), ("is_recurring", "is_recurring")]:
            assert _ALIAS_TO_FIELD[_norm_header(h)] == field


class TestDateParsing:
    @pytest.mark.parametrize("src,exp", [
        ("26-Jan", "2026-01-26"), ("26 Jan", "2026-01-26"), ("26-Jan-2026", "2026-01-26"),
        ("26/01/2026", "2026-01-26"), ("26-01-2026", "2026-01-26"), ("2026-01-26", "2026-01-26"),
        ("15-Aug", "2026-08-15"),
    ])
    def test_formats(self, src, exp):
        assert _parse_date(src, 2026) == exp

    def test_excel_serial(self):
        assert _parse_date(46048, 2026) == "2026-01-26"

    def test_native_datetime(self):
        from datetime import datetime
        assert _parse_date(datetime(2026, 10, 2), 2026) == "2026-10-02"

    def test_invalid_raises(self):
        with pytest.raises(ValueError):
            _parse_date("not-a-date", 2026)


class TestBoolAndType:
    @pytest.mark.parametrize("v", ["Yes", "YES", "yes", "True", "1", "y"])
    def test_truthy(self, v):
        assert _parse_bool(v, False) is True

    @pytest.mark.parametrize("v", ["No", "NO", "False", "0", "n"])
    def test_falsy(self, v):
        assert _parse_bool(v, True) is False

    def test_blank_uses_default(self):
        assert _parse_bool("", True) is True
        assert _parse_bool(None, False) is False

    @pytest.mark.parametrize("src,exp", [
        ("National Holiday", HolidayType.NATIONAL),
        ("Festival Holiday", HolidayType.FESTIVAL),
        ("Company Holiday", HolidayType.COMPANY),
        ("Regional Holiday", HolidayType.REGIONAL),
        ("Optional Holiday", HolidayType.OPTIONAL),
        ("  national ", HolidayType.NATIONAL),
        ("unknown-thing", HolidayType.NATIONAL),
    ])
    def test_type(self, src, exp):
        assert _parse_holiday_type(src) == exp


# ── Full import flow ───────────────────────────────────────────────────────────
class TestImportFlow:
    CSV = "\n".join([
        "Holiday Name,Date,Type,Description,Paid Holiday,Recurring Every Year",
        "Republic Day,26-Jan,National Holiday,Republic Day of India,Yes,Yes",
        "Independence Day,15-Aug,National Holiday,Independence Day,Yes,Yes",
        "Diwali,20-Oct,Festival Holiday,Festival of Lights,No,Yes",
        "Republic Day Dup,26-Jan,National Holiday,dup date,Yes,Yes",   # duplicate date
        ",01-Apr,Company Holiday,missing name,Yes,Yes",                # missing name
        "Bad Date,not-a-date,Company Holiday,bad,Yes,No",              # invalid date
    ])

    def test_real_world_file_imports(self):
        svc = HolidayService(_FakeDB())
        res = asyncio.run(svc.import_from_csv(self.CSV, "co", "hr1"))
        assert res["created"] == 3
        assert res["skipped"] == 3
        joined = " | ".join(res["errors"])
        assert "Duplicate holiday" in joined
        assert "Missing Holiday Name" in joined
        assert "Invalid date" in joined

    def test_values_normalized(self):
        db = _FakeDB()
        svc = HolidayService(db)
        asyncio.run(svc.import_from_csv(self.CSV, "co", "hr1"))
        by_name = {d["name"]: d for d in db._h.docs}
        assert by_name["Republic Day"]["date"] == "2026-01-26" or by_name["Republic Day"]["date"].endswith("-01-26")
        assert by_name["Republic Day"]["holiday_type"] == "national"
        assert by_name["Republic Day"]["is_paid"] is True
        assert by_name["Diwali"]["is_paid"] is False
        assert by_name["Diwali"]["holiday_type"] == "festival"

    def test_reimport_is_all_duplicates(self):
        db = _FakeDB()
        svc = HolidayService(db)
        asyncio.run(svc.import_from_csv(self.CSV, "co", "hr1"))
        res2 = asyncio.run(svc.import_from_csv(self.CSV, "co", "hr1"))
        assert res2["created"] == 0

    def test_xlsx_import(self):
        import openpyxl
        from datetime import datetime
        wb = openpyxl.Workbook(); ws = wb.active
        ws.append(["Holiday Name", "Date", "Type", "Paid Holiday", "Recurring Every Year"])
        ws.append(["Republic Day", datetime(2026, 1, 26), "National Holiday", "Yes", "Yes"])
        ws.append(["Holi", "14-Mar", "Festival Holiday", "No", "No"])
        buf = io.BytesIO(); wb.save(buf)
        db = _FakeDB(); svc = HolidayService(db)
        res = asyncio.run(svc.import_from_file(buf.getvalue(), "h.xlsx", "co", "hr1", year=2026))
        assert res["created"] == 2 and res["skipped"] == 0
        by_name = {d["name"]: d for d in db._h.docs}
        assert by_name["Republic Day"]["date"] == "2026-01-26"
        assert by_name["Holi"]["date"] == "2026-03-14"
