"""
Application settings loaded from environment variables via pydantic-settings.
All secrets are injected at runtime — never hardcoded.
"""

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    internal_api_key: str = "change-me-in-prod"
    gemini_api_key: str = ""
    environment: str = "dev"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")


settings = Settings()
