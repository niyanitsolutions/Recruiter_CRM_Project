"""HRM — Shift Assignment Model (Phase 5: time-bounded, temporary support)"""
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel, Field


class ShiftAssignmentCreate(BaseModel):
    employee_id: str
    shift_id: str
    effective_from: str          # YYYY-MM-DD
    effective_to: Optional[str] = None   # YYYY-MM-DD; None = permanent
    is_temporary: bool = False
    reason: Optional[str] = None


class ShiftAssignmentUpdate(BaseModel):
    shift_id: Optional[str] = None
    effective_from: Optional[str] = None
    effective_to: Optional[str] = None
    is_temporary: Optional[bool] = None
    reason: Optional[str] = None


class ShiftChangeRequestCreate(BaseModel):
    requested_shift_id: str
    effective_from: str          # YYYY-MM-DD
    effective_to: Optional[str] = None
    reason: str


class ShiftChangeRequestAction(BaseModel):
    review_reason: Optional[str] = None
