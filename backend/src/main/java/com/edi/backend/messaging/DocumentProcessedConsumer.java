package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import com.edi.backend.entity.*;
import com.edi.backend.repository.*;
import com.edi.backend.statemachine.DocumentStateMachine;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

/**
 * Consumes {@link DocumentProcessedMessage} from the {@code document.processed} queue.
 *
 * <p>This is the backend side of the single-writer principle: the worker publishes results
 * here; the backend is the only service that writes to the database.
 *
 * <h3>Happy path (status=DONE)</h3>
 * <ol>
 *   <li>Find the document by ID.</li>
 *   <li>Check current status via {@link DocumentStateMachine} — terminal states are acked silently.</li>
 *   <li>Save summary, flashcards, and quiz questions.</li>
 *   <li>Guarded UPDATE: {@code WHERE status IN ('PENDING','IN_PROGRESS')} → DONE.</li>
 * </ol>
 *
 * <h3>Failure path (status=FAILED)</h3>
 * <ol>
 *   <li>Find the document by ID.</li>
 *   <li>Check current status — terminal states acked silently.</li>
 *   <li>Guarded UPDATE: {@code WHERE status IN ('PENDING','IN_PROGRESS')} → FAILED.</li>
 * </ol>
 *
 * <h3>Idempotency (partial — Step 2 completes this)</h3>
 * <p>Terminal-state short-circuit (DONE, FAILED) prevents re-processing duplicate deliveries.
 * Step 2 will add full {@code SELECT FOR UPDATE} idempotency with a single transaction covering
 * the status check and all result inserts, preventing concurrent duplicate writes.
 *
 * <p>Production (Step 2): wrap everything in one transaction with {@code SELECT FOR UPDATE}
 * on the document row. Current implementation has a TOCTOU gap between the status check and
 * the result inserts under concurrent duplicate delivery.
 */
@Component
public class DocumentProcessedConsumer {

    private static final Logger log = LoggerFactory.getLogger(DocumentProcessedConsumer.class);

    private final DocumentRepository documentRepository;
    private final SummaryRepository summaryRepository;
    private final FlashcardRepository flashcardRepository;
    private final QuizQuestionRepository quizQuestionRepository;

    public DocumentProcessedConsumer(DocumentRepository documentRepository,
                                     SummaryRepository summaryRepository,
                                     FlashcardRepository flashcardRepository,
                                     QuizQuestionRepository quizQuestionRepository) {
        this.documentRepository = documentRepository;
        this.summaryRepository = summaryRepository;
        this.flashcardRepository = flashcardRepository;
        this.quizQuestionRepository = quizQuestionRepository;
    }

    @RabbitListener(queues = RabbitMqConfig.DOCUMENT_PROCESSED_QUEUE)
    @Transactional
    public void consume(DocumentProcessedMessage message) {
        MDC.put("correlationId", message.correlationId());
        MDC.put("documentId", message.documentId());

        try {
            log.info("Received document.processed: documentId={} status={}",
                    message.documentId(), message.status());

            UUID documentId = UUID.fromString(message.documentId());
            Document document = documentRepository.findById(documentId)
                    .orElseThrow(() -> {
                        log.error("Document not found for processed message: documentId={}", documentId);
                        // Ack and drop — retrying won't help if the document doesn't exist.
                        // Root cause: upload dual-write failure (DB rollback after RabbitMQ publish).
                        // Mitigated by transactional outbox (backlog).
                        return new IllegalStateException("Document not found: " + documentId);
                    });

            DocumentStatus incomingStatus = "DONE".equals(message.status())
                    ? DocumentStatus.DONE
                    : DocumentStatus.FAILED;

            // Terminal-state short-circuit: ack silently if already in a terminal state.
            // This handles duplicate deliveries (at-least-once) and out-of-order events.
            // Full SELECT FOR UPDATE idempotency is added in Step 2.
            if (DocumentStateMachine.isTerminal(document.getStatus())) {
                log.info("Document already in terminal state {} — acking silently: documentId={}",
                        document.getStatus(), documentId);
                return;
            }

            // Guarded transition: 1 row = success, 0 rows = guard failed (lost race or duplicate).
            int rowsAffected = documentRepository.guardedTransition(
                    documentId, document.getStatus(), incomingStatus);

            if (rowsAffected == 0) {
                log.warn("Guarded transition {} → {} affected 0 rows — acking silently: documentId={}",
                        document.getStatus(), incomingStatus, documentId);
                return;
            }

            if (incomingStatus == DocumentStatus.DONE) {
                saveResults(document, message);
                log.info("Document transition: {} → DONE documentId={}", document.getStatus(), documentId);
            } else {
                log.warn("Document transition: {} → FAILED documentId={} reason={}",
                        document.getStatus(), documentId, message.errorMessage());
            }

        } finally {
            MDC.remove("correlationId");
            MDC.remove("documentId");
        }
    }

    private void saveResults(Document document, DocumentProcessedMessage message) {
        if (message.summary() != null) {
            summaryRepository.save(new Summary(document, message.summary()));
        }

        if (message.flashcards() != null) {
            List<Flashcard> flashcards = message.flashcards().stream()
                    .map(f -> new Flashcard(document, f.question(), f.answer()))
                    .toList();
            flashcardRepository.saveAll(flashcards);
        }

        if (message.quiz() != null) {
            List<QuizQuestion> questions = message.quiz().stream()
                    .map(q -> new QuizQuestion(
                            document,
                            q.question(),
                            QuizType.valueOf(q.type()),
                            q.correctAnswer(),
                            q.options()))
                    .toList();
            quizQuestionRepository.saveAll(questions);
        }
    }
}
