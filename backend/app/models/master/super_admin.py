"""
SuperAdmin Model (master_db)
Global system administrators
"""

from datetime import datetime, timezone
from typing import Optional, List
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field, EmailStr
import uuid


class SuperAdminStatus(str, Enum):
    """SuperAdmin account status"""
    ACTIVE = "active"
    INACTIVE = "inactive"
    SUSPENDED = "suspended"


class SuperAdminModel(BaseModel):
    """
    SuperAdmin User Model
    
    Stored in: master_db.super_admins
    
    SuperAdmins can:
    - Manage all tenants
    - View global analytics
    - Manage plans
    - View all payments
    
    SuperAdmins CANNOT:
    - Access tenant-specific data (candidates, jobs, interviews)
    """
    
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    
    # Identity
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    mobile: Optional[str] = None
    
    # Authentication
    password_hash: str
    
    # Status
    status: SuperAdminStatus = Field(default=SuperAdminStatus.ACTIVE)
    is_primary: bool = Field(default=False)  # First/main super admin
    
    # Permissions
    permissions: List[str] = Field(default_factory=lambda: [
        "tenants:read",
        "tenants:write",
        "tenants:delete",
        "plans:read",
        "plans:write",
        "payments:read",
        "analytics:read",
        "super_admins:read"
    ])
    
    # Session & Security
    last_login: Optional[datetime] = None
    last_login_ip: Optional[str] = None
    failed_login_attempts: int = Field(default=0)
    locked_until: Optional[datetime] = None
    
    # Metadata
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))
    created_by: str = Field(default="system")
    
    # Soft Delete
    is_deleted: bool = Field(default=False)
    deleted_at: Optional[datetime] = None
    
    model_config = ConfigDict(populate_by_name=True)
    
    def to_dict(self) -> dict:
        """Convert model to dictionary for MongoDB insertion"""
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data


class SuperAdminCreate(BaseModel):
    """Schema for creating a SuperAdmin"""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    full_name: str = Field(..., min_length=2, max_length=100)
    mobile: Optional[str] = None
    password: str = Field(..., min_length=8)


class SuperAdminLogin(BaseModel):
    """Schema for SuperAdmin login"""
    username: str
    password: str


class SuperAdminResponse(BaseModel):
    """Schema for SuperAdmin API responses"""
    id: str
    username: str
    email: str
    full_name: str
    status: str
    is_primary: bool
    last_login: Optional[datetime]
    created_at: datetime
    
    model_config = ConfigDict(from_attributes=True)
