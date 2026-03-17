package com.edi.backend.entity;

/**
 * Lifecycle of a document through the AI processing pipeline.
 *
 * <p>State transitions:
 * <pre>
 *   PENDING → PROCESSING → DONE
 *                       ↘ FAILED
 * </pre>
 *
 * <p>PENDING: uploaded to Supabase Storage, published to document.processing queue, awaiting worker pickup.
 * <p>PROCESSING: worker has consumed the message and is calling the ai-service.
 * <p>DONE: worker published a successful document.processed message; results are saved in DB.
 * <p>FAILED: worker exhausted retries; error message available; message landed in DLQ.
 *
 * <p>Stored as TEXT in PostgreSQL with a CHECK constraint (see 001-initial-schema.sql).
 * Production: add a DB index on (user_id, status) to support efficient dashboard queries.
 */
public enum DocumentStatus {
    PENDING,
    PROCESSING,
    DONE,
    FAILED
}
