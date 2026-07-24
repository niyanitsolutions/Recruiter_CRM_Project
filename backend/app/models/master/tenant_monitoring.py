"""
Tenant Activity Monitoring & Super Admin Business Notification models (master_db)

Additive module — does not modify TenantModel, NotificationModel, or any
other existing model. Two new master_db collections back this feature:

  - master_db.super_admin_notifications  (SuperAdminNotificationModel)
  - master_db.tenant_activity_status     (TenantActivityStatusModel)
"""

from datetime import datetime, timezone
from typing import Optional, Dict, Any
from enum import Enum
from pydantic import ConfigDict, BaseModel, Field
import uuid


class SuperAdminNotificationType(str, Enum):
    """Tenant lifecycle / business event types surfaced to the Super Admin only."""
    TENANT_REGISTERED = "tenant_registered"
    SUBSCRIPTION_PURCHASED = "subscription_purchased"
    SUBSCRIPTION_RENEWED = "subscription_renewed"
    TRIAL_EXPIRED = "trial_expired"
    PAYMENT_FAILED = "payment_failed"
    TENANT_INACTIVE = "tenant_inactive"


SUPER_ADMIN_NOTIFICATION_TYPE_DISPLAY = {
    SuperAdminNotificationType.TENANT_REGISTERED: "New Tenant Registered",
    SuperAdminNotificationType.SUBSCRIPTION_PURCHASED: "Subscription Purchased",
    SuperAdminNotificationType.SUBSCRIPTION_RENEWED: "Subscription Renewed",
    SuperAdminNotificationType.TRIAL_EXPIRED: "Trial Expired",
    SuperAdminNotificationType.PAYMENT_FAILED: "Payment Failed",
    SuperAdminNotificationType.TENANT_INACTIVE: "Tenant Inactive",
}


class SuperAdminNotificationModel(BaseModel):
    """
    A single Super-Admin-facing notification about a tenant lifecycle/business event.

    Stored in: master_db.super_admin_notifications

    This is intentionally a separate collection from the per-tenant
    `company_db.notifications` used by NotificationService — there is no
    existing tenant->super-admin notification concept in the codebase, so
    this mirrors that model's shape/conventions rather than repurposing it.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")

    type: SuperAdminNotificationType
    title: str
    message: str

    company_id: Optional[str] = None
    company_name: Optional[str] = None
    data: Optional[Dict[str, Any]] = None

    is_read: bool = Field(default=False)
    read_at: Optional[datetime] = None

    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)

    def to_dict(self) -> dict:
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data


class SuperAdminNotificationResponse(BaseModel):
    """Response schema for the Super Admin notification feed."""
    id: str
    type: SuperAdminNotificationType
    type_display: Optional[str] = None
    title: str
    message: str
    company_id: Optional[str] = None
    company_name: Optional[str] = None
    data: Optional[Dict[str, Any]] = None
    is_read: bool = False
    read_at: Optional[datetime] = None
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class TenantActivityStatusModel(BaseModel):
    """
    Per-tenant activity tracking + inactivity-alert dedupe state.

    Stored in: master_db.tenant_activity_status  (one document per company_id)

    `last_activity_at` is updated (debounced) on every authenticated,
    successful request for a tenant's users by TenantActivityTrackerMiddleware.
    The daily monitor job reads this to decide ACTIVE vs INACTIVE and uses
    `inactive_alert_sent_at` / `inactive_since` to avoid re-sending an email
    every day for the same unbroken inactivity streak.
    """
    id: str = Field(default_factory=lambda: str(uuid.uuid4()), alias="_id")
    company_id: str

    last_activity_at: Optional[datetime] = None

    # Inactivity-alert dedupe: inactive_since snapshots last_activity_at at
    # the moment the alert fired. If last_activity_at hasn't moved since,
    # it's still the same streak -> don't re-alert. Once activity resumes
    # and last_activity_at advances, the next inactive streak is treated as new.
    inactive_alert_sent_at: Optional[datetime] = None
    inactive_since: Optional[datetime] = None

    # Trial-expiry alert dedupe (one alert per tenant, reset is not needed
    # since a tenant doesn't un-expire without an admin action elsewhere).
    trial_expired_alert_sent: bool = Field(default=False)

    updated_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

    model_config = ConfigDict(populate_by_name=True)

    def to_dict(self) -> dict:
        data = self.model_dump(by_alias=True)
        data["_id"] = data.pop("_id", self.id)
        return data
