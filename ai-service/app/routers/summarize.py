import logging

from fastapi import APIRouter, HTTPException, status

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
async def summarize(request: TextRequest) -> SummaryResponse:
    """
    Generate a concise summary of the provided text.

    Long documents (exceeding the configured character threshold) are
    automatically processed via map-reduce chunked summarization.
    """
    logger.info("Summarize request received", extra={"text_length": len(request.text)})
    try:
        return generate_summary(request.text)
    except Exception as exc:
        logger.exception("Summarization failed", extra={"error": str(exc)})
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"AI summarization failed: {exc}",
        ) from exc
