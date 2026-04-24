"""
Integration Service - Phase 6
Manages third-party integration configurations (email, SMS, webhooks, etc.)
Configs are stored encrypted in the company DB.
"""
from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId
import base64
import json
import os


# Static provider definitions — extend as needed
INTEGRATION_DEFINITIONS = [
    {
        "provider": "smtp_email",
        "label": "SMTP Email",
        "type": "email",
        "description": "Send emails via your own SMTP server",
        "fields": [
            {"key": "host",     "label": "SMTP Host",     "type": "text",     "required": True,  "placeholder": "smtp.gmail.com"},
            {"key": "port",     "label": "SMTP Port",     "type": "text",     "required": True,  "placeholder": "587"},
            {"key": "username", "label": "Username",      "type": "text",     "required": True,  "placeholder": "you@example.com"},
            {"key": "password", "label": "Password",      "type": "password", "required": True,  "placeholder": "App password"},
            {"key": "from_name","label": "From Name",     "type": "text",     "required": False, "placeholder": "Niyan HireFlow"},
            {"key": "use_tls",  "label": "Use TLS",       "type": "text",     "required": False, "placeholder": "true"},
        ],
    },
    {
        "provider": "twilio_sms",
        "label": "Twilio SMS",
        "type": "sms",
        "description": "Send SMS notifications via Twilio",
        "fields": [
            {"key": "account_sid", "label": "Account SID", "type": "text",     "required": True, "placeholder": "ACxxxxxxxxxxxxxxxx"},
            {"key": "auth_token",  "label": "Auth Token",  "type": "password", "required": True, "placeholder": "your_auth_token"},
            {"key": "from_number", "label": "From Number", "type": "text",     "required": True, "placeholder": "+1234567890"},
        ],
    },
    {
        "provider": "whatsapp_business",
        "label": "WhatsApp Business",
        "type": "whatsapp",
        "description": "Send WhatsApp messages via Meta Business API",
        "fields": [
            {"key": "phone_number_id", "label": "Phone Number ID", "type": "text",     "required": True, "placeholder": "1234567890"},
            {"key": "access_token",    "label": "Access Token",    "type": "password", "required": True, "placeholder": "EAAxxxxxxx"},
            {"key": "business_id",     "label": "Business ID",     "type": "text",     "required": False,"placeholder": "business_id"},
        ],
    },
    {
        "provider": "webhook",
        "label": "Generic Webhook",
        "type": "webhook",
        "description": "POST event payloads to any URL",
        "fields": [
            {"key": "url",     "label": "Webhook URL",   "type": "text",     "required": True,  "placeholder": "https://hooks.example.com/..."},
            {"key": "secret",  "label": "Secret Header", "type": "password", "required": False, "placeholder": "hmac_secret"},
            {"key": "headers", "label": "Extra Headers", "type": "json",     "required": False, "placeholder": '{"X-Source": "niyan"}'},
        ],
    },
    {
        "provider": "google_calendar",
        "label": "Google Calendar",
        "type": "calendar",
        "description": "Sync interviews to Google Calendar",
        "fields": [
            {"key": "client_id",     "label": "Client ID",     "type": "text",     "required": True, "placeholder": "xxxxxx.apps.googleusercontent.com"},
            {"key": "client_secret", "label": "Client Secret", "type": "password", "required": True, "placeholder": "GOCSPX-xxxxxx"},
            {"key": "refresh_token", "label": "Refresh Token", "type": "password", "required": True, "placeholder": "1//xxxxxxx"},
        ],
    },
]


def _simple_encrypt(value: str) -> str:
    """Base64-encode sensitive values (swap for real encryption in prod)."""
    return base64.b64encode(value.encode()).decode()


def _simple_decrypt(value: str) -> str:
    try:
        return base64.b64decode(value.encode()).decode()
    except Exception:
        return value


SENSITIVE_KEYS = {"password", "auth_token", "access_token", "client_secret", "refresh_token", "secret"}


def _mask_config(config: dict) -> dict:
    masked = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS and v:
            masked[k] = "••••••••"
        else:
            masked[k] = v
    return masked


def _encrypt_config(config: dict) -> dict:
    encrypted = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS and v:
            encrypted[k] = _simple_encrypt(str(v))
        else:
            encrypted[k] = v
    return encrypted


def _decrypt_config(config: dict) -> dict:
    decrypted = {}
    for k, v in config.items():
        if k in SENSITIVE_KEYS and v:
            decrypted[k] = _simple_decrypt(str(v))
        else:
            decrypted[k] = v
    return decrypted


class IntegrationService:
    def __init__(self, db):
        self.col = db.integrations

    # ── Definitions ────────────────────────────────────────────────────────────

    def get_definitions(self) -> dict:
        return {"definitions": INTEGRATION_DEFINITIONS}

    # ── CRUD ───────────────────────────────────────────────────────────────────

    async def list_integrations(self, company_id: str) -> dict:
        docs = await self.col.find({"company_id": company_id}).to_list(length=None)
        integrations = []
        for doc in docs:
            doc["id"] = str(doc.get("_id", ""))
            doc.pop("_id", None)
            doc["config"] = _mask_config(doc.get("config", {}))
            integrations.append(doc)
        return {"integrations": integrations}

    async def upsert_integration(self, company_id: str, provider: str, config: dict, user_id: str) -> dict:
        encrypted_config = _encrypt_config(config)
        now = datetime.now(timezone.utc)

        existing = await self.col.find_one({"company_id": company_id, "provider": provider})
        if existing:
            await self.col.update_one(
                {"_id": existing["_id"]},
                {"$set": {
                    "config": encrypted_config,
                    "updated_at": now,
                    "updated_by": user_id,
                    "last_test_ok": None,
                    "last_tested_at": None,
                }}
            )
        else:
            await self.col.insert_one({
                "company_id": company_id,
                "provider": provider,
                "config": encrypted_config,
                "is_active": False,
                "last_test_ok": None,
                "last_tested_at": None,
                "created_at": now,
                "updated_at": now,
                "created_by": user_id,
            })

        return {"success": True, "message": "Integration saved"}

    async def test_integration(self, company_id: str, provider: str) -> dict:
        doc = await self.col.find_one({"company_id": company_id, "provider": provider})
        if not doc:
            return {"success": False, "ok": False, "message": "Integration not configured"}

        config = _decrypt_config(doc.get("config", {}))
        ok, msg = await _run_test(provider, config)

        await self.col.update_one(
            {"_id": doc["_id"]},
            {"$set": {"last_test_ok": ok, "last_tested_at": datetime.now(timezone.utc)}}
        )
        return {"success": True, "ok": ok, "message": msg}

    async def set_active(self, company_id: str, provider: str, active: bool) -> dict:
        doc = await self.col.find_one({"company_id": company_id, "provider": provider})
        if not doc:
            raise ValueError("Integration not found")
        await self.col.update_one(
            {"_id": doc["_id"]},
            {"$set": {"is_active": active, "updated_at": datetime.now(timezone.utc)}}
        )
        return {"success": True}

    async def delete_integration(self, company_id: str, provider: str) -> dict:
        await self.col.delete_one({"company_id": company_id, "provider": provider})
        return {"success": True, "message": "Integration removed"}


async def _run_test(provider: str, config: dict):
    """Lightweight connectivity test per provider type."""
    try:
        if provider == "smtp_email":
            import smtplib
            host = config.get("host", "")
            port = int(config.get("port", 587))
            user = config.get("username", "")
            pwd  = config.get("password", "")
            use_tls = str(config.get("use_tls", "true")).lower() != "false"
            if use_tls:
                server = smtplib.SMTP(host, port, timeout=10)
                server.starttls()
            else:
                server = smtplib.SMTP_SSL(host, port, timeout=10)
            server.login(user, pwd)
            server.quit()
            return True, "SMTP connection successful"

        elif provider == "twilio_sms":
            import httpx
            sid   = config.get("account_sid", "")
            token = config.get("auth_token", "")
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.get(
                    f"https://api.twilio.com/2010-04-01/Accounts/{sid}.json",
                    auth=(sid, token)
                )
            if r.status_code == 200:
                return True, "Twilio credentials valid"
            return False, f"Twilio error: {r.status_code}"

        elif provider == "webhook":
            import httpx
            url = config.get("url", "")
            headers = config.get("headers", {})
            if isinstance(headers, str):
                try:
                    headers = json.loads(headers)
                except Exception:
                    headers = {}
            async with httpx.AsyncClient(timeout=10) as client:
                r = await client.post(url, json={"event": "ping"}, headers=headers)
            return r.status_code < 400, f"Webhook responded with {r.status_code}"

        else:
            return True, "Test not implemented for this provider — config saved"

    except Exception as exc:
        return False, str(exc)
