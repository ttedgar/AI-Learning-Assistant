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

/**
 * HTTP client for the ai-service (FastAPI).
 *
 * <p>All calls are blocking — the worker's AMQP listener thread is inherently blocking.
 * The {@code X-Internal-Api-Key} header is pre-attached via the {@code aiServiceWebClient} bean.
 *
 * <p>The ai-service uses snake_case JSON field names ({@code correct_answer}).
 * Inner response DTOs map these to camelCase using {@link JsonProperty}.
 *
 * <p>Production note: mTLS would replace the static API key; circuit-breaker
 * (Resilience4j) would wrap these calls to fail fast if ai-service is unhealthy.
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class AiServiceClient {

    @Qualifier("aiServiceWebClient")
    private final WebClient aiServiceWebClient;

    // ── Public API ───────────────────────────────────────────────────────────

    public String summarize(String text) {
        log.info("Calling ai-service /ai/summarize");
        SummarizeResponse response = aiServiceWebClient.post()
                .uri("/ai/summarize")
                .bodyValue(Map.of("text", text))
                .retrieve()
                .bodyToMono(SummarizeResponse.class)
                .block();
        if (response == null) {
            throw new IllegalStateException("Null response from /ai/summarize");
        }
        return response.getSummary();
    }

    public List<FlashcardDto> generateFlashcards(String text) {
        log.info("Calling ai-service /ai/flashcards");
        FlashcardsResponse response = aiServiceWebClient.post()
                .uri("/ai/flashcards")
                .bodyValue(Map.of("text", text))
                .retrieve()
                .bodyToMono(FlashcardsResponse.class)
                .block();
        if (response == null || response.getFlashcards() == null) {
            throw new IllegalStateException("Null response from /ai/flashcards");
        }
        return response.getFlashcards().stream()
                .map(f -> FlashcardDto.builder()
                        .question(f.getQuestion())
                        .answer(f.getAnswer())
                        .build())
                .toList();
    }

    public List<QuizQuestionDto> generateQuiz(String text) {
        log.info("Calling ai-service /ai/quiz");
        QuizResponse response = aiServiceWebClient.post()
                .uri("/ai/quiz")
                .bodyValue(Map.of("text", text))
                .retrieve()
                .bodyToMono(QuizResponse.class)
                .block();
        if (response == null || response.getQuestions() == null) {
            throw new IllegalStateException("Null response from /ai/quiz");
        }
        return response.getQuestions().stream()
                .map(q -> QuizQuestionDto.builder()
                        .question(q.getQuestion())
                        .type(q.getType())
                        .correctAnswer(q.getCorrectAnswer())
                        .options(q.getOptions())
                        .build())
                .toList();
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
