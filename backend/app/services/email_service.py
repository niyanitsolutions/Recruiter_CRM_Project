"""
Email Service
Sends transactional emails via SMTP.
Falls back to console logging when SMTP is not configured.
"""

import asyncio
import smtplib
import logging
from datetime import datetime
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.core.config import settings

logger = logging.getLogger(__name__)


class EmailService:
    """Async-friendly email sender with console fallback."""

    @staticmethod
    def _send_smtp(to_email: str, subject: str, html_body: str, text_body: str = "") -> bool:
        """Send email via SMTP. Returns True on success, False when disabled or on error."""
        if not settings.EMAIL_ENABLED:
            logger.debug(f"[EMAIL DISABLED] Skipping email to {to_email} | Subject: {subject}")
            return False

        if not settings.SMTP_USERNAME or not settings.SMTP_PASSWORD:
            logger.info(
                "[EMAIL FALLBACK — SMTP not configured]\n"
                f"  To: {to_email}\n  Subject: {subject}\n  Body: {text_body or html_body}"
            )
            return False  # SMTP not configured; treat as not sent

        try:
            msg = MIMEMultipart("alternative")
            msg["Subject"] = subject
            msg["From"]    = f"{settings.SMTP_FROM_NAME} <{settings.SMTP_FROM_EMAIL}>"
            msg["To"]      = to_email

            if text_body:
                msg.attach(MIMEText(text_body, "plain"))
            msg.attach(MIMEText(html_body, "html"))

            with smtplib.SMTP(settings.SMTP_HOST, settings.SMTP_PORT, timeout=10) as server:
                server.ehlo()
                server.starttls()
                server.login(settings.SMTP_USERNAME, settings.SMTP_PASSWORD)
                server.sendmail(settings.SMTP_FROM_EMAIL, to_email, msg.as_string())

            logger.info(f"[EMAIL SENT] To: {to_email} | Subject: {subject}")
            return True

        except Exception as exc:
            logger.error(f"[EMAIL ERROR] To: {to_email} | {exc}")
            return False

    # ── Public methods ────────────────────────────────────────────────────────

    @staticmethod
    async def send_verification_email(
        to_email: str,
        full_name: str,
        token: str,
        account_type: str = "tenant",  # "tenant" | "seller"
    ) -> bool:
        """Send email-verification link."""
        verify_url = (
            f"{settings.FRONTEND_URL}/verify-email?token={token}&type={account_type}"
        )
        subject = f"Verify your {settings.SMTP_FROM_NAME} account"
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#4F46E5">Welcome to {settings.SMTP_FROM_NAME}!</h2>
          <p>Hi <strong>{full_name}</strong>,</p>
          <p>Thanks for signing up. Please verify your email address to activate your account.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="{verify_url}"
               style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              Verify Email Address
            </a>
          </div>
          <p style="color:#6B7280;font-size:14px">
            Or copy this link: <a href="{verify_url}">{verify_url}</a>
          </p>
          <p style="color:#6B7280;font-size:12px">
            This link expires in {settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS} hours.
            If you did not create an account, ignore this email.
          </p>
        </div>
        """
        text_body = (
            f"Hi {full_name},\n\n"
            f"Please verify your email: {verify_url}\n\n"
            f"Link expires in {settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS} hours."
        )
        return await asyncio.to_thread(
            EmailService._send_smtp, to_email, subject, html_body, text_body
        )

    @staticmethod
    async def send_password_reset_email(
        to_email: str,
        full_name: str,
        reset_token: str,
    ) -> bool:
        """Send password-reset link."""
        reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
        subject = f"Reset your {settings.SMTP_FROM_NAME} password"
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#4F46E5">Password Reset</h2>
          <p>Hi <strong>{full_name}</strong>,</p>
          <p>We received a request to reset your password.</p>
          <div style="text-align:center;margin:32px 0">
            <a href="{reset_url}"
               style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              Reset Password
            </a>
          </div>
          <p style="color:#6B7280;font-size:12px">
            This link expires in 1 hour. If you did not request this, ignore this email.
          </p>
        </div>
        """
        text_body = (
            f"Hi {full_name},\n\nReset your password: {reset_url}\n\n"
            "Link expires in 1 hour."
        )
        return await asyncio.to_thread(
            EmailService._send_smtp, to_email, subject, html_body, text_body
        )

    @staticmethod
    async def send_welcome_email(
        to_email: str,
        full_name: str,
        username: str,
        company_name: str,
        temp_password: Optional[str] = None,
    ) -> bool:
        """Send welcome email for admin-created accounts."""
        login_url = f"{settings.FRONTEND_URL}/login"
        subject = f"Your {settings.SMTP_FROM_NAME} account is ready"
        creds_section = (
            f"<p><strong>Username:</strong> {username}</p>"
            f"<p><strong>Temporary Password:</strong> {temp_password}</p>"
            if temp_password
            else f"<p><strong>Username:</strong> {username}</p>"
        )
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <h2 style="color:#4F46E5">Welcome to {settings.SMTP_FROM_NAME}!</h2>
          <p>Hi <strong>{full_name}</strong>,</p>
          <p>Your account for <strong>{company_name}</strong> has been created by our team.</p>
          {creds_section}
          <div style="text-align:center;margin:32px 0">
            <a href="{login_url}"
               style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                      text-decoration:none;font-weight:bold;display:inline-block">
              Login Now
            </a>
          </div>
        </div>
        """
        text_body = (
            f"Hi {full_name},\n\n"
            f"Your {company_name} account is ready. Login at {login_url}\n"
            f"Username: {username}"
            + (f"\nTemporary Password: {temp_password}" if temp_password else "")
        )
        return await asyncio.to_thread(
            EmailService._send_smtp, to_email, subject, html_body, text_body
        )

    @staticmethod
    async def send_subscription_reminder_email(
        to_email: str,
        full_name: str,
        company_name: str,
        plan_expiry: Optional[datetime],
        account_type: str = "tenant",  # "tenant" | "seller"
    ) -> bool:
        """
        Send a 3-day subscription expiry warning email.
        Called by the daily background reminder job.
        """
        expiry_str = plan_expiry.strftime("%d %B %Y") if plan_expiry else "soon"
        login_url = f"{settings.FRONTEND_URL}/login"
        subject = f"Your {settings.SMTP_FROM_NAME} subscription expires in 3 days"
        html_body = f"""
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto">
          <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;
                      margin-bottom:24px;border-radius:4px">
            <h2 style="color:#92400E;margin:0 0 8px 0">Subscription Expiring Soon</h2>
            <p style="color:#92400E;margin:0">Your subscription expires in 3 days — action required</p>
          </div>
          <p>Hi <strong>{full_name}</strong>,</p>
          <p>
            Your <strong>{company_name}</strong> subscription on
            <strong>{settings.SMTP_FROM_NAME}</strong> will expire on
            <strong style="color:#DC2626">{expiry_str}</strong>.
          </p>
          <p>
            To continue using the platform without interruption, please renew your
            subscription before this date.
          </p>
          <div style="text-align:center;margin:32px 0">
            <a href="{login_url}"
               style="background:#F59E0B;color:#fff;padding:14px 32px;border-radius:8px;
                      text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">
              Renew Subscription
            </a>
          </div>
          <p style="color:#6B7280;font-size:13px">
            If you have already renewed, please ignore this email.
          </p>
          <hr style="border:none;border-top:1px solid #E5E7EB;margin:24px 0">
          <p style="color:#9CA3AF;font-size:12px">
            Automated reminder from {settings.SMTP_FROM_NAME}. Do not reply to this email.
          </p>
        </div>
        """
        text_body = (
            f"Hi {full_name},\n\n"
            f"SUBSCRIPTION EXPIRY REMINDER\n\n"
            f"Your {company_name} subscription expires on {expiry_str}.\n"
            f"Renew at: {login_url}\n\n"
            f"If you've already renewed, ignore this email.\n"
        )
        return await asyncio.to_thread(
            EmailService._send_smtp, to_email, subject, html_body, text_body
        )


email_service = EmailService()
