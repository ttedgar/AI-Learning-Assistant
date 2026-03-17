"""
test_flashcards_endpoint

Tests for POST /ai/flashcards:
  - Response shape matches FlashcardsResponse
  - Each flashcard has question + answer fields
  - Service errors are surfaced as 502
"""

import pytest
from fastapi.testclient import TestClient

from app.models.responses import Flashcard, FlashcardsResponse


class TestFlashcardsEndpoint:
    def test_response_shape(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = FlashcardsResponse(
            flashcards=[
                Flashcard(question="What is polymorphism?", answer="The ability of objects to take many forms."),
                Flashcard(question="What is encapsulation?", answer="Bundling data and methods together."),
            ]
        )
        mocker.patch("app.routers.flashcards.generate_flashcards", return_value=mock_response)

        response = client.post(
            "/ai/flashcards",
            json={"text": "OOP concepts text."},
            headers=valid_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "flashcards" in body
        assert isinstance(body["flashcards"], list)
        assert len(body["flashcards"]) == 2

    def test_flashcard_fields(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = FlashcardsResponse(
            flashcards=[Flashcard(question="Q1", answer="A1")]
        )
        mocker.patch("app.routers.flashcards.generate_flashcards", return_value=mock_response)

        response = client.post(
            "/ai/flashcards",
            json={"text": "some text"},
            headers=valid_headers,
        )
        card = response.json()["flashcards"][0]
        assert "question" in card
        assert "answer" in card
        assert card["question"] == "Q1"
        assert card["answer"] == "A1"

    def test_generate_flashcards_called_with_text(self, client: TestClient, valid_headers: dict, mocker):
        mock_fn = mocker.patch(
            "app.routers.flashcards.generate_flashcards",
            return_value=FlashcardsResponse(flashcards=[]),
        )
        input_text = "Text about neural networks."
        client.post("/ai/flashcards", json={"text": input_text}, headers=valid_headers)
        mock_fn.assert_called_once_with(input_text)

    def test_service_error_returns_502(self, client: TestClient, valid_headers: dict, mocker):
        mocker.patch(
            "app.routers.flashcards.generate_flashcards",
            side_effect=ValueError("LLM returned malformed JSON"),
        )
        response = client.post(
            "/ai/flashcards",
            json={"text": "some text"},
            headers=valid_headers,
        )
        assert response.status_code == 502
