from pydantic import BaseModel, Field


class TextRequest(BaseModel):
    """
    Request body for all AI endpoints.

    The text field carries the extracted PDF content sent by the worker.
    Pydantic validates that it is a non-empty string before the request
    reaches any router handler — no manual validation needed.
    """

    text: str = Field(..., min_length=1, description="Extracted text from the PDF document.")
