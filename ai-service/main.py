"""
AI Service — FastAPI entrypoint.

Responsibility: sole integration point with Gemini via LangChain.
All endpoints require X-Internal-Api-Key header (DIP at architecture level —
the worker depends on this interface, not on Gemini directly).

Production note: internal API key would be replaced with mTLS client certificates.
The key is validated in a FastAPI dependency so it applies consistently to all routes.
"""

import logging
import os

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from middleware.api_key import ApiKeyMiddleware
from routers import health

# Structured JSON logging is configured via the logging stdlib.
# Production: replace with a structlog/JSON handler feeding into Datadog / GCP Logging.
logging.basicConfig(
    level=logging.INFO,
    format='{"time":"%(asctime)s","level":"%(levelname)s","logger":"%(name)s","message":"%(message)s"}',
)
logger = logging.getLogger(__name__)

app = FastAPI(
    title="AI Learning Assistant — AI Service",
    description="Internal FastAPI service responsible for Gemini AI orchestration.",
    version="1.0.0",
    # Disable automatic /docs in prod to avoid leaking internal API surface
    docs_url="/docs" if settings.environment != "prod" else None,
    redoc_url=None,
)

# Internal API key enforcement — applied before any route handler
app.add_middleware(ApiKeyMiddleware)

app.include_router(health.router)

# Placeholder routers — implemented in the ai-service worktree
# from routers import summarize, flashcards, quiz
# app.include_router(summarize.router, prefix="/ai")
# app.include_router(flashcards.router, prefix="/ai")
# app.include_router(quiz.router, prefix="/ai")

logger.info("AI service started", extra={"environment": settings.environment})
