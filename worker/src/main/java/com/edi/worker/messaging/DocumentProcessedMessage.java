package com.edi.worker.messaging;

import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.util.List;

/**
 * Outgoing message published to {@code document.processed} queue after processing completes.
 *
 * <p>Status is either {@code DONE} (all results populated) or {@code FAILED}
 * (errorMessage set, result fields null). The backend owns all DB writes —
 * the worker never touches the database (single writer principle).
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
public class DocumentProcessedMessage {

    private String correlationId;
    private String documentId;

    /** DONE or FAILED */
    private String status;

    /** Null on success; populated with the root cause message on failure. */
    private String errorMessage;

    /**
     * Machine-readable failure code; null on success.
     * Known values: {@code RATE_LIMIT_EXCEEDED} (OpenRouter 429), {@code AI_UNAVAILABLE} (other AI errors).
     * The backend stores this in the documents table so the frontend can display a specific message.
     */
    private String errorCode;

    /** The AI model that generated the summary (e.g. {@code meta-llama/llama-3.1-8b-instruct:free}). Null on failure. */
    private String aiModel;

    private String summary;
    private List<FlashcardDto> flashcards;
    private List<QuizQuestionDto> quiz;

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class FlashcardDto {
        private String question;
        private String answer;
    }

    @Data
    @Builder
    @NoArgsConstructor
    @AllArgsConstructor
    public static class QuizQuestionDto {
        private String question;
        private String type;
        private String correctAnswer;
        private List<String> options;
    }
}
