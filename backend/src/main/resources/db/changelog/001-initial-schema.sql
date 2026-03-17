--liquibase formatted sql

-- changeset edi:001-create-users
-- comment: Core user table — supabase_user_id is the Supabase Auth UUID, kept separate from our internal UUID
--          so we are never coupled to Supabase's internal key structure.
CREATE TABLE IF NOT EXISTS users (
    id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    supabase_user_id UUID        NOT NULL UNIQUE,
    email            TEXT        NOT NULL UNIQUE,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- rollback DROP TABLE IF EXISTS users;

-- changeset edi:002-create-documents
-- comment: Documents table. file_url points to Supabase Storage.
--          status is an application-level enum enforced by a CHECK constraint.
--          Production: add a partial index on (user_id, status) once query patterns are known.
CREATE TABLE IF NOT EXISTS documents (
    id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title      TEXT        NOT NULL,
    file_url   TEXT        NOT NULL,
    status     TEXT        NOT NULL DEFAULT 'PENDING'
                           CONSTRAINT document_status_check
                           CHECK (status IN ('PENDING', 'PROCESSING', 'DONE', 'FAILED')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents(user_id);
CREATE INDEX IF NOT EXISTS idx_documents_status   ON documents(status);
-- rollback DROP INDEX IF EXISTS idx_documents_status; DROP INDEX IF EXISTS idx_documents_user_id; DROP TABLE IF EXISTS documents;

-- changeset edi:003-create-summaries
-- comment: One summary per document; UNIQUE constraint enforces this at the DB level.
CREATE TABLE IF NOT EXISTS summaries (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    content     TEXT NOT NULL,
    UNIQUE(document_id)
);
-- rollback DROP TABLE IF EXISTS summaries;

-- changeset edi:004-create-flashcards
CREATE TABLE IF NOT EXISTS flashcards (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    question    TEXT NOT NULL,
    answer      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_flashcards_document_id ON flashcards(document_id);
-- rollback DROP INDEX IF EXISTS idx_flashcards_document_id; DROP TABLE IF EXISTS flashcards;

-- changeset edi:005-create-quiz-questions
-- comment: options column is JSONB — only populated for MULTIPLE_CHOICE questions.
--          Storing as JSONB avoids a separate options table for this scale; at global-bank scale
--          we'd normalise into quiz_question_options with a FK.
CREATE TABLE IF NOT EXISTS quiz_questions (
    id             UUID  PRIMARY KEY DEFAULT gen_random_uuid(),
    document_id    UUID  NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    question       TEXT  NOT NULL,
    type           TEXT  NOT NULL
                         CONSTRAINT quiz_type_check
                         CHECK (type IN ('MULTIPLE_CHOICE', 'OPEN_ENDED')),
    correct_answer TEXT  NOT NULL,
    options        JSONB
);

CREATE INDEX IF NOT EXISTS idx_quiz_questions_document_id ON quiz_questions(document_id);
-- rollback DROP INDEX IF EXISTS idx_quiz_questions_document_id; DROP TABLE IF EXISTS quiz_questions;
