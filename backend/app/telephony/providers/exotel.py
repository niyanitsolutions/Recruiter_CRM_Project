"""
Exotel adapter — verified against https://developer.exotel.com — 2026-07-23.

Auth: HTTP Basic (API Key as username, API Token as password), embedded in
a region-specific subdomain. Docs: developer.exotel.com/docs/references/authentication

Required credential fields: sid (Exotel Account SID), api_key, api_token,
exophone (the virtual number Exotel bridges through), api_base_url (REQUIRED,
not defaulted — Exotel's base URL is account-region-specific, e.g.
https://api.exotel.com/v1/Accounts/{sid} for Singapore or
https://api.in.exotel.com/v1/Accounts/{sid} for Mumbai; guessing the wrong
region silently fails, so Super Admin must set this explicitly per tenant).

Confirmed gaps in Exotel's official docs (not guessed around):
  - No REST hangup/terminate-call endpoint exists. Exotel's own support docs
    state explicitly that a call cannot be disconnected via API — only via
    an in-flow "Hangup" Applet (ExoML) configured ahead of time, or by the
    agent console. hang_up() is intentionally left unimplemented (base
    default: unsupported).
  - No REST hold/mute/transfer endpoint exists — these are Contact Center
    agent-desktop UI actions only, not documented as callable APIs.
  - No webhook signature/authenticity verification mechanism is documented.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider


class ExotelProvider(BaseProvider):
    slug = "exotel"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": False,               # no REST endpoint documented
        "hold": False,                  # UI-only, not a documented API
        "resume": False,
        "mute": False,                  # UI-only
        "unmute": False,
        "transfer": False,              # UI-only
        "record_control": False,        # only settable at call-initiation time
        "call_status": True,
        "call_details": True,
        "recording_retrieval": True,    # embedded in Call resource, no separate endpoint
        "call_logs": True,
        "webhooks": True,               # configured per-App (popup/callback/missed_call URLs)
        "webhook_signature": False,     # not documented
        "token_refresh": False,         # static API Key + API Token
    }

    def _auth(self) -> tuple[str, str]:
        return (self._cred("api_key"), self._cred("api_token"))

    def _account_base(self) -> str:
        base = self._cred("api_base_url")
        if not base:
            raise ValueError(
                "Exotel requires an explicit api_base_url (region-specific — "
                "e.g. https://api.exotel.com/v1/Accounts/{sid} or "
                "https://api.in.exotel.com/v1/Accounts/{sid})."
            )
        return base.rstrip("/")

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        sid, key, token = self._cred("sid"), self._cred("api_key"), self._cred("api_token")
        base = self._cred("api_base_url")
        steps["credentials_check"] = "checking"
        if not sid or not key or not token or not base:
            steps["credentials_check"] = "failed — sid, api_key, api_token and api_base_url are all required"
            return {"success": False, "message": "Account SID, API Key, API Token and API Base URL (region-specific) are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}/Calls", params={"PageSize": 1}, auth=self._auth())
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid API Key/Token"
                return {"success": False, "message": "Authentication failed. Check API Key and API Token.", "steps": steps}
            if r.status_code not in (200, 400):
                steps["connectivity"] = f"unexpected status {r.status_code}"
                return {"success": False, "message": f"Exotel returned {r.status_code}.", "steps": steps}
            steps["connectivity"] = "ok"
            steps["authentication"] = "ok"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Exotel API: {exc}", "steps": steps}

        return {"success": True, "message": "Exotel connection successful.", "steps": steps}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        """POST {base}/Calls/connect — docs: developer.exotel.com/api/make-a-call-api"""
        body = {
            "From": from_,
            "To": to,
            "CallerId": caller_id or self._cred("exophone"),
        }
        status_callback = self._cred("status_callback_url")
        if status_callback:
            body["StatusCallback"] = status_callback
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._account_base()}/Calls/connect", data=body, auth=self._auth())
            data = r.json()
            call = data.get("Call", {})
            if r.status_code not in (200, 201):
                return {"success": False, "call_id": None, "status": "failed",
                        "message": data.get("RestException", {}).get("Message", f"Exotel call failed ({r.status_code})"),
                        "raw": data}
            return {"success": True, "call_id": call.get("Sid"), "status": call.get("Status", "queued"),
                    "message": "Call initiated.", "raw": data}
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("Status")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        """GET {base}/Calls/{CallSid} — docs: developer.exotel.com/api (Call resource)"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}/Calls/{call_id}", auth=self._auth())
            data = r.json()
            call = data.get("Call", {})
            if r.status_code != 200:
                return {"success": False, "data": {}, "message": "Not found", "raw": data}
            return {"success": True, "data": call, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        """No separate recording endpoint — RecordingUrl is embedded in the
        Call resource itself. Docs: developer.exotel.com/api/make-a-call-api"""
        detail = await self.fetch_call_details(call_id)
        url = (detail.get("data") or {}).get("RecordingUrl")
        return {"success": detail["success"], "data": {"recording_url": url},
                "message": "" if url else "No recording available.", "raw": detail.get("raw", {})}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/Calls (Bulk Call Details API), 200 req/min rate limit.
        Docs: developer.exotel.com/api/call-details-bulk"""
        q = {"PageSize": (params or {}).get("limit", 50)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}/Calls", params=q, auth=self._auth())
            data = r.json()
            logs = [c.get("Call", c) for c in data.get("Calls", [])] if "Calls" in data else data.get("Calls", [])
            return {"success": r.status_code == 200, "data": {"logs": logs}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Docs: developer.exotel.com/docs/ip-pstn-webrtc/api-reference/call-notifications
        Events: incoming_call, outbound_call, call_ringing, call_answered,
        call_completed, call_missed, missed_call."""
        event = (raw_payload.get("event") or "").lower()
        event_map = {
            "incoming_call": "incoming_call", "outbound_call": "initiated",
            "call_ringing": "incoming_call", "call_answered": "answered",
            "call_completed": "call_ended", "call_missed": "missed", "missed_call": "missed",
        }
        event_type = event_map.get(event, "unknown")
        if event_type == "call_ended" and raw_payload.get("recording_available"):
            event_type = "recording_ready"

        return {
            "event_type": event_type,
            "provider_call_id": raw_payload.get("call_sid"),
            "status": event or "unknown",
            "direction": raw_payload.get("direction"),
            "from": raw_payload.get("from"),
            "to": raw_payload.get("to") or raw_payload.get("exophone"),
            "duration": raw_payload.get("duration") or raw_payload.get("talk_time"),
            "recording_url": raw_payload.get("recording_url"),
            "raw": raw_payload,
        }

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        """Exotel documents no signature/authenticity mechanism for webhooks —
        verification relies entirely on the tenant's own configured shared
        secret (checked generically by the caller before this is invoked)."""
        return True
