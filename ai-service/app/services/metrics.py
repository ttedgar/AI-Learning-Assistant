"""
Prometheus metrics for the AI service.

All metrics are module-level singletons registered in prometheus_client's default
CollectorRegistry. They are safe to use from any coroutine or thread — prometheus_client
operations are thread-safe.

Production note: In a multi-worker Uvicorn deployment (multiple processes), the default
prometheus_client registry is per-process. Use prometheus_client.multiprocess mode
(PROMETHEUS_MULTIPROC_DIR env var) or expose metrics via a push gateway for accurate
aggregated counts across workers. For single-process deployments (this project), the
default registry is correct.
"""

from prometheus_client import Counter

AI_CACHE_HIT = Counter(
    "ai_idempotency_cache_hit_total",
    "Number of Redis cache hits — AI call served from cache without calling Gemini",
    ["operation"],
)

AI_CACHE_MISS = Counter(
    "ai_idempotency_cache_miss_total",
    "Number of Redis cache misses — new AI call required (calls Gemini)",
    ["operation"],
)

AI_REDIS_FAILURE = Counter(
    "ai_idempotency_redis_failure_total",
    "Number of Redis unavailability events — AI call ran without idempotency (fail-open)",
)
