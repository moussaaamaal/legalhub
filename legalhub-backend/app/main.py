from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.core.config import settings
from app.core.scheduler import start_scheduler
from app.core.database import supabase_admin
from app.routers import (
    auth, cases, clients, documents, billing,
    calendar, ai, notifications, tasks, firm, payments, dashboard,
    client_portal, whatsapp,
)
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)

def _ensure_storage_buckets():
    """Create required Supabase Storage buckets if they don't exist."""
    for bucket_name in ("documents",):
        try:
            supabase_admin.storage.create_bucket(
                bucket_name,
                options={"public": True},
            )
            logger.info(f"✅ Storage bucket '{bucket_name}' created.")
        except Exception as e:
            msg = str(e).lower()
            if "already exists" in msg or "duplicate" in msg or "409" in msg:
                logger.info(f"✅ Storage bucket '{bucket_name}' already exists.")
            else:
                logger.warning(f"⚠️  Could not create bucket '{bucket_name}': {e}")

@asynccontextmanager
async def lifespan(app: FastAPI):
    _ensure_storage_buckets()
    scheduler = start_scheduler()
    yield
    scheduler.shutdown()

app = FastAPI(
    title="LegalHub API",
    version="2.0.0",
    description="Legal Practice Management Platform API",
    docs_url="/docs",
    redoc_url="/redoc",
    lifespan=lifespan,
)

# ─── CORS ──────────────────────────────────────────────
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        settings.FRONTEND_URL,
        "http://localhost:3000",
        "http://localhost:4200",
        "http://localhost:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── Routers ───────────────────────────────────────────
app.include_router(auth.router)
app.include_router(dashboard.router)
app.include_router(cases.router)
app.include_router(clients.router)
app.include_router(documents.router)
app.include_router(billing.router)
app.include_router(calendar.router)
app.include_router(tasks.router)
app.include_router(ai.router)
app.include_router(notifications.router)
app.include_router(firm.router)
app.include_router(payments.router)
app.include_router(client_portal.router)
app.include_router(whatsapp.router)

# ─── Health ────────────────────────────────────────────
@app.get("/", tags=["Health"])
def root():
    return {"message": "LegalHub API v2.0", "status": "running", "docs": "/docs"}

@app.get("/health", tags=["Health"])
def health():
    return {"status": "ok"}
