"""
Application Configuration
Handles all environment variables and settings
"""

from pydantic_settings import BaseSettings, SettingsConfigDict
from typing import List
import os


class Settings(BaseSettings):
    """Application settings loaded from environment variables"""

    # Application
    APP_NAME: str = "Niyan HireFlow"
    APP_VERSION: str = "1.0.0"
    DEBUG: bool = False

    # MongoDB Configuration
    MONGODB_URI: str = "mongodb://localhost:27017"
    MASTER_DB_NAME: str = "master_db"

    # JWT Configuration
    JWT_SECRET_KEY: str = "your-super-secret-key-change-in-production"
    JWT_ALGORITHM: str = "HS256"
    JWT_ACCESS_TOKEN_EXPIRE_MINUTES: int = 30    # 30 minutes
    JWT_REFRESH_TOKEN_EXPIRE_DAYS: int = 1       # 1 day

    # Razorpay Configuration
    RAZORPAY_KEY_ID: str = ""
    RAZORPAY_KEY_SECRET: str = ""
    RAZORPAY_WEBHOOK_SECRET: str = ""

    # CORS
    ALLOWED_ORIGINS: List[str] = ["http://localhost:3000", "http://localhost:5173"]

    # Password Settings
    PASSWORD_MIN_LENGTH: int = 8
    BCRYPT_ROUNDS: int = 12

    # Redis Configuration
    REDIS_URL: str = "redis://localhost:6379/0"
    REDIS_MAX_CONNECTIONS: int = 10
    REDIS_CACHE_TTL: int = 300          # Default cache TTL in seconds (5 min)
    REDIS_SESSION_TTL: int = 86400      # Session TTL in seconds (24 hours)

    # File Upload — local disk (development) or S3 (production)
    UPLOAD_DIR: str = "uploads"

    # AWS S3 — file uploads in production (resumes, documents)
    # Leave blank for local-disk storage (development)
    AWS_ACCESS_KEY_ID: str = ""
    AWS_SECRET_ACCESS_KEY: str = ""
    AWS_REGION: str = "ap-south-1"
    AWS_S3_BUCKET_NAME: str = ""

    # Plan Settings
    TRIAL_DAYS: int = 14

    # Email / SMTP Settings
    # Set EMAIL_ENABLED=True and fill SMTP_* credentials to enable outgoing mail.
    # Gmail requires an App Password (not the account password) when 2FA is on.
    EMAIL_ENABLED: bool = True
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    # If SMTP_FROM_EMAIL is blank the username is used as the from-address at runtime.
    SMTP_FROM_EMAIL: str = ""
    SMTP_FROM_NAME: str = "Niyan HireFlow"
    SMTP_TIMEOUT: int = 15          # seconds to wait for SMTP connection / response

    EMAIL_VERIFICATION_ENABLED: bool = True
    # Verification link lifetime — 15 minutes is the enforced value.
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 1          # legacy alias, unused internally
    EMAIL_VERIFICATION_TOKEN_EXPIRE_MINUTES: int = 15       # enforced value

    # Fernet symmetric key for encrypting tenant SMTP passwords in the DB.
    # Generate once: python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    FERNET_SECRET_KEY: str = ""

    # Frontend URL (used to build verification / reset links)
    FRONTEND_URL: str = "http://localhost:5173"

    # Anthropic / Claude API
    ANTHROPIC_API_KEY: str = ""

    # Error tracking — Sentry (optional). Leave blank to disable entirely.
    # When set (and sentry-sdk is installed), unhandled exceptions and 5xx
    # responses are reported with request context.
    SENTRY_DSN: str = ""
    SENTRY_TRACES_SAMPLE_RATE: float = 0.0   # perf tracing off by default
    ENVIRONMENT: str = "development"          # tagged on Sentry events

    # Slow-request logging threshold (seconds). Requests slower than this are
    # logged at WARNING with method/path/duration/request-id.
    SLOW_REQUEST_SECONDS: float = 2.0

    # Seller default commission margin percentage
    DEFAULT_SELLER_MARGIN: float = 20.0

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True, extra='ignore')

    def is_production(self) -> bool:
        """True when running in a production environment."""
        return not self.DEBUG

    def s3_enabled(self) -> bool:
        """True when S3 credentials and bucket name are fully configured."""
        return bool(
            self.AWS_ACCESS_KEY_ID
            and self.AWS_SECRET_ACCESS_KEY
            and self.AWS_S3_BUCKET_NAME
        )


def _validate_production_secrets(s: Settings) -> None:
    """
    Validate critical secrets at startup when DEBUG is False (production).

    JWT is a hard failure (the app cannot be safely run with a default signing
    key). FERNET / default super-admin password are surfaced as prominent
    WARNINGS rather than hard failures, so an existing deployment that has not
    configured integrations is not knocked offline by a restart — while the
    operational risk is still made loud and greppable in the logs.
    """
    if s.DEBUG:
        return  # Skip validation in development

    insecure_jwt_defaults = {
        "your-super-secret-key-change-in-production",
        "your-super-secret-key-change-in-production-must-be-32-chars",
        "your-super-secret-key-change-in-production-must-be-at-least-64-chars",
        "",
    }
    if s.JWT_SECRET_KEY in insecure_jwt_defaults:
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY is set to an insecure default. "
            "Generate a secure key: python -c \"import secrets; print(secrets.token_hex(64))\""
        )
    if len(s.JWT_SECRET_KEY) < 32:
        raise RuntimeError(
            "FATAL: JWT_SECRET_KEY must be at least 32 characters in production."
        )

    import logging as _logging
    _log = _logging.getLogger(__name__)

    # FERNET_SECRET_KEY protects tenant integration secrets (SMTP/OAuth/API
    # tokens) at rest. Without it, integration_service falls back to Base64,
    # which is reversible by anyone with DB access — i.e. effectively plaintext.
    if not s.FERNET_SECRET_KEY:
        _log.warning(
            "SECURITY: FERNET_SECRET_KEY is not set in production. Tenant "
            "integration secrets (SMTP/OAuth/API tokens) will be stored with a "
            "reversible Base64 fallback, not encrypted. Generate one: "
            "python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\""
        )

    # Default super-admin bootstrap password (main.py seeds it on first boot).
    if os.getenv("DEFAULT_SUPERADMIN_PASSWORD", "") in {"", "SuperAdmin@123"}:
        _log.warning(
            "SECURITY: DEFAULT_SUPERADMIN_PASSWORD is unset or using the known "
            "default 'SuperAdmin@123'. If the super admin is seeded on first "
            "boot it will be guessable — set a strong value in .env."
        )


settings = Settings()
_validate_production_secrets(settings)


def get_company_db_name(company_id: str) -> str:
    """
    Generate company database name from company ID.

    New format: c_{uuid_without_hyphens}  →  34 chars max (Atlas-safe).
    Old format was company_{uuid}_db       →  47 chars (exceeds Atlas 38-byte limit).

    Existing installations that still have old-format databases must run:
        python -m migrations.rename_company_dbs
    before pointing to Atlas.
    """
    return f"c_{company_id.replace('-', '')}"


def get_company_db_name_legacy(company_id: str) -> str:
    """Old naming format kept for migration scripts and backward-compat checks."""
    return f"company_{company_id}_db"
