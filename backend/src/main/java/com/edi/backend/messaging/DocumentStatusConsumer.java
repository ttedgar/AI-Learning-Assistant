package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import com.edi.backend.repository.DocumentRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

/**
 * Consumes {@link DocumentStatusMessage} from the {@code document.status} queue.
 *
 * <p>The worker publishes an IN_PROGRESS event as the very first step of processing
 * (before PDF download or AI calls). This consumer transitions the document from
 * PENDING to IN_PROGRESS and stamps both {@code processingStartedAt} and
 * {@code leaseUntil}, which are the anchors for stale job recovery (Step 4).
 *
 * <h3>Idempotency</h3>
 * <p>{@link DocumentRepository#transitionToInProgress} is a guarded UPDATE with
 * {@code WHERE status = 'PENDING'}. Duplicate deliveries return 0 rows and are
 * silently acked. Out-of-order events (status arrives after the DONE/FAILED result)
 * are also silently acked — the guard fires because the document is no longer PENDING.
 *
 * <h3>Lease duration</h3>
 * <p>Five minutes. The worker's typical end-to-end time is under 30 s, so 5 min
 * gives a generous margin while keeping the stale detection window small enough
 * to matter. Step 4's recovery job checks leases every 1 minute.
 *
 * <p>Production: make this configurable via {@code @Value("${app.lease.duration:5m}")}.
 */
@Component
public class DocumentStatusConsumer {

    private static final Logger log = LoggerFactory.getLogger(DocumentStatusConsumer.class);

    /**
     * Lease duration granted to a worker that claims a document.
     * Recovery job (Step 4) resets documents whose lease has expired.
     */
    static final Duration LEASE_DURATION = Duration.ofMinutes(5);

    private final DocumentRepository documentRepository;

    public DocumentStatusConsumer(DocumentRepository documentRepository) {
        this.documentRepository = documentRepository;
    }

    @RabbitListener(queues = RabbitMqConfig.DOCUMENT_STATUS_QUEUE)
    @Transactional
    public void consume(DocumentStatusMessage message) {
        MDC.put("correlationId", message.correlationId());
        MDC.put("documentId",    message.documentId());

        try {
            log.info("Received document.status: documentId={} status={}",
                    message.documentId(), message.status());

            UUID documentId = UUID.fromString(message.documentId());
            Instant now        = Instant.now();
            Instant leaseUntil = now.plus(LEASE_DURATION);

            // Guarded transition: WHERE status = 'PENDING'.
            // 0 rows = document is not PENDING (duplicate, out-of-order, or already terminal).
            int rows = documentRepository.transitionToInProgress(documentId, now, leaseUntil);

            if (rows == 0) {
                log.warn("PENDING→IN_PROGRESS guard failed (0 rows) — acking silently: documentId={}",
                        documentId);
            } else {
                log.info("Document transitioned PENDING→IN_PROGRESS leaseUntil={}: documentId={}",
                        leaseUntil, documentId);
            }

        } finally {
            MDC.remove("correlationId");
            MDC.remove("documentId");
        }
    }
}
