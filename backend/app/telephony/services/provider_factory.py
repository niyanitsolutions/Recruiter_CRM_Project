"""
Provider Factory — the only place that maps a provider slug to a concrete
adapter class. Nothing else in the codebase should import a provider class
directly.

To add a new provider in the future:
  1. Create `app/telephony/providers/<slug>.py` implementing BaseProvider.
  2. Add one line to PROVIDER_REGISTRY below.
Done — no other file needs to change.
"""
from __future__ import annotations

from app.telephony.providers.base_provider import BaseProvider
from app.telephony.providers.twilio import TwilioProvider
from app.telephony.providers.tata_smartflo import TataSmartfloProvider
from app.telephony.providers.exotel import ExotelProvider
from app.telephony.providers.airtel_iq import AirtelIQProvider
from app.telephony.providers.knowlarity import KnowlarityProvider
from app.telephony.providers.ozonetel import OzonetelProvider
from app.telephony.providers.myoperator import MyOperatorProvider
from app.telephony.providers.kaleyra import KaleyraProvider
from app.telephony.providers.infobip import InfobipProvider
from app.telephony.providers.gupshup import GupshupProvider

PROVIDER_REGISTRY: dict[str, type[BaseProvider]] = {
    "twilio": TwilioProvider,
    "tata_smartflo": TataSmartfloProvider,
    "exotel": ExotelProvider,
    "airtel_iq": AirtelIQProvider,
    "knowlarity": KnowlarityProvider,
    "ozonetel": OzonetelProvider,
    "myoperator": MyOperatorProvider,
    "kaleyra": KaleyraProvider,
    "infobip": InfobipProvider,
    "gupshup": GupshupProvider,
}


def get_provider(slug: str, credentials: dict) -> BaseProvider:
    """Instantiate the adapter for `slug` with decrypted `credentials`.
    Raises KeyError if the slug is unknown — callers should validate against
    SUPPORTED_PROVIDERS (telephony_settings_service) before calling this."""
    provider_cls = PROVIDER_REGISTRY[slug]
    return provider_cls(credentials)
