"""
test_api_key_middleware

Tests for InternalApiKeyMiddleware:
  - Missing header → 401
  - Wrong key      → 401
  - Correct key    → request proceeds
  - /health exempt  → no key required
"""

import pytest
from fastapi.testclient import TestClient


class TestApiKeyMiddleware:
    def test_missing_key_returns_401(self, client: TestClient):
        response = client.post("/ai/summarize", json={"text": "hello"})
        assert response.status_code == 401

    def test_wrong_key_returns_401(self, client: TestClient, invalid_headers: dict):
        response = client.post(
            "/ai/summarize",
            json={"text": "hello"},
            headers=invalid_headers,
        )
        assert response.status_code == 401

    def test_wrong_key_response_body(self, client: TestClient, invalid_headers: dict):
        response = client.post(
            "/ai/summarize",
            json={"text": "hello"},
            headers=invalid_headers,
        )
        body = response.json()
        assert "detail" in body

    def test_health_endpoint_exempt_no_key(self, client: TestClient):
        """Health check must be reachable without authentication."""
        response = client.get("/health")
        assert response.status_code == 200

    def test_health_endpoint_exempt_wrong_key(self, client: TestClient, invalid_headers: dict):
        """Health check must still be reachable even with a wrong key."""
        response = client.get("/health", headers=invalid_headers)
        assert response.status_code == 200

    def test_valid_key_passes_middleware(self, client: TestClient, valid_headers: dict, mocker):
        """Valid key must reach the route handler (even if AI call fails in tests)."""
        # Mock the service so we don't hit Gemini
        mocker.patch(
            "app.routers.summarize.generate_summary",
            return_value=mocker.MagicMock(summary="mocked summary"),
        )
        response = client.post(
            "/ai/summarize",
            json={"text": "some document text"},
            headers=valid_headers,
        )
        # Middleware passed → handler executed → 200 (not 401)
        assert response.status_code == 200
