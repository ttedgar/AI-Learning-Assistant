-- ============================================================
-- Supabase Row Level Security (RLS) policies.
--
-- Run this in: Supabase Dashboard → SQL Editor
-- OR via Supabase CLI: supabase db push
--
-- Design principle: users can only read/write their OWN rows.
-- The backend service role key bypasses RLS — all backend writes
-- go through the service role, all reads through the anon/user JWT.
-- Production note: at global-bank scale, RLS alone is not sufficient —
-- combine with API-layer ownership checks (already done in DocumentService).
-- ============================================================

-- Drop existing policies to allow idempotent re-runs
DROP POLICY IF EXISTS "users: read own row"                      ON users;
DROP POLICY IF EXISTS "users: update own row"                    ON users;
DROP POLICY IF EXISTS "documents: read own"                      ON documents;
DROP POLICY IF EXISTS "documents: delete own"                    ON documents;
DROP POLICY IF EXISTS "summaries: read via document ownership"   ON summaries;
DROP POLICY IF EXISTS "flashcards: read via document ownership"  ON flashcards;
DROP POLICY IF EXISTS "quiz_questions: read via document ownership" ON quiz_questions;

-- Enable RLS on all tables (disabled by default in Supabase)
ALTER TABLE users         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents     ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries     ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards    ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions ENABLE ROW LEVEL SECURITY;

-- ── users ────────────────────────────────────────────────────
-- Each user can only read/update their own profile row.
-- Inserts are performed by the backend (service role) on first login.
-- Note: (SELECT auth.uid()) is the recommended Supabase pattern — wrapping in
-- SELECT prevents per-row re-evaluation and produces a stable execution plan.
-- supabase_user_id is UUID, same type as auth.uid() — no cast needed.

CREATE POLICY "users: read own row"
    ON users FOR SELECT
    USING (supabase_user_id = (SELECT auth.uid()));

CREATE POLICY "users: update own row"
    ON users FOR UPDATE
    USING (supabase_user_id = (SELECT auth.uid()));

-- ── documents ────────────────────────────────────────────────
-- Users can only see and delete their own documents.
-- Inserts and status updates are backend-only (service role).

CREATE POLICY "documents: read own"
    ON documents FOR SELECT
    USING (
        user_id = (
            SELECT id FROM users WHERE supabase_user_id = (SELECT auth.uid())
        )
    );

CREATE POLICY "documents: delete own"
    ON documents FOR DELETE
    USING (
        user_id = (
            SELECT id FROM users WHERE supabase_user_id = (SELECT auth.uid())
        )
    );

-- ── summaries ────────────────────────────────────────────────
-- Readable if the parent document belongs to the requesting user.

CREATE POLICY "summaries: read via document ownership"
    ON summaries FOR SELECT
    USING (
        document_id IN (
            SELECT d.id FROM documents d
            JOIN users u ON u.id = d.user_id
            WHERE u.supabase_user_id = (SELECT auth.uid())
        )
    );

-- ── flashcards ───────────────────────────────────────────────

CREATE POLICY "flashcards: read via document ownership"
    ON flashcards FOR SELECT
    USING (
        document_id IN (
            SELECT d.id FROM documents d
            JOIN users u ON u.id = d.user_id
            WHERE u.supabase_user_id = (SELECT auth.uid())
        )
    );

-- ── quiz_questions ───────────────────────────────────────────

CREATE POLICY "quiz_questions: read via document ownership"
    ON quiz_questions FOR SELECT
    USING (
        document_id IN (
            SELECT d.id FROM documents d
            JOIN users u ON u.id = d.user_id
            WHERE u.supabase_user_id = (SELECT auth.uid())
        )
    );
