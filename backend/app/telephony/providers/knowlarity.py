"""
Knowlarity (SuperReceptionist / SR API) adapter.

Verified against https://developer.knowlarity.com — 2026-07-23.

Auth: TWO required headers on every request —
  Authorization: <sr_api_key>
  x-api-key: <application_access_key>
Both are separate credentials issued by Knowlarity; neither is optional.

Base URL is plan-tier-specific: https://kpi.knowlarity.com/{channel_tier}/v1/
where channel_tier ∈ Basic | Advance | Premium | Enterprise.

Credential fields: sr_api_key (required), application_access_key (required),
sr_number (the SR/k_number to dial from), channel_tier (default "Basic"),
api_base_url (override).

Confirmed gaps in Knowlarity's official docs (not guessed around):
  - No REST hangup/hold/mute/transfer endpoint exists anywhere in the public
    API reference — only campaign-level pause/stop for OBD campaigns.
  - No push-webhook mechanism is documented. Knowlarity instead offers a
    client-pull Server-Sent-Events stream (GET .../update-stream/{key}/konnect)
    that requires holding open a persistent connection — architecturally
    incompatible with this CRM's webhook-receiver model, so `webhooks` is
    marked unsupported rather than simulated.
  - The `makecall` response schema documented is {"success": {"status",
    "message"}} with no confirmed call_id field — correlation with a
    specific call therefore relies on the call-logs/CDR endpoints, not a
    synchronous ID from the outbound call itself.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider

_VALID_TIERS = {"Basic", "Advance", "Premium", "Enterprise"}


class KnowlarityProvider(BaseProvider):
    slug = "knowlarity"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": False,               # not documented — no in-call control API
        "hold": False,
        "resume": False,
        "mute": False,
        "unmute": False,
        "transfer": False,
        "record_control": False,
        "call_status": True,           # via detailed call log by UUID
        "call_details": True,
        "recording_retrieval": True,   # resource_uri embedded in call-log detail
        "call_logs": True,
        "webhooks": False,             # only SSE streaming documented, not push webhooks
        "webhook_signature": False,
        "token_refresh": False,        # static API key pair, no documented expiry
    }

    def _tier(self) -> str:
        tier = self._cred("channel_tier") or "Basic"
        return tier if tier in _VALID_TIERS else "Basic"

    def _base(self) -> str:
        override = self._cred("api_base_url")
        if override:
            return override.rstrip("/")
        return f"https://kpi.knowlarity.com/{self._tier()}/v1"

    def _headers(self) -> dict:
        return {
            "Authorization": self._cred("sr_api_key"),
            "x-api-key": self._cred("application_access_key"),
            "Content-Type": "application/json",
        }

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        if not self._cred("sr_api_key") or not self._cred("application_access_key"):
            steps["credentials_check"] = "failed — sr_api_key and application_access_key are both required"
            return {"success": False, "message": "SR API Key and Application Access Key are both required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call/", params={"limit": 1}, headers=self._headers())
            if r.status_code == 401:
                steps["authentication"] = "failed — invalid credentials"
                return {"success": False, "message": "Authentication failed. Check SR API Key and Application Access Key.", "steps": steps}
            steps["connectivity"] = f"reached endpoint (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Knowlarity API: {exc}", "steps": steps}
        return {"success": True, "message": "Knowlarity connection successful.", "steps": steps}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        """POST {base}/account/call/makecall — docs: developer.knowlarity.com/content/call-logs-api"""
        body = {
            "k_number": caller_id or self._cred("sr_number"),
            "agent_number": from_,
            "customer_number": to,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/account/call/makecall", json=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            success_block = data.get("success") or {}
            ok = r.status_code in (200, 201, 202) and success_block.get("status") == "success"
            return {
                "success": bool(ok), "call_id": None, "status": "initiated" if ok else "failed",
                "message": success_block.get("message") or data.get("message", "Call initiated." if ok else "Call failed."),
                "raw": data,
            }
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("call_status") or detail["data"].get("status")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        """GET {base}/account/call/get-detailed-call-log — lookup by UUID.
        Docs: developer.knowlarity.com/content/get-detailed-call-log"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/account/call/get-detailed-call-log", params={"uuid": call_id}, headers=self._headers())
            data = r.json()
            if r.status_code != 200 or not data:
                return {"success": False, "data": {}, "message": "Call not found.", "raw": data}
            return {"success": True, "data": data, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        url = (detail.get("data") or {}).get("resource_uri")
        return {"success": detail["success"], "data": {"recording_url": url},
                "message": "" if url else "No recording available.", "raw": detail.get("raw", {})}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/call/ — mandatory start_time/end_time, meta-wrapped
        pagination (limit/offset/next/previous/total_count).
        Docs: developer.knowlarity.com/content/call-logs-api"""
        p = params or {}
        q = {
            "limit": p.get("limit", 20),
            "offset": p.get("offset", 0),
        }
        if p.get("start_time"):
            q["start_time__gt"] = p["start_time"]
        if p.get("end_time"):
            q["start_time__lt"] = p["end_time"]
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/call/", params=q, headers=self._headers())
            data = r.json()
            return {"success": r.status_code == 200, "data": {"logs": data.get("objects", [])}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Knowlarity has no documented push-webhook mechanism (see module
        docstring) — this exists only to satisfy the BaseProvider interface.
        The webhook API route checks CAPABILITIES['webhooks'] before ever
        reaching an adapter, so this should not be invoked in practice."""
        return {
            "event_type": "unsupported", "provider_call_id": None, "status": "unsupported",
            "direction": None, "from": None, "to": None, "duration": None,
            "recording_url": None, "raw": raw_payload,
        }
