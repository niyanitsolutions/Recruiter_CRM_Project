"""HRM — Holiday Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class HolidayType(str, Enum):
    NATIONAL = "national"
    FESTIVAL = "festival"
    COMPANY = "company"
    OPTIONAL = "optional"


class Holiday(BaseModel):
    """Company holiday — company_db.hrm_holidays"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    name: str
    date: str                           # YYYY-MM-DD
    holiday_type: HolidayType = HolidayType.NATIONAL
    description: Optional[str] = None
    is_paid: bool = True
    is_recurring: bool = False          # auto-generate next year on copy
    applicable_departments: List[str] = Field(default_factory=list)   # empty = all
    applicable_locations: List[str] = Field(default_factory=list)     # empty = all
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class HolidayCreate(BaseModel):
    name: str
    date: str                           # YYYY-MM-DD
    holiday_type: HolidayType = HolidayType.NATIONAL
    description: Optional[str] = None
    is_paid: bool = True
    is_recurring: bool = False
    applicable_departments: List[str] = Field(default_factory=list)
    applicable_locations: List[str] = Field(default_factory=list)


class HolidayUpdate(BaseModel):
    name: Optional[str] = None
    date: Optional[str] = None
    holiday_type: Optional[HolidayType] = None
    description: Optional[str] = None
    is_paid: Optional[bool] = None
    is_recurring: Optional[bool] = None
    applicable_departments: Optional[List[str]] = None
    applicable_locations: Optional[List[str]] = None
    is_active: Optional[bool] = None


class HolidayImportRow(BaseModel):
    """Single row from CSV import"""
    name: str
    date: str
    holiday_type: HolidayType = HolidayType.NATIONAL
    description: Optional[str] = None
    is_paid: bool = True
    is_recurring: bool = False
