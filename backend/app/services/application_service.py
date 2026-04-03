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
    get_application_status_display
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
        partner_id: Optional[str] = None
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
        
        # Calculate eligibility score
        from app.services.job_service import JobService
        eligibility_result = await JobService.check_candidate_eligibility(
            db, application_data.job_id, application_data.candidate_id
        )

        # ---- ATS Eligibility Gate ----
        initial_status = ApplicationStatus.APPLIED.value
        rejection_reason = None
        rejected_at_val = None
        rejected_by_val = None

        if not getattr(application_data, "bypass_eligibility", False):
            reasons = []
            job_min_pct = job.get("min_percentage")
            if job_min_pct is not None:
                cand_pct = candidate.get("percentage") or candidate.get("cgpa")
                if cand_pct is None or float(cand_pct) < float(job_min_pct):
                    reasons.append(f"Percentage low (required {job_min_pct}%)")

            elig = job.get("eligibility") or {}
            job_skills = [s.lower() for s in elig.get("required_skills", [])]
            if job_skills:
                cand_skill_tags = [s.lower() for s in candidate.get("skill_tags", [])]
                missing = [s for s in job_skills if s not in cand_skill_tags]
                if missing:
                    reasons.append(f"Skill mismatch: missing {', '.join(missing)}")

            min_exp = elig.get("min_experience_years")
            max_exp = elig.get("max_experience_years")
            cand_exp = float(candidate.get("total_experience_years") or 0)
            if min_exp is not None and cand_exp < float(min_exp):
                reasons.append(f"Experience not matching (min {min_exp} yrs required)")
            if max_exp is not None and cand_exp > float(max_exp):
                reasons.append(f"Experience not matching (max {max_exp} yrs allowed)")

            if reasons:
                initial_status = ApplicationStatus.REJECTED.value
                rejection_reason = "; ".join(reasons)
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
            "eligibility_score": eligibility_result.get("score"),
            "eligibility_details": eligibility_result,
            "notes": application_data.notes,
            "applied_at": datetime.now(timezone.utc),
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc),
            "is_deleted": False
        }
        
        await collection.insert_one(app_dict)

        # Update job stats and candidate tracking (non-critical — don't fail the response)
        try:
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
                        "current_stage": ApplicationStatus.APPLIED.value
                    }
                }
            )
        except Exception:
            pass

        try:
            await AuditService.log(
                db=db, action="create", entity_type="application",
                entity_id=app_dict["_id"],
                entity_name=f"{candidate.get('full_name')} - {job.get('title')}",
                user_id=created_by,
                new_value={"candidate": candidate.get("full_name"), "job": job.get("title")}
            )
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
            eligibility_score=app.get("eligibility_score"),
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
    ) -> Dict[str, Any]:
        """List applications with filters"""
        collection = db[ApplicationService.COLLECTION]

        query = {"is_deleted": False}

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
        
        result = []
        for app in applications:
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
                current_stage_name=app.get("current_stage_name"),
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
        from app.services.job_service import JobService

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

        results = []
        for job in jobs:
            elig = await JobService.check_candidate_eligibility(db, job["_id"], candidate_id)
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
        
        await collection.update_one(
            {"_id": application_id},
            {
                "$set": update_data,
                "$push": {"stage_history": stage_entry}
            }
        )
        
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
            await AuditService.log(
                db=db, action="status_change", entity_type="application",
                entity_id=application_id,
                entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
                user_id=updated_by,
                description=f"Status changed from {old_status} to {new_status}",
                old_value={"status": old_status},
                new_value={"status": new_status}
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
        
        await AuditService.log(
            db=db, action="assign", entity_type="application",
            entity_id=application_id,
            entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
            user_id=assigned_by,
            description=f"Assigned to {assignee.get('full_name')}"
        )
        
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
        
        # Update candidate stats
        candidates_collection = db["candidates"]
        await candidates_collection.update_one(
            {"_id": existing["candidate_id"]},
            {"$inc": {"total_applications": -1}}
        )
        
        await AuditService.log(
            db=db, action="delete", entity_type="application",
            entity_id=application_id,
            entity_name=f"{existing.get('candidate_name')} - {existing.get('job_title')}",
            user_id=deleted_by
        )
        
        return True
    
    @staticmethod
    async def get_dashboard_stats(db: AsyncIOMotorDatabase, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get application statistics"""
        collection = db[ApplicationService.COLLECTION]
        
        base_query = {"is_deleted": False}
        if user_id:
            base_query["assigned_to"] = user_id
        
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