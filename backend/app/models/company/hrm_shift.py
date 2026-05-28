"""HRM — Shift Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class ShiftType(str, Enum):
    MORNING = "morning"
    EVENING = "evening"
    NIGHT = "night"
    FLEXIBLE = "flexible"
    ROTATIONAL = "rotational"


class Shift(BaseModel):
    """Work shift template — company_db.hrm_shifts"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    name: str                           # "Morning Shift", "Night Shift", etc.
    shift_type: ShiftType = ShiftType.MORNING
    start_time: str = "09:00"           # HH:MM
    end_time: str = "18:00"             # HH:MM
    grace_minutes: int = 15
    working_hours: float = 8.0
    break_duration_minutes: int = 60
    is_overnight: bool = False          # crosses midnight (e.g. 22:00 → 07:00)
    applicable_departments: List[str] = Field(default_factory=list)   # empty = all
    is_default: bool = False            # company's default shift
    is_active: bool = True
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = ""
    updated_by: Optional[str] = None
    is_deleted: bool = False

    model_config = ConfigDict(populate_by_name=True)


class ShiftCreate(BaseModel):
    name: str
    shift_type: ShiftType = ShiftType.MORNING
    start_time: str = "09:00"
    end_time: str = "18:00"
    grace_minutes: int = Field(15, ge=0, le=120)
    working_hours: float = Field(8.0, ge=0.5, le=24.0)
    break_duration_minutes: int = Field(60, ge=0, le=480)
    is_overnight: bool = False
    applicable_departments: List[str] = Field(default_factory=list)
    is_default: bool = False


class ShiftUpdate(BaseModel):
    name: Optional[str] = None
    shift_type: Optional[ShiftType] = None
    start_time: Optional[str] = None
    end_time: Optional[str] = None
    grace_minutes: Optional[int] = None
    working_hours: Optional[float] = None
    break_duration_minutes: Optional[int] = None
    is_overnight: Optional[bool] = None
    applicable_departments: Optional[List[str]] = None
    is_default: Optional[bool] = None
    is_active: Optional[bool] = None


# ── Default shifts seeded on first company setup ─────────────────────────────

DEFAULT_SHIFTS = [
    {
        "name": "Morning Shift", "shift_type": "morning",
        "start_time": "09:00",  "end_time": "18:00",
        "grace_minutes": 15, "working_hours": 8.0, "break_duration_minutes": 60,
        "is_overnight": False, "is_default": True,
    },
    {
        "name": "Evening Shift", "shift_type": "evening",
        "start_time": "14:00",  "end_time": "23:00",
        "grace_minutes": 15, "working_hours": 8.0, "break_duration_minutes": 60,
        "is_overnight": False, "is_default": False,
    },
    {
        "name": "Night Shift", "shift_type": "night",
        "start_time": "22:00",  "end_time": "07:00",
        "grace_minutes": 15, "working_hours": 8.0, "break_duration_minutes": 60,
        "is_overnight": True, "is_default": False,
    },
    {
        "name": "Flexible Shift", "shift_type": "flexible",
        "start_time": "08:00",  "end_time": "20:00",
        "grace_minutes": 60, "working_hours": 8.0, "break_duration_minutes": 60,
        "is_overnight": False, "is_default": False,
    },
]
