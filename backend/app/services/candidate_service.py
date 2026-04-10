"""
Candidate Service - Phase 3
Business logic for candidate management with AI resume parsing
"""
from datetime import datetime, date, timezone
from typing import Optional, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException, UploadFile, status
import os
import re
import uuid

from app.models.company.candidate import (
    CandidateCreate,
    CandidateUpdate,
    CandidateResponse,
    CandidateListResponse,
    CandidateSearchParams,
    CandidateStatus,
    ResumeParseResult
)
from app.services.audit_service import AuditService


def _normalize_status(s: str) -> str:
    """Map legacy pipeline statuses to 'active'.
    Old candidate.status values (new, screening, rejected, …) belong to
    applications, not to the person.  The only person-level states are
    'active' and 'blacklisted'.
    """
    return "blacklisted" if s == "blacklisted" else "active"


def _sanitize_for_mongo(d: dict) -> dict:
    """Recursively convert datetime.date → datetime.datetime for Motor/BSON."""
    for key, val in list(d.items()):
        if isinstance(val, datetime):
            pass
        elif isinstance(val, date):
            d[key] = datetime(val.year, val.month, val.day)
        elif isinstance(val, dict):
            _sanitize_for_mongo(val)
    return d


class CandidateService:
    """Service for candidate management"""
    
    COLLECTION = "candidates"
    
    @staticmethod
    async def create_candidate(
        db: AsyncIOMotorDatabase,
        candidate_data: CandidateCreate,
        created_by: str,
        partner_id: Optional[str] = None,
        *,
        company_id: str = "",
        company_name: str = "",
        recruiter_name: str = "",
    ) -> CandidateResponse:
        """Create a new candidate"""
        collection = db[CandidateService.COLLECTION]
        
        # Check for duplicate email
        existing_email = await collection.find_one({
            "email": candidate_data.email.lower(),
            "is_deleted": False
        })
        if existing_email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate with this email already exists"
            )
        
        # Check for duplicate mobile
        mobile_clean = re.sub(r'[^0-9]', '', candidate_data.mobile)
        existing_mobile = await collection.find_one({
            "mobile": {"$regex": mobile_clean[-10:]},
            "is_deleted": False
        })
        if existing_mobile:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate with this mobile already exists"
            )
        
        # Prepare document
        candidate_dict = candidate_data.model_dump(exclude_unset=True)
        candidate_dict["_id"] = str(ObjectId())
        candidate_dict["email"] = candidate_data.email.lower()
        candidate_dict["mobile"] = mobile_clean
        candidate_dict["created_by"] = created_by
        candidate_dict["created_at"] = datetime.now(timezone.utc)
        candidate_dict["is_deleted"] = False
        candidate_dict["status"] = CandidateStatus.ACTIVE.value
        
        # Generate full name
        full_name = candidate_data.first_name
        if candidate_data.last_name:
            full_name += f" {candidate_data.last_name}"
        candidate_dict["full_name"] = full_name
        
        # Partner tracking
        if partner_id:
            candidate_dict["partner_id"] = partner_id
            candidate_dict["source"] = "partner"
        
        # Extract skill tags for search
        if candidate_data.skills:
            candidate_dict["skill_tags"] = [s.name.lower() for s in candidate_data.skills]
        
        # Motor cannot encode datetime.date — convert before insert
        _sanitize_for_mongo(candidate_dict)

        await collection.insert_one(candidate_dict)

        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="create",
                entity_type="candidate",
                entity_id=candidate_dict["_id"],
                entity_name=full_name,
                user_id=created_by,
                user_name=recruiter_name,
                user_role="",
                description=f"Candidate created: {full_name}",
            )
        except Exception:
            pass

        # Send registration acknowledgement to candidate (best-effort)
        candidate_email = candidate_data.email.lower() if candidate_data.email else ""
        if candidate_email:
            try:
                from app.services.email_service import send_candidate_registered_email, _fire_email
                _fire_email(send_candidate_registered_email(
                    to_email=candidate_email,
                    candidate_name=full_name,
                    position_applied=getattr(candidate_data, "current_designation", None)
                                     or getattr(candidate_data, "preferred_role", None),
                    recruiter_name=recruiter_name or "our team",
                    company_name=company_name or company_id or "the company",
                    company_id=company_id,
                ))
            except Exception as _e:
                import logging as _log
                _log.getLogger(__name__).warning("Candidate registration email scheduling failed: %s", _e)

        return await CandidateService.get_candidate(db, candidate_dict["_id"])
    
    @staticmethod
    async def get_candidate(
        db: AsyncIOMotorDatabase,
        candidate_id: str
    ) -> CandidateResponse:
        """Get candidate by ID"""
        collection = db[CandidateService.COLLECTION]
        
        candidate = await collection.find_one({
            "_id": candidate_id,
            "is_deleted": False
        })
        
        if not candidate:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # Resolve partner name if a partner_id is set
        partner_name = None
        partner_id = candidate.get("partner_id")
        if partner_id:
            partner_doc = await db.users.find_one({"_id": partner_id, "is_deleted": False}, {"full_name": 1})
            if partner_doc:
                partner_name = partner_doc.get("full_name")

        return CandidateResponse(
            id=candidate["_id"],
            first_name=candidate["first_name"],
            last_name=candidate.get("last_name"),
            full_name=candidate.get("full_name"),
            email=candidate["email"],
            mobile=candidate["mobile"],
            alternate_mobile=candidate.get("alternate_mobile"),
            date_of_birth=candidate.get("date_of_birth"),
            gender=candidate.get("gender"),
            current_city=candidate.get("current_city"),
            current_state=candidate.get("current_state"),
            total_experience_years=candidate.get("total_experience_years"),
            total_experience_months=candidate.get("total_experience_months"),
            current_company=candidate.get("current_company"),
            current_designation=candidate.get("current_designation"),
            current_ctc=candidate.get("current_ctc"),
            expected_ctc=candidate.get("expected_ctc"),
            notice_period=candidate.get("notice_period"),
            skills=candidate.get("skills", []),
            skill_tags=candidate.get("skill_tags", []),
            education=candidate.get("education", []),
            work_experience=candidate.get("work_experience", []),
            highest_qualification=candidate.get("highest_qualification"),
            percentage=candidate.get("percentage"),
            preferred_locations=candidate.get("preferred_locations", []),
            willing_to_relocate=bool(candidate.get("willing_to_relocate", False)),
            resume_url=candidate.get("resume_url"),
            photo_url=candidate.get("photo_url"),
            resume_parsed=candidate.get("resume_parsed", False),
            linkedin_url=candidate.get("linkedin_url"),
            portfolio_url=candidate.get("portfolio_url"),
            notes=candidate.get("notes"),
            source=candidate.get("source", "direct"),
            partner_id=partner_id,
            partner_name=partner_name,
            status=_normalize_status(candidate.get("status", "active")),
            assigned_to=candidate.get("assigned_to"),
            current_job_id=candidate.get("current_job_id"),
            current_job_title=candidate.get("current_job_title"),
            current_stage=candidate.get("current_stage"),
            total_applications=candidate.get("total_applications", 0),
            total_interviews=candidate.get("total_interviews", 0),
            tags=candidate.get("tags", []),
            created_at=candidate["created_at"]
        )
    
    @staticmethod
    async def list_candidates(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 10,
        search_params: Optional[CandidateSearchParams] = None,
        current_user: Optional[dict] = None
    ) -> Dict[str, Any]:
        """List candidates with advanced search and filters"""
        collection = db[CandidateService.COLLECTION]

        # Build query
        query = {"is_deleted": False}

        # Access control: enforce role-based visibility
        if current_user:
            role = current_user.get("role", "")
            user_id = current_user.get("id") or current_user.get("sub", "")
            is_admin = current_user.get("is_owner") or role == "admin"

            if role == "partner":
                # Partners can only see their own submitted candidates
                query["partner_id"] = user_id
                # Override any passed partner_id filter to prevent data leak
                if search_params:
                    search_params.partner_id = None
            elif not is_admin and role == "candidate_coordinator":
                # Candidate coordinators see:
                #   1. Candidates assigned to themselves or their subordinates
                #   2. Candidates not yet assigned to anyone (unassigned / newly created)
                # Without #2, coordinators can't see candidates they just created
                # because new candidates have no assigned_to value.
                from app.services.user_service import UserService
                user_svc = UserService(db)
                accessible_ids = await user_svc.get_all_subordinates(user_id)
                query["$or"] = [
                    {"assigned_to": {"$in": accessible_ids}},
                    {"assigned_to": None},
                    {"assigned_to": {"$exists": False}},
                ]
                # Clear any passed assigned_to filter to avoid conflict
                if search_params:
                    search_params.assigned_to = None
        
        if search_params:
            # Keyword search (name, email, skills)
            if search_params.keyword:
                keyword = re.escape(search_params.keyword.lower())
                query["$or"] = [
                    {"full_name": {"$regex": keyword, "$options": "i"}},
                    {"email": {"$regex": keyword, "$options": "i"}},
                    {"skill_tags": {"$regex": keyword, "$options": "i"}},
                    {"current_company": {"$regex": keyword, "$options": "i"}},
                    {"current_designation": {"$regex": keyword, "$options": "i"}}
                ]
            
            # Skills filter (any of the specified skills)
            if search_params.skills:
                skills_lower = [s.lower() for s in search_params.skills]
                query["skill_tags"] = {"$in": skills_lower}
            
            # Experience range
            if search_params.min_experience is not None:
                query["total_experience_years"] = {"$gte": search_params.min_experience}
            if search_params.max_experience is not None:
                if "total_experience_years" in query:
                    query["total_experience_years"]["$lte"] = search_params.max_experience
                else:
                    query["total_experience_years"] = {"$lte": search_params.max_experience}
            
            # CTC range
            if search_params.min_ctc is not None:
                query["current_ctc"] = {"$gte": search_params.min_ctc}
            if search_params.max_ctc is not None:
                if "current_ctc" in query:
                    query["current_ctc"]["$lte"] = search_params.max_ctc
                else:
                    query["current_ctc"] = {"$lte": search_params.max_ctc}
            
            # Notice period
            if search_params.notice_period:
                query["notice_period"] = {"$in": search_params.notice_period}
            
            # Location
            if search_params.location:
                query["current_city"] = {"$in": [{"$regex": re.escape(loc), "$options": "i"} for loc in search_params.location]}
            
            # Status — map UI values to DB values for backward compatibility
            if search_params.status:
                db_status_filter = []
                for s in search_params.status:
                    if s == "blacklisted":
                        db_status_filter.append("blacklisted")
                    elif s == "active":
                        # Match "active" plus all legacy pipeline statuses
                        db_status_filter.extend([
                            "active", "new", "screening", "shortlisted",
                            "interview", "offered", "joined", "rejected",
                            "on_hold", "withdrawn"
                        ])
                query["status"] = {"$in": db_status_filter}
            
            # Source
            if search_params.source:
                query["source"] = {"$in": search_params.source}
            
            # Assigned to
            if search_params.assigned_to:
                query["assigned_to"] = search_params.assigned_to
            
            # Partner
            if search_params.partner_id:
                query["partner_id"] = search_params.partner_id
            
            # Tags
            if search_params.tags:
                query["tags"] = {"$in": search_params.tags}
            
            # Date range
            if search_params.created_from:
                query["created_at"] = {"$gte": datetime.combine(search_params.created_from, datetime.min.time())}
            if search_params.created_to:
                if "created_at" in query:
                    query["created_at"]["$lte"] = datetime.combine(search_params.created_to, datetime.max.time())
                else:
                    query["created_at"] = {"$lte": datetime.combine(search_params.created_to, datetime.max.time())}
        
        # Count total
        total = await collection.count_documents(query)
        
        # Fetch with pagination
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        candidates = await cursor.to_list(length=page_size)
        
        # Get assigned user names
        user_ids = [c.get("assigned_to") for c in candidates if c.get("assigned_to")]
        users_map = {}
        if user_ids:
            users_collection = db["users"]
            users_cursor = users_collection.find(
                {"_id": {"$in": user_ids}},
                {"_id": 1, "full_name": 1}
            )
            users = await users_cursor.to_list(length=len(user_ids))
            users_map = {u["_id"]: u["full_name"] for u in users}

        # Get partner names
        partner_ids = [c.get("partner_id") for c in candidates if c.get("partner_id")]
        partner_map = {}
        if partner_ids:
            partners_cursor = db["users"].find(
                {"_id": {"$in": partner_ids}},
                {"_id": 1, "full_name": 1}
            )
            partners = await partners_cursor.to_list(length=len(partner_ids))
            partner_map = {p["_id"]: p["full_name"] for p in partners}

        # Format response
        result = []
        for candidate in candidates:
            result.append(CandidateListResponse(
                id=candidate["_id"],
                full_name=candidate.get("full_name", candidate["first_name"]),
                email=candidate["email"],
                mobile=candidate["mobile"],
                current_city=candidate.get("current_city"),
                total_experience_years=candidate.get("total_experience_years"),
                current_company=candidate.get("current_company"),
                current_designation=candidate.get("current_designation"),
                current_ctc=candidate.get("current_ctc"),
                expected_ctc=candidate.get("expected_ctc"),
                notice_period=candidate.get("notice_period"),
                skill_tags=candidate.get("skill_tags", [])[:5],  # First 5 skills
                source=candidate.get("source", "direct"),
                status=_normalize_status(candidate.get("status", "active")),
                assigned_to=candidate.get("assigned_to"),
                assigned_to_name=users_map.get(candidate.get("assigned_to")),
                partner_id=candidate.get("partner_id"),
                partner_name=partner_map.get(candidate.get("partner_id")),
                resume_url=candidate.get("resume_url"),
                total_applications=candidate.get("total_applications", 0),
                current_job_title=candidate.get("current_job_title"),
                current_stage=candidate.get("current_stage"),
                created_at=candidate["created_at"]
            ))
        
        return {
            "data": result,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size
            }
        }
    
    @staticmethod
    async def update_candidate(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        update_data: CandidateUpdate,
        updated_by: str,
        user_name: str = ""
    ) -> CandidateResponse:
        """Update a candidate"""
        collection = db[CandidateService.COLLECTION]
        
        # Get existing
        existing = await collection.find_one({
            "_id": candidate_id,
            "is_deleted": False
        })
        
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # Prepare update
        update_dict = update_data.model_dump(exclude_unset=True, exclude_none=True)
        
        if not update_dict:
            return await CandidateService.get_candidate(db, candidate_id)
        
        # Check email uniqueness
        if "email" in update_dict:
            existing_email = await collection.find_one({
                "email": update_dict["email"].lower(),
                "_id": {"$ne": candidate_id},
                "is_deleted": False
            })
            if existing_email:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email already in use"
                )
            update_dict["email"] = update_dict["email"].lower()
        
        # Check mobile uniqueness
        if "mobile" in update_dict:
            mobile_clean = re.sub(r'[^0-9]', '', update_dict["mobile"])
            existing_mobile = await collection.find_one({
                "mobile": {"$regex": mobile_clean[-10:]},
                "_id": {"$ne": candidate_id},
                "is_deleted": False
            })
            if existing_mobile:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Mobile already in use"
                )
            update_dict["mobile"] = mobile_clean
        
        # Update full name
        first_name = update_dict.get("first_name", existing.get("first_name"))
        last_name = update_dict.get("last_name", existing.get("last_name"))
        if "first_name" in update_dict or "last_name" in update_dict:
            update_dict["full_name"] = f"{first_name} {last_name}".strip() if last_name else first_name
        
        # Update skill tags
        if "skills" in update_dict:
            update_dict["skill_tags"] = [s["name"].lower() for s in update_dict["skills"]]
        
        update_dict["updated_by"] = updated_by
        update_dict["updated_at"] = datetime.now(timezone.utc)
        
        # Motor cannot encode datetime.date — convert before update
        _sanitize_for_mongo(update_dict)

        await collection.update_one(
            {"_id": candidate_id},
            {"$set": update_dict}
        )

        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="update",
                entity_type="candidate",
                entity_id=candidate_id,
                entity_name=existing.get("full_name", ""),
                user_id=updated_by,
                user_name=user_name,
                user_role="",
                description=f"Candidate updated: {existing.get('full_name', '')}",
            )
        except Exception:
            pass

        return await CandidateService.get_candidate(db, candidate_id)
    
    @staticmethod
    async def update_candidate_status(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        new_status: str,
        updated_by: str,
        remarks: Optional[str] = None,
        user_name: str = ""
    ) -> CandidateResponse:
        """Update candidate global status (only 'active' or 'blacklisted' allowed)"""
        if new_status not in ("active", "blacklisted"):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Candidate status must be 'active' or 'blacklisted'. Rejection is tracked on the application."
            )

        collection = db[CandidateService.COLLECTION]

        existing = await collection.find_one({
            "_id": candidate_id,
            "is_deleted": False
        })

        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )

        old_status = existing.get("status")
        
        await collection.update_one(
            {"_id": candidate_id},
            {
                "$set": {
                    "status": new_status,
                    "status_changed_at": datetime.now(timezone.utc),
                    "status_changed_by": updated_by,
                    "updated_by": updated_by,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="status_change",
                entity_type="candidate",
                entity_id=candidate_id,
                entity_name=existing.get("full_name", ""),
                user_id=updated_by,
                user_name=user_name,
                user_role="",
                description=f"Status changed from {old_status} to {new_status}",
            )
        except Exception:
            pass

        return await CandidateService.get_candidate(db, candidate_id)

    @staticmethod
    async def assign_candidate(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        assigned_to: str,
        assigned_by: str,
        user_name: str = ""
    ) -> CandidateResponse:
        """Assign candidate to a coordinator"""
        collection = db[CandidateService.COLLECTION]
        
        existing = await collection.find_one({
            "_id": candidate_id,
            "is_deleted": False
        })
        
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # Verify assignee exists
        users_collection = db["users"]
        assignee = await users_collection.find_one({
            "_id": assigned_to,
            "is_deleted": False
        })
        
        if not assignee:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Assignee user not found"
            )
        
        await collection.update_one(
            {"_id": candidate_id},
            {
                "$set": {
                    "assigned_to": assigned_to,
                    "assigned_at": datetime.now(timezone.utc),
                    "updated_by": assigned_by,
                    "updated_at": datetime.now(timezone.utc)
                }
            }
        )
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="assign",
                entity_type="candidate",
                entity_id=candidate_id,
                entity_name=existing.get("full_name", ""),
                user_id=assigned_by,
                user_name=user_name,
                user_role="",
                description=f"Assigned to {assignee.get('full_name', assigned_to)}",
            )
        except Exception:
            pass

        return await CandidateService.get_candidate(db, candidate_id)
    
    @staticmethod
    async def delete_candidate(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        deleted_by: str,
        user_name: str = ""
    ) -> bool:
        """Soft delete a candidate"""
        collection = db[CandidateService.COLLECTION]
        
        existing = await collection.find_one({
            "_id": candidate_id,
            "is_deleted": False
        })
        
        if not existing:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Candidate not found"
            )
        
        # Check for active applications
        applications_collection = db["applications"]
        active_applications = await applications_collection.count_documents({
            "candidate_id": candidate_id,
            "status": {"$in": ["applied", "screening", "shortlisted", "interview", "offered"]},
            "is_deleted": False
        })
        
        if active_applications > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete candidate with {active_applications} active applications"
            )
        
        # Soft delete
        await collection.update_one(
            {"_id": candidate_id},
            {
                "$set": {
                    "is_deleted": True,
                    "deleted_at": datetime.now(timezone.utc),
                    "deleted_by": deleted_by
                }
            }
        )
        
        # Audit log — best-effort
        try:
            audit = AuditService(db)
            await audit.log(
                action="delete",
                entity_type="candidate",
                entity_id=candidate_id,
                entity_name=existing.get("full_name", ""),
                user_id=deleted_by,
                user_name=user_name,
                user_role="",
                description=f"Candidate deleted: {existing.get('full_name', '')}",
            )
        except Exception:
            pass

        return True
    
    @staticmethod
    async def parse_resume(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        resume_text: str,
        updated_by: str
    ) -> ResumeParseResult:
        """
        Parse resume using AI and extract candidate details
        This is a placeholder - integrate with actual AI service
        """
        # TODO: Integrate with AI service (OpenAI, Claude, etc.)
        # For now, return a basic structure
        
        # Extract email using regex
        email_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', resume_text)
        email = email_match.group() if email_match else None
        
        # Extract phone using regex
        phone_match = re.search(r'[\+]?[(]?[0-9]{1,4}[)]?[-\s\./0-9]{8,}', resume_text)
        mobile = phone_match.group() if phone_match else None
        
        # Basic skill extraction (look for common tech keywords)
        common_skills = [
            "python", "java", "javascript", "react", "node", "sql", "mongodb",
            "aws", "docker", "kubernetes", "git", "agile", "scrum"
        ]
        found_skills = []
        resume_lower = resume_text.lower()
        for skill in common_skills:
            if skill in resume_lower:
                found_skills.append({"name": skill.capitalize(), "proficiency": "intermediate"})
        
        result = ResumeParseResult(
            email=email,
            mobile=re.sub(r'[^0-9]', '', mobile) if mobile else None,
            skills=found_skills,
            confidence_score=0.5,  # Low confidence for basic parsing
            raw_text=resume_text[:5000]  # Store first 5000 chars
        )
        
        # Update candidate with parsed data
        if candidate_id:
            collection = db[CandidateService.COLLECTION]
            update_data = {
                "resume_parsed": True,
                "resume_parsed_at": datetime.now(timezone.utc),
                "parsed_data": result.model_dump(),
                "parse_confidence": result.confidence_score,
                "updated_by": updated_by,
                "updated_at": datetime.now(timezone.utc)
            }
            
            # Update skill tags if found
            if found_skills:
                update_data["skill_tags"] = [s["name"].lower() for s in found_skills]
            
            await collection.update_one(
                {"_id": candidate_id},
                {"$set": update_data}
            )
        
        return result
    
    @staticmethod
    async def upload_resume(
        db: AsyncIOMotorDatabase,
        candidate_id: str,
        file: UploadFile,
        updated_by: str,
        upload_dir: str = "uploads/resumes"
    ) -> CandidateResponse:
        """Upload a resume file for a candidate and store the URL."""
        ALLOWED_EXTENSIONS = {".pdf", ".doc", ".docx"}
        MAX_SIZE_BYTES = 5 * 1024 * 1024  # 5 MB

        collection = db[CandidateService.COLLECTION]
        existing = await collection.find_one({"_id": candidate_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Candidate not found")

        # Validate extension
        original_name = file.filename or "resume"
        _, ext = os.path.splitext(original_name.lower())
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type '{ext}'. Allowed: PDF, DOC, DOCX."
            )

        # Read and size-check
        content = await file.read()
        if len(content) > MAX_SIZE_BYTES:
            raise HTTPException(status_code=400, detail="File too large. Maximum size is 5 MB.")

        # Save file — unique name to avoid collisions
        os.makedirs(upload_dir, exist_ok=True)
        unique_name = f"{candidate_id}_{uuid.uuid4().hex}{ext}"
        file_path = os.path.join(upload_dir, unique_name)
        with open(file_path, "wb") as f:
            f.write(content)

        # Build publicly accessible URL
        resume_url = f"/uploads/resumes/{unique_name}"

        await collection.update_one(
            {"_id": candidate_id},
            {"$set": {
                "resume_url": resume_url,
                "updated_by": updated_by,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        return await CandidateService.get_candidate(db, candidate_id)

    @staticmethod
    async def search_by_keywords(
        db: AsyncIOMotorDatabase,
        keywords: str,
        page: int = 1,
        page_size: int = 10
    ) -> Dict[str, Any]:
        """
        Advanced keyword search
        Supports: "Python 3+ years Bangalore"
        """
        collection = db[CandidateService.COLLECTION]
        
        # Parse keywords
        words = keywords.lower().split()
        
        # Build search conditions
        conditions = []
        
        # Experience pattern: "3+ years" or "3-5 years"
        exp_pattern = re.search(r'(\d+)\+?\s*(?:years?|yrs?)', keywords.lower())
        if exp_pattern:
            min_exp = int(exp_pattern.group(1))
            conditions.append({"total_experience_years": {"$gte": min_exp}})
            words = [w for w in words if w not in exp_pattern.group().split()]
        
        # Location (common cities)
        cities = ["bangalore", "mumbai", "delhi", "hyderabad", "chennai", "pune", "kolkata", "noida", "gurgaon"]
        found_city = None
        for city in cities:
            if city in words:
                found_city = city
                conditions.append({"current_city": {"$regex": re.escape(city), "$options": "i"}})
                words.remove(city)
                break
        
        # Remaining words are skills
        if words:
            conditions.append({"skill_tags": {"$in": words}})
        
        # Build final query
        query = {"is_deleted": False}
        if conditions:
            query["$and"] = conditions
        
        # Execute search
        total = await collection.count_documents(query)
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        candidates = await cursor.to_list(length=page_size)
        
        # Format response
        result = []
        for candidate in candidates:
            result.append(CandidateListResponse(
                id=candidate["_id"],
                full_name=candidate.get("full_name", candidate["first_name"]),
                email=candidate["email"],
                mobile=candidate["mobile"],
                current_city=candidate.get("current_city"),
                total_experience_years=candidate.get("total_experience_years"),
                current_company=candidate.get("current_company"),
                current_designation=candidate.get("current_designation"),
                current_ctc=candidate.get("current_ctc"),
                expected_ctc=candidate.get("expected_ctc"),
                notice_period=candidate.get("notice_period"),
                skill_tags=candidate.get("skill_tags", [])[:5],
                source=candidate.get("source", "direct"),
                status=candidate.get("status", "new"),
                assigned_to=candidate.get("assigned_to"),
                current_job_title=candidate.get("current_job_title"),
                current_stage=candidate.get("current_stage"),
                created_at=candidate["created_at"]
            ))
        
        return {
            "data": result,
            "search_info": {
                "parsed_keywords": words,
                "min_experience": exp_pattern.group(1) if exp_pattern else None,
                "city": found_city
            },
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size
            }
        }
    
    @staticmethod
    async def get_dashboard_stats(
        db: AsyncIOMotorDatabase,
        user_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get candidate statistics for dashboard"""
        collection = db[CandidateService.COLLECTION]
        
        base_query = {"is_deleted": False}
        if user_id:
            base_query["assigned_to"] = user_id
        
        # Total candidates
        total = await collection.count_documents(base_query)
        
        # By status
        pipeline = [
            {"$match": base_query},
            {"$group": {"_id": "$status", "count": {"$sum": 1}}}
        ]
        status_counts = await collection.aggregate(pipeline).to_list(length=20)
        by_status = {item["_id"]: item["count"] for item in status_counts}
        
        # By source
        pipeline = [
            {"$match": base_query},
            {"$group": {"_id": "$source", "count": {"$sum": 1}}}
        ]
        source_counts = await collection.aggregate(pipeline).to_list(length=20)
        by_source = {item["_id"]: item["count"] for item in source_counts}
        
        # Recent candidates (last 7 days)
        from datetime import timedelta
        week_ago = datetime.now(timezone.utc) - timedelta(days=7)
        recent = await collection.count_documents({
            **base_query,
            "created_at": {"$gte": week_ago}
        })
        
        return {
            "total": total,
            "by_status": by_status,
            "by_source": by_source,
            "recent_week": recent,
            "new": by_status.get("new", 0),
            "in_interview": by_status.get("interview", 0),
            "offered": by_status.get("offered", 0),
            "joined": by_status.get("joined", 0)
        }