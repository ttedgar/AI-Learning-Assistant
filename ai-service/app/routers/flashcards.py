import logging

from fastapi import APIRouter, HTTPException, Request, status
from google.api_core.exceptions import ResourceExhausted

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
async def flashcards(request: Request, body: TextRequest) -> FlashcardsResponse:
    """Generate a set of question/answer flashcards from the provided text.

    If ``document_id`` is provided, result is cached in Redis for 30 minutes.
    """
    logger.info("Flashcards request received", extra={"text_length": len(body.text)})
    try:
        idempotency = request.app.state.idempotency

        if body.document_id:
            return await idempotency.get_or_compute(
                operation="flashcards",
                document_id=body.document_id,
                compute=lambda: generate_flashcards(body.text),
                response_class=FlashcardsResponse,
            )

        return generate_flashcards(body.text)

    except ResourceExhausted as exc:
        logger.warning("Gemini rate limit hit during flashcard generation", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Gemini rate limit exceeded. Retry after quota window resets (≥60 s).",
        ) from exc
    except Exception as exc:
        logger.exception("Flashcard generation failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI flashcard generation failed: {exc}",
        ) from exc
