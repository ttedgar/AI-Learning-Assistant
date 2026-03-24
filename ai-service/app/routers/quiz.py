import logging

from fastapi import APIRouter, HTTPException, Request, status
from google.api_core.exceptions import ResourceExhausted

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
async def quiz(request: Request, body: TextRequest) -> QuizResponse:
    """Generate a mix of multiple-choice and open-ended quiz questions from the provided text.

    If ``document_id`` is provided, result is cached in Redis for 30 minutes.
    """
    logger.info("Quiz request received", extra={"text_length": len(body.text)})
    try:
        idempotency = request.app.state.idempotency

        if body.document_id:
            return await idempotency.get_or_compute(
                operation="quiz",
                document_id=body.document_id,
                compute=lambda: generate_quiz(body.text),
                response_class=QuizResponse,
            )

        return generate_quiz(body.text)

    except ResourceExhausted as exc:
        logger.warning("Gemini rate limit hit during quiz generation", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Gemini rate limit exceeded. Retry after quota window resets (≥60 s).",
        ) from exc
    except Exception as exc:
        logger.exception("Quiz generation failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI quiz generation failed: {exc}",
        ) from exc
