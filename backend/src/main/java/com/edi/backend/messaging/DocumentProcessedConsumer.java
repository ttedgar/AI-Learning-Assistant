package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import com.edi.backend.entity.*;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.statemachine.DocumentStateMachine;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Consumes {@link DocumentProcessedMessage} from the {@code document.processed} queue.
 *
 * <p>This is the backend side of the single-writer principle: the worker publishes results
 * here; the backend is the only service that writes to the database.
 *
 * <h3>Idempotency — SELECT FOR UPDATE pattern</h3>
 * <p>At-least-once delivery guarantees the same message can arrive more than once. The
 * consumer uses a {@code SELECT FOR UPDATE} to serialise concurrent duplicate deliveries
 * at the row level:
 * <ol>
 *   <li>Consumer A acquires the row lock; Consumer B blocks.</li>
 *   <li>Consumer A checks status, transitions to DONE/FAILED, writes results, commits.</li>
 *   <li>Consumer B unblocks, reads the post-commit terminal status, and acks silently.</li>
 * </ol>
 *
 * <h3>INSERT idempotency — ON CONFLICT DO NOTHING</h3>
 * <p>All result inserts use native SQL with {@code ON CONFLICT DO NOTHING} as
 * defence-in-depth, making each insert unconditionally safe to replay:
 * <ul>
 *   <li>Summaries: {@code ON CONFLICT (document_id) DO NOTHING} — the DB-level
 *       {@code UNIQUE(document_id)} constraint is the hard boundary.</li>
 *   <li>Flashcards / quiz questions: {@code ON CONFLICT (id) DO NOTHING} — the PK
 *       is the conflict target; UUID collision is astronomically unlikely but the guard
 *       is free to add.</li>
 * </ul>
 *
 * <h3>Out-of-order strategy</h3>
 * <p>Accepting {@code PENDING → DONE} is intentional. If the result arrives before the
 * IN_PROGRESS status event (Step 3), the result is valid regardless. The late IN_PROGRESS
 * event is silently ignored (0 rows on the guarded UPDATE). See {@link DocumentStateMachine}.
 */
@Component
public class DocumentProcessedConsumer {

    private static final Logger log = LoggerFactory.getLogger(DocumentProcessedConsumer.class);

    private final DocumentRepository documentRepository;
    private final JdbcTemplate        jdbcTemplate;
    private final ObjectMapper         objectMapper;
    private final MeterRegistry        meterRegistry;

    public DocumentProcessedConsumer(DocumentRepository documentRepository,
                                     JdbcTemplate jdbcTemplate,
                                     ObjectMapper objectMapper,
                                     MeterRegistry meterRegistry) {
        this.documentRepository = documentRepository;
        this.jdbcTemplate       = jdbcTemplate;
        this.objectMapper       = objectMapper;
        this.meterRegistry      = meterRegistry;
    }

    @RabbitListener(queues = RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE)
    @Transactional
    public void consume(DocumentProcessedMessage message) {
        MDC.put("correlationId", message.correlationId());
        MDC.put("documentId",    message.documentId());

        try {
            log.info("Received document.processed: documentId={} status={}",
                    message.documentId(), message.status());

            UUID documentId = UUID.fromString(message.documentId());

            // SELECT FOR UPDATE — serialises concurrent duplicate deliveries.
            // The second consumer blocks here until the first commits; it then reads
            // the post-commit terminal status and takes the short-circuit path below.
            Document document = documentRepository.findByIdForUpdate(documentId)
                    .orElseThrow(() -> {
                        log.error("Document not found for processed message: documentId={}", documentId);
                        // Ack and drop — retrying won't help if the document doesn't exist.
                        // Root cause: upload dual-write failure (DB rollback after RabbitMQ publish).
                        // Mitigated by transactional outbox (backlog).
                        return new IllegalStateException("Document not found: " + documentId);
                    });

            // Terminal-state short-circuit (evaluated post-lock, so this is safe under concurrency).
            if (DocumentStateMachine.isTerminal(document.getStatus())) {
                log.info("Document already in terminal state {} — acking silently: documentId={}",
                        document.getStatus(), documentId);
                return;
            }

            DocumentStatus incomingStatus = "DONE".equals(message.status())
                    ? DocumentStatus.DONE
                    : DocumentStatus.FAILED;

            // Guarded transition: 1 row = success, 0 rows = guard failed (lost race or duplicate).
            int rowsAffected = documentRepository.guardedTransition(
                    documentId, document.getStatus(), incomingStatus);

            if (rowsAffected == 0) {
                log.warn("Guarded transition {} → {} affected 0 rows — acking silently: documentId={}",
                        document.getStatus(), incomingStatus, documentId);
                return;
            }

            log.info("Document transition: {} → {} documentId={}",
                    document.getStatus(), incomingStatus, documentId);

            Instant now = Instant.now();

            // document.e2e.duration — total time from upload to terminal state.
            // createdAt is always set (CreationTimestamp), so this is always recorded.
            Timer.builder("document.e2e.duration")
                    .tag("status", incomingStatus.name())
                    .register(meterRegistry)
                    .record(Duration.between(document.getCreatedAt(), now));

            // document.processing.duration — time from IN_PROGRESS to terminal state.
            // Null when the result arrived out-of-order before the status event (PENDING → DONE/FAILED).
            if (document.getProcessingStartedAt() != null) {
                Timer.builder("document.processing.duration")
                        .tag("status", incomingStatus.name())
                        .register(meterRegistry)
                        .record(Duration.between(document.getProcessingStartedAt(), now));
            }

            if (incomingStatus == DocumentStatus.DONE) {
                saveResults(documentId, message);
            }

            if (incomingStatus == DocumentStatus.FAILED && message.errorCode() != null) {
                // Store the machine-readable error code so the frontend can display a specific message.
                jdbcTemplate.update(
                        "UPDATE documents SET error_code = ? WHERE id = ?",
                        message.errorCode(), documentId);
            }

        } finally {
            MDC.remove("correlationId");
            MDC.remove("documentId");
        }
    }

    /**
     * Persists the AI-generated results using native SQL with {@code ON CONFLICT DO NOTHING}
     * on each insert. All three inserts run in the same transaction as the status transition.
     *
     * <p>Using {@link JdbcTemplate} directly gives us control over the exact SQL and avoids
     * Hibernate's entity lifecycle overhead for bulk inserts. JdbcTemplate automatically
     * participates in the active Spring-managed transaction.
     */
    private void saveResults(UUID documentId, DocumentProcessedMessage message) {
        if (message.summary() != null) {
            // UNIQUE(document_id) is the hard constraint; ON CONFLICT DO NOTHING is the
            // application-layer safety net so a duplicate doesn't throw an exception.
            jdbcTemplate.update("""
                    INSERT INTO summaries (id, document_id, content)
                    VALUES (gen_random_uuid(), ?, ?)
                    ON CONFLICT (document_id) DO NOTHING
                    """,
                    documentId, message.summary());
        }

        if (message.flashcards() != null && !message.flashcards().isEmpty()) {
            List<Object[]> rows = message.flashcards().stream()
                    .map(f -> new Object[]{UUID.randomUUID(), documentId, f.question(), f.answer()})
                    .toList();
            jdbcTemplate.batchUpdate("""
                    INSERT INTO flashcards (id, document_id, question, answer)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT (id) DO NOTHING
                    """, rows);
        }

        if (message.quiz() != null && !message.quiz().isEmpty()) {
            List<Object[]> rows = message.quiz().stream()
                    .map(q -> {
                        String optionsJson = toJson(q.options());
                        return new Object[]{
                                UUID.randomUUID(),
                                documentId,
                                q.question(),
                                q.type(),
                                q.correctAnswer(),
                                optionsJson
                        };
                    })
                    .toList();
            // Cast options to jsonb explicitly — JdbcTemplate binds String params as TEXT,
            // which PostgreSQL cannot implicitly coerce to JSONB in all driver configurations.
            jdbcTemplate.batchUpdate("""
                    INSERT INTO quiz_questions (id, document_id, question, type, correct_answer, options)
                    VALUES (?, ?, ?, ?, ?, ?::jsonb)
                    ON CONFLICT (id) DO NOTHING
                    """, rows);
        }
    }

    private String toJson(Object value) {
        if (value == null) return null;
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException e) {
            log.error("Failed to serialise value to JSON: {}", e.getMessage());
            return null;
        }
    }
}
