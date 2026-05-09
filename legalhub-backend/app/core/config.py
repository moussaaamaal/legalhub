from pydantic_settings import BaseSettings
from typing import Optional

class Settings(BaseSettings):
    # ─── Supabase (obligatoire) ────────────────────────
    SUPABASE_URL: str
    SUPABASE_ANON_KEY: str
    SUPABASE_SERVICE_ROLE_KEY: str

    # ─── JWT (obligatoire) ────────────────────────────
    SECRET_KEY: str = "dev-secret-key-change-in-production-min-32-chars"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
    REFRESH_TOKEN_EXPIRE_DAYS: int = 7

    # ─── OpenAI (optionnel en dev) ─────────────────────
    OPENAI_API_KEY: Optional[str] = None

    # ─── Mistral / Voxtral (optionnel en dev) ─────────
    MISTRAL_API_KEY: Optional[str] = None

    # ─── Stripe (optionnel en dev) ─────────────────────
    STRIPE_SECRET_KEY: Optional[str] = None
    STRIPE_WEBHOOK_SECRET: Optional[str] = None

    # ─── SendGrid (optionnel en dev) ──────────────────
    SENDGRID_API_KEY: Optional[str] = None
    FROM_EMAIL: str = "noreply@legalhub.com"

    # ─── Twilio (optionnel en dev) ────────────────────
    TWILIO_ACCOUNT_SID: Optional[str] = None
    TWILIO_AUTH_TOKEN: Optional[str] = None
    TWILIO_PHONE_NUMBER: Optional[str] = None

    # ─── AWS S3 (optionnel en dev) ────────────────────
    AWS_ACCESS_KEY_ID: Optional[str] = None
    AWS_SECRET_ACCESS_KEY: Optional[str] = None
    AWS_BUCKET_NAME: Optional[str] = None
    AWS_REGION: str = "eu-west-1"

    # ─── App ──────────────────────────────────────────
    APP_NAME: str = "LegalHub"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:4200"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()