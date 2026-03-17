package com.edi.backend.entity;

import com.edi.backend.util.StringListConverter;
import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.Collections;
import java.util.List;
import java.util.UUID;

/**
 * AI-generated quiz question derived from a document.
 *
 * <p>{@code type} drives rendering: MULTIPLE_CHOICE shows selectable options; OPEN_ENDED shows
 * a text input.
 *
 * <p>{@code options} is only populated for MULTIPLE_CHOICE questions and is stored as JSONB.
 * It is serialised/deserialised via {@link StringListConverter}.
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

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private Document document;

    @Column(nullable = false, columnDefinition = "text")
    private String question;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private QuestionType type;

    @Column(name = "correct_answer", nullable = false, columnDefinition = "text")
    private String correctAnswer;

    /**
     * Answer options for MULTIPLE_CHOICE questions. Empty list for OPEN_ENDED.
     * Stored as a JSON array in a PostgreSQL jsonb column.
     */
    @Convert(converter = StringListConverter.class)
    @Column(columnDefinition = "jsonb")
    private List<String> options = Collections.emptyList();

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
