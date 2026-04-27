"""HRM — Performance Model"""
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum
import uuid


class ReviewCycle(str, Enum):
    Q1 = "q1"
    Q2 = "q2"
    Q3 = "q3"
    Q4 = "q4"
    ANNUAL = "annual"
    MID_YEAR = "mid_year"


class Rating(str, Enum):
    EXCEPTIONAL = "exceptional"    # 5
    EXCEEDS = "exceeds"            # 4
    MEETS = "meets"                # 3
    BELOW = "below"                # 2
    UNSATISFACTORY = "unsatisfactory"  # 1


class GoalStatus(str, Enum):
    NOT_STARTED = "not_started"
    IN_PROGRESS = "in_progress"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class Goal(BaseModel):
    """Individual goal within a review"""
    title: str
    description: Optional[str] = None
    target: Optional[str] = None
    achievement: Optional[str] = None
    weight: float = 100.0    # percentage weight
    status: GoalStatus = GoalStatus.NOT_STARTED
    rating: Optional[Rating] = None
    score: Optional[float] = None  # 0-5


class PerformanceReview(BaseModel):
    """Performance review cycle — company_db.hrm_performance"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str
    employee_id: str
    employee_name: Optional[str] = None

    review_cycle: ReviewCycle
    year: int

    goals: List[Goal] = Field(default_factory=list)

    # Self assessment
    self_rating: Optional[Rating] = None
    self_comments: Optional[str] = None
    self_submitted_at: Optional[datetime] = None

    # Manager review
    manager_id: Optional[str] = None
    manager_name: Optional[str] = None
    manager_rating: Optional[Rating] = None
    manager_comments: Optional[str] = None
    manager_reviewed_at: Optional[datetime] = None

    # Final
    final_rating: Optional[Rating] = None
    final_score: Optional[float] = None    # Overall score 0-5
    is_finalized: bool = False
    finalized_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)


class CreateReview(BaseModel):
    employee_id: str
    review_cycle: ReviewCycle
    year: int
    goals: Optional[List[Goal]] = None


class SubmitSelfReview(BaseModel):
    goals: Optional[List[Goal]] = None
    self_rating: Rating
    self_comments: Optional[str] = None


class SubmitManagerReview(BaseModel):
    goals: Optional[List[Goal]] = None
    manager_rating: Rating
    manager_comments: Optional[str] = None
    final_rating: Optional[Rating] = None
    final_score: Optional[float] = None
    finalize: bool = False
