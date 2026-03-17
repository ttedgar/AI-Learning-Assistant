package com.edi.worker.recovery;

import com.edi.worker.config.RabbitMqConfig;
import com.edi.worker.messaging.DocumentProcessedMessage;
import com.edi.worker.messaging.DocumentProcessingMessage;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.slf4j.MDC;
import org.springframework.amqp.AmqpRejectAndDontRequeueException;
import org.springframework.amqp.core.Message;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.retry.MessageRecoverer;
import org.springframework.stereotype.Component;

/**
 * Invoked by Spring AMQP after all retry attempts are exhausted.
 *
 * <p>Two things happen:
 * <ol>
 *   <li>A {@code FAILED} result is published to {@code document.processed} so the
 *       backend can update the document status in the database.
 *   <li>{@link AmqpRejectAndDontRequeueException} is thrown so the original message
 *       is nack'd and routed to {@code document.processing.dlq} via the dead-letter
 *       exchange configured on the queue.
 * </ol>
 *
 * <p>Production note: the DLQ would be monitored (Datadog, PagerDuty) and ops
 * would replay messages after the root cause is fixed.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class DocumentProcessingRecoverer implements MessageRecoverer {

    private final RabbitTemplate rabbitTemplate;
    private final ObjectMapper objectMapper;

    @Override
    public void recover(Message message, Throwable cause) {
        String correlationId = "unknown";
        String documentId    = "unknown";

        try {
            DocumentProcessingMessage original =
                    objectMapper.readValue(message.getBody(), DocumentProcessingMessage.class);
            correlationId = original.getCorrelationId();
            documentId    = original.getDocumentId();
        } catch (Exception e) {
            log.warn("Could not deserialise failed message for recovery metadata", e);
        }

        MDC.put("correlationId", correlationId);
        MDC.put("documentId", documentId);

        log.error("All retries exhausted for document {}. Publishing FAILED result. Cause: {}",
                documentId, cause.getMessage());

        try {
            DocumentProcessedMessage failedResult = DocumentProcessedMessage.builder()
                    .correlationId(correlationId)
                    .documentId(documentId)
                    .status("FAILED")
                    .errorMessage(cause.getMessage())
                    .build();

            rabbitTemplate.convertAndSend(
                    RabbitMqConfig.DOCUMENT_EXCHANGE,
                    RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE,
                    failedResult);

            log.info("Published FAILED result to document.processed");
        } catch (Exception publishException) {
            // Do not swallow the original failure — still route to DLQ below
            log.error("Failed to publish FAILED result to document.processed", publishException);
        } finally {
            MDC.clear();
        }

        // Nack without requeue → RabbitMQ routes to DLQ via dead-letter exchange
        throw new AmqpRejectAndDontRequeueException(
                "Processing failed after retries for document " + documentId, cause);
    }
}
