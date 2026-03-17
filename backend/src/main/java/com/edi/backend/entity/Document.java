package com.edi.backend.entity;

import jakarta.persistence.*;
import lombok.Getter;
import lombok.NoArgsConstructor;
import lombok.Setter;
import org.hibernate.annotations.CreationTimestamp;

import java.time.Instant;
import java.util.UUID;

/**
 * Represents a PDF document uploaded by a user.
 *
 * <p>Lifecycle: the backend sets status to {@link DocumentStatus#PENDING} on upload, publishes a
 * {@code document.processing} queue message, and then the worker drives status changes via the
 * {@code document.processed} queue (single-writer principle: only the backend writes to DB).
 *
 * <p>{@code fileUrl} points to the Supabase Storage object. On delete, the backend must remove
 * the file from storage before or after removing the DB row — handled in the service layer.
 */
@Entity
@Table(
        name = "documents",
        indexes = {
                @Index(name = "idx_documents_user_id", columnList = "user_id"),
                @Index(name = "idx_documents_status", columnList = "status")
        }
)
@Getter
@Setter
@NoArgsConstructor
public class Document {

    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    @Column(updatable = false, nullable = false)
    private UUID id;

    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(name = "file_url", nullable = false, length = 2048)
    private String fileUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentStatus status = DocumentStatus.PENDING;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Document other)) return false;
        return id != null && id.equals(other.id);
    }

    @Override
    public int hashCode() {
        return getClass().hashCode();
    }
}
