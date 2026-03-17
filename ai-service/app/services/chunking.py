"""
Text chunking utilities for long-document handling.

Design: map-reduce summarization
  1. Split text into overlapping chunks (CharacterTextSplitter).
  2. Map   — summarize each chunk independently.
  3. Reduce — combine chunk summaries into a final summary.

This mirrors LangChain's MapReduceDocumentsChain pattern and is the standard
approach for handling documents that exceed LLM context windows.

Production note: In a high-throughput system the map step would be parallelised
(asyncio.gather / ThreadPoolExecutor) and results cached in Redis keyed by a
content hash to avoid redundant Gemini calls.
"""

import logging

from langchain.text_splitter import RecursiveCharacterTextSplitter

from app.config import get_settings

logger = logging.getLogger(__name__)


def should_chunk(text: str) -> bool:
    """Return True when the text exceeds the configured character threshold."""
    settings = get_settings()
    return len(text) > settings.long_doc_char_threshold


def split_text(text: str) -> list[str]:
    """
    Split text into overlapping chunks using LangChain's CharacterTextSplitter.

    Chunk size and overlap come from config so they can be tuned per environment
    without code changes.
    """
    settings = get_settings()
    # RecursiveCharacterTextSplitter tries separators in order: \n\n, \n, space, ""
    # This handles prose, code, and tables — better than a single-separator splitter.
    # Production: use SemanticChunker (LangChain) for meaning-aware splits when latency allows.
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=settings.chunk_size,
        chunk_overlap=settings.chunk_overlap,
    )
    chunks = splitter.split_text(text)
    logger.info(
        "Split document into chunks",
        extra={"chunk_count": len(chunks), "original_length": len(text)},
    )
    return chunks
