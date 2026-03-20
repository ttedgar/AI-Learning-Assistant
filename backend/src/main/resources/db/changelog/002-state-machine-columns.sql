--liquibase formatted sql

-- changeset edi:002-rename-processing-status
-- comment: Renames the PROCESSING status to IN_PROGRESS for alignment with the state machine spec.
--          The CHECK constraint is dropped and recreated with the corrected value set.
--          Any existing PROCESSING rows are migrated atomically within this changeset.
--          Production: run with a maintenance window or ensure zero PROCESSING rows before applying.
ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_status_check;

UPDATE documents SET status = 'IN_PROGRESS' WHERE status = 'PROCESSING';

ALTER TABLE documents
    ADD CONSTRAINT document_status_check
        CHECK (status IN ('PENDING', 'IN_PROGRESS', 'DONE', 'FAILED'));
-- rollback ALTER TABLE documents DROP CONSTRAINT IF EXISTS document_status_check;
-- rollback UPDATE documents SET status = 'PROCESSING' WHERE status = 'IN_PROGRESS';
-- rollback ALTER TABLE documents ADD CONSTRAINT document_status_check CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED'));

-- changeset edi:003-add-lease-columns
-- comment: Adds processing_started_at and lease_until to support the IN_PROGRESS state and stale job recovery.
--          processing_started_at: set when the document transitions PENDING → IN_PROGRESS (via document.status consumer in Step 3).
--          lease_until: absolute expiry of the current processing claim. The stale recovery job resets
--          IN_PROGRESS documents whose lease_until < NOW() back to PENDING and republishes the message.
--          Both columns are nullable — PENDING documents have no active lease yet.
ALTER TABLE documents ADD COLUMN processing_started_at TIMESTAMPTZ;
ALTER TABLE documents ADD COLUMN lease_until           TIMESTAMPTZ;
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS lease_until;
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS processing_started_at;

-- changeset edi:004-add-state-machine-indexes
-- comment: Composite indexes for the two stale-job recovery queries in StaleJobRecoveryService (Step 4).
--          idx_documents_status_lease_until  → stale IN_PROGRESS: WHERE status='IN_PROGRESS' AND lease_until < NOW()
--          idx_documents_status_created_at   → stuck PENDING:     WHERE status='PENDING' AND created_at < NOW() - INTERVAL '15 minutes'
--          Production: make these partial indexes (WHERE status IN ('PENDING','IN_PROGRESS')) once the table
--          grows large; terminal rows (DONE, FAILED) account for the majority and can be excluded from the index.
CREATE INDEX IF NOT EXISTS idx_documents_status_lease_until ON documents(status, lease_until);
CREATE INDEX IF NOT EXISTS idx_documents_status_created_at  ON documents(status, created_at);
-- rollback DROP INDEX IF EXISTS idx_documents_status_created_at;
-- rollback DROP INDEX IF EXISTS idx_documents_status_lease_until;
