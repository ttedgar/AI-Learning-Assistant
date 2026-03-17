import logging

from fastapi import APIRouter, HTTPException, status

from app.models.requests import TextRequest
from app.models.responses import FlashcardsResponse
from app.services.ai_service import generate_flashcards

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/ai/flashcards",
    response_model=FlashcardsResponse,
    status_code=status.HTTP_200_OK,
    tags=["ai"],
    summary="Generate flashcards from document text",
)
async def flashcards(request: TextRequest) -> FlashcardsResponse:
    """Generate a set of question/answer flashcards from the provided text."""
    logger.info("Flashcards request received", extra={"text_length": len(request.text)})
    try:
        return generate_flashcards(request.text)
    except Exception as exc:
        logger.exception("Flashcard generation failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI flashcard generation failed: {exc}",
        ) from exc
