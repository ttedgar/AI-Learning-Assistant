package com.edi.worker.consumer;

import com.edi.worker.config.RabbitMqConfig;
import com.edi.worker.exception.RateLimitException;
import com.edi.worker.messaging.DocumentProcessedMessage;
import org.springframework.web.reactive.function.client.WebClientResponseException;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.edi.worker.messaging.DocumentStatusMessage;
import com.edi.worker.service.AiServiceClient;
import com.edi.worker.service.AiServiceClient.FlashcardsResult;
import com.edi.worker.service.AiServiceClient.QuizResult;
import com.edi.worker.service.AiServiceClient.SummarizeResult;
import com.edi.worker.service.PdfDownloader;
import com.edi.worker.service.PdfTextExtractor;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.rabbitmq.client.AMQP;
import io.micrometer.core.instrument.MeterRegistry;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.slf4j.MDC;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Service;
import reactor.core.publisher.Mono;
import reactor.core.scheduler.Schedulers;
import reactor.rabbitmq.ConsumeOptions;
import reactor.rabbitmq.OutboundMessage;
import reactor.rabbitmq.Receiver;
import reactor.rabbitmq.Sender;
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
 *       → sendWithConfirm: IN_PROGRESS status event → document.status
 *       → Mono.fromCallable: download PDF + extract text  (boundedElastic thread)
 *       → Mono.zip: summarize || flashcards || quiz        (Netty I/O threads)
 *       → sendWithConfirm: DONE result → document.processed  (confirmed by broker)
 *     → ack on success
 *     → onErrorResume: sendWithConfirm FAILED result, nack to DLQ
 * </pre>
 *
 * <h3>Publisher Confirms (Step 6)</h3>
 * <p>All outbound publishes use {@link Sender#sendWithPublishConfirms}, which waits for
 * the broker's ack before the {@code Mono} completes. If the broker nacks or the
 * channel fails, the {@code Mono} errors and the pipeline's {@code retryWhen} kicks in.
 * This closes the data-loss window between publish and consumer ack:
 * the processing message is only acked <em>after</em> the result is durably received
 * by the broker.
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
    private final Sender           sender;
    private final PdfDownloader    pdfDownloader;
    private final PdfTextExtractor pdfTextExtractor;
    private final AiServiceClient  aiServiceClient;
    private final ObjectMapper     objectMapper;
    private final Retry            documentProcessingRetry;
    private final MeterRegistry    meterRegistry;

    @Value("${worker.consumer.qos:2}")
    private int qos;

    @Value("${worker.consumer.flatmap-concurrency:2}")
    private int flatmapConcurrency;

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
                        new ConsumeOptions().qos(qos))
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
                                    .doFinally(s -> {
                                        // Message exhausted all retries and is being routed to DLQ via nack.
                                        meterRegistry.counter("document.dlq.routed",
                                                "queue", RabbitMqConfig.DOCUMENT_PROCESSING_DLQ).increment();
                                        delivery.nack(false);
                                    }));
                }, flatmapConcurrency)
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
        return sendWithConfirm(
                        RabbitMqConfig.DOCUMENT_EXCHANGE,
                        RabbitMqConfig.DOCUMENT_STATUS_QUEUE,
                        DocumentStatusMessage.builder()
                                .correlationId(message.getCorrelationId())
                                .documentId(message.getDocumentId())
                                .status("IN_PROGRESS")
                                .build(),
                        "IN_PROGRESS status",
                        message.getDocumentId())

                .then(Mono.fromCallable(() -> {
                    // Runs on boundedElastic — safe for blocking PDFBox + HTTP download
                    MDC.put("correlationId", message.getCorrelationId());
                    MDC.put("documentId",    message.getDocumentId());
                    log.info("Starting document processing for documentId={}", message.getDocumentId());

                    byte[] pdfBytes = pdfDownloader.download(message.getFileUrl());
                    return pdfTextExtractor.extractText(pdfBytes);
                })
                .subscribeOn(Schedulers.boundedElastic()))

                // All three AI calls fire concurrently — total time = slowest call, not the sum.
                // document_id is passed to enable Redis idempotency in the ai-service (Step 5):
                // retries and recovery republishes return the cached result without calling Gemini.
                .flatMap(text -> Mono.zip(
                                aiServiceClient.summarize(text, message.getDocumentId(), message.getCorrelationId()),
                                aiServiceClient.generateFlashcards(text, message.getDocumentId(), message.getCorrelationId()),
                                aiServiceClient.generateQuiz(text, message.getDocumentId(), message.getCorrelationId()))
                        .map(tuple -> {
                            SummarizeResult  summarizeResult  = tuple.getT1();
                            FlashcardsResult flashcardsResult = tuple.getT2();
                            QuizResult       quizResult       = tuple.getT3();
                            return DocumentProcessedMessage.builder()
                                    .correlationId(message.getCorrelationId())
                                    .documentId(message.getDocumentId())
                                    .status("DONE")
                                    .summaryModel(summarizeResult.getModelUsed())
                                    .flashcardsModel(flashcardsResult.getModelUsed())
                                    .quizModel(quizResult.getModelUsed())
                                    .summary(summarizeResult.getSummary())
                                    .flashcards(flashcardsResult.getFlashcards())
                                    .quiz(quizResult.getQuestions())
                                    .build();
                        }))

                .flatMap(result -> sendWithConfirm(
                        RabbitMqConfig.DOCUMENT_EXCHANGE,
                        RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                        result,
                        "DONE result",
                        message.getDocumentId()))

                .doOnError(e -> {
                    String body = (e instanceof WebClientResponseException wcre)
                            ? " | body: " + wcre.getResponseBodyAsString() : "";
                    log.warn("Processing failed for documentId={}, will retry if attempts remain: {}{}",
                            message.getDocumentId(), e.getMessage(), body);
                    meterRegistry.counter("document.retry.count", "reason", "processing_failure").increment();
                })
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
        boolean isRateLimit = root instanceof RateLimitException;
        String errorCode = isRateLimit ? "RATE_LIMIT_EXCEEDED" : "AI_UNAVAILABLE";
        // Include the ai-service response body when available — WebClientResponseException
        // getMessage() only contains status + URL; the actual Python exception is in the body.
        String detail = (root instanceof WebClientResponseException wcre)
                ? " | body: " + wcre.getResponseBodyAsString()
                : "";
        log.error("All retries exhausted for documentId={}, publishing FAILED result (errorCode={}). Cause: {}{}",
                message.getDocumentId(), errorCode, root.getMessage(), detail);

        return sendWithConfirm(
                        RabbitMqConfig.DOCUMENT_EXCHANGE,
                        RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                        DocumentProcessedMessage.builder()
                                .correlationId(message.getCorrelationId())
                                .documentId(message.getDocumentId())
                                .status("FAILED")
                                .errorMessage(root.getMessage())
                                .errorCode(errorCode)
                                .build(),
                        "FAILED result",
                        message.getDocumentId())
                .doOnError(publishErr -> log.error(
                        "Could not publish FAILED result for documentId={}: {}",
                        message.getDocumentId(), publishErr.getMessage()));
    }

    /**
     * Publishes a single message using reactor-rabbitmq publisher confirms.
     *
     * <p>Waits for the broker ack before completing. A nack causes the returned
     * {@code Mono} to error, propagating to the pipeline's {@code retryWhen}.
     *
     * <p>This is the core of Step 6: no processing message is acked until the broker
     * has durably received the outbound result. Eliminates the data-loss window that
     * exists when using fire-and-forget {@code RabbitTemplate.convertAndSend}.
     *
     * @param label     human-readable description for logging (e.g. "DONE result")
     * @param documentId for logging
     */
    private Mono<Void> sendWithConfirm(String exchange, String routingKey,
                                       Object payload, String label, String documentId) {
        byte[] body;
        try {
            body = objectMapper.writeValueAsBytes(payload);
        } catch (Exception e) {
            return Mono.error(new IllegalStateException(
                    "Failed to serialise " + label + " for documentId=" + documentId, e));
        }

        AMQP.BasicProperties props = new AMQP.BasicProperties.Builder()
                .contentType("application/json")
                .deliveryMode(2)  // persistent — survives broker restart
                .build();

        OutboundMessage outbound = new OutboundMessage(exchange, routingKey, props, body);

        // sendWithPublishConfirms calls channel.confirmSelect() internally.
        // It returns a Flux<OutboundMessageResult> with one element per sent message.
        return sender.sendWithPublishConfirms(Mono.just(outbound))
                .next()  // exactly one confirm for one message
                .switchIfEmpty(Mono.error(new IllegalStateException(
                        "No confirm received for " + label + " documentId=" + documentId)))
                .flatMap(result -> {
                    if (result.isAck()) {
                        log.info("Published {} (confirmed) for documentId={}", label, documentId);
                        return Mono.<Void>empty();
                    } else {
                        log.error("Broker nacked {} publish for documentId={}", label, documentId);
                        meterRegistry.counter("rabbitmq.publish.confirm.failure",
                                "queue", routingKey).increment();
                        return Mono.error(new IllegalStateException(
                                "Broker nacked " + label + " for documentId=" + documentId));
                    }
                });
    }
}
