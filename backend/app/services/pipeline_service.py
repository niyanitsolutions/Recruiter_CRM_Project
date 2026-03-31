"""
Pipeline Service - ATS Upgrade
Business logic for job-specific interview pipelines
"""
import logging
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any
from bson import ObjectId
from motor.motor_asyncio import AsyncIOMotorDatabase
from fastapi import HTTPException

from app.models.company.pipeline import (
    PipelineCreate,
    PipelineUpdate,
    PipelineResponse,
    PipelineListResponse,
    PipelineStage,
)

logger = logging.getLogger(__name__)


class PipelineService:
    """Service for pipeline management"""

    COLLECTION = "pipelines"

    @staticmethod
    def _build_stage(stage_data, idx: int) -> PipelineStage:
        """Build a PipelineStage from create data"""
        return PipelineStage(
            id=str(ObjectId()),
            stage_name=stage_data.stage_name,
            code=stage_data.code,
            order=stage_data.order if stage_data.order else idx + 1,
            mode=stage_data.mode or "video",
            duration=stage_data.duration or 60,
            is_mandatory=stage_data.is_mandatory,
            requires_feedback=stage_data.requires_feedback,
            auto_advance=stage_data.auto_advance,
            auto_reject=stage_data.auto_reject,
        )

    @staticmethod
    async def create_pipeline(
        db: AsyncIOMotorDatabase,
        pipeline_data: PipelineCreate,
        created_by: str
    ) -> PipelineResponse:
        """Create a new pipeline"""
        collection = db[PipelineService.COLLECTION]

        # Build stages
        stages = [
            PipelineService._build_stage(s, i).model_dump()
            for i, s in enumerate(pipeline_data.stages)
        ]

        # If setting as default, unset previous default
        if pipeline_data.is_default:
            await collection.update_many(
                {"is_default": True, "is_deleted": False},
                {"$set": {"is_default": False}}
            )

        pipeline_dict = {
            "_id": str(ObjectId()),
            "name": pipeline_data.name,
            "description": pipeline_data.description,
            "job_id": pipeline_data.job_id,
            "stages": stages,
            "is_default": pipeline_data.is_default,
            "created_by": created_by,
            "created_at": datetime.now(timezone.utc),
            "is_deleted": False,
        }

        await collection.insert_one(pipeline_dict)

        return await PipelineService.get_pipeline(db, pipeline_dict["_id"])

    @staticmethod
    async def get_pipeline(db: AsyncIOMotorDatabase, pipeline_id: str) -> PipelineResponse:
        """Get pipeline by ID"""
        collection = db[PipelineService.COLLECTION]
        doc = await collection.find_one({"_id": pipeline_id, "is_deleted": False})
        if not doc:
            raise HTTPException(status_code=404, detail="Pipeline not found")
        return PipelineService._to_response(doc)

    @staticmethod
    async def get_pipeline_by_job(db: AsyncIOMotorDatabase, job_id: str) -> Optional[PipelineResponse]:
        """Get pipeline attached to a specific job"""
        collection = db[PipelineService.COLLECTION]
        doc = await collection.find_one({"job_id": job_id, "is_deleted": False})
        if not doc:
            return None
        return PipelineService._to_response(doc)

    @staticmethod
    async def list_pipelines(
        db: AsyncIOMotorDatabase,
        page: int = 1,
        page_size: int = 20,
        job_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        """List pipelines with optional filters"""
        collection = db[PipelineService.COLLECTION]

        query: Dict[str, Any] = {"is_deleted": False}
        if job_id:
            query["job_id"] = job_id

        total = await collection.count_documents(query)
        skip = (page - 1) * page_size
        cursor = collection.find(query).sort("created_at", -1).skip(skip).limit(page_size)
        docs = await cursor.to_list(length=page_size)

        # Batch-fetch job info to denormalize job_title + client_name
        job_ids = [d["job_id"] for d in docs if d.get("job_id")]
        job_map: Dict[str, Any] = {}
        if job_ids:
            jobs_cursor = db.jobs.find(
                {"_id": {"$in": job_ids}, "is_deleted": False},
                {"title": 1, "client_name": 1},
            )
            jobs_list = await jobs_cursor.to_list(length=len(job_ids))
            job_map = {j["_id"]: j for j in jobs_list}

        result = [
            PipelineListResponse(
                id=d["_id"],
                name=d["name"],
                description=d.get("description"),
                job_id=d.get("job_id"),
                job_title=job_map.get(d.get("job_id") or "", {}).get("title"),
                client_name=job_map.get(d.get("job_id") or "", {}).get("client_name"),
                stage_count=len(d.get("stages", [])),
                is_default=d.get("is_default", False),
                created_at=d["created_at"],
            )
            for d in docs
        ]

        return {
            "data": result,
            "pagination": {
                "page": page,
                "page_size": page_size,
                "total": total,
                "total_pages": (total + page_size - 1) // page_size,
            },
        }

    @staticmethod
    async def update_pipeline(
        db: AsyncIOMotorDatabase,
        pipeline_id: str,
        update_data: PipelineUpdate,
        updated_by: str
    ) -> PipelineResponse:
        """Update a pipeline"""
        collection = db[PipelineService.COLLECTION]

        existing = await collection.find_one({"_id": pipeline_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        update_dict: Dict[str, Any] = {"updated_by": updated_by, "updated_at": datetime.now(timezone.utc)}

        if update_data.name is not None:
            update_dict["name"] = update_data.name
        if update_data.description is not None:
            update_dict["description"] = update_data.description
        if update_data.job_id is not None:
            update_dict["job_id"] = update_data.job_id
        if update_data.is_default is not None:
            if update_data.is_default:
                await collection.update_many(
                    {"is_default": True, "is_deleted": False, "_id": {"$ne": pipeline_id}},
                    {"$set": {"is_default": False}}
                )
            update_dict["is_default"] = update_data.is_default
        if update_data.stages is not None:
            update_dict["stages"] = [
                PipelineService._build_stage(s, i).model_dump()
                for i, s in enumerate(update_data.stages)
            ]

        await collection.update_one({"_id": pipeline_id}, {"$set": update_dict})

        return await PipelineService.get_pipeline(db, pipeline_id)

    @staticmethod
    async def delete_pipeline(
        db: AsyncIOMotorDatabase,
        pipeline_id: str,
        deleted_by: str
    ) -> bool:
        """Soft delete a pipeline"""
        collection = db[PipelineService.COLLECTION]

        existing = await collection.find_one({"_id": pipeline_id, "is_deleted": False})
        if not existing:
            raise HTTPException(status_code=404, detail="Pipeline not found")

        await collection.update_one(
            {"_id": pipeline_id},
            {"$set": {"is_deleted": True, "deleted_at": datetime.now(timezone.utc), "deleted_by": deleted_by}}
        )
        return True

    @staticmethod
    async def get_stages_for_job(db: AsyncIOMotorDatabase, job_id: str) -> List[Dict]:
        """Return ordered stages for a job's pipeline"""
        collection = db[PipelineService.COLLECTION]
        doc = await collection.find_one({"job_id": job_id, "is_deleted": False})
        if not doc:
            # Fall back to default pipeline
            doc = await collection.find_one({"is_default": True, "is_deleted": False})
        if not doc:
            return []
        stages = sorted(doc.get("stages", []), key=lambda s: s.get("order", 0))
        return stages

    @staticmethod
    def _to_response(doc: dict) -> PipelineResponse:
        stages = [PipelineStage(**s) for s in doc.get("stages", [])]
        return PipelineResponse(
            id=doc["_id"],
            name=doc["name"],
            description=doc.get("description"),
            job_id=doc.get("job_id"),
            stages=stages,
            is_default=doc.get("is_default", False),
            created_at=doc["created_at"],
            updated_at=doc.get("updated_at"),
        )
