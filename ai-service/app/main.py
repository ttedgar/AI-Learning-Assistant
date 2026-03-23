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

import redis.asyncio as aioredis
from fastapi import FastAPI

from app.config import get_settings
from app.logging_config import configure_logging
from app.middleware.api_key import InternalApiKeyMiddleware
from app.middleware.correlation_id import CorrelationIdMiddleware
from app.routers import flashcards, health, metrics, quiz, summarize
from app.services.redis_idempotency import RedisIdempotencyService


@asynccontextmanager
async def lifespan(app: FastAPI):
    configure_logging()

    settings = get_settings()

    # Initialise Redis client. Fail open: if Redis is unreachable the service starts
    # normally and routes skip idempotency for that request (logged as WARNING).
    # decode_responses=False: we store raw JSON bytes, decoded manually on read.
    redis_client = aioredis.from_url(
        settings.redis_url,
        decode_responses=True,  # return str not bytes for json.loads compatibility
        socket_connect_timeout=2,
        socket_timeout=2,
    )
    app.state.idempotency = RedisIdempotencyService(redis_client)

    yield

    await redis_client.aclose()


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

# Middleware — applied in reverse order (last added = outermost).
# CorrelationIdMiddleware is outermost so the ID is set before any handler runs,
# mirroring the HIGHEST_PRECEDENCE order of CorrelationIdFilter in the Java services.
app.add_middleware(InternalApiKeyMiddleware)
app.add_middleware(CorrelationIdMiddleware)

# Routers
app.include_router(health.router)
app.include_router(metrics.router)
app.include_router(summarize.router)
app.include_router(flashcards.router)
app.include_router(quiz.router)
