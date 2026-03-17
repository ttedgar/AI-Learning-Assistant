"""
test_quiz_endpoint

Tests for POST /ai/quiz:
  - Response shape matches QuizResponse
  - QuizQuestion fields are correct (type enum, options for MC, null for OE)
  - Service errors are surfaced as 502
"""

import pytest
from fastapi.testclient import TestClient

from app.models.responses import QuizQuestion, QuizResponse, QuestionType


class TestQuizEndpoint:
    def test_response_shape(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = QuizResponse(
            questions=[
                QuizQuestion(
                    question="What does OOP stand for?",
                    type=QuestionType.MULTIPLE_CHOICE,
                    correct_answer="Object-Oriented Programming",
                    options=[
                        "Object-Oriented Programming",
                        "Open Operational Protocol",
                        "Ordered Object Pattern",
                        "Optional Object Processing",
                    ],
                ),
                QuizQuestion(
                    question="Explain inheritance in your own words.",
                    type=QuestionType.OPEN_ENDED,
                    correct_answer="A mechanism where a class inherits properties from another class.",
                    options=None,
                ),
            ]
        )
        mocker.patch("app.routers.quiz.generate_quiz", return_value=mock_response)

        response = client.post(
            "/ai/quiz",
            json={"text": "OOP concepts text."},
            headers=valid_headers,
        )

        assert response.status_code == 200
        body = response.json()
        assert "questions" in body
        assert isinstance(body["questions"], list)
        assert len(body["questions"]) == 2

    def test_multiple_choice_question_fields(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = QuizResponse(
            questions=[
                QuizQuestion(
                    question="Q?",
                    type=QuestionType.MULTIPLE_CHOICE,
                    correct_answer="A",
                    options=["A", "B", "C", "D"],
                )
            ]
        )
        mocker.patch("app.routers.quiz.generate_quiz", return_value=mock_response)

        response = client.post("/ai/quiz", json={"text": "text"}, headers=valid_headers)
        q = response.json()["questions"][0]

        assert q["type"] == "MULTIPLE_CHOICE"
        assert q["options"] == ["A", "B", "C", "D"]
        assert q["correct_answer"] == "A"

    def test_open_ended_question_has_null_options(self, client: TestClient, valid_headers: dict, mocker):
        mock_response = QuizResponse(
            questions=[
                QuizQuestion(
                    question="Explain X.",
                    type=QuestionType.OPEN_ENDED,
                    correct_answer="Because Y.",
                    options=None,
                )
            ]
        )
        mocker.patch("app.routers.quiz.generate_quiz", return_value=mock_response)

        response = client.post("/ai/quiz", json={"text": "text"}, headers=valid_headers)
        q = response.json()["questions"][0]

        assert q["type"] == "OPEN_ENDED"
        assert q["options"] is None

    def test_generate_quiz_called_with_text(self, client: TestClient, valid_headers: dict, mocker):
        mock_fn = mocker.patch(
            "app.routers.quiz.generate_quiz",
            return_value=QuizResponse(questions=[]),
        )
        input_text = "Specific document text."
        client.post("/ai/quiz", json={"text": input_text}, headers=valid_headers)
        mock_fn.assert_called_once_with(input_text)

    def test_service_error_returns_502(self, client: TestClient, valid_headers: dict, mocker):
        mocker.patch(
            "app.routers.quiz.generate_quiz",
            side_effect=RuntimeError("Gemini timeout"),
        )
        response = client.post(
            "/ai/quiz",
            json={"text": "some text"},
            headers=valid_headers,
        )
        assert response.status_code == 502
