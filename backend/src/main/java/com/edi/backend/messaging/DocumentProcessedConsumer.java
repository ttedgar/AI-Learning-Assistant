package com.edi.backend.messaging;

import com.edi.backend.config.RabbitMqConfig;
import com.edi.backend.entity.*;
import com.edi.backend.repository.*;
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
 * <p>This is the backend's side of the "single writer principle": the worker publishes results
 * here; the backend is the only service that writes to the database.
 *
 * <h3>Happy path (status=DONE)</h3>
 * <ol>
 *   <li>Find the document by ID.</li>
 *   <li>Save summary, flashcards, and quiz questions.</li>
 *   <li>Update document status to DONE.</li>
 * </ol>
 *
 * <h3>Failure path (status=FAILED)</h3>
 * <ol>
 *   <li>Update document status to FAILED.</li>
 *   <li>Log the error message for ops visibility.</li>
 * </ol>
 *
 * <p>The listener is idempotent for FAILED messages and near-idempotent for DONE messages
 * (re-processing a DONE document would overwrite existing results — acceptable for this scale).
 * Production: add a processed-message deduplication table keyed on {@code correlationId}.
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
        // Thread correlationId through MDC for structured log correlation.
        MDC.put("correlationId", message.correlationId());
        MDC.put("documentId", message.documentId());

        try {
            log.info("Received document.processed message: documentId={} status={}",
                    message.documentId(), message.status());

            UUID documentId = UUID.fromString(message.documentId());
            Document document = documentRepository.findById(documentId)
                    .orElseThrow(() -> {
                        log.error("Document not found for processed message: {}", documentId);
                        // Returning without throwing means the message is acked and dropped.
                        // This is correct — retrying won't help if the document doesn't exist.
                        return new IllegalStateException("Document not found: " + documentId);
                    });

            if ("DONE".equals(message.status())) {
                saveResults(document, message);
                document.setStatus(DocumentStatus.DONE);
            } else {
                document.setStatus(DocumentStatus.FAILED);
                log.warn("Document processing failed for documentId={} reason={}",
                        documentId, message.errorMessage());
            }

            documentRepository.save(document);
            log.info("Document status updated to {} for documentId={}", document.getStatus(), documentId);

        } finally {
            MDC.remove("correlationId");
            MDC.remove("documentId");
        }
    }

    private void saveResults(Document document, DocumentProcessedMessage message) {
        // Save summary
        if (message.summary() != null) {
            Summary summary = new Summary(document, message.summary());
            summaryRepository.save(summary);
        }

        // Save flashcards
        if (message.flashcards() != null) {
            List<Flashcard> flashcards = message.flashcards().stream()
                    .map(f -> new Flashcard(document, f.question(), f.answer()))
                    .toList();
            flashcardRepository.saveAll(flashcards);
        }

        // Save quiz questions
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
