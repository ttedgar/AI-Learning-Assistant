package com.edi.backend.entity;

/**
 * Lifecycle states of a document through the AI processing pipeline.
 *
 * <p>Allowed transitions (see {@link com.edi.backend.statemachine.DocumentStateMachine}):
 * <pre>
 *   PENDING → IN_PROGRESS → DONE
 *           ↘              ↘ FAILED
 *             DONE (out-of-order — result arrives before status event)
 *             FAILED (out-of-order)
 *
 *   IN_PROGRESS → PENDING (stale recovery only — lease expired)
 *   FAILED      → PENDING (admin reprocess only)
 * </pre>
 *
 * <p>PENDING:     Uploaded; {@code document.processing} message published; awaiting worker pickup.
 * <p>IN_PROGRESS: Worker picked up the job; {@code document.status} event received; lease active.
 * <p>DONE:        Results persisted; terminal state.
 * <p>FAILED:      All retries exhausted; terminal state.
 *
 * <p>Stored as TEXT in PostgreSQL with a CHECK constraint (see 002-state-machine-columns.sql).
 */
public enum DocumentStatus {
    PENDING,
    IN_PROGRESS,
    DONE,
    FAILED
}
