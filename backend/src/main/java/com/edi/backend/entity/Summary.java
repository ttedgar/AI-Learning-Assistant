package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.util.UUID;

/**
 * AI-generated summary for a document.
 *
 * <p>One-to-one with {@link Document} (enforced by UNIQUE constraint on {@code document_id}).
 * Created by the backend when it consumes a successful {@code document.processed} message
 * from the worker. Content may be Markdown-formatted — the frontend renders it with a
 * markdown renderer.
 *
 * <p>For long documents the ai-service uses LangChain map-reduce summarization,
 * chunking the text before generating the final summary.
 */
@Entity
@Table(name = "summaries")
@Getter
@Setter
@NoArgsConstructor
public class Summary {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @OneToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "document_id", nullable = false, unique = true)
    private Document document;

    @Column(nullable = false, columnDefinition = "TEXT")
    private String content;

    public Summary(Document document, String content) {
        this.document = document;
        this.content = content;
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Summary other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
