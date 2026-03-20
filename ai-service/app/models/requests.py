from typing import Optional

from pydantic import BaseModel, Field


class TextRequest(BaseModel):
    """
    Request body for all AI endpoints.

    The text field carries the extracted PDF content sent by the worker.
    Pydantic validates that it is a non-empty string before the request
    reaches any router handler — no manual validation needed.

    document_id is optional for backward compatibility. When provided, the
    Redis idempotency guard uses it as the cache key — identical requests for
    the same document return the cached result without calling Gemini.
    """

    text: str = Field(..., min_length=1, description="Extracted text from the PDF document.")
    document_id: Optional[str] = Field(
        default=None,
        description="Document UUID — enables Redis idempotency (Step 5). "
                    "Omitting it disables caching for this request.",
    )
