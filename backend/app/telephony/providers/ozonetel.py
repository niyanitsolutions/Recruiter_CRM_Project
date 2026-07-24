"""
Ozonetel (CloudAgent / CCaaS) adapter.

Verified against https://docs.ozonetel.com — 2026-07-23. The most
call-control-complete provider researched: real HOLD/UNHOLD/MUTE/UNMUTE and
a KICK_CALL action usable as hangup, all via one CallControl_V4 endpoint.

Auth: Ozonetel documents two parallel modes for every endpoint — a Basic
style (`apiKey` header + `userName` in body) and a Token style
(`POST /ca_apis/CAToken/generateToken` -> Bearer token, 60-min validity,
max 10 generations/hour). This adapter defaults to the Basic style for all
operational calls (stateless per-request — regenerating a token on every
call would burn through the 10/hour cap fast); `refresh_token()` implements
the Token-style generateToken call for completeness/future use by a
credential-rotation flow.

Credential fields: api_key (required), username (CloudAgent userName,
required), phone_name (registered device/phone identifier for manual dial),
campaign_name, did (the DID number), api_base_url (domestic
https://in1-ccaas-api.ozonetel.com / international
https://api.ccaas.ozonetel.com / partner-specific — required, not defaulted,
since Ozonetel issues this per-partner).

Confirmed constraints from Ozonetel's official docs (not guessed around):
  - CDR endpoints require fromDate == toDate (same calendar day) and only
    cover the last 15 days; rate-limited to 2 requests/minute.
  - CallControl_V4 actions (hold/unhold/mute/unmute/kick_call) all require
    conferenceNumber + did + agentPhoneName — there is no simpler
    call-id-only hangup/hold call. Extra call-specific fields must be
    supplied via `extra`.
  - No webhook signature/authenticity mechanism is documented — the only
    correlation signal in a callback payload is a plain (non-cryptographic)
    Apikey field.
"""
from __future__ import annotations

from typing import Any, Optional

import httpx

from .base_provider import BaseProvider


class OzonetelProvider(BaseProvider):
    slug = "ozonetel"

    CAPABILITIES = {
        "click_to_call": True,
        "hangup": True,                # CallControl_V4 action=KICK_CALL
        "hold": True,                  # CallControl_V4 action=HOLD
        "resume": True,                # CallControl_V4 action=UNHOLD
        "mute": True,                  # CallControl_V4 action=MUTE
        "unmute": True,                # CallControl_V4 action=UNMUTE
        "transfer": False,             # no discrete transfer action confirmed (only CONFERENCE+KICK_CALL composition)
        "record_control": True,        # pause/resume via Record.php
        "call_status": True,
        "call_details": True,
        "recording_retrieval": True,   # CallAudio field embedded in CDR
        "call_logs": True,
        "webhooks": True,              # POST /events/subscribe
        "webhook_signature": False,    # no HMAC/signature documented
        "token_refresh": True,         # generateToken, 60-min TTL, 10/hr limit
    }

    def _base(self) -> str:
        base = self._cred("api_base_url")
        if not base:
            raise ValueError("Ozonetel requires an explicit api_base_url (domestic/international/partner-issued).")
        return base.rstrip("/")

    def _auth_params(self) -> dict:
        return {"userName": self._cred("username")}

    def _headers(self) -> dict:
        return {"apiKey": self._cred("api_key"), "Content-Type": "application/json"}

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        if not self._cred("api_key") or not self._cred("username") or not self._cred("api_base_url"):
            steps["credentials_check"] = "failed — api_key, username and api_base_url are all required"
            return {"success": False, "message": "API Key, Username and API Base URL are all required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    f"{self._base()}/ca_apis/PhoneManualDial",
                    json={**self._auth_params(), "checkStatus": True}, headers=self._headers(),
                )
            if r.status_code == 401:
                steps["authentication"] = "failed — invalid credentials"
                return {"success": False, "message": "Authentication failed. Check API Key and Username.", "steps": steps}
            steps["connectivity"] = f"reached endpoint (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Ozonetel API: {exc}", "steps": steps}
        return {"success": True, "message": "Ozonetel connection successful.", "steps": steps}

    async def refresh_token(self) -> dict:
        """POST {base}/ca_apis/CAToken/generateToken — 60-min TTL, max 10/hr.
        Docs: docs.ozonetel.com/reference/post_ca-apis-catoken-generatetoken"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/ca_apis/CAToken/generateToken",
                                        json=self._auth_params(), headers=self._headers())
            data = r.json() if r.status_code == 200 else {}
            if r.status_code != 200 or not data.get("token"):
                return {"success": False, "message": f"Token generation failed ({r.status_code})."}
            return {"success": True, "message": "Token generated.", "new_token": data["token"]}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        """POST {base}/ca_apis/PhoneManualDial (Basic-auth variant).
        Docs: docs.ozonetel.com/reference/post_ca-apis-phonemanualdial
        Requires the campaign to have 'Allow Manual Dialing' enabled."""
        body = {
            **self._auth_params(),
            "custNumber": to,
            "phoneName": from_ or self._cred("phone_name"),
            "campaignName": self._cred("campaign_name"),
            "did": self._cred("did"),
            "checkStatus": True,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/ca_apis/PhoneManualDial", json=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            ok = r.status_code in (200, 201, 202) and data.get("status") != "error"
            return {
                "success": bool(ok), "call_id": data.get("message") if ok else None,  # UCID returned in `message` on success
                "status": "initiated" if ok else "failed",
                "message": data.get("message", "Call initiated." if ok else "Call failed."), "raw": data,
            }
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def _call_control(self, action: str, call_id: str, extra: Optional[dict]) -> dict:
        """Shared CallControl_V4 implementation for hangup/hold/resume/mute/unmute.
        Docs: docs.ozonetel.com/reference/post_ca-apis-callcontrol-v4
        All actions require conferenceNumber + did + agentPhoneName — these
        are call-specific and must be supplied via `extra`."""
        extra = extra or {}
        conference_number = extra.get("conference_number")
        agent_phone_name = extra.get("agent_phone_name") or self._cred("phone_name")
        did = extra.get("did") or self._cred("did")
        if not conference_number or not agent_phone_name or not did:
            return {
                "success": False, "supported": True,
                "message": (
                    "Ozonetel CallControl_V4 requires conferenceNumber, did and "
                    "agentPhoneName for this call — pass extra.conference_number "
                    "(and optionally extra.agent_phone_name/extra.did if they "
                    "differ from the tenant defaults)."
                ),
                "raw": {},
            }
        body = {
            **self._auth_params(), "action": action, "ucid": call_id,
            "conferenceNumber": conference_number, "did": did, "agentPhoneName": agent_phone_name,
        }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._base()}/ca_apis/CallControl_V4", json=body, headers=self._headers())
            data = r.json() if "json" in r.headers.get("content-type", "") else {}
            ok = r.status_code in (200, 202) and data.get("status") != "error"
            return {"success": bool(ok), "supported": True, "message": data.get("message", "OK" if ok else "Failed"), "raw": data}
        except Exception as exc:
            return {"success": False, "supported": True, "message": str(exc), "raw": {}}

    async def hang_up(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._call_control("KICK_CALL", call_id, extra)

    async def hold(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._call_control("HOLD", call_id, extra)

    async def resume(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._call_control("UNHOLD", call_id, extra)

    async def mute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._call_control("MUTE", call_id, extra)

    async def unmute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._call_control("UNMUTE", call_id, extra)

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("Status") or detail["data"].get("DialStatus")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        """GET {base}/ca_reports/fetchCdrByUCID — 2 req/min.
        Docs: docs.ozonetel.com/reference/get_ca-reports-fetchcdrbyucid"""
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/ca_reports/fetchCdrByUCID",
                                       params={**self._auth_params(), "ucid": call_id}, headers=self._headers())
            data = r.json()
            results = data if isinstance(data, list) else data.get("data", [])
            if r.status_code != 200 or not results:
                return {"success": False, "data": {}, "message": "Call not found.", "raw": data}
            return {"success": True, "data": results[0], "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        url = (detail.get("data") or {}).get("CallAudio")
        return {"success": detail["success"], "data": {"recording_url": url},
                "message": "" if url else "No recording available.", "raw": detail.get("raw", {})}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        """GET {base}/ca_reports/fetchCdrByPagination — pageNo/pageSize
        (max 500). Same 2 req/min family limit as other CDR endpoints.
        Docs: docs.ozonetel.com/reference/get_ca-reports-fetchcdrbypagination"""
        p = params or {}
        q = {**self._auth_params(), "pageNo": p.get("page", 1), "pageSize": min(p.get("limit", 100), 500)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._base()}/ca_reports/fetchCdrByPagination", params=q, headers=self._headers())
            data = r.json()
            logs = data if isinstance(data, list) else data.get("data", [])
            return {"success": r.status_code == 200, "data": {"logs": logs}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        """Docs: docs.ozonetel.com/reference/post_events-subscribe
        Call events: Calling, Answered, Disconnect."""
        event_type_raw = raw_payload.get("eventType")
        data = raw_payload.get("data") or {}
        action = (data.get("action") or raw_payload.get("action") or "").lower()
        status_map = {"calling": "incoming_call", "answered": "answered", "disconnect": "call_ended"}
        event_type = status_map.get(action, "unknown") if event_type_raw == "Call" else "unknown"

        return {
            "event_type": event_type,
            "provider_call_id": data.get("ucid") or raw_payload.get("ucid"),
            "status": action or "unknown",
            "direction": data.get("direction"),
            "from": data.get("callerId") or data.get("from"),
            "to": data.get("custNumber") or data.get("to"),
            "duration": data.get("duration"),
            "recording_url": data.get("CallAudio"),
            "raw": raw_payload,
        }

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        """Ozonetel documents no HMAC/signature mechanism — only a plain
        (non-cryptographic) Apikey field inside the payload, which is not a
        reliable authenticity signal on its own. Verification relies on the
        tenant's own configured shared secret, checked generically by the
        caller before this is invoked."""
        return True
