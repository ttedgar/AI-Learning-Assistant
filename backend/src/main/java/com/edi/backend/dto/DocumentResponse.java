package com.edi.backend.dto;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;

import java.time.Instant;
import java.util.UUID;

/**
 * API representation of a {@link Document}.
 * Never expose the internal {@link com.edi.backend.entity.User} entity directly —
 * only the user's own documents are ever returned, so {@code userId} is informational only.
 */
public record DocumentResponse(
        UUID id,
        String title,
        String fileUrl,
        DocumentStatus status,
        /** Null unless status is FAILED. Values: {@code RATE_LIMIT_EXCEEDED}, {@code AI_UNAVAILABLE}. */
        String errorCode,
        /** Model that generated the summary. Null unless status is DONE. */
        String summaryModel,
        /** Model that generated the flashcards. Null unless status is DONE. */
        String flashcardsModel,
        /** Model that generated the quiz. Null unless status is DONE. */
        String quizModel,
        Instant createdAt) {

    public static DocumentResponse from(Document document) {
        return new DocumentResponse(
                document.getId(),
                document.getTitle(),
                document.getFileUrl(),
                document.getStatus(),
                document.getErrorCode(),
                document.getSummaryModel(),
                document.getFlashcardsModel(),
                document.getQuizModel(),
                document.getCreatedAt());
    }
}
