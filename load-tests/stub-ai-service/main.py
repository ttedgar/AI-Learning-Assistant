"""
Stub AI service for load testing.

Replaces the real ai-service (FastAPI + Gemini) with a configurable stub that:
  - Returns hardcoded but structurally valid responses
  - Applies a configurable artificial delay (simulates LLM latency)
  - Simulates 500 failures at a configurable rate (tests retry/DLQ path)
  - Simulates 429 rate-limit responses at a configurable rate (tests 65s backoff path)

The stub implements the exact same request/response contracts as the real ai-service
so the worker needs no changes between real and load-test runs.

Configuration (environment variables):
  STUB_DELAY_SECONDS   — artificial latency per request (default: 1.0)
  STUB_FAILURE_RATE    — fraction [0.0–1.0] of requests returning 500 (default: 0.0)
  STUB_RATE_LIMIT_RATE — fraction [0.0–1.0] of requests returning 429 (default: 0.0)
  INTERNAL_API_KEY     — must match worker's INTERNAL_API_KEY (default: dev-internal-key)

Fault injection order per request: 429 check → 500 check → delay → success response.
This means STUB_RATE_LIMIT_RATE takes precedence over STUB_FAILURE_RATE if both are set.
"""

import asyncio
import logging
import os
import random

from fastapi import FastAPI, Header, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
)
logger = logging.getLogger("stub-ai-service")

STUB_DELAY_SECONDS   = float(os.getenv("STUB_DELAY_SECONDS",   "1.0"))
STUB_FAILURE_RATE    = float(os.getenv("STUB_FAILURE_RATE",    "0.0"))
STUB_RATE_LIMIT_RATE = float(os.getenv("STUB_RATE_LIMIT_RATE", "0.0"))
INTERNAL_API_KEY     = os.getenv("INTERNAL_API_KEY", "dev-internal-key")

app = FastAPI(
    title="Stub AI Service (Load Test)",
    description="Drop-in replacement for ai-service. Returns canned responses with configurable faults.",
    version="1.0.0",
)

_EXEMPT_PATHS = {"/health", "/docs", "/openapi.json", "/redoc"}


class ProcessRequest(BaseModel):
    text: str
    document_id: str


def _validate_api_key(x_internal_api_key: str | None) -> None:
    """Mirrors InternalApiKeyMiddleware from the real ai-service."""
    if x_internal_api_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Invalid or missing X-Internal-Api-Key")


async def _inject_faults(operation: str) -> None:
    """
    Apply configured fault injection then delay.
    Called at the start of every AI endpoint handler.
    """
    if STUB_RATE_LIMIT_RATE > 0 and random.random() < STUB_RATE_LIMIT_RATE:
        logger.warning("Injecting 429 for operation=%s", operation)
        raise HTTPException(status_code=429, detail="Simulated rate limit — quota exhausted")

    if STUB_FAILURE_RATE > 0 and random.random() < STUB_FAILURE_RATE:
        logger.warning("Injecting 500 for operation=%s", operation)
        raise HTTPException(status_code=500, detail="Simulated internal failure")

    if STUB_DELAY_SECONDS > 0:
        await asyncio.sleep(STUB_DELAY_SECONDS)


@app.get("/health")
def health():
    """Health check — exempt from API key validation."""
    return {"status": "ok"}


@app.post("/ai/summarize")
async def summarize(
    req: ProcessRequest,
    x_internal_api_key: str | None = Header(default=None),
):
    _validate_api_key(x_internal_api_key)
    await _inject_faults("summarize")
    logger.info("summarize OK document_id=%s text_length=%d", req.document_id, len(req.text))
    return {
        "summary": (
            f"Stub summary for document {req.document_id}. "
            f"The document contained {len(req.text)} characters of text. "
            "This is a load-test stub response — no real AI was called."
        ),
        "model_used": "stub-v1",
    }


@app.post("/ai/flashcards")
async def flashcards(
    req: ProcessRequest,
    x_internal_api_key: str | None = Header(default=None),
):
    _validate_api_key(x_internal_api_key)
    await _inject_faults("flashcards")
    logger.info("flashcards OK document_id=%s", req.document_id)
    return {
        "flashcards": [
            {
                "question": "What is the purpose of a dead-letter queue?",
                "answer": "To capture messages that exhausted all retry attempts, preventing data loss and enabling manual replay after the root cause is fixed.",
            },
            {
                "question": "What does the single writer principle mean in this architecture?",
                "answer": "Only the backend service writes to the database. The worker publishes results to a queue; the backend consumes and persists them.",
            },
        ],
        "model_used": "stub-v1",
    }


@app.post("/ai/quiz")
async def quiz(
    req: ProcessRequest,
    x_internal_api_key: str | None = Header(default=None),
):
    _validate_api_key(x_internal_api_key)
    await _inject_faults("quiz")
    logger.info("quiz OK document_id=%s", req.document_id)
    return {
        "questions": [
            {
                "question": "Which pattern does the worker use to avoid writing to the database?",
                "type": "MULTIPLE_CHOICE",
                "correct_answer": "Single writer principle",
                "options": [
                    "Single writer principle",
                    "Active Record",
                    "Saga pattern",
                    "Two-phase commit",
                ],
            },
            {
                "question": "What retry delay is applied when the AI service returns a 429 response?",
                "type": "OPEN_ENDED",
                "correct_answer": "65 seconds — long enough for the Gemini free-tier RPM quota window to reset.",
                "options": None,
            },
        ],
        "model_used": "stub-v1",
    }
