package com.edi.backend.entity;

/**
 * Processing lifecycle states for a document.
 *
 * <p>State transitions:
 * <pre>
 *   PENDING → PROCESSING → DONE
 *                       → FAILED
 * </pre>
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
