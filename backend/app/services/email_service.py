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


async def _get_platform_smtp_cfg() -> dict | None:
    """
    Load SMTP config from the platform settings DB record.
    Returns None when platform SMTP is not configured.
    Used as a fallback when env-based SMTP credentials are absent.
    """
    try:
        from app.services.platform_settings_service import get_db_smtp_config
        return await get_db_smtp_config()
    except Exception as exc:
        logger.debug("[EMAIL] Platform SMTP load failed: %s", exc)
        return None


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
    Synchronous SMTP send — auto-selects SSL mode based on port:
      port 465 → SMTP_SSL (implicit SSL / SMTPS)
      port 587 → SMTP + STARTTLS (explicit TLS)
    Raises on any failure — callers decide how to handle.
    NOTE: SMTP password is NEVER included in log output.
    """
    import email.utils as _eu
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_email
    msg["Message-ID"] = _eu.make_msgid(domain=cfg["from_email"].split("@")[-1])
    msg["Date"] = _eu.formatdate(localtime=True)

    if text_body:
        msg.attach(MIMEText(text_body, "plain", "utf-8"))
    msg.attach(MIMEText(html_body, "html", "utf-8"))

    host    = cfg["host"]
    port    = int(cfg.get("port", settings.SMTP_PORT))
    timeout = int(cfg.get("timeout", settings.SMTP_TIMEOUT))
    use_ssl = (port == 465)
    mode    = "SMTP_SSL" if use_ssl else "STARTTLS"
    message_id = msg["Message-ID"]

    logger.info(
        "[SMTP] STEP 1: Connecting to %s:%s mode=%s timeout=%ss | to=%s | Message-ID=%s",
        host, port, mode, timeout, to_email, message_id,
    )
    if use_ssl:
        server_ctx = smtplib.SMTP_SSL(host, port, timeout=timeout)
    else:
        server_ctx = smtplib.SMTP(host, port, timeout=timeout)

    with server_ctx as server:
        if not use_ssl:
            server.ehlo()
            server.starttls()
            server.ehlo()
        logger.info("[SMTP] STEP 2: Connected — logging in as %s", cfg["username"])
        server.login(cfg["username"], cfg["password"])
        logger.info("[SMTP] STEP 3: Authenticated — sending to=%s subject=%s", to_email, subject)
        result = server.sendmail(cfg["from_email"], to_email, msg.as_string())
        # sendmail returns a dict of {recipient: (code, msg)} for FAILED recipients.
        # An empty dict {} means all recipients were accepted.
        if result:
            raise Exception(f"SMTP rejected recipient(s): {result}")
        logger.info(
            "[SMTP] STEP 4: DELIVERED — to=%s Message-ID=%s smtp_result=%s",
            to_email, message_id, result,
        )


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
    Load and decrypt tenant SMTP config.

    Checks two storage locations (in priority order):
      1. company_db.smtp_config  (_id="smtp")  — saved via /company-settings/smtp
      2. company_db.tenant_settings (key="email_config") — saved via /tenant-settings/email-config

    Returns None if not configured or not enabled.
    """
    if not company_id:
        return None
    try:
        db = get_company_db(company_id)

        # ── Source 1: smtp_config collection ────────────────────────────────────
        doc = await db.smtp_config.find_one({"_id": "smtp"})
        if doc and doc.get("enabled"):
            pwd = decrypt_password(doc.get("password", ""))
            if doc.get("username") and pwd:
                return {
                    "host": doc["host"],
                    "port": int(doc.get("port", 587)),
                    "username": doc["username"],
                    "password": pwd,
                    "from_email": doc.get("from_email") or doc["username"],
                    "from_name": doc.get("from_name", ""),
                    "timeout": settings.SMTP_TIMEOUT,
                }

        # ── Source 2: tenant_settings collection (key="email_config") ───────────
        ts_doc = await db.tenant_settings.find_one(
            {"company_id": company_id, "key": "email_config"}
        )
        if ts_doc and ts_doc.get("is_enabled"):
            host = ts_doc.get("smtp_host")
            username = ts_doc.get("smtp_username")
            password = ts_doc.get("smtp_password")
            if host and username and password:
                pwd = decrypt_password(password)
                return {
                    "host": host,
                    "port": int(ts_doc.get("smtp_port", 587)),
                    "username": username,
                    "password": pwd,
                    "from_email": ts_doc.get("from_email") or username,
                    "from_name": ts_doc.get("from_name", ""),
                    "timeout": settings.SMTP_TIMEOUT,
                }

        return None
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

    System SMTP priority:
      1. Env-based SMTP (SMTP_USERNAME/SMTP_PASSWORD in .env)
      2. Platform Settings DB SMTP (set via Super Admin Settings page)
    """
    # ── Guard: recipient must be present ─────────────────────────────────────
    to = (to or "").strip()
    if not to:
        logger.error(
            "[EMAIL ERROR] Recipient email is empty — refusing to send. "
            "event=%s subject=%s company_id=%s", event_type, subject, company_id
        )
        await _log_email("", subject, event_type, "none", False,
                         "Recipient email is empty", company_id)
        return False

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

    # ── If env SMTP not configured, try platform settings DB SMTP ────────────
    if not _credentials_ok(sys_cfg):
        db_smtp = await _get_platform_smtp_cfg()
        if db_smtp and _credentials_ok(db_smtp):
            logger.info("[EMAIL] Env SMTP not configured — using Platform Settings SMTP. event=%s to=%s", event_type, to)
            sys_cfg = db_smtp
        else:
            logger.error(
                "[EMAIL ERROR] System SMTP credentials not configured. "
                "Set SMTP_USERNAME/SMTP_PASSWORD in .env or configure SMTP in Super Admin Settings. "
                "event=%s to=%s", event_type, to
            )
            await _log_email(to, subject, event_type, "none", False,
                             "SMTP credentials not configured", company_id)
            return False

    # ── Try tenant SMTP (business emails only) ────────────────────────────────
    if company_id and not force_system:
        tenant_cfg = await _get_tenant_smtp(company_id)
        if tenant_cfg:
            _t_from = tenant_cfg["from_email"]
            if _t_from == to:
                logger.warning(
                    "[EMAIL] FROM and TO are the same address (%s) — sending anyway (edge case). "
                    "event=%s", to, event_type
                )
            logger.info(
                "[EMAIL] FROM=%s TO=%s SMTP=tenant event=%s",
                _t_from, to, event_type,
            )
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
    _s_from = sys_cfg["from_email"]
    if _s_from == to:
        logger.warning(
            "[EMAIL] FROM and TO are the same address (%s) — sending anyway (edge case). "
            "event=%s", to, event_type
        )
    logger.info(
        "[EMAIL] FROM=%s TO=%s SMTP=system event=%s",
        _s_from, to, event_type,
    )

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
    Synchronous live SMTP connection test (no email sent).
    Auto-selects SSL mode by port: 465 → SMTP_SSL, other → SMTP+STARTTLS.
    Returns (success, message). Call via asyncio.to_thread from async context.
    NOTE: password is never included in the returned message.
    """
    host     = cfg.get("host", settings.SMTP_HOST)
    port     = int(cfg.get("port", settings.SMTP_PORT))
    username = cfg.get("username", settings.SMTP_USERNAME)
    password = cfg.get("password", settings.SMTP_PASSWORD)
    timeout  = int(cfg.get("timeout", settings.SMTP_TIMEOUT))
    use_ssl  = (port == 465)
    mode     = "SMTP_SSL" if use_ssl else "STARTTLS"

    if not username or not password:
        return False, "SMTP credentials not provided"

    try:
        if use_ssl:
            server_ctx = smtplib.SMTP_SSL(host, port, timeout=timeout)
        else:
            server_ctx = smtplib.SMTP(host, port, timeout=timeout)

        with server_ctx as server:
            if not use_ssl:
                server.ehlo()
                server.starttls()
                server.ehlo()
            server.login(username, password)
        return True, f"SMTP connection to {host}:{port} ({mode}) successful"
    except smtplib.SMTPAuthenticationError:
        return (
            False,
            f"Authentication failed for {username} on {host}:{port} ({mode}). "
            "If using Gmail, use an App Password (Google Account → Security → App Passwords).",
        )
    except smtplib.SMTPConnectError as exc:
        return False, f"Cannot connect to {host}:{port} — {exc}"
    except Exception as exc:
        return False, str(exc)


# ─────────────────────────────────────────────────────────────────────────────
#  HTML template helpers
# ─────────────────────────────────────────────────────────────────────────────

# _BRAND is intentionally NOT module-level so it always reflects the current
# platform name from the DB rather than the startup value from settings.
def _get_brand() -> str:
    """Return the platform name: from settings.SMTP_FROM_NAME or fallback."""
    return settings.SMTP_FROM_NAME or "HireFlow"


# Keep _BRAND as a backward-compat alias for any inline template strings
_BRAND = settings.SMTP_FROM_NAME or "HireFlow"


def _wrap(body_html: str) -> str:
    """Wrap an HTML snippet in a consistent branded shell."""
    brand = _get_brand()
    return f"""<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F3F4F6;font-family:Arial,sans-serif">
<div style="max-width:600px;margin:32px auto;background:#fff;border-radius:12px;
            box-shadow:0 2px 8px rgba(0,0,0,.08);overflow:hidden">
  <div style="background:#4F46E5;padding:24px 32px">
    <h1 style="margin:0;color:#fff;font-size:20px;font-weight:700">{brand}</h1>
  </div>
  <div style="padding:32px;color:#374151;font-size:14px;line-height:1.6">
    {body_html}
  </div>
  <div style="background:#F9FAFB;padding:16px 32px;border-top:1px solid #E5E7EB;
              font-size:12px;color:#9CA3AF;text-align:center">
    This email was sent by {brand}. Do not reply to this message.
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


async def send_trial_verification_email(
    to_email: str,
    full_name: str,
    company_name: str,
    token: str,
    trial_days: int = 14,
) -> bool:
    verify_url = f"{settings.FRONTEND_URL}/verify-email?token={token}&type=trial"
    subject = f"Activate your {_BRAND} free trial"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Activate Your Free Trial</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Thanks for signing up! You're one step away from activating your
         <strong>{trial_days}-day free trial</strong> for
         <strong>{company_name}</strong>.</p>
      <p>Click the button below to verify your email and set up your workspace.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{verify_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Verify Email &amp; Activate Trial
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link:<br>
        <a href="{verify_url}" style="color:#4F46E5;word-break:break-all">{verify_url}</a>
      </p>
      <p style="color:#6B7280;font-size:12px">
        &#8987; This link expires in <strong>24 hours</strong>.
        If you did not create an account, you can safely ignore this email.
      </p>""")
    text = (
        f"Hi {full_name},\n\nActivate your {trial_days}-day free trial for {company_name}:\n"
        f"{verify_url}\n\nExpires in 24 hours."
    )
    return await send_email(
        to_email, subject, html, text, "trial_verification", force_system=True
    )


async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> bool:
    logger.info(
        "[RESET-EMAIL] send_password_reset_email called — to=%s full_name=%s "
        "FRONTEND_URL=%s token_prefix=%s...",
        to_email, repr(full_name), settings.FRONTEND_URL, reset_token[:8],
    )
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    logger.info("[RESET-EMAIL] reset_url=%s", reset_url)
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
    logger.info("[RESET-EMAIL] calling send_email — to=%s subject=%s", to_email, subject)
    result = await send_email(
        to_email, subject, html, text, "password_reset", force_system=True
    )
    logger.info("[RESET-EMAIL] send_email returned: result=%s for to=%s", result, to_email)
    return result


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


async def send_employee_onboarding_link_email(
    to_email: str,
    form_url: str,
    sent_by_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    """Email the employee self-onboarding form link."""
    subject = f"Complete Your Onboarding — {company_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Employee Onboarding Form</h2>
      <p>Hello,</p>
      <p>You have been invited by <strong>{sent_by_name}</strong> from
         <strong>{company_name}</strong> to complete your onboarding information.</p>
      <p>Please click the button below to fill in your personal details:</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{form_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Complete Onboarding
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link:<br>
        <a href="{form_url}" style="color:#4F46E5;word-break:break-all">{form_url}</a>
      </p>
      <p style="color:#9CA3AF;font-size:12px">
        &#x23F1; This link expires in 7 days and can only be used once.
      </p>""")
    text = (
        f"Employee Onboarding — {company_name}\n\n"
        f"Invited by {sent_by_name}.\n\nComplete your onboarding here: {form_url}\n\n"
        "Link expires in 7 days."
    )
    return await send_email(
        to_email, subject, html, text, "employee_onboarding_link", company_id=company_id
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
#  System emails — password change notifications  (force_system=True)
# ─────────────────────────────────────────────────────────────────────────────

async def send_password_changed_email(
    to_email: str,
    full_name: str,
) -> bool:
    """System email notifying a user their password was just changed."""
    subject = f"Your {_BRAND} password has been changed"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Password Changed</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your <strong>{_BRAND}</strong> account password was recently changed.</p>
      <p>If you made this change, no further action is required.</p>
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:16px;
                  border-radius:4px;margin:16px 0">
        <strong style="color:#991B1B">Didn't change your password?</strong><br>
        <span style="color:#7F1D1D;font-size:13px">
          Please contact your administrator immediately or use the Forgot Password
          option to secure your account.
        </span>
      </div>""")
    text = (
        f"Hi {full_name},\n\nYour {_BRAND} password was recently changed.\n"
        "If you did not make this change, contact your administrator immediately."
    )
    return await send_email(
        to_email, subject, html, text, "password_changed", force_system=True
    )


async def send_admin_password_reset_email(
    to_email: str,
    full_name: str,
    temp_password: str,
    company_name: str,
    reset_by_name: str,
    company_id: str = "",
) -> bool:
    """Email sent when an admin resets a user's password — includes temp credentials."""
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} password has been reset"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Password Reset by Administrator</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p><strong>{reset_by_name}</strong> has reset your password for
         <strong>{company_name}</strong>.</p>
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 8px"><strong>Temporary Password:</strong>
          <code style="background:#DCFCE7;padding:2px 8px;border-radius:4px;
                       font-size:13px">{temp_password}</code>
        </p>
        <p style="margin:0;color:#16A34A;font-size:12px">
          You will be prompted to change this password on first login.
        </p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Login Now
        </a>
      </div>""")
    text = (
        f"Hi {full_name},\n\n{reset_by_name} reset your {_BRAND} password.\n"
        f"Temporary Password: {temp_password}\nLogin: {login_url}"
    )
    return await send_email(
        to_email, subject, html, text, "admin_password_reset", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Recruitment emails — interview cancelled, candidate status, offers
# ─────────────────────────────────────────────────────────────────────────────

async def send_interview_cancelled_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    reason: Optional[str],
    company_id: str = "",
) -> bool:
    subject = f"Interview Cancelled — {job_title} at {company_name}"
    reason_block = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:#DC2626;margin-top:0">Interview Cancelled</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>We regret to inform you that your interview for
         <strong>{job_title}</strong> at <strong>{company_name}</strong>
         has been cancelled.</p>
      {reason_block}
      <p style="color:#6B7280;font-size:13px">
        Our recruitment team will be in touch to reschedule or provide further information.
      </p>""")
    text = (
        f"Interview Cancelled — {job_title} at {company_name}\n"
        f"Dear {candidate_name},\n\nYour interview has been cancelled."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, "interview_cancelled", company_id=company_id
    )


async def send_interviewer_cancelled_email(
    to_email: str,
    interviewer_name: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    reason: Optional[str],
    company_id: str = "",
) -> bool:
    subject = f"Interview Cancelled — {candidate_name} for {job_title}"
    reason_block = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:#DC2626;margin-top:0">Interview Cancelled</h2>
      <p>Hi <strong>{interviewer_name}</strong>,</p>
      <p>The interview for <strong>{candidate_name}</strong> ({job_title}) at
         <strong>{company_name}</strong> has been cancelled.</p>
      {reason_block}
      <p style="color:#6B7280;font-size:13px">
        Please disregard any calendar invites related to this interview.
      </p>""")
    text = (
        f"Interview Cancelled — {candidate_name} for {job_title}\n"
        f"Hi {interviewer_name}, the interview has been cancelled."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, "interviewer_cancelled", company_id=company_id
    )


async def send_candidate_status_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    status_label: str,       # "shortlisted" | "selected" | "rejected"
    company_id: str = "",
    message: Optional[str] = None,
) -> bool:
    """Generic candidate status update email — shortlisted, selected, or rejected."""
    colour_map = {
        "shortlisted": ("#D97706", "#FEF3C7", "#92400E", "Shortlisted"),
        "selected":    ("#059669", "#D1FAE5", "#065F46", "Selected"),
        "rejected":    ("#DC2626", "#FEF2F2", "#7F1D1D", "Not Selected"),
    }
    bg_color, border_color, text_color, label = colour_map.get(
        status_label.lower(), ("#6B7280", "#F9FAFB", "#374151", status_label.title())
    )
    subject = f"Application Update — {job_title} at {company_name}"
    msg_block = f"<p style='color:#6B7280;font-size:13px'>{message}</p>" if message else ""
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Application Status Update</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>We have an update regarding your application for
         <strong>{job_title}</strong> at <strong>{company_name}</strong>.</p>
      <div style="background:{border_color};border-left:4px solid {bg_color};
                  padding:16px;border-radius:4px;margin:16px 0">
        <strong style="color:{text_color}">Status: {label}</strong>
      </div>
      {msg_block}
      <p style="color:#6B7280;font-size:13px">
        Thank you for your interest in {company_name}.
        Our recruitment team will contact you for next steps.
      </p>""")
    text = (
        f"Application Update — {job_title} at {company_name}\n"
        f"Dear {candidate_name}, your application status: {label}"
        + (f"\n{message}" if message else "")
    )
    return await send_email(
        to_email, subject, html, text, f"candidate_{status_label.lower()}", company_id=company_id
    )


async def send_offer_letter_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    offer_details: str,
    offer_deadline: Optional[str],
    company_id: str = "",
) -> bool:
    subject = f"Offer Letter — {job_title} at {company_name}"
    deadline_line = (
        f"<p style='color:#DC2626;font-size:13px'>"
        f"<strong>Please respond by:</strong> {offer_deadline}</p>"
        if offer_deadline else ""
    )
    html = _wrap(f"""
      <h2 style="color:#059669;margin-top:0">Congratulations! You Have an Offer</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>We are pleased to offer you the position of
         <strong>{job_title}</strong> at <strong>{company_name}</strong>.</p>
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                  padding:16px;margin:16px 0;white-space:pre-wrap">
        {offer_details}
      </div>
      {deadline_line}
      <p style="color:#6B7280;font-size:13px">
        Please review the offer and respond at your earliest convenience.
        Contact your recruiter if you have any questions.
      </p>""")
    text = (
        f"Offer Letter — {job_title} at {company_name}\n"
        f"Dear {candidate_name}, congratulations!\n\n{offer_details}"
        + (f"\n\nPlease respond by: {offer_deadline}" if offer_deadline else "")
    )
    return await send_email(
        to_email, subject, html, text, "offer_letter", company_id=company_id
    )


async def send_offer_response_email(
    to_email: str,
    candidate_name: str,
    job_title: str,
    company_name: str,
    accepted: bool,
    company_id: str = "",
) -> bool:
    """Confirmation to candidate after they accept or reject an offer."""
    action = "Accepted" if accepted else "Declined"
    colour = "#059669" if accepted else "#DC2626"
    subject = f"Offer {action} — {job_title} at {company_name}"
    body = (
        f"We have received your <strong>acceptance</strong>. Welcome to <strong>{company_name}</strong>! "
        f"Our HR team will be in touch soon with onboarding details."
        if accepted else
        f"We have noted that you have <strong>declined</strong> our offer for {job_title}. "
        f"Thank you for your time and we wish you all the best."
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">Offer {action}</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>{body}</p>""")
    text = f"Offer {action} — {job_title} at {company_name}\nDear {candidate_name},\n\n{body}"
    return await send_email(
        to_email, subject, html, text, f"offer_{'accepted' if accepted else 'rejected'}", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  HRM emails — leave, WFH, attendance, shift, exit, payslip
# ─────────────────────────────────────────────────────────────────────────────

async def send_leave_decision_email(
    to_email: str,
    employee_name: str,
    leave_type: str,
    start_date: str,
    end_date: str,
    approved: bool,
    reason: Optional[str],
    decided_by: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    action = "Approved" if approved else "Rejected"
    colour = "#059669" if approved else "#DC2626"
    bg = "#D1FAE5" if approved else "#FEF2F2"
    subject = f"Leave {action} — {leave_type}"
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">Leave {action}</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your leave request has been <strong style="color:{colour}">{action.lower()}</strong>
         by <strong>{decided_by}</strong>.</p>
      <div style="background:{bg};border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Leave Type:</strong> {leave_type}</p>
        <p style="margin:0 0 6px"><strong>From:</strong> {start_date}</p>
        <p style="margin:0"><strong>To:</strong> {end_date}</p>
      </div>
      {reason_line}""")
    text = (
        f"Leave {action} — {leave_type}\n"
        f"Hi {employee_name}, your leave from {start_date} to {end_date} has been {action.lower()}."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, f"leave_{action.lower()}", company_id=company_id
    )


async def send_wfh_decision_email(
    to_email: str,
    employee_name: str,
    date_str: str,
    approved: bool,
    reason: Optional[str],
    decided_by: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    action = "Approved" if approved else "Rejected"
    colour = "#059669" if approved else "#DC2626"
    bg = "#D1FAE5" if approved else "#FEF2F2"
    subject = f"WFH Request {action} — {date_str}"
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">WFH Request {action}</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your Work From Home request for <strong>{date_str}</strong> has been
         <strong style="color:{colour}">{action.lower()}</strong>
         by <strong>{decided_by}</strong>.</p>
      {reason_line}""")
    text = (
        f"WFH {action} — {date_str}\n"
        f"Hi {employee_name}, your WFH request has been {action.lower()}."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, f"wfh_{action.lower()}", company_id=company_id
    )


async def send_attendance_regularization_decision_email(
    to_email: str,
    employee_name: str,
    date_str: str,
    approved: bool,
    reason: Optional[str],
    decided_by: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    action = "Approved" if approved else "Rejected"
    colour = "#059669" if approved else "#DC2626"
    subject = f"Attendance Regularization {action} — {date_str}"
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">Attendance Regularization {action}</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your attendance regularization request for <strong>{date_str}</strong> has been
         <strong style="color:{colour}">{action.lower()}</strong>
         by <strong>{decided_by}</strong>.</p>
      {reason_line}""")
    text = (
        f"Attendance Regularization {action} — {date_str}\n"
        f"Hi {employee_name}, your request has been {action.lower()}."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, f"attendance_regularization_{action.lower()}", company_id=company_id
    )


async def send_shift_change_decision_email(
    to_email: str,
    employee_name: str,
    new_shift: str,
    effective_date: str,
    approved: bool,
    reason: Optional[str],
    decided_by: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    action = "Approved" if approved else "Rejected"
    colour = "#059669" if approved else "#DC2626"
    subject = f"Shift Change {action}"
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">Shift Change {action}</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your shift change request has been
         <strong style="color:{colour}">{action.lower()}</strong>
         by <strong>{decided_by}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>New Shift:</strong> {new_shift}</p>
        <p style="margin:0"><strong>Effective From:</strong> {effective_date}</p>
      </div>
      {reason_line}""")
    text = (
        f"Shift Change {action}\n"
        f"Hi {employee_name}, shift: {new_shift} effective {effective_date} has been {action.lower()}."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, f"shift_change_{action.lower()}", company_id=company_id
    )


async def send_exit_request_decision_email(
    to_email: str,
    employee_name: str,
    last_working_day: Optional[str],
    approved: bool,
    reason: Optional[str],
    decided_by: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    action = "Approved" if approved else "Rejected"
    colour = "#059669" if approved else "#DC2626"
    subject = f"Exit Request {action} — {company_name}"
    lwd_line = (
        f"<p style='margin:0'><strong>Last Working Day:</strong> {last_working_day}</p>"
        if last_working_day and approved else ""
    )
    reason_line = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:{colour};margin-top:0">Exit Request {action}</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your exit request has been
         <strong style="color:{colour}">{action.lower()}</strong>
         by <strong>{decided_by}</strong>.</p>
      {'<div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">' + lwd_line + '</div>' if lwd_line else ""}
      {reason_line}""")
    text = (
        f"Exit Request {action} — {company_name}\n"
        f"Hi {employee_name}, your exit request has been {action.lower()}."
        + (f"\nLast Working Day: {last_working_day}" if last_working_day and approved else "")
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, f"exit_request_{action.lower()}", company_id=company_id
    )


async def send_payslip_generated_email(
    to_email: str,
    employee_name: str,
    month_year: str,
    net_pay: float,
    currency: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Payslip for {month_year} — {company_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Payslip Generated</h2>
      <p>Hi <strong>{employee_name}</strong>,</p>
      <p>Your payslip for <strong>{month_year}</strong> has been generated.</p>
      <div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                  padding:16px;margin:16px 0;text-align:center">
        <p style="margin:0;font-size:13px;color:#374151">Net Pay</p>
        <p style="margin:4px 0 0;font-size:28px;font-weight:700;color:#059669">
          {currency} {net_pay:,.2f}
        </p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Payslip
        </a>
      </div>""")
    text = (
        f"Payslip for {month_year} — {company_name}\n"
        f"Hi {employee_name}, your payslip is ready. Net Pay: {currency} {net_pay:,.2f}\n"
        f"Login to view: {login_url}"
    )
    return await send_email(
        to_email, subject, html, text, "payslip_generated", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Task emails — updated, completed, due reminder, overdue
# ─────────────────────────────────────────────────────────────────────────────

async def send_task_updated_email(
    to_email: str,
    assignee_name: str,
    task_title: str,
    updated_by_name: str,
    changes_summary: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/tasks"
    subject = f"Task Updated — {task_title}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Task Updated</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{updated_by_name}</strong> updated a task assigned to you
         in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Task:</strong> {task_title}</p>
        <p style="margin:0;color:#6B7280;font-size:13px">{changes_summary}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Task
        </a>
      </div>""")
    text = (
        f"Task Updated — {task_title}\n"
        f"Hi {assignee_name}, {updated_by_name} updated your task: {changes_summary}"
    )
    return await send_email(
        to_email, subject, html, text, "task_updated", company_id=company_id
    )


async def send_task_reminder_email(
    to_email: str,
    assignee_name: str,
    task_title: str,
    due_date: str,
    priority: str,
    company_name: str,
    overdue: bool = False,
    company_id: str = "",
) -> bool:
    label = "Overdue" if overdue else "Due Soon"
    colour = "#DC2626" if overdue else "#D97706"
    subject = f"Task {label} — {task_title}"
    event = "task_overdue" if overdue else "task_due_reminder"
    login_url = f"{settings.FRONTEND_URL}/tasks"
    html = _wrap(f"""
      <div style="background:{'#FEF2F2' if overdue else '#FFFBEB'};
                  border-left:4px solid {colour};padding:16px;
                  border-radius:4px;margin-bottom:24px">
        <strong style="color:{colour}">{'⚠ Task Overdue' if overdue else '⏰ Task Due Soon'}</strong>
      </div>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p>A task assigned to you in <strong>{company_name}</strong> is
         {'overdue' if overdue else 'due soon'}.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Task:</strong> {task_title}</p>
        <p style="margin:0 0 6px"><strong>Due Date:</strong>
          <span style="color:{colour};font-weight:700">{due_date}</span></p>
        <p style="margin:0"><strong>Priority:</strong> {priority.upper()}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:{colour};color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          {'View Overdue Task' if overdue else 'View Task'}
        </a>
      </div>""")
    text = (
        f"Task {label} — {task_title}\n"
        f"Hi {assignee_name}, your task is {'overdue' if overdue else 'due soon'}.\n"
        f"Due: {due_date} | Priority: {priority}"
    )
    return await send_email(
        to_email, subject, html, text, event, company_id=company_id
    )


async def send_task_completed_email(
    to_email: str,
    recipient_name: str,
    task_title: str,
    completed_by_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    subject = f"Task Completed — {task_title}"
    html = _wrap(f"""
      <h2 style="color:#059669;margin-top:0">Task Completed ✓</h2>
      <p>Hi <strong>{recipient_name}</strong>,</p>
      <p><strong>{completed_by_name}</strong> has marked the following task as completed
         in <strong>{company_name}</strong>.</p>
      <div style="background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0"><strong>{task_title}</strong></p>
      </div>""")
    text = (
        f"Task Completed — {task_title}\n"
        f"Hi {recipient_name}, {completed_by_name} completed: {task_title}"
    )
    return await send_email(
        to_email, subject, html, text, "task_completed", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Partner emails
# ─────────────────────────────────────────────────────────────────────────────

async def send_partner_created_email(
    to_email: str,
    full_name: str,
    username: str,
    company_name: str,
    temp_password: Optional[str] = None,
    company_id: str = "",
) -> bool:
    """Welcome + credentials email for newly created partner accounts."""
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} Partner account — {company_name}"
    creds_block = (
        f"""<div style="background:#F0FDF4;border:1px solid #86EFAC;border-radius:8px;
                        padding:16px;margin:16px 0">
          <p style="margin:0 0 8px"><strong>Username:</strong> {username}</p>
          <p style="margin:0 0 8px"><strong>Temporary Password:</strong>
            <code style="background:#DCFCE7;padding:2px 8px;border-radius:4px;
                         font-size:13px">{temp_password}</code>
          </p>
          <p style="margin:0;color:#16A34A;font-size:12px">
            You will be prompted to change this password on first login.
          </p>
        </div>"""
        if temp_password else
        f"<p><strong>Username:</strong> {username}</p>"
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">Welcome to {_BRAND} Partner Portal!</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>A partner account has been created for you at <strong>{company_name}</strong>.</p>
      {creds_block}
      <div style="text-align:center;margin:32px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block;font-size:14px">
          Login to Partner Portal
        </a>
      </div>""")
    text = (
        f"Hi {full_name},\n\nYour {_BRAND} partner account is ready for {company_name}.\n"
        f"Login: {login_url}\nUsername: {username}"
        + (f"\nTemporary Password: {temp_password}" if temp_password else "")
    )
    return await send_email(
        to_email, subject, html, text, "partner_created", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  CRM emails — lead assigned, client assigned, target achieved
# ─────────────────────────────────────────────────────────────────────────────

async def send_lead_assigned_email(
    to_email: str,
    assignee_name: str,
    lead_name: str,
    company_name: str,
    assigned_by_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/leads"
    subject = f"Lead Assigned — {lead_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New Lead Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned a new lead to you
         in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0"><strong>Lead:</strong> {lead_name}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Lead
        </a>
      </div>""")
    text = f"Hi {assignee_name}, {assigned_by_name} assigned lead: {lead_name}"
    return await send_email(
        to_email, subject, html, text, "lead_assigned", company_id=company_id
    )


async def send_client_assigned_email(
    to_email: str,
    assignee_name: str,
    client_name: str,
    company_name: str,
    assigned_by_name: str,
    company_id: str = "",
) -> bool:
    login_url = f"{settings.FRONTEND_URL}/clients"
    subject = f"Client Assigned — {client_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New Client Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned a client to you
         in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0"><strong>Client:</strong> {client_name}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:700;display:inline-block">
          View Client
        </a>
      </div>""")
    text = f"Hi {assignee_name}, {assigned_by_name} assigned client: {client_name}"
    return await send_email(
        to_email, subject, html, text, "client_assigned", company_id=company_id
    )


async def send_target_achieved_email(
    to_email: str,
    recipient_name: str,
    target_name: str,
    target_value: float,
    achieved_value: float,
    unit: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    """Email sent to assignee (and optionally reporting manager) when a target is achieved."""
    subject = f"Target Achieved — {target_name}"
    pct = int((achieved_value / target_value * 100)) if target_value else 0
    html = _wrap(f"""
      <h2 style="color:#059669;margin-top:0">Target Achieved!</h2>
      <p>Hi <strong>{recipient_name}</strong>,</p>
      <p>Congratulations! A target has been achieved in <strong>{company_name}</strong>.</p>
      <div style="background:#D1FAE5;border:1px solid #6EE7B7;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Target:</strong> {target_name}</p>
        <p style="margin:0 0 6px"><strong>Goal:</strong> {target_value} {unit}</p>
        <p style="margin:0 0 6px"><strong>Achieved:</strong>
          <span style="color:#059669;font-weight:700">{achieved_value} {unit}</span></p>
        <p style="margin:0"><strong>Achievement:</strong>
          <span style="color:#059669;font-weight:700">{pct}%</span></p>
      </div>""")
    text = (
        f"Target Achieved — {target_name}\n"
        f"Hi {recipient_name}, the target has been achieved!\n"
        f"Goal: {target_value} {unit} | Achieved: {achieved_value} {unit} ({pct}%)"
    )
    return await send_email(
        to_email, subject, html, text, "target_achieved", company_id=company_id
    )


# ─────────────────────────────────────────────────────────────────────────────
#  Owner / Admin notification emails  (force_system=True)
# ─────────────────────────────────────────────────────────────────────────────

async def send_new_user_added_notification(
    to_email: str,
    admin_name: str,
    new_user_name: str,
    new_user_email: str,
    new_user_role: str,
    added_by_name: str,
    company_name: str,
) -> bool:
    subject = f"New User Added — {new_user_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5;margin-top:0">New User Added</h2>
      <p>Hi <strong>{admin_name}</strong>,</p>
      <p>A new user has been added to <strong>{company_name}</strong>
         by <strong>{added_by_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;
                  padding:16px;margin:16px 0">
        <p style="margin:0 0 6px"><strong>Name:</strong> {new_user_name}</p>
        <p style="margin:0 0 6px"><strong>Email:</strong> {new_user_email}</p>
        <p style="margin:0"><strong>Role:</strong> {new_user_role}</p>
      </div>""")
    text = (
        f"New User Added — {company_name}\n"
        f"Hi {admin_name}, {added_by_name} added: {new_user_name} ({new_user_email}) as {new_user_role}."
    )
    return await send_email(
        to_email, subject, html, text, "admin_new_user_added", force_system=True
    )


async def send_seat_limit_reached_notification(
    to_email: str,
    admin_name: str,
    company_name: str,
    seat_limit: int,
) -> bool:
    subject = f"Seat Limit Reached — {company_name}"
    html = _wrap(f"""
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:16px;
                  border-radius:4px;margin-bottom:24px">
        <strong style="color:#991B1B">⚠ User Seat Limit Reached</strong>
      </div>
      <p>Hi <strong>{admin_name}</strong>,</p>
      <p>Your <strong>{company_name}</strong> account has reached the maximum seat limit
         of <strong>{seat_limit} users</strong>.</p>
      <p>To add more users, please upgrade your subscription plan.</p>""")
    text = (
        f"Seat Limit Reached — {company_name}\n"
        f"Hi {admin_name}, you have reached the {seat_limit}-user limit. Upgrade to add more users."
    )
    return await send_email(
        to_email, subject, html, text, "seat_limit_reached", force_system=True
    )


async def send_payment_failed_notification(
    to_email: str,
    admin_name: str,
    company_name: str,
    amount: float,
    currency: str,
    reason: Optional[str],
) -> bool:
    subject = f"Payment Failed — {company_name}"
    html = _wrap(f"""
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:16px;
                  border-radius:4px;margin-bottom:24px">
        <strong style="color:#991B1B">⚠ Payment Failed</strong>
      </div>
      <p>Hi <strong>{admin_name}</strong>,</p>
      <p>A payment of <strong>{currency} {amount:,.2f}</strong> for your
         <strong>{company_name}</strong> subscription could not be processed.</p>
      {f"<p style='color:#6B7280;font-size:13px'>Reason: {reason}</p>" if reason else ""}
      <p>Please update your payment details to avoid service interruption.</p>""")
    text = (
        f"Payment Failed — {company_name}\n"
        f"Hi {admin_name}, payment of {currency} {amount:,.2f} failed."
        + (f"\nReason: {reason}" if reason else "")
    )
    return await send_email(
        to_email, subject, html, text, "payment_failed", force_system=True
    )


async def send_subscription_cancelled_notification(
    to_email: str,
    admin_name: str,
    company_name: str,
    cancelled_date: str,
) -> bool:
    subject = f"Subscription Cancelled — {company_name}"
    html = _wrap(f"""
      <div style="background:#FEF2F2;border-left:4px solid #EF4444;padding:16px;
                  border-radius:4px;margin-bottom:24px">
        <strong style="color:#991B1B">Subscription Cancelled</strong>
      </div>
      <p>Hi <strong>{admin_name}</strong>,</p>
      <p>Your <strong>{company_name}</strong> subscription has been cancelled
         effective <strong>{cancelled_date}</strong>.</p>
      <p>Access to the platform will be restricted from this date.
         Contact support to re-activate your subscription.</p>""")
    text = (
        f"Subscription Cancelled — {company_name}\n"
        f"Hi {admin_name}, your subscription was cancelled on {cancelled_date}."
    )
    return await send_email(
        to_email, subject, html, text, "subscription_cancelled", force_system=True
    )


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
    send_trial_verification_email = staticmethod(send_trial_verification_email)
    send_password_reset_email = staticmethod(send_password_reset_email)
    send_password_changed_email = staticmethod(send_password_changed_email)
    send_subscription_reminder_email = staticmethod(send_subscription_reminder_email)

    # --- admin credential emails ---
    send_admin_password_reset_email = staticmethod(send_admin_password_reset_email)

    # --- business / user emails ---
    send_welcome_email = staticmethod(send_welcome_email)
    send_partner_created_email = staticmethod(send_partner_created_email)

    # --- task emails ---
    send_task_assigned_email = staticmethod(send_task_assigned_email)
    send_task_updated_email = staticmethod(send_task_updated_email)
    send_task_reminder_email = staticmethod(send_task_reminder_email)
    send_task_completed_email = staticmethod(send_task_completed_email)

    # --- CRM emails ---
    send_target_assigned_email = staticmethod(send_target_assigned_email)
    send_target_achieved_email = staticmethod(send_target_achieved_email)
    send_lead_assigned_email = staticmethod(send_lead_assigned_email)
    send_client_assigned_email = staticmethod(send_client_assigned_email)
    send_invoice_sent_email = staticmethod(send_invoice_sent_email)

    # --- recruitment emails ---
    send_candidate_registered_email = staticmethod(send_candidate_registered_email)
    send_candidate_status_email = staticmethod(send_candidate_status_email)
    send_candidate_form_link_email = staticmethod(send_candidate_form_link_email)
    send_offer_letter_email = staticmethod(send_offer_letter_email)
    send_offer_response_email = staticmethod(send_offer_response_email)
    send_interview_scheduled_email = staticmethod(send_interview_scheduled_email)
    send_interview_rescheduled_email = staticmethod(send_interview_rescheduled_email)
    send_interview_cancelled_email = staticmethod(send_interview_cancelled_email)
    send_interviewer_assigned_email = staticmethod(send_interviewer_assigned_email)
    send_interviewer_cancelled_email = staticmethod(send_interviewer_cancelled_email)
    send_job_opened_email = staticmethod(send_job_opened_email)

    # --- HRM emails ---
    send_leave_decision_email = staticmethod(send_leave_decision_email)
    send_wfh_decision_email = staticmethod(send_wfh_decision_email)
    send_attendance_regularization_decision_email = staticmethod(send_attendance_regularization_decision_email)
    send_shift_change_decision_email = staticmethod(send_shift_change_decision_email)
    send_exit_request_decision_email = staticmethod(send_exit_request_decision_email)
    send_payslip_generated_email = staticmethod(send_payslip_generated_email)
    send_employee_onboarding_link_email = staticmethod(send_employee_onboarding_link_email)

    # --- admin notifications ---
    send_new_user_added_notification = staticmethod(send_new_user_added_notification)
    send_seat_limit_reached_notification = staticmethod(send_seat_limit_reached_notification)
    send_payment_failed_notification = staticmethod(send_payment_failed_notification)
    send_subscription_cancelled_notification = staticmethod(send_subscription_cancelled_notification)

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
