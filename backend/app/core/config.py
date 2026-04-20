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

    # Seller default commission margin percentage
    DEFAULT_SELLER_MARGIN: float = 20.0

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)

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
    Raise an error at startup if critical secrets are still at their
    insecure default values while DEBUG is False (i.e. in production).
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


settings = Settings()
_validate_production_secrets(settings)


def get_company_db_name(company_id: str) -> str:
    """Generate company database name from company ID"""
    return f"company_{company_id}_db"
