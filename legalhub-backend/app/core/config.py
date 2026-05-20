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

    # ─── WhatsApp Business API (Meta) ────────────────
    WHATSAPP_API_TOKEN: Optional[str] = None
    WHATSAPP_PHONE_NUMBER_ID: Optional[str] = None

    # ─── Sadad Payment Gateway ────────────────────────
    SADAD_API_URL: str = "https://api.sadad.com.sa/v1"
    SADAD_MERCHANT_ID: Optional[str] = None
    SADAD_API_KEY: Optional[str] = None

    # ─── Google OAuth2 (Calendar Sync) ───────────────
    GOOGLE_CLIENT_ID: Optional[str] = None
    GOOGLE_CLIENT_SECRET: Optional[str] = None
    GOOGLE_REDIRECT_URI: str = "http://localhost:8000/api/calendar/sync/google/callback"

    # ─── Milvus / RAG ─────────────────────────────────
    MILVUS_HOST: str = "localhost"
    MILVUS_PORT: int = 19530
    MILVUS_COLLECTION_NAME: str = "legalhub_case_chunks"
    EMBEDDING_MODEL: str = "mistral-embed"
    EMBEDDING_DIMENSION: int = 1024
    RAG_CHAT_MODEL: str = "mistral-small-latest"
    RAG_CHUNK_SIZE: int = 800
    RAG_CHUNK_OVERLAP: int = 150
    RAG_TOP_K: int = 10

    # ─── App ──────────────────────────────────────────
    APP_NAME: str = "LegalHub"
    DEBUG: bool = True
    FRONTEND_URL: str = "http://localhost:4200"

    class Config:
        env_file = ".env"
        extra = "ignore"

settings = Settings()