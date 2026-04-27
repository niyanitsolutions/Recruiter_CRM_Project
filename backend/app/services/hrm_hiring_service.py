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
        now = datetime.now(timezone.utc)
        upd = {k: v for k, v in data.items() if v is not None}
        upd["updated_at"] = now
        if "current_stage" in upd:
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
        await self.offers.update_one(
            {"_id": offer_id, "company_id": company_id},
            {"$set": {"status": status, "updated_at": datetime.now(timezone.utc)}}
        )
        return await self.get_offer(offer_id, company_id)

    # ── ONBOARDING ────────────────────────────────────────────────────────────

    async def create_onboarding(self, company_id: str, data: dict, created_by: str) -> dict:
        now = datetime.now(timezone.utc)
        cand = await self.candidates.find_one({"_id": data["candidate_id"], "company_id": company_id})
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
