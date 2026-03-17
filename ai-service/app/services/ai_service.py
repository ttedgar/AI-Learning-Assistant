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

Observability: Langfuse traces every LLM call via the LangChain CallbackHandler.
Prompt management: prompts are fetched from Langfuse at call time so they can be
  edited in the dashboard without redeployment. Hardcoded templates act as
  fallbacks if Langfuse is unreachable or unconfigured.
  Each trace is linked to the exact prompt version that produced it.

Langfuse v3 API notes:
  - CallbackHandler() takes NO constructor args; reads LANGFUSE_* env vars.
  - Prompt-to-trace linking: set metadata={"langfuse_prompt": lf_prompt} on
    the PromptTemplate itself (not on the handler).
  - Trace metadata (name, tags) passed in chain.invoke(config={"metadata": {...}}).

Production note: Responses would also be cached in Redis (keyed by SHA-256 of
the input text + prompt version) to avoid duplicate Gemini calls for the same
content. Cache TTL: 24 h.
"""

import json
import logging
from typing import Any, Optional

from langchain.prompts import PromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI
from langfuse import Langfuse
from langfuse.langchain import CallbackHandler

from app.config import get_settings
from app.models.responses import Flashcard, FlashcardsResponse, QuizQuestion, QuizResponse, SummaryResponse
from app.services.chunking import should_chunk, split_text

logger = logging.getLogger(__name__)

_LLM_TEMPERATURE = 0.3  # single source of truth — also appears in Config metadata

# ---------------------------------------------------------------------------
# Langfuse client (singleton) — used only for prompt management
# ---------------------------------------------------------------------------

_langfuse_client: Optional[Langfuse] = None


def _get_langfuse_client() -> Optional[Langfuse]:
    """
    Returns a cached Langfuse client if credentials are configured, else None.
    Used for prompt management (fetching prompt versions from the dashboard).
    Tracing credentials are read from LANGFUSE_* env vars by CallbackHandler directly.
    """
    global _langfuse_client
    settings = get_settings()
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        return None
    if _langfuse_client is None:
        _langfuse_client = Langfuse(
            secret_key=settings.langfuse_secret_key,
            public_key=settings.langfuse_public_key,
            host=settings.langfuse_host,
        )
    return _langfuse_client


def _get_prompt(name: str, fallback: PromptTemplate) -> PromptTemplate:
    """
    Fetch a prompt from Langfuse by name and return a PromptTemplate.

    In langfuse v3, get_langchain_prompt() returns a plain string (the template
    text), not a Runnable. We wrap it as a PromptTemplate and embed the
    lf_prompt object in its metadata so the CallbackHandler can link each trace
    to the exact prompt version — enabling version-level analytics.

    Falls back to the hardcoded template if Langfuse is unreachable or unconfigured.
    """
    client = _get_langfuse_client()
    if client is None:
        return fallback
    try:
        lf_prompt = client.get_prompt(name)
        template_str = lf_prompt.get_langchain_prompt()  # returns str in v3
        return PromptTemplate(
            input_variables=fallback.input_variables,
            template=template_str,
            metadata={"langfuse_prompt": lf_prompt},
        )
    except Exception as exc:
        logger.warning(
            "Failed to fetch prompt from Langfuse, using hardcoded fallback",
            extra={"prompt_name": name, "error": str(exc)},
        )
        return fallback


def _get_langfuse_handler() -> Optional[CallbackHandler]:
    """
    Returns a Langfuse LangChain callback handler.

    In langfuse v3 the handler reads LANGFUSE_SECRET_KEY / LANGFUSE_PUBLIC_KEY /
    LANGFUSE_HOST from the environment — no constructor args are accepted.
    Trace name and metadata are set per-invocation via chain.invoke(config=...).
    """
    settings = get_settings()
    if not settings.langfuse_secret_key or not settings.langfuse_public_key:
        return None
    return CallbackHandler()


# ---------------------------------------------------------------------------
# Hardcoded prompt fallbacks
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
        "You are an expert educator. Generate 5 multiple choice quiz questions from the following text. "
        "Every question must have exactly 4 options and one correct answer.\n\n"
        "Return ONLY a JSON array — no markdown, no code fences — in this exact format:\n"
        "[\n"
        '  {{"question": "...", "type": "MULTIPLE_CHOICE", "correct_answer": "...", '
        '"options": ["option1", "option2", "option3", "option4"]}}\n'
        "]\n\n"
        "Text:\n{text}\n\n"
        "Quiz JSON:"
    ),
)


# ---------------------------------------------------------------------------
# LLM helpers
# ---------------------------------------------------------------------------

def _get_llm() -> ChatGoogleGenerativeAI:
    """Construct the LangChain LLM wrapper for Gemini."""
    settings = get_settings()
    return ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=_LLM_TEMPERATURE,
    )


def _invoke_llm(
    prompt_template: Any,
    text: str,
    operation: str,
) -> str:
    """
    Format a prompt, call the LLM, and return the string output.

    Trace metadata (name, model, temperature) is passed via the config dict so
    Langfuse v3 can populate the Config panel and name the trace correctly.
    Prompt-to-trace linking is handled via metadata on the PromptTemplate itself
    (set by _get_prompt when the template comes from Langfuse).
    """
    settings = get_settings()
    llm = _get_llm()
    chain = prompt_template | llm
    handler = _get_langfuse_handler()
    callbacks = [handler] if handler is not None else []
    result = chain.invoke(
        {"text": text},
        config={
            "callbacks": callbacks,
            "metadata": {
                "langfuse_trace_name": operation,
                "langfuse_tags": [operation],
                "model": settings.gemini_model,
                "temperature": _LLM_TEMPERATURE,
            },
        },
    )
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
    chunk_template = _get_prompt("summarize-chunk", _CHUNK_SUMMARY_PROMPT)
    reduce_template = _get_prompt("summarize-reduce", _REDUCE_PROMPT)

    chunks = split_text(text)
    logger.info("Starting map-reduce summarization", extra={"chunks": len(chunks)})

    # Map step
    chunk_summaries = []
    for i, chunk in enumerate(chunks):
        logger.debug("Summarising chunk", extra={"chunk_index": i, "chunk_length": len(chunk)})
        summary = _invoke_llm(chunk_template, chunk, operation="chunk_summary")
        chunk_summaries.append(summary)

    # Reduce step
    combined = "\n\n---\n\n".join(chunk_summaries)
    final_summary = _invoke_llm(reduce_template, combined, operation="reduce")
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
        prompt_template = _get_prompt("summarize-document", _SUMMARY_PROMPT)
        summary = _invoke_llm(prompt_template, text, operation="summarize")

    return SummaryResponse(summary=summary.strip())


def generate_flashcards(text: str) -> FlashcardsResponse:
    """Generate flashcards from document text."""
    # For flashcards we use the first chunk if document is very long — generating
    # flashcards across a map-reduce reduction would produce duplicate/conflicting cards.
    # Production: implement a deduplicated merge strategy.
    if should_chunk(text):
        chunks = split_text(text)
        text = chunks[0]  # noqa: PLW2901 — intentional narrowing for flashcard generation

    prompt_template = _get_prompt("generate-flashcards", _FLASHCARDS_PROMPT)
    raw = _invoke_llm(prompt_template, text, operation="flashcards")
    cards_data = _parse_json_list(raw, context="flashcards")
    flashcards = [Flashcard(**card) for card in cards_data]
    return FlashcardsResponse(flashcards=flashcards)


def generate_quiz(text: str) -> QuizResponse:
    """Generate quiz questions from document text."""
    if should_chunk(text):
        chunks = split_text(text)
        text = chunks[0]  # noqa: PLW2901 — same rationale as flashcards

    prompt_template = _get_prompt("generate-quiz", _QUIZ_PROMPT)
    raw = _invoke_llm(prompt_template, text, operation="quiz")
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
