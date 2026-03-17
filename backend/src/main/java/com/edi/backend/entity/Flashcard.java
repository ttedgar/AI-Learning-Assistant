package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * AI-generated flashcard (question + answer) derived from a document.
 *
 * <p>A document may have zero or many flashcards. All flashcards for a document are deleted
 * via ON DELETE CASCADE when the document is deleted (enforced at DB level).
 */
@Entity
@Table(
        name = "flashcards",
        indexes = @Index(name = "idx_flashcards_document_id", columnList = "document_id")
)
@Getter
@Setter
@NoArgsConstructor
public class Flashcard {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "document_id", nullable = false)
    private Document document;

    @Column(nullable = false, columnDefinition = "text")
    private String question;

    @Column(nullable = false, columnDefinition = "text")
    private String answer;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Flashcard other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
