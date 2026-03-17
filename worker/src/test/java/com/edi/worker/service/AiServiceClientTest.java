package com.edi.worker.service;

import com.edi.worker.messaging.DocumentProcessedMessage.FlashcardDto;
import com.edi.worker.messaging.DocumentProcessedMessage.QuizQuestionDto;
import okhttp3.mockwebserver.MockResponse;
import okhttp3.mockwebserver.MockWebServer;
import okhttp3.mockwebserver.RecordedRequest;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.web.reactive.function.client.WebClient;
import org.springframework.web.reactive.function.client.WebClientResponseException;

import java.io.IOException;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class AiServiceClientTest {

    private MockWebServer mockServer;
    private AiServiceClient client;

    @BeforeEach
    void setUp() throws IOException {
        mockServer = new MockWebServer();
        mockServer.start();

        WebClient webClient = WebClient.builder()
                .baseUrl(mockServer.url("/").toString())
                .defaultHeader("X-Internal-Api-Key", "test-key")
                .build();

        client = new AiServiceClient(webClient);
    }

    @AfterEach
    void tearDown() throws IOException {
        mockServer.shutdown();
    }

    // ── summarize ────────────────────────────────────────────────────────────

    @Test
    void summarize_returnsSummaryFromResponse() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setBody("""
                        {"summary": "This is the summary."}
                        """)
                .addHeader("Content-Type", "application/json"));

        String summary = client.summarize("some text");

        assertThat(summary).isEqualTo("This is the summary.");

        RecordedRequest request = mockServer.takeRequest();
        assertThat(request.getPath()).isEqualTo("/ai/summarize");
        assertThat(request.getHeader("X-Internal-Api-Key")).isEqualTo("test-key");
        assertThat(request.getBody().readUtf8()).contains("some text");
    }

    @Test
    void summarize_throwsOn500() {
        mockServer.enqueue(new MockResponse().setResponseCode(500));

        assertThatThrownBy(() -> client.summarize("text"))
                .isInstanceOf(WebClientResponseException.class);
    }

    // ── generateFlashcards ───────────────────────────────────────────────────

    @Test
    void generateFlashcards_returnsFlashcardsFromResponse() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setBody("""
                        {
                          "flashcards": [
                            {"question": "What is X?", "answer": "X is Y."},
                            {"question": "Define Z.", "answer": "Z means W."}
                          ]
                        }
                        """)
                .addHeader("Content-Type", "application/json"));

        List<FlashcardDto> flashcards = client.generateFlashcards("text");

        assertThat(flashcards).hasSize(2);
        assertThat(flashcards.get(0).getQuestion()).isEqualTo("What is X?");
        assertThat(flashcards.get(0).getAnswer()).isEqualTo("X is Y.");

        RecordedRequest request = mockServer.takeRequest();
        assertThat(request.getPath()).isEqualTo("/ai/flashcards");
    }

    // ── generateQuiz ─────────────────────────────────────────────────────────

    @Test
    void generateQuiz_returnsQuestionsFromResponse() throws InterruptedException {
        mockServer.enqueue(new MockResponse()
                .setBody("""
                        {
                          "questions": [
                            {
                              "question": "Which is correct?",
                              "type": "MULTIPLE_CHOICE",
                              "correct_answer": "A",
                              "options": ["A", "B", "C", "D"]
                            }
                          ]
                        }
                        """)
                .addHeader("Content-Type", "application/json"));

        List<QuizQuestionDto> quiz = client.generateQuiz("text");

        assertThat(quiz).hasSize(1);
        QuizQuestionDto q = quiz.get(0);
        assertThat(q.getQuestion()).isEqualTo("Which is correct?");
        assertThat(q.getType()).isEqualTo("MULTIPLE_CHOICE");
        // Verify snake_case → camelCase mapping
        assertThat(q.getCorrectAnswer()).isEqualTo("A");
        assertThat(q.getOptions()).containsExactly("A", "B", "C", "D");

        RecordedRequest request = mockServer.takeRequest();
        assertThat(request.getPath()).isEqualTo("/ai/quiz");
    }

    @Test
    void generateQuiz_throwsOn401() {
        mockServer.enqueue(new MockResponse().setResponseCode(401));

        assertThatThrownBy(() -> client.generateQuiz("text"))
                .isInstanceOf(WebClientResponseException.class);
    }
}
