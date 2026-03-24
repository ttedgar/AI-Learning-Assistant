package com.edi.backend.messaging;

import java.util.List;

/**
 * Message consumed from the {@code document.processed} queue.
 *
 * <p>Published by the worker after it has called the ai-service and collected results.
 * The backend consumer ({@link DocumentProcessedConsumer}) reads this, saves results to the DB,
 * and updates the document status.
 *
 * <p>Single writer principle: the worker never writes to the DB directly — all writes go
 * through the backend via this queue message.
 */
public record DocumentProcessedMessage(
        String correlationId,
        String documentId,
        String status,
        String errorMessage,
        /** Machine-readable failure code: {@code RATE_LIMIT_EXCEEDED} or {@code AI_UNAVAILABLE}. Null on success. */
        String errorCode,
        String summary,
        List<FlashcardResult> flashcards,
        List<QuizResult> quiz) {

    /**
     * A single flashcard from the ai-service response.
     */
    public record FlashcardResult(String question, String answer) {}

    /**
     * A single quiz question from the ai-service response.
     */
    public record QuizResult(
            String question,
            String type,
            String correctAnswer,
            List<String> options) {}
}
