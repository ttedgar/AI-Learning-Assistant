package com.edi.backend.messaging;

import com.edi.backend.TestcontainersConfiguration;
import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import com.edi.backend.entity.User;
import com.edi.backend.repository.DocumentRepository;
import com.edi.backend.repository.FlashcardRepository;
import com.edi.backend.repository.QuizQuestionRepository;
import com.edi.backend.repository.SummaryRepository;
import com.edi.backend.repository.UserRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * Integration test for {@link DocumentProcessedConsumer}.
 *
 * <p>Directly invokes the consumer's {@code consume()} method (simulating a message arrival)
 * against a real PostgreSQL database via Testcontainers. Verifies the single writer principle:
 * the consumer is the only path by which document results and status are written to the DB.
 *
 * <p>An end-to-end RabbitMQ publish/consume flow is covered in the broader system test.
 * Here we focus on the DB write correctness and status transitions.
 */
@Testcontainers(disabledWithoutDocker = true)
@Import(TestcontainersConfiguration.class)
@SpringBootTest
class DocumentProcessedConsumerIT {

    @Autowired private DocumentProcessedConsumer consumer;
    @Autowired private DocumentRepository documentRepository;
    @Autowired private UserRepository userRepository;
    @Autowired private SummaryRepository summaryRepository;
    @Autowired private FlashcardRepository flashcardRepository;
    @Autowired private QuizQuestionRepository quizQuestionRepository;

    private Document testDocument;

    @BeforeEach
    void setUp() {
        quizQuestionRepository.deleteAll();
        flashcardRepository.deleteAll();
        summaryRepository.deleteAll();
        documentRepository.deleteAll();
        userRepository.deleteAll();

        User user = userRepository.save(new User("consumer-test-user", "consumer@test.com"));
        testDocument = documentRepository.save(
                new Document(user, "Test Document", "https://storage/test.pdf"));
    }

    @Test
    void consume_doneMessage_savesResultsAndSetsStatusDone() {
        DocumentProcessedMessage message = new DocumentProcessedMessage(
                UUID.randomUUID().toString(),
                testDocument.getId().toString(),
                "DONE",
                null,
                "This is the AI-generated summary.",
                List.of(
                        new DocumentProcessedMessage.FlashcardResult("Q1?", "A1"),
                        new DocumentProcessedMessage.FlashcardResult("Q2?", "A2")),
                List.of(
                        new DocumentProcessedMessage.QuizResult(
                                "What is 2+2?", "MULTIPLE_CHOICE", "4",
                                List.of("1", "2", "3", "4"))));

        consumer.consume(message);

        Document updated = documentRepository.findById(testDocument.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(DocumentStatus.DONE);

        var summary = summaryRepository.findByDocumentId(testDocument.getId());
        assertThat(summary).isPresent();
        assertThat(summary.get().getContent()).isEqualTo("This is the AI-generated summary.");

        var flashcards = flashcardRepository.findByDocumentId(testDocument.getId());
        assertThat(flashcards).hasSize(2);
        assertThat(flashcards.get(0).getQuestion()).isEqualTo("Q1?");

        var quiz = quizQuestionRepository.findByDocumentId(testDocument.getId());
        assertThat(quiz).hasSize(1);
        assertThat(quiz.get(0).getCorrectAnswer()).isEqualTo("4");
        assertThat(quiz.get(0).getOptions()).containsExactly("1", "2", "3", "4");
    }

    @Test
    void consume_failedMessage_setsStatusFailedAndSavesNothing() {
        DocumentProcessedMessage message = new DocumentProcessedMessage(
                UUID.randomUUID().toString(),
                testDocument.getId().toString(),
                "FAILED",
                "ai-service timeout",
                null,
                null,
                null);

        consumer.consume(message);

        Document updated = documentRepository.findById(testDocument.getId()).orElseThrow();
        assertThat(updated.getStatus()).isEqualTo(DocumentStatus.FAILED);
        assertThat(summaryRepository.findByDocumentId(testDocument.getId())).isEmpty();
        assertThat(flashcardRepository.findByDocumentId(testDocument.getId())).isEmpty();
        assertThat(quizQuestionRepository.findByDocumentId(testDocument.getId())).isEmpty();
    }
}
