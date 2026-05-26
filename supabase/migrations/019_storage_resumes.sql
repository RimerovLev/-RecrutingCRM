-- ── Migration 019: Supabase Storage bucket for resumes ──────────────────────
--
-- Bucket "resumes" (public) — may already exist, this is idempotent.
-- If creating via Dashboard: Storage → New Bucket → Name: resumes, Public: ON
--

-- Ensure bucket exists (safe if already present)
INSERT INTO storage.buckets (id, name, public)
VALUES ('resumes', 'resumes', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Drop policies first so re-running this migration is safe
DROP POLICY IF EXISTS "authenticated upload resumes"  ON storage.objects;
DROP POLICY IF EXISTS "public read resumes"           ON storage.objects;
DROP POLICY IF EXISTS "owner delete resumes"          ON storage.objects;

-- Allow authenticated users to upload
CREATE POLICY "authenticated upload resumes"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'resumes');

-- Allow public read (bucket is public anyway, but policy makes it explicit)
CREATE POLICY "public read resumes"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'resumes');

-- Allow uploader to delete their own files
CREATE POLICY "owner delete resumes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'resumes' AND auth.uid() = owner);
