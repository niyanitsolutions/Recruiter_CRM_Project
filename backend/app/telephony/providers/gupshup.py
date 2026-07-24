"""
Gupshup adapter — voice calling on Gupshup's platform.

Verified against https://docs.gupshup.io — 2026-07-23.

IMPORTANT: Gupshup acquired Knowlarity in Feb 2022. Every documented
Voice/Click-to-Call/Outbound-campaign endpoint under docs.gupshup.io
resolves to `kpi.knowlarity.com` — this is Knowlarity's platform running
under the Gupshup brand, not native `*.gupshup.io` infrastructure, and it's
framed as click-to-call/call-center/campaign-IVR (agent<->customer bridging),
not a general "call any number with a script" programmable API.

Auth: three required headers — `authorization`, `x-api-key`, and standard
`content-type`/`accept`.

Credential fields: authorization_key (required), x_api_key (required),
k_number (the allocated SR/Knowlarity number to bridge through),
country_code, api_base_url (override; default
https://kpi.knowlarity.com/Basic/v1).

Confirmed gaps in Gupshup's official voice docs (not guessed around):
  - No hangup/hold/mute/transfer/resume endpoint exists for a live call —
    only campaign-level start/stop (`PUT .../call/campaign/<order_id>`).
  - No single-call status/details GET endpoint was found.
  - No recording-retrieval endpoint was found (recording is claimed as a
    platform capability in marketing copy, but no API to fetch it is
    documented).
  - No call-level webhook (push) mechanism is documented for Voice/C2C/OBD —
    Gupshup's only documented webhooks are for the messaging (WhatsApp)
    channel, unrelated to voice.
  - The CDR endpoint found (`GET .../call/campaign`) is campaign-level
    (aggregate order records), not a per-individual-call log — surfaced via
    fetch_call_logs with that caveat.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider

_DEFAULT_BASE = "https://kpi.knowlarity.com/Basic/v1"


class GupshupProvider(BaseProvider):
    slug = "gupshup"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": False,               # only campaign-level stop, not per-call
        "hold": False,
        "resume": False,
        "mute": False,
        "unmute": False,
        "transfer": False,
        "record_control": False,
        "call_status": False,          # no single-call status endpoint found
        "call_details": False,
        "recording_retrieval": False,  # no retrieval endpoint found
        "call_logs": True,             # campaign-level CDR only — see caveat above
        "webhooks": False,             # not documented for voice/C2C/OBD
        "webhook_signature": False,
        "token_refresh": False,        # static authorization + x-api-key
    }

    def _base(self) -> str:
        return (self._cred("api_base_url") or _DEFAULT_BASE).rstrip("/")

    def _headers(self) -> dict:
        return {
            "authorization": self._cred("authorization_key"),
            "x-api-key": self._cred("x_api_key"),
            "content-type": "application/json",
            "accept": "application/json",
        }

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        if not self._cred("authorization_key") or not self._cred("x_api_key"):
            steps["credentials_check"] = "failed — authorization_key and x_api_key are both required"
            return {"success": False, "message": "Authorization Key and X-API-Key are both required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/account/call/campaign", params={"limit": 1}, headers=self._headers())
            if r.status_code == 401:
                steps["authentication"] = "failed — invalid credentials"
                return {"success": False, "message": "Authentication failed. Check Authorization Key and X-API-Key.", "steps": steps}
            steps["connectivity"] = f"reached endpoint (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Gupshup/Knowlarity API: {exc}", "steps": steps}
        return {"success": True, "message": "Gupshup connection successful.", "steps": steps}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        """POST {base}/account/call/makecall — agent<->customer bridge call.
        Docs: docs.gupshup.io/docs/make-a-call"""
        body = {
            "k_number": caller_id or self._cred("k_number"),
            "agent_number": from_,
            "customer_number": to,
            "country_code": self._cred("country_code"),
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/account/call/makecall", json=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            success_block = data.get("success") or {}
            ok = r.status_code in (200, 201, 202) and success_block.get("status") == "success"
            return {
                "success": bool(ok), "call_id": success_block.get("call_id"),
                "status": "initiated" if ok else "failed",
                "message": success_block.get("message", "Call initiated." if ok else "Call failed."), "raw": data,
            }
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/account/call/campaign — CAMPAIGN-level records
        (order_id/order_status/total_calls/...), not per-individual-call CDR.
        Docs: docs.gupshup.io/docs/get-outbound-call-list"""
        p = params or {}
        q = {"limit": p.get("limit", 20), "offset": p.get("offset", 0)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/account/call/campaign", params=q, headers=self._headers())
            data = r.json()
            return {"success": r.status_code == 200, "data": {"logs": data.get("objects", [])}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """No call-level webhook is documented for Gupshup's voice product —
        exists only to satisfy the BaseProvider interface. The webhook API
        route checks CAPABILITIES['webhooks'] before ever reaching an
        adapter, so this should not be invoked in practice."""
        return {
            "event_type": "unsupported", "provider_call_id": None, "status": "unsupported",
            "direction": None, "from": None, "to": None, "duration": None,
            "recording_url": None, "raw": raw_payload,
        }
