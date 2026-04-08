"""
Email Service — Dual SMTP (system + tenant) with fallback and logging.

Routing rules:
  - SYSTEM emails (auth, verification, password reset) → always system SMTP
  - BUSINESS emails (invoices, targets, tasks, welcome) → tenant SMTP if configured,
    fallback to system SMTP on error or if not configured

All sends are logged to master_db.email_logs.
"""

import asyncio
import smtplib
import logging
from datetime import datetime, timezone
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional

from app.core.config import settings
from app.core.database import get_master_db, get_company_db

logger = logging.getLogger(__name__)


# ── Fernet helper ─────────────────────────────────────────────────────────────

def _fernet():
    """Return Fernet instance, or None if key is not set."""
    if not settings.FERNET_SECRET_KEY:
        return None
    try:
        from cryptography.fernet import Fernet
        return Fernet(settings.FERNET_SECRET_KEY.encode())
    except Exception:
        return None


def encrypt_password(plain: str) -> str:
    f = _fernet()
    if not f:
        return plain
    return f.encrypt(plain.encode()).decode()


def decrypt_password(encrypted: str) -> str:
    f = _fernet()
    if not f:
        return encrypted
    try:
        return f.decrypt(encrypted.encode()).decode()
    except Exception:
        return encrypted


# ── Low-level send ─────────────────────────────────────────────────────────────

def _smtp_cfg_from_settings() -> dict:
    return {
        "host": settings.SMTP_HOST,
        "port": settings.SMTP_PORT,
        "username": settings.SMTP_USERNAME,
        "password": settings.SMTP_PASSWORD,
        "from_email": settings.SMTP_FROM_EMAIL,
        "from_name": settings.SMTP_FROM_NAME,
    }


def _do_send(cfg: dict, to_email: str, subject: str, html_body: str, text_body: str = "") -> None:
    """
    Synchronous SMTP send.  Raises on failure so callers can fallback.
    cfg keys: host, port, username, password, from_email, from_name
    """
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"{cfg['from_name']} <{cfg['from_email']}>"
    msg["To"] = to_email

    if text_body:
        msg.attach(MIMEText(text_body, "plain"))
    msg.attach(MIMEText(html_body, "html"))

    with smtplib.SMTP(cfg["host"], cfg["port"], timeout=15) as server:
        server.ehlo()
        server.starttls()
        server.login(cfg["username"], cfg["password"])
        server.sendmail(cfg["from_email"], to_email, msg.as_string())


# ── Email log ─────────────────────────────────────────────────────────────────

async def _log_email(
    to: str,
    subject: str,
    event_type: str,
    smtp_used: str,   # "system" | "tenant" | "none"
    success: bool,
    error: str = "",
    company_id: str = "",
) -> None:
    """Fire-and-forget write to master_db.email_logs."""
    try:
        master_db = get_master_db()
        await master_db.email_logs.insert_one({
            "to": to,
            "subject": subject,
            "event_type": event_type,
            "smtp_used": smtp_used,
            "company_id": company_id,
            "success": success,
            "error": error,
            "created_at": datetime.now(timezone.utc),
        })
    except Exception as exc:
        logger.debug("Failed to write email log: %s", exc)


# ── Tenant SMTP config ─────────────────────────────────────────────────────────

async def _get_tenant_smtp(company_id: str) -> Optional[dict]:
    """
    Load and decrypt tenant SMTP config from company_db.smtp_config.
    Returns None if not configured or not enabled.
    """
    if not company_id:
        return None
    try:
        db = get_company_db(company_id)
        doc = await db.smtp_config.find_one({"_id": "smtp"})
        if not doc or not doc.get("enabled"):
            return None
        return {
            "host": doc["host"],
            "port": int(doc.get("port", 587)),
            "username": doc["username"],
            "password": decrypt_password(doc["password"]),
            "from_email": doc.get("from_email", doc["username"]),
            "from_name": doc.get("from_name", ""),
        }
    except Exception as exc:
        logger.debug("Could not load tenant SMTP for %s: %s", company_id, exc)
        return None


# ── Core send function ─────────────────────────────────────────────────────────

async def send_email(
    to: str,
    subject: str,
    html_body: str,
    text_body: str = "",
    event_type: str = "general",
    *,
    company_id: str = "",          # when set, tries tenant SMTP first
    force_system: bool = False,    # auth/system emails always bypass tenant SMTP
) -> bool:
    """
    Send an email.  Returns True on success, False on failure/disabled.

    Routing:
      - force_system=True OR no company_id  → system SMTP only
      - company_id provided                 → try tenant SMTP, fallback to system
    """
    if not settings.EMAIL_ENABLED:
        logger.debug("[EMAIL DISABLED] %s → %s", event_type, to)
        return False

    sys_cfg = _smtp_cfg_from_settings()
    if not sys_cfg["username"]:
        logger.info("[EMAIL FALLBACK - SMTP not configured] %s → %s", event_type, to)
        await _log_email(to, subject, event_type, "none", False, "SMTP not configured", company_id)
        return False

    # Try tenant SMTP (business emails)
    if company_id and not force_system:
        tenant_cfg = await _get_tenant_smtp(company_id)
        if tenant_cfg:
            try:
                await asyncio.to_thread(_do_send, tenant_cfg, to, subject, html_body, text_body)
                logger.info("[EMAIL SENT via tenant] %s → %s | %s", event_type, to, subject)
                await _log_email(to, subject, event_type, "tenant", True, "", company_id)
                return True
            except Exception as exc:
                logger.warning("[EMAIL tenant failed, falling back to system] %s: %s", to, exc)

    # System SMTP
    try:
        await asyncio.to_thread(_do_send, sys_cfg, to, subject, html_body, text_body)
        logger.info("[EMAIL SENT via system] %s → %s | %s", event_type, to, subject)
        await _log_email(to, subject, event_type, "system", True, "", company_id)
        return True
    except Exception as exc:
        logger.error("[EMAIL ERROR] %s → %s | %s", event_type, to, exc)
        await _log_email(to, subject, event_type, "system", False, str(exc), company_id)
        return False


# ── Email templates ───────────────────────────────────────────────────────────

_BRAND = settings.SMTP_FROM_NAME or "CRM Platform"


def _wrap(body_html: str) -> str:
    return f"""
<div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;color:#374151">
  {body_html}
  <hr style="border:none;border-top:1px solid #E5E7EB;margin:32px 0">
  <p style="color:#9CA3AF;font-size:12px">
    This email was sent by {_BRAND}. Do not reply to this email.
  </p>
</div>"""


# ── Auth / system emails (force_system=True) ──────────────────────────────────

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
      <h2 style="color:#4F46E5">Welcome to {_BRAND}!</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Thanks for signing up. Please verify your email address to activate your account.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{verify_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          Verify Email Address
        </a>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Or copy this link: <a href="{verify_url}">{verify_url}</a>
      </p>
      <p style="color:#6B7280;font-size:12px">
        This link expires in <strong>{expire_min} minutes</strong>.
        If you did not create an account, ignore this email.
      </p>""")
    text = f"Hi {full_name},\n\nVerify your email: {verify_url}\nExpires in {expire_min} minutes."
    return await send_email(to_email, subject, html, text, "email_verification", force_system=True)


async def send_password_reset_email(
    to_email: str,
    full_name: str,
    reset_token: str,
) -> bool:
    reset_url = f"{settings.FRONTEND_URL}/reset-password?token={reset_token}"
    subject = f"Reset your {_BRAND} password"
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Password Reset</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>We received a request to reset your password. Click the button below to choose a new one.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{reset_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          Reset Password
        </a>
      </div>
      <p style="color:#6B7280;font-size:12px">
        This link expires in <strong>1 hour</strong>.
        If you did not request this, ignore this email.
      </p>""")
    text = f"Hi {full_name},\n\nReset your password: {reset_url}\nExpires in 1 hour."
    return await send_email(to_email, subject, html, text, "password_reset", force_system=True)


async def send_subscription_reminder_email(
    to_email: str,
    full_name: str,
    company_name: str,
    plan_expiry: Optional[datetime],
    account_type: str = "tenant",
) -> bool:
    expiry_str = plan_expiry.strftime("%d %B %Y") if plan_expiry else "soon"
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} subscription expires in 3 days"
    html = _wrap(f"""
      <div style="background:#FEF3C7;border-left:4px solid #F59E0B;padding:16px;margin-bottom:24px;border-radius:4px">
        <h2 style="color:#92400E;margin:0 0 8px 0">Subscription Expiring Soon</h2>
        <p style="color:#92400E;margin:0">Your subscription expires in 3 days</p>
      </div>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your <strong>{company_name}</strong> subscription expires on
         <strong style="color:#DC2626">{expiry_str}</strong>.</p>
      <div style="text-align:center;margin:32px 0">
        <a href="{login_url}"
           style="background:#F59E0B;color:#fff;padding:14px 32px;border-radius:8px;
                  text-decoration:none;font-weight:bold;font-size:16px;display:inline-block">
          Renew Subscription
        </a>
      </div>""")
    text = (f"Hi {full_name},\n\nYour {company_name} subscription expires on {expiry_str}.\n"
            f"Renew at: {login_url}")
    return await send_email(to_email, subject, html, text, "subscription_reminder", force_system=True)


# ── Business emails (use tenant SMTP when available) ──────────────────────────

async def send_welcome_email(
    to_email: str,
    full_name: str,
    username: str,
    company_name: str,
    temp_password: Optional[str] = None,
    company_id: str = "",
) -> bool:
    """Welcome email for admin-created accounts (with temp password)."""
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your {_BRAND} account is ready — {company_name}"
    creds = (
        f"<p><strong>Username:</strong> {username}</p>"
        f"<p><strong>Temporary Password:</strong> <code style='background:#F3F4F6;padding:2px 6px;border-radius:4px'>{temp_password}</code></p>"
        f"<p style='color:#DC2626;font-size:13px'>Please change your password on first login.</p>"
        if temp_password
        else f"<p><strong>Username:</strong> {username}</p>"
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Welcome to {_BRAND}!</h2>
      <p>Hi <strong>{full_name}</strong>,</p>
      <p>Your account for <strong>{company_name}</strong> has been created.</p>
      {creds}
      <div style="text-align:center;margin:32px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:14px 28px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          Login Now
        </a>
      </div>""")
    text = (f"Hi {full_name},\n\nYour {company_name} account is ready.\n"
            f"Login at {login_url}\nUsername: {username}"
            + (f"\nTemporary Password: {temp_password}" if temp_password else ""))
    return await send_email(to_email, subject, html, text, "user_created", company_id=company_id)


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
    subject = f"New task assigned to you — {task_title}"
    due_str = f"<p><strong>Due Date:</strong> {due_date}</p>" if due_date else ""
    html = _wrap(f"""
      <h2 style="color:#4F46E5">New Task Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned you a new task in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Task:</strong> {task_title}</p>
        <p style="margin:0 0 8px 0;color:#6B7280">{task_description or ''}</p>
        <p style="margin:0 0 8px 0"><strong>Priority:</strong>
          <span style="color:{'#DC2626' if priority=='high' else '#F59E0B' if priority=='medium' else '#10B981'}">{priority.upper()}</span>
        </p>
        {due_str}
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          View Task
        </a>
      </div>""")
    text = (f"Hi {assignee_name},\n\n{assigned_by_name} assigned you: {task_title}\n"
            f"Priority: {priority}" + (f"\nDue: {due_date}" if due_date else ""))
    return await send_email(to_email, subject, html, text, "task_assigned", company_id=company_id)


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
    subject = f"New target assigned to you — {target_name}"
    html = _wrap(f"""
      <h2 style="color:#4F46E5">New Target Assigned</h2>
      <p>Hi <strong>{assignee_name}</strong>,</p>
      <p><strong>{assigned_by_name}</strong> has assigned you a new target in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Target:</strong> {target_name}</p>
        <p style="margin:0 0 8px 0"><strong>Goal:</strong> {target_value} {unit}</p>
        <p style="margin:0 0 8px 0"><strong>Period:</strong> {period}</p>
        <p style="margin:0 0 4px 0"><strong>Duration:</strong> {start_date} → {end_date}</p>
      </div>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          View Target
        </a>
      </div>""")
    text = (f"Hi {assignee_name},\n\n{assigned_by_name} assigned you: {target_name}\n"
            f"Goal: {target_value} {unit} | Period: {period}\n{start_date} to {end_date}")
    return await send_email(to_email, subject, html, text, "target_assigned", company_id=company_id)


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
    due_str = f"<p><strong>Due Date:</strong> {due_date}</p>" if due_date else ""
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Invoice from {company_name}</h2>
      <p>Dear <strong>{client_name}</strong>,</p>
      <p>Please find your invoice details below.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Invoice #:</strong> {invoice_number}</p>
        <p style="margin:0 0 8px 0"><strong>Amount:</strong> {currency} {amount:,.2f}</p>
        {due_str}
        <p style="margin:0"><strong>From:</strong> {company_name}</p>
      </div>
      <p style="color:#6B7280;font-size:13px">
        Please contact us if you have any questions about this invoice.
      </p>""")
    text = (f"Invoice {invoice_number} from {company_name}\n"
            f"Dear {client_name},\nAmount: {currency} {amount:,.2f}"
            + (f"\nDue: {due_date}" if due_date else ""))
    return await send_email(to_email, subject, html, text, "invoice_sent", company_id=company_id)


# ── Tenant SMTP test ───────────────────────────────────────────────────────────

def test_smtp_connection(cfg: dict) -> tuple[bool, str]:
    """
    Synchronous test — call via asyncio.to_thread from an endpoint.
    Returns (success, message).
    """
    try:
        with smtplib.SMTP(cfg["host"], int(cfg.get("port", 587)), timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(cfg["username"], cfg["password"])
        return True, "SMTP connection successful"
    except smtplib.SMTPAuthenticationError:
        return False, "Authentication failed — check username/password"
    except smtplib.SMTPConnectError as e:
        return False, f"Could not connect to {cfg['host']}:{cfg.get('port', 587)} — {e}"
    except Exception as e:
        return False, str(e)


async def send_candidate_registered_email(
    to_email: str,
    candidate_name: str,
    position_applied: Optional[str],
    recruiter_name: str,
    company_name: str,
    company_id: str = "",
) -> bool:
    """Confirmation email to candidate when they are added to the system."""
    login_url = f"{settings.FRONTEND_URL}/login"
    subject = f"Your profile has been registered — {company_name}"
    position_line = (
        f"<p>You have been shortlisted for the position of <strong>{position_applied}</strong>.</p>"
        if position_applied else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Profile Registered</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Your profile has been successfully registered with <strong>{company_name}</strong>.</p>
      {position_line}
      <p>Our recruiter <strong>{recruiter_name}</strong> will be in touch with you shortly
         regarding next steps.</p>
      <p style="color:#6B7280;font-size:13px">
        If you have any questions, please reply to this email or contact your recruiter directly.
      </p>""")
    text = (f"Dear {candidate_name},\n\nYour profile has been registered with {company_name}."
            + (f"\nPosition: {position_applied}" if position_applied else "")
            + f"\nRecruiter: {recruiter_name}")
    return await send_email(to_email, subject, html, text, "candidate_registered", company_id=company_id)


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
    """Email to candidate when an interview is scheduled."""
    subject = f"Interview Scheduled — {job_title} at {company_name}"
    mode_label = interview_mode.replace("_", " ").title()
    location_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Link"
    location_line = (
        f"<p><strong>{location_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    interviewers_line = (
        f"<p><strong>Interviewer(s):</strong> {', '.join(interviewer_names)}</p>"
        if interviewer_names else ""
    )
    instructions_block = (
        f"<div style='background:#FFF7ED;border-left:3px solid #F59E0B;padding:12px;margin-top:12px;"
        f"border-radius:4px;font-size:13px;color:#92400E'>"
        f"<strong>Instructions:</strong> {instructions}</div>"
        if instructions else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Interview Scheduled</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Congratulations! Your interview has been scheduled for the position of
         <strong>{job_title}</strong> at <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Date:</strong> {interview_date}</p>
        <p style="margin:0 0 8px 0"><strong>Time:</strong> {interview_time}</p>
        <p style="margin:0 0 8px 0"><strong>Duration:</strong> {duration_minutes} minutes</p>
        <p style="margin:0 0 8px 0"><strong>Mode:</strong> {mode_label}</p>
        {location_line}
        {interviewers_line}
      </div>
      {instructions_block}
      <p style="color:#6B7280;font-size:13px;margin-top:16px">
        Please be available 5–10 minutes before the scheduled time.
        If you need to reschedule, contact your recruiter immediately.
      </p>""")
    text = (f"Dear {candidate_name},\n\nInterview scheduled for {job_title} at {company_name}.\n"
            f"Date: {interview_date} | Time: {interview_time} | Mode: {mode_label}\n"
            + (f"Duration: {duration_minutes} min\n" if duration_minutes else "")
            + (f"Location/Link: {venue_or_link}\n" if venue_or_link else "")
            + (f"Instructions: {instructions}" if instructions else ""))
    return await send_email(to_email, subject, html, text, "interview_scheduled", company_id=company_id)


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
    """Email to candidate when an interview is rescheduled."""
    subject = f"Interview Rescheduled — {job_title} at {company_name}"
    mode_label = interview_mode.replace("_", " ").title() if interview_mode else ""
    location_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Link"
    location_line = (
        f"<p><strong>{location_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    reason_block = (
        f"<p style='color:#6B7280;font-size:13px'><strong>Reason:</strong> {reason}</p>"
        if reason else ""
    )
    html = _wrap(f"""
      <h2 style="color:#F59E0B">Interview Rescheduled</h2>
      <p>Dear <strong>{candidate_name}</strong>,</p>
      <p>Your interview for <strong>{job_title}</strong> at <strong>{company_name}</strong>
         has been rescheduled. Please note the updated details below.</p>
      <div style="background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>New Date:</strong> {new_date}</p>
        <p style="margin:0 0 8px 0"><strong>New Time:</strong> {new_time}</p>
        <p style="margin:0 0 4px 0"><strong>Mode:</strong> {mode_label}</p>
        {location_line}
      </div>
      {reason_block}
      <p style="color:#6B7280;font-size:13px">
        If this time does not work for you, please contact your recruiter immediately.
      </p>""")
    text = (f"Dear {candidate_name},\n\nInterview rescheduled: {job_title} at {company_name}.\n"
            f"New Date: {new_date} | New Time: {new_time}"
            + (f"\nReason: {reason}" if reason else ""))
    return await send_email(to_email, subject, html, text, "interview_rescheduled", company_id=company_id)


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
    """Email to interviewer(s) when they are assigned to an interview."""
    subject = f"You have been assigned as interviewer — {candidate_name} for {job_title}"
    mode_label = interview_mode.replace("_", " ").title() if interview_mode else ""
    location_label = "Venue" if interview_mode in ("in_person", "walk_in") else "Meeting Link"
    location_line = (
        f"<p><strong>{location_label}:</strong> {venue_or_link}</p>"
        if venue_or_link else ""
    )
    html = _wrap(f"""
      <h2 style="color:#4F46E5">Interview Assignment</h2>
      <p>Hi <strong>{interviewer_name}</strong>,</p>
      <p>You have been assigned as an interviewer for the following interview at
         <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Candidate:</strong> {candidate_name}</p>
        <p style="margin:0 0 8px 0"><strong>Position:</strong> {job_title}</p>
        <p style="margin:0 0 8px 0"><strong>Date:</strong> {interview_date}</p>
        <p style="margin:0 0 8px 0"><strong>Time:</strong> {interview_time}</p>
        <p style="margin:0 0 8px 0"><strong>Duration:</strong> {duration_minutes} minutes</p>
        <p style="margin:0 0 4px 0"><strong>Mode:</strong> {mode_label}</p>
        {location_line}
      </div>
      <p style="color:#6B7280;font-size:13px">
        Please review the candidate's profile before the interview. Log in to submit feedback after.
      </p>""")
    text = (f"Hi {interviewer_name},\n\nYou are assigned to interview {candidate_name} "
            f"for {job_title}.\nDate: {interview_date} | Time: {interview_time} | Mode: {mode_label}")
    return await send_email(to_email, subject, html, text, "interviewer_assigned", company_id=company_id)


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
    """Notify recruiting team when a new job is opened."""
    if not to_emails:
        return False
    login_url = f"{settings.FRONTEND_URL}/jobs"
    subject = f"New Job Opened: {job_title} [{job_code}]"
    html = _wrap(f"""
      <h2 style="color:#4F46E5">New Job Requirement</h2>
      <p>A new job has been opened in <strong>{company_name}</strong>.</p>
      <div style="background:#F9FAFB;border:1px solid #E5E7EB;border-radius:8px;padding:16px;margin:16px 0">
        <p style="margin:0 0 8px 0"><strong>Position:</strong> {job_title}</p>
        <p style="margin:0 0 8px 0"><strong>Client:</strong> {client_name}</p>
        <p style="margin:0 0 8px 0"><strong>Job Code:</strong> {job_code}</p>
        <p style="margin:0 0 8px 0"><strong>Location:</strong> {location or 'Not specified'}</p>
        <p style="margin:0 0 4px 0"><strong>Openings:</strong> {openings}</p>
      </div>
      <p>Created by <strong>{created_by_name}</strong>.</p>
      <div style="text-align:center;margin:24px 0">
        <a href="{login_url}"
           style="background:#4F46E5;color:#fff;padding:12px 24px;border-radius:8px;
                  text-decoration:none;font-weight:bold;display:inline-block">
          View Job
        </a>
      </div>""")
    text = (f"New Job: {job_title} [{job_code}]\nClient: {client_name}\n"
            f"Location: {location or 'N/A'} | Openings: {openings}\nBy: {created_by_name}")

    # Send to all recipients; return True if at least one succeeds
    results = []
    for email in to_emails:
        ok = await send_email(email, subject, html, text, "job_opened", company_id=company_id)
        results.append(ok)
    return any(results)


# ── Singleton alias (backwards compat) ────────────────────────────────────────

class EmailService:
    """Thin wrapper kept for imports that use email_service.send_*(...) style."""
    send_verification_email = staticmethod(send_verification_email)
    send_password_reset_email = staticmethod(send_password_reset_email)
    send_welcome_email = staticmethod(send_welcome_email)
    send_subscription_reminder_email = staticmethod(send_subscription_reminder_email)
    send_task_assigned_email = staticmethod(send_task_assigned_email)
    send_target_assigned_email = staticmethod(send_target_assigned_email)
    send_invoice_sent_email = staticmethod(send_invoice_sent_email)
    send_candidate_registered_email = staticmethod(send_candidate_registered_email)
    send_interview_scheduled_email = staticmethod(send_interview_scheduled_email)
    send_interview_rescheduled_email = staticmethod(send_interview_rescheduled_email)
    send_interviewer_assigned_email = staticmethod(send_interviewer_assigned_email)
    send_job_opened_email = staticmethod(send_job_opened_email)


email_service = EmailService()
