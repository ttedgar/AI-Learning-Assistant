"""
AI orchestration service — the only place that talks to Gemini.

DIP (Dependency Inversion Principle) at architecture level:
  The worker depends on this service's REST interface, not on Gemini directly.
  Swapping Gemini for another LLM requires changes only inside this file
  (and the config model name), not in any other service.

LangChain is used for:
  - Prompt templating (PromptTemplate)
  - LLM abstraction (ChatGoogleGenerativeAI)
  - Text splitting and map-reduce for long documents (see chunking.py)

Observability: Langfuse traces every LLM call automatically via the LangChain
CallbackHandler. Each chain.invoke() produces a trace with prompt, response,
token usage, latency, and cost visible in the Langfuse dashboard.
Production note: Langfuse also supports prompt management (versioned prompts
pulled from the dashboard) and A/B evaluation — next steps for this service.

Production note: Responses would also be cached in Redis (keyed by SHA-256 of
the input text + prompt version) to avoid duplicate Gemini calls for the same
content. Cache TTL: 24 h.
"""

import json
import logging
from typing import Optional

from langchain.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langfuse.langchain import CallbackHandler

from app.config import get_settings
from app.models.responses import Flashcard, FlashcardsResponse, QuizQuestion, QuizResponse, SummaryResponse
from app.services.chunking import should_chunk, split_text

logger = logging.getLogger(__name__)


_LLM_TEMPERATURE = 0.3  # single source of truth — also appears in Config metadata


def _get_langfuse_handler(operation: str) -> Optional[CallbackHandler]:
    """
    Returns a Langfuse LangChain callback handler if credentials are configured,
    otherwise returns None (Langfuse is optional — the service runs without it).

    The handler is constructed per-request so each trace is independently scoped
    with its own operation name and metadata. In a high-throughput production
    system you would reuse a single handler; for this scale, per-call is fine.

    The `metadata` dict populates the Config panel in the Langfuse trace view,
    making it easy to filter traces by operation type or model version.
    """
    settings = get_settings()
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        return None
    return CallbackHandler(
        secret_key=settings.langfuse_secret_key,
        public_key=settings.langfuse_public_key,
        host=settings.langfuse_host,
        trace_name=operation,
        metadata={
            "model": settings.gemini_model,
            "temperature": _LLM_TEMPERATURE,
            "operation": operation,
        },
    )

# ---------------------------------------------------------------------------
# Prompt templates
# ---------------------------------------------------------------------------

_SUMMARY_PROMPT = PromptTemplate(
    input_variables=["text"],
    template=(
        "You are an expert academic summariser. "
        "Produce a clear, concise summary of the following text in 3-5 paragraphs. "
        "Focus on key concepts, main arguments, and important details.\n\n"
        "Text:\n{text}\n\n"
        "Summary:"
    ),
)

_CHUNK_SUMMARY_PROMPT = PromptTemplate(
    input_variables=["text"],
    template=(
        "Summarise the following excerpt from a longer document. "
        "Be concise and preserve key facts.\n\n"
        "Excerpt:\n{text}\n\n"
        "Summary:"
    ),
)

_REDUCE_PROMPT = PromptTemplate(
    input_variables=["text"],
    template=(
        "The following are summaries of individual sections of a longer document. "
        "Combine them into a single, coherent summary of 3-5 paragraphs.\n\n"
        "Section summaries:\n{text}\n\n"
        "Final summary:"
    ),
)

_FLASHCARDS_PROMPT = PromptTemplate(
    input_variables=["text"],
    template=(
        "You are an expert educator. Generate 5-10 flashcards from the following text. "
        "Each flashcard must have a clear question and a concise answer.\n\n"
        "Return ONLY a JSON array — no markdown, no code fences — in this exact format:\n"
        '[{{"question": "...", "answer": "..."}}, ...]\n\n'
        "Text:\n{text}\n\n"
        "Flashcards JSON:"
    ),
)

_QUIZ_PROMPT = PromptTemplate(
    input_variables=["text"],
    template=(
        "You are an expert educator. Generate 5 quiz questions from the following text. "
        "Mix MULTIPLE_CHOICE and OPEN_ENDED questions (at least 2 of each type).\n\n"
        "Return ONLY a JSON array — no markdown, no code fences — in this exact format:\n"
        "[\n"
        '  {{"question": "...", "type": "MULTIPLE_CHOICE", "correct_answer": "...", '
        '"options": ["option1", "option2", "option3", "option4"]}},\n'
        '  {{"question": "...", "type": "OPEN_ENDED", "correct_answer": "...", "options": null}}\n'
        "]\n\n"
        "Text:\n{text}\n\n"
        "Quiz JSON:"
    ),
)


def _get_llm() -> ChatGoogleGenerativeAI:
    """Construct the LangChain LLM wrapper for Gemini."""
    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=_LLM_TEMPERATURE,
    )


def _invoke_llm(prompt: PromptTemplate, text: str, operation: str) -> str:
    """Format a prompt, call the LLM, and return the string output."""
    llm = _get_llm()
    chain = prompt | llm
    callbacks = [h for h in [_get_langfuse_handler(operation)] if h is not None]
    result = chain.invoke({"text": text}, config={"callbacks": callbacks})
    # LangChain returns an AIMessage; extract the string content
    return result.content if hasattr(result, "content") else str(result)


# ---------------------------------------------------------------------------
# Map-reduce summarization for long documents
# ---------------------------------------------------------------------------

def _map_reduce_summarize(text: str) -> str:
    """
    Map-reduce summarization pipeline for documents exceeding the token threshold.

    Map:    summarize each chunk independently
    Reduce: combine chunk summaries into a single final summary
    """
    chunks = split_text(text)
    logger.info("Starting map-reduce summarization", extra={"chunks": len(chunks)})

    # Map step
    chunk_summaries = []
    for i, chunk in enumerate(chunks):
        logger.debug("Summarising chunk", extra={"chunk_index": i, "chunk_length": len(chunk)})
        summary = _invoke_llm(_CHUNK_SUMMARY_PROMPT, chunk, operation="chunk_summary")
        chunk_summaries.append(summary)

    # Reduce step
    combined = "\n\n---\n\n".join(chunk_summaries)
    final_summary = _invoke_llm(_REDUCE_PROMPT, combined, operation="reduce")
    logger.info("Map-reduce summarization complete")
    return final_summary


# ---------------------------------------------------------------------------
# Public service functions
# ---------------------------------------------------------------------------

def generate_summary(text: str) -> SummaryResponse:
    """
    Generate a summary. Uses map-reduce for long documents, direct call for short ones.
    """
    if should_chunk(text):
        logger.info("Long document detected — using map-reduce path", extra={"length": len(text)})
        summary = _map_reduce_summarize(text)
    else:
        summary = _invoke_llm(_SUMMARY_PROMPT, text, operation="summarize")

    return SummaryResponse(summary=summary.strip())


def generate_flashcards(text: str) -> FlashcardsResponse:
    """Generate flashcards from document text."""
    # For flashcards we use the first chunk if document is very long — generating
    # flashcards across a map-reduce reduction would produce duplicate/conflicting cards.
    # Production: implement a deduplicated merge strategy.
    if should_chunk(text):
        chunks = split_text(text)
        text = chunks[0]  # noqa: PLW2901 — intentional narrowing for flashcard generation

    raw = _invoke_llm(_FLASHCARDS_PROMPT, text, operation="flashcards")
    cards_data = _parse_json_list(raw, context="flashcards")
    flashcards = [Flashcard(**card) for card in cards_data]
    return FlashcardsResponse(flashcards=flashcards)


def generate_quiz(text: str) -> QuizResponse:
    """Generate quiz questions from document text."""
    if should_chunk(text):
        chunks = split_text(text)
        text = chunks[0]  # noqa: PLW2901 — same rationale as flashcards

    raw = _invoke_llm(_QUIZ_PROMPT, text, operation="quiz")
    questions_data = _parse_json_list(raw, context="quiz")
    questions = [QuizQuestion(**q) for q in questions_data]
    return QuizResponse(questions=questions)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _parse_json_list(raw: str, context: str) -> list[dict]:
    """
    Parse a JSON array out of an LLM response string.

    LLMs occasionally wrap JSON in markdown code fences despite being asked not to.
    This helper strips the fences before parsing.
    """
    cleaned = raw.strip()
    # Strip common markdown code fences
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:-1] if lines[-1].strip() == "```" else lines[1:])

    try:
        result = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        logger.error(
            "Failed to parse LLM JSON output",
            extra={"context": context, "raw_response": raw[:500], "error": str(exc)},
        )
        raise ValueError(f"LLM returned malformed JSON for {context}: {exc}") from exc

    if not isinstance(result, list):
        raise ValueError(f"Expected JSON array for {context}, got {type(result).__name__}")

    return result
