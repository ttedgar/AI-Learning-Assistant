package com.edi.worker.integration;

import com.edi.worker.config.RabbitMqConfig;
import com.edi.worker.messaging.DocumentProcessedMessage;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Tag;
import org.junit.jupiter.api.Test;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.core.MessageBuilder;
import org.springframework.amqp.core.MessageProperties;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.RabbitMQContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.utility.DockerImageName;

import java.util.List;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.when;

/**
 * Integration test: starts a real RabbitMQ via Testcontainers, publishes a
 * {@code document.processing} message, and verifies a {@code document.processed}
 * result appears on the reply queue.
 *
 * <p>{@link PdfDownloader}, {@link PdfTextExtractor}, and {@link AiServiceClient}
 * are mocked — this test focuses on the AMQP consumer/producer plumbing, not the
 * individual services (which have their own unit tests).
 *
 * <p>{@code @ServiceConnection} auto-configures all RabbitMQ connection properties
 * (host, port, credentials) from the Testcontainers container — no manual
 * {@code @DynamicPropertySource} wiring needed.
 *
 * <p>Tagged {@code "integration"} — excluded from the default {@code ./gradlew test} run
 * because Testcontainers requires a native Docker socket accessible from the JVM process.
 * Runs automatically in CI (GitHub Actions / Linux). To run locally:
 * {@code ./gradlew integrationTest} (Linux / macOS) or
 * {@code docker compose run --rm worker ./gradlew test} (WSL2 / Docker Desktop).
 */
@Tag("integration")
@Testcontainers
@SpringBootTest
class WorkerConsumerIT {

    @Container
    @ServiceConnection
    static RabbitMQContainer rabbitMQ =
            new RabbitMQContainer(DockerImageName.parse("rabbitmq:3.13-management"));

    @MockitoBean
    private PdfDownloader pdfDownloader;

    @MockitoBean
    private PdfTextExtractor pdfTextExtractor;

    @MockitoBean
    private AiServiceClient aiServiceClient;

    @Autowired
    private RabbitTemplate rabbitTemplate;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void consume_publishesDoneResultOnSuccess() throws Exception {
        // Arrange — stub dependencies
        when(pdfDownloader.download(anyString())).thenReturn(new byte[]{1, 2, 3});
        when(pdfTextExtractor.extractText(any())).thenReturn("extracted pdf text");
        when(aiServiceClient.summarize(anyString())).thenReturn(reactor.core.publisher.Mono.just("Great summary"));
        when(aiServiceClient.generateFlashcards(anyString())).thenReturn(
                reactor.core.publisher.Mono.just(List.of(DocumentProcessedMessage.FlashcardDto.builder()
                        .question("Q1").answer("A1").build())));
        when(aiServiceClient.generateQuiz(anyString())).thenReturn(
                reactor.core.publisher.Mono.just(List.of(DocumentProcessedMessage.QuizQuestionDto.builder()
                        .question("Quiz Q1").type("MULTIPLE_CHOICE")
                        .correctAnswer("A").options(List.of("A", "B", "C", "D")).build())));

        // Publish a DocumentProcessingMessage to the processing queue
        DocumentProcessingMessage input = new DocumentProcessingMessage();
        input.setCorrelationId("test-corr-1");
        input.setDocumentId("test-doc-1");
        input.setFileUrl("https://example.com/test.pdf");
        input.setUserId("test-user-1");

        rabbitTemplate.convertAndSend(
                RabbitMqConfig.DOCUMENT_EXCHANGE,
                RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE,
                input);

        // Wait for the processed result to appear on document.processed
        await().atMost(15, TimeUnit.SECONDS).untilAsserted(() -> {
            Message resultMsg = rabbitTemplate.receive(RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE, 1_000);
            assertThat(resultMsg).isNotNull();

            DocumentProcessedMessage result =
                    objectMapper.readValue(resultMsg.getBody(), DocumentProcessedMessage.class);

            assertThat(result.getCorrelationId()).isEqualTo("test-corr-1");
            assertThat(result.getDocumentId()).isEqualTo("test-doc-1");
            assertThat(result.getStatus()).isEqualTo("DONE");
            assertThat(result.getSummary()).isEqualTo("Great summary");
            assertThat(result.getFlashcards()).hasSize(1);
            assertThat(result.getQuiz()).hasSize(1);
        });
    }

    @Test
    void consume_publishesFailedResultAndRoutesToDlqOnPermanentFailure() throws Exception {
        // Arrange — stub download to always throw (exhausts all 3 retries)
        when(pdfDownloader.download(anyString()))
                .thenThrow(new RuntimeException("Supabase Storage unreachable"));

        DocumentProcessingMessage input = new DocumentProcessingMessage();
        input.setCorrelationId("test-corr-fail");
        input.setDocumentId("test-doc-fail");
        input.setFileUrl("https://example.com/broken.pdf");
        input.setUserId("test-user-fail");

        rabbitTemplate.convertAndSend(
                RabbitMqConfig.DOCUMENT_EXCHANGE,
                RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE,
                input);

        // Recoverer publishes FAILED to document.processed (waits for 3 retries + backoff)
        await().atMost(60, TimeUnit.SECONDS).untilAsserted(() -> {
            Message resultMsg = rabbitTemplate.receive(RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE, 1_000);
            assertThat(resultMsg).isNotNull();

            DocumentProcessedMessage result =
                    objectMapper.readValue(resultMsg.getBody(), DocumentProcessedMessage.class);

            assertThat(result.getDocumentId()).isEqualTo("test-doc-fail");
            assertThat(result.getStatus()).isEqualTo("FAILED");
            assertThat(result.getErrorMessage()).contains("Supabase Storage unreachable");
        });

        // Original message should be routed to the DLQ after exhausting retries
        await().atMost(5, TimeUnit.SECONDS).untilAsserted(() -> {
            Message dlqMsg = rabbitTemplate.receive(RabbitMqConfig.DOCUMENT_PROCESSING_DLQ, 1_000);
            assertThat(dlqMsg).isNotNull();
        });
    }
}
