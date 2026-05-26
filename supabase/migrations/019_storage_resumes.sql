-- ── Migration 019: Supabase Storage bucket for resumes ──────────────────────
--
-- NOTE: The bucket itself must be created in the Supabase Dashboard:
--   Dashboard → Storage → New Bucket
--   Name: resumes
--   Public: ON  (so public URLs work without JWT)
--
-- If you prefer private buckets, switch to signed URLs in the app code.
--
-- This file sets up RLS storage policies via SQL.

-- Allow org members to upload to their org folder
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO NOTHING;

-- Policy: authenticated users can upload (INSERT)
CREATE POLICY "authenticated upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes');

-- Policy: anyone can read public objects (SELECT)
CREATE POLICY "public read resumes"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- Policy: uploader can delete their own files (DELETE)
CREATE POLICY "owner delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes' AND auth.uid() = owner);
