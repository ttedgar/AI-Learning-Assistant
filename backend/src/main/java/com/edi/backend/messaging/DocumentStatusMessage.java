package com.edi.backend.messaging;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Message published by the worker to {@code document.status} immediately upon
 * receiving a {@code document.processing} message — before any I/O work begins.
 *
 * <p>The backend consumes this to transition the document from PENDING to IN_PROGRESS
 * and stamp {@code processingStartedAt} / {@code leaseUntil}, enabling stale job
 * recovery (Step 4).
 *
 * <p>Out-of-order delivery: if this message arrives after {@code document.processed}
 * (i.e. after the document is already DONE or FAILED), the backend's guarded UPDATE
 * returns 0 rows and acks silently — the late status event is a no-op.
 */
public record DocumentStatusMessage(
        String correlationId,
        String documentId,
        /** Expected values: "IN_PROGRESS". Extensible for future status events. */
        String status
) {
    @JsonCreator
    public DocumentStatusMessage(
            @JsonProperty("correlationId") String correlationId,
            @JsonProperty("documentId")    String documentId,
            @JsonProperty("status")        String status) {
        this.correlationId = correlationId;
        this.documentId    = documentId;
        this.status        = status;
    }
}
