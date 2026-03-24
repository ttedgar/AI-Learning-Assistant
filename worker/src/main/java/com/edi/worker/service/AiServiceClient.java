package com.edi.worker.service;

import com.edi.worker.exception.RateLimitException;
import com.edi.worker.messaging.DocumentProcessedMessage.FlashcardDto;
import com.edi.worker.messaging.DocumentProcessedMessage.QuizQuestionDto;
import com.fasterxml.jackson.annotation.JsonProperty;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.web.reactive.function.client.WebClient;

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
    private final WebClient     aiServiceWebClient;
    private final MeterRegistry meterRegistry;

    // ── Public API ───────────────────────────────────────────────────────────

    public Mono<String> summarize(String text, String documentId, String correlationId) {
        log.info("Calling ai-service /ai/summarize");
        // Mono.defer ensures Timer.start() is called on each subscription (not once at build time),
        // so every retry attempt records its own latency correctly.
        return Mono.defer(() -> {
            Timer.Sample sample = Timer.start(meterRegistry);
            return aiServiceWebClient.post()
                    .uri("/ai/summarize")
                    .header("X-Correlation-Id", correlationId)
                    .bodyValue(Map.of("text", text, "document_id", documentId))
                    .retrieve()
                    // 429 from ai-service means Gemini quota is exhausted. Throw RateLimitException
                    // so the retry strategy can apply a 65 s backoff instead of the standard 1-2 s.
                    .onStatus(s -> s == HttpStatus.TOO_MANY_REQUESTS,
                            response -> Mono.error(new RateLimitException(
                                    "ai-service returned 429 (Gemini rate limit) for /ai/summarize")))
                    .bodyToMono(SummarizeResponse.class)
                    .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/summarize")))
                    .map(SummarizeResponse::getSummary)
                    .doFinally(signal -> sample.stop(
                            Timer.builder("ai.call.latency").tag("operation", "summarize")
                                    .register(meterRegistry)));
        });
    }

    public Mono<List<FlashcardDto>> generateFlashcards(String text, String documentId, String correlationId) {
        log.info("Calling ai-service /ai/flashcards");
        return Mono.defer(() -> {
            Timer.Sample sample = Timer.start(meterRegistry);
            return aiServiceWebClient.post()
                    .uri("/ai/flashcards")
                    .header("X-Correlation-Id", correlationId)
                    .bodyValue(Map.of("text", text, "document_id", documentId))
                    .retrieve()
                    .onStatus(s -> s == HttpStatus.TOO_MANY_REQUESTS,
                            response -> Mono.error(new RateLimitException(
                                    "ai-service returned 429 (Gemini rate limit) for /ai/flashcards")))
                    .bodyToMono(FlashcardsResponse.class)
                    .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/flashcards")))
                    .map(r -> r.getFlashcards().stream()
                            .map(f -> FlashcardDto.builder()
                                    .question(f.getQuestion())
                                    .answer(f.getAnswer())
                                    .build())
                            .toList())
                    .doFinally(signal -> sample.stop(
                            Timer.builder("ai.call.latency").tag("operation", "flashcards")
                                    .register(meterRegistry)));
        });
    }

    public Mono<List<QuizQuestionDto>> generateQuiz(String text, String documentId, String correlationId) {
        log.info("Calling ai-service /ai/quiz");
        return Mono.defer(() -> {
            Timer.Sample sample = Timer.start(meterRegistry);
            return aiServiceWebClient.post()
                    .uri("/ai/quiz")
                    .header("X-Correlation-Id", correlationId)
                    .bodyValue(Map.of("text", text, "document_id", documentId))
                    .retrieve()
                    .onStatus(s -> s == HttpStatus.TOO_MANY_REQUESTS,
                            response -> Mono.error(new RateLimitException(
                                    "ai-service returned 429 (Gemini rate limit) for /ai/quiz")))
                    .bodyToMono(QuizResponse.class)
                    .switchIfEmpty(Mono.error(new IllegalStateException("Empty response from /ai/quiz")))
                    .map(r -> r.getQuestions().stream()
                            .map(q -> QuizQuestionDto.builder()
                                    .question(q.getQuestion())
                                    .type(q.getType())
                                    .correctAnswer(q.getCorrectAnswer())
                                    .options(q.getOptions())
                                    .build())
                            .toList())
                    .doFinally(signal -> sample.stop(
                            Timer.builder("ai.call.latency").tag("operation", "quiz")
                                    .register(meterRegistry)));
        });
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
