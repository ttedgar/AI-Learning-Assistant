-- ============================================================
-- Supabase Storage — bucket configuration and access policies.
--
-- Run in: Supabase Dashboard → SQL Editor
--
-- One bucket: 'documents'
-- - Private (not publicly listable)
-- - Users can upload/read/delete only their own files
-- - Files are keyed by: {userId}/{documentId}.pdf
-- ============================================================

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('documents', 'documents', false)
ON CONFLICT (id) DO NOTHING;

-- ── Storage policies ─────────────────────────────────────────
-- File path convention: documents/{supabase_user_id}/{document_uuid}.pdf

-- Allow authenticated users to upload to their own folder
CREATE POLICY "storage: users upload to own folder"
    ON storage.objects FOR INSERT
    WITH CHECK (
        bucket_id = 'documents'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow authenticated users to read their own files
CREATE POLICY "storage: users read own files"
    ON storage.objects FOR SELECT
    USING (
        bucket_id = 'documents'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );

-- Allow authenticated users to delete their own files
CREATE POLICY "storage: users delete own files"
    ON storage.objects FOR DELETE
    USING (
        bucket_id = 'documents'
        AND auth.uid()::text = (storage.foldername(name))[1]
    );
