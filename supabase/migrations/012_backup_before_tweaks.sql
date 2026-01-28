-- =============================================================================
-- Migration 012: Backup Tables Before Recruiter Tweaks
-- Date: 2026-01-14
-- Purpose: Enable rollback by preserving original state
-- NOTE: Migration 011 already exists (011_excel_uploads_bucket.sql)
-- =============================================================================

-- Backup recruiter capability_level and is_active before changes
CREATE TABLE IF NOT EXISTS _backup_recruiters_013 AS
SELECT
  id,
  name,
  capability_level,
  is_active,
  updated_at as original_updated_at,
  NOW() as backup_created_at
FROM recruiters
WHERE deleted_at IS NULL;

-- Backup position assignments before unassigning deactivated recruiters
CREATE TABLE IF NOT EXISTS _backup_positions_013 AS
SELECT
  id,
  title,
  recruiter_id,
  recruiter_name,
  status,
  updated_at as original_updated_at,
  NOW() as backup_created_at
FROM positions
WHERE recruiter_id IN (
  SELECT id FROM recruiters
  WHERE name IN ('Recruiter D', 'Recruiter E')
)
AND status IN ('open', 'in_progress', 'interviewing')
AND deleted_at IS NULL;

-- Add index for fast lookups during potential rollback
CREATE INDEX IF NOT EXISTS idx_backup_recruiters_013_id ON _backup_recruiters_013(id);
CREATE INDEX IF NOT EXISTS idx_backup_positions_013_id ON _backup_positions_013(id);

COMMENT ON TABLE _backup_recruiters_013 IS 'Backup before migration 013_recruiter_tweaks. Safe to drop after 30 days.';
COMMENT ON TABLE _backup_positions_013 IS 'Backup before migration 013_recruiter_tweaks. Safe to drop after 30 days.';
