import logging

from fastapi import APIRouter, HTTPException, status

from app.models.requests import TextRequest
from app.models.responses import QuizResponse
from app.services.ai_service import generate_quiz

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/ai/quiz",
    response_model=QuizResponse,
    status_code=status.HTTP_200_OK,
    tags=["ai"],
    summary="Generate quiz questions from document text",
)
async def quiz(request: TextRequest) -> QuizResponse:
    """Generate a mix of multiple-choice and open-ended quiz questions from the provided text."""
    logger.info("Quiz request received", extra={"text_length": len(request.text)})
    try:
        return generate_quiz(request.text)
    except Exception as exc:
        logger.exception("Quiz generation failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI quiz generation failed: {exc}",
        ) from exc
