"""
Tests for the health endpoint and API key middleware.

Uses FastAPI's TestClient (backed by httpx) — no real network, no Docker required.
"""

import pytest
from fastapi.testclient import TestClient

from main import app
from config import settings


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


class TestHealthEndpoint:
    def test_health_returns_200(self, client: TestClient):
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_returns_status_ok(self, client: TestClient):
        response = client.get("/health")
        assert response.json() == {"status": "ok"}

    def test_health_does_not_require_api_key(self, client: TestClient):
        """Health endpoint must be reachable by load balancers without credentials."""
        response = client.get("/health")
        assert response.status_code == 200


class TestApiKeyMiddleware:
    def test_missing_api_key_returns_401(self, client: TestClient):
        response = client.post("/ai/summarize", json={"text": "hello"})
        assert response.status_code == 401

    def test_wrong_api_key_returns_401(self, client: TestClient):
        response = client.post(
            "/ai/summarize",
            json={"text": "hello"},
            headers={"X-Internal-Api-Key": "wrong-key"},
        )
        assert response.status_code == 401

    def test_correct_api_key_passes_middleware(self, client: TestClient):
        """
        A valid API key should pass middleware and reach the route handler.
        The /ai/summarize route is not yet implemented, so we expect 404 (not 401).
        This confirms the middleware is not blocking a valid key.
        """
        response = client.post(
            "/ai/summarize",
            json={"text": "hello"},
            headers={"X-Internal-Api-Key": settings.internal_api_key},
        )
        # 404 means middleware passed — route not yet wired (implemented in ai-service worktree)
        assert response.status_code == 404
