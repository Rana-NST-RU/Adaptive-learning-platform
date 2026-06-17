from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from app.core.config import get_settings
from app.api.routes import mastery, forgetting, content_gen

settings = get_settings()
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

app = FastAPI(
    title=settings.app_name,
    version=settings.version,
    description="ALOS ML Service — Mastery scoring, forgetting curves, and LLM content generation",
    docs_url="/docs" if settings.debug else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(mastery.router, prefix="/mastery", tags=["mastery"])
app.include_router(forgetting.router, prefix="/forgetting", tags=["forgetting"])
app.include_router(content_gen.router, prefix="/content", tags=["content"])


@app.get("/health")
async def health_check():
    return {
        "status": "healthy",
        "service": settings.app_name,
        "version": settings.version,
        "environment": settings.environment,
    }


@app.get("/")
async def root():
    return {"message": "ALOS ML Service is running 🚀", "docs": "/docs"}
