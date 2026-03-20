"""
Redis-backed idempotency guard for AI operations.

Design: claim-then-cache pattern
  1. Check result cache — if hit, return cached result immediately (no Gemini call).
  2. Acquire claim lock (SET NX EX 300) — one worker owns each operation per document.
  3. If claim acquired: run AI call, cache result, release claim (TTL handles cleanup).
  4. If claim contended: poll for result up to CLAIM_WAIT_SECONDS.
     If result doesn't appear, run the AI call anyway (fail safe over data loss).
  5. Fail open: any RedisError is logged and the AI call runs without caching.

This protects against:
  - Worker retry storms: 3 retries per message × 3 AI calls = up to 9 Gemini calls
    without caching. With caching, all retries return the cached result instantly.
  - Recovery job republishes: a recovered document re-enters the worker pipeline.
    AI calls are served from cache — Gemini never sees the duplicate request.
  - Concurrent recovery: two workers claim the same document simultaneously (possible
    if recovery fires while original worker is still retrying). The claim lock
    serialises them; the second worker polls for the first worker's result.

Key schema:
  ai:result:{operation}:{document_id}  — cached Pydantic response (JSON dict)
  ai:claim:{operation}:{document_id}   — claim lock (value "1")

TTLs:
  Result: 30 min — outlasts all retry + recovery cycles (max ~5 min under retries).
  Claim:  5 min  — max AI call duration under retries (PDF + 3 AI calls ≈ 30 s each).

Production notes:
  - Use Redis Cluster or Sentinel for HA. A single Redis node is a SPOF — fail-open
    ensures no data loss if Redis is down, just lost idempotency for that window.
  - Instrument cache hit/miss/error rates (Step 7).
  - Consider Lua scripting for atomic check-and-claim if latency is critical.
"""

import asyncio
import json
import logging
from typing import Any, Callable, Optional, Type

import redis.asyncio as aioredis
from pydantic import BaseModel

from app.services.metrics import AI_CACHE_HIT, AI_CACHE_MISS, AI_REDIS_FAILURE

logger = logging.getLogger(__name__)

RESULT_TTL_SECONDS: int = 1800   # 30 min
CLAIM_TTL_SECONDS:  int = 300    # 5 min
CLAIM_WAIT_SECONDS: int = 30     # Max wait for a concurrent worker's result
CLAIM_POLL_INTERVAL_SECONDS: int = 5


class RedisIdempotencyService:
    """
    Thread-safe idempotency guard. One instance shared across requests (singleton via app.state).
    All methods are async and safe to call from FastAPI route handlers.
    """

    def __init__(self, client: aioredis.Redis) -> None:
        self._r = client

    @staticmethod
    def _result_key(operation: str, document_id: str) -> str:
        return f"ai:result:{operation}:{document_id}"

    @staticmethod
    def _claim_key(operation: str, document_id: str) -> str:
        return f"ai:claim:{operation}:{document_id}"

    async def get_or_compute(
        self,
        operation: str,
        document_id: str,
        compute: Callable[[], Any],           # Sync function — will be run in thread pool
        response_class: Type[BaseModel],      # Pydantic model for deserialisation
    ) -> BaseModel:
        """
        Returns the cached result if available, otherwise runs ``compute`` and caches the result.

        ``compute`` is a synchronous callable (the AI service function). It is executed in
        a thread pool via ``asyncio.to_thread`` so it never blocks the event loop.

        :raises: propagates any exception from ``compute`` so the caller's HTTP 502 handler fires.
        """
        result_key = self._result_key(operation, document_id)
        claim_key  = self._claim_key(operation, document_id)

        try:
            # ── Fast path: cached result ─────────────────────────────────────
            cached = await self._r.get(result_key)
            if cached is not None:
                logger.info(
                    "AI idempotency cache HIT",
                    extra={"operation": operation, "document_id": document_id},
                )
                AI_CACHE_HIT.labels(operation=operation).inc()
                return response_class.model_validate(json.loads(cached))

            # ── Acquire claim lock ────────────────────────────────────────────
            acquired = await self._r.set(claim_key, "1", nx=True, ex=CLAIM_TTL_SECONDS)

            if not acquired:
                # Another worker is running this operation — poll for result
                logger.info(
                    "AI idempotency claim contention — polling for result",
                    extra={"operation": operation, "document_id": document_id},
                )
                result = await self._poll_for_result(result_key, response_class)
                if result is not None:
                    return result
                # Timed out — run the AI call as fallback (fail safe > data loss)
                logger.warning(
                    "AI idempotency poll timed out — running AI call as fallback",
                    extra={"operation": operation, "document_id": document_id},
                )

            # ── Run the AI call ───────────────────────────────────────────────
            logger.info(
                "AI idempotency cache MISS — running AI call",
                extra={"operation": operation, "document_id": document_id},
            )
            AI_CACHE_MISS.labels(operation=operation).inc()
            result_obj: BaseModel = await asyncio.to_thread(compute)

            # ── Cache the result ──────────────────────────────────────────────
            await self._r.set(
                result_key,
                json.dumps(result_obj.model_dump()),
                ex=RESULT_TTL_SECONDS,
            )
            logger.info(
                "AI idempotency result cached",
                extra={"operation": operation, "document_id": document_id},
            )

            return result_obj

        except aioredis.RedisError as exc:
            # Fail open: Redis is unavailable — run AI call without caching.
            # The metric alerts on-call when Redis degradation causes idempotency gaps.
            logger.warning(
                "Redis unavailable — running AI call without idempotency: %s",
                exc,
                extra={"operation": operation, "document_id": document_id},
            )
            AI_REDIS_FAILURE.inc()
            return await asyncio.to_thread(compute)

    async def _poll_for_result(
        self,
        result_key: str,
        response_class: Type[BaseModel],
    ) -> Optional[BaseModel]:
        """Polls ``result_key`` every CLAIM_POLL_INTERVAL_SECONDS up to CLAIM_WAIT_SECONDS."""
        elapsed = 0
        while elapsed < CLAIM_WAIT_SECONDS:
            await asyncio.sleep(CLAIM_POLL_INTERVAL_SECONDS)
            elapsed += CLAIM_POLL_INTERVAL_SECONDS
            cached = await self._r.get(result_key)
            if cached is not None:
                return response_class.model_validate(json.loads(cached))
        return None
