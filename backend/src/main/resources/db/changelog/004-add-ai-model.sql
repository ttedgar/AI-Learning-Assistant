--liquibase formatted sql

-- changeset edi:006-add-ai-model
-- comment: Adds ai_model column to documents to store which AI model generated the content.
--          Populated when a document transitions to DONE. Null for PENDING/IN_PROGRESS/FAILED documents.
--          Useful for debugging and transparency — OpenRouter free tier routes to random models.
--          Example values: meta-llama/llama-3.1-8b-instruct:free, google/gemma-3-27b-it:free
ALTER TABLE documents ADD COLUMN ai_model VARCHAR(100);
-- rollback ALTER TABLE documents DROP COLUMN IF EXISTS ai_model;
