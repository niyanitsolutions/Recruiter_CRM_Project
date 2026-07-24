"""
Tata Smartflo (Tata Tele Business Services) adapter.

Verified against https://docs.smartflo.tatatelebusiness.com — 2026-07-23.

Auth: Bearer token. Two ways to obtain one, both supported by this adapter:
  - Portal-generated static token (from the Smartflo web console) — does not
    expire. This is what Super Admin pastes into `api_token` normally.
  - API-generated login token (`POST /v1/auth/login` with email+password) —
    expires after 60 minutes; `POST /v1/auth/refresh` extends it. Provided
    here as `refresh_token()` for forward compatibility with a future
    token-refresh worker; not auto-persisted anywhere yet (out of scope for
    this phase — no background job infrastructure exists yet).

Credential fields: api_token (required), agent_number, caller_id,
api_base_url (override), email/password (optional, only if using the
login-token flow instead of a portal-generated static token).

Confirmed gaps in Tata's official docs (not guessed around):
  - No REST hold/mute/resume endpoint is documented — only Monitor/Whisper/
    Barge/Transfer (via /v1/call/options) and Hangup exist as call-control.
  - No webhook signature/authenticity verification mechanism is documented.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider

_DEFAULT_BASE = "https://api-smartflo.tatateleservices.com/v1"


class TataSmartfloProvider(BaseProvider):
    slug = "tata_smartflo"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": True,               # POST /v1/call/hangup
        "hold": False,                # not documented
        "resume": False,               # not documented
        "mute": False,                 # not documented
        "unmute": False,               # not documented
        "transfer": True,              # POST /v1/call/options (type=4)
        "record_control": False,       # not documented as a separate control
        "call_status": True,           # via CDR filtered by call_id
        "call_details": True,          # "
        "recording_retrieval": True,   # recording_url embedded in CDR record
        "call_logs": True,             # GET /v1/call/records
        "webhooks": True,              # provider pushes events (console-configured)
        "webhook_signature": False,    # no verification mechanism documented
        "token_refresh": True,         # only for login-token flow, 60-min expiry
    }

    def _base(self) -> str:
        return (self._cred("api_base_url") or _DEFAULT_BASE).rstrip("/")

    def _headers(self) -> dict:
        return {"Authorization": self._cred("api_token"), "Content-Type": "application/json"}

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        token = self._cred("api_token")
        steps["credentials_check"] = "checking"
        if not token:
            steps["credentials_check"] = "failed — api_token is required"
            return {"success": False, "message": "API Token is required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call/records", params={"limit": 1, "page": 1}, headers=self._headers())
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid API token"
                return {"success": False, "message": "Authentication failed. Check API Token.", "steps": steps}
            if r.status_code not in (200, 400):
                steps["connectivity"] = f"unexpected status {r.status_code}"
                return {"success": False, "message": f"Tata Smartflo returned {r.status_code}.", "steps": steps}
            steps["connectivity"] = "ok"
            steps["authentication"] = "ok"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Tata Smartflo API: {exc}", "steps": steps}

        return {"success": True, "message": "Tata Smartflo connection successful.", "steps": steps}

    async def refresh_token(self) -> dict:
        """POST /v1/auth/refresh — header Authorization: <current token>.
        Only meaningful if `api_token` was obtained via the login flow
        (POST /v1/auth/login); portal-generated static tokens don't expire
        and don't need this. Docs: https://docs.smartflo.tatatelebusiness.com/reference/v1authrefresh"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/auth/refresh", headers=self._headers())
            data = r.json() if r.status_code == 200 else {}
            if r.status_code != 200:
                return {"success": False, "message": f"Token refresh failed ({r.status_code})."}
            return {"success": True, "message": "Token refreshed.", "new_token": data.get("access_token")}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        body = {
            "agent_number": from_ or self._cred("agent_number"),
            "destination_number": to,
            "caller_id": caller_id or self._cred("caller_id"),
            "async": 1,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/click_to_call", json=body, headers=self._headers())
            data = r.json() if r.headers.get("content-type", "").startswith("application/json") else {}
            ok = r.status_code in (200, 201, 202) and data.get("Success", data.get("success", True))
            # Docs confirm Success/Message fields; a call_id/uuid is not
            # guaranteed in this response — correlate via CDR (call_logs) by
            # destination_number + time if the provider doesn't echo one back.
            call_id = data.get("call_id") or data.get("id") or data.get("uuid")
            return {"success": bool(ok), "call_id": call_id, "status": "initiated" if ok else "failed",
                    "message": data.get("Message") or data.get("message", "Call initiated." if ok else "Call failed."),
                    "raw": data}
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def hang_up(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        """POST /v1/call/hangup — body: call_id.
        Docs: https://docs.smartflo.tatatelebusiness.com/reference/v1callhangup"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/call/hangup", json={"call_id": call_id}, headers=self._headers())
            ok = r.status_code in (200, 202)
            return {"success": ok, "message": "Call ended." if ok else f"Smartflo returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def transfer(self, call_id: str, target: str, *, extra: Optional[dict] = None) -> dict:
        """POST /v1/call/options — type=4 (Transfer). `target` is the
        intercom destination (mobile/extension/department ID per docs).
        Docs: https://docs.smartflo.tatatelebusiness.com/reference/v1calloptions"""
        body = {"type": 4, "call_id": call_id, "intercom": [target]}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/call/options", json=body, headers=self._headers())
            ok = r.status_code in (200, 202)
            return {"success": ok, "supported": True,
                    "message": "Call transferred." if ok else f"Smartflo returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "supported": True, "message": str(exc)}

    async def _cdr_lookup(self, call_id: str) -> dict:
        """Shared helper: Tata has no single-call-details endpoint — status
        and details both come from filtering the CDR (call/records) by
        call_id. Docs: https://docs.smartflo.tatatelebusiness.com/reference/v1callrecords"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call/records", params={"call_id": call_id}, headers=self._headers())
            data = r.json()
            results = data.get("results") or data.get("data") or []
            if r.status_code != 200 or not results:
                return {"success": False, "data": {}, "message": "Call not found in CDR.", "raw": data}
            return {"success": True, "data": results[0], "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self._cdr_lookup(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("status")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        return await self._cdr_lookup(call_id)

    async def fetch_call_recording(self, call_id: str) -> dict:
        detail = await self._cdr_lookup(call_id)
        url = (detail.get("data") or {}).get("recording_url")
        return {"success": detail["success"], "data": {"recording_url": url},
                "message": "" if url else "No recording available.", "raw": detail.get("raw", {})}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        q = {"limit": (params or {}).get("limit", 50), "page": (params or {}).get("page", 1)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call/records", params=q, headers=self._headers())
            data = r.json()
            logs = data.get("results") or data.get("data") or []
            return {"success": r.status_code == 200, "data": {"logs": logs}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        status_map = {
            "ringing": "incoming_call", "answered": "answered", "completed": "call_ended",
            "busy": "busy", "failed": "failed", "no-answer": "missed", "missed": "missed",
        }
        raw_status = (raw_payload.get("status") or raw_payload.get("call_status") or raw_payload.get("$call_status") or "").lower()
        event_type = status_map.get(raw_status, "unknown")
        recording_url = raw_payload.get("recording_url") or raw_payload.get("$recording_url")
        if recording_url and event_type == "call_ended":
            event_type = "recording_ready"

        return {
            "event_type": event_type,
            "provider_call_id": raw_payload.get("call_id") or raw_payload.get("$call_id") or raw_payload.get("uuid"),
            "status": raw_status or "unknown",
            "direction": raw_payload.get("direction"),
            "from": raw_payload.get("caller_id_number") or raw_payload.get("$caller_id_number") or raw_payload.get("from"),
            "to": raw_payload.get("destination_number") or raw_payload.get("$call_to_number") or raw_payload.get("to"),
            "duration": raw_payload.get("duration") or raw_payload.get("$duration"),
            "recording_url": recording_url,
            "raw": raw_payload,
        }

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        """Tata Smartflo documents no signature/authenticity mechanism for
        webhooks — verification relies entirely on the tenant's own
        configured shared secret (checked generically by the caller in
        telephony_service.py before this is invoked)."""
        return True
