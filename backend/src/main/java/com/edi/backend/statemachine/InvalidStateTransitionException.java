package com.edi.backend.statemachine;

import com.edi.backend.entity.DocumentStatus;

/**
 * Thrown when a state transition that is not in the allowed set is attempted.
 *
 * <p>This should only be thrown by application-layer code that explicitly calls
 * {@link DocumentStateMachine#assertAllowed}. Consumer code that uses guarded DB UPDATEs
 * (WHERE status = expectedFrom) does not throw this exception — it simply observes 0 rows
 * affected and acks silently.
 *
 * <p>Mapped to HTTP 409 Conflict by {@link com.edi.backend.exception.GlobalExceptionHandler}.
 */
public class InvalidStateTransitionException extends RuntimeException {

    private final DocumentStatus from;
    private final DocumentStatus to;

    public InvalidStateTransitionException(DocumentStatus from, DocumentStatus to) {
        super(String.format("State transition %s → %s is not permitted", from, to));
        this.from = from;
        this.to = to;
    }

    public DocumentStatus getFrom() {
        return from;
    }

    public DocumentStatus getTo() {
        return to;
    }
}
