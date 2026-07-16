"""HRM — Hiring Pipeline Service (Jobs, Candidates, Interviews, Offers, Onboarding)"""
import secrets
from datetime import datetime, timezone
from typing import Optional, List
from bson import ObjectId

from app.models.company.hrm_candidate import HiringStage, HRMCandidateSource
from app.models.company.hrm_offer import OfferStatus
from app.models.company.hrm_onboarding import OnboardingStatus
from app.models.company.hrm_candidate_invitation import InvitationStatus
from app.services.employee_service import EmployeeService
from app.models.company.employee import EmploymentStatus


class HRMHiringService:
    JOB_COL = "hrm_jobs"
    CAND_COL = "hrm_candidates"
    INT_COL = "hrm_interviews"
    OFFER_COL = "hrm_offers"
    ONB_COL = "hrm_onboardings"
    EMP_COL = "hrm_employees"
    INVITE_COL = "hrm_candidate_invitations"

    def __init__(self, db):
        # db is None only for the public (no-auth) apply-page routes, which
        # resolve the correct tenant db themselves per-slug (cross-tenant
        # lookup) rather than using a single pre-bound company db.
        self.db = db
        if db is not None:
            self.jobs = db[self.JOB_COL]
            self.candidates = db[self.CAND_COL]
            self.interviews = db[self.INT_COL]
            self.offers = db[self.OFFER_COL]
            self.onboardings = db[self.ONB_COL]
            self.invitations = db[self.INVITE_COL]

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

    # ── PUBLIC APPLY LINK ─────────────────────────────────────────────────────

    async def get_or_create_job_public_slug(self, job_id: str, company_id: str) -> dict:
        """Idempotent: return the job's existing public_slug, or generate one.

        Mirrors public_forms.py's generate_my_public_form — one permanent slug
        per job, safe to call repeatedly.
        """
        from fastapi import HTTPException
        job = await self.jobs.find_one({"_id": job_id, "company_id": company_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.get("public_slug"):
            return {"job_id": job_id, "public_slug": job["public_slug"]}

        for _ in range(10):
            slug = secrets.token_urlsafe(12)
            if not await self.jobs.find_one({"public_slug": slug}, {"_id": 1}):
                break
        else:
            raise HTTPException(status_code=500, detail="Could not generate a unique link. Please try again.")

        await self.jobs.update_one(
            {"_id": job_id, "company_id": company_id},
            {"$set": {"public_slug": slug, "updated_at": datetime.now(timezone.utc)}},
        )
        return {"job_id": job_id, "public_slug": slug}

    # ── INVITATIONS ("Send Application Link") ────────────────────────────────

    async def send_application_invitation(self, company_id: str, data: dict, sent_by: str, sent_by_name: str) -> dict:
        from fastapi import HTTPException
        job = await self.jobs.find_one({"_id": data["job_id"], "company_id": company_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        if job.get("status") != "open":
            raise HTTPException(status_code=400, detail="Cannot invite candidates to a job that is not open.")

        email = str(data["email"]).lower().strip()
        duplicate = await self.invitations.find_one({
            "company_id": company_id,
            "job_id": data["job_id"],
            "email": email,
            "status": InvitationStatus.SENT.value,
        }, {"_id": 1})
        if duplicate:
            raise HTTPException(
                status_code=409,
                detail="An invitation has already been sent to this email for this job.",
            )

        slug_info = await self.get_or_create_job_public_slug(data["job_id"], company_id)

        now = datetime.now(timezone.utc)
        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "job_id": data["job_id"],
            "job_title": job.get("job_title"),
            "candidate_name": data["candidate_name"],
            "email": email,
            "message": data.get("message"),
            "status": InvitationStatus.SENT,
            "applied_candidate_id": None,
            "applied_at": None,
            "sent_by": sent_by,
            "sent_by_name": sent_by_name,
            "sent_at": now,
        }
        await self.invitations.insert_one(doc)
        return {**self._ser(doc), "public_slug": slug_info["public_slug"]}

    async def list_invitations(self, company_id: str, job_id: Optional[str], page: int, page_size: int) -> dict:
        query: dict = {"company_id": company_id}
        if job_id:
            query["job_id"] = job_id
        total = await self.invitations.count_documents(query)
        skip = (page - 1) * page_size
        cursor = self.invitations.find(query).sort("sent_at", -1).skip(skip).limit(page_size)
        items = [self._ser(d) async for d in cursor]
        return {"items": items, "total": total, "page": page, "page_size": page_size}

    # ── PUBLIC (no-auth) — job apply page + submission ───────────────────────

    async def get_public_job_by_slug(self, slug: str) -> dict:
        """Cross-tenant slug lookup — no company_id known up front. Never
        raises anything but a clean 404/410 (never a raw server error)."""
        from fastapi import HTTPException
        from app.core.database import DatabaseManager, get_master_db as _get_master

        master = _get_master()
        company_ids = await master.tenants.distinct("company_id", {"is_deleted": {"$ne": True}})
        for cid in company_ids:
            if not cid:
                continue
            try:
                cdb = DatabaseManager.get_company_db(str(cid))
            except Exception:
                continue
            try:
                job = await cdb[self.JOB_COL].find_one(
                    {"public_slug": slug, "is_deleted": False}
                )
            except Exception:
                continue
            if job:
                if job.get("status") != "open":
                    raise HTTPException(status_code=410, detail="This job is no longer accepting applications.")
                return {
                    "company_id": cid,
                    "job_id": job["_id"],
                    "job_title": job.get("job_title"),
                    "department_name": job.get("department_name"),
                    "job_description": job.get("job_description"),
                    "location": job.get("location"),
                    "is_remote": job.get("is_remote", False),
                }
        raise HTTPException(status_code=404, detail="This application link is invalid or no longer available.")

    async def submit_public_application(self, slug: str, data: dict) -> dict:
        from fastapi import HTTPException
        from app.core.database import DatabaseManager

        job_meta = await self.get_public_job_by_slug(slug)
        company_id = job_meta["company_id"]
        cdb = DatabaseManager.get_company_db(company_id)
        candidates_col = cdb[self.CAND_COL]

        email = str(data.get("email", "")).lower().strip()
        if not data.get("full_name") or not email or not data.get("phone"):
            raise HTTPException(status_code=422, detail="Full name, email, and phone are required.")

        now = datetime.now(timezone.utc)
        cand_doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "job_id": job_meta["job_id"],
            "job_title": job_meta["job_title"],
            "full_name": data["full_name"],
            "email": email,
            "phone": data["phone"],
            "current_designation": data.get("current_designation"),
            "current_company": None,
            "total_experience_years": data.get("total_experience_years"),
            "skills": [],
            "source": HRMCandidateSource.PUBLIC_LINK,
            "referral_by": None,
            "resume_url": data.get("resume_url"),
            "current_stage": HiringStage.APPLIED,
            "stage_history": [{"stage": HiringStage.APPLIED, "changed_at": now.isoformat()}],
            "expected_salary": None,
            "notice_period_days": None,
            "location": None,
            "notes": None,
            "linkedin_url": data.get("linkedin_url"),
            "portfolio_url": data.get("portfolio_url"),
            "created_by": None,
            "created_at": now,
            "updated_at": now,
            "is_deleted": False,
        }
        await candidates_col.insert_one(cand_doc)

        # Link back to a matching outstanding invitation, if any (keeps history accurate)
        invitations_col = cdb[self.INVITE_COL]
        await invitations_col.update_one(
            {
                "company_id": company_id,
                "job_id": job_meta["job_id"],
                "email": email,
                "status": InvitationStatus.SENT.value,
            },
            {"$set": {
                "status": InvitationStatus.APPLIED,
                "applied_candidate_id": cand_doc["_id"],
                "applied_at": now,
            }},
        )

        return {"candidate_id": cand_doc["_id"], "job_title": job_meta["job_title"]}

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
            # str(HiringStage.X) prints "HiringStage.X", not the enum's string
            # value ("x") — every internal caller (create_interview,
            # create_offer, respond_offer, complete_onboarding) passes the raw
            # enum member here, so this always failed validation and raised
            # BEFORE the actual $set below ever ran: the interview/offer would
            # already be persisted, but the candidate's current_stage silently
            # never advanced. Use .value directly for enum members.
            raw_stage = upd["current_stage"]
            new_stage = raw_stage.value if isinstance(raw_stage, HiringStage) else str(raw_stage)
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

    async def _get_job_rounds(self, job_id: Optional[str], company_id: str) -> list:
        """The job's configured interview workflow, or [] if the job has none
        configured / no job_id — legacy behavior: unlimited, generically-named
        rounds, matching the pre-automation manual round-name entry."""
        if not job_id:
            return []
        job = await self.jobs.find_one({"_id": job_id, "company_id": company_id}, {"interview_rounds": 1})
        return (job or {}).get("interview_rounds") or []

    async def _compute_next_round(
        self, candidate_id: str, job_id: Optional[str], company_id: str, *, for_scheduling: bool
    ) -> Optional[dict]:
        """Auto-determines the next interview round for a candidate — HR never
        picks a round number/name manually (section 2/4).

        for_scheduling=True (about to create an interview): raises if the
        candidate has a pending (feedback not yet given) interview, or if the
        job has no further configured rounds left.
        for_scheduling=False (checking after a Passed result): returns None
        instead of raising when there are no further configured rounds —
        the caller treats that as "final round reached".
        """
        from fastapi import HTTPException
        existing = await self.interviews.find(
            {"candidate_id": candidate_id, "company_id": company_id}
        ).to_list(length=None)

        if for_scheduling and any(iv.get("result") == "pending" for iv in existing):
            raise HTTPException(
                status_code=409,
                detail="This candidate already has a pending interview awaiting feedback.",
            )

        passed_count = sum(1 for iv in existing if iv.get("result") == "passed")
        next_round_number = passed_count + 1

        rounds = await self._get_job_rounds(job_id, company_id)
        if rounds:
            rounds_sorted = sorted(rounds, key=lambda r: r["round_number"])
            match = next((r for r in rounds_sorted if r["round_number"] == next_round_number), None)
            if not match:
                if for_scheduling:
                    raise HTTPException(
                        status_code=400,
                        detail="No further interview rounds are configured for this job.",
                    )
                return None
            return {
                "round_number": next_round_number,
                "round_name": match["round_name"],
                "is_final": next_round_number >= rounds_sorted[-1]["round_number"],
            }
        return {"round_number": next_round_number, "round_name": f"Round {next_round_number}", "is_final": False}

    async def get_next_round(self, candidate_id: str, company_id: str) -> dict:
        """Read-only preview for the Schedule Interview screen's auto-populated
        Current/Next Round + Stage fields (section 4)."""
        from fastapi import HTTPException
        cand = await self.candidates.find_one({"_id": candidate_id, "company_id": company_id, "is_deleted": False})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        next_round = await self._compute_next_round(candidate_id, cand.get("job_id"), company_id, for_scheduling=True)
        return {
            "candidate_id": candidate_id,
            "current_stage": cand.get("current_stage"),
            **next_round,
        }

    async def create_interview(self, company_id: str, data: dict, created_by: str, created_by_name: str = "") -> dict:
        from fastapi import HTTPException
        now = datetime.now(timezone.utc)
        cand = await self.candidates.find_one({"_id": data["candidate_id"], "company_id": company_id})
        if not cand:
            raise HTTPException(status_code=404, detail="Candidate not found")
        if cand.get("current_stage") == HiringStage.REJECTED.value:
            raise HTTPException(status_code=400, detail="Cannot schedule an interview for a rejected candidate.")

        job_id = data.get("job_id") or cand.get("job_id")
        round_info = await self._compute_next_round(data["candidate_id"], job_id, company_id, for_scheduling=True)
        send_invite = data.get("send_invitation_email", True)

        doc = {
            "_id": str(ObjectId()),
            "company_id": company_id,
            "candidate_id": data["candidate_id"],
            "candidate_name": cand.get("full_name", ""),
            "job_id": job_id,
            "job_title": cand.get("job_title"),
            "round_number": round_info["round_number"],
            "round_name": round_info["round_name"],
            "mode": data.get("mode", "video"),
            "scheduled_at": data["scheduled_at"],
            "duration_minutes": data.get("duration_minutes", 60),
            "location_or_link": data.get("location_or_link"),
            "interviewers": data.get("interviewers") or [],
            "result": "pending",
            "invitation_email_sent": bool(send_invite),
            "result_email_sent": False,
            "scheduled_by": created_by,
            "scheduled_by_name": created_by_name,
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
        from fastapi import HTTPException
        now = datetime.now(timezone.utc)
        interview = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        if not interview:
            return None
        if interview.get("result") != "pending":
            raise HTTPException(
                status_code=400,
                detail="Feedback has already been submitted for this interview — history cannot be overwritten.",
            )

        # Validation (section 12): recommendation is already required by the
        # pydantic schema (HRMInterviewFeedback.result has no default); guard
        # comments + interviewer here too.
        if not (data.get("feedback") or "").strip():
            raise HTTPException(status_code=422, detail="Feedback comments are required.")
        if not (data.get("interviewer_name") or "").strip():
            raise HTTPException(status_code=422, detail="Please select an interviewer.")

        notify_candidate = data.get("notify_candidate", True)
        result = data.get("result")

        upd = {k: v for k, v in data.items() if k != "notify_candidate"}
        # Overall Rating: use what was sent, or fall back to the average of
        # the 4 sub-ratings if the caller omitted it (defense in depth — the
        # frontend already computes/allows editing this before submit).
        if upd.get("rating") is None:
            sub_ratings = [
                upd.get(k) for k in
                ("technical_rating", "communication_rating", "problem_solving_rating", "behaviour_rating")
                if upd.get(k) is not None
            ]
            if sub_ratings:
                upd["rating"] = round(sum(sub_ratings) / len(sub_ratings), 1)
        upd["completed_at"] = now
        upd["updated_at"] = now
        upd["result_email_sent"] = bool(notify_candidate)
        await self.interviews.update_one({"_id": interview_id, "company_id": company_id}, {"$set": upd})

        next_round_info = None
        if result == "passed":
            next_round_info = await self._compute_next_round(
                interview["candidate_id"], interview.get("job_id"), company_id, for_scheduling=False
            )
            if not next_round_info:
                # Final configured round passed — move to Offer, never straight
                # to onboarding (onboarding still requires an accepted offer).
                await self.update_candidate(interview["candidate_id"], company_id, {"current_stage": HiringStage.OFFER})
        elif result == "failed":
            await self.update_candidate(interview["candidate_id"], company_id, {"current_stage": HiringStage.REJECTED})
        # on_hold (or any other result): no stage change — candidate stays "interview"

        doc = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        result_doc = self._ser(doc) if doc else None
        if result_doc is not None:
            result_doc["next_round"] = next_round_info
        return result_doc

    async def update_interview(self, interview_id: str, company_id: str, data: dict) -> Optional[dict]:
        """Edit / Reschedule Interview — only while feedback hasn't been given
        yet. Candidate/round/job are fixed once scheduled; only the logistics
        (when/how) can change."""
        from fastapi import HTTPException
        interview = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        if not interview:
            return None
        if interview.get("result") != "pending":
            raise HTTPException(
                status_code=400,
                detail="Only a pending interview can be edited or rescheduled.",
            )
        upd = {k: v for k, v in data.items() if v is not None}
        upd["updated_at"] = datetime.now(timezone.utc)
        await self.interviews.update_one({"_id": interview_id, "company_id": company_id}, {"$set": upd})
        doc = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        return self._ser(doc) if doc else None

    async def cancel_interview(self, interview_id: str, company_id: str) -> Optional[dict]:
        """Cancel Interview — marks it cancelled without deleting the record
        (section 7/10: never delete history). Does not touch candidate stage;
        HR can schedule a fresh interview for the same round afterward since
        a cancelled round was never counted as passed."""
        from fastapi import HTTPException
        interview = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        if not interview:
            return None
        if interview.get("result") != "pending":
            raise HTTPException(status_code=400, detail="Only a pending interview can be cancelled.")
        now = datetime.now(timezone.utc)
        await self.interviews.update_one(
            {"_id": interview_id, "company_id": company_id},
            {"$set": {"result": "cancelled", "completed_at": now, "updated_at": now}},
        )
        doc = await self.interviews.find_one({"_id": interview_id, "company_id": company_id})
        return self._ser(doc) if doc else None

    # ── OFFERS ────────────────────────────────────────────────────────────────

    async def generate_offer_letter_via_doc_center(
        self, offer_id: str, company_id: str, template_id: str, user_id: str, user_name: str,
        extra_field_values: Optional[dict] = None,
    ) -> dict:
        """Generates the offer letter PDF by calling Document Center's own,
        already-existing generate_document as a library function — this makes
        zero changes to Document Center's own files/routes/models. The
        generated doc still shows up in Document Center's own Generated list
        (with employee_id=None); we additionally store its doc_id/pdf_url on
        this hrm_offers record so Internal Hiring can show/attach it too."""
        from fastapi import HTTPException
        from app.models.company.document_center import DocGenerateRequest
        from app.services.document_center_service import document_center_service, TEMPLATE_LIBRARY

        offer = await self.offers.find_one({"_id": offer_id, "company_id": company_id})
        if not offer:
            raise HTTPException(status_code=404, detail="Offer not found")

        # template_id may be a prebuilt library key (e.g. "offer_letter") rather
        # than a real saved doc_templates _id — those only exist as static
        # definitions until materialized. Reuse a previously-materialized copy
        # if one exists; otherwise create it once. Avoids spamming Document
        # Center's own template list with a fresh duplicate on every generation.
        lib_meta = next((t for t in TEMPLATE_LIBRARY if t["key"] == template_id), None)
        if lib_meta:
            existing_tmpl = await self.db.doc_templates.find_one({
                "name": lib_meta["name"], "is_deleted": False, "tags": lib_meta["category"],
            })
            if existing_tmpl:
                template_id = existing_tmpl["_id"]
            else:
                ok, msg, created = await document_center_service.create_from_library(
                    self.db, template_id, user_id, user_name,
                )
                if not ok:
                    raise HTTPException(status_code=400, detail=msg)
                template_id = created["_id"]

        job = None
        if offer.get("job_id"):
            job = await self.jobs.find_one({"_id": offer["job_id"], "company_id": company_id})

        # Same field names Document Center's own _fetch_employee_fields uses,
        # so any existing template (built for employees) resolves correctly.
        field_values = {
            "employee_name": offer.get("candidate_name", "") or "",
            "employee_email": offer.get("candidate_email", "") or "",
            "designation": offer.get("offered_designation", "") or "",
            "department": offer.get("department_name", "") or "",
            "salary": str(offer.get("offered_ctc", "") or ""),
            "joining_date": str(offer.get("joining_date", "") or ""),
            "manager_name": (job or {}).get("hiring_manager_name", "") or "",
        }
        if extra_field_values:
            field_values.update(extra_field_values)

        req = DocGenerateRequest(
            template_id=template_id,
            document_name=f"Offer Letter - {offer.get('candidate_name', '')}",
            employee_id=None,
            field_values=field_values,
            generate_pdf=True,
            generate_docx=False,
        )
        ok, msg, gen_doc = await document_center_service.generate_document(self.db, req, user_id, user_name)
        if not ok:
            raise HTTPException(status_code=400, detail=msg)

        await self.offers.update_one(
            {"_id": offer_id, "company_id": company_id},
            {"$set": {
                "generated_doc_id": gen_doc["_id"],
                "pdf_url": gen_doc.get("pdf_url"),
                "updated_at": datetime.now(timezone.utc),
            }},
        )
        return await self.get_offer(offer_id, company_id)

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

    async def complete_onboarding(self, onb_id: str, company_id: str, company_name: str = "") -> Optional[dict]:
        from fastapi import HTTPException
        onb = await self.onboardings.find_one({"_id": onb_id, "company_id": company_id})
        if not onb:
            return None

        # Idempotency guard: completing twice must not create a second employee
        if onb.get("status") == OnboardingStatus.COMPLETED or onb.get("employee_id"):
            return await self.get_onboarding(onb_id, company_id)

        if onb.get("status") == OnboardingStatus.CANCELLED:
            raise HTTPException(status_code=400, detail="Cannot complete a cancelled onboarding.")

        import re as _re
        from app.models.company.employee import EmployeeCreate, AccountInfoCreate

        candidate_email = onb.get("candidate_email") or "unknown@placeholder.com"
        username_base = _re.sub(r"[^a-z0-9._]", "", candidate_email.split("@")[0].lower()) or "employee"
        joining_date_str = str(onb["joining_date"]) if onb.get("joining_date") else None

        # Auto-provision a CRM login alongside the employee record, reusing
        # EmployeeService's existing account_info path (same code UserForm.jsx
        # uses today). Minimal "employee" role, no elevated access — HR grants
        # real permissions afterward via the existing Users/Roles screens.
        account_info = AccountInfoCreate(
            username=username_base,
            password=secrets.token_urlsafe(9),
            role="employee",
            user_type="internal",
            department_id=onb.get("department_id"),
            department=onb.get("department_name"),
            designation=onb.get("designation"),
            reporting_to=onb.get("reporting_manager_id"),
            joining_date=joining_date_str,
        )
        emp_data = EmployeeCreate(
            full_name=onb.get("candidate_name", ""),
            email=candidate_email,
            phone=onb.get("candidate_phone", ""),
            date_of_joining=onb.get("joining_date"),
            department_id=onb.get("department_id"),
            department_name=onb.get("department_name"),
            designation_name=onb.get("designation"),
            reporting_manager_id=onb.get("reporting_manager_id"),
            account_info=account_info,
        )

        emp_svc = EmployeeService(self.db)
        created_by = onb.get("created_by", "system")
        try:
            emp = await emp_svc.create(emp_data, company_id, created_by, company_name=company_name)
        except HTTPException as e:
            # Auto-derived username collided — retry once with a short random
            # suffix instead of failing the whole onboarding completion.
            collided = (
                e.status_code == 409
                and isinstance(e.detail, dict)
                and "username" in (e.detail.get("fields") or {})
            )
            if not collided:
                raise
            account_info.username = f"{username_base}{secrets.token_hex(2)}"
            emp_data.account_info = account_info
            emp = await emp_svc.create(emp_data, company_id, created_by, company_name=company_name)

        now = datetime.now(timezone.utc)
        await self.onboardings.update_one(
            {"_id": onb_id, "company_id": company_id},
            {"$set": {"status": OnboardingStatus.COMPLETED, "employee_id": emp["id"], "updated_at": now}}
        )
        await self.update_candidate(onb["candidate_id"], company_id, {"current_stage": HiringStage.HIRED})
        return await self.get_onboarding(onb_id, company_id)
