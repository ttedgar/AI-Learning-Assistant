--liquibase formatted sql

-- changeset edi:005-add-error-code
-- comment: Adds error_code column to documents to store the machine-readable failure reason
--          when a document transitions to FAILED status. Used by the frontend to display
--          specific messages (e.g. "Rate limit exceeded" vs generic "Processing failed").
--          Known values: RATE_LIMIT_EXCEEDED (Gemini 429), AI_UNAVAILABLE (other AI errors).
--          Nullable — only set for FAILED documents.
ALTER TABLE documents ADD COLUMN error_code VARCHAR(50);
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS error_code;
