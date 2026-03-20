package com.edi.worker.consumer;

import com.edi.worker.config.RabbitMqConfig;
import com.edi.worker.messaging.DocumentProcessedMessage;
import com.edi.worker.messaging.DocumentProcessedMessage.FlashcardDto;
import com.edi.worker.messaging.DocumentProcessedMessage.QuizQuestionDto;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.messaging.DocumentStatusMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.rabbitmq.ConsumeOptions;
import reactor.rabbitmq.Receiver;
import reactor.util.retry.Retry;

import java.time.Duration;

/**
 * Reactive consumer for the {@code document.processing} queue.
 *
 * <p>Replaces the former {@code @RabbitListener} approach. The subscription is started
 * once on application startup via {@link ApplicationRunner} and runs for the lifetime
 * of the process. Incoming messages are processed via {@code flatMap} — the listener
 * thread is freed during all I/O (PDF download, three AI service calls), allowing a
 * single worker instance to have multiple documents in-flight concurrently.
 *
 * <p>Pipeline per message:
 * <pre>
 *   consumeManualAck
 *     → deserialise JSON
 *     → flatMap: buildProcessingPipeline (retried up to 3 times total)
 *       → Mono.fromCallable: download PDF + extract text  (boundedElastic thread)
 *       → Mono.zip: summarize || flashcards || quiz        (Netty I/O threads)
 *       → publish DONE result to document.processed
 *     → ack on success
 *     → onErrorResume: publish FAILED result, nack to DLQ
 * </pre>
 *
 * <p>Single writer principle: the worker never touches the database. All results
 * are published to {@code document.processed} for the backend to persist.
 *
 * <p>MDC note: MDC is thread-local and does not propagate automatically across
 * Reactor's thread switches. It is set within the {@code boundedElastic} callable
 * and cleared in {@code doFinally}. Log lines from Netty I/O threads (AI calls)
 * will not carry MDC context. Production fix: OpenTelemetry with the Micrometer
 * context-propagation bridge ({@code io.micrometer:context-propagation}).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class DocumentProcessingConsumer implements ApplicationRunner {

    private final Receiver         receiver;
    private final PdfDownloader    pdfDownloader;
    private final PdfTextExtractor pdfTextExtractor;
    private final AiServiceClient  aiServiceClient;
    private final RabbitTemplate   rabbitTemplate;
    private final ObjectMapper     objectMapper;
    private final Retry            documentProcessingRetry;

    /**
     * Starts the reactive consumer. Called once by Spring Boot after the application
     * context is fully initialised. The subscription is non-blocking — {@code subscribe()}
     * returns immediately and processing runs in the background.
     *
     * <p>The outer stream carries a {@code retryWhen} with exponential backoff. If
     * RabbitMQ is unavailable at startup (race between container start and healthcheck),
     * or if the broker connection drops during operation, the stream resubscribes
     * automatically. Without this, the consumer dies silently and the JVM stays alive
     * but processing stops — Docker will not restart a container that has not exited.
     *
     * <p>Backoff: 5 s initial, doubles to 60 s max, unlimited retries.
     * Production: emit a metric on each reconnection attempt (Step 7).
     */
    @Override
    public void run(ApplicationArguments args) {
        log.info("Starting reactive consumer on queue '{}'", RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE);

        receiver.consumeManualAck(
                        RabbitMqConfig.DOCUMENT_PROCESSING_QUEUE,
                        new ConsumeOptions().qos(10))
                .flatMap(delivery -> {
                    DocumentProcessingMessage message;
                    try {
                        message = objectMapper.readValue(
                                delivery.getBody(), DocumentProcessingMessage.class);
                    } catch (Exception e) {
                        // Malformed message — cannot retry, nack directly to DLQ
                        log.error("Cannot deserialise message, nacking to DLQ: {}", e.getMessage());
                        delivery.nack(false);
                        return Mono.empty();
                    }

                    return buildProcessingPipeline(message)
                            .doOnSuccess(v -> {
                                log.info("Acking message for documentId={}", message.getDocumentId());
                                delivery.ack();
                            })
                            .onErrorResume(e -> publishFailedResult(message, e)
                                    .doFinally(s -> delivery.nack(false)));
                })
                .retryWhen(Retry.backoff(Long.MAX_VALUE, Duration.ofSeconds(5))
                        .maxBackoff(Duration.ofSeconds(60))
                        .doBeforeRetry(signal -> log.warn(
                                "Consumer stream failed (attempt {}), reconnecting in {} s: {}",
                                signal.totalRetries() + 1,
                                Math.min(5 * (1L << Math.min(signal.totalRetries(), 3)), 60),
                                signal.failure().getMessage())))
                .subscribe(
                        v -> { /* emissions are Void, nothing to handle */ },
                        e -> log.error("Consumer stream failed after exhausting retries — this should never happen with MAX_VALUE retries", e)
                );
    }

    /**
     * Builds the full processing pipeline for one document.
     *
     * <p>Package-private so unit tests can invoke it directly without going through
     * the AMQP layer.
     *
     * <p>The retry spec is injected ({@link #documentProcessingRetry}) so tests
     * can substitute a no-backoff variant and run in milliseconds.
     */
    Mono<Void> buildProcessingPipeline(DocumentProcessingMessage message) {
        return Mono.fromRunnable(() -> {
                    // Publish IN_PROGRESS status before any I/O — fast, non-blocking publish.
                    // Enables the backend to transition PENDING→IN_PROGRESS and stamp the lease,
                    // which is the anchor for stale job recovery (Step 4).
                    // rabbitTemplate.convertAndSend is blocking but completes in < 5 ms on LAN.
                    rabbitTemplate.convertAndSend(
                            RabbitMqConfig.DOCUMENT_EXCHANGE,
                            RabbitMqConfig.DOCUMENT_STATUS_QUEUE,
                            DocumentStatusMessage.builder()
                                    .correlationId(message.getCorrelationId())
                                    .documentId(message.getDocumentId())
                                    .status("IN_PROGRESS")
                                    .build());
                    log.info("Published IN_PROGRESS status for documentId={}", message.getDocumentId());
                })
                .subscribeOn(Schedulers.boundedElastic())
                .then(Mono.fromCallable(() -> {
                    // Runs on boundedElastic — safe for blocking PDFBox + HTTP download
                    MDC.put("correlationId", message.getCorrelationId());
                    MDC.put("documentId",    message.getDocumentId());
                    log.info("Starting document processing for documentId={}", message.getDocumentId());

                    byte[] pdfBytes = pdfDownloader.download(message.getFileUrl());
                    return pdfTextExtractor.extractText(pdfBytes);
                })
                .subscribeOn(Schedulers.boundedElastic()))

                // All three AI calls fire concurrently — total time = slowest call, not the sum
                .flatMap(text -> Mono.zip(
                                aiServiceClient.summarize(text),
                                aiServiceClient.generateFlashcards(text),
                                aiServiceClient.generateQuiz(text))
                        .map(tuple -> DocumentProcessedMessage.builder()
                                .correlationId(message.getCorrelationId())
                                .documentId(message.getDocumentId())
                                .status("DONE")
                                .summary(tuple.getT1())
                                .flashcards(tuple.getT2())
                                .quiz(tuple.getT3())
                                .build()))

                .flatMap(result -> Mono.fromRunnable(() -> {
                    rabbitTemplate.convertAndSend(
                            RabbitMqConfig.DOCUMENT_EXCHANGE,
                            RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                            result);
                    log.info("Published DONE result for documentId={}", message.getDocumentId());
                }))

                .doOnError(e -> log.warn("Processing failed for documentId={}, will retry if attempts remain: {}",
                        message.getDocumentId(), e.getMessage()))
                .retryWhen(documentProcessingRetry)

                .doFinally(s -> MDC.clear())
                .then();
    }

    /**
     * Publishes a FAILED result to {@code document.processed} after all retries are exhausted.
     * The caller nacks the original message afterwards, routing it to the DLQ.
     */
    private Mono<Void> publishFailedResult(DocumentProcessingMessage message, Throwable cause) {
        // retryWhen wraps the last failure in RetryExhaustedException — unwrap to get root cause
        Throwable root = cause.getCause() != null ? cause.getCause() : cause;

        return Mono.fromRunnable(() -> {
            log.error("All retries exhausted for documentId={}, publishing FAILED result. Cause: {}",
                    message.getDocumentId(), root.getMessage());
            try {
                rabbitTemplate.convertAndSend(
                        RabbitMqConfig.DOCUMENT_EXCHANGE,
                        RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                        DocumentProcessedMessage.builder()
                                .correlationId(message.getCorrelationId())
                                .documentId(message.getDocumentId())
                                .status("FAILED")
                                .errorMessage(root.getMessage())
                                .build());
                log.info("Published FAILED result for documentId={}", message.getDocumentId());
            } catch (Exception publishException) {
                // Do not swallow — original message still gets nacked to DLQ below
                log.error("Could not publish FAILED result for documentId={}",
                        message.getDocumentId(), publishException);
            }
        });
    }
}
