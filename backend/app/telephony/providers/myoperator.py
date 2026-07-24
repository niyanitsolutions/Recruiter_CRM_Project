"""
MyOperator adapter — BLOCKED, not implemented.

Verified research against MyOperator's official domains
(myoperator.com/api/, support.myoperator.com, developers.myoperator.co) on
2026-07-23 found **three to four mutually contradicting authentication
schemes** described across different official pages:
  - myoperator.com/api/ (marketing/signup page): query-string `?token=`
  - support.myoperator.com KB "What are APIs": `Authorization: Bearer <key>`
    header
  - support.myoperator.com KB "Outgoing APIs Guide": `x-api-key` header plus
    `company_id`/`secret_token` body fields
  - myoperator.com/integrations/api-webhooks (marketing page): generic
    "API keys or OAuth tokens"
There is no single authoritative technical reference reconcilable from
public sources, and no coherent base URL could be confirmed either
(one official KB article even used the literal placeholder domain
`api.<region>.myoperator.example`, suggesting boilerplate/generic content
rather than a precise spec).

Per this integration's verification rule — implement only from official
documentation that is internally coherent, and stop rather than guess when
it isn't — this provider is **registered in the Provider Factory but
disabled**. It stays selectable-but-blocked in Super Admin (so the option
exists and the gap is visible) until MyOperator support/sales provides a
single authoritative reference or sandbox credentials to build and verify
against.
"""
from __future__ import annotations

from typing import Optional

from .base_provider import BaseProvider

_BLOCKED_MESSAGE = (
    "MyOperator is registered but not available: its official documentation "
    "describes 3-4 conflicting authentication schemes across different "
    "official pages, with no single authoritative technical reference "
    "found. This provider will be implemented once MyOperator provides a "
    "coherent official reference or sandbox credentials — see the module "
    "docstring for the specific pages checked and the conflict found."
)


class MyOperatorProvider(BaseProvider):
    slug = "myoperator"

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
