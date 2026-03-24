from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """
    Application settings loaded from environment variables.

    Production note: In a real deployment, secrets (INTERNAL_API_KEY, GOOGLE_API_KEY)
    would be injected via a secrets manager (e.g. AWS Secrets Manager, HashiCorp Vault)
    rather than plain environment variables. Using BaseSettings here keeps the pattern
    clean while remaining trivially swappable.
    """

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    # Security
    internal_api_key: str = "change-me-in-production"

    # OpenRouter — unified API for free LLM models.
    # primary_model is tried first; on any failure LangChain's with_fallbacks()
    # automatically retries with fallback_model (openrouter/free routes to any
    # available free model, acting as a last-resort catch-all).
    # Production: swap for a paid model (e.g. meta-llama/llama-3.1-70b-instruct)
    # by changing these env vars — no code changes required.
    openrouter_api_key: str = ""
    primary_model: str = "meta-llama/llama-3.1-8b-instruct:free"
    fallback_model: str = "openrouter/free"

    # Long-document thresholds (model-agnostic).
    # 60,000 chars ≈ 15,000 tokens — covers ~25-page academic papers in a single
    # call. Only truly large documents (100+ pages) trigger map-reduce.
    # Production: tune per model; parallelise the map step with asyncio.gather.
    long_doc_char_threshold: int = 60_000
    chunk_size: int = 50_000
    chunk_overlap: int = 500

    # Delay between consecutive LLM calls in the map-reduce step.
    # Free-tier models typically allow 20 RPM; a small delay avoids bursting.
    # Set to 0 if using a paid tier.
    chunk_call_delay_s: float = 5.0

    # Langfuse observability (optional — service starts without it)
    # Production: always set these; traces give cost, latency, and error visibility.
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # Redis — used for AI operation idempotency (Step 5).
    # Fail open: if Redis is unavailable, AI calls proceed without caching.
    # Production: always set this to a managed Redis instance (Upstash, Elasticache).
    redis_url: str = "redis://localhost:6379"

    # Logging
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — safe to call freely; only reads env once."""
    return Settings()
