"""
Pipeline Model - ATS Upgrade
Job-specific interview pipelines with customizable stages
"""
from datetime import datetime
from typing import Optional, List
from pydantic import ConfigDict, BaseModel, Field
from enum import Enum


class StageMode(str, Enum):
    VIDEO = "video"
    PHONE = "phone"
    IN_PERSON = "in_person"


# ============== Sub-Models ==============

class PipelineStage(BaseModel):
    """A single stage in a pipeline"""
    id: str
    stage_name: str
    code: Optional[str] = None
    order: int = Field(default=1, ge=1)
    mode: str = Field(default=StageMode.VIDEO.value)
    duration: int = Field(default=60)          # minutes
    is_mandatory: bool = Field(default=True)
    requires_feedback: bool = Field(default=True)
    auto_advance: bool = Field(default=False)  # auto move to next stage on pass
    auto_reject: bool = Field(default=False)   # auto reject on fail


class PipelineStageCreate(BaseModel):
    """Schema for creating a stage"""
    stage_name: str = Field(..., min_length=1, max_length=100)
    code: Optional[str] = None
    order: int = Field(default=1, ge=1)
    mode: Optional[str] = Field(default=StageMode.VIDEO.value)
    duration: Optional[int] = Field(default=60)
    is_mandatory: bool = Field(default=True)
    requires_feedback: bool = Field(default=True)
    auto_advance: bool = Field(default=False)
    auto_reject: bool = Field(default=False)


# ============== Main Model ==============

class PipelineModel(BaseModel):
    """Pipeline document model"""
    id: Optional[str] = Field(None, alias="_id")

    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    job_id: Optional[str] = None      # If attached to a specific job
    tenant_id: Optional[str] = None   # For multi-tenant isolation

    stages: List[PipelineStage] = Field(default_factory=list)

    is_default: bool = Field(default=False)  # Company default pipeline

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None

    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class PipelineCreate(BaseModel):
    """Schema for creating a pipeline"""
    name: str = Field(..., min_length=2, max_length=200)
    description: Optional[str] = None
    job_id: Optional[str] = None
    stages: List[PipelineStageCreate] = Field(default_factory=list)
    is_default: bool = Field(default=False)


class PipelineUpdate(BaseModel):
    """Schema for updating a pipeline"""
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    description: Optional[str] = None
    job_id: Optional[str] = None
    stages: Optional[List[PipelineStageCreate]] = None
    is_default: Optional[bool] = None


class PipelineResponse(BaseModel):
    """Pipeline response"""
    id: str
    name: str
    description: Optional[str]
    job_id: Optional[str]
    stages: List[PipelineStage]
    is_default: bool
    created_at: datetime
    updated_at: Optional[datetime]


class PipelineListResponse(BaseModel):
    """Simplified pipeline for lists"""
    id: str
    name: str
    description: Optional[str]
    job_id: Optional[str]
    job_title: Optional[str] = None     # denormalized from jobs collection
    client_name: Optional[str] = None   # denormalized from jobs collection
    stage_count: int = 0
    is_default: bool
    created_at: datetime
