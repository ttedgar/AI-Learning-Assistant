--liquibase formatted sql

-- changeset edi:006-add-ai-model-columns
-- comment: Adds per-content-type AI model columns to documents so the frontend can show which
--          free model generated each piece of content (summary, flashcards, quiz separately).
--          OpenRouter free tier routes to random models per call, so each type may differ.
--          All nullable — only set when the document transitions to DONE.
ALTER TABLE documents ADD COLUMN summary_model VARCHAR(100);
ALTER TABLE documents ADD COLUMN flashcards_model VARCHAR(100);
ALTER TABLE documents ADD COLUMN quiz_model VARCHAR(100);
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS summary_model;
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS flashcards_model;
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS quiz_model;
