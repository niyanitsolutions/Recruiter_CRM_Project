"""
Thin dispatcher that routes a provider's raw webhook payload through that
provider's own `process_webhook`/`verify_webhook_signature` implementation
and returns the common internal event shape. Callers (the webhook API route,
telephony_service) never touch a provider class directly — they go through
this module or provider_factory.
"""
from __future__ import annotations

from app.telephony.services.provider_factory import get_provider


async def normalize_webhook(provider_slug: str, credentials: dict, payload: dict, headers: dict) -> dict:
    adapter = get_provider(provider_slug, credentials)
    return await adapter.process_webhook(payload, headers)


def verify_signature(provider_slug: str, credentials: dict, raw_body: bytes, headers: dict) -> bool:
    adapter = get_provider(provider_slug, credentials)
    return adapter.verify_webhook_signature(raw_body, headers)
