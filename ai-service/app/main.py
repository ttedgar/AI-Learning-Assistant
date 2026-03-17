"""
AI Learning Assistant — ai-service

FastAPI application entry point.

Responsibility: sole interface between the worker service and the Gemini LLM.
All AI endpoints require a valid X-Internal-Api-Key header (enforced by middleware).

Production note: This service would sit behind an internal load balancer and
would not be reachable from the public internet. mTLS would replace the shared
API key approach. See middleware/api_key.py for details.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI

from app.logging_config import configure_logging
from app.middleware.api_key import InternalApiKeyMiddleware
from app.routers import flashcards, health, quiz, summarize


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()
    yield


app = FastAPI(
    title="AI Learning Assistant — AI Service",
    description=(
        "Internal microservice that orchestrates Gemini calls for document summarization, "
        "flashcard generation, and quiz generation. "
        "Protected by X-Internal-Api-Key header (production: mTLS)."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# Middleware — applied in reverse order (last added = outermost)
app.add_middleware(InternalApiKeyMiddleware)

# Routers
app.include_router(health.router)
app.include_router(summarize.router)
app.include_router(flashcards.router)
app.include_router(quiz.router)
