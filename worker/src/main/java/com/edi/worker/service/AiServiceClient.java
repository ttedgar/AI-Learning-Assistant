package com.edi.worker.service;

import com.edi.worker.messaging.DocumentProcessedMessage.FlashcardDto;
import com.edi.worker.messaging.DocumentProcessedMessage.QuizQuestionDto;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.util.List;
import java.util.Map;

import reactor.core.publisher.Mono;

/**
 * HTTP client for the ai-service (FastAPI).
 *
 * <p>All methods return {@link Mono} — callers compose them with {@code Mono.zip()}
 * to run summary, flashcards, and quiz calls concurrently rather than sequentially.
 * The single {@code .block()} lives in the consumer, not here.
 *
 * <p>The {@code X-Internal-Api-Key} header is pre-attached via the {@code aiServiceWebClient} bean.
 * Production note: mTLS would replace the static API key; Resilience4j circuit-breaker
 * would wrap these calls to fail fast if ai-service is unhealthy.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiServiceClient {

    @Qualifier("aiServiceWebClient")
    private final WebClient aiServiceWebClient;

    // ── Public API ───────────────────────────────────────────────────────────

    public Mono<String> summarize(String text, String documentId) {
        log.info("Calling ai-service /ai/summarize");
        return aiServiceWebClient.post()
                .uri("/ai/summarize")
                .bodyValue(Map.of("text", text, "document_id", documentId))
                .retrieve()
                .bodyToMono(SummarizeResponse.class)
                .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/summarize")))
                .map(SummarizeResponse::getSummary);
    }

    public Mono<List<FlashcardDto>> generateFlashcards(String text, String documentId) {
        log.info("Calling ai-service /ai/flashcards");
        return aiServiceWebClient.post()
                .uri("/ai/flashcards")
                .bodyValue(Map.of("text", text, "document_id", documentId))
                .retrieve()
                .bodyToMono(FlashcardsResponse.class)
                .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/flashcards")))
                .map(r -> r.getFlashcards().stream()
                        .map(f -> FlashcardDto.builder()
                                .question(f.getQuestion())
                                .answer(f.getAnswer())
                                .build())
                        .toList());
    }

    public Mono<List<QuizQuestionDto>> generateQuiz(String text, String documentId) {
        log.info("Calling ai-service /ai/quiz");
        return aiServiceWebClient.post()
                .uri("/ai/quiz")
                .bodyValue(Map.of("text", text, "document_id", documentId))
                .retrieve()
                .bodyToMono(QuizResponse.class)
                .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/quiz")))
                .map(r -> r.getQuestions().stream()
                        .map(q -> QuizQuestionDto.builder()
                                .question(q.getQuestion())
                                .type(q.getType())
                                .correctAnswer(q.getCorrectAnswer())
                                .options(q.getOptions())
                                .build())
                        .toList());
    }

    // ── Response DTOs (private — not part of the worker's public API) ────────

    @Data
    static class SummarizeResponse {
        private String summary;
    }

    @Data
    static class FlashcardsResponse {
        private List<AiFlashcard> flashcards;
    }

    @Data
    static class AiFlashcard {
        private String question;
        private String answer;
    }

    @Data
    static class QuizResponse {
        private List<AiQuizQuestion> questions;
    }

    @Data
    static class AiQuizQuestion {
        private String question;
        private String type;
        /** ai-service returns snake_case; mapped to camelCase here. */
        @JsonProperty("correct_answer")
        private String correctAnswer;
        private List<String> options;
    }
}
