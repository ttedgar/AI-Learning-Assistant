package com.edi.backend.statemachine;

import com.edi.backend.entity.DocumentStatus;

import java.util.EnumMap;
import java.util.Map;
import java.util.Set;

/**
 * Defines and enforces the allowed state transitions for a document through the processing pipeline.
 *
 * <h3>Allowed transitions</h3>
 * <pre>
 * From          To            Trigger                                 Guard
 * ──────────────────────────────────────────────────────────────────────────────────
 * PENDING     → IN_PROGRESS   Worker publishes status event           WHERE status='PENDING'
 * PENDING     → DONE          Result arrives before status event      WHERE status='PENDING'
 * PENDING     → FAILED        Failure arrives before status event     WHERE status='PENDING'
 * IN_PROGRESS → DONE          Backend processes successful result     WHERE status='IN_PROGRESS'
 * IN_PROGRESS → FAILED        Backend processes failure result        WHERE status='IN_PROGRESS'
 * IN_PROGRESS → PENDING       Stale recovery (lease expired)          WHERE status='IN_PROGRESS' AND lease_until < NOW()
 * FAILED      → PENDING       Admin manual reprocess                  WHERE status='FAILED'
 * </pre>
 *
 * <h3>Rejected / ignored transitions</h3>
 * <pre>
 * From          Incoming event   Action                 Reason
 * ──────────────────────────────────────────────────────────────────────────────────
 * DONE        → any             Ack silently, no write  Terminal state — duplicate delivery
 * FAILED      → any (non-admin) Ack silently, no write  Terminal state — duplicate delivery
 * IN_PROGRESS → IN_PROGRESS     0 rows affected, ack    Duplicate status event (idempotent guard)
 * DONE        → IN_PROGRESS     0 rows affected, ack    Out-of-order; already terminal
 * </pre>
 *
 * <h3>Out-of-order strategy</h3>
 * <p>PENDING → DONE is intentional. If the result arrives before the IN_PROGRESS status event
 * (queue reordering or delayed status publish), accepting the result is correct — the data is valid
 * regardless of intermediate state. Rejecting it would cause indefinite requeueing until retry
 * budget is exhausted, then DLQ. The late IN_PROGRESS event is silently ignored (0 rows affected
 * by the guarded UPDATE). No correctness issue.
 *
 * <h3>Guarded UPDATE pattern</h3>
 * <p>All state transitions use a guarded SQL UPDATE:
 * <pre>
 *   UPDATE documents SET status = :to WHERE id = :id AND status = :expectedFrom
 * </pre>
 * <p>This makes each transition atomic and idempotent. If 0 rows are affected, the guard failed —
 * the document was in an unexpected state (duplicate event, race condition, or out-of-order delivery).
 * The caller acks the message silently. See {@link com.edi.backend.repository.DocumentRepository}.
 *
 * <p>Production: This class is a pure data definition — no Spring dependencies, no I/O.
 * Unit-testable without any container. At global-bank scale, this would be backed by a persistent
 * state machine store (e.g. Spring State Machine with a JDBC persister) for full audit trail.
 */
public final class DocumentStateMachine {

    /**
     * Allowed target states for each source state.
     * DONE and FAILED have empty sets — they are terminal and accept no further transitions.
     */
    private static final Map<DocumentStatus, Set<DocumentStatus>> ALLOWED_TRANSITIONS;

    static {
        ALLOWED_TRANSITIONS = new EnumMap<>(DocumentStatus.class);
        ALLOWED_TRANSITIONS.put(DocumentStatus.PENDING,      Set.of(DocumentStatus.IN_PROGRESS,
                                                                     DocumentStatus.DONE,
                                                                     DocumentStatus.FAILED));
        ALLOWED_TRANSITIONS.put(DocumentStatus.IN_PROGRESS,  Set.of(DocumentStatus.DONE,
                                                                     DocumentStatus.FAILED,
                                                                     DocumentStatus.PENDING));
        ALLOWED_TRANSITIONS.put(DocumentStatus.DONE,         Set.of());
        ALLOWED_TRANSITIONS.put(DocumentStatus.FAILED,       Set.of(DocumentStatus.PENDING));
    }

    private DocumentStateMachine() {}

    /**
     * Returns {@code true} if transitioning from {@code from} to {@code to} is permitted
     * by the state machine. Does not check DB-level guards (e.g. lease expiry) — those
     * are enforced in the repository guarded UPDATE.
     */
    public static boolean isAllowed(DocumentStatus from, DocumentStatus to) {
        return ALLOWED_TRANSITIONS.getOrDefault(from, Set.of()).contains(to);
    }

    /**
     * Returns {@code true} if {@code status} is a terminal state (DONE or FAILED).
     * Terminal states accept no further transitions (except FAILED → PENDING via admin reprocess).
     */
    public static boolean isTerminal(DocumentStatus status) {
        return status == DocumentStatus.DONE || status == DocumentStatus.FAILED;
    }

    /**
     * Asserts that transitioning from {@code from} to {@code to} is permitted.
     *
     * @throws InvalidStateTransitionException if the transition is not in the allowed set
     */
    public static void assertAllowed(DocumentStatus from, DocumentStatus to) {
        if (!isAllowed(from, to)) {
            throw new InvalidStateTransitionException(from, to);
        }
    }
}
