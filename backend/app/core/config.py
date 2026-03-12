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
    APP_NAME: str = "Multi-Tenant CRM"
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

    # File Upload
    UPLOAD_DIR: str = "uploads"

    # Plan Settings
    TRIAL_DAYS: int = 14

    # Email / SMTP Settings
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USERNAME: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@crm.example.com"
    SMTP_FROM_NAME: str = "CRM Platform"
    EMAIL_VERIFICATION_ENABLED: bool = True
    EMAIL_VERIFICATION_TOKEN_EXPIRE_HOURS: int = 24

    # Frontend URL (used to build verification / reset links)
    FRONTEND_URL: str = "http://localhost:5173"

    # Seller default commission margin percentage
    DEFAULT_SELLER_MARGIN: float = 20.0

    model_config = SettingsConfigDict(env_file=".env", case_sensitive=True)


settings = Settings()


def get_company_db_name(company_id: str) -> str:
    """Generate company database name from company ID"""
    return f"company_{company_id}_db"