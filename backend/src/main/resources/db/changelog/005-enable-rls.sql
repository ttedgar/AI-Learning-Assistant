--liquibase formatted sql

-- changeset edi:005-enable-rls
-- comment: Enable Row Level Security on all public tables to block direct PostgREST access.
--
--          Architecture note: the Spring Boot backend connects via a direct JDBC connection
--          as the postgres superuser, which bypasses RLS entirely — so no policies are needed
--          for the backend to function. RLS only affects the PostgREST layer (anon / authenticated
--          roles), which this application never uses. Enabling RLS with no permissive policies
--          means PostgREST returns nothing, preventing unauthorized data exposure.
--
--          Production equivalent: also revoke SELECT/INSERT/UPDATE/DELETE on these tables
--          from the `anon` and `authenticated` roles via REVOKE statements, and use a
--          dedicated application role with a connection pool (e.g. PgBouncer) scoped to
--          only the tables and operations the backend actually needs.
ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE summaries       ENABLE ROW LEVEL SECURITY;
ALTER TABLE flashcards      ENABLE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions  ENABLE ROW LEVEL SECURITY;

-- Force RLS even for table owners. Without this, the table owner role
-- (postgres) would still bypass RLS. Safe here because the backend
-- never connects as a non-superuser owner, but explicit is better than implicit.
ALTER TABLE users           FORCE ROW LEVEL SECURITY;
ALTER TABLE documents       FORCE ROW LEVEL SECURITY;
ALTER TABLE summaries       FORCE ROW LEVEL SECURITY;
ALTER TABLE flashcards      FORCE ROW LEVEL SECURITY;
ALTER TABLE quiz_questions  FORCE ROW LEVEL SECURITY;
-- rollback ALTER TABLE quiz_questions NO FORCE ROW LEVEL SECURITY; ALTER TABLE quiz_questions DISABLE ROW LEVEL SECURITY; ALTER TABLE flashcards NO FORCE ROW LEVEL SECURITY; ALTER TABLE flashcards DISABLE ROW LEVEL SECURITY; ALTER TABLE summaries NO FORCE ROW LEVEL SECURITY; ALTER TABLE summaries DISABLE ROW LEVEL SECURITY; ALTER TABLE documents NO FORCE ROW LEVEL SECURITY; ALTER TABLE documents DISABLE ROW LEVEL SECURITY; ALTER TABLE users NO FORCE ROW LEVEL SECURITY; ALTER TABLE users DISABLE ROW LEVEL SECURITY;
