from supabase import create_client, Client, ClientOptions
from app.core.config import settings
import logging
import httpx

logger = logging.getLogger(__name__)

_timeout = httpx.Timeout(10.0, connect=5.0)

try:
    # Public client (for most API endpoints)
    supabase: Client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY,
        options=ClientOptions(postgrest_client_timeout=_timeout),
    )
    logger.info("✅ Public Supabase client created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create public Supabase client: {e}")
    raise

try:
    # Admin client (bypasses RLS, use carefully)
    supabase_admin: Client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY,
        options=ClientOptions(postgrest_client_timeout=_timeout),
    )
    logger.info("✅ Admin Supabase client created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create admin Supabase client: {e}")
    supabase_admin = None
    raise