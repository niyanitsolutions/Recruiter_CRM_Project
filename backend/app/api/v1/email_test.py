"""
Email Test API
POST /email/test  — send a live test email using the current SMTP configuration.
Requires admin-level permission so ordinary users cannot probe SMTP credentials.
"""

import asyncio
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr
from typing import Optional

from app.core.dependencies import require_permissions
from app.core.config import settings
from app.services.email_service import (
    test_smtp_connection,
    send_email,
    _smtp_cfg_from_settings,
    _credentials_ok,
)

router = APIRouter(prefix="/email", tags=["Email"])


class EmailTestRequest(BaseModel):
    to: EmailStr
    # Optional overrides — if omitted, the system SMTP config is used
    host: Optional[str] = None
    port: Optional[int] = None
    username: Optional[str] = None
    password: Optional[str] = None


class EmailTestResponse(BaseModel):
    success: bool
    message: str
    smtp_host: str
    smtp_port: int
    smtp_user: str
    email_enabled: bool


@router.post("/test", response_model=EmailTestResponse)
async def test_email(
    body: EmailTestRequest,
    _: dict = Depends(require_permissions(["crm_settings:edit"])),
):
    """
    Send a live test email to verify SMTP configuration.

    • Uses custom credentials from the request body if supplied.
    • Falls back to system SMTP config from .env.
    • Returns clear success/failure with the reason — never fakes success.
    """
    # Build config: override fields from body if provided
    sys_cfg = _smtp_cfg_from_settings()
    cfg = {
        "host":       body.host     or sys_cfg["host"],
        "port":       body.port     or sys_cfg["port"],
        "username":   body.username or sys_cfg["username"],
        "password":   body.password or sys_cfg["password"],
        "from_email": sys_cfg["from_email"],
        "from_name":  sys_cfg["from_name"],
        "timeout":    sys_cfg.get("timeout", settings.SMTP_TIMEOUT),
    }

    # Guard: EMAIL_ENABLED
    if not settings.EMAIL_ENABLED:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=(
                "EMAIL_ENABLED=False in configuration. "
                "Set EMAIL_ENABLED=True in .env to enable email sending."
            ),
        )

    # Guard: credentials
    if not _credentials_ok(cfg):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "SMTP credentials are not configured. "
                "Provide username/password in the request or set SMTP_USERNAME and "
                "SMTP_PASSWORD in .env."
            ),
        )

    # Step 1: live connection test (no email sent yet)
    ok, conn_msg = await asyncio.to_thread(test_smtp_connection, cfg)
    if not ok:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"SMTP connection failed: {conn_msg}",
        )

    # Step 2: send actual test email
    subject = f"[{settings.SMTP_FROM_NAME}] Test Email — SMTP Configuration Verified"
    html_body = f"""
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;
                border:1px solid #E5E7EB;border-radius:8px;overflow:hidden">
      <div style="background:#4F46E5;padding:20px 24px">
        <h2 style="margin:0;color:#fff;font-size:18px">✅ SMTP Test Successful</h2>
      </div>
      <div style="padding:24px;color:#374151">
        <p>This is a test email from <strong>{settings.SMTP_FROM_NAME}</strong>.</p>
        <p>If you received this, your SMTP configuration is working correctly.</p>
        <table style="border-collapse:collapse;width:100%;font-size:13px;margin-top:16px">
          <tr style="background:#F9FAFB">
            <td style="padding:8px 12px;border:1px solid #E5E7EB;font-weight:600">Host</td>
            <td style="padding:8px 12px;border:1px solid #E5E7EB">{cfg["host"]}:{cfg["port"]}</td>
          </tr>
          <tr>
            <td style="padding:8px 12px;border:1px solid #E5E7EB;font-weight:600">Username</td>
            <td style="padding:8px 12px;border:1px solid #E5E7EB">{cfg["username"]}</td>
          </tr>
          <tr style="background:#F9FAFB">
            <td style="padding:8px 12px;border:1px solid #E5E7EB;font-weight:600">From</td>
            <td style="padding:8px 12px;border:1px solid #E5E7EB">{cfg["from_name"]} &lt;{cfg["from_email"]}&gt;</td>
          </tr>
        </table>
        <p style="color:#9CA3AF;font-size:12px;margin-top:24px">
          Sent by the CRM email test endpoint. Password was NOT included in this email.
        </p>
      </div>
    </div>
    """
    text_body = (
        f"SMTP Test — {settings.SMTP_FROM_NAME}\n\n"
        f"If you received this, your SMTP is working.\n"
        f"Host: {cfg['host']}:{cfg['port']} | User: {cfg['username']}"
    )

    sent = await send_email(
        body.to,
        subject,
        html_body,
        text_body,
        event_type="smtp_test",
        force_system=True,
    )

    if not sent:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=(
                "SMTP connection test passed but email delivery failed. "
                "Check server logs for the exact error."
            ),
        )

    return EmailTestResponse(
        success=True,
        message=f"Test email delivered successfully to {body.to}",
        smtp_host=cfg["host"],
        smtp_port=cfg["port"],
        smtp_user=cfg["username"],
        email_enabled=settings.EMAIL_ENABLED,
    )
