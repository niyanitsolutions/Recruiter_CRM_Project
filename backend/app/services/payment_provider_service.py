"""
Payment Provider Service — Provider abstraction layer.

All payment operations route through this service. The active provider is
loaded from master_db.payment_provider_config at request time, enabling
live provider switching without server restart or code changes.

Architecture mirrors ai_service.py so the pattern is familiar.
"""
from __future__ import annotations

import asyncio
import logging
import time
from abc import ABC, abstractmethod
from typing import Any, Optional

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

# ─── Collection / document identifiers ───────────────────────────────────────

_COLLECTION = "payment_provider_config"
_DOC_ID = "global"

# ─── Supported providers ──────────────────────────────────────────────────────

SUPPORTED_PROVIDERS: list[str] = [
    "razorpay",
    "stripe",
    "cashfree",
    "phonepe",
    "payu",
    "paypal",
    "ccavenue",
    "instamojo",
    "custom",
]

# Provider display metadata (consumed by the frontend)
PROVIDER_META: dict[str, dict] = {
    "razorpay": {
        "label": "Razorpay",
        "description": "India's leading payment gateway — supports UPI, cards, net banking, wallets",
        "logo": "₹",
        "color": "from-blue-600 to-blue-400",
        "fields": [
            "key_id", "key_secret", "webhook_secret",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["sandbox", "production"],
        "default_currency": "INR",
    },
    "stripe": {
        "label": "Stripe",
        "description": "Global payments platform — cards, bank transfers, international",
        "logo": "S",
        "color": "from-violet-600 to-violet-400",
        "fields": [
            "publishable_key", "secret_key", "webhook_secret",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["test", "live"],
        "default_currency": "USD",
    },
    "cashfree": {
        "label": "Cashfree",
        "description": "Fast settlements with UPI, cards, and bank transfers",
        "logo": "C",
        "color": "from-emerald-600 to-emerald-400",
        "fields": [
            "client_id", "client_secret",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["sandbox", "production"],
        "default_currency": "INR",
    },
    "phonepe": {
        "label": "PhonePe",
        "description": "UPI-first payment gateway by PhonePe",
        "logo": "P",
        "color": "from-purple-600 to-purple-400",
        "fields": [
            "merchant_id", "salt_key", "salt_index",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["sandbox", "production"],
        "default_currency": "INR",
    },
    "payu": {
        "label": "PayU",
        "description": "Multi-payment gateway with broad bank coverage",
        "logo": "U",
        "color": "from-orange-600 to-orange-400",
        "fields": [
            "merchant_key", "merchant_salt", "auth_header",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["test", "production"],
        "default_currency": "INR",
    },
    "paypal": {
        "label": "PayPal",
        "description": "Global payments with 400M+ users worldwide",
        "logo": "PP",
        "color": "from-blue-500 to-cyan-400",
        "fields": [
            "client_id", "client_secret",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["sandbox", "live"],
        "default_currency": "USD",
    },
    "ccavenue": {
        "label": "CCAvenue",
        "description": "India's largest payment aggregator",
        "logo": "CC",
        "color": "from-red-600 to-red-400",
        "fields": [
            "merchant_id", "access_code", "working_key",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["test", "production"],
        "default_currency": "INR",
    },
    "instamojo": {
        "label": "Instamojo",
        "description": "Simple payment links and API for Indian SMEs",
        "logo": "IM",
        "color": "from-teal-600 to-teal-400",
        "fields": [
            "api_key", "auth_token",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["test", "production"],
        "default_currency": "INR",
    },
    "custom": {
        "label": "Custom REST API",
        "description": "Any payment gateway with a REST API",
        "logo": "⚙",
        "color": "from-slate-600 to-gray-400",
        "fields": [
            "base_url", "api_key", "secret",
            "auth_type", "custom_headers",
            "environment", "currency", "timeout", "retry_count",
        ],
        "environments": ["test", "production"],
        "default_currency": "INR",
    },
}

# Fields that contain secrets (encrypted at rest, masked in responses)
SECRET_FIELDS: set[str] = {
    "key_secret", "webhook_secret", "client_secret",
    "salt_key", "merchant_salt", "auth_header",
    "working_key", "auth_token", "secret",
    "publishable_key",  # not truly secret but mask to avoid leakage
}


# ─── Provider adapters ────────────────────────────────────────────────────────

class BasePaymentAdapter(ABC):
    """Abstract base for all payment provider adapters."""

    def __init__(self, config: dict):
        self.config = config

    @abstractmethod
    async def test_connection(self) -> dict:
        """Return {"success": bool, "message": str, "steps": dict}."""
        ...


class RazorpayAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        key_id = self.config.get("key_id", "").strip()
        key_secret = self.config.get("key_secret", "").strip()
        env = self.config.get("environment", "sandbox")

        steps["credentials_check"] = "checking"
        if not key_id or not key_secret:
            steps["credentials_check"] = "failed — key_id and key_secret are required"
            return {"success": False, "message": "Key ID and Key Secret are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        # Razorpay API health — GET /v1/orders with invalid filter (returns 400 not 401 on bad auth)
        base = "https://api.razorpay.com/v1"
        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.get(
                    f"{base}/orders",
                    params={"count": 1},
                    auth=(key_id, key_secret),
                )
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid credentials (401)"
                return {"success": False, "message": "Authentication failed. Check Key ID and Key Secret.", "steps": steps}
            if r.status_code in (200, 400):
                steps["connectivity"] = "ok"
                steps["authentication"] = "ok"
            else:
                steps["connectivity"] = f"unexpected status {r.status_code}"
                return {"success": False, "message": f"Unexpected response from Razorpay: {r.status_code}", "steps": steps}
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Razorpay API: {exc}", "steps": steps}

        steps["environment"] = env
        return {"success": True, "message": f"Razorpay connection successful ({env}).", "steps": steps}


class StripeAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        secret_key = self.config.get("secret_key", "").strip()
        env = self.config.get("environment", "test")

        steps["credentials_check"] = "checking"
        if not secret_key:
            steps["credentials_check"] = "failed — secret_key required"
            return {"success": False, "message": "Secret Key is required.", "steps": steps}
        steps["credentials_check"] = "ok"

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.get(
                    "https://api.stripe.com/v1/balance",
                    headers={"Authorization": f"Bearer {secret_key}"},
                )
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid key"
                return {"success": False, "message": "Authentication failed. Check Secret Key.", "steps": steps}
            if r.status_code == 200:
                steps["connectivity"] = "ok"
                steps["authentication"] = "ok"
            else:
                steps["connectivity"] = f"status {r.status_code}"
                return {"success": False, "message": f"Stripe returned {r.status_code}", "steps": steps}
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Stripe API: {exc}", "steps": steps}

        steps["environment"] = env
        return {"success": True, "message": f"Stripe connection successful ({env}).", "steps": steps}


class CashfreeAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        client_id = self.config.get("client_id", "").strip()
        client_secret = self.config.get("client_secret", "").strip()
        env = self.config.get("environment", "sandbox")

        steps["credentials_check"] = "checking"
        if not client_id or not client_secret:
            steps["credentials_check"] = "failed — client_id and client_secret required"
            return {"success": False, "message": "Client ID and Client Secret are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        base = "https://sandbox.cashfree.com" if env == "sandbox" else "https://api.cashfree.com"
        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.get(
                    f"{base}/pg/orders",
                    headers={
                        "x-client-id": client_id,
                        "x-client-secret": client_secret,
                        "x-api-version": "2022-09-01",
                    },
                    params={"limit": 1},
                )
            if r.status_code in (401, 403):
                steps["connectivity"] = "ok"
                steps["authentication"] = f"failed — {r.status_code}"
                return {"success": False, "message": "Authentication failed. Check credentials.", "steps": steps}
            steps["connectivity"] = "ok"
            steps["authentication"] = "ok"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Cashfree API: {exc}", "steps": steps}

        steps["environment"] = env
        return {"success": True, "message": f"Cashfree connection successful ({env}).", "steps": steps}


class PhonePeAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        merchant_id = self.config.get("merchant_id", "").strip()
        salt_key = self.config.get("salt_key", "").strip()

        steps["credentials_check"] = "checking"
        if not merchant_id or not salt_key:
            steps["credentials_check"] = "failed — merchant_id and salt_key required"
            return {"success": False, "message": "Merchant ID and Salt Key are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        # PhonePe doesn't expose a simple health check; verify field presence
        steps["connectivity"] = "configuration validated (no live ping available for PhonePe)"
        steps["environment"] = self.config.get("environment", "sandbox")
        return {
            "success": True,
            "message": "PhonePe configuration validated. Live ping is not supported by PhonePe API.",
            "steps": steps,
        }


class PayUAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        merchant_key = self.config.get("merchant_key", "").strip()
        merchant_salt = self.config.get("merchant_salt", "").strip()

        steps["credentials_check"] = "checking"
        if not merchant_key or not merchant_salt:
            steps["credentials_check"] = "failed — merchant_key and merchant_salt required"
            return {"success": False, "message": "Merchant Key and Salt are required.", "steps": steps}
        steps["credentials_check"] = "ok"
        steps["connectivity"] = "configuration validated"
        steps["environment"] = self.config.get("environment", "test")
        return {"success": True, "message": "PayU configuration validated.", "steps": steps}


class PayPalAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        client_id = self.config.get("client_id", "").strip()
        client_secret = self.config.get("client_secret", "").strip()
        env = self.config.get("environment", "sandbox")

        steps["credentials_check"] = "checking"
        if not client_id or not client_secret:
            steps["credentials_check"] = "failed — client_id and client_secret required"
            return {"success": False, "message": "Client ID and Client Secret are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        base = "https://api-m.sandbox.paypal.com" if env == "sandbox" else "https://api-m.paypal.com"
        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.post(
                    f"{base}/v1/oauth2/token",
                    data={"grant_type": "client_credentials"},
                    auth=(client_id, client_secret),
                )
            if r.status_code == 401:
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed — invalid credentials"
                return {"success": False, "message": "Authentication failed.", "steps": steps}
            if r.status_code == 200:
                steps["connectivity"] = "ok"
                steps["authentication"] = "ok (token obtained)"
            else:
                steps["connectivity"] = f"status {r.status_code}"
                return {"success": False, "message": f"PayPal returned {r.status_code}", "steps": steps}
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach PayPal API: {exc}", "steps": steps}

        steps["environment"] = env
        return {"success": True, "message": f"PayPal connection successful ({env}).", "steps": steps}


class CCAvenueAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        merchant_id = self.config.get("merchant_id", "").strip()
        access_code = self.config.get("access_code", "").strip()
        working_key = self.config.get("working_key", "").strip()

        steps["credentials_check"] = "checking"
        if not merchant_id or not access_code or not working_key:
            steps["credentials_check"] = "failed — merchant_id, access_code and working_key required"
            return {"success": False, "message": "Merchant ID, Access Code and Working Key are required.", "steps": steps}
        steps["credentials_check"] = "ok"
        steps["connectivity"] = "configuration validated (CCAvenue does not expose a public health endpoint)"
        steps["environment"] = self.config.get("environment", "test")
        return {"success": True, "message": "CCAvenue configuration validated.", "steps": steps}


class InstamojoAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        api_key = self.config.get("api_key", "").strip()
        auth_token = self.config.get("auth_token", "").strip()
        env = self.config.get("environment", "test")

        steps["credentials_check"] = "checking"
        if not api_key or not auth_token:
            steps["credentials_check"] = "failed — api_key and auth_token required"
            return {"success": False, "message": "API Key and Auth Token are required.", "steps": steps}
        steps["credentials_check"] = "ok"

        base = "https://test.instamojo.com/api/1.1" if env == "test" else "https://www.instamojo.com/api/1.1"
        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.get(
                    f"{base}/payments/",
                    headers={"X-Api-Key": api_key, "X-Auth-Token": auth_token},
                )
            if r.status_code in (401, 403):
                steps["connectivity"] = "ok"
                steps["authentication"] = "failed"
                return {"success": False, "message": "Authentication failed.", "steps": steps}
            steps["connectivity"] = "ok"
            steps["authentication"] = "ok"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach Instamojo API: {exc}", "steps": steps}

        steps["environment"] = env
        return {"success": True, "message": f"Instamojo connection successful ({env}).", "steps": steps}


class CustomAdapter(BasePaymentAdapter):
    async def test_connection(self) -> dict:
        steps: dict[str, Any] = {}
        base_url = self.config.get("base_url", "").strip()
        api_key = self.config.get("api_key", "").strip()

        steps["credentials_check"] = "checking"
        if not base_url:
            steps["credentials_check"] = "failed — base_url required"
            return {"success": False, "message": "Base URL is required.", "steps": steps}
        steps["credentials_check"] = "ok"

        headers = dict(self.config.get("custom_headers") or {})
        auth_type = self.config.get("auth_type", "bearer")
        if api_key:
            if auth_type == "bearer":
                headers["Authorization"] = f"Bearer {api_key}"
            elif auth_type == "api_key":
                headers["X-Api-Key"] = api_key

        steps["connectivity"] = "checking"
        try:
            async with httpx.AsyncClient(timeout=self.config.get("timeout", 30)) as client:
                r = await client.get(base_url.rstrip("/"), headers=headers)
            steps["connectivity"] = f"ok (status {r.status_code})"
        except Exception as exc:
            steps["connectivity"] = f"failed — {exc}"
            return {"success": False, "message": f"Cannot reach {base_url}: {exc}", "steps": steps}

        steps["environment"] = self.config.get("environment", "test")
        return {"success": True, "message": f"Custom endpoint reachable (status {r.status_code}).", "steps": steps}


_ADAPTERS: dict[str, type[BasePaymentAdapter]] = {
    "razorpay":  RazorpayAdapter,
    "stripe":    StripeAdapter,
    "cashfree":  CashfreeAdapter,
    "phonepe":   PhonePeAdapter,
    "payu":      PayUAdapter,
    "paypal":    PayPalAdapter,
    "ccavenue":  CCAvenueAdapter,
    "instamojo": InstamojoAdapter,
    "custom":    CustomAdapter,
}


# ─── PaymentProviderService ───────────────────────────────────────────────────

class PaymentProviderService:
    """
    Central access point for payment provider operations.

    All callers (subscription purchase, payment verification) should import
    this class and use `get_active_config()` to obtain the runtime provider
    and credentials.
    """

    # ── Config document structure ─────────────────────────────────────────────
    # Stored as a single document in master_db.payment_provider_config (_id="global")
    # {
    #   "_id": "global",
    #   "payments_enabled": False,
    #   "active_provider": None,          # slug or None
    #   "providers": {
    #       "razorpay": { "key_id": "...", "key_secret_encrypted": "...", ... },
    #       ...
    #   },
    #   "updated_at": datetime,
    #   "updated_by": str
    # }

    @staticmethod
    async def get_global_config(master_db) -> dict:
        doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
        if not doc:
            return {
                "_id": _DOC_ID,
                "payments_enabled": False,
                "active_provider": None,
                "providers": {},
            }
        return doc

    @staticmethod
    async def is_payments_enabled(master_db) -> bool:
        doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID}, {"payments_enabled": 1})
        if not doc:
            return False
        return bool(doc.get("payments_enabled"))

    @staticmethod
    async def get_active_config(master_db) -> Optional[dict]:
        """
        Return the active provider's decrypted credentials or None if disabled.
        This is the single entry point for runtime payment operations.
        """
        doc = await master_db[_COLLECTION].find_one({"_id": _DOC_ID})
        if not doc or not doc.get("payments_enabled"):
            return None
        provider = doc.get("active_provider")
        if not provider:
            return None
        provider_cfg = (doc.get("providers") or {}).get(provider, {})
        if not provider_cfg:
            return None
        # Decrypt secrets before returning
        return PaymentProviderService._decrypt_config(provider, provider_cfg)

    @staticmethod
    def _decrypt_config(provider: str, cfg: dict) -> dict:
        from app.services.email_service import decrypt_password
        result = dict(cfg)
        result["provider"] = provider
        for field in SECRET_FIELDS:
            enc_key = f"{field}_encrypted"
            if enc_key in result:
                val = result.pop(enc_key)
                result[field] = decrypt_password(val) if val else ""
        return result

    @staticmethod
    def _encrypt_secrets(cfg: dict) -> dict:
        from app.services.email_service import encrypt_password
        result = {}
        for k, v in cfg.items():
            if k in SECRET_FIELDS and v:
                result[f"{k}_encrypted"] = encrypt_password(str(v))
            elif k in SECRET_FIELDS:
                # preserve existing encrypted value placeholder
                pass
            else:
                result[k] = v
        return result

    @staticmethod
    async def test_connection(provider: str, config: dict, master_db) -> dict:
        if provider not in _ADAPTERS:
            raise HTTPException(status_code=400, detail=f"Unsupported provider '{provider}'.")
        adapter = _ADAPTERS[provider](config)
        return await adapter.test_connection()
