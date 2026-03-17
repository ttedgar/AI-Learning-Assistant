package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * A single AI-generated flashcard for a document.
 *
 * <p>Many flashcards per document. The frontend renders them as flippable cards
 * with prev/next navigation.
 */
@Entity
@Table(name = "flashcards")
@Getter
@Setter
@NoArgsConstructor
public class Flashcard {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false)
    private Document document;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String question;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String answer;

    public Flashcard(Document document, String question, String answer) {
        this.document = document;
        this.question = question;
        this.answer = answer;
    }
}
