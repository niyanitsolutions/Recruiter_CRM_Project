"""
Kaleyra IO adapter.

Verified against https://developers.kaleyra.io — 2026-07-23.

Auth: header `api-key: <API_KEY>`, form-urlencoded requests, account SID
embedded in the URL path (`/v1/<SID>/voice/...`).

Credential fields: api_key (required), sid (required), bridge (default
originating DID for outbound/click-to-call), caller_id, api_base_url
(override; default https://api.kaleyra.io/v1), webhook_secret.

Confirmed gaps in Kaleyra's official docs (not guessed around):
  - No hangup/hold/mute/transfer/resume REST endpoint exists — the Voice API
    is a fire-and-forget outbound-call/IVR-flow API (Outbound Calling API +
    Click to Call API), not a real-time in-call-control API.
  - No webhook payload JSON schema was found documented (only the delivery
    -config side — callback profiles). No HMAC/signature verification
    exists; only HTTP Basic Auth or a custom header can be configured on the
    receiving side, neither of which is a payload-authenticity signature.
  - Recording extraction (`POST .../voice/recordings`) takes a recording
    `id`. Whether that id is always identical to the call_id used elsewhere
    in this API was not confirmed from docs — this adapter passes call_id
    through as-is (a reasonable, explicitly-flagged assumption, not a
    fabricated endpoint); if the IDs differ, this will cleanly 404 rather
    than return wrong data.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider

_DEFAULT_BASE = "https://api.kaleyra.io/v1"


class KaleyraProvider(BaseProvider):
    slug = "kaleyra"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": False,               # not documented — fire-and-forget API
        "hold": False,
        "resume": False,
        "mute": False,
        "unmute": False,
        "transfer": False,
        "record_control": False,
        "call_status": True,           # via call-log-pull filtered by call_id
        "call_details": True,
        "recording_retrieval": True,   # POST .../voice/recordings — see id caveat above
        "call_logs": True,
        "webhooks": True,              # callback profiles / direct URL delivery
        "webhook_signature": False,    # Basic Auth or custom header only, no HMAC
        "token_refresh": False,        # static API key
    }

    def _base(self) -> str:
        base = (self._cred("api_base_url") or _DEFAULT_BASE).rstrip("/")
        return f"{base}/{self._cred('sid')}/voice"

    def _headers(self) -> dict:
        return {"api-key": self._cred("api_key")}

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        if not self._cred("api_key") or not self._cred("sid"):
            steps["credentials_check"] = "failed — sid and api_key are required"
            return {"success": False, "message": "Account SID and API Key are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call-logs", params={"limit": 1}, headers=self._headers())
            if r.status_code == 401:
                steps["authentication"] = "failed — invalid API key"
                return {"success": False, "message": "Authentication failed. Check API Key.", "steps": steps}
            steps["connectivity"] = f"reached endpoint (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Kaleyra API: {exc}", "steps": steps}
        return {"success": True, "message": "Kaleyra connection successful.", "steps": steps}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        """POST {base}/click-to-call — docs: developers.kaleyra.io/docs/click-to-call-api"""
        body = {
            "from": from_,
            "to": to,
            "bridge": caller_id or self._cred("bridge"),
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/click-to-call", data=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            ok = r.status_code in (200, 201, 202) and str(data.get("code", "")).startswith(("RBC", "2"))
            return {
                "success": bool(ok), "call_id": None,  # no call-id field in response; correlate via call-logs
                "status": "initiated" if ok else "failed",
                "message": data.get("message", "Call initiated." if ok else "Call failed."), "raw": data,
            }
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("status")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        """GET {base}/call-logs?call_id=... — docs: developers.kaleyra.io/docs/call-log-pull-api
        No dedicated single-call endpoint exists; filter the log-pull by call_id."""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call-logs", params={"call_id": call_id, "limit": 1}, headers=self._headers())
            data = r.json()
            records = data.get("data") or data.get("records") or []
            if r.status_code != 200 or not records:
                return {"success": False, "data": {}, "message": "Call not found.", "raw": data}
            return {"success": True, "data": records[0], "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        """POST {base}/recordings — body: id, validity (link TTL minutes).
        Docs: developers.kaleyra.io/docs/call-recording-extraction-api
        Not available for North America region accounts (per docs)."""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/recordings", data={"id": call_id, "validity": 60}, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            url = (data.get("data") or {}).get("link")
            return {"success": r.status_code == 200 and bool(url), "data": {"recording_url": url},
                    "message": "" if url else "No recording available.", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/call-logs — start_time/end_time max 7-day window.
        Docs: developers.kaleyra.io/docs/call-log-pull-api"""
        p = params or {}
        q = {"limit": p.get("limit", 25), "page": p.get("page", 1)}
        if p.get("start_time"):
            q["start_time"] = p["start_time"]
        if p.get("end_time"):
            q["end_time"] = p["end_time"]
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call-logs", params=q, headers=self._headers())
            data = r.json()
            logs = data.get("data") or data.get("records") or []
            return {"success": r.status_code == 200, "data": {"logs": logs}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Docs: developers.kaleyra.io/docs/callback-profiles-in-voice-apis
        Events: call_start, call_answer, call_end (outbound); from_call_start,
        to_call_start, from_call_answer, to_call_answer, call_end (click-to-call).
        Exact payload field names are not documented — this maps the most
        commonly-used generic key names; verify against a live payload before
        relying on this in production."""
        event = (raw_payload.get("event") or raw_payload.get("status") or "").lower()
        event_map = {
            "call_start": "initiated", "from_call_start": "initiated", "to_call_start": "initiated",
            "call_answer": "answered", "from_call_answer": "answered", "to_call_answer": "answered",
            "call_end": "call_ended",
        }
        return {
            "event_type": event_map.get(event, "unknown"),
            "provider_call_id": raw_payload.get("call_id") or raw_payload.get("id"),
            "status": event or "unknown",
            "direction": raw_payload.get("direction"),
            "from": raw_payload.get("from") or raw_payload.get("caller"),
            "to": raw_payload.get("to") or raw_payload.get("callee"),
            "duration": raw_payload.get("duration"),
            "recording_url": raw_payload.get("recording_url"),
            "raw": raw_payload,
        }
