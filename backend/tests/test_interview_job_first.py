"""Tests for the job-first interview scheduling rework (Parts 5-7).

Rounds now come from the JOB's configured interview_rounds (snapshotted onto the
candidate on first schedule) — HR no longer types round names per candidate.
Assigned interviewers (Active Employees) are notified in-app. Jobs without
configured rounds still fall back to generic "Round N" (backward compatible).
"""
import pytest

from app.services.hrm_hiring_service import HRMHiringService


class Coll:
    def __init__(self, docs=None):
        self.docs = docs or []

    async def find_one(self, q, proj=None):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items() if not isinstance(v, dict)):
                return dict(d)
        return None

    async def update_one(self, q, u):
        for d in self.docs:
            if all(d.get(k) == v for k, v in q.items() if not isinstance(v, dict)):
                if "$set" in u:
                    d.update(u["$set"])
                return

    async def insert_one(self, d):
        self.docs.append(d)

    async def insert_many(self, ds):
        self.docs.extend(ds)

    def find(self, q, proj=None):
        def match(d):
            for k, v in q.items():
                if isinstance(v, dict) and "$in" in v:
                    if d.get(k) not in v["$in"]:
                        return False
                elif d.get(k) != v:
                    return False
            return True
        res = [d for d in self.docs if match(d)]

        class Cur:
            def __aiter__(s):
                s.i = iter(res)
                return s

            async def __anext__(s):
                try:
                    return dict(next(s.i))
                except StopIteration:
                    raise StopAsyncIteration

            async def to_list(s, length=None):
                return [dict(x) for x in res]
        return Cur()


class FakeDB:
    def __init__(self, seed):
        object.__setattr__(self, "c", dict(seed))

    def __getitem__(self, n):
        return self.c.setdefault(n, Coll())

    def __getattr__(self, n):
        return self.c.setdefault(n, Coll())


def _svc(job_rounds, candidate, employees=None, interviews=None):
    db = FakeDB({
        "hrm_jobs": Coll([{"_id": "J1", "company_id": "co", "interview_rounds": job_rounds}]) if job_rounds is not None else Coll(),
        "hrm_candidates": Coll([candidate]),
        "hrm_employees": Coll(employees or []),
        "hrm_interviews": Coll(interviews or []),
        "notifications": Coll(),
    })
    return HRMHiringService(db), db


def _cand(**over):
    d = {"_id": "C1", "company_id": "co", "full_name": "Ravi", "job_id": "J1",
         "job_title": "SDE", "current_stage": "screening", "is_deleted": False}
    d.update(over)
    return d


@pytest.mark.asyncio
async def test_rounds_seeded_from_job_not_hr_input():
    rounds = [{"round_number": 1, "round_name": "Technical Screening"},
              {"round_number": 2, "round_name": "HR Round"}]
    svc, db = _svc(rounds, _cand())
    res = await svc.create_interview("co", {
        "candidate_id": "C1", "job_id": "J1", "scheduled_at": "2026-08-01T10:00:00+00:00",
        "mode": "video", "interviewers": [],
    }, "hr1", "HR One")
    assert res["round_name"] == "Technical Screening" and res["round_number"] == 1
    # candidate pipeline is a snapshot of the JOB's rounds
    cand = db["hrm_candidates"].docs[0]
    assert [r["round_name"] for r in cand["interview_pipeline"]] == ["Technical Screening", "HR Round"]
    assert db["hrm_candidates"].docs[0]["current_stage"] == "interview"


@pytest.mark.asyncio
async def test_second_round_progresses_from_job_config():
    rounds = [{"round_number": 1, "round_name": "Technical Screening"},
              {"round_number": 2, "round_name": "HR Round"}]
    passed = [{"_id": "IV1", "company_id": "co", "candidate_id": "C1", "result": "passed", "round_number": 1}]
    svc, db = _svc(rounds, _cand(interview_pipeline=rounds), interviews=passed)
    res = await svc.create_interview("co", {
        "candidate_id": "C1", "job_id": "J1", "scheduled_at": "2026-08-05T10:00:00+00:00", "mode": "phone",
    }, "hr1", "HR One")
    assert res["round_name"] == "HR Round" and res["round_number"] == 2


@pytest.mark.asyncio
async def test_interviewers_notified_only_linked_users():
    rounds = [{"round_number": 1, "round_name": "Screen"}]
    emps = [{"_id": "E1", "company_id": "co", "crm_user_id": "U1"},
            {"_id": "E2", "company_id": "co", "crm_user_id": "U2"},
            {"_id": "E3", "company_id": "co", "crm_user_id": None}]
    svc, db = _svc(rounds, _cand(), employees=emps)
    await svc.create_interview("co", {
        "candidate_id": "C1", "job_id": "J1", "scheduled_at": "2026-08-01T10:00:00+00:00", "mode": "video",
        "interviewers": [{"id": "E1", "name": "A"}, {"id": "E2", "name": "B"}, {"id": "E3", "name": "C"}],
    }, "hr1", "HR One")
    notifs = db["notifications"].docs
    assert {n["user_id"] for n in notifs} == {"U1", "U2"}  # E3 has no linked user
    assert all(n["type"] == "interview_assigned" for n in notifs)


@pytest.mark.asyncio
async def test_job_without_rounds_falls_back_to_generic():
    svc, db = _svc([], _cand(job_id=None, job_title=None))
    res = await svc.create_interview("co", {
        "candidate_id": "C1", "scheduled_at": "2026-08-06T10:00:00+00:00", "mode": "video",
    }, "hr1", "HR")
    assert res["round_name"] == "Round 1"
    # nothing to snapshot → no pipeline written
    assert "interview_pipeline" not in db["hrm_candidates"].docs[0]
