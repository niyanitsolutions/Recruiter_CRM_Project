"""
Designation Model - Company Level
Defines job titles/positions within a company
"""
from datetime import datetime
from typing import Optional
from pydantic import ConfigDict, BaseModel, Field


class DesignationModel(BaseModel):
    """Designation document model"""
    id: Optional[str] = Field(None, alias="_id")
    name: str = Field(..., min_length=2, max_length=100)
    code: Optional[str] = Field(None, max_length=20)  # Short code
    description: Optional[str] = Field(None, max_length=500)
    department_id: Optional[str] = None  # Optional department association
    level: int = Field(default=1)  # Hierarchy level (1=Entry, 2=Mid, 3=Senior, 4=Lead, 5=Manager, 6=Director, 7=VP, 8=C-Level)
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class DesignationCreate(BaseModel):
    """Schema for creating a new designation"""
    name: str = Field(..., min_length=2, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    department_id: Optional[str] = None
    level: Optional[int] = Field(default=1, ge=1, le=10)
    sort_order: Optional[int] = 0


class DesignationUpdate(BaseModel):
    """Schema for updating a designation"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code: Optional[str] = Field(None, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    department_id: Optional[str] = None
    level: Optional[int] = Field(None, ge=1, le=10)
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class DesignationResponse(BaseModel):
    """Designation response schema"""
    id: str
    name: str
    code: Optional[str]
    description: Optional[str]
    department_id: Optional[str]
    department_name: Optional[str] = None  # Populated from join
    level: int
    level_name: str = ""  # Human readable level
    is_active: bool
    sort_order: int
    user_count: int = 0  # Count of users with this designation
    created_at: datetime
    updated_at: Optional[datetime]


# Level name mapping
LEVEL_NAMES = {
    1: "Entry Level",
    2: "Junior",
    3: "Mid Level",
    4: "Senior",
    5: "Lead",
    6: "Manager",
    7: "Senior Manager",
    8: "Director",
    9: "VP",
    10: "C-Level"
}


def get_level_name(level: int) -> str:
    """Get human readable level name"""
    return LEVEL_NAMES.get(level, f"Level {level}")