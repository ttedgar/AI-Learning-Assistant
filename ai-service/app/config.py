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

    # Gemini
    google_api_key: str = ""
    gemini_model: str = "gemini-3.1-flash-lite-preview"

    # Long-document thresholds
    # Gemini models have a 1M-token context window (~4 chars/token).
    # 60,000 chars ≈ 15,000 tokens — covers ~25-page academic papers in a single
    # call. Only truly large documents (100+ pages) trigger map-reduce.
    # Production: tune per model; parallelise the map step with asyncio.gather.
    long_doc_char_threshold: int = 60_000
    chunk_size: int = 50_000
    chunk_overlap: int = 500

    # Rate-limit-aware delay between consecutive Gemini calls in the map step.
    # Free-tier gemini-3.1-flash-lite-preview: 15 RPM — small delay is sufficient.
    # Set to 0 in production where paid quotas remove this constraint.
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
