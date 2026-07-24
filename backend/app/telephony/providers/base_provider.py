"""
BaseProvider — common interface every telephony adapter must implement.

The CRM (telephony_service.py, API routes, webhook receiver) only ever calls
methods on this interface — never a provider-specific method. This is what
makes adding a new provider a "drop in a new file + register it" change with
zero edits to Recruitment, HRM, or any other core module.

CAPABILITY-VERIFIED DESIGN (important):
Not every provider's official API supports every operation below — this was
confirmed by directly reading each provider's official developer docs before
writing any adapter code (e.g. Exotel/Knowlarity/Kaleyra document no REST
hangup/hold/mute/transfer endpoints at all; Gupshup's voice product has no
documented call-status or recording-retrieval endpoint). Rather than guessing
an endpoint to fill the gap, every optional method below has a base-class
default that reports `{"supported": False}` with a clear reason. Adapters
override ONLY the methods their provider's official docs actually document.
`CAPABILITIES` lets callers (API routes, frontend) check support before
attempting a call, so an unsupported operation is hidden/rejected cleanly
rather than silently failing against a fabricated endpoint.

Return-shape conventions (kept consistent across every adapter):
  - Call actions  -> {"success": bool, "supported": bool, "call_id": str|None, "status": str, "message": str, "raw": dict}
  - Fetches       -> {"success": bool, "supported": bool, "data": dict|list, "message": str, "raw": dict}
  - test_connection / health_check -> {"success": bool, "message": str, "steps": dict}
  - process_webhook -> normalized common event dict (see utils/webhook_normalizer.py)
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Optional

# Capability keys understood by every adapter's CAPABILITIES dict. A key
# missing from an adapter's CAPABILITIES is treated as False (unsupported).
CAPABILITY_KEYS = (
    "click_to_call",       # make_outbound_call
    "hangup",
    "hold",
    "resume",
    "mute",
    "unmute",
    "transfer",
    "record_control",      # start/stop/pause recording mid-call
    "call_status",
    "call_details",
    "recording_retrieval",
    "call_logs",           # CDR / call history
    "webhooks",            # provider can push call-event webhooks to us
    "webhook_signature",   # provider signs/verifies its webhooks
    "token_refresh",       # provider uses expiring tokens needing refresh
    # Phase 4 — contact-center operations. Not declared True by any adapter
    # verified in Phase 1 (no confirmed queue or call-monitoring REST API
    # across any of the 10 providers researched) — these exist so a FUTURE
    # provider adapter can declare real support; every current adapter
    # reports False automatically since none set these keys.
    "queue_management",    # queue list / members / SLA
    "call_listen",         # supervisor silently listens to a live call
    "call_whisper",        # supervisor speaks to the agent only
    "call_barge",          # supervisor joins the call for all parties
)


class BaseProvider(ABC):
    """Abstract base for all telephony provider adapters."""

    slug: str = "base"

    # Per-provider truth table — every concrete adapter overrides this.
    # Any key not present defaults to False via get_capabilities().
    CAPABILITIES: dict[str, bool] = {}

    def __init__(self, credentials: dict):
        self.credentials = credentials or {}

    def get_capabilities(self) -> dict:
        """Return the full capability truth table for this provider,
        filling in False for any key the adapter didn't explicitly set."""
        return {key: self.CAPABILITIES.get(key, False) for key in CAPABILITY_KEYS}

    def _unsupported(self, capability: str, reason: Optional[str] = None) -> dict:
        """Standard response for a capability this provider's official API
        doesn't document. Used as the base-class default for every optional
        method so 'not implemented by us' is never confused with a real
        provider limitation — the message says exactly which is true."""
        msg = reason or f"'{capability}' is not supported by {self.slug}'s official API."
        return {
            "success": False, "supported": False, "call_id": None,
            "status": "unsupported", "data": None, "message": msg, "raw": {},
        }

    # ── Connection / health ────────────────────────────────────────────────

    @abstractmethod
    async def validate_connection(self) -> dict:
        """Verify stored credentials work against the provider's API.
        Returns {"success": bool, "message": str, "steps": dict}.
        For a provider with no verified official docs (registered-but-blocked),
        this must return success=False with a clear explanation — never a
        fabricated check."""
        ...

    async def health_check(self) -> dict:
        """Lightweight liveness check. Defaults to validate_connection()
        unless a provider has a cheaper dedicated endpoint."""
        return await self.validate_connection()

    async def refresh_token(self) -> dict:
        """Refresh an expiring auth token. Only meaningful for providers with
        CAPABILITIES['token_refresh'] = True; default is a no-op success for
        providers using static, non-expiring credentials."""
        if not self.CAPABILITIES.get("token_refresh"):
            return {"success": True, "message": "This provider uses static credentials — no token refresh needed."}
        return self._unsupported("token_refresh")

    # ── Call control ───────────────────────────────────────────────────────

    @abstractmethod
    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None,
        extra: Optional[dict] = None,
    ) -> dict:
        """Initiate an outbound (click-to-call) call."""
        ...

    async def hang_up(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        """Terminate an in-progress call. Base default: unsupported — override
        only if the provider's official docs document a real hangup/terminate
        endpoint (several providers researched do not: call termination is
        console/agent-UI-only on their platforms)."""
        return self._unsupported("hangup")

    async def hold(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        """`extra` carries provider-specific context some adapters require
        (e.g. Twilio needs the Conference SID a plain call was bridged into —
        hold/mute are conference-participant concepts on Twilio, not direct
        per-call actions; without it, Twilio's adapter reports unsupported
        for that specific call rather than guessing a conference)."""
        return self._unsupported("hold")

    async def resume(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("resume")

    async def mute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("mute")

    async def unmute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("unmute")

    async def transfer(self, call_id: str, target: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("transfer")

    async def handle_incoming_call(self, payload: dict) -> dict:
        """Normalize an inbound-call notification (usually delivered via
        webhook already, so most providers route this through
        process_webhook — kept as a distinct method for providers whose
        inbound-call event is a separate live API call rather than a webhook)."""
        return await self.process_webhook(payload, headers={})

    # ── Status / history / recordings ─────────────────────────────────────
    # Base defaults are "unsupported" — override only where the provider's
    # official docs document the endpoint (e.g. Gupshup's voice product has
    # no documented single-call-status or recording-retrieval endpoint).

    async def fetch_call_status(self, call_id: str) -> dict:
        return self._unsupported("call_status")

    async def fetch_call_details(self, call_id: str) -> dict:
        return self._unsupported("call_details")

    async def fetch_call_recording(self, call_id: str) -> dict:
        """Return {"success": bool, "data": {"recording_url": str|None}, ...}."""
        return self._unsupported("recording_retrieval")

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """Return {"success": bool, "data": {"logs": [...]}, ...}."""
        return self._unsupported("call_logs")

    # ── Webhooks ────────────────────────────────────────────────────────────

    @abstractmethod
    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Convert this provider's raw webhook payload into the common
        internal event shape:
          {
            "event_type": "incoming_call"|"answered"|"missed"|"busy"|"failed"
                           |"call_ended"|"recording_ready"|"voicemail"|"unknown",
            "provider_call_id": str|None,
            "status": str,
            "direction": "inbound"|"outbound"|None,
            "from": str|None,
            "to": str|None,
            "duration": int|None,
            "recording_url": str|None,
            "raw": dict,
          }
        For a provider with CAPABILITIES['webhooks'] = False (no documented
        push-webhook mechanism), return an event_type of "unsupported" — the
        webhook receiver route only reaches this for a provider actually
        configured, so this path being hit for a non-webhook provider means
        a raw payload arrived at a URL nothing should be calling.
        """
        ...

    # ── Contact-center operations (Phase 4) ─────────────────────────────────
    # Base defaults are "unsupported" for every current adapter (see
    # CAPABILITY_KEYS note above) — kept here so a future provider with real
    # queue/monitoring support only needs to override these, not invent a
    # new interface.

    async def get_queue_list(self) -> dict:
        return self._unsupported("queue_management")

    async def get_queue_members(self, queue_id: str) -> dict:
        return self._unsupported("queue_management")

    async def listen(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("call_listen")

    async def whisper(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("call_whisper")

    async def barge(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return self._unsupported("call_barge")

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        """Optional signature/secret verification. Providers with a
        documented signing scheme override this; the base default is
        permissive because most providers researched document NO signature
        mechanism at all — the caller (telephony_service.py) additionally
        gates on the tenant's own configured shared secret regardless, so
        this is a defense-in-depth layer, not the only one."""
        return True

    # ── Shared helpers ─────────────────────────────────────────────────────

    def _cred(self, key: str, default: Any = "") -> Any:
        val = self.credentials.get(key, default)
        return val.strip() if isinstance(val, str) else val
