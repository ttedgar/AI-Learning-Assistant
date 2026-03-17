"""
Shared test fixtures.

Uses FastAPI's TestClient with dependency overrides to inject a known
INTERNAL_API_KEY without touching real environment variables.
"""

import os

import pytest
from fastapi.testclient import TestClient

# Set a predictable key before importing the app so get_settings() caches it
TEST_API_KEY = "test-internal-key"
os.environ["INTERNAL_API_KEY"] = TEST_API_KEY
os.environ["GOOGLE_API_KEY"] = "fake-google-key"  # never called in tests (mocked)

from app.config import get_settings  # noqa: E402
from app.main import app  # noqa: E402

# Clear the lru_cache so config picks up the env vars set above
get_settings.cache_clear()


@pytest.fixture(scope="session")
def client() -> TestClient:
    """Synchronous TestClient — sufficient for all current endpoint tests."""
    return TestClient(app)


@pytest.fixture
def valid_headers() -> dict:
    return {"X-Internal-Api-Key": TEST_API_KEY}


@pytest.fixture
def invalid_headers() -> dict:
    return {"X-Internal-Api-Key": "wrong-key"}
