from supabase import create_client, Client
from app.core.config import settings
import logging

logger = logging.getLogger(__name__)

try:
    # Public client (for most API endpoints)
    supabase: Client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_ANON_KEY
    )
    logger.info("✅ Public Supabase client created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create public Supabase client: {e}")
    raise

try:
    # Admin client (bypasses RLS, use carefully)
    supabase_admin: Client = create_client(
        settings.SUPABASE_URL,
        settings.SUPABASE_SERVICE_ROLE_KEY
    )
    logger.info("✅ Admin Supabase client created successfully")
except Exception as e:
    logger.error(f"❌ Failed to create admin Supabase client: {e}")
    # Optionally continue without admin if you want graceful degradation in dev
    supabase_admin = None
    raise