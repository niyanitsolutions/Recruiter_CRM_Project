"""
Department Model - Company Level
Defines departments within a company for organizational structure
"""
from datetime import datetime, timezone
from typing import Optional
from pydantic import ConfigDict, BaseModel, Field


class DepartmentModel(BaseModel):
    """Department document model"""
    id: Optional[str] = Field(None, alias="_id")
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=20)  # Short code like HR, IT, SALES
    description: Optional[str] = Field(None, max_length=500)
    head_user_id: Optional[str] = None  # Department head
    parent_department_id: Optional[str] = None  # For sub-departments
    is_active: bool = Field(default=True)
    sort_order: int = Field(default=0)
    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_by: Optional[str] = None
    updated_at: Optional[datetime] = None
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    deleted_by: Optional[str] = None

    model_config = ConfigDict(populate_by_name=True)


class DepartmentCreate(BaseModel):
    """Schema for creating a new department"""
    name: str = Field(..., min_length=2, max_length=100)
    code: str = Field(..., min_length=2, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    head_user_id: Optional[str] = None
    parent_department_id: Optional[str] = None
    sort_order: Optional[int] = 0


class DepartmentUpdate(BaseModel):
    """Schema for updating a department"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    code: Optional[str] = Field(None, min_length=2, max_length=20)
    description: Optional[str] = Field(None, max_length=500)
    head_user_id: Optional[str] = None
    parent_department_id: Optional[str] = None
    is_active: Optional[bool] = None
    sort_order: Optional[int] = None


class DepartmentResponse(BaseModel):
    """Department response schema"""
    id: str
    name: str
    code: str
    description: Optional[str]
    head_user_id: Optional[str]
    head_user_name: Optional[str] = None  # Populated from join
    parent_department_id: Optional[str]
    parent_department_name: Optional[str] = None  # Populated from join
    is_active: bool
    sort_order: int
    user_count: int = 0  # Count of users in this department
    created_at: datetime
    updated_at: Optional[datetime]