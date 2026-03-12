"""
Matching Service — Naukri-style ATS scoring engine
Computes candidate-job match scores and stores in matching_results collection.
"""
from datetime import datetime
from typing import List, Dict, Any, Optional
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException


class MatchingService:
    COLLECTION = "matching_results"

    # ── Private score helpers ───────────────────────────────────────────────

    @staticmethod
    def _skill_score(job: dict, candidate: dict) -> dict:
        """Skills matching: mandatory skills from eligibility criteria."""
        eligibility = job.get("eligibility") or {}
        required = [s.lower().strip() for s in (eligibility.get("mandatory_skills") or [])]
        # Also include top-level required_skills if present
        required += [s.lower().strip() for s in (eligibility.get("required_skills") or [])]
        required = list(dict.fromkeys(required))  # deduplicate, preserve order

        if not required:
            return {
                "skill_match_percent": 100.0,
                "skill_status": "No Skills Required",
                "matched_skills": [],
                "missing_skills": [],
                "skill_score": 100,
            }

        cand_skills = set(s.lower().strip() for s in (candidate.get("skill_tags") or []))
        matched = [s for s in required if s in cand_skills]
        missing = [s for s in required if s not in cand_skills]

        # Debug logging
        print(f"[Matching] Required: {required}")
        print(f"[Matching] Candidate skills: {sorted(cand_skills)}")
        print(f"[Matching] Matched: {matched}")

        pct = round(len(matched) / len(required) * 100, 1)

        if pct >= 100:
            status = "Fully Matched"
        elif pct >= 50:
            status = "Partially Matched"
        else:
            status = "Low Match"

        return {
            "skill_match_percent": pct,
            "skill_status": status,
            "matched_skills": matched,
            "missing_skills": missing,
            "skill_score": pct,
        }

    @staticmethod
    def _location_score(job: dict, candidate: dict) -> dict:
        """Location matching: job city vs candidate current_city / preferred_locations."""
        job_city = (job.get("city") or "").lower().strip()
        cand_city = (
            candidate.get("current_city") or candidate.get("city") or ""
        ).lower().strip()

        if not job_city:
            return {"location_status": "Not Specified", "location_score": 50}
        if not cand_city:
            return {"location_status": "Not Specified", "location_score": 50}
        if job_city == cand_city:
            return {"location_status": "Matched", "location_score": 100}

        preferred = [
            loc.lower().strip()
            for loc in (candidate.get("preferred_locations") or [])
        ]
        if job_city in preferred:
            return {"location_status": "Preferred Location", "location_score": 80}

        return {"location_status": "Not Matched", "location_score": 0}

    @staticmethod
    def _experience_score(job: dict, candidate: dict) -> dict:
        """Experience matching: candidate years vs job eligibility range."""
        eligibility = job.get("eligibility") or {}
        min_exp = eligibility.get("min_experience_years")
        max_exp = eligibility.get("max_experience_years")
        cand_exp = float(candidate.get("total_experience_years") or 0)

        if min_exp is None and max_exp is None:
            return {
                "experience_status": "No Criteria",
                "experience_score": 100,
                "candidate_exp": cand_exp,
            }

        if min_exp is not None and cand_exp < float(min_exp):
            return {
                "experience_status": "Below Minimum",
                "experience_score": 0,
                "candidate_exp": cand_exp,
            }

        if max_exp is not None and cand_exp > float(max_exp):
            return {
                "experience_status": "Overqualified",
                "experience_score": 50,
                "candidate_exp": cand_exp,
            }

        return {
            "experience_status": "Matched",
            "experience_score": 100,
            "candidate_exp": cand_exp,
        }

    @staticmethod
    def _percentage_score(job: dict, candidate: dict) -> dict:
        """Academic percentage matching: candidate % vs job min_percentage."""
        min_pct = job.get("min_percentage")

        if min_pct is None:
            return {"percentage_status": "No Criteria", "percentage_score": 100}

        cand_pct = candidate.get("percentage") or candidate.get("cgpa")
        if cand_pct is None:
            return {"percentage_status": "Not Provided", "percentage_score": 50}

        if float(cand_pct) >= float(min_pct):
            return {"percentage_status": "Eligible", "percentage_score": 100}

        return {"percentage_status": "Below Minimum", "percentage_score": 0}

    # ── Public methods ──────────────────────────────────────────────────────

    @staticmethod
    async def run_matching(
        db: AsyncIOMotorDatabase,
        job_id: str,
        tenant_id: Optional[str] = None,
        limit: int = 500,
    ) -> List[Dict[str, Any]]:
        """
        Compute match scores for ALL active candidates against the job.
        Results are stored via delete-then-insert (full refresh per job_id).
        Returns sorted list (highest score first).
        """
        job = await db.jobs.find_one({"_id": job_id, "is_deleted": False})
        if not job:
            raise HTTPException(status_code=404, detail="Job not found")

        candidates = await db.candidates.find(
            {"is_deleted": False, "status": {"$nin": ["blacklisted", "joined"]}}
        ).limit(limit).to_list(length=limit)

        docs = []
        now = datetime.utcnow()

        for cand in candidates:
            s = MatchingService._skill_score(job, cand)
            l = MatchingService._location_score(job, cand)
            e = MatchingService._experience_score(job, cand)
            p = MatchingService._percentage_score(job, cand)

            # Weighted scoring: Skills 50%, Location 20%, Experience 20%, Percentage 10%
            final_score = round(
                s["skill_score"] * 0.5 +
                l["location_score"] * 0.2 +
                e["experience_score"] * 0.2 +
                p["percentage_score"] * 0.1
            )

            # Build human-readable issues list
            issues = []
            if s["missing_skills"]:
                issues.append(f"Missing skills: {', '.join(s['missing_skills'])}")
            if l["location_status"] == "Not Matched":
                job_city = job.get("city", "")
                cand_city = cand.get("current_city") or cand.get("city") or "Unknown"
                issues.append(f"Location mismatch: {cand_city} vs {job_city}")
            if e["experience_status"] == "Below Minimum":
                issues.append(
                    f"Experience {e['candidate_exp']}y below minimum {job.get('eligibility', {}).get('min_experience_years')}y"
                )
            if p["percentage_status"] == "Below Minimum":
                issues.append(f"Percentage below required {job.get('min_percentage')}%")

            # Eligibility: final_score >= 60 AND percentage not "Below Minimum"
            is_eligible = final_score >= 60 and p["percentage_status"] != "Below Minimum"

            doc = {
                "_id": str(ObjectId()),
                "job_id": job_id,
                "candidate_id": cand["_id"],
                "candidate_name": cand.get("full_name", ""),
                "candidate_email": cand.get("email", ""),
                # Skills
                "skill_match_percent": s["skill_match_percent"],
                "skill_status": s["skill_status"],
                "matched_skills": s["matched_skills"],
                "missing_skills": s["missing_skills"],
                # Location
                "location_status": l["location_status"],
                # Experience
                "experience_status": e["experience_status"],
                "candidate_exp": e["candidate_exp"],
                # Percentage
                "percentage_status": p["percentage_status"],
                # Final
                "final_score": final_score,
                "eligibility_status": "eligible" if is_eligible else "not_eligible",
                "issues": issues,
                "computed_at": now,
                "is_deleted": False,
            }
            if tenant_id:
                doc["tenant_id"] = tenant_id

            docs.append(doc)

        # Delete all old results for this job, then insert fresh
        await db[MatchingService.COLLECTION].delete_many({"job_id": job_id})
        if docs:
            await db[MatchingService.COLLECTION].insert_many(docs)

        # Sort by score desc and return (replace _id with id)
        docs.sort(key=lambda x: x["final_score"], reverse=True)
        results = []
        for doc in docs:
            d = dict(doc)
            d["id"] = d.pop("_id")
            results.append(d)

        return results

    @staticmethod
    async def get_matching_results(
        db: AsyncIOMotorDatabase,
        job_id: str,
    ) -> List[Dict[str, Any]]:
        """Return stored matching results for a job, sorted by final_score desc."""
        cursor = db[MatchingService.COLLECTION].find(
            {"job_id": job_id, "is_deleted": False}
        ).sort("final_score", -1)
        docs = await cursor.to_list(length=1000)

        results = []
        for d in docs:
            d["id"] = str(d.pop("_id", ""))
            results.append(d)

        return results

    @staticmethod
    async def get_eligible_for_interview(
        db: AsyncIOMotorDatabase,
        job_id: str,
    ) -> List[Dict[str, Any]]:
        """
        Return eligible candidates for interview scheduling.
        Query: matching_results JOIN candidates WHERE job_id = :job_id AND eligibility_status = 'eligible'
        Does NOT require an existing application — any eligible candidate qualifies.
        """
        cursor = db[MatchingService.COLLECTION].find(
            {"job_id": job_id, "eligibility_status": "eligible", "is_deleted": False}
        ).sort("final_score", -1)
        eligible = await cursor.to_list(length=1000)

        if not eligible:
            return []

        # Batch-fetch fresh candidate data
        candidate_ids = [m["candidate_id"] for m in eligible]
        cands = await db.candidates.find(
            {"_id": {"$in": candidate_ids}, "is_deleted": False}
        ).to_list(length=len(candidate_ids))
        cand_map = {c["_id"]: c for c in cands}

        results = []
        for match in eligible:
            cid = match["candidate_id"]
            cand = cand_map.get(cid)
            if not cand:
                continue  # Candidate no longer active, skip

            results.append({
                "candidate_id": cid,
                "candidate_name": match.get("candidate_name") or cand.get("full_name", ""),
                "candidate_email": match.get("candidate_email") or cand.get("email", ""),
                "final_score": match["final_score"],
                "eligibility_status": "eligible",
            })

        return results
