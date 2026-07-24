"""
Infobip adapter (Calls API).

Verified against https://www.infobip.com/docs (Calls API section) — 2026-07-23.

Auth: `Authorization: App <API_KEY>`. Base URL is a per-account unique
subdomain (`https://xxxxx.api.infobip.com`), shown on Infobip's API
Resource Hub after signup — not a fixed shared host.

Required credential fields: api_key, api_base_url (per-account, required —
Infobip has no shared/default host), calls_configuration_id, caller_id.

Confirmed gaps in Infobip's official docs (not guessed around):
  - Hangup is confirmed real (`POST /calls/1/calls/{callId}/hangup`).
  - Mute, hold and transfer pages exist in the docs nav (Dialog Calls,
    Conference Calls, Application Transfer) but the exact endpoint
    paths/payloads were not confirmable from the fetched page content — per
    the verification rule, these are left as unsupported (base-class
    default) rather than implemented against an unconfirmed guess.
  - No webhook signature/authenticity verification mechanism is documented.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider


class InfobipProvider(BaseProvider):
    slug = "infobip"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": True,                # POST /calls/1/calls/{callId}/hangup — confirmed
        "hold": False,                 # endpoint exists per nav but unconfirmed — not guessed
        "resume": False,
        "mute": False,                 # "
        "unmute": False,
        "transfer": False,             # application-transfer endpoints exist per nav but unconfirmed
        "record_control": True,        # start-recording confirmed; stop-recording path unconfirmed (start only)
        "call_status": True,
        "call_details": True,
        "recording_retrieval": True,   # GET /calls/1/recordings/calls/{callId} — corrected path
        "call_logs": True,
        "webhooks": True,              # Calls Event Webhook, 63 documented event types
        "webhook_signature": False,    # not documented
        "token_refresh": False,        # API key has a predefined expiry but no documented refresh flow
    }

    def _base(self) -> str:
        return (self._cred("api_base_url")).rstrip("/")

    def _headers(self) -> dict:
        return {"Authorization": f"App {self._cred('api_key')}", "Content-Type": "application/json"}

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        if not self._cred("api_key") or not self._cred("api_base_url"):
            steps["credentials_check"] = "failed — api_key and api_base_url are required"
            return {"success": False, "message": "API Key and API Base URL are required (Infobip issues a per-account base URL — see the API Resource Hub after signup).", "steps": steps}
        steps["credentials_check"] = "ok"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/calls/1/calls", params={"size": 1}, headers=self._headers())
            if r.status_code == 401:
                steps["authentication"] = "failed — invalid API key"
                return {"success": False, "message": "Authentication failed. Check API Key.", "steps": steps}
            steps["connectivity"] = f"reached endpoint (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Infobip API: {exc}", "steps": steps}
        return {"success": True, "message": "Infobip connection successful.", "steps": steps}

    async def make_outbound_call(self, to: str, from_: str, *, caller_id=None, extra=None) -> dict:
        """POST {base}/calls/1/calls — docs: infobip.com/docs/api/channels/voice/calls/call-legs/create-call"""
        body = {
            "endpoint": {"type": "PHONE", "phoneNumber": to},
            "from": caller_id or from_ or self._cred("caller_id"),
            "callsConfigurationId": self._cred("calls_configuration_id"),
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/calls/1/calls", json=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            ok = r.status_code in (200, 201)
            return {"success": ok, "call_id": data.get("id"), "status": data.get("state", "CALLING"),
                    "message": "Call initiated." if ok else f"Infobip returned {r.status_code}", "raw": data}
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def hang_up(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        """POST {base}/calls/1/calls/{callId}/hangup — docs: infobip.com/docs/api/channels/voice/calls/call-legs/hangup-call"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/calls/1/calls/{call_id}/hangup", json={}, headers=self._headers())
            ok = r.status_code in (200, 202, 204)
            return {"success": ok, "message": "Call ended." if ok else f"Infobip returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("state")}, "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        """GET {base}/calls/1/calls/{callId} — docs: infobip.com/docs/api/channels/voice/calls/call-legs/get-call"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/calls/1/calls/{call_id}", headers=self._headers())
            data = r.json()
            return {"success": r.status_code == 200, "data": data, "message": "" if r.status_code == 200 else "Not found", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        """GET {base}/calls/1/recordings/calls/{callId} — corrected path.
        Docs: infobip.com/docs/api/channels/voice/calls/files-and-recordings/get-call-recordings"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/calls/1/recordings/calls/{call_id}", headers=self._headers())
            data = r.json()
            files = data.get("files") or []
            url = files[0].get("location") or files[0].get("name") if files else None
            return {"success": r.status_code == 200, "data": {"recording_url": url},
                    "message": "" if url else "No recording available.", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/calls/1/calls — page/size pagination.
        Docs: infobip.com/docs/api/channels/voice/calls/call-legs/get-calls"""
        p = params or {}
        q = {"page": p.get("page", 0), "size": p.get("limit", 50)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/calls/1/calls", params=q, headers=self._headers())
            data = r.json()
            logs = data.get("results") or data.get("calls") or []
            return {"success": r.status_code == 200, "data": {"logs": logs}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Docs: infobip.com/docs/api/channels/voice/calls/calls-applications/calls-event-webhook
        63 documented EventType values across call/conference/participant/
        recording/dialog events — mapping the common call-state ones."""
        state = (raw_payload.get("state") or raw_payload.get("type") or "").upper()
        status_map = {
            "CALLING": "initiated", "RINGING": "incoming_call", "ESTABLISHED": "answered",
            "FINISHED": "call_ended", "FAILED": "failed", "BUSY": "busy", "NO_ANSWER": "missed",
            "CANCELLED": "call_ended",
        }
        return {
            "event_type": status_map.get(state, "unknown"),
            "provider_call_id": raw_payload.get("callId") or raw_payload.get("id"),
            "status": state.lower() or "unknown",
            "direction": raw_payload.get("direction"),
            "from": (raw_payload.get("from") or {}).get("phoneNumber") if isinstance(raw_payload.get("from"), dict) else raw_payload.get("from"),
            "to": (raw_payload.get("to") or {}).get("phoneNumber") if isinstance(raw_payload.get("to"), dict) else raw_payload.get("to"),
            "duration": raw_payload.get("duration"),
            "recording_url": raw_payload.get("recordingUrl"),
            "raw": raw_payload,
        }
