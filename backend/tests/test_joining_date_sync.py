"""Tests for the joining-date single source of truth (Part 3).

The employee record's ``date_of_joining`` is canonical (payroll/attendance read
it). Editing it must mirror onto the linked CRM user's ``joining_date`` so the
two can never diverge. Covers the reported bug: an employment-section joining
date change that previously never reached the user record.
"""
from datetime import datetime, timezone, date

import pytest

from app.services.employee_service import EmployeeService
from app.models.company.employee import EmployeeUpdate


class FakeColl:
    def __init__(self, docs=None):
        self.docs = docs or []
        self.updates = []  # captured (_id/query, $set) for assertions

    async def find_one(self, q, proj=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items() if not isinstance(v, dict)):
                return dict(d)
        return None

    async def update_one(self, q, u):
        self.updates.append((q, u.get("$set", {})))
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items() if not isinstance(v, dict)):
                d.update(u.get("$set", {}))
                return


class FakeDB:
    def __init__(self, emp_doc, user_doc):
        self.hrm_employees = FakeColl([emp_doc])
        self.users = FakeColl([user_doc])
        self.company_settings = FakeColl([])  # no employment defaults → probation disabled

    def __getitem__(self, name):
        return getattr(self, name)


def _emp(**over):
    d = {
        "_id": "EMP1", "company_id": "co", "full_name": "Asha",
        "email": "asha@x.com", "crm_user_id": "U1",
        "date_of_joining": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "employment_status": "active", "is_deleted": False,
    }
    d.update(over)
    return d


def _user(**over):
    d = {"_id": "U1", "full_name": "Asha", "email": "asha@x.com",
         "joining_date": datetime(2026, 1, 1, tzinfo=timezone.utc), "is_deleted": False}
    d.update(over)
    return d


@pytest.mark.asyncio
async def test_update_doj_syncs_to_user_joining_date():
    db = FakeDB(_emp(), _user())
    svc = EmployeeService(db)
    await svc.update("EMP1", EmployeeUpdate(date_of_joining=date(2026, 3, 15)), "co")

    # user.joining_date now mirrors the new canonical employee date_of_joining
    assert db.users.docs[0]["joining_date"] == datetime(2026, 3, 15, tzinfo=timezone.utc)
    # and it is BSON-safe (a datetime, never a bare date)
    assert isinstance(db.users.docs[0]["joining_date"], datetime)


@pytest.mark.asyncio
async def test_update_without_doj_leaves_user_joining_date_untouched():
    db = FakeDB(_emp(), _user())
    svc = EmployeeService(db)
    await svc.update("EMP1", EmployeeUpdate(full_name="Asha K"), "co")

    # unrelated edit → joining_date unchanged, but name still synced
    assert db.users.docs[0]["joining_date"] == datetime(2026, 1, 1, tzinfo=timezone.utc)
    assert db.users.docs[0]["full_name"] == "Asha K"


@pytest.mark.asyncio
async def test_update_doj_no_linked_user_is_safe():
    db = FakeDB(_emp(crm_user_id=None), _user())
    svc = EmployeeService(db)
    # No linked user → must not raise and must not touch any user record
    res = await svc.update("EMP1", EmployeeUpdate(date_of_joining=date(2026, 4, 1)), "co")
    assert res is not None
    assert db.users.docs[0]["joining_date"] == datetime(2026, 1, 1, tzinfo=timezone.utc)
