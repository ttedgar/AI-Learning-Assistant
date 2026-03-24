from enum import Enum
from typing import Optional

from pydantic import BaseModel, Field


class SummaryResponse(BaseModel):
    summary: str = Field(..., description="Concise summary of the document.")
    model_used: Optional[str] = Field(default=None, description="The AI model that generated this response.")


class Flashcard(BaseModel):
    question: str
    answer: str


class FlashcardsResponse(BaseModel):
    flashcards: list[Flashcard] = Field(..., description="List of generated flashcards.")
    model_used: Optional[str] = Field(default=None, description="The AI model that generated this response.")


class QuestionType(str, Enum):
    MULTIPLE_CHOICE = "MULTIPLE_CHOICE"
    OPEN_ENDED = "OPEN_ENDED"


class QuizQuestion(BaseModel):
    question: str
    type: QuestionType
    correct_answer: str
    options: Optional[list[str]] = Field(
        default=None,
        description="Answer options for MULTIPLE_CHOICE questions. Null for OPEN_ENDED.",
    )


class QuizResponse(BaseModel):
    questions: list[QuizQuestion] = Field(..., description="List of generated quiz questions.")
    model_used: Optional[str] = Field(default=None, description="The AI model that generated this response.")


class HealthResponse(BaseModel):
    status: str = "ok"
