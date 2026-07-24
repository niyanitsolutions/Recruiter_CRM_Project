"""Pydantic request/response schemas for the Telephony API surface.
Storage itself uses raw dicts (matching the rest of this codebase's Mongo
document convention) — these models only shape the HTTP boundary."""
from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, Field


class TelephonyCredentialsPayload(BaseModel):
    """Generic per-provider credential bag — only the fields relevant to the
    selected provider are stored (see PROVIDER_META[provider]['fields'])."""
    account_sid: Optional[str] = None
    auth_token: Optional[str] = None
    from_number: Optional[str] = None
    twiml_url: Optional[str] = None
    status_callback_url: Optional[str] = None
    api_token: Optional[str] = None
    agent_number: Optional[str] = None
    caller_id: Optional[str] = None
    api_base_url: Optional[str] = None
    sid: Optional[str] = None
    api_key: Optional[str] = None
    exophone: Optional[str] = None
    sr_number: Optional[str] = None
    username: Optional[str] = None
    company_id: Optional[str] = None
    calls_configuration_id: Optional[str] = None
    webhook_secret: Optional[str] = None
    # Knowlarity
    sr_api_key: Optional[str] = None
    application_access_key: Optional[str] = None
    channel_tier: Optional[str] = None
    # Ozonetel
    phone_name: Optional[str] = None
    campaign_name: Optional[str] = None
    did: Optional[str] = None
    # Kaleyra
    bridge: Optional[str] = None
    # Gupshup
    authorization_key: Optional[str] = None
    x_api_key: Optional[str] = None
    k_number: Optional[str] = None
    country_code: Optional[str] = None


class SaveTelephonySettingsRequest(BaseModel):
    provider: str
    credentials: TelephonyCredentialsPayload
    caller_ids: list[str] = Field(default_factory=list)
    activate: bool = False


class ToggleTelephonyRequest(BaseModel):
    enabled: bool


class SetTelephonyProviderRequest(BaseModel):
    provider: str


class TestTelephonyConnectionRequest(BaseModel):
    provider: str
    credentials: TelephonyCredentialsPayload


class CallControlRequest(BaseModel):
    """Body for hold/resume/mute/unmute (and hangup, which also accepts this
    shape) — `extra` carries provider-specific context some adapters require
    (e.g. Twilio's conference_sid, Ozonetel's conference_number/did/agent_phone_name)."""
    extra: Optional[dict] = None


class TransferCallRequest(BaseModel):
    target: str
    extra: Optional[dict] = None


class MakeCallRequest(BaseModel):
    to: str
    from_number: Optional[str] = None
    candidate_id: Optional[str] = None
    employee_id: Optional[str] = None
    client_id: Optional[str] = None


class UpdateNotesRequest(BaseModel):
    notes: str


class FavoriteCreateRequest(BaseModel):
    phone: str
    name: str
    candidate_id: Optional[str] = None
    employee_id: Optional[str] = None
    group: Optional[str] = None


class SetDispositionRequest(BaseModel):
    disposition: str


class AddDispositionOptionRequest(BaseModel):
    label: str


class SetCallbackStatusRequest(BaseModel):
    status: str


class SetPresenceRequest(BaseModel):
    status: str  # available | busy | break (system-derived states rejected at the service layer)


class ReassignCallRequest(BaseModel):
    assigned_to: str


class RecordingReviewRequest(BaseModel):
    favorited: Optional[bool] = None
    bookmarked: Optional[bool] = None
    tags: Optional[list[str]] = None
    comment: Optional[str] = None


class MonitorCallRequest(BaseModel):
    """Body for listen/whisper/barge — no fields required today, kept as a
    distinct model so a future provider needing extra context (analogous to
    Twilio's conference_sid for hold/mute) doesn't require a route signature
    change."""
    extra: Optional[dict] = None


class CallLogResponse(BaseModel):
    id: str
    provider: str
    call_id: Optional[str] = None
    caller: Optional[str] = None
    receiver: Optional[str] = None
    candidate_id: Optional[str] = None
    employee_id: Optional[str] = None
    client_id: Optional[str] = None
    status: str
    direction: Optional[str] = None
    duration: Optional[int] = None
    recording_url: Optional[str] = None
    notes: Optional[str] = None
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
