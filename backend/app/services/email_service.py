"""
Email Service — Dual SMTP (system + tenant) with fallback and logging.

Routing rules
─────────────
  SYSTEM emails (auth, verification, password reset)
      → always use system SMTP  (force_system=True)
  BUSINESS emails (invoices, tasks, targets, welcome, candidates, jobs)
      → try tenant SMTP first; fall back to system SMTP on error

Every send attempt is logged to master_db.email_logs.

Failure behaviour
─────────────────
  • EMAIL_ENABLED = False  → WARNING logged, returns False immediately
  • Credentials missing    → ERROR logged, returns False immediately
  • SMTP send error        → ERROR logged with full exception, returns False
  • Tenant SMTP fails      → WARNING logged, retried automatically via system SMTP

NO silent failures — every failure path writes to logs.
"""

from __future__ import annotations

import asyncio
import smtplib
import logging
from datetime import datetime, timezone
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText
from typing import Optional

from app.core.config import settings
from app.core.database import get_master_db, get_company_db

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _effective_from_email() -> str:
    """Return SMTP_FROM_EMAIL falling back to SMTP_USERNAME when not configured."""
    return settings.SMTP_FROM_EMAIL.strip() or settings.SMTP_USERNAME.strip()


def _smtp_cfg_from_settings() -> dict:
    return {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "username": settings.SMTP_USERNAME.strip(),
        "password": settings.SMTP_PASSWORD,          # never logged
        "from_email": _effective_from_email(),
        "from_name": settings.SMTP_FROM_NAME,
        "timeout": settings.SMTP_TIMEOUT,
    }


def _credentials_ok(cfg: dict) -> bool:
    return bool(cfg.get("username")) and bool(cfg.get("password"))


# ── Fernet encryption (tenant SMTP passwords) ─────────────────────────────────

def _fernet():
    if not settings.FERNET_SECRET_KEY:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(settings.FERNET_SECRET_KEY.encode())
    except Exception:
        return None


def encrypt_password(plain: str) -> str:
    f = _fernet()
    return f.encrypt(plain.encode()).decode() if f else plain


def decrypt_password(encrypted: str) -> str:
    f = _fernet()
    if not f:
        return encrypted
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return encrypted


# ── Low-level synchronous SMTP send ───────────────────────────────────────────

def _do_send(cfg: dict, to_email: str, subject: str,
             html_body: str, text_body: str = "") -> None:
    """
    Synchronous SMTP send via STARTTLS.
    Raises on any failure — callers decide how to handle.
    NOTE: SMTP password is NEVER included in log output.
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_email

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    timeout = cfg.get("timeout", settings.SMTP_TIMEOUT)

    logger.info("[SMTP] STEP 1: Connecting to %s:%s via SSL (timeout=%ss)", cfg["host"], cfg["port"], timeout)
    with smtplib.SMTP_SSL(cfg["host"], cfg["port"], timeout=timeout) as server:
        logger.info("[SMTP] STEP 3: Logging in as %s", cfg["username"])
        server.login(cfg["username"], cfg["password"])
        logger.info("[SMTP] STEP 4: Sending to %s | subject=%s", to_email, subject)
        result = server.sendmail(cfg["from_email"], to_email, msg.as_string())
        # sendmail returns a dict of {recipient: (code, msg)} for FAILED recipients.
        # An empty dict {} means all recipients were accepted.
        if result:
            raise Exception(f"SMTP rejected recipient(s): {result}")
        logger.info("[SMTP] STEP 5: Delivered successfully | to=%s | smtp_result=%s", to_email, result)


# ── Email log ─────────────────────────────────────────────────────────────────

async def _log_email(
    to: str,
    subject: str,
    event_type: str,
    smtp_used: str,          # "system" | "tenant" | "none"
    success: bool,
    error: str = "",
    company_id: str = "",
    attempts: int = 1,
) -> None:
    """Fire-and-forget write to master_db.email_logs. Never raises."""
    try:
        master_db = get_master_db()
        await master_db.email_logs.insert_one({
            "to": to,
            "subject": subject,
            "event_type": event_type,
            "smtp_used": smtp_used,
            "company_id": company_id,
            "success": success,
            "attempts": attempts,
            "error": error[:500] if error else "",   # truncate very long traces
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as exc:
        logger.debug("email_logs write failed: %s", exc)


# ── Fire-and-forget helper (service-layer use) ────────────────────────────────

def _fire_email(coro) -> None:
    """
    Schedule an email coroutine as a non-blocking background task.
    Use in service-layer code where FastAPI BackgroundTasks is not available.
    All errors are caught and logged inside send_email() — no silent failures.
    """
    try:
        asyncio.get_running_loop().create_task(coro)
    except RuntimeError:
        logger.warning("[EMAIL] Cannot schedule background email — no running event loop")


# ── Tenant SMTP config loader ─────────────────────────────────────────────────

async def _get_tenant_smtp(company_id: str) -> Optional[dict]:
    """
    Load and decrypt tenant SMTP from company_db.smtp_config.
    Returns None if not configured or not enabled.
    """
    if not company_id:
        return None
    try:
        db = get_company_db(company_id)
        doc = await db.smtp_config.find_one({"_id": "smtp"})
        if not doc or not doc.get("enabled"):
            return None
        pwd = decrypt_password(doc.get("password", ""))
        if not doc.get("username") or not pwd:
            return None
        return {
            "host": doc["host"],
            "port": int(doc.get("port", 587)),
            "username": doc["username"],
            "password": pwd,
            "from_email": doc.get("from_email") or doc["username"],
            "from_name": doc.get("from_name", ""),
            "timeout": settings.SMTP_TIMEOUT,
        }
    except Exception as exc:
        logger.debug("Tenant SMTP load failed for %s: %s", company_id, exc)
        return None


# ── Core send function ────────────────────────────────────────────────────────

async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    event_type: str = "general",
    *,
    company_id: str = "",
    force_system: bool = False,
) -> bool:
    """
    Send an email.  Returns True on success, False on any failure.

    Every failure is logged — no silent errors.

    Routing:
      force_system=True  → system SMTP only  (auth emails)
      company_id set     → try tenant SMTP → fallback to system SMTP
      neither            → system SMTP only
    """
    # ── Guard: EMAIL_ENABLED ──────────────────────────────────────────────────
    if not settings.EMAIL_ENABLED:
        logger.warning(
            "[EMAIL DISABLED] Skipping send. Set EMAIL_ENABLED=True to enable. "
            "event=%s to=%s subject=%s", event_type, to, subject
        )
        await _log_email(to, subject, event_type, "none", False,
                         "EMAIL_ENABLED=False", company_id)
        return False

    sys_cfg = _smtp_cfg_from_settings()

    # ── Guard: credentials configured ────────────────────────────────────────
    if not _credentials_ok(sys_cfg):
        logger.error(
            "[EMAIL ERROR] System SMTP credentials not configured. "
            "Set SMTP_USERNAME and SMTP_PASSWORD in .env. "
            "event=%s to=%s", event_type, to
        )
        await _log_email(to, subject, event_type, "none", False,
                         "SMTP credentials not configured", company_id)
        return False

    # ── Try tenant SMTP (business emails only) ────────────────────────────────
    if company_id and not force_system:
        tenant_cfg = await _get_tenant_smtp(company_id)
        if tenant_cfg:
            try:
                await asyncio.to_thread(
                    _do_send, tenant_cfg, to, subject, html_body, text_body
                )
                logger.info("[EMAIL SENT via tenant SMTP] event=%s to=%s", event_type, to)
                await _log_email(to, subject, event_type, "tenant", True, "", company_id)
                return True
            except smtplib.SMTPAuthenticationError as exc:
                logger.warning(
                    "[EMAIL tenant SMTP auth failed, falling back to system] "
                    "host=%s user=%s error=%s",
                    tenant_cfg["host"], tenant_cfg["username"], exc
                )
            except Exception as exc:
                logger.warning(
                    "[EMAIL tenant SMTP failed, falling back to system] "
                    "host=%s error=%s", tenant_cfg["host"], exc
                )

    # ── System SMTP with retry ────────────────────────────────────────────────
    _MAX_RETRIES = 3
    _last_exc: Optional[Exception] = None

    for _attempt in range(1, _MAX_RETRIES + 1):
        try:
            await asyncio.to_thread(_do_send, sys_cfg, to, subject, html_body, text_body)
            logger.info(
                "[EMAIL SENT via system SMTP] event=%s to=%s attempts=%d",
                event_type, to, _attempt,
            )
            await _log_email(
                to, subject, event_type, "system", True, "", company_id, attempts=_attempt
            )
            return True

        except smtplib.SMTPAuthenticationError as exc:
            # Never retry auth failures — credentials won't change between attempts
            logger.error(
                "[EMAIL ERROR] SMTP authentication failed (no retry). "
                "Check SMTP_USERNAME/SMTP_PASSWORD. If Gmail, use an App Password. "
                "host=%s user=%s error=%s",
                sys_cfg["host"], sys_cfg["username"], exc,
            )
            await _log_email(
                to, subject, event_type, "system", False, str(exc), company_id, attempts=_attempt
            )
            return False

        except Exception as exc:
            _last_exc = exc
            logger.warning(
                "[EMAIL] Attempt %d/%d failed for %s. event=%s error=%s",
                _attempt, _MAX_RETRIES, to, event_type, exc,
            )
            if _attempt < _MAX_RETRIES:
                await asyncio.sleep(1)

    # All retries exhausted
    _error_msg = str(_last_exc) if _last_exc else "Unknown error"
    logger.error(
        "[EMAIL ERROR] All %d attempts failed for %s. event=%s last_error=%s",
        _MAX_RETRIES, to, event_type, _error_msg,
    )
    await _log_email(
        to, subject, event_type, "system", False, _error_msg, company_id, attempts=_MAX_RETRIES
    )
    return False


# ── Startup validator ─────────────────────────────────────────────────────────

def validate_smtp_on_startup() -> None:
    """
    Called once at application startup.
    Logs clear warnings/errors about email configuration without raising.
    Does NOT attempt a live SMTP connection (that would slow startup).
    """
    if not settings.EMAIL_ENABLED:
        logger.warning(
            "[EMAIL] Email is DISABLED (EMAIL_ENABLED=False). "
            "All email sends will be skipped. "
            "Set EMAIL_ENABLED=True in .env to enable."
        )
        return

    missing = []
    if not settings.SMTP_USERNAME:
        missing.append("SMTP_USERNAME")
    if not settings.SMTP_PASSWORD:
        missing.append("SMTP_PASSWORD")

    if missing:
        logger.error(
            "[EMAIL] EMAIL_ENABLED=True but SMTP credentials are missing: %s. "
            "Email sends will fail until these are set in .env.",
            ", ".join(missing)
        )
        return

    from_email = _effective_from_email()
    logger.info(
        "[EMAIL] SMTP configured: host=%s port=%s user=%s from=%s",
        settings.SMTP_HOST, settings.SMTP_PORT,
        settings.SMTP_USERNAME, from_email,
    )


# ── SMTP connection test ──────────────────────────────────────────────────────

def test_smtp_connection(cfg: dict) -> tuple[bool, str]:
    """
    Synchronous live SMTP test (no email sent).
    Returns (success, message). Call via asyncio.to_thread from async context.
    NOTE: password is never included in the returned message.
    """
    host = cfg.get("host", settings.SMTP_HOST)
    port = int(cfg.get("port", settings.SMTP_PORT))
    username = cfg.get("username", settings.SMTP_USERNAME)
    password = cfg.get("password", settings.SMTP_PASSWORD)
    timeout = int(cfg.get("timeout", settings.SMTP_TIMEOUT))

    if not username or not password:
        return False, "SMTP credentials not provided"

    try:
        with smtplib.SMTP(host, port, timeout=timeout) as server:
            server.ehlo()
            server.starttls()
            server.ehlo()
            server.login(username, password)
        return True, f"SMTP connection to {host}:{port} successful"
    except smtplib.SMTPAuthenticationError:
        return (
            False,
            f"Authentication failed for {username} on {host}:{port}. "
            "If using Gmail, use an App Password (Google Account → Security → App Passwords).",
        )
    except smtplib.SMTPConnectError as exc:
        return False, f"Cannot connect to {host}:{port} — {exc}"
    except Exception as exc:
        return False, str(exc)


# ─────────────────────────────────────────────────────────────────────────────
#  HTML template helpers
# ─────────────────────────────────────────────────────────────────────────────

_BRAND = settings.SMTP_FROM_NAME or "CRM Platform"


def _wrap(body_html: str) -> str:
    """Wrap an HTML snippet in a consistent branded shell."""
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;
            box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden">
  <div style="background:#4F46E5;padding:24px 32px">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">{_BRAND}</h1>
  </div>
  <div style="padding:32px;color:#374151;font-size:14px;line-height:1.6">
    {body_html}
  </div>
  <div style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;
              font-size:12px;color:#9CA3AF;text-align:center">
    This email was sent by {_BRAND}. Do not reply to this message.
  </div>
</div>
</body>
</html>"""


# ─────────────────────────────────────────────────────────────────────────────
#  System / auth emails  (force_system=True — always use system SMTP)
# ─────────────────────────────────────────────────────────────────────────────

async def send_verification_email(
    to_email: str,
    full_name: str,
    token: str,
    account_type: str = "tenant",
) -> bool:
    expire_min = settings.EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}&type={account_type}"
    subject = f"Verify your {_BRAND} account"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Verify your email</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Thanks for signing up. Click the button below to verify your email address
         and activate your account.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{verify_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Verify Email Address
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link:<br>
        <a href="{verify_url}" style="color:#4F46E5;word-break:break-all">{verify_url}</a>
      </p>
      <p style="color:#6B7280;font-size:12px">
        ⏱ This link expires in <strong>{expire_min} minutes</strong>.
        If you did not create an account, you can safely ignore this email.
      </p>""")
    text = (
        f"Hi {full_name},\n\nVerify your {_BRAND} account:\n{verify_url}\n\n"
        f"Expires in {expire_min} minutes."
    )
    return await send_email(
        to_email, subject, html, text, "email_verification", force_system=True
    )


async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> bool:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    subject = f"Reset your {_BRAND} password"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Password Reset</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to
         choose a new password.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{reset_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Reset Password
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link:<br>
        <a href="{reset_url}" style="color:#4F46E5;word-break:break-all">{reset_url}</a>
      </p>
      <p style="color:#9CA3AF;font-size:12px">
        ⏱ This link expires in <strong>1 hour</strong>.
        If you did not request a password reset, you can safely ignore this email.
      </p>""")
    text = (
        f"Hi {full_name},\n\nReset your {_BRAND} password:\n{reset_url}\n\n"
        "Expires in 1 hour."
    )
    return await send_email(
        to_email, subject, html, text, "password_reset", force_system=True
    )


async def send_subscription_reminder_email(
    to_email: str,
    full_name: str,
    company_name: str,
    plan_expiry,
    account_type: str = "tenant",
) -> bool:
    expiry_str = plan_expiry.strftime("%d %B %Y") if plan_expiry else "soon"
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} subscription expires in 3 days"
    html = _wrap(f"""
      <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;
                  border-radius:4px;margin-bottom:24px">
        <strong style="color:#92400E">⚠ Subscription expiring in 3 days</strong>
      </div>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your <strong>{company_name}</strong> subscription on <strong>{_BRAND}</strong>
         expires on <strong style="color:#DC2626">{expiry_str}</strong>.</p>
      <p>Renew before the expiry date to avoid service interruption.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{login_url}"
           style="background:#F59E0B;color:#fff;padding:14px 32px;border-radius:8px;
                  text-decoration:none;font-weight:700;font-size:14px;display:inline-block">
          Renew Subscription
        </a>
      </div>""")
    text = (
        f"Hi {full_name},\n\nYour {company_name} subscription expires on {expiry_str}.\n"
        f"Renew at: {login_url}"
    )
    return await send_email(
        to_email, subject, html, text, "subscription_reminder", force_system=True
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Business emails  (tenant SMTP when available, fallback to system)
# ─────────────────────────────────────────────────────────────────────────────

async def send_welcome_email(
    to_email: str,
    full_name: str,
    username: str,
    company_name: str,
    temp_password: Optional[str] = None,
    company_id: str = "",
) -> bool:
    """Welcome email for admin-created user accounts (includes temp password)."""
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} account is ready — {company_name}"
    creds_block = (
        f"""<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                        padding:16px;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Username:</strong> {username}</p>
          <p style="margin:0 0 8px"><strong>Temporary Password:</strong>
            <code style="background:#DCFCE7;padding:2px 8px;border-radius:4px;
                         font-size:13px">{temp_password}</code>
          </p>
          <p style="margin:0;color:#16A34A;font-size:12px">
            ⚠ You will be prompted to change this password on first login.
          </p>
        </div>"""
        if temp_password else
        f"<p><strong>Username:</strong> {username}</p>"
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Welcome to {_BRAND}!</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your account for <strong>{company_name}</strong> has been created.</p>
      {creds_block}
      <div style="text-align:center;margin:32px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Login Now
        </a>
      </div>""")
    text = (
        f"Hi {full_name},\n\nYour {company_name} account is ready.\n"
        f"Login at: {login_url}\nUsername: {username}"
        + (f"\nTemporary Password: {temp_password}" if temp_password else "")
    )
    return await send_email(
        to_email, subject, html, text, "user_created", company_id=company_id
    )


async def send_task_assigned_email(
    to_email: str,
    assignee_name: str,
    task_title: str,
    task_description: str,
    due_date: Optional[str],
    priority: str,
    assigned_by_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/tasks"
    subject = f"New task assigned — {task_title}"
    priority_color = {"high": "#DC2626", "medium": "#D97706", "low": "#059669"}.get(
        priority.lower(), "#6B7280"
    )
    due_line = f"<p style='margin:0 0 6px'><strong>Due:</strong> {due_date}</p>" if due_date else ""
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New Task Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned you a task in
         <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Task:</strong> {task_title}</p>
        {f"<p style='margin:0 0 6px;color:#6B7280'>{task_description}</p>" if task_description else ""}
        <p style="margin:0 0 6px"><strong>Priority:</strong>
          <span style="color:{priority_color};font-weight:700">{priority.upper()}</span></p>
        {due_line}
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Task
        </a>
      </div>""")
    text = (
        f"Hi {assignee_name},\n\n{assigned_by_name} assigned you: {task_title}\n"
        f"Priority: {priority}"
        + (f"\nDue: {due_date}" if due_date else "")
    )
    return await send_email(
        to_email, subject, html, text, "task_assigned", company_id=company_id
    )


async def send_target_assigned_email(
    to_email: str,
    assignee_name: str,
    target_name: str,
    target_value: float,
    unit: str,
    period: str,
    start_date: str,
    end_date: str,
    assigned_by_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/targets"
    subject = f"New target assigned — {target_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New Target Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned you a new target in
         <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Target:</strong> {target_name}</p>
        <p style="margin:0 0 6px"><strong>Goal:</strong>
          <span style="color:#4F46E5;font-weight:700">{target_value} {unit}</span></p>
        <p style="margin:0 0 6px"><strong>Period:</strong> {period}</p>
        <p style="margin:0"><strong>Duration:</strong> {start_date} → {end_date}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Target
        </a>
      </div>""")
    text = (
        f"Hi {assignee_name},\n\n{assigned_by_name} assigned: {target_name}\n"
        f"Goal: {target_value} {unit} | Period: {period}\n{start_date} to {end_date}"
    )
    return await send_email(
        to_email, subject, html, text, "target_assigned", company_id=company_id
    )


async def send_invoice_sent_email(
    to_email: str,
    client_name: str,
    invoice_number: str,
    amount: float,
    currency: str,
    due_date: Optional[str],
    company_name: str,
    company_id: str = "",
) -> bool:
    subject = f"Invoice {invoice_number} from {company_name}"
    due_line = (
        f"<p style='margin:0 0 6px'><strong>Due Date:</strong> {due_date}</p>"
        if due_date else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Invoice from {company_name}</h2>
      <p>Dear <strong>{client_name}</strong>,</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Invoice #:</strong> {invoice_number}</p>
        <p style="margin:0 0 6px"><strong>Amount:</strong>
          <span style="font-size:18px;font-weight:700;color:#4F46E5">
            {currency} {amount:,.2f}
          </span>
        </p>
        {due_line}
        <p style="margin:0"><strong>From:</strong> {company_name}</p>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Please contact us if you have any questions about this invoice.
      </p>""")
    text = (
        f"Invoice {invoice_number} from {company_name}\n"
        f"Dear {client_name},\nAmount: {currency} {amount:,.2f}"
        + (f"\nDue: {due_date}" if due_date else "")
    )
    return await send_email(
        to_email, subject, html, text, "invoice_sent", company_id=company_id
    )


async def send_candidate_registered_email(
    to_email: str,
    candidate_name: str,
    position_applied: Optional[str],
    recruiter_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    subject = f"Your profile has been registered — {company_name}"
    pos_line = (
        f"<p>You have been considered for the position of <strong>{position_applied}</strong>.</p>"
        if position_applied else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Profile Registered</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Your profile has been successfully registered with <strong>{company_name}</strong>.</p>
      {pos_line}
      <p>Our recruiter <strong>{recruiter_name}</strong> will be in touch with you
         shortly regarding next steps.</p>
      <p style="color:#6B7280;font-size:13px">
        If you have questions, please reply to this email or contact your recruiter directly.
      </p>""")
    text = (
        f"Dear {candidate_name},\n\nYour profile has been registered with {company_name}."
        + (f"\nPosition: {position_applied}" if position_applied else "")
        + f"\nRecruiter: {recruiter_name}"
    )
    return await send_email(
        to_email, subject, html, text, "candidate_registered", company_id=company_id
    )


async def send_candidate_form_link_email(
    to_email: str,
    form_url: str,
    sent_by_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    """Email the candidate self-registration form link to a prospective candidate."""
    subject = f"Candidate Registration — {company_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Candidate Registration Form</h2>
      <p>Hello,</p>
      <p>You have been invited by <strong>{sent_by_name}</strong> from
         <strong>{company_name}</strong> to complete a candidate registration form.</p>
      <p>Click the button below to submit your details:</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{form_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Complete Registration
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link:<br>
        <a href="{form_url}" style="color:#4F46E5;word-break:break-all">{form_url}</a>
      </p>
      <p style="color:#9CA3AF;font-size:12px">
        ⏱ This link expires in 7 days and can only be used once.
      </p>""")
    text = (
        f"Candidate Registration Form — {company_name}\n\n"
        f"Invited by {sent_by_name}.\n\nRegister here: {form_url}\n\n"
        "Link expires in 7 days."
    )
    return await send_email(
        to_email, subject, html, text, "candidate_form_link", company_id=company_id
    )


async def send_interview_scheduled_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    interview_date: str,
    interview_time: str,
    interview_mode: str,
    venue_or_link: str,
    interviewer_names: list,
    duration_minutes: int,
    instructions: Optional[str],
    company_id: str = "",
) -> bool:
    subject = f"Interview Scheduled — {job_title} at {company_name}"
    mode_label = interview_mode.replace("_", " ").title() if interview_mode else ""
    loc_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Meeting Link"
    loc_line = (
        f"<p style='margin:0 0 6px'><strong>{loc_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    iv_line = (
        f"<p style='margin:0 0 6px'><strong>Interviewer(s):</strong> {', '.join(interviewer_names)}</p>"
        if interviewer_names else ""
    )
    inst_block = (
        f"<div style='background:#FFF7ED;border-left:3px solid #F59E0B;padding:12px;"
        f"border-radius:4px;margin-top:16px;font-size:13px;color:#92400E'>"
        f"<strong>Instructions:</strong> {instructions}</div>"
        if instructions else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Interview Scheduled ✓</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Your interview has been scheduled for
         <strong>{job_title}</strong> at <strong>{company_name}</strong>.</p>
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Date:</strong> {interview_date}</p>
        <p style="margin:0 0 6px"><strong>Time:</strong> {interview_time}</p>
        <p style="margin:0 0 6px"><strong>Duration:</strong> {duration_minutes} minutes</p>
        <p style="margin:0 0 6px"><strong>Mode:</strong> {mode_label}</p>
        {loc_line}
        {iv_line}
      </div>
      {inst_block}
      <p style="color:#6B7280;font-size:13px;margin-top:16px">
        Please be available 5–10 minutes before the scheduled time.
        If you need to reschedule, contact your recruiter immediately.
      </p>""")
    text = (
        f"Interview Scheduled — {job_title} at {company_name}\n"
        f"Date: {interview_date} | Time: {interview_time} | Mode: {mode_label}\n"
        + (f"Duration: {duration_minutes} min\n" if duration_minutes else "")
        + (f"Location: {venue_or_link}\n" if venue_or_link else "")
        + (f"Instructions: {instructions}" if instructions else "")
    )
    return await send_email(
        to_email, subject, html, text, "interview_scheduled", company_id=company_id
    )


async def send_interview_rescheduled_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    new_date: str,
    new_time: str,
    interview_mode: str,
    venue_or_link: str,
    reason: Optional[str],
    company_id: str = "",
) -> bool:
    subject = f"Interview Rescheduled — {job_title} at {company_name}"
    mode_label = interview_mode.replace("_", " ").title() if interview_mode else ""
    loc_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Meeting Link"
    loc_line = (
        f"<p style='margin:0 0 6px'><strong>{loc_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:#D97706;margin-top:0">Interview Rescheduled</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Your interview for <strong>{job_title}</strong> at <strong>{company_name}</strong>
         has been rescheduled. Please note the updated details below.</p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>New Date:</strong> {new_date}</p>
        <p style="margin:0 0 6px"><strong>New Time:</strong> {new_time}</p>
        <p style="margin:0 0 6px"><strong>Mode:</strong> {mode_label}</p>
        {loc_line}
      </div>
      {reason_line}
      <p style="color:#6B7280;font-size:13px">
        If this time does not work for you, please contact your recruiter immediately.
      </p>""")
    text = (
        f"Interview Rescheduled — {job_title} at {company_name}\n"
        f"New Date: {new_date} | New Time: {new_time}"
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, "interview_rescheduled", company_id=company_id
    )


async def send_interviewer_assigned_email(
    to_email: str,
    interviewer_name: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    interview_date: str,
    interview_time: str,
    interview_mode: str,
    venue_or_link: str,
    duration_minutes: int,
    company_id: str = "",
) -> bool:
    subject = f"Interview Assignment — {candidate_name} for {job_title}"
    mode_label = interview_mode.replace("_", " ").title() if interview_mode else ""
    loc_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Meeting Link"
    loc_line = (
        f"<p style='margin:0 0 6px'><strong>{loc_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Interview Assignment</h2>
      <p>Hi <strong>{interviewer_name}</strong>,</p>
      <p>You have been assigned as an interviewer at <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Candidate:</strong> {candidate_name}</p>
        <p style="margin:0 0 6px"><strong>Position:</strong> {job_title}</p>
        <p style="margin:0 0 6px"><strong>Date:</strong> {interview_date}</p>
        <p style="margin:0 0 6px"><strong>Time:</strong> {interview_time}</p>
        <p style="margin:0 0 6px"><strong>Duration:</strong> {duration_minutes} minutes</p>
        <p style="margin:0 0 6px"><strong>Mode:</strong> {mode_label}</p>
        {loc_line}
      </div>
      <p style="color:#6B7280;font-size:13px">
        Please review the candidate's profile before the interview.
        Log in to submit feedback after the session.
      </p>""")
    text = (
        f"Interview Assignment — {candidate_name} for {job_title}\n"
        f"Date: {interview_date} | Time: {interview_time} | Mode: {mode_label}"
    )
    return await send_email(
        to_email, subject, html, text, "interviewer_assigned", company_id=company_id
    )


async def send_job_opened_email(
    to_emails: list,
    job_title: str,
    client_name: str,
    job_code: str,
    location: str,
    openings: int,
    company_name: str,
    created_by_name: str,
    company_id: str = "",
) -> bool:
    if not to_emails:
        return False
    login_url = f"{settings.FRONTEND_URL}/jobs"
    subject = f"New Job: {job_title} [{job_code}]"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New Job Requirement</h2>
      <p>A new job has been opened in <strong>{company_name}</strong>
         by <strong>{created_by_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Position:</strong> {job_title}</p>
        <p style="margin:0 0 6px"><strong>Client:</strong> {client_name}</p>
        <p style="margin:0 0 6px"><strong>Code:</strong> {job_code}</p>
        <p style="margin:0 0 6px"><strong>Location:</strong> {location or 'Not specified'}</p>
        <p style="margin:0"><strong>Openings:</strong> {openings}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Job
        </a>
      </div>""")
    text = (
        f"New Job: {job_title} [{job_code}]\nClient: {client_name}\n"
        f"Location: {location or 'N/A'} | Openings: {openings}\nBy: {created_by_name}"
    )
    results = [
        await send_email(addr, subject, html, text, "job_opened", company_id=company_id)
        for addr in to_emails
    ]
    return any(results)


# ─────────────────────────────────────────────────────────────────────────────
#  Backwards-compatibility wrapper
# ─────────────────────────────────────────────────────────────────────────────

class EmailService:
    """
    Thin class wrapper kept for code that imports via `from email_service import EmailService`.
    All methods delegate to the module-level async functions above.
    """

    # --- system emails ---
    send_verification_email = staticmethod(send_verification_email)
    send_password_reset_email = staticmethod(send_password_reset_email)
    send_subscription_reminder_email = staticmethod(send_subscription_reminder_email)

    # --- business emails ---
    send_welcome_email = staticmethod(send_welcome_email)
    send_task_assigned_email = staticmethod(send_task_assigned_email)
    send_target_assigned_email = staticmethod(send_target_assigned_email)
    send_invoice_sent_email = staticmethod(send_invoice_sent_email)
    send_candidate_registered_email = staticmethod(send_candidate_registered_email)
    send_candidate_form_link_email = staticmethod(send_candidate_form_link_email)
    send_interview_scheduled_email = staticmethod(send_interview_scheduled_email)
    send_interview_rescheduled_email = staticmethod(send_interview_rescheduled_email)
    send_interviewer_assigned_email = staticmethod(send_interviewer_assigned_email)
    send_job_opened_email = staticmethod(send_job_opened_email)

    @staticmethod
    def _send_smtp(
        to_email: str,
        subject: str,
        html_body: str,
        text_body: str = "",
    ) -> bool:
        """
        DEPRECATED synchronous send using system SMTP.
        Kept only for backwards-compatibility with legacy call sites.
        Prefer the async send_email() function for all new code.
        """
        if not settings.EMAIL_ENABLED:
            logger.warning(
                "[EMAIL DISABLED] _send_smtp called but EMAIL_ENABLED=False. "
                "to=%s subject=%s", to_email, subject
            )
            return False
        cfg = _smtp_cfg_from_settings()
        if not _credentials_ok(cfg):
            logger.error(
                "[EMAIL ERROR] _send_smtp called but SMTP credentials not configured. "
                "Set SMTP_USERNAME and SMTP_PASSWORD in .env. to=%s", to_email
            )
            return False
        try:
            _do_send(cfg, to_email, subject, html_body, text_body)
            logger.info("[EMAIL SENT via _send_smtp] to=%s subject=%s", to_email, subject)
            return True
        except smtplib.SMTPAuthenticationError as exc:
            logger.error(
                "[EMAIL ERROR] SMTP auth failed in _send_smtp. "
                "Use App Password for Gmail. user=%s error=%s",
                cfg["username"], exc,
            )
            return False
        except Exception as exc:
            logger.error(
                "[EMAIL ERROR] _send_smtp failed. to=%s error=%s", to_email, exc
            )
            return False


email_service = EmailService()
