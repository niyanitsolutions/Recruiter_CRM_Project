"""
Application Service - Phase 3
Business logic for candidate applications (Candidate-Job mapping)
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException

from app.models.company.application import (
    ApplicationCreate,
    ApplicationStatusUpdate,
    ApplicationResponse,
    ApplicationListResponse,
    ApplicationStatus,
    get_application_status_display,
    is_valid_status_transition
)
from app.services.audit_service import AuditService


class ApplicationService:
    """Service for application management"""
    
    COLLECTION = "applications"
    
    @staticmethod
    async def create_application(
        db: AsyncIOMotorDatabase,
        application_data: ApplicationCreate,
        created_by: str,
        partner_id: Optional[str] = None,
        company_id: Optional[str] = None
    ) -> ApplicationResponse:
        """Create a new application (apply candidate to job)"""
        collection = db[ApplicationService.COLLECTION]
        
        # Get candidate
        candidates_collection = db["candidates"]
        candidate = await candidates_collection.find_one({
            "_id": application_data.candidate_id,
            "is_deleted": False
        })
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")

        # Blacklist guard — blocked at the person level
        if candidate.get("status") == "blacklisted":
            raise HTTPException(
                status_code=400,
                detail="Blacklisted candidates cannot apply to jobs."
            )

        # Get job
        jobs_collection = db["jobs"]
        job = await jobs_collection.find_one({
            "_id": application_data.job_id,
            "is_deleted": False
        })
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        # Check if job is open
        if job.get("status") != "open":
            raise HTTPException(status_code=400, detail="Job is not open for applications")
        
        # Check for existing application
        existing = await collection.find_one({
            "candidate_id": application_data.candidate_id,
            "job_id": application_data.job_id,
            "is_deleted": False
        })
        if existing:
            raise HTTPException(status_code=400, detail="Candidate has already applied for this job")
        
        # Get user name
        users_collection = db["users"]
        user = await users_collection.find_one({"_id": created_by})
        applied_by_name = user.get("full_name") if user else None
        
        # Partner info
        partner_name = None
        if partner_id:
            partner = await users_collection.find_one({"_id": partner_id})
            partner_name = partner.get("full_name") if partner else None
        
        # Run centralized evaluation — single source of truth for all modules
        from app.services.matching_service import MatchingService
        evaluation = MatchingService.evaluate_dicts(job, candidate)

        # ---- ATS Eligibility Gate (uses centralized evaluation only) ----
        initial_status = ApplicationStatus.APPLIED.value
        rejection_reason = None
        rejected_at_val = None
        rejected_by_val = None

        if not getattr(application_data, "bypass_eligibility", False):
            # Authoritative verdict is evaluation["eligible"] (final_score >= minimum_match_score).
            # rejection_reasons may list informational sub-criteria (e.g. partially missing
            # skills) even when the candidate clears the overall threshold — those alone
            # must not flip a passing candidate to "rejected".
            if not evaluation["eligible"]:
                reasons = evaluation["rejection_reasons"]
                initial_status = ApplicationStatus.REJECTED.value
                rejection_reason = "; ".join(reasons) if reasons else (
                    f"Match score {evaluation['final_score']}% below minimum "
                    f"threshold {evaluation['minimum_match_score']}%"
                )
                rejected_at_val = datetime.now(timezone.utc)
                rejected_by_val = "system"
            else:
                initial_status = ApplicationStatus.ELIGIBLE.value

        # Prepare document
        app_dict = {
            "_id": str(ObjectId()),
            "candidate_id": application_data.candidate_id,
            "candidate_name": candidate.get("full_name"),
            "candidate_email": candidate.get("email"),
            "candidate_mobile": candidate.get("mobile"),
            "job_id": application_data.job_id,
            "job_title": job.get("title"),
            "job_code": job.get("job_code"),
            "client_id": job.get("client_id"),
            "client_name": job.get("client_name"),
            "company_id": job.get("company_id", ""),
            "applied_by": created_by,
            "applied_by_name": applied_by_name,
            "source": application_data.source or ("partner" if partner_id else "direct"),
            "partner_id": partner_id,
            "partner_name": partner_name,
            "status": initial_status,
            "rejection_reason": rejection_reason,
            "rejected_at": rejected_at_val,
            "rejected_by": rejected_by_val,
            "rejected_at_stage": "applied" if rejection_reason else None,
            "stage_history": [{
                "from_stage": None,
                "to_stage": initial_status,
                "changed_by": created_by,
                "changed_by_name": applied_by_name,
                "changed_at": datetime.now(timezone.utc),
                "remarks": rejection_reason or "Application created"
            }],
            "eligibility_score": evaluation.get("final_score"),
            "eligibility_details": evaluation,
            "eligibility_reason": (
                "; ".join(evaluation.get("rejection_reasons", []))
                if evaluation.get("rejection_reasons")
                else "Eligible"
            ),
            "matching_breakdown": evaluation,
            "notes": application_data.notes,
            "applied_at": datetime.now(timezone.utc),
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc),
            "is_deleted": False
        }
        
        try:
            await collection.insert_one(app_dict)
        except Exception as exc:
            # Unique index (candidate_id + job_id, active docs) guards against
            # duplicate applications created by concurrent requests.
            if "duplicate key" in str(exc).lower():
                raise HTTPException(status_code=400, detail="Candidate has already applied for this job")
            raise

        # Update job stats and candidate tracking (non-critical — don't fail the response)
        try:
            from app.services.job_service import JobService
            await JobService.update_job_stats(db, application_data.job_id)
        except Exception:
            pass

        try:
            await candidates_collection.update_one(
                {"_id": application_data.candidate_id},
                {
                    "$inc": {"total_applications": 1},
                    "$set": {
                        "current_job_id": application_data.job_id,
                        "current_job_title": job.get("title"),
                        "current_stage": initial_status
                    }
                }
            )
        except Exception:
            pass

        try:
            await AuditService(db).log(
                action="create", entity_type="application",
                entity_id=app_dict["_id"],
                entity_name=f"{candidate.get('full_name')} - {job.get('title')}",
                user_id=created_by, user_name="", user_role="",
                description=f"Application created for {candidate.get('full_name')}",
                new_value={"candidate": candidate.get("full_name"), "job": job.get("title")},
            )
        except Exception:
            pass

        # Dashboard "Applications"/"Offers Pending" counts are Redis-cached
        # (5 min TTL) with no invalidation hook — bust it now so the dashboard
        # reflects this application immediately instead of after the cache
        # naturally expires. Prefer the caller-supplied company_id (from the
        # authenticated request) over the job doc's field — older job records
        # can have a null/missing company_id and would otherwise silently
        # skip invalidation.
        try:
            from app.core.redis import invalidate_dashboard_cache
            await invalidate_dashboard_cache(company_id or job.get("company_id") or "")
        except Exception:
            pass

        return await ApplicationService.get_application(db, app_dict["_id"])
    
    @staticmethod
    async def get_application(db: AsyncIOMotorDatabase, application_id: str) -> ApplicationResponse:
        """Get application by ID"""
        collection = db[ApplicationService.COLLECTION]
        
        app = await collection.find_one({"_id": application_id, "is_deleted": False})
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")
        
        return ApplicationResponse(
            id=app["_id"],
            candidate_id=app["candidate_id"],
            candidate_name=app.get("candidate_name"),
            candidate_email=app.get("candidate_email"),
            candidate_mobile=app.get("candidate_mobile"),
            job_id=app["job_id"],
            job_title=app.get("job_title"),
            job_code=app.get("job_code"),
            client_name=app.get("client_name"),
            source=app.get("source"),
            partner_name=app.get("partner_name"),
            status=app.get("status", "applied"),
            status_display=get_application_status_display(app.get("status", "applied")),
            current_stage=app.get("current_stage"),
            current_stage_name=app.get("current_stage_name"),
            stage_history=app.get("stage_history", []),
            total_interviews=app.get("total_interviews", 0),
            completed_interviews=app.get("completed_interviews", 0),
            pending_interviews=app.get("pending_interviews", 0),
            offered_ctc=app.get("offered_ctc"),
            offer_date=app.get("offer_date"),
            expected_joining_date=app.get("expected_joining_date"),
            actual_joining_date=app.get("actual_joining_date"),
            rejection_reason=app.get("rejection_reason"),
            rejection_remarks=app.get("rejection_remarks"),
            assigned_to=app.get("assigned_to"),
            assigned_to_name=app.get("assigned_to_name"),
            partner_id=app.get("partner_id"),
            created_by=app.get("created_by"),
            eligibility_score=app.get("eligibility_score"),
            eligibility_reason=app.get("eligibility_reason"),
            matching_breakdown=app.get("matching_breakdown") or app.get("eligibility_details"),
            applied_at=app["applied_at"],
            status_changed_at=app.get("status_changed_at")
        )
    
    @staticmethod
    async def list_applications(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        job_id: Optional[str] = None,
        candidate_id: Optional[str] = None,
        status_filter: Optional[List[str]] = None,
        partner_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        keyword: Optional[str] = None,
        current_user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """List applications with filters"""
        collection = db[ApplicationService.COLLECTION]

        query = {"is_deleted": False}

        # Access control: enforce hierarchy-based visibility (mirrors candidates/jobs).
        # Partners are scoped via the explicit partner_id filter passed in by the caller.
        if current_user and current_user.get("role") != "partner":
            from app.services.user_service import UserService
            user_svc = UserService(db)
            visible_ids = await user_svc.get_visible_user_ids(current_user, module_name="applications")
            if visible_ids is not None:
                query["created_by"] = {"$in": visible_ids}

        if job_id:
            query["job_id"] = job_id
        if candidate_id:
            query["candidate_id"] = candidate_id
        if status_filter:
            query["status"] = {"$in": status_filter}
        if partner_id:
            query["partner_id"] = partner_id
        if assigned_to:
            query["assigned_to"] = assigned_to
        if keyword:
            import re
            pattern = re.compile(re.escape(keyword.strip()), re.IGNORECASE)
            query["$or"] = [
                {"candidate_name": {"$regex": pattern}},
                {"candidate_email": {"$regex": pattern}},
                {"job_title": {"$regex": pattern}},
                {"client_name": {"$regex": pattern}},
            ]
        
        total = await collection.count_documents(query)
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("applied_at", -1).skip(skip).limit(page_size)
        applications = await cursor.to_list(length=page_size)

        # Fetch interview records for all applications in one query
        app_ids = [app["_id"] for app in applications]
        interviews_cursor = db["interviews"].find(
            {"application_id": {"$in": app_ids}, "is_deleted": False}
        )
        interviews_list = await interviews_cursor.to_list(length=len(app_ids))
        interview_by_app = {iv["application_id"]: iv for iv in interviews_list}

        result = []
        for app in applications:
            # Dynamically derive current stage from interview rounds
            interview = interview_by_app.get(app["_id"])
            dynamic_stage_name = None
            if interview:
                rounds = interview.get("rounds", [])
                idx = interview.get("current_round_index", 0)
                if rounds and idx < len(rounds):
                    dynamic_stage_name = rounds[idx].get("round_name")

            result.append(ApplicationListResponse(
                id=app["_id"],
                candidate_id=app["candidate_id"],
                candidate_name=app.get("candidate_name"),
                candidate_email=app.get("candidate_email"),
                job_id=app["job_id"],
                job_title=app.get("job_title"),
                client_name=app.get("client_name"),
                source=app.get("source"),
                partner_name=app.get("partner_name"),
                status=app.get("status", "applied"),
                status_display=get_application_status_display(app.get("status", "applied")),
                current_stage_name=dynamic_stage_name or app.get("current_stage_name"),
                total_interviews=app.get("total_interviews", 0),
                eligibility_score=app.get("eligibility_score"),
                assigned_to_name=app.get("assigned_to_name"),
                applied_at=app["applied_at"],
                status_changed_at=app.get("status_changed_at")
            ))
        
        return {
            "data": result,
            "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
        }

    @staticmethod
    async def get_eligible_jobs_for_candidate(
        db: AsyncIOMotorDatabase,
        candidate_id: str
    ) -> List[Dict[str, Any]]:
        """Return all open jobs with eligibility scores for a candidate (scoped to tenant DB)."""
        candidate = await db["candidates"].find_one({"_id": candidate_id, "is_deleted": False})
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        if candidate.get("status") == "blacklisted":
            raise HTTPException(status_code=400, detail="Blacklisted candidates cannot apply.")

        # Fetch up to 50 open jobs (most recent first)
        jobs_cursor = db["jobs"].find(
            {"status": "open", "is_deleted": False}
        ).sort("created_at", -1).limit(50)
        jobs = await jobs_cursor.to_list(length=50)

        # Which jobs has this candidate already applied to?
        existing_job_ids = set(await db["applications"].distinct(
            "job_id", {"candidate_id": candidate_id, "is_deleted": False}
        ))

        from app.services.matching_service import MatchingService
        results = []
        for job in jobs:
            # Candidate and job docs are already loaded — evaluate in-memory
            # instead of re-fetching both per job (was 2 extra queries per job).
            ev = MatchingService.evaluate_dicts(job, candidate)
            elig = {"score": ev["final_score"], "eligible": ev["eligible"], "issues": ev["rejection_reasons"]}
            results.append({
                "job_id":          job["_id"],
                "job_title":       job.get("title"),
                "job_code":        job.get("job_code"),
                "client_name":     job.get("client_name"),
                "location":        job.get("location"),
                "score":           elig.get("score", 0),
                "eligible":        elig.get("eligible", False),
                "issues":          elig.get("issues", []),
                "already_applied": job["_id"] in existing_job_ids,
            })

        # Eligible jobs first, then by score descending
        results.sort(key=lambda x: (-int(x["eligible"]), -x["score"]))
        return results

    @staticmethod
    async def update_application_status(
        db: AsyncIOMotorDatabase,
        application_id: str,
        status_update: ApplicationStatusUpdate,
        updated_by: str
    ) -> ApplicationResponse:
        """Update application status"""
        collection = db[ApplicationService.COLLECTION]
        
        existing = await collection.find_one({"_id": application_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Application not found")
        
        old_status = existing.get("status")
        new_status = status_update.status

        # Enforce the application state machine: reject unknown statuses and
        # invalid jumps out of concluded states (joined/rejected/withdrawn/offer_declined).
        ok, err = is_valid_status_transition(old_status, new_status)
        if not ok:
            raise HTTPException(status_code=400, detail=err)
        if old_status == new_status:
            return await ApplicationService.get_application(db, application_id)

        # Get user name
        users_collection = db["users"]
        user = await users_collection.find_one({"_id": updated_by})
        user_name = user.get("full_name") if user else None
        
        # Add to stage history
        stage_entry = {
            "from_stage": old_status,
            "to_stage": new_status,
            "changed_by": updated_by,
            "changed_by_name": user_name,
            "changed_at": datetime.now(timezone.utc),
            "remarks": status_update.remarks
        }
        
        update_data = {
            "status": new_status,
            "status_changed_at": datetime.now(timezone.utc),
            "updated_by": updated_by,
            "updated_at": datetime.now(timezone.utc)
        }
        
        if status_update.stage_id:
            # Get stage name
            stages_collection = db["interview_stages"]
            stage = await stages_collection.find_one({"_id": status_update.stage_id})
            update_data["current_stage"] = status_update.stage_id
            update_data["current_stage_name"] = stage.get("name") if stage else None
        
        # Handle rejection
        if new_status == ApplicationStatus.REJECTED.value:
            update_data["rejection_reason"] = status_update.rejection_reason
            update_data["rejected_at"] = datetime.now(timezone.utc)
            update_data["rejected_by"] = updated_by
            update_data["rejected_at_stage"] = old_status
        
        # Handle offer
        if new_status == ApplicationStatus.OFFERED.value:
            if status_update.offered_ctc:
                update_data["offered_ctc"] = status_update.offered_ctc
            if status_update.offered_designation:
                update_data["offered_designation"] = status_update.offered_designation
            update_data["offer_date"] = datetime.now(timezone.utc)
        
        # Handle joining
        if new_status == ApplicationStatus.JOINED.value:
            update_data["actual_joining_date"] = status_update.actual_joining_date or datetime.now(timezone.utc)

        # Handle withdrawal
        if new_status == ApplicationStatus.WITHDRAWN.value:
            update_data["withdrawal_reason"] = status_update.remarks or status_update.rejection_reason
            update_data["withdrawn_at"] = datetime.now(timezone.utc)

        await collection.update_one(
            {"_id": application_id},
            {
                "$set": update_data,
                "$push": {"stage_history": stage_entry}
            }
        )
        
        # Withdrawal/rejection mid-interview: cancel any still-active interviews
        # for this application so the pipeline holds no live interviews for a
        # concluded application (non-critical — don't fail the response).
        if new_status in (ApplicationStatus.WITHDRAWN.value, ApplicationStatus.REJECTED.value):
            try:
                now_dt = datetime.now(timezone.utc)
                res = await db["interviews"].update_many(
                    {
                        "application_id": application_id,
                        "status": {"$in": ["scheduled", "confirmed", "in_progress", "rescheduled", "on_hold"]},
                        "is_deleted": False,
                    },
                    {"$set": {
                        "status": "cancelled",
                        "cancellation_reason": f"Application {new_status}",
                        "cancelled_by": updated_by,
                        "cancelled_at": now_dt,
                        "updated_at": now_dt,
                    }}
                )
                if res.modified_count:
                    await collection.update_one(
                        {"_id": application_id},
                        {"$inc": {"pending_interviews": -res.modified_count}}
                    )
            except Exception:
                pass

        # Update job stats and candidate tracking (non-critical — don't fail the response)
        try:
            from app.services.job_service import JobService
            await JobService.update_job_stats(db, existing["job_id"])
        except Exception:
            pass

        try:
            candidates_collection = db["candidates"]
            await candidates_collection.update_one(
                {"_id": existing["candidate_id"]},
                {"$set": {"current_stage": new_status}}
            )
        except Exception:
            pass

        try:
            await AuditService(db).log(
                action="status_change", entity_type="application",
                entity_id=application_id,
                entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
                user_id=updated_by, user_name="", user_role="",
                description=f"Status changed from {old_status} to {new_status}",
                old_value={"status": old_status},
                new_value={"status": new_status},
            )
        except Exception:
            pass

        # Auto-create onboard record when offer is accepted
        if new_status == ApplicationStatus.OFFER_ACCEPTED.value:
            try:
                existing_onboard = await db["onboards"].find_one({
                    "application_id": application_id,
                    "is_deleted": False
                })
                if not existing_onboard:
                    # Re-fetch to get latest offered_ctc / offered_designation after update
                    fresh = await collection.find_one({"_id": application_id})
                    updater = await db["users"].find_one({"_id": updated_by})
                    company_id = (updater or {}).get("company_id", "")
                    from app.services.onboard_service import OnboardService
                    from app.models.company.onboard import OnboardCreate
                    onboard_payload = OnboardCreate(
                        candidate_id=fresh.get("candidate_id", ""),
                        application_id=application_id,
                        job_id=fresh.get("job_id", ""),
                        client_id=fresh.get("client_id", ""),
                        partner_id=fresh.get("partner_id"),
                        offer_ctc=float(fresh.get("offered_ctc") or 0),
                        offer_designation=fresh.get("offered_designation") or fresh.get("job_title") or "TBD",
                        offer_location=fresh.get("job_location") or "TBD",
                        offer_released_date=date.today(),
                    )
                    onboard_svc = OnboardService(db)
                    await onboard_svc.create(onboard_payload, company_id, updated_by)
            except Exception:
                pass  # Non-critical — application status update already succeeded

        return await ApplicationService.get_application(db, application_id)
    
    @staticmethod
    async def assign_application(
        db: AsyncIOMotorDatabase,
        application_id: str,
        assigned_to: str,
        assigned_by: str
    ) -> ApplicationResponse:
        """Assign application to a coordinator"""
        collection = db[ApplicationService.COLLECTION]
        
        existing = await collection.find_one({"_id": application_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Application not found")
        
        users_collection = db["users"]
        assignee = await users_collection.find_one({"_id": assigned_to, "is_deleted": False})
        if not assignee:
            raise HTTPException(status_code=400, detail="Assignee user not found")
        
        await collection.update_one(
            {"_id": application_id},
            {"$set": {
                "assigned_to": assigned_to,
                "assigned_to_name": assignee.get("full_name"),
                "updated_by": assigned_by,
                "updated_at": datetime.now(timezone.utc)
            }}
        )
        
        try:
            await AuditService(db).log(
                action="assign", entity_type="application",
                entity_id=application_id,
                entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
                user_id=assigned_by, user_name="", user_role="",
                description=f"Assigned to {assignee.get('full_name')}",
            )
        except Exception:
            pass

        return await ApplicationService.get_application(db, application_id)
    
    @staticmethod
    async def delete_application(db: AsyncIOMotorDatabase, application_id: str, deleted_by: str) -> bool:
        """Soft delete an application"""
        collection = db[ApplicationService.COLLECTION]
        
        existing = await collection.find_one({"_id": application_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Application not found")
        
        # Check for scheduled interviews
        interviews_collection = db["interviews"]
        pending_interviews = await interviews_collection.count_documents({
            "application_id": application_id,
            "status": {"$in": ["scheduled", "confirmed"]},
            "is_deleted": False
        })
        
        if pending_interviews > 0:
            raise HTTPException(status_code=400, detail=f"Cannot delete application with {pending_interviews} pending interviews")
        
        await collection.update_one(
            {"_id": application_id},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc), "deleted_by": deleted_by}}
        )
        
        # Update job stats
        from app.services.job_service import JobService
        await JobService.update_job_stats(db, existing["job_id"])

        # Update candidate stats. `total_applications` decrements directly, but
        # `current_job_id`/`current_job_title`/`current_stage` are a cached
        # snapshot of the candidate's most recent application (set by
        # create_application / update_application_status) — deleting that
        # exact application must recompute the snapshot from whatever's left,
        # otherwise the candidate profile keeps pointing at a deleted job.
        candidates_collection = db["candidates"]
        await candidates_collection.update_one(
            {"_id": existing["candidate_id"]},
            {"$inc": {"total_applications": -1}}
        )
        if existing["candidate_id"] and existing.get("job_id"):
            candidate_doc = await candidates_collection.find_one(
                {"_id": existing["candidate_id"]}, {"current_job_id": 1}
            )
            if candidate_doc and candidate_doc.get("current_job_id") == existing["job_id"]:
                remaining = await collection.find_one(
                    {"candidate_id": existing["candidate_id"], "is_deleted": False},
                    sort=[("applied_at", -1)],
                )
                if remaining:
                    await candidates_collection.update_one(
                        {"_id": existing["candidate_id"]},
                        {"$set": {
                            "current_job_id": remaining["job_id"],
                            "current_job_title": remaining.get("job_title"),
                            "current_stage": remaining.get("status"),
                        }}
                    )
                else:
                    await candidates_collection.update_one(
                        {"_id": existing["candidate_id"]},
                        {"$unset": {"current_job_id": "", "current_job_title": "", "current_stage": ""}}
                    )
        
        try:
            await AuditService(db).log(
                action="delete", entity_type="application",
                entity_id=application_id,
                entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
                user_id=deleted_by, user_name="", user_role="",
                description="Application deleted",
            )
        except Exception:
            pass

        return True
    
    @staticmethod
    async def get_dashboard_stats(db: AsyncIOMotorDatabase, current_user: Optional[dict] = None, start_date: Optional[datetime] = None) -> Dict[str, Any]:
        """Get application statistics.
        Uses the exact same visibility scoping as list_applications so dashboard
        counts always match what the Applications page shows for this user."""
        collection = db[ApplicationService.COLLECTION]

        base_query = {"is_deleted": False}
        if start_date:
            base_query["created_at"] = {"$gte": start_date}
        if current_user and current_user.get("role") != "partner":
            from app.services.user_service import UserService
            user_svc = UserService(db)
            visible_ids = await user_svc.get_visible_user_ids(current_user, module_name="applications")
            if visible_ids is not None:
                base_query["created_by"] = {"$in": visible_ids}
        elif current_user and current_user.get("role") == "partner":
            base_query["partner_id"] = current_user.get("id") or current_user.get("sub", "")

        total = await collection.count_documents(base_query)
        
        pipeline = [{"$match": base_query}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_counts = await collection.aggregate(pipeline).to_list(length=20)
        by_status = {item["_id"]: item["count"] for item in status_counts}
        
        from datetime import timedelta
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent = await collection.count_documents({**base_query, "applied_at": {"$gte": week_ago}})
        
        return {
            "total": total,
            "by_status": by_status,
            "recent_week": recent,
            "applied": by_status.get("applied", 0),
            "screening": by_status.get("screening", 0),
            "shortlisted": by_status.get("shortlisted", 0),
            "interview": by_status.get("interview", 0),
            "offered": by_status.get("offered", 0),
            "joined": by_status.get("joined", 0),
            "rejected": by_status.get("rejected", 0)
        }

    @staticmethod
    async def list_candidates_view(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 20,
        keyword: Optional[str] = None,
        status_filter: Optional[List[str]] = None,
        job_id: Optional[str] = None,
        partner_id: Optional[str] = None,
        assigned_to: Optional[str] = None,
        current_user: Optional[dict] = None,
    ) -> Dict[str, Any]:
        """Aggregate applications by candidate — returns one row per candidate."""
        collection = db[ApplicationService.COLLECTION]

        match: Dict[str, Any] = {"is_deleted": False}

        if current_user and current_user.get("role") != "partner":
            from app.services.user_service import UserService
            user_svc = UserService(db)
            visible_ids = await user_svc.get_visible_user_ids(current_user, module_name="applications")
            if visible_ids is not None:
                match["created_by"] = {"$in": visible_ids}

        if job_id:
            match["job_id"] = job_id
        if status_filter:
            match["status"] = {"$in": status_filter}
        if partner_id:
            match["partner_id"] = partner_id
        if assigned_to:
            match["assigned_to"] = assigned_to
        if keyword:
            import re as _re
            pat = _re.escape(keyword.strip())
            match["$or"] = [
                {"candidate_name": {"$regex": pat, "$options": "i"}},
                {"candidate_email": {"$regex": pat, "$options": "i"}},
                {"candidate_mobile": {"$regex": pat, "$options": "i"}},
                {"job_title": {"$regex": pat, "$options": "i"}},
                {"client_name": {"$regex": pat, "$options": "i"}},
            ]

        agg_pipeline = [
            {"$match": match},
            {"$sort": {"applied_at": -1}},
            {"$group": {
                "_id": "$candidate_id",
                "candidate_name": {"$first": "$candidate_name"},
                "candidate_email": {"$first": "$candidate_email"},
                "candidate_mobile": {"$first": "$candidate_mobile"},
                "total_applications": {"$sum": 1},
                "latest_job_title": {"$first": "$job_title"},
                "latest_client_name": {"$first": "$client_name"},
                "latest_applied_at": {"$first": "$applied_at"},
                "best_eligibility_score": {"$max": "$eligibility_score"},
                "last_updated": {"$max": "$status_changed_at"},
                # Collect all statuses so we can build an accurate per-status count
                "statuses": {"$push": "$status"},
            }},
            # Join candidates collection to pull photo_url
            {"$lookup": {
                "from": "candidates",
                "localField": "_id",
                "foreignField": "_id",
                "as": "_cand",
            }},
            {"$addFields": {
                "photo_url": {"$ifNull": [{"$arrayElemAt": ["$_cand.photo_url", 0]}, None]},
            }},
            {"$sort": {"last_updated": -1, "latest_applied_at": -1}},
            {"$facet": {
                "data": [
                    {"$skip": (page - 1) * page_size},
                    {"$limit": page_size},
                ],
                "total_count": [{"$count": "count"}],
            }},
        ]

        results = await collection.aggregate(agg_pipeline).to_list(1)
        if not results:
            return {"data": [], "pagination": {"page": page, "page_size": page_size, "total": 0, "total_pages": 0}}

        facet = results[0]
        rows = facet.get("data", [])
        total = facet["total_count"][0]["count"] if facet.get("total_count") else 0

        from collections import Counter
        data = [
            {
                "candidate_id": row["_id"],
                "candidate_name": row.get("candidate_name"),
                "candidate_email": row.get("candidate_email"),
                "candidate_mobile": row.get("candidate_mobile"),
                "photo_url": row.get("photo_url"),
                "total_applications": row.get("total_applications", 0),
                "latest_job_title": row.get("latest_job_title"),
                "latest_client_name": row.get("latest_client_name"),
                # status_summary: count per status across all applications — no mixing
                "status_summary": dict(Counter(row.get("statuses", []))),
                "latest_applied_at": row.get("latest_applied_at"),
                "best_eligibility_score": row.get("best_eligibility_score"),
                "last_updated": row.get("last_updated"),
            }
            for row in rows
        ]

        return {
            "data": data,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }