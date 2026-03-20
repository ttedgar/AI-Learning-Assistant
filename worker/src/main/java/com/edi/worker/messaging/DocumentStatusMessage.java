package com.edi.worker.messaging;

import lombok.Builder;
import lombok.Value;

/**
 * Published by the worker to {@code document.status} as the very first step
 * of processing — before PDF download or AI calls begin.
 *
 * <p>The backend consumes this to transition the document PENDING → IN_PROGRESS
 * and set the processing lease, anchoring stale job recovery (Step 4).
 */
@Value
@Builder
public class DocumentStatusMessage {
    String correlationId;
    String documentId;
    /** "IN_PROGRESS" — extensible for future status signals. */
    String status;
}
