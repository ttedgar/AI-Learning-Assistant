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
 * <p>Lifecycle: backend sets status to {@link DocumentStatus#PENDING} on upload and publishes a
 * {@code document.processing} queue message. The worker drives state changes via the
 * {@code document.status} (→ IN_PROGRESS) and {@code document.processed} (→ DONE/FAILED) queues.
 * The backend is the only service that writes to the database (single-writer principle).
 *
 * <p>All state transitions are guarded. See {@link com.edi.backend.statemachine.DocumentStateMachine}
 * for the full allowed/rejected transition table.
 *
 * <p>{@code processingStartedAt}: set when the document transitions to IN_PROGRESS. Supports
 * {@code document.processing.duration} histogram (IN_PROGRESS timestamp → terminal state).
 *
 * <p>{@code leaseUntil}: the absolute expiry of the current processing claim. The stale recovery
 * job (Step 4) resets IN_PROGRESS documents whose {@code leaseUntil < NOW()} back to PENDING.
 * Lease duration is 20 minutes (conservative; max actual processing time is ~5 minutes under retries).
 *
 * <p>{@code fileUrl} points to the Supabase Storage object. On delete, the backend removes
 * the file from storage — handled in the service layer.
 *
 * <p>Production: add optimistic locking ({@code @Version}) to guard against concurrent status
 * updates if multiple consumer instances process the same document simultaneously. The current
 * approach uses DB-level guarded UPDATEs (WHERE status = ?) which serialise at the SQL layer.
 */
@Entity
@Table(
        name = "documents",
        indexes = {
                @Index(name = "idx_documents_user_id",            columnList = "user_id"),
                @Index(name = "idx_documents_status",             columnList = "status"),
                @Index(name = "idx_documents_status_lease_until", columnList = "status,lease_until"),
                @Index(name = "idx_documents_status_created_at",  columnList = "status,created_at")
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

    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "user_id", nullable = false)
    private User user;

    @Column(nullable = false, length = 500)
    private String title;

    @Column(name = "file_url", nullable = false, length = 2048)
    private String fileUrl;

    @Enumerated(EnumType.STRING)
    @Column(nullable = false, length = 20)
    private DocumentStatus status = DocumentStatus.PENDING;

    /**
     * Set when the document transitions PENDING → IN_PROGRESS via the {@code document.status} consumer.
     * Used to compute {@code document.processing.duration} metric (Step 7).
     * Null for PENDING documents and for documents that skipped IN_PROGRESS (out-of-order DONE/FAILED).
     */
    @Column(name = "processing_started_at")
    private Instant processingStartedAt;

    /**
     * Absolute expiry of the current processing claim. Set alongside {@code processingStartedAt}
     * when transitioning to IN_PROGRESS. The stale job recovery job (Step 4) issues:
     * {@code WHERE status='IN_PROGRESS' AND lease_until < NOW()}.
     * Null for documents not yet in IN_PROGRESS.
     */
    @Column(name = "lease_until")
    private Instant leaseUntil;

    @CreationTimestamp
    @Column(name = "created_at", updatable = false, nullable = false)
    private Instant createdAt;

    public Document(User user, String title, String fileUrl) {
        this.user = user;
        this.title = title;
        this.fileUrl = fileUrl;
    }

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
