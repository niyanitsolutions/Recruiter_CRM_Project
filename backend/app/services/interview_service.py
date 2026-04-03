"""
Interview Service - Phase 3
Business logic for interview scheduling and feedback
"""
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
    InterviewResponse,
    InterviewListResponse,
    InterviewStatus,
    InterviewResult,
    get_interview_status_display,
    get_interview_mode_display,
    get_interview_result_display
)


class InterviewService:
    """Service for interview management"""
    
    COLLECTION = "interviews"
    
    @staticmethod
    async def schedule_interview(
        db: AsyncIOMotorDatabase,
        interview_data: InterviewCreate,
        scheduled_by: str
    ) -> InterviewResponse:
        """Schedule a new interview"""
        # ── Explicit business-logic validations ──────────────────────────────────
        if not interview_data.stage_id:
            raise HTTPException(status_code=400, detail="Interview stage is required. Configure a pipeline for this job in Interview Settings.")
        if not interview_data.interviewer_ids:
            raise HTTPException(status_code=400, detail="At least one interviewer must be selected.")
        if not interview_data.application_id and not (interview_data.candidate_id and interview_data.job_id):
            raise HTTPException(status_code=400, detail="Either application_id or both candidate_id and job_id are required.")
        if not interview_data.scheduled_date:
            raise HTTPException(status_code=400, detail="Interview date is required.")
        if not interview_data.scheduled_time:
            raise HTTPException(status_code=400, detail="Interview time is required.")

        collection = db[InterviewService.COLLECTION]
        applications_collection = db["applications"]

        # Resolve candidate + job info via application OR direct candidate_id + job_id
        if interview_data.application_id:
            application = await applications_collection.find_one({
                "_id": interview_data.application_id,
                "is_deleted": False
            })
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
            # Direct path from matching_results — no application required
            if not interview_data.candidate_id or not interview_data.job_id:
                raise HTTPException(
                    status_code=400,
                    detail="Either application_id or both candidate_id and job_id are required"
                )
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

        # Blacklist guard — must happen after candidate_id is resolved
        cand_doc = await db["candidates"].find_one({"_id": candidate_id}, {"status": 1})
        if cand_doc and cand_doc.get("status") == "blacklisted":
            raise HTTPException(
                status_code=400,
                detail="Blacklisted candidates cannot be scheduled for interviews."
            )

        # Get stage — prefer job's pipeline, fall back to global interview_stages
        stage = None
        if job_id:
            from app.services.pipeline_service import PipelineService
            pipeline_stages = await PipelineService.get_stages_for_job(db, job_id)
            stage = next((s for s in pipeline_stages if s.get("id") == interview_data.stage_id), None)
            if stage:
                # Normalise field names from pipeline stage to legacy shape
                stage = {
                    "_id": stage["id"],
                    "name": stage["stage_name"],
                    "stage_order": stage.get("order", 1),
                }
        if not stage:
            # Fall back to global interview_stages collection
            stages_collection = db["interview_stages"]
            stage = await stages_collection.find_one({"_id": interview_data.stage_id})
        if not stage:
            raise HTTPException(status_code=404, detail="Interview stage not found")
        
        # Get user name
        users_collection = db["users"]
        user = await users_collection.find_one({"_id": scheduled_by})
        scheduled_by_name = user.get("full_name") if user else None
        
        # Get interviewer names
        interviewer_names = []
        if interview_data.interviewer_ids:
            interviewers = await users_collection.find(
                {"_id": {"$in": interview_data.interviewer_ids}}
            ).to_list(length=10)
            interviewer_names = [i.get("full_name") for i in interviewers]
        
        # Combine date and time
        scheduled_datetime = None
        if interview_data.scheduled_time:
            try:
                # Try HH:MM (24-hour, from <input type="time">)
                t = datetime.strptime(interview_data.scheduled_time, "%H:%M").time()
            except ValueError:
                # Fall back to 12-hour with AM/PM
                t = datetime.strptime(interview_data.scheduled_time, "%I:%M %p").time()
            scheduled_datetime = datetime.combine(interview_data.scheduled_date, t)

        # Prepare document — uses resolved variables (candidate_id, job_id, etc.)
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
            "stage_id": interview_data.stage_id,
            "stage_name": stage.get("name"),
            "stage_order": stage.get("stage_order", 1),
            "scheduled_date": _to_dt(interview_data.scheduled_date),
            "scheduled_time": interview_data.scheduled_time,
            "scheduled_datetime": scheduled_datetime,
            "duration_minutes": interview_data.duration_minutes,
            "interview_mode": interview_data.interview_mode,
            "venue": interview_data.venue,
            "address": interview_data.address,
            "meeting_link": interview_data.meeting_link,
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
            "is_deleted": False
        }

        # ── Overlap validation — prevent double-booking interviewers ────────────
        if scheduled_datetime and interview_data.interviewer_ids:
            new_end = scheduled_datetime + timedelta(minutes=interview_data.duration_minutes or 60)
            # Fetch same-day interviews for these interviewers
            day_start = scheduled_datetime.replace(hour=0, minute=0, second=0, microsecond=0)
            day_end   = scheduled_datetime.replace(hour=23, minute=59, second=59, microsecond=999999)
            same_day = await collection.find({
                "interviewer_ids": {"$in": interview_data.interviewer_ids},
                "scheduled_datetime": {"$gte": day_start, "$lte": day_end},
                "status": {"$in": [InterviewStatus.SCHEDULED.value, InterviewStatus.IN_PROGRESS.value]},
                "is_deleted": False,
            }).to_list(length=50)
            for existing_iv in same_day:
                iv_start = existing_iv.get("scheduled_datetime")
                iv_dur   = existing_iv.get("duration_minutes") or 60
                if iv_start:
                    iv_end = iv_start + timedelta(minutes=iv_dur)
                    # Overlap: new starts before existing ends AND new ends after existing starts
                    if scheduled_datetime < iv_end and new_end > iv_start:
                        t = existing_iv.get("scheduled_time", "")
                        d = iv_start.strftime("%d %b %Y")
                        raise HTTPException(
                            status_code=409,
                            detail=f"Scheduling conflict: one or more interviewers already have an interview on {d} at {t}. Please choose a different time slot."
                        )

        await collection.insert_one(interview_dict)

        # Update application interview count (only when scheduled via application)
        if interview_data.application_id:
            await applications_collection.update_one(
                {"_id": interview_data.application_id},
                {
                    "$inc": {"total_interviews": 1, "pending_interviews": 1},
                    "$set": {
                        "status": "interview",
                        "current_stage": interview_data.stage_id,
                        "current_stage_name": stage.get("name")
                    }
                }
            )

        # Update candidate interview count
        candidates_collection = db["candidates"]
        await candidates_collection.update_one(
            {"_id": candidate_id},
            {
                "$inc": {"total_interviews": 1},
                "$set": {"status": "interview", "current_stage": stage.get("name")}
            }
        )

        return await InterviewService.get_interview(db, interview_dict["_id"])
    
    @staticmethod
    async def get_interview(db: AsyncIOMotorDatabase, interview_id: str) -> InterviewResponse:
        """Get interview by ID"""
        collection = db[InterviewService.COLLECTION]
        
        interview = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        
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
            stage_id=interview["stage_id"],
            stage_name=interview.get("stage_name"),
            stage_order=interview.get("stage_order", 1),
            scheduled_date=interview["scheduled_date"],
            scheduled_time=interview.get("scheduled_time"),
            duration_minutes=interview.get("duration_minutes", 60),
            interview_mode=interview.get("interview_mode", "video"),
            interview_mode_display=get_interview_mode_display(interview.get("interview_mode", "video")),
            venue=interview.get("venue"),
            meeting_link=interview.get("meeting_link"),
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
            created_at=interview["created_at"]
        )
    
    @staticmethod
    async def list_interviews(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        application_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
        job_id: Optional[str] = None,
        status_filter: Optional[List[str]] = None,
        interviewer_id: Optional[str] = None,
        date_from: Optional[date] = None,
        date_to: Optional[date] = None
    ) -> Dict[str, Any]:
        """List interviews with filters"""
        collection = db[InterviewService.COLLECTION]
        
        query = {"is_deleted": False}
        
        if application_id:
            query["application_id"] = application_id
        if candidate_id:
            query["candidate_id"] = candidate_id
        if job_id:
            query["job_id"] = job_id
        if status_filter:
            query["status"] = {"$in": status_filter}
        if interviewer_id:
            query["interviewer_ids"] = interviewer_id
        if date_from:
            query["scheduled_date"] = {"$gte": _to_dt(date_from)}
        if date_to:
            if "scheduled_date" in query:
                query["scheduled_date"]["$lte"] = _to_dt(date_to)
            else:
                query["scheduled_date"] = {"$lte": _to_dt(date_to)}
        
        total = await collection.count_documents(query)
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("scheduled_date", 1).skip(skip).limit(page_size)
        interviews = await cursor.to_list(length=page_size)
        
        result = []
        for interview in interviews:
            result.append(InterviewListResponse(
                id=interview["_id"],
                candidate_name=interview.get("candidate_name"),
                job_title=interview.get("job_title"),
                client_name=interview.get("client_name"),
                stage_name=interview.get("stage_name"),
                scheduled_date=interview["scheduled_date"],
                scheduled_time=interview.get("scheduled_time"),
                interview_mode=interview.get("interview_mode", "video"),
                interviewer_names=interview.get("interviewer_names", []),
                status=interview.get("status", "scheduled"),
                status_display=get_interview_status_display(interview.get("status", "scheduled")),
                result=interview.get("result", "pending"),
                feedback_submitted=interview.get("feedback_submitted", False),
                is_rescheduled=interview.get("is_rescheduled", False)
            ))
        
        return {
            "data": result,
            "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
        }
    
    @staticmethod
    async def reschedule_interview(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        reschedule_data: InterviewReschedule,
        rescheduled_by: str
    ) -> InterviewResponse:
        """Reschedule an interview"""
        collection = db[InterviewService.COLLECTION]
        
        existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview not found")
        
        if existing.get("status") in [InterviewStatus.COMPLETED.value, InterviewStatus.CANCELLED.value]:
            raise HTTPException(status_code=400, detail="Cannot reschedule completed or cancelled interview")
        
        # Add to reschedule history
        reschedule_entry = {
            "from_date": existing["scheduled_date"],  # already datetime in DB
            "to_date": _to_dt(reschedule_data.new_date),
            "reason": reschedule_data.reason,
            "rescheduled_by": rescheduled_by,
            "rescheduled_at": datetime.now(timezone.utc)
        }
        
        # Combine date and time
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
        
        return await InterviewService.get_interview(db, interview_id)
    
    @staticmethod
    async def submit_feedback(
        db: AsyncIOMotorDatabase,
        interview_id: str,
        feedback_data: InterviewFeedbackSubmit,
        submitted_by: str
    ) -> InterviewResponse:
        """Submit interview feedback"""
        collection = db[InterviewService.COLLECTION]
        
        existing = await collection.find_one({"_id": interview_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Interview not found")
        
        # Get user name
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
        
        # Update application interview counts (only if linked to an application)
        if existing.get("application_id"):
            applications_collection = db["applications"]
            await applications_collection.update_one(
                {"_id": existing["application_id"]},
                {
                    "$inc": {"completed_interviews": 1, "pending_interviews": -1}
                }
            )

        # Auto-reject if failed and stage has auto_reject_on_fail
        stages_collection = db["interview_stages"]
        stage = await stages_collection.find_one({"_id": existing["stage_id"]})

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
        
        # Update application interview counts (only if linked to an application)
        if existing.get("application_id"):
            applications_collection = db["applications"]
            await applications_collection.update_one(
                {"_id": existing["application_id"]},
                {"$inc": {"pending_interviews": -1}}
            )
        
        return await InterviewService.get_interview(db, interview_id)
    
    @staticmethod
    async def get_today_interviews(db: AsyncIOMotorDatabase, user_id: Optional[str] = None) -> List[InterviewListResponse]:
        """Get today's interviews"""
        collection = db[InterviewService.COLLECTION]
        
        today = _to_dt(date.today())
        query = {
            "scheduled_date": today,
            "status": {"$in": [InterviewStatus.SCHEDULED.value, InterviewStatus.CONFIRMED.value]},
            "is_deleted": False
        }
        
        if user_id:
            query["interviewer_ids"] = user_id
        
        cursor = collection.find(query).sort("scheduled_time", 1)
        interviews = await cursor.to_list(length=50)
        
        result = []
        for interview in interviews:
            result.append(InterviewListResponse(
                id=interview["_id"],
                candidate_name=interview.get("candidate_name"),
                job_title=interview.get("job_title"),
                client_name=interview.get("client_name"),
                stage_name=interview.get("stage_name"),
                scheduled_date=interview["scheduled_date"],
                scheduled_time=interview.get("scheduled_time"),
                interview_mode=interview.get("interview_mode", "video"),
                interviewer_names=interview.get("interviewer_names", []),
                status=interview.get("status", "scheduled"),
                status_display=get_interview_status_display(interview.get("status", "scheduled")),
                result=interview.get("result", "pending"),
                feedback_submitted=interview.get("feedback_submitted", False),
                is_rescheduled=interview.get("is_rescheduled", False)
            ))
        
        return result
    
    @staticmethod
    async def get_pending_feedback(db: AsyncIOMotorDatabase, interviewer_id: str) -> List[InterviewListResponse]:
        """Get interviews pending feedback"""
        collection = db[InterviewService.COLLECTION]
        
        query = {
            "interviewer_ids": interviewer_id,
            "status": InterviewStatus.COMPLETED.value,
            "feedback_submitted": False,
            "is_deleted": False
        }
        
        # Or past scheduled date without feedback
        past_date = _to_dt(date.today() - timedelta(days=1))
        query_alt = {
            "interviewer_ids": interviewer_id,
            "scheduled_date": {"$lt": past_date},
            "feedback_submitted": False,
            "status": {"$nin": [InterviewStatus.CANCELLED.value]},
            "is_deleted": False
        }
        
        cursor = collection.find({"$or": [query, query_alt]}).sort("scheduled_date", -1)
        interviews = await cursor.to_list(length=50)
        
        result = []
        for interview in interviews:
            result.append(InterviewListResponse(
                id=interview["_id"],
                candidate_name=interview.get("candidate_name"),
                job_title=interview.get("job_title"),
                client_name=interview.get("client_name"),
                stage_name=interview.get("stage_name"),
                scheduled_date=interview["scheduled_date"],
                scheduled_time=interview.get("scheduled_time"),
                interview_mode=interview.get("interview_mode", "video"),
                interviewer_names=interview.get("interviewer_names", []),
                status=interview.get("status", "scheduled"),
                status_display=get_interview_status_display(interview.get("status", "scheduled")),
                result=interview.get("result", "pending"),
                feedback_submitted=False,
                is_rescheduled=interview.get("is_rescheduled", False)
            ))
        
        return result
    
    @staticmethod
    async def get_dashboard_stats(db: AsyncIOMotorDatabase, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get interview statistics"""
        collection = db[InterviewService.COLLECTION]
        
        base_query = {"is_deleted": False}
        if user_id:
            base_query["interviewer_ids"] = user_id
        
        total = await collection.count_documents(base_query)
        
        # By status
        pipeline = [{"$match": base_query}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_counts = await collection.aggregate(pipeline).to_list(length=20)
        by_status = {item["_id"]: item["count"] for item in status_counts}
        
        # Today's count
        today = _to_dt(date.today())
        today_count = await collection.count_documents({**base_query, "scheduled_date": today})

        # This week
        today_d = date.today()
        week_start = _to_dt(today_d - timedelta(days=today_d.weekday()))
        week_end = _to_dt(today_d - timedelta(days=today_d.weekday()) + timedelta(days=6))
        week_count = await collection.count_documents({
            **base_query,
            "scheduled_date": {"$gte": week_start, "$lte": week_end}
        })

        # Pending feedback
        pending_feedback = await collection.count_documents({
            **base_query,
            "feedback_submitted": False,
            "scheduled_date": {"$lt": today}
        })
        
        return {
            "total": total,
            "by_status": by_status,
            "today": today_count,
            "this_week": week_count,
            "scheduled": by_status.get("scheduled", 0),
            "completed": by_status.get("completed", 0),
            "cancelled": by_status.get("cancelled", 0),
            "pending_feedback": pending_feedback
        }