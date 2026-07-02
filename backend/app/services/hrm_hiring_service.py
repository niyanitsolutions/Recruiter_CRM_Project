"""HRM — Hiring Pipeline Service (Jobs, Candidates, Interviews, Offers, Onboarding)"""
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.hrm_candidate import HiringStage
from app.models.company.hrm_offer import OfferStatus
from app.models.company.hrm_onboarding import OnboardingStatus
from app.services.employee_service import EmployeeService
from app.models.company.employee import EmploymentStatus


class HRMHiringService:
    JOB_COL = "hrm_jobs"
    CAND_COL = "hrm_candidates"
    INT_COL = "hrm_interviews"
    OFFER_COL = "hrm_offers"
    ONB_COL = "hrm_onboardings"
    EMP_COL = "hrm_employees"

    def __init__(self, db):
        self.db = db
        self.jobs = db[self.JOB_COL]
        self.candidates = db[self.CAND_COL]
        self.interviews = db[self.INT_COL]
        self.offers = db[self.OFFER_COL]
        self.onboardings = db[self.ONB_COL]

    @staticmethod
    def _ser(doc: dict) -> dict:
        if not doc:
            return {}
        doc["id"] = str(doc.pop("_id", ""))
        return doc

    # ── JOBS ──────────────────────────────────────────────────────────────────

    async def create_job(self, company_id: str, data: dict, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            **data,
            "required_skills": data.get("required_skills") or [],
            "status": "open",
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.jobs.insert_one(doc)
        return self._ser(doc)

    async def list_jobs(self, company_id: str, status: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if status:
            query["status"] = status
        total = await self.jobs.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.jobs.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_job(self, job_id: str, company_id: str) -> Optional[dict]:
        doc = await self.jobs.find_one({"_id": job_id, "company_id": company_id, "is_deleted": False})
        return self._ser(doc) if doc else None

    async def update_job(self, job_id: str, company_id: str, data: dict) -> Optional[dict]:
        data = {k: v for k, v in data.items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc)
        await self.jobs.update_one({"_id": job_id, "company_id": company_id}, {"$set": data})
        return await self.get_job(job_id, company_id)

    async def delete_job(self, job_id: str, company_id: str) -> bool:
        result = await self.jobs.update_one(
            {"_id": job_id, "company_id": company_id},
            {"$set": {"is_deleted": True, "updated_at": datetime.now(timezone.utc)}}
        )
        return result.modified_count > 0

    # ── CANDIDATES ────────────────────────────────────────────────────────────

    async def create_candidate(self, company_id: str, data: dict, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            **data,
            "skills": data.get("skills") or [],
            "current_stage": HiringStage.APPLIED,
            "stage_history": [{"stage": HiringStage.APPLIED, "changed_at": now.isoformat()}],
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await self.candidates.insert_one(doc)
        return self._ser(doc)

    async def list_candidates(self, company_id: str, job_id: Optional[str], stage: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id, "is_deleted": False}
        if job_id:
            query["job_id"] = job_id
        if stage:
            query["current_stage"] = stage
        total = await self.candidates.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.candidates.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_candidate(self, cand_id: str, company_id: str) -> Optional[dict]:
        doc = await self.candidates.find_one({"_id": cand_id, "company_id": company_id, "is_deleted": False})
        return self._ser(doc) if doc else None

    async def update_candidate(self, cand_id: str, company_id: str, data: dict) -> Optional[dict]:
        from fastapi import HTTPException
        now = datetime.now(timezone.utc)
        upd = {k: v for k, v in data.items() if v is not None}
        upd["updated_at"] = now
        if "current_stage" in upd:
            new_stage = str(upd["current_stage"])
            valid_stages = {s.value for s in HiringStage}
            if new_stage not in valid_stages:
                raise HTTPException(status_code=400, detail=f"Invalid hiring stage '{new_stage}'")
            existing = await self.candidates.find_one(
                {"_id": cand_id, "company_id": company_id}, {"current_stage": 1}
            )
            # HIRED is terminal — the person is now an employee; the hiring
            # record must not be re-opened (would allow a second employee creation)
            if existing and existing.get("current_stage") == HiringStage.HIRED.value \
                    and new_stage != HiringStage.HIRED.value:
                raise HTTPException(status_code=400, detail="Cannot change stage of a hired candidate.")
            await self.candidates.update_one(
                {"_id": cand_id, "company_id": company_id},
                {"$push": {"stage_history": {"stage": upd["current_stage"], "changed_at": now.isoformat()}}}
            )
        await self.candidates.update_one({"_id": cand_id, "company_id": company_id}, {"$set": upd})
        return await self.get_candidate(cand_id, company_id)

    # ── INTERVIEWS ────────────────────────────────────────────────────────────

    async def create_interview(self, company_id: str, data: dict, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        cand = await self.candidates.find_one({"_id": data["candidate_id"], "company_id": company_id})
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "candidate_name": cand.get("full_name", "") if cand else "",
            **data,
            "interviewers": data.get("interviewers") or [],
            "result": "pending",
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.interviews.insert_one(doc)
        await self.update_candidate(data["candidate_id"], company_id, {"current_stage": HiringStage.INTERVIEW})
        return self._ser(doc)

    async def list_interviews(self, company_id: str, candidate_id: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if candidate_id:
            query["candidate_id"] = candidate_id
        total = await self.interviews.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.interviews.find(query).sort("scheduled_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def submit_feedback(self, interview_id: str, company_id: str, data: dict) -> Optional[dict]:
        upd = {**data, "updated_at": datetime.now(timezone.utc)}
        await self.interviews.update_one({"_id": interview_id, "company_id": company_id}, {"$set": upd})
        doc = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        return self._ser(doc) if doc else None

    # ── OFFERS ────────────────────────────────────────────────────────────────

    async def create_offer(self, company_id: str, data: dict, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        cand = await self.candidates.find_one({"_id": data["candidate_id"], "company_id": company_id})
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "candidate_name": cand.get("full_name", "") if cand else "",
            "candidate_email": cand.get("email", "") if cand else "",
            **data,
            "status": OfferStatus.DRAFT,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.offers.insert_one(doc)
        await self.update_candidate(data["candidate_id"], company_id, {"current_stage": HiringStage.OFFER})
        return self._ser(doc)

    async def list_offers(self, company_id: str, candidate_id: Optional[str], status: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if candidate_id:
            query["candidate_id"] = candidate_id
        if status:
            query["status"] = status
        total = await self.offers.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.offers.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_offer(self, offer_id: str, company_id: str) -> Optional[dict]:
        doc = await self.offers.find_one({"_id": offer_id, "company_id": company_id})
        return self._ser(doc) if doc else None

    async def respond_offer(self, offer_id: str, company_id: str, action: str, rejection_reason: Optional[str]) -> Optional[dict]:
        from fastapi import HTTPException
        if action not in ("accept", "reject"):
            raise HTTPException(status_code=400, detail=f"Invalid action '{action}'. Must be 'accept' or 'reject'.")

        current = await self.offers.find_one({"_id": offer_id, "company_id": company_id}, {"status": 1})
        if not current:
            return None
        # Only pending offers (draft/sent) can be responded to
        if current.get("status") not in (OfferStatus.DRAFT.value, OfferStatus.SENT.value):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot {action} an offer with status '{current.get('status')}'."
            )

        now = datetime.now(timezone.utc)
        if action == "accept":
            upd = {"status": OfferStatus.ACCEPTED, "accepted_at": now, "updated_at": now}
        else:
            upd = {"status": OfferStatus.REJECTED, "rejected_at": now, "updated_at": now}
            if rejection_reason:
                upd["rejection_reason"] = rejection_reason
        await self.offers.update_one({"_id": offer_id, "company_id": company_id}, {"$set": upd})
        offer = await self.offers.find_one({"_id": offer_id, "company_id": company_id})
        if offer and action == "accept":
            await self.update_candidate(offer["candidate_id"], company_id, {"current_stage": HiringStage.ONBOARDING})
        return await self.get_offer(offer_id, company_id)

    async def update_offer_status(self, offer_id: str, company_id: str, status: str) -> Optional[dict]:
        from fastapi import HTTPException
        if status not in {s.value for s in OfferStatus}:
            raise HTTPException(status_code=400, detail=f"Invalid offer status '{status}'")
        current = await self.offers.find_one({"_id": offer_id, "company_id": company_id}, {"status": 1})
        if not current:
            return None
        # An accepted offer is committed (candidate moved to onboarding) —
        # it can only be revoked, not silently reverted to draft/sent/rejected
        if current.get("status") == OfferStatus.ACCEPTED.value and status not in (
            OfferStatus.ACCEPTED.value, OfferStatus.REVOKED.value
        ):
            raise HTTPException(status_code=400, detail="An accepted offer can only be revoked.")
        await self.offers.update_one(
            {"_id": offer_id, "company_id": company_id},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
        )
        return await self.get_offer(offer_id, company_id)

    # ── ONBOARDING ────────────────────────────────────────────────────────────

    async def create_onboarding(self, company_id: str, data: dict, created_by: str) -> dict:
        from fastapi import HTTPException
        now = datetime.now(timezone.utc)
        cand = await self.candidates.find_one({"_id": data["candidate_id"], "company_id": company_id})

        # Workflow gate: onboarding (→ employee creation) requires an ACCEPTED offer
        offer_query: dict = {"company_id": company_id, "status": OfferStatus.ACCEPTED.value}
        if data.get("offer_id"):
            offer_query["_id"] = data["offer_id"]
        else:
            offer_query["candidate_id"] = data["candidate_id"]
        accepted_offer = await self.offers.find_one(offer_query, {"_id": 1})
        if not accepted_offer:
            raise HTTPException(
                status_code=400,
                detail="Onboarding requires an accepted offer for this candidate."
            )

        # One active onboarding per candidate — a duplicate would allow a second
        # employee record for the same hire
        existing_onb = await self.onboardings.find_one({
            "company_id": company_id,
            "candidate_id": data["candidate_id"],
            "status": {"$ne": OnboardingStatus.CANCELLED.value},
        }, {"_id": 1})
        if existing_onb:
            raise HTTPException(
                status_code=400,
                detail="An onboarding record already exists for this candidate."
            )
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "candidate_id": data["candidate_id"],
            "candidate_name": cand.get("full_name", "") if cand else "",
            "candidate_email": cand.get("email", "") if cand else "",
            "offer_id": data.get("offer_id"),
            "joining_date": data.get("joining_date"),
            "department_id": data.get("department_id"),
            "department_name": data.get("department_name"),
            "designation": data.get("designation"),
            "reporting_manager_id": data.get("reporting_manager_id"),
            "notes": data.get("notes"),
            "tasks": [],
            "documents": [],
            "status": OnboardingStatus.INITIATED,
            "employee_id": None,
            "created_by": created_by,
            "created_at": now,
            "updated_at": now,
        }
        await self.onboardings.insert_one(doc)
        return self._ser(doc)

    async def list_onboardings(self, company_id: str, status: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if status:
            query["status"] = status
        total = await self.onboardings.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.onboardings.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    async def get_onboarding(self, onb_id: str, company_id: str) -> Optional[dict]:
        doc = await self.onboardings.find_one({"_id": onb_id, "company_id": company_id})
        return self._ser(doc) if doc else None

    async def update_onboarding(self, onb_id: str, company_id: str, data: dict) -> Optional[dict]:
        data = {k: v for k, v in data.items() if v is not None}
        data["updated_at"] = datetime.now(timezone.utc)
        await self.onboardings.update_one({"_id": onb_id, "company_id": company_id}, {"$set": data})
        return await self.get_onboarding(onb_id, company_id)

    async def complete_onboarding(self, onb_id: str, company_id: str) -> Optional[dict]:
        onb = await self.onboardings.find_one({"_id": onb_id, "company_id": company_id})
        if not onb:
            return None

        # Idempotency guard: completing twice must not create a second employee
        if onb.get("status") == OnboardingStatus.COMPLETED or onb.get("employee_id"):
            return await self.get_onboarding(onb_id, company_id)

        if onb.get("status") == OnboardingStatus.CANCELLED:
            from fastapi import HTTPException
            raise HTTPException(status_code=400, detail="Cannot complete a cancelled onboarding.")

        emp_svc = EmployeeService(self.db)
        from app.models.company.employee import EmployeeCreate
        emp_data = EmployeeCreate(
            full_name=onb.get("candidate_name", ""),
            email=onb.get("candidate_email", "unknown@placeholder.com"),
            phone=onb.get("candidate_phone", ""),
            date_of_joining=onb.get("joining_date"),
            department_id=onb.get("department_id"),
            department_name=onb.get("department_name"),
            designation_name=onb.get("designation"),
            reporting_manager_id=onb.get("reporting_manager_id"),
        )
        emp = await emp_svc.create(emp_data, company_id, onb.get("created_by", "system"))

        now = datetime.now(timezone.utc)
        await self.onboardings.update_one(
            {"_id": onb_id, "company_id": company_id},
            {"$set": {"status": OnboardingStatus.COMPLETED, "employee_id": emp["id"], "updated_at": now}}
        )
        await self.update_candidate(onb["candidate_id"], company_id, {"current_stage": HiringStage.HIRED})
        return await self.get_onboarding(onb_id, company_id)
