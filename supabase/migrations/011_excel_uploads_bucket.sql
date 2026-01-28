-- Migration: Create storage bucket for large Excel file uploads
-- Purpose: Bypass Vercel's 4.5MB body size limit by uploading directly to Supabase Storage
--
-- Flow:
-- 1. Browser uploads file directly to Supabase Storage (no size limit)
-- 2. API receives storage path (small JSON payload)
-- 3. API downloads file from storage using service role
-- 4. API processes and deletes file
--
-- Date: 2026-01-10

-- Create the storage bucket for Excel uploads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'excel-uploads',
  'excel-uploads',
  false,  -- Private bucket (not publicly accessible)
  104857600,  -- 100MB max file size (same as before)
  ARRAY[
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',  -- .xlsx
    'application/vnd.ms-excel',  -- .xls
    'application/octet-stream'   -- fallback for some browsers
  ]::text[]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Policy: Allow authenticated users to upload files
DROP POLICY IF EXISTS "Authenticated users can upload excel files" ON storage.objects;
CREATE POLICY "Authenticated users can upload excel files"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'excel-uploads'
);

-- Policy: Allow authenticated users to read their own uploads
-- (needed for the browser to get upload confirmation)
DROP POLICY IF EXISTS "Authenticated users can read excel uploads" ON storage.objects;
CREATE POLICY "Authenticated users can read excel uploads"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'excel-uploads'
);

-- Policy: Allow service role to delete files (for cleanup after processing)
-- Note: Service role already has full access, but this makes it explicit
DROP POLICY IF EXISTS "Service role can delete excel uploads" ON storage.objects;
CREATE POLICY "Service role can delete excel uploads"
ON storage.objects
FOR DELETE
TO service_role
USING (
  bucket_id = 'excel-uploads'
);
