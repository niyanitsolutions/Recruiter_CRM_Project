"""
Airtel IQ adapter — BLOCKED, not implemented.

Verified research against Airtel IQ's official domains
(airtel.in/business/b2b/airtel-iq/api-docs/..., airtel.in/business/b2b/
airtel-iq, github.com/airteliq) on 2026-07-23 found:
  - The official API docs page is a JavaScript-rendered SPA that returns no
    crawlable technical content — every fetch attempt (5+ URL variants)
    returned only the page title "Airtel IQ - API Documentation" with no
    endpoints, auth details, or schemas.
  - The product's marketing pages have no self-serve signup, free trial, or
    visible API-key/console flow — every call-to-action is "Talk to an
    Expert" leading to a sales-contact form.
  - Airtel IQ's own official GitHub sample code
    (github.com/airteliq/airtel-iq-click-to-call-sample) confirms
    integrators must "connect with Airtel IQ to get callback URLs
    whitelisted" — a manual, non-self-serve step, and describes only a
    high-level `vmSessionId` flow, not concrete endpoints/payloads.
  - A login-gated partner portal (cpaasportal.videoiq.airtel.in) appears to
    exist but could not be reached to confirm.

Per this integration's verification rule — implement only from official,
publicly reachable documentation, and stop rather than guess when it isn't
— this provider is **registered in the Provider Factory but disabled**. It
stays selectable-but-blocked in Super Admin (so the option exists and the
gap is visible) until Airtel provides the actual gated documentation,
Postman collection, or sandbox credentials directly.
"""
from __future__ import annotations

from typing import Optional

from .base_provider import BaseProvider

_BLOCKED_MESSAGE = (
    "Airtel IQ is registered but not available: its official API "
    "documentation is not publicly reachable (a JavaScript app that renders "
    "no technical content), and the product funnels exclusively to a sales "
    "contact form with no self-serve signup found. This provider will be "
    "implemented once Airtel provides the actual documentation, a Postman "
    "collection, or sandbox credentials directly — see the module "
    "docstring for what was checked."
)


class AirtelIQProvider(BaseProvider):
    slug = "airtel_iq"

    CAPABILITIES = {key: False for key in (
        "click_to_call", "hangup", "hold", "resume", "mute", "unmute", "transfer",
        "record_control", "call_status", "call_details", "recording_retrieval",
        "call_logs", "webhooks", "webhook_signature", "token_refresh",
    )}

    async def validate_connection(self) -> dict:
        return {"success": False, "message": _BLOCKED_MESSAGE, "steps": {"status": "blocked — see module docstring"}}

    async def make_outbound_call(self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None) -> dict:
        return self._unsupported("click_to_call", _BLOCKED_MESSAGE)

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        return {
            "event_type": "unsupported", "provider_call_id": None, "status": "unsupported",
            "direction": None, "from": None, "to": None, "duration": None,
            "recording_url": None, "raw": raw_payload,
        }
