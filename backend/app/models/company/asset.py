"""HRM — Asset Management Model"""
from datetime import datetime, date, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class AssetStatus(str, Enum):
    AVAILABLE  = "available"
    ASSIGNED   = "assigned"
    MAINTENANCE = "maintenance"
    RETIRED    = "retired"
    LOST       = "lost"


class AssetCondition(str, Enum):
    EXCELLENT = "excellent"
    GOOD      = "good"
    FAIR      = "fair"
    POOR      = "poor"


class AssignmentHistory(BaseModel):
    employee_id: str
    employee_name: str
    assigned_on: datetime
    returned_on: Optional[datetime] = None
    condition_on_return: Optional[str] = None
    notes: Optional[str] = None


class AssetModel(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    asset_tag: str
    asset_type: str            # laptop, phone, monitor, mouse, keyboard, headset, etc.
    brand: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[float] = None
    warranty_expiry: Optional[date] = None
    condition: AssetCondition = AssetCondition.GOOD
    status: AssetStatus = AssetStatus.AVAILABLE

    # Current assignment
    assigned_to_id: Optional[str] = None      # employee internal _id
    assigned_to_name: Optional[str] = None
    assigned_on: Optional[datetime] = None

    # History
    assignment_history: List[AssignmentHistory] = Field(default_factory=list)

    notes: Optional[str] = None
    location: Optional[str] = None            # office/branch

    created_by: Optional[str] = None
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class AssetCreate(BaseModel):
    asset_tag: str
    asset_type: str
    brand: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[float] = None
    warranty_expiry: Optional[date] = None
    condition: AssetCondition = AssetCondition.GOOD
    notes: Optional[str] = None
    location: Optional[str] = None


class AssetUpdate(BaseModel):
    asset_type: Optional[str] = None
    brand: Optional[str] = None
    model_name: Optional[str] = None
    serial_number: Optional[str] = None
    purchase_date: Optional[date] = None
    purchase_cost: Optional[float] = None
    warranty_expiry: Optional[date] = None
    condition: Optional[AssetCondition] = None
    status: Optional[AssetStatus] = None
    notes: Optional[str] = None
    location: Optional[str] = None


class AssetAssignRequest(BaseModel):
    employee_id: str
    employee_name: str
    notes: Optional[str] = None


class AssetReturnRequest(BaseModel):
    condition_on_return: Optional[AssetCondition] = None
    notes: Optional[str] = None
