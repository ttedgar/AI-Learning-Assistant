package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.List;
import java.util.UUID;

/**
 * AI-generated quiz question derived from a document.
 *
 * <p>{@code type} drives rendering: MULTIPLE_CHOICE shows selectable options; OPEN_ENDED shows
 * a text input.
 *
 * <p>{@code options} is stored as JSONB (see 001-initial-schema.sql) and is non-null only for
 * {@link QuizType#MULTIPLE_CHOICE} questions. Using JSONB avoids a separate options table at
 * this scale; a global-bank deployment would normalise into {@code quiz_question_options}.
 *
 * <p>Hibernate maps the JSONB column via {@code columnDefinition = "jsonb"} and relies on the
 * PostgreSQL JDBC driver's built-in JSON handling with {@code @Convert} for List serialisation.
 * Production: use the {@code hypersistence-utils} library for first-class JSONB support.
 */
@Entity
@Table(
        name = "quiz_questions",
        indexes = @Index(name = "idx_quiz_questions_document_id", columnList = "document_id")
)
@Getter
@Setter
@NoArgsConstructor
public class QuizQuestion {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private Document document;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private QuizType type;

    @Column(name = "correct_answer", nullable = false, columnDefinition = "TEXT")
    private String correctAnswer;

    // JSONB column — null for OPEN_ENDED; list of option strings for MULTIPLE_CHOICE.
    // Production: hypersistence-utils JsonType gives first-class JSONB support without a custom converter.
    @Column(columnDefinition = "jsonb")
    @Convert(converter = StringListJsonConverter.class)
    private List<String> options;

    public QuizQuestion(Document document, String question, QuizType type,
                        String correctAnswer, List<String> options) {
        this.document = document;
        this.question = question;
        this.type = type;
        this.correctAnswer = correctAnswer;
        this.options = options;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof QuizQuestion other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
