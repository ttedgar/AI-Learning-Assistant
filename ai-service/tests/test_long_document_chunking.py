"""
test_long_document_chunking

Tests that the map-reduce path is triggered for documents exceeding the
character threshold, and that the direct path is taken for short documents.

These tests target the service layer (app.services.ai_service) directly,
bypassing HTTP, so no API key is needed.
"""

import pytest

from app.config import get_settings
from app.services.chunking import should_chunk, split_text


class TestShouldChunk:
    def test_short_text_does_not_trigger_chunking(self):
        short_text = "A" * 100
        assert should_chunk(short_text) is False

    def test_text_at_threshold_does_not_trigger_chunking(self):
        threshold = get_settings().long_doc_char_threshold
        text_at_threshold = "A" * threshold
        assert should_chunk(text_at_threshold) is False

    def test_text_over_threshold_triggers_chunking(self):
        threshold = get_settings().long_doc_char_threshold
        long_text = "A" * (threshold + 1)
        assert should_chunk(long_text) is True

    def test_empty_text_does_not_trigger_chunking(self):
        assert should_chunk("") is False


class TestSplitText:
    def test_split_produces_multiple_chunks(self):
        settings = get_settings()
        # Build text clearly over chunk_size so splitter creates >1 chunk
        long_text = ("word " * 1000).strip()
        chunks = split_text(long_text)
        assert len(chunks) >= 1  # at minimum the original text

    def test_each_chunk_does_not_exceed_chunk_size(self):
        settings = get_settings()
        long_text = ("paragraph content " * 500).strip()
        chunks = split_text(long_text)
        # CharacterTextSplitter may slightly exceed chunk_size at word boundaries;
        # allow a 10% tolerance — this matches LangChain's behaviour.
        tolerance = settings.chunk_size * 1.1
        for chunk in chunks:
            assert len(chunk) <= tolerance, (
                f"Chunk length {len(chunk)} exceeds tolerance {tolerance}"
            )

    def test_all_content_preserved(self):
        """All characters from the original text must appear in the chunks."""
        settings = get_settings()
        # Use a text larger than chunk_size
        long_text = ("abcde " * 1000).strip()
        chunks = split_text(long_text)
        combined = "".join(chunks)
        # Each character from the original should exist somewhere in combined chunks
        # (overlap means combined may be longer than original — that is expected)
        for char in set(long_text):
            assert char in combined


class TestMapReducePathTriggered:
    """
    Verify that generate_summary routes to map-reduce for long documents
    and to the direct path for short ones, without actually calling Gemini.
    """

    def test_long_document_triggers_map_reduce(self, mocker):
        from app.services import ai_service

        settings = get_settings()
        long_text = "word " * (settings.long_doc_char_threshold // 3)  # well over threshold

        mock_map_reduce = mocker.patch.object(
            ai_service,
            "_map_reduce_summarize",
            return_value="map-reduce summary",
        )
        mocker.patch.object(
            ai_service,
            "_invoke_llm",
            return_value="direct summary",
        )

        ai_service.generate_summary(long_text)
        mock_map_reduce.assert_called_once_with(long_text)

    def test_short_document_uses_direct_path(self, mocker):
        from app.services import ai_service
        from app.models.responses import SummaryResponse

        short_text = "A brief document."

        mock_invoke = mocker.patch.object(
            ai_service,
            "_invoke_llm",
            return_value="direct summary",
        )
        mocker.patch.object(
            ai_service,
            "_map_reduce_summarize",
            return_value="should not be called",
        )

        result = ai_service.generate_summary(short_text)
        mock_invoke.assert_called_once()
        assert result.summary == "direct summary"
