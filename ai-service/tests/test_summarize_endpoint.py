"""
test_summarize_endpoint

Tests for POST /ai/summarize:
  - Response shape matches SummaryResponse
  - generate_summary is called with the request text
  - Service errors are surfaced as 502
"""

import pytest
from fastapi.testclient import TestClient

from app.models.responses import SummaryResponse


class TestSummarizeEndpoint:
    def test_response_shape(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = SummaryResponse(summary="This document is about testing.")
        mocker.patch("app.routers.summarize.generate_summary", return_value=mock_response)

        response = client.post(
            "/ai/summarize",
            json={"text": "Some academic text about software engineering."},
            headers=valid_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "summary" in body
        assert isinstance(body["summary"], str)
        assert body["summary"] == "This document is about testing."

    def test_generate_summary_called_with_text(self, client: TestClient, valid_headers: dict, mocker):
        mock_fn = mocker.patch(
            "app.routers.summarize.generate_summary",
            return_value=SummaryResponse(summary="result"),
        )
        input_text = "Specific text content for the document."
        client.post("/ai/summarize", json={"text": input_text}, headers=valid_headers)

        mock_fn.assert_called_once_with(input_text)

    def test_service_error_returns_502(self, client: TestClient, valid_headers: dict, mocker):
        mocker.patch(
            "app.routers.summarize.generate_summary",
            side_effect=RuntimeError("Gemini API unreachable"),
        )
        response = client.post(
            "/ai/summarize",
            json={"text": "some text"},
            headers=valid_headers,
        )
        assert response.status_code == 502

    def test_empty_text_returns_422(self, client: TestClient, valid_headers: dict):
        """Pydantic min_length=1 on TextRequest.text should reject empty strings."""
        response = client.post(
            "/ai/summarize",
            json={"text": ""},
            headers=valid_headers,
        )
        assert response.status_code == 422

    def test_missing_text_field_returns_422(self, client: TestClient, valid_headers: dict):
        response = client.post(
            "/ai/summarize",
            json={},
            headers=valid_headers,
        )
        assert response.status_code == 422
