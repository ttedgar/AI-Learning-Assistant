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
    gemini_model: str = "gemini-2.5-flash"

    # Long-document thresholds
    # Documents over this character count trigger map-reduce chunking.
    # Production: this would be tuned per-model based on actual token limits.
    long_doc_char_threshold: int = 10_000
    chunk_size: int = 4_000
    chunk_overlap: int = 200

    # Langfuse observability (optional — service starts without it)
    # Production: always set these; traces give cost, latency, and error visibility.
    langfuse_secret_key: str = ""
    langfuse_public_key: str = ""
    langfuse_host: str = "https://cloud.langfuse.com"

    # Logging
    log_level: str = "INFO"


@lru_cache
def get_settings() -> Settings:
    """Cached singleton — safe to call freely; only reads env once."""
    return Settings()
