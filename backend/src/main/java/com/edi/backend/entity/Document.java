package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;

import java.time.Instant;
import java.util.UUID;

/**
 * A PDF document uploaded by a user.
 *
 * <p>{@code fileUrl} is the public Supabase Storage URL used by the worker to download the file
 * for processing. It is also presented to the frontend for the "Original" tab.
 *
 * <p>{@code status} tracks the async processing lifecycle (PENDING → PROCESSING → DONE|FAILED).
 * The status is updated by the {@code DocumentProcessedConsumer} when the worker publishes its
 * result to {@code document.processed}.
 *
 * <p>Production: add optimistic locking ({@code @Version}) to guard against concurrent status
 * updates if multiple consumer instances process the same document simultaneously.
 */
@Entity
@Table(name = "documents")
@Getter
@Setter
@NoArgsConstructor
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false)
    private String title;

    @Column(name = "file_url", nullable = false)
    private String fileUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    private DocumentStatus status = DocumentStatus.PENDING;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt = Instant.now();

    public Document(User user, String title, String fileUrl) {
        this.user = user;
        this.title = title;
        this.fileUrl = fileUrl;
    }
}
