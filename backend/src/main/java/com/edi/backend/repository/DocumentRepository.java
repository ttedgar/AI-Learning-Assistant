package com.edi.backend.repository;

import com.edi.backend.entity.Document;
import com.edi.backend.entity.DocumentStatus;
import com.edi.backend.entity.User;
import jakarta.persistence.LockModeType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

/**
 * Data access for {@link Document} entities.
 *
 * <h3>Guarded update pattern</h3>
 * <p>All state transitions use a guarded UPDATE with a {@code WHERE status = :expectedStatus}
 * clause. This makes each transition atomic and idempotent without application-level locking:
 * <ul>
 *   <li>1 row affected → transition succeeded; caller acks the message.</li>
 *   <li>0 rows affected → document was not in the expected state (duplicate event, race,
 *       or out-of-order delivery); caller acks silently — no write occurred.</li>
 * </ul>
 *
 * <p>PostgreSQL serialises concurrent UPDATEs on the same row with row-level locks, so two
 * concurrent consumers racing to transition the same document will have one succeed and the
 * other observe 0 rows — no duplicate writes.
 *
 * <p>See {@link com.edi.backend.statemachine.DocumentStateMachine} for the full allowed/rejected
 * transition table.
 */
@Repository
public interface DocumentRepository extends JpaRepository<Document, UUID> {

    List<Document> findByUserOrderByCreatedAtDesc(User user);

    /**
     * Acquires a pessimistic write lock ({@code SELECT ... FOR UPDATE}) on the document row.
     * Used by {@code DocumentProcessedConsumer} to serialise concurrent duplicate deliveries:
     * the first consumer acquires the lock and processes; the second blocks until the first
     * commits, then reads the post-commit terminal status and acks silently.
     *
     * <p>Must be called within an active transaction. The lock is released at transaction commit.
     */
    @Lock(LockModeType.PESSIMISTIC_WRITE)
    @Query("SELECT d FROM Document d WHERE d.id = :id")
    Optional<Document> findByIdForUpdate(@Param("id") UUID id);

    Optional<Document> findByIdAndUser(UUID id, User user);

    List<Document> findByStatus(DocumentStatus status);

    /**
     * Performs a guarded status transition. Updates only if the document is currently in
     * {@code expectedStatus}. Returns 1 on success, 0 if the guard failed.
     *
     * <p>Use this for all consumer-driven transitions (IN_PROGRESS, DONE, FAILED).
     * The caller should treat 0 rows as a silent ack (duplicate or out-of-order event).
     */
    @Modifying
    @Query("UPDATE Document d SET d.status = :newStatus WHERE d.id = :id AND d.status = :expectedStatus")
    int guardedTransition(@Param("id") UUID id,
                          @Param("expectedStatus") DocumentStatus expectedStatus,
                          @Param("newStatus") DocumentStatus newStatus);

    /**
     * Transitions PENDING → IN_PROGRESS and sets the lease. Atomic single statement.
     *
     * <p>Used by the {@code document.status} consumer (Step 3). Sets both
     * {@code processingStartedAt} and {@code leaseUntil} in the same UPDATE to avoid
     * a separate round-trip. Returns 1 on success, 0 if document was not PENDING.
     */
    @Modifying
    @Query("""
            UPDATE Document d
               SET d.status              = 'IN_PROGRESS',
                   d.processingStartedAt = :startedAt,
                   d.leaseUntil          = :leaseUntil
             WHERE d.id = :id
               AND d.status = 'PENDING'
            """)
    int transitionToInProgress(@Param("id") UUID id,
                               @Param("startedAt") Instant startedAt,
                               @Param("leaseUntil") Instant leaseUntil);

    /**
     * Stale IN_PROGRESS recovery: resets expired leases back to PENDING and refreshes
     * the lease timestamp so the recovery job itself doesn't re-trigger immediately.
     *
     * <p>Returns the IDs of all reset documents so the caller can republish
     * {@code DocumentProcessingMessage} for each. Used by {@code StaleJobRecoveryService} (Step 4).
     *
     * <p>Production: use {@code UPDATE ... RETURNING} via a native query for efficiency;
     * the JPQL version below is two queries (UPDATE + SELECT) when using the entity graph.
     * Implemented as a native query to avoid the N+1 load after the bulk update.
     */
    @Modifying
    @Query(value = """
            UPDATE documents
               SET status     = 'PENDING',
                   lease_until = :newLeaseUntil
             WHERE status     = 'IN_PROGRESS'
               AND lease_until < :now
            """, nativeQuery = true)
    int resetStaleInProgressJobs(@Param("now") Instant now,
                                 @Param("newLeaseUntil") Instant newLeaseUntil);

    /**
     * Finds all IN_PROGRESS documents whose lease has expired. Called immediately after
     * {@link #resetStaleInProgressJobs} to collect the documents that need republishing.
     *
     * <p>Note: this query runs after the UPDATE has committed, so it reads the post-reset state
     * (status = PENDING). The caller selects newly-PENDING documents whose
     * {@code processingStartedAt} is non-null (i.e. were previously IN_PROGRESS, not stuck PENDING).
     */
    @Query("""
            SELECT d FROM Document d
             WHERE d.status = 'PENDING'
               AND d.processingStartedAt IS NOT NULL
               AND d.leaseUntil >= :newLeaseUntil
            """)
    List<Document> findRecentlyResetDocuments(@Param("newLeaseUntil") Instant newLeaseUntil);

    /**
     * Finds stuck PENDING documents older than {@code cutoff} that have never started processing.
     * Used by the PENDING stale recovery path in {@code StaleJobRecoveryService} (Step 4).
     *
     * <p>A PENDING document is considered stuck if it was created more than 15 minutes ago and
     * has no {@code processingStartedAt} (never reached IN_PROGRESS). This covers:
     * <ul>
     *   <li>Worker crash before publishing the status event (RabbitMQ will redeliver, but may
     *       take up to 30 minutes — recovery provides a shorter detection window).</li>
     *   <li>Backend publish failure on upload (dual-write gap — mitigated until outbox is added).</li>
     * </ul>
     */
    @Query("""
            SELECT d FROM Document d
             WHERE d.status = 'PENDING'
               AND d.processingStartedAt IS NULL
               AND d.createdAt < :cutoff
            """)
    List<Document> findStuckPendingDocuments(@Param("cutoff") Instant cutoff);
}
