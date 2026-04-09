import re
"""
Job Service - Phase 3
Business logic for job management with eligibility matching
"""
from datetime import datetime, date, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, status

from app.models.company.job import (
    JobCreate,
    JobUpdate,
    JobResponse,
    JobListResponse,
    JobSearchParams,
    JobStatus,
    get_job_status_display,
    get_job_type_display,
    get_work_mode_display,
    get_priority_display
)
from app.services.audit_service import AuditService


def _sanitize_for_mongo(d: dict) -> dict:
    """
    Recursively convert datetime.date → datetime.datetime so Motor/BSON can
    encode the document.  (datetime.datetime IS a subclass of datetime.date, so
    check the more specific type first.)
    """
    for key, val in list(d.items()):
        if isinstance(val, datetime):
            pass                                   # already datetime — fine
        elif isinstance(val, date):
            d[key] = datetime(val.year, val.month, val.day)
        elif isinstance(val, dict):
            _sanitize_for_mongo(val)
    return d


class JobService:
    """Service for job management"""
    
    COLLECTION = "jobs"
    
    @staticmethod
    async def create_job(
        db: AsyncIOMotorDatabase,
        job_data: JobCreate,
        created_by: str,
        *,
        company_id: str = "",
        company_name: str = "",
        created_by_name: str = "",
        user_name: str = "",
    ) -> JobResponse:
        """Create a new job"""
        collection = db[JobService.COLLECTION]
        
        # Verify client exists
        clients_collection = db["clients"]
        client = await clients_collection.find_one({
            "_id": job_data.client_id,
            "is_deleted": False
        })
        
        if not client:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Client not found"
            )
        
        # Generate job code if not provided
        job_code = job_data.job_code
        if not job_code:
            client_code = client.get("code", "JOB")[:3].upper()
            last_job = await collection.find_one(
                {"job_code": {"$regex": f"^{re.escape(client_code)}-"}},
                sort=[("job_code", -1)]
            )
            if last_job:
                last_num = int(last_job["job_code"].split("-")[-1])
                job_code = f"{client_code}-{str(last_num + 1).zfill(3)}"
            else:
                job_code = f"{client_code}-001"
        
        # Prepare document
        job_dict = job_data.model_dump(exclude_unset=True)
        job_dict["_id"] = str(ObjectId())
        job_dict["job_code"] = job_code
        job_dict["client_name"] = client["name"]
        job_dict["created_by"] = created_by
        job_dict["created_at"] = datetime.now(timezone.utc)
        job_dict["is_deleted"] = False
        job_dict["filled_positions"] = 0
        job_dict["total_applications"] = 0
        job_dict["shortlisted_count"] = 0
        job_dict["interview_count"] = 0
        job_dict["offered_count"] = 0
        job_dict["rejected_count"] = 0
        
        if job_dict.get("status") == JobStatus.OPEN.value:
            job_dict["posted_date"] = datetime.now(timezone.utc).replace(
                hour=0, minute=0, second=0, microsecond=0
            )

        # Motor cannot encode datetime.date — convert all date fields to datetime
        _sanitize_for_mongo(job_dict)

        await collection.insert_one(job_dict)

        # Update client stats — best-effort; never block the response
        try:
            from app.services.client_service import ClientService
            await ClientService.update_client_stats(db, job_data.client_id)
        except Exception:
            pass

        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="create",
                entity_type="job",
                entity_id=job_dict["_id"],
                entity_name=job_data.title,
                user_id=created_by,
                user_name=user_name,
                user_role="",
                description=f"Job created: {job_data.title}",
            )
        except Exception:
            pass

        # Notify recruiting team (candidate_coordinators + hr) about the new job (best-effort)
        try:
            from app.services.email_service import send_job_opened_email
            # Fetch all active candidate_coordinators and HR users who have an email
            team_cursor = db["users"].find(
                {
                    "role": {"$in": ["candidate_coordinator", "hr", "admin"]},
                    "status": "active",
                    "is_deleted": False,
                    "email": {"$exists": True, "$ne": ""},
                },
                {"email": 1}
            )
            team_emails = [u["email"] async for u in team_cursor if u.get("email")]
            if team_emails:
                from app.services.email_service import _fire_email
                _fire_email(send_job_opened_email(
                    to_emails=team_emails,
                    job_title=job_data.title,
                    client_name=job_dict.get("client_name", ""),
                    job_code=job_dict.get("job_code", ""),
                    location=getattr(job_data, "location", "") or getattr(job_data, "work_location", "") or "",
                    openings=getattr(job_data, "openings", 1) or getattr(job_data, "number_of_positions", 1) or 1,
                    company_name=company_name or company_id or "the company",
                    created_by_name=created_by_name,
                    company_id=company_id,
                ))
        except Exception as _e:
            import logging as _log
            _log.getLogger(__name__).warning("Job opened email scheduling failed: %s", _e)

        return await JobService.get_job(db, job_dict["_id"])
    
    @staticmethod
    async def get_job(db: AsyncIOMotorDatabase, job_id: str) -> JobResponse:
        """Get job by ID"""
        collection = db[JobService.COLLECTION]
        
        job = await collection.find_one({"_id": job_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
        return JobResponse(
            id=job["_id"],
            title=job["title"],
            job_code=job.get("job_code"),
            description=job.get("description"),
            responsibilities=job.get("responsibilities"),
            requirements=job.get("requirements"),
            client_id=job["client_id"],
            client_name=job.get("client_name"),
            job_type=job.get("job_type", "full_time"),
            job_type_display=get_job_type_display(job.get("job_type", "full_time")),
            work_mode=job.get("work_mode", "onsite"),
            work_mode_display=get_work_mode_display(job.get("work_mode", "onsite")),
            location=job.get("location"),
            city=job.get("city"),
            state=job.get("state"),
            country=job.get("country", "India"),
            remote_allowed=job.get("remote_allowed", False),
            total_positions=job.get("total_positions", 1),
            filled_positions=job.get("filled_positions", 0),
            remaining_positions=job.get("total_positions", 1) - job.get("filled_positions", 0),
            salary=job.get("salary"),
            experience=job.get("experience"),
            skills_required=job.get("skills_required", []),
            education_required=job.get("education_required", []),
            eligibility=job.get("eligibility"),
            auto_match_enabled=job.get("auto_match_enabled", False),
            min_percentage=job.get("min_percentage"),
            pipeline_id=job.get("pipeline_id"),
            priority=job.get("priority", "medium"),
            priority_display=get_priority_display(job.get("priority", "medium")),
            posted_date=job.get("posted_date"),
            target_date=job.get("target_date"),
            assigned_coordinators=job.get("assigned_coordinators", []),
            primary_coordinator=job.get("primary_coordinator"),
            total_applications=job.get("total_applications", 0),
            shortlisted_count=job.get("shortlisted_count", 0),
            interview_count=job.get("interview_count", 0),
            offered_count=job.get("offered_count", 0),
            status=job.get("status", "draft"),
            status_display=get_job_status_display(job.get("status", "draft")),
            tags=job.get("tags", []),
            visible_to_partners=job.get("visible_to_partners", True),
            partner_commission=job.get("partner_commission"),
            created_at=job["created_at"],
            updated_at=job.get("updated_at")
        )
    
    @staticmethod
    async def list_jobs(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        search_params: Optional[JobSearchParams] = None,
        visible_to_partner: bool = False
    ) -> Dict[str, Any]:
        """List jobs with filters and pagination"""
        collection = db[JobService.COLLECTION]
        
        query = {"is_deleted": False}
        
        if visible_to_partner:
            query["visible_to_partners"] = True
            query["status"] = JobStatus.OPEN.value
        
        if search_params:
            if search_params.keyword:
                query["$or"] = [
                    {"title": {"$regex": re.escape(search_params.keyword), "$options": "i"}},
                    {"job_code": {"$regex": re.escape(search_params.keyword), "$options": "i"}},
                    {"description": {"$regex": re.escape(search_params.keyword), "$options": "i"}}
                ]
            if search_params.client_id:
                query["client_id"] = search_params.client_id
            if search_params.status:
                query["status"] = {"$in": search_params.status}
            if search_params.job_type:
                query["job_type"] = {"$in": search_params.job_type}
            if search_params.work_mode:
                query["work_mode"] = {"$in": search_params.work_mode}
            if search_params.priority:
                query["priority"] = {"$in": search_params.priority}
            if search_params.assigned_to:
                query["assigned_coordinators"] = search_params.assigned_to
        
        total = await collection.count_documents(query)
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort([("priority", -1), ("created_at", -1)]).skip(skip).limit(page_size)
        jobs = await cursor.to_list(length=page_size)
        
        result = []
        for job in jobs:
            salary_min = job.get("salary", {}).get("min_salary") if job.get("salary") else None
            salary_max = job.get("salary", {}).get("max_salary") if job.get("salary") else None
            exp_min = job.get("experience", {}).get("min_years") if job.get("experience") else None
            exp_max = job.get("experience", {}).get("max_years") if job.get("experience") else None
            
            result.append(JobListResponse(
                id=job["_id"], title=job["title"], job_code=job.get("job_code"),
                client_name=job.get("client_name"), job_type=job.get("job_type", "full_time"),
                work_mode=job.get("work_mode", "onsite"), city=job.get("city"),
                total_positions=job.get("total_positions", 1), filled_positions=job.get("filled_positions", 0),
                salary_min=salary_min, salary_max=salary_max, experience_min=exp_min, experience_max=exp_max,
                priority=job.get("priority", "medium"), target_date=job.get("target_date"),
                total_applications=job.get("total_applications", 0), shortlisted_count=job.get("shortlisted_count", 0),
                status=job.get("status", "draft"), status_display=get_job_status_display(job.get("status", "draft")),
                created_at=job["created_at"]
            ))
        
        return {
            "data": result,
            "pagination": {"page": page, "page_size": page_size, "total": total, "total_pages": (total + page_size - 1) // page_size}
        }
    
    @staticmethod
    async def update_job(db: AsyncIOMotorDatabase, job_id: str, update_data: JobUpdate, updated_by: str, user_name: str = "") -> JobResponse:
        """Update a job"""
        collection = db[JobService.COLLECTION]
        
        existing = await collection.find_one({"_id": job_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        if not update_dict:
            return await JobService.get_job(db, job_id)
        
        if "status" in update_dict:
            new_status = update_dict["status"]
            old_status = existing.get("status")
            if new_status == JobStatus.OPEN.value and old_status != JobStatus.OPEN.value:
                update_dict["posted_date"] = datetime.now(timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            if new_status in [JobStatus.CLOSED.value, JobStatus.FILLED.value]:
                update_dict["closed_date"] = datetime.now(timezone.utc).replace(
                    hour=0, minute=0, second=0, microsecond=0
                )
            update_dict["status_changed_at"] = datetime.now(timezone.utc)
            update_dict["status_changed_by"] = updated_by

        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.now(timezone.utc)

        # Motor cannot encode datetime.date — convert all date fields to datetime
        _sanitize_for_mongo(update_dict)

        await collection.update_one({"_id": job_id}, {"$set": update_dict})
        
        if "status" in update_dict:
            from app.services.client_service import ClientService
            await ClientService.update_client_stats(db, existing["client_id"])
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="update",
                entity_type="job",
                entity_id=job_id,
                entity_name=existing["title"],
                user_id=updated_by,
                user_name=user_name,
                user_role="",
                description=f"Job updated: {existing['title']}",
            )
        except Exception:
            pass

        return await JobService.get_job(db, job_id)
    
    @staticmethod
    async def delete_job(db: AsyncIOMotorDatabase, job_id: str, deleted_by: str, user_name: str = "") -> bool:
        """Soft delete a job"""
        collection = db[JobService.COLLECTION]
        
        existing = await collection.find_one({"_id": job_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Job not found")
        
        applications_collection = db["applications"]
        active_applications = await applications_collection.count_documents({
            "job_id": job_id,
            "status": {"$in": ["applied", "screening", "shortlisted", "interview", "offered"]},
            "is_deleted": False
        })
        
        if active_applications > 0:
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST,
                                detail=f"Cannot delete job with {active_applications} active applications")
        
        await collection.update_one({"_id": job_id}, {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc), "deleted_by": deleted_by}})
        
        from app.services.client_service import ClientService
        await ClientService.update_client_stats(db, existing["client_id"])
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="delete",
                entity_type="job",
                entity_id=job_id,
                entity_name=existing["title"],
                user_id=deleted_by,
                user_name=user_name,
                user_role="",
                description=f"Job deleted: {existing['title']}",
            )
        except Exception:
            pass

        return True
    
    @staticmethod
    async def update_job_status(
        db: AsyncIOMotorDatabase,
        job_id: str,
        new_status: str,
        updated_by: str,
        closure_reason: Optional[str] = None
    ) -> JobResponse:
        """Update only the status of a job"""
        update_data = JobUpdate(status=new_status)
        if closure_reason:
            update_data = JobUpdate(status=new_status, closure_reason=closure_reason)
        return await JobService.update_job(db, job_id, update_data, updated_by)

    @staticmethod
    async def update_job_stats(db: AsyncIOMotorDatabase, job_id: str):
        """Update job statistics"""
        collection = db[JobService.COLLECTION]
        applications_collection = db["applications"]
        
        pipeline = [{"$match": {"job_id": job_id, "is_deleted": False}}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_counts = await applications_collection.aggregate(pipeline).to_list(length=20)
        counts = {item["_id"]: item["count"] for item in status_counts}
        
        total = sum(counts.values())
        shortlisted = counts.get("shortlisted", 0) + counts.get("interview", 0) + counts.get("offered", 0) + counts.get("joined", 0)
        
        await collection.update_one({"_id": job_id}, {"$set": {
            "total_applications": total,
            "shortlisted_count": shortlisted,
            "interview_count": counts.get("interview", 0),
            "offered_count": counts.get("offered", 0) + counts.get("offer_accepted", 0),
            "filled_positions": counts.get("joined", 0),
            "rejected_count": counts.get("rejected", 0)
        }})
    
    @staticmethod
    async def check_candidate_eligibility(db: AsyncIOMotorDatabase, job_id: str, candidate_id: str) -> Dict[str, Any]:
        """Check if candidate meets job eligibility criteria"""
        jobs_collection = db[JobService.COLLECTION]
        candidates_collection = db["candidates"]
        
        job = await jobs_collection.find_one({"_id": job_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        candidate = await candidates_collection.find_one({"_id": candidate_id, "is_deleted": False})
        if not candidate:
            raise HTTPException(status_code=404, detail="Candidate not found")
        
        eligibility = job.get("eligibility")
        if not eligibility:
            return {"eligible": True, "score": 100, "details": "No eligibility criteria defined"}
        
        score = 100
        issues = []
        
        if eligibility.get("min_experience_years"):
            cand_exp = candidate.get("total_experience_years", 0)
            if cand_exp < eligibility["min_experience_years"]:
                score -= 30
                issues.append(f"Experience {cand_exp} years, required {eligibility['min_experience_years']}+ years")
        
        if eligibility.get("mandatory_skills"):
            cand_skills = set([s.lower() for s in candidate.get("skill_tags", [])])
            required_skills = set([s.lower() for s in eligibility["mandatory_skills"]])
            missing = required_skills - cand_skills
            if missing:
                score -= 10 * len(missing)
                issues.append(f"Missing mandatory skills: {', '.join(missing)}")
        
        score = max(0, score)
        
        return {"eligible": score >= 50, "score": score, "issues": issues, "details": "Eligible" if score >= 50 else f"Not eligible: {'; '.join(issues)}"}
    
    @staticmethod
    async def find_matching_candidates(db: AsyncIOMotorDatabase, job_id: str, limit: int = 20) -> List[Dict[str, Any]]:
        """Find candidates matching job eligibility criteria"""
        jobs_collection = db[JobService.COLLECTION]
        candidates_collection = db["candidates"]
        
        job = await jobs_collection.find_one({"_id": job_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")
        
        eligibility = job.get("eligibility")
        query = {"is_deleted": False, "status": {"$nin": ["blacklisted", "joined"]}}
        
        if eligibility:
            if eligibility.get("min_experience_years"):
                query["total_experience_years"] = {"$gte": eligibility["min_experience_years"]}
            if eligibility.get("mandatory_skills"):
                query["skill_tags"] = {"$all": [s.lower() for s in eligibility["mandatory_skills"]]}
        
        cursor = candidates_collection.find(query).limit(limit * 2)
        candidates = await cursor.to_list(length=limit * 2)
        
        results = []
        for cand in candidates:
            eligibility_result = await JobService.check_candidate_eligibility(db, job_id, cand["_id"])
            if eligibility_result["score"] >= 50:
                results.append({
                    "candidate_id": cand["_id"], "name": cand.get("full_name"), "email": cand["email"],
                    "experience": cand.get("total_experience_years"), "current_ctc": cand.get("current_ctc"),
                    "expected_ctc": cand.get("expected_ctc"), "notice_period": cand.get("notice_period"),
                    "skills": cand.get("skill_tags", [])[:5], "score": eligibility_result["score"]
                })
        
        results.sort(key=lambda x: x["score"], reverse=True)
        return results[:limit]
    
    @staticmethod
    async def get_dashboard_stats(db: AsyncIOMotorDatabase, user_id: Optional[str] = None) -> Dict[str, Any]:
        """Get job statistics for dashboard"""
        collection = db[JobService.COLLECTION]
        
        base_query = {"is_deleted": False}
        if user_id:
            base_query["assigned_coordinators"] = user_id
        
        total = await collection.count_documents(base_query)
        
        pipeline = [{"$match": base_query}, {"$group": {"_id": "$status", "count": {"$sum": 1}}}]
        status_counts = await collection.aggregate(pipeline).to_list(length=20)
        by_status = {item["_id"]: item["count"] for item in status_counts}
        
        pipeline = [{"$match": {**base_query, "status": "open"}}, {"$group": {"_id": "$priority", "count": {"$sum": 1}}}]
        priority_counts = await collection.aggregate(pipeline).to_list(length=10)
        by_priority = {item["_id"]: item["count"] for item in priority_counts}
        
        return {
            "total": total, "by_status": by_status, "by_priority": by_priority,
            "open": by_status.get("open", 0), "on_hold": by_status.get("on_hold", 0),
            "filled": by_status.get("filled", 0), "closed": by_status.get("closed", 0),
            "urgent_jobs": by_priority.get("urgent", 0), "high_priority_jobs": by_priority.get("high", 0)
        }
    
    @staticmethod
    async def get_jobs_dropdown(db: AsyncIOMotorDatabase, status_filter: Optional[List[str]] = None, client_id: Optional[str] = None) -> List[Dict[str, str]]:
        """Get jobs for dropdown"""
        collection = db[JobService.COLLECTION]
        
        query = {"is_deleted": False}
        query["status"] = {"$in": status_filter if status_filter else ["open"]}
        if client_id:
            query["client_id"] = client_id

        cursor = collection.find(query, {"_id": 1, "title": 1, "job_code": 1, "client_name": 1}).sort("created_at", -1)
        jobs = await cursor.to_list(length=500)

        result = []
        for j in jobs:
            title = (j.get("title") or "").strip() or "Untitled Job"
            code = j.get("job_code") or ""
            client = j.get("client_name") or ""
            label = f"{code} - {title} ({client})" if code else f"{title} ({client})"
            result.append({"value": j["_id"], "label": label.strip(" -()"), "title": title})
        return result