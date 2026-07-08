"""
Interview Service - Phase 3 + Round-Based Extension
Business logic for interview scheduling, round progression, and feedback
"""
import asyncio
from datetime import datetime, date, timedelta, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException


def _to_dt(d) -> datetime:
    """Convert a date or datetime to datetime for MongoDB storage/queries.
    PyMongo cannot serialize Python date objects, only datetime.
    """
    if isinstance(d, datetime):
        return d
    return datetime.combine(d, datetime.min.time())


from app.models.company.interview import (
    InterviewCreate,
    InterviewReschedule,
    InterviewFeedbackSubmit,
    RoundResultSubmit,
    InterviewResponse,
    InterviewListResponse,
    InterviewStatus,
    InterviewResult,
    RoundRecord,
    get_interview_status_display,
    get_interview_mode_display,
    get_interview_result_display
)

# Cooldown duration by rejection reason (in days)
COOLDOWN_DAYS: Dict[str, int] = {
    "technical":     30,
    "hr":             7,
    "communication": 15,
    "attendance":    60,
}
DEFAULT_COOLDOWN_DAYS = 3
MAX_RETRY_LIMIT = 3

# Statuses that mean an interview is still "alive" (not concluded)
_ACTIVE_STATUSES = {
    InterviewStatus.SCHEDULED.value,
    InterviewStatus.CONFIRMED.value,
    InterviewStatus.IN_PROGRESS.value,
    InterviewStatus.RESCHEDULED.value,
    InterviewStatus.ON_HOLD.value,
}


class InterviewService:
    """Service for interview management"""

    COLLECTION = "interviews"

    # ── Response builders ────────────────────────────────────────────────────

    @staticmethod
    def _build_interview_response(interview: dict) -> InterviewResponse:
        """Build InterviewResponse from a raw MongoDB document."""
        rounds = [RoundRecord(**r) for r in interview.get("rounds", [])]
        return InterviewResponse(
            id=interview["_id"],
            application_id=interview.get("application_id") or None,
            candidate_id=interview["candidate_id"],
            candidate_name=interview.get("candidate_name"),
            candidate_email=interview.get("candidate_email"),
            candidate_mobile=interview.get("candidate_mobile"),
            job_id=interview["job_id"],
            job_title=interview.get("job_title"),
            client_name=interview.get("client_name"),
            pipeline_id=interview.get("pipeline_id"),
            pipeline_name=interview.get("pipeline_name"),
            rounds=rounds,
            current_round_index=interview.get("current_round_index", 0),
            overall_status=interview.get("overall_status", "in_progress"),
            stage_id=interview.get("stage_id"),
            stage_name=interview.get("stage_name"),
            stage_order=interview.get("stage_order", 1),
            scheduled_date=interview.get("scheduled_date"),
            scheduled_time=interview.get("scheduled_time"),
            duration_minutes=interview.get("duration_minutes", 60),
            interview_mode=interview.get("interview_mode", "video"),
            interview_mode_display=get_interview_mode_display(interview.get("interview_mode", "video")),
            venue=interview.get("venue"),
            meeting_link=interview.get("meeting_link"),
            assessment_link=interview.get("assessment_link"),
            interviewer_names=interview.get("interviewer_names", []),
            primary_interviewer=interview.get("primary_interviewer"),
            status=interview.get("status", "scheduled"),
            status_display=get_interview_status_display(interview.get("status", "scheduled")),
            result=interview.get("result", "pending"),
            result_display=get_interview_result_display(interview.get("result", "pending")),
            feedback=interview.get("feedback"),
            feedback_submitted=interview.get("feedback_submitted", False),
            is_rescheduled=interview.get("is_rescheduled", False),
            reschedule_count=interview.get("reschedule_count", 0),
            instructions=interview.get("instructions"),
            created_at=interview["created_at"],
            created_by=interview.get("created_by")
        )

    @staticmethod
    def _build_list_response(interview: dict) -> InterviewListResponse:
        """Build InterviewListResponse from a raw MongoDB document."""
        rounds = interview.get("rounds", [])
        current_idx = interview.get("current_round_index", 0)

        current_round_name = None
        if rounds and current_idx < len(rounds):
            r = rounds[current_idx]
            current_round_name = f"Round {r.get('round_number', current_idx + 1)} — {r.get('round_name', '')}"

        last_round_result = None
        completed = [r for r in rounds if r.get("result") not in (None, "pending")]
        if completed:
            last = completed[-1]
            last_round_result = (
                f"Round {last.get('round_number')} — {last.get('round_name', '')}: "
                f"{last.get('result', '').title()}"
            )

        return InterviewListResponse(
            id=interview["_id"],
            candidate_name=interview.get("candidate_name"),
            job_title=interview.get("job_title"),
            client_name=interview.get("client_name"),
            pipeline_name=interview.get("pipeline_name"),
            current_round_name=current_round_name,
            last_round_result=last_round_result,
            overall_status=interview.get("overall_status", "in_progress"),
            total_rounds=len(rounds),
            current_round_index=current_idx,
            stage_name=interview.get("stage_name"),
            scheduled_date=interview.get("scheduled_date"),
            scheduled_time=interview.get("scheduled_time"),
            interview_mode=interview.get("interview_mode", "video"),
            interviewer_names=interview.get("interviewer_names", []),
            status=interview.get("status", "scheduled"),
            status_display=get_interview_status_display(interview.get("status", "scheduled")),
            result=interview.get("result", "pending"),
            feedback_submitted=interview.get("feedback_submitted", False),
            is_rescheduled=interview.get("is_rescheduled", False)
        )

    # ── validate_scheduling ──────────────────────────────────────────────────

    @staticmethod
    async def validate_scheduling(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        job_id: str,
    ) -> Dict[str, Any]:
        """
        Pre-flight validation before scheduling an interview.
        Returns {can_schedule, blocks, warnings, cooldown_until, retry_count, existing_interview}.
        Blocks = hard stops; warnings = advisory only.
        """
        now = datetime.now(timezone.utc)
        blocks: List[Dict] = []
        warnings: List[Dict] = []
        cooldown_until = None
        existing_interview = None

        # 1. Blacklist check
        cand_doc = await db["candidates"].find_one({"_id": candidate_id}, {"status": 1})
        if cand_doc and cand_doc.get("status") == "blacklisted":
            blocks.append({
                "code": "blacklisted",
                "message": "This candidate is blacklisted and cannot be scheduled for interviews.",
            })
            return {
                "can_schedule": False,
                "blocks": blocks,
                "warnings": warnings,
                "cooldown_until": None,
                "retry_count": 0,
                "existing_interview": None,
            }

        # 2. Load all non-deleted interviews for this candidate + job
        all_ivs = await db["interviews"].find(
            {"candidate_id": candidate_id, "job_id": job_id, "is_deleted": False}
        ).to_list(length=100)

        # 3. Already selected/hired for this position
        if any(iv.get("overall_status") == "selected" for iv in all_ivs):
            blocks.append({
                "code": "already_selected",
                "message": "This candidate has already been selected for this position.",
            })

        # 4. Duplicate active interview
        active_ivs = [iv for iv in all_ivs if iv.get("status") in _ACTIVE_STATUSES]
        if active_ivs:
            iv = active_ivs[0]
            sched = iv.get("scheduled_date")
            date_str = sched.strftime("%d %b %Y") if hasattr(sched, "strftime") else str(sched or "")
            existing_interview = {
                "id": iv["_id"],
                "status": iv.get("status"),
                "overall_status": iv.get("overall_status"),
                "scheduled_date": date_str,
            }
            blocks.append({
                "code": "duplicate_active",
                "message": (
                    f"An active interview already exists for this candidate and job "
                    f"(status: {iv.get('status', 'unknown')}"
                    + (f", scheduled {date_str}" if date_str else "")
                    + "). Cancel it before scheduling a new one."
                ),
            })

        # 5. Cooldown period
        for iv in sorted(all_ivs, key=lambda x: x.get("created_at", datetime.min), reverse=True):
            cd = iv.get("cooldown_until")
            if not cd:
                continue
            if cd.tzinfo is None:
                cd = cd.replace(tzinfo=timezone.utc)
            if cd > now:
                cooldown_until = cd
                days_left = max(1, (cd - now).days + 1)
                rejection_reason = iv.get("rejection_reason") or "other"
                blocks.append({
                    "code": "cooldown_active",
                    "message": (
                        f"Candidate is in a cooldown period after a {rejection_reason} rejection. "
                        f"Eligible again in {days_left} day{'s' if days_left != 1 else ''} "
                        f"({cd.strftime('%d %b %Y')})."
                    ),
                    "cooldown_until": cd.isoformat(),
                    "rejection_reason": rejection_reason,
                })
                break

        # 6. Max retry limit
        failed_count = sum(
            1 for iv in all_ivs
            if iv.get("overall_status") == "failed" or iv.get("status") == "failed"
        )
        if failed_count >= MAX_RETRY_LIMIT:
            blocks.append({
                "code": "max_retries",
                "message": (
                    f"This candidate has reached the maximum of {MAX_RETRY_LIMIT} failed attempts "
                    "for this position."
                ),
            })

        # 7. Advisory warnings (non-blocking)
        if 0 < failed_count < MAX_RETRY_LIMIT:
            warnings.append({
                "code": "has_previous_failures",
                "message": (
                    f"This candidate has {failed_count} previous failed attempt"
                    f"{'s' if failed_count != 1 else ''} for this position "
                    f"({MAX_RETRY_LIMIT - failed_count} remaining)."
                ),
            })

        return {
            "can_schedule": len(blocks) == 0,
            "blocks": blocks,
            "warnings": warnings,
            "cooldown_until": cooldown_until.isoformat() if cooldown_until else None,
            "retry_count": failed_count,
            "existing_interview": existing_interview,
        }

    # ── schedule_interview ───────────────────────────────────────────────────

    @staticmethod
    async def schedule_interview(
        db: AsyncIOMotorDatabase,
        interview_data: InterviewCreate,
        scheduled_by: str,
        *,
        company_id: str = "",
        company_name: str = "",
        scheduler_name: str = "",
    ) -> InterviewResponse:
        """Schedule a new interview. Builds a round array from the job's pipeline."""
        if not interview_data.application_id and not (interview_data.candidate_id and interview_data.job_id):
            raise HTTPException(status_code=400, detail="Either application_id or both candidate_id and job_id are required.")
        if not interview_data.scheduled_date:
            raise HTTPException(status_code=400, detail="Interview date is required.")
        if not interview_data.scheduled_time:
            raise HTTPException(status_code=400, detail="Interview time is required.")

        collection = db[InterviewService.COLLECTION]
        applications_collection = db["applications"]

        # ── Resolve candidate + job from application or direct ids ────────────
        if interview_data.application_id:
            application = await applications_collection.find_one(
                {"_id": interview_data.application_id, "is_deleted": False}
            )
            if not application:
                raise HTTPException(status_code=404, detail="Application not found")
            candidate_id = application["candidate_id"]
            job_id = application["job_id"]
            candidate_name = application.get("candidate_name")
            candidate_email = application.get("candidate_email")
            candidate_mobile = application.get("candidate_mobile")
            job_title = application.get("job_title")
            client_id = application.get("client_id")
            client_name = application.get("client_name")
        else:
            application = None
            candidate_id = interview_data.candidate_id
            job_id = interview_data.job_id
            cand = await db["candidates"].find_one({"_id": candidate_id, "is_deleted": False})
            if not cand:
                raise HTTPException(status_code=404, detail="Candidate not found")
            candidate_name = cand.get("full_name")
            candidate_email = cand.get("email")
            candidate_mobile = cand.get("mobile") or cand.get("phone")
            job_doc = await db["jobs"].find_one({"_id": job_id, "is_deleted": False})
            if not job_doc:
                raise HTTPException(status_code=404, detail="Job not found")
            job_title = job_doc.get("title")
            client_id = job_doc.get("client_id")
            client_name = job_doc.get("client_name")

        # Concluded applications cannot receive new interviews
        if application is not None:
            app_status = application.get("status")
            if app_status in ("rejected", "withdrawn", "joined", "offer_accepted", "offer_declined"):
                raise HTTPException(
                    status_code=400,
                    detail=f"Cannot schedule an interview: application status is '{app_status}'."
                )

        # Closed jobs cannot receive new interviews
        job_status_doc = await db["jobs"].find_one({"_id": job_id, "is_deleted": False}, {"status": 1})
        if job_status_doc and job_status_doc.get("status") == "closed":
            raise HTTPException(status_code=400, detail="Cannot schedule an interview for a closed job.")

        # Blacklist guard + full pre-flight validation (server-side enforcement)
        validation = await InterviewService.validate_scheduling(db, candidate_id, job_id)
        if not validation["can_schedule"]:
            first_block = validation["blocks"][0]
            status_code = 409 if first_block["code"] == "duplicate_active" else 422
            raise HTTPException(status_code=status_code, detail=first_block["message"])

        # ── Load pipeline stages ──────────────────────────────────────────────
        from app.services.pipeline_service import PipelineService

        pipeline_id = interview_data.pipeline_id
        pipeline_name = None
        pipeline_stages: List[Dict] = []

        if pipeline_id:
            try:
                pipeline_doc = await PipelineService.get_pipeline(db, pipeline_id)
                pipeline_name = pipeline_doc.name
                pipeline_stages = [
                    {"id": s.id, "stage_name": s.stage_name, "order": s.order}
                    for s in sorted(pipeline_doc.stages, key=lambda s: s.order)
                ]
            except HTTPException:
                pipeline_id = None

        if not pipeline_stages:
            stages = await PipelineService.get_stages_for_job(db, job_id)
            if stages:
                pipeline_stages = stages
                pipe_doc = await db["pipelines"].find_one({"job_id": job_id, "is_deleted": False})
                if not pipe_doc:
                    pipe_doc = await db["pipelines"].find_one({"is_default": True, "is_deleted": False})
                if pipe_doc:
                    pipeline_id = pipe_doc["_id"]
                    pipeline_name = pipe_doc.get("name")

        # ── Build rounds array ────────────────────────────────────────────────
        round1_date_str = interview_data.scheduled_date.strftime("%Y-%m-%d") if interview_data.scheduled_date else None
        round1_time_str = interview_data.scheduled_time

        if pipeline_stages:
            rounds = [
                {
                    "round_number": i + 1,
                    "round_name": stage.get("stage_name", f"Round {i + 1}"),
                    "round_type": stage.get("code") or stage.get("round_type"),
                    "scheduled_date": round1_date_str if i == 0 else None,
                    "scheduled_time": round1_time_str if i == 0 else None,
                    "result": "pending",
                    "feedback": "",
                    "completed_date": None,
                    "status": "active" if i == 0 else "pending",
                }
                for i, stage in enumerate(pipeline_stages)
            ]
            stage_id = pipeline_stages[0].get("id") or interview_data.stage_id
            stage_name = pipeline_stages[0].get("stage_name", "Round 1")
            stage_order = pipeline_stages[0].get("order", 1)
        else:
            rounds = [{
                "round_number": 1,
                "round_name": "Interview",
                "round_type": None,
                "scheduled_date": round1_date_str,
                "scheduled_time": round1_time_str,
                "result": "pending",
                "feedback": "",
                "completed_date": None,
                "status": "active",
            }]
            stage_id = interview_data.stage_id
            stage_name = "Interview"
            stage_order = 1

        # ── Interviewer names (optional) ──────────────────────────────────────
        users_collection = db["users"]
        user = await users_collection.find_one({"_id": scheduled_by})
        scheduled_by_name = user.get("full_name") if user else None

        interviewer_names = []
        if interview_data.interviewer_ids:
            interviewers = await users_collection.find(
                {"_id": {"$in": interview_data.interviewer_ids}}
            ).to_list(length=10)
            interviewer_names = [i.get("full_name") for i in interviewers]

        # Combine date + time
        scheduled_datetime = None
        if interview_data.scheduled_time and interview_data.scheduled_date:
            try:
                t = datetime.strptime(interview_data.scheduled_time, "%H:%M").time()
            except ValueError:
                t = datetime.strptime(interview_data.scheduled_time, "%I:%M %p").time()
            scheduled_datetime = datetime.combine(interview_data.scheduled_date, t)

        # ── Build document ────────────────────────────────────────────────────
        interview_dict = {
            "_id": str(ObjectId()),
            "application_id": interview_data.application_id or "",
            "candidate_id": candidate_id,
            "candidate_name": candidate_name,
            "candidate_email": candidate_email,
            "candidate_mobile": candidate_mobile,
            "job_id": job_id,
            "job_title": job_title,
            "client_id": client_id,
            "client_name": client_name,
            # Pipeline / rounds
            "pipeline_id": pipeline_id,
            "pipeline_name": pipeline_name,
            "rounds": rounds,
            "current_round_index": 0,
            "overall_status": "in_progress",
            # Legacy stage fields (for backward compat)
            "stage_id": stage_id,
            "stage_name": stage_name,
            "stage_order": stage_order,
            # Schedule
            "scheduled_date": _to_dt(interview_data.scheduled_date),
            "scheduled_time": interview_data.scheduled_time,
            "scheduled_datetime": scheduled_datetime,
            "duration_minutes": interview_data.duration_minutes,
            "interview_mode": interview_data.interview_mode,
            "venue": interview_data.venue,
            "address": interview_data.address,
            "meeting_link": interview_data.meeting_link,
            "assessment_link": interview_data.assessment_link,
            "dial_in_number": interview_data.dial_in_number,
            "interviewer_ids": interview_data.interviewer_ids,
            "interviewer_names": interviewer_names,
            "primary_interviewer": interview_data.primary_interviewer,
            "panel_size": len(interview_data.interviewer_ids),
            "status": InterviewStatus.SCHEDULED.value,
            "result": InterviewResult.PENDING.value,
            "instructions": interview_data.instructions,
            "internal_notes": interview_data.internal_notes,
            "scheduled_by": scheduled_by,
            "scheduled_by_name": scheduled_by_name,
            "created_by": scheduled_by,
            "created_at": datetime.now(timezone.utc),
            "is_deleted": False,
        }

        # Overlap check (only if interviewers provided)
        if scheduled_datetime and interview_data.interviewer_ids:
            new_end = scheduled_datetime + timedelta(minutes=interview_data.duration_minutes or 60)
            day_start = scheduled_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end = scheduled_datetime.replace(hour=23, minute=59, second=59, microsecond=999999)
            same_day = await collection.find({
                "interviewer_ids": {"$in": interview_data.interviewer_ids},
                "scheduled_datetime": {"$gte": day_start, "$lte": day_end},
                "status": {"$in": [
                    InterviewStatus.SCHEDULED.value,
                    InterviewStatus.CONFIRMED.value,
                    InterviewStatus.IN_PROGRESS.value,
                    InterviewStatus.RESCHEDULED.value,
                ]},
                "is_deleted": False,
            }).to_list(length=50)
            for existing_iv in same_day:
                iv_start = existing_iv.get("scheduled_datetime")
                iv_dur = existing_iv.get("duration_minutes") or 60
                if iv_start:
                    iv_end = iv_start + timedelta(minutes=iv_dur)
                    if scheduled_datetime < iv_end and new_end > iv_start:
                        t_str = existing_iv.get("scheduled_time", "")
                        d_str = iv_start.strftime("%d %b %Y")
                        raise HTTPException(
                            status_code=409,
                            detail=f"Scheduling conflict: one or more interviewers already have an interview on {d_str} at {t_str}. Please choose a different time slot."
                        )

        await collection.insert_one(interview_dict)

        # Update application status → "interview" (never downgrade an application
        # that is already past the interview stage, e.g. selected/offered)
        if interview_data.application_id:
            set_fields: Dict[str, Any] = {
                "current_stage": stage_id,
                "current_stage_name": stage_name,
            }
            if (application or {}).get("status") in (
                "applied", "eligible", "screening", "shortlisted",
                "interview", "next_round", "on_hold",
            ):
                set_fields["status"] = "interview"
            await applications_collection.update_one(
                {"_id": interview_data.application_id},
                {
                    "$inc": {"total_interviews": 1, "pending_interviews": 1},
                    "$set": set_fields,
                }
            )

        # Increment interview counter only — candidate status (active/blacklisted) is person-level
        # and must not be overwritten with pipeline-stage values like "interview"
        await db["candidates"].update_one(
            {"_id": candidate_id},
            {"$inc": {"total_interviews": 1}},
        )

        # Email notifications (best-effort)
        date_str = interview_data.scheduled_date.strftime("%d %b %Y") if interview_data.scheduled_date else ""
        mode = interview_dict.get("interview_mode", "")
        venue_or_link = interview_dict.get("meeting_link") or interview_dict.get("venue") or interview_dict.get("address") or ""

        if candidate_email and interview_data.send_notification:
            try:
                from app.services.email_service import send_interview_scheduled_email, _fire_email
                _fire_email(send_interview_scheduled_email(
                    to_email=candidate_email,
                    candidate_name=candidate_name or "",
                    job_title=job_title or "",
                    company_name=company_name,
                    interview_date=date_str,
                    interview_time=interview_data.scheduled_time or "",
                    interview_mode=mode,
                    venue_or_link=venue_or_link,
                    interviewer_names=interviewer_names,
                    duration_minutes=interview_data.duration_minutes or 60,
                    instructions=interview_data.instructions,
                    company_id=company_id,
                    assessment_link=interview_data.assessment_link,
                ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Interview candidate email failed: %s", _e)

        if interview_data.interviewer_ids:
            try:
                from app.services.email_service import send_interviewer_assigned_email, _fire_email
                ivs = await db["users"].find(
                    {"_id": {"$in": interview_data.interviewer_ids}, "email": {"$exists": True}},
                    {"_id": 1, "full_name": 1, "email": 1}
                ).to_list(length=20)
                for iv in ivs:
                    if iv.get("email"):
                        _fire_email(send_interviewer_assigned_email(
                            to_email=iv["email"],
                            interviewer_name=iv.get("full_name", ""),
                            candidate_name=candidate_name or "",
                            job_title=job_title or "",
                            company_name=company_name,
                            interview_date=date_str,
                            interview_time=interview_data.scheduled_time or "",
                            interview_mode=mode,
                            venue_or_link=venue_or_link,
                            duration_minutes=interview_data.duration_minutes or 60,
                            company_id=company_id,
                        ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Interviewer email failed: %s", _e)

        return await InterviewService.get_interview(db, interview_dict["_id"])

    # ── submit_round_result ──────────────────────────────────────────────────

    @staticmethod
    async def submit_round_result(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        result_data: RoundResultSubmit,
        submitted_by: str,
        company_id: str = "",
        company_name: str = "",
    ) -> InterviewResponse:
        """Submit result for the current active round and advance the pipeline."""
        collection = db[InterviewService.COLLECTION]

        interview = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")

        if interview.get("overall_status") in ("selected", "failed"):
            raise HTTPException(status_code=400, detail="Interview pipeline is already concluded.")

        rounds = interview.get("rounds", [])
        current_idx = interview.get("current_round_index", 0)

        if not rounds or current_idx >= len(rounds):
            raise HTTPException(status_code=400, detail="No active round found.")

        now = datetime.now(timezone.utc)

        # Mark current round as completed
        rounds[current_idx]["result"] = result_data.result
        rounds[current_idx]["feedback"] = result_data.feedback
        rounds[current_idx]["completed_date"] = now
        rounds[current_idx]["status"] = "completed"

        update_set: Dict[str, Any] = {
            "rounds": rounds,
            "updated_by": submitted_by,
            "updated_at": now,
        }

        app_status_update: Optional[str] = None

        if result_data.result == "passed":
            next_idx = current_idx + 1
            if next_idx < len(rounds):
                # Advance to next round
                rounds[next_idx]["status"] = "active"
                if result_data.next_round_date:
                    rounds[next_idx]["scheduled_date"] = result_data.next_round_date
                if result_data.next_round_time:
                    rounds[next_idx]["scheduled_time"] = result_data.next_round_time
                update_set["rounds"] = rounds
                update_set["current_round_index"] = next_idx
                update_set["overall_status"] = "in_progress"
                update_set["status"] = InterviewStatus.SCHEDULED.value
                update_set["stage_name"] = rounds[next_idx].get("round_name")
                if result_data.next_round_date:
                    try:
                        nd = datetime.strptime(result_data.next_round_date, "%Y-%m-%d").date()
                        update_set["scheduled_date"] = _to_dt(nd)
                    except ValueError:
                        pass
                if result_data.next_round_time:
                    update_set["scheduled_time"] = result_data.next_round_time
            else:
                # All rounds passed — select candidate
                update_set["overall_status"] = "selected"
                update_set["status"] = InterviewStatus.SELECTED.value
                update_set["result"] = InterviewResult.PASSED.value
                app_status_update = "selected"

                # Auto-create onboard record in "selected" state — offer not released yet
                if interview.get("application_id"):
                    try:
                        onboard_doc = {
                            "id": str(ObjectId()),
                            "company_id": company_id,
                            "candidate_id": interview["candidate_id"],
                            "candidate_name": interview.get("candidate_name"),
                            "candidate_email": interview.get("candidate_email"),
                            "candidate_mobile": interview.get("candidate_mobile"),
                            "application_id": interview.get("application_id", ""),
                            "interview_id": interview_id,
                            "job_id": interview["job_id"],
                            "job_title": interview.get("job_title"),
                            "client_id": interview.get("client_id") or "",
                            "client_name": interview.get("client_name"),
                            "offer_ctc": 0.0,
                            "offer_designation": "",
                            "offer_location": "",
                            "offer_released_date": None,
                            "status": "selected",
                            "days_at_client": 0,
                            "payout_days_required": 45,
                            "documents_required": [],
                            "documents": [],
                            "documents_verified": False,
                            "payout_eligible": False,
                            "status_history": [{
                                "from_status": None,
                                "to_status": "selected",
                                "changed_at": now,
                                "changed_by": submitted_by,
                                "notes": "Candidate selected after all interview rounds passed",
                            }],
                            "created_by": submitted_by,
                            "created_at": now,
                            "updated_at": now,
                            "is_deleted": False,
                        }
                        await db["onboards"].insert_one(onboard_doc)
                    except Exception as _e:
                        import logging as _log
                        _log.getLogger(__name__).warning("Auto-create onboard failed: %s", _e)

        elif result_data.result == "failed":
            update_set["overall_status"] = "failed"
            update_set["status"] = InterviewStatus.FAILED.value
            update_set["result"] = InterviewResult.FAILED.value
            rejection_reason = result_data.rejection_reason or None
            cooldown_days = COOLDOWN_DAYS.get(rejection_reason, DEFAULT_COOLDOWN_DAYS) if rejection_reason else DEFAULT_COOLDOWN_DAYS
            update_set["cooldown_until"] = now + timedelta(days=cooldown_days)
            update_set["rejection_reason"] = rejection_reason
            app_status_update = "rejected"

        elif result_data.result == "on_hold":
            update_set["overall_status"] = "on_hold"
            update_set["status"] = InterviewStatus.ON_HOLD.value

        await collection.update_one({"_id": interview_id}, {"$set": update_set})

        # Status update saved successfully — notify the candidate by email (opt-in,
        # never blocks the response, never sent if the update above failed).
        candidate_email = interview.get("candidate_email")
        if result_data.notify_email and candidate_email:
            status_label_map = {"passed": "shortlisted", "failed": "rejected", "on_hold": "on_hold"}
            if result_data.result == "passed" and update_set.get("overall_status") == "selected":
                status_label = "selected"
            else:
                status_label = status_label_map.get(result_data.result, result_data.result)
            try:
                from app.services.email_service import send_candidate_status_email, _fire_email
                _fire_email(send_candidate_status_email(
                    to_email=candidate_email,
                    candidate_name=interview.get("candidate_name") or "",
                    job_title=interview.get("job_title") or "",
                    company_name=company_name,
                    status_label=status_label,
                    company_id=company_id,
                    message=result_data.feedback or None,
                ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Interview status email failed: %s", _e)

        # Interview counters track interview records, not rounds: adjust them only
        # once, when the whole pipeline concludes (selected or failed).
        concluded = update_set.get("overall_status") in ("selected", "failed")
        if concluded and interview.get("application_id"):
            await db["applications"].update_one(
                {"_id": interview["application_id"]},
                {"$inc": {"completed_interviews": 1, "pending_interviews": -1}}
            )

        # Update application status via the single authoritative path so stage
        # history, rejection metadata, job stats and candidate stage stay consistent.
        if app_status_update and interview.get("application_id"):
            try:
                from app.services.application_service import ApplicationService
                from app.models.company.application import ApplicationStatusUpdate
                await ApplicationService.update_application_status(
                    db, interview["application_id"],
                    ApplicationStatusUpdate(
                        status=app_status_update,
                        rejection_reason="failed_interview" if app_status_update == "rejected" else None,
                        remarks=f"Interview round {current_idx + 1} result: {result_data.result}",
                    ),
                    submitted_by,
                )
            except HTTPException as exc:
                # Application already in a concluded state — keep the interview
                # result but do not overwrite the application's terminal status.
                import logging as _log
                _log.getLogger(__name__).warning(
                    "Application status update skipped after round result: %s", exc.detail
                )

        return await InterviewService.get_interview(db, interview_id)

    # ── get_interview ────────────────────────────────────────────────────────

    @staticmethod
    async def get_interview(db: AsyncIOMotorDatabase, interview_id: str) -> InterviewResponse:
        """Get interview by ID"""
        collection = db[InterviewService.COLLECTION]
        interview = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        return InterviewService._build_interview_response(interview)

    # ── list_interviews ──────────────────────────────────────────────────────

    @staticmethod
    async def list_interviews(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        application_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
        job_id: Optional[str] = None,
        status_filter: Optional[List[str]] = None,
        overall_status_filter: Optional[str] = None,
        interviewer_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None,
        current_user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """List interviews with filters"""
        collection = db[InterviewService.COLLECTION]

        query: Dict[str, Any] = {"is_deleted": False}

        # Access control: enforce hierarchy-based visibility (mirrors candidates/jobs/applications).
        if current_user and current_user.get("role") != "partner":
            from app.services.user_service import UserService
            user_svc = UserService(db)
            visible_ids = await user_svc.get_visible_user_ids(current_user, module_name="interviews")
            if visible_ids is not None:
                query["created_by"] = {"$in": visible_ids}

        if application_id:
            query["application_id"] = application_id
        if candidate_id:
            query["candidate_id"] = candidate_id
        if job_id:
            query["job_id"] = job_id
        if status_filter:
            query["status"] = {"$in": status_filter}
        if overall_status_filter:
            query["overall_status"] = overall_status_filter
        if interviewer_id:
            query["interviewer_ids"] = interviewer_id
        if date_from:
            query["scheduled_date"] = {"$gte": _to_dt(date_from)}
        if date_to:
            if "scheduled_date" in query:
                query["scheduled_date"]["$lte"] = _to_dt(date_to)
            else:
                query["scheduled_date"] = {"$lte": _to_dt(date_to)}

        skip = (page - 1) * page_size
        # Count and paginated fetch are independent reads — run them in
        # parallel to save one round-trip (same pattern as candidate_service).
        total, interviews = await asyncio.gather(
            collection.count_documents(query),
            collection.find(query)
                      .sort("scheduled_date", 1)
                      .skip(skip)
                      .limit(page_size)
                      .to_list(length=page_size)
        )

        result = [InterviewService._build_list_response(iv) for iv in interviews]

        return {
            "data": result,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            }
        }

    # ── reschedule_interview ─────────────────────────────────────────────────

    @staticmethod
    async def reschedule_interview(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        reschedule_data: InterviewReschedule,
        rescheduled_by: str,
        *,
        company_id: str = "",
        company_name: str = "",
    ) -> InterviewResponse:
        """Reschedule an interview"""
        collection = db[InterviewService.COLLECTION]

        existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview not found")

        if existing.get("status") in [InterviewStatus.COMPLETED.value, InterviewStatus.CANCELLED.value]:
            raise HTTPException(status_code=400, detail="Cannot reschedule completed or cancelled interview")

        reschedule_entry = {
            "from_date": existing.get("scheduled_date"),
            "to_date": _to_dt(reschedule_data.new_date),
            "reason": reschedule_data.reason,
            "rescheduled_by": rescheduled_by,
            "rescheduled_at": datetime.now(timezone.utc)
        }

        scheduled_datetime = None
        if reschedule_data.new_time:
            try:
                t = datetime.strptime(reschedule_data.new_time, "%H:%M").time()
            except ValueError:
                t = datetime.strptime(reschedule_data.new_time, "%I:%M %p").time()
            scheduled_datetime = datetime.combine(reschedule_data.new_date, t)

        await collection.update_one(
            {"_id": interview_id},
            {
                "$set": {
                    "scheduled_date": _to_dt(reschedule_data.new_date),
                    "scheduled_time": reschedule_data.new_time,
                    "scheduled_datetime": scheduled_datetime,
                    "status": InterviewStatus.RESCHEDULED.value,
                    "is_rescheduled": True,
                    "updated_by": rescheduled_by,
                    "updated_at": datetime.now(timezone.utc)
                },
                "$inc": {"reschedule_count": 1},
                "$push": {"reschedule_history": reschedule_entry}
            }
        )

        candidate_email = existing.get("candidate_email")
        if candidate_email:
            try:
                from app.services.email_service import send_interview_rescheduled_email, _fire_email
                mode = existing.get("interview_mode", "")
                venue_or_link = existing.get("meeting_link") or existing.get("venue") or existing.get("address") or ""
                _fire_email(send_interview_rescheduled_email(
                    to_email=candidate_email,
                    candidate_name=existing.get("candidate_name", ""),
                    job_title=existing.get("job_title", ""),
                    company_name=company_name,
                    new_date=reschedule_data.new_date.strftime("%d %b %Y") if reschedule_data.new_date else "",
                    new_time=reschedule_data.new_time or "",
                    interview_mode=mode,
                    venue_or_link=venue_or_link,
                    reason=reschedule_data.reason,
                    company_id=company_id,
                ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Reschedule email failed: %s", _e)

        return await InterviewService.get_interview(db, interview_id)

    # ── submit_feedback ──────────────────────────────────────────────────────

    @staticmethod
    async def submit_feedback(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        feedback_data: InterviewFeedbackSubmit,
        submitted_by: str
    ) -> InterviewResponse:
        """Submit interview feedback (legacy single-round path)"""
        collection = db[InterviewService.COLLECTION]

        existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview not found")

        if existing.get("feedback_submitted"):
            raise HTTPException(status_code=400, detail="Feedback has already been submitted for this interview.")
        if existing.get("status") == InterviewStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Cannot submit feedback for a cancelled interview.")

        users_collection = db["users"]
        user = await users_collection.find_one({"_id": submitted_by})
        user_name = user.get("full_name") if user else None

        feedback = {
            "overall_rating": feedback_data.overall_rating,
            "technical_skills": feedback_data.technical_skills,
            "communication": feedback_data.communication,
            "problem_solving": feedback_data.problem_solving,
            "cultural_fit": feedback_data.cultural_fit,
            "experience_relevance": feedback_data.experience_relevance,
            "skill_ratings": [s.model_dump() for s in feedback_data.skill_ratings],
            "result": feedback_data.result,
            "recommendation": feedback_data.recommendation,
            "strengths": feedback_data.strengths,
            "weaknesses": feedback_data.weaknesses,
            "remarks": feedback_data.remarks,
            "feedback_by": submitted_by,
            "feedback_by_name": user_name,
            "feedback_at": datetime.now(timezone.utc)
        }

        await collection.update_one(
            {"_id": interview_id},
            {
                "$set": {
                    "feedback": feedback,
                    "feedback_submitted": True,
                    "result": feedback_data.result,
                    "status": InterviewStatus.COMPLETED.value,
                    "updated_by": submitted_by,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        # Adjust counters only on the first transition into "completed"
        if existing.get("application_id") and existing.get("status") != InterviewStatus.COMPLETED.value:
            await db["applications"].update_one(
                {"_id": existing["application_id"]},
                {"$inc": {"completed_interviews": 1, "pending_interviews": -1}}
            )

        # Auto-reject if stage has auto_reject_on_fail
        stage_id = existing.get("stage_id")
        if stage_id:
            stage = await db["interview_stages"].find_one({"_id": stage_id})
            if (
                feedback_data.result == InterviewResult.FAILED.value
                and stage and stage.get("auto_reject_on_fail")
                and existing.get("application_id")
            ):
                from app.services.application_service import ApplicationService
                from app.models.company.application import ApplicationStatusUpdate
                await ApplicationService.update_application_status(
                    db, existing["application_id"],
                    ApplicationStatusUpdate(status="rejected", rejection_reason="failed_interview"),
                    submitted_by
                )

        return await InterviewService.get_interview(db, interview_id)

    # ── cancel_interview ─────────────────────────────────────────────────────

    @staticmethod
    async def cancel_interview(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        reason: str,
        cancelled_by: str
    ) -> InterviewResponse:
        """Cancel an interview"""
        collection = db[InterviewService.COLLECTION]

        existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview not found")

        if existing.get("status") == InterviewStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Interview is already cancelled.")
        if existing.get("overall_status") in ("selected", "failed") or existing.get("status") == InterviewStatus.COMPLETED.value:
            raise HTTPException(status_code=400, detail="Cannot cancel a concluded interview.")

        was_active = existing.get("status") in _ACTIVE_STATUSES

        await collection.update_one(
            {"_id": interview_id},
            {
                "$set": {
                    "status": InterviewStatus.CANCELLED.value,
                    "cancellation_reason": reason,
                    "cancelled_by": cancelled_by,
                    "cancelled_at": datetime.now(timezone.utc),
                    "updated_by": cancelled_by,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )

        # Decrement pending count only when the interview was actually pending
        if existing.get("application_id") and was_active:
            await db["applications"].update_one(
                {"_id": existing["application_id"]},
                {"$inc": {"pending_interviews": -1}}
            )

        return await InterviewService.get_interview(db, interview_id)

    # ── get_today_interviews ─────────────────────────────────────────────────

    @staticmethod
    async def get_today_interviews(db: AsyncIOMotorDatabase, user_id: Optional[str] = None) -> List[InterviewListResponse]:
        """Get today's interviews"""
        collection = db[InterviewService.COLLECTION]

        today = _to_dt(date.today())
        query: Dict[str, Any] = {
            "scheduled_date": today,
            "status": {"$in": [InterviewStatus.SCHEDULED.value, InterviewStatus.CONFIRMED.value]},
            "is_deleted": False
        }
        if user_id:
            query["interviewer_ids"] = user_id

        cursor = collection.find(query).sort("scheduled_time", 1)
        interviews = await cursor.to_list(length=50)
        return [InterviewService._build_list_response(iv) for iv in interviews]

    # ── get_pending_feedback ─────────────────────────────────────────────────

    @staticmethod
    async def get_pending_feedback(db: AsyncIOMotorDatabase, interviewer_id: str) -> List[InterviewListResponse]:
        """Get interviews pending feedback"""
        collection = db[InterviewService.COLLECTION]

        past_date = _to_dt(date.today() - timedelta(days=1))
        query = {
            "$or": [
                {
                    "interviewer_ids": interviewer_id,
                    "status": InterviewStatus.COMPLETED.value,
                    "feedback_submitted": False,
                    "is_deleted": False,
                },
                {
                    "interviewer_ids": interviewer_id,
                    "scheduled_date": {"$lt": past_date},
                    "feedback_submitted": False,
                    "status": {"$nin": [InterviewStatus.CANCELLED.value]},
                    "is_deleted": False,
                }
            ]
        }

        cursor = collection.find(query).sort("scheduled_date", -1)
        interviews = await cursor.to_list(length=50)
        return [InterviewService._build_list_response(iv) for iv in interviews]

    # ── get_dashboard_stats ──────────────────────────────────────────────────

    @staticmethod
    async def get_dashboard_stats(db: AsyncIOMotorDatabase, current_user: Optional[dict] = None, start_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get interview statistics.
        Uses the exact same visibility scoping as list_interviews so dashboard
        counts always match what the Interviews page shows for this user."""
        collection = db[InterviewService.COLLECTION]

        base_query: Dict[str, Any] = {"is_deleted": False}
        if start_date:
            base_query["created_at"] = {"$gte": start_date}
        if current_user and current_user.get("role") != "partner":
            from app.services.user_service import UserService
            user_svc = UserService(db)
            visible_ids = await user_svc.get_visible_user_ids(current_user, module_name="interviews")
            if visible_ids is not None:
                base_query["created_by"] = {"$in": visible_ids}

        today = _to_dt(date.today())
        today_d = date.today()
        week_start = _to_dt(today_d - timedelta(days=today_d.weekday()))
        week_end = _to_dt(today_d - timedelta(days=today_d.weekday()) + timedelta(days=6))

        status_pipeline = [{"$match": base_query}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        overall_pipeline = [{"$match": base_query}, {"$group": {"_id": "$overall_status", "count": {"$sum": 1}}}]

        # All 6 reads are independent of each other (same base_query, no shared
        # dependency) — run them concurrently instead of one-after-another.
        (
            total, status_counts, today_count, week_count, pending_feedback, overall_counts_raw,
        ) = await asyncio.gather(
            collection.count_documents(base_query),
            collection.aggregate(status_pipeline).to_list(length=20),
            collection.count_documents({**base_query, "scheduled_date": today}),
            collection.count_documents({
                **base_query,
                "scheduled_date": {"$gte": week_start, "$lte": week_end}
            }),
            collection.count_documents({
                **base_query,
                "feedback_submitted": False,
                "scheduled_date": {"$lt": today}
            }),
            collection.aggregate(overall_pipeline).to_list(length=20),
        )
        by_status = {item["_id"]: item["count"] for item in status_counts}
        by_overall = {item["_id"]: item["count"] for item in overall_counts_raw}

        return {
            "total": total,
            "by_status": by_status,
            "today": today_count,
            "this_week": week_count,
            "scheduled": by_overall.get("in_progress", 0),
            "selected": by_overall.get("selected", 0),
            "rejected": by_overall.get("failed", 0),
            "on_hold": by_overall.get("on_hold", 0),
            "completed": by_status.get("completed", 0),
            "cancelled": by_status.get("cancelled", 0),
            "pending_feedback": pending_feedback,
        }

    # ── get_selected_candidates ──────────────────────────────────────────────

    @staticmethod
    async def get_selected_candidates(db: AsyncIOMotorDatabase) -> List[Dict]:
        """Return interviews with overall_status=selected for the Release Offer dropdown."""
        collection = db[InterviewService.COLLECTION]
        cursor = collection.find(
            {"overall_status": "selected", "is_deleted": False},
            {
                "_id": 1, "candidate_id": 1, "candidate_name": 1,
                "candidate_email": 1, "candidate_mobile": 1,
                "application_id": 1, "job_id": 1, "job_title": 1,
                "client_id": 1, "client_name": 1,
            }
        ).sort("updated_at", -1)
        interviews = await cursor.to_list(length=200)
        return [
            {
                "interview_id": iv["_id"],
                "candidate_id": iv.get("candidate_id"),
                "candidate_name": iv.get("candidate_name"),
                "candidate_email": iv.get("candidate_email"),
                "candidate_mobile": iv.get("candidate_mobile"),
                "application_id": iv.get("application_id"),
                "job_id": iv.get("job_id"),
                "job_title": iv.get("job_title"),
                "client_id": iv.get("client_id"),
                "client_name": iv.get("client_name"),
            }
            for iv in interviews
        ]
