import logging

from fastapi import APIRouter, HTTPException, Request, status
from openai import RateLimitError

from app.models.requests import TextRequest
from app.models.responses import SummaryResponse
from app.services.ai_service import generate_summary

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post(
    "/ai/summarize",
    response_model=SummaryResponse,
    status_code=status.HTTP_200_OK,
    tags=["ai"],
    summary="Generate a document summary",
)
async def summarize(request: Request, body: TextRequest) -> SummaryResponse:
    """
    Generate a concise summary of the provided text.

    Long documents (exceeding the configured character threshold) are
    automatically processed via map-reduce chunked summarization.

    If ``document_id`` is provided, result is cached in Redis for 30 minutes.
    Subsequent requests with the same document_id return the cached result
    without calling Gemini — protecting against retry quota waste.
    """
    logger.info("Summarize request received", extra={"text_length": len(body.text)})
    try:
        idempotency = request.app.state.idempotency

        if body.document_id:
            return await idempotency.get_or_compute(
                operation="summarize",
                document_id=body.document_id,
                compute=lambda: generate_summary(body.text),
                response_class=SummaryResponse,
            )

        # No document_id — skip idempotency (e.g. direct API call without retry context)
        return generate_summary(body.text)

    except RateLimitError as exc:
        # OpenRouter returned 429 — both primary (Llama) and fallback (openrouter/free)
        # are rate-limited. Propagate as 429 so the worker applies a 65 s backoff
        # instead of the standard 1-2 s retry, preventing a quota-exhausting storm.
        logger.warning("OpenRouter rate limit hit during summarization", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Gemini rate limit exceeded. Retry after quota window resets (≥60 s).",
        ) from exc
    except Exception as exc:
        logger.exception("Summarization failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI summarization failed: {exc}",
        ) from exc
