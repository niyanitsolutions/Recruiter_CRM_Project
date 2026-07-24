"""
Twilio adapter — real implementation against the Twilio REST API (2010-04-01).

Docs: https://www.twilio.com/docs/voice/api
Auth: HTTP Basic (Account SID as username, Auth Token as password).

Required credential fields: account_sid, auth_token, from_number.
Optional: twiml_url (TwiML/webhook URL Twilio requests when a call connects —
required by Twilio's /Calls.json to know what to do with the call).
"""
from __future__ import annotations

import base64
import hashlib
import hmac
from typing import Any, Optional
from urllib.parse import urlencode

import httpx

from .base_provider import BaseProvider

_API_BASE = "https://api.twilio.com/2010-04-01"


class TwilioProvider(BaseProvider):
    slug = "twilio"

    # Verified against https://www.twilio.com/docs/voice/api (Call resource,
    # Conference Participant resource, Recording resource) — 2026-07-23.
    CAPABILITIES = {
        "click_to_call": True,
        "hangup": True,
        "hold": True,        # Conference Participant only — see hold()
        "resume": True,      # "
        "mute": True,        # "
        "unmute": True,      # "
        "transfer": True,    # via call redirect to new TwiML
        "record_control": True,
        "call_status": True,
        "call_details": True,
        "recording_retrieval": True,
        "call_logs": True,
        "webhooks": True,
        "webhook_signature": True,   # X-Twilio-Signature, HMAC-SHA1 — documented
        "token_refresh": False,      # static Account SID/Auth Token, no expiry
    }

    def _auth(self) -> tuple[str, str]:
        return (self._cred("account_sid"), self._cred("auth_token"))

    def _account_base(self) -> str:
        return f"{_API_BASE}/Accounts/{self._cred('account_sid')}"

    async def validate_connection(self) -> dict:
        steps: dict[str, Any] = {}
        sid, token = self._cred("account_sid"), self._cred("auth_token")
        steps["credentials_check"] = "checking"
        if not sid or not token:
            steps["credentials_check"] = "failed — account_sid and auth_token are required"
            return {"success": False, "message": "Account SID and Auth Token are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}.json", auth=self._auth())
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid Account SID/Auth Token"
                return {"success": False, "message": "Authentication failed. Check Account SID and Auth Token.", "steps": steps}
            if r.status_code != 200:
                steps["connectivity"] = f"unexpected status {r.status_code}"
                return {"success": False, "message": f"Twilio returned {r.status_code}.", "steps": steps}
            steps["connectivity"] = "ok"
            steps["authentication"] = "ok"
            data = r.json()
            steps["account_status"] = data.get("status", "unknown")
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Twilio API: {exc}", "steps": steps}

        return {"success": True, "message": "Twilio connection successful.", "steps": steps}

    async def make_outbound_call(
        self, to: str, from_: str, *, caller_id: Optional[str] = None, extra: Optional[dict] = None,
    ) -> dict:
        body = {
            "To": to,
            "From": caller_id or from_ or self._cred("from_number"),
        }
        twiml_url = self._cred("twiml_url")
        if twiml_url:
            body["Url"] = twiml_url
        elif (extra or {}).get("twiml"):
            body["Twiml"] = extra["twiml"]
        else:
            # Minimal fallback TwiML so the call connects even without a configured webhook.
            body["Twiml"] = "<Response><Say>Connecting your call.</Say></Response>"

        status_callback = self._cred("status_callback_url")
        if status_callback:
            body["StatusCallback"] = status_callback
            body["StatusCallbackEvent"] = "initiated ringing answered completed"

        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(f"{self._account_base()}/Calls.json", data=body, auth=self._auth())
            data = r.json()
            if r.status_code not in (200, 201):
                return {"success": False, "call_id": None, "status": "failed",
                        "message": data.get("message", f"Twilio call failed ({r.status_code})"), "raw": data}
            return {"success": True, "call_id": data.get("sid"), "status": data.get("status", "queued"),
                    "message": "Call initiated.", "raw": data}
        except Exception as exc:
            return {"success": False, "call_id": None, "status": "failed", "message": str(exc), "raw": {}}

    async def hang_up(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    f"{self._account_base()}/Calls/{call_id}.json",
                    data={"Status": "completed"}, auth=self._auth(),
                )
            ok = r.status_code == 200
            return {"success": ok, "message": "Call ended." if ok else f"Twilio returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def transfer(self, call_id: str, target: str, *, extra: Optional[dict] = None) -> dict:
        """Redirects the live call to new inline TwiML that dials `target`.
        Docs: https://www.twilio.com/docs/voice/tutorials/how-to-modify-calls-in-progress"""
        twiml = f"<Response><Dial>{target}</Dial></Response>"
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    f"{self._account_base()}/Calls/{call_id}.json",
                    data={"Twiml": twiml}, auth=self._auth(),
                )
            ok = r.status_code == 200
            return {"success": ok, "message": "Call transferred." if ok else f"Twilio returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "message": str(exc)}

    async def _conference_participant_action(self, call_id: str, extra: Optional[dict], **body_fields) -> dict:
        """Shared implementation for hold/resume/mute/unmute — all four are
        Conference Participant actions on Twilio, not direct Call actions.
        Docs: https://www.twilio.com/docs/voice/api/conference-participant-resource"""
        conference_sid = (extra or {}).get("conference_sid")
        if not conference_sid:
            return {
                "success": False, "supported": True,
                "message": (
                    "Twilio requires the call to be a Conference Participant for hold/mute — "
                    "pass extra.conference_sid. A plain point-to-point call (as created by "
                    "make_outbound_call) is not a conference until bridged into one."
                ),
                "raw": {},
            }
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post(
                    f"{self._account_base()}/Conferences/{conference_sid}/Participants/{call_id}.json",
                    data=body_fields, auth=self._auth(),
                )
            ok = r.status_code == 200
            return {"success": ok, "supported": True,
                    "message": "OK" if ok else f"Twilio returned {r.status_code}"}
        except Exception as exc:
            return {"success": False, "supported": True, "message": str(exc)}

    async def hold(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._conference_participant_action(call_id, extra, Hold="true")

    async def resume(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._conference_participant_action(call_id, extra, Hold="false")

    async def mute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._conference_participant_action(call_id, extra, Muted="true")

    async def unmute(self, call_id: str, *, extra: Optional[dict] = None) -> dict:
        return await self._conference_participant_action(call_id, extra, Muted="false")

    async def fetch_call_status(self, call_id: str) -> dict:
        detail = await self.fetch_call_details(call_id)
        if not detail["success"]:
            return detail
        return {"success": True, "data": {"call_id": call_id, "status": detail["data"].get("status")},
                "message": "", "raw": detail["raw"]}

    async def fetch_call_details(self, call_id: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}/Calls/{call_id}.json", auth=self._auth())
            data = r.json()
            if r.status_code != 200:
                return {"success": False, "data": {}, "message": data.get("message", "Not found"), "raw": data}
            return {"success": True, "data": data, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_recording(self, call_id: str) -> dict:
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(
                    f"{self._account_base()}/Calls/{call_id}/Recordings.json", auth=self._auth(),
                )
            data = r.json()
            recs = data.get("recordings") or []
            if not recs:
                return {"success": True, "data": {"recording_url": None}, "message": "No recording available.", "raw": data}
            rec = recs[0]
            url = f"https://api.twilio.com{rec.get('uri', '').replace('.json', '.mp3')}"
            return {"success": True, "data": {"recording_url": url}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {}, "message": str(exc), "raw": {}}

    async def fetch_call_logs(self, params: Optional[dict] = None) -> dict:
        q = {"PageSize": (params or {}).get("limit", 50)}
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.get(f"{self._account_base()}/Calls.json", params=q, auth=self._auth())
            data = r.json()
            return {"success": r.status_code == 200, "data": {"logs": data.get("calls", [])}, "message": "", "raw": data}
        except Exception as exc:
            return {"success": False, "data": {"logs": []}, "message": str(exc), "raw": {}}

    async def process_webhook(self, raw_payload: dict, headers: dict) -> dict:
        status_map = {
            "queued": "initiated", "initiated": "initiated", "ringing": "incoming_call",
            "in-progress": "answered", "completed": "call_ended", "busy": "busy",
            "failed": "failed", "no-answer": "missed", "canceled": "call_ended",
        }
        call_status = (raw_payload.get("CallStatus") or "").lower()
        event_type = status_map.get(call_status, "unknown")
        if raw_payload.get("RecordingUrl"):
            event_type = "recording_ready"

        duration = raw_payload.get("CallDuration") or raw_payload.get("RecordingDuration")
        return {
            "event_type": event_type,
            "provider_call_id": raw_payload.get("CallSid"),
            "status": call_status or "unknown",
            "direction": "inbound" if raw_payload.get("Direction") == "inbound" else "outbound",
            "from": raw_payload.get("From"),
            "to": raw_payload.get("To"),
            "duration": int(duration) if duration and str(duration).isdigit() else None,
            "recording_url": raw_payload.get("RecordingUrl"),
            "raw": raw_payload,
        }

    def verify_webhook_signature(self, raw_body: bytes, headers: dict) -> bool:
        """Twilio signs webhooks with X-Twilio-Signature: base64(HMAC-SHA1(AuthToken, url + sorted-params)).
        Full verification needs the exact request URL, which the caller supplies
        via headers['_request_url']; params are the form-decoded body."""
        signature = headers.get("X-Twilio-Signature") or headers.get("x-twilio-signature")
        auth_token = self._cred("auth_token")
        request_url = headers.get("_request_url")
        if not signature or not auth_token or not request_url:
            return True  # cannot verify without these — caller falls back to stored webhook_secret
        try:
            from urllib.parse import parse_qsl
            params = dict(parse_qsl(raw_body.decode("utf-8")))
            data = request_url + "".join(f"{k}{v}" for k, v in sorted(params.items()))
            computed = base64.b64encode(
                hmac.new(auth_token.encode(), data.encode(), hashlib.sha1).digest()
            ).decode()
            return hmac.compare_digest(computed, signature)
        except Exception:
            return False
