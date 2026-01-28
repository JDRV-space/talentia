-- ============================================================================
-- TALENTIA - DIRECT CAMPAIGN-POSITION LINKING
-- Migration: 010_add_week_crop_to_positions.sql
-- Date: 2026-01-09
-- Description: Adds week_number and crop columns to positions table for direct
--              linking to campaigns instead of fuzzy date-based matching.
--
-- CONTEXT:
-- The labor ratio algorithm was matching campaigns to positions using zone +
-- date overlap. This caused issues because positions without closed_at were
-- matching multiple campaigns. The CONSOLIDADO Excel has direct linking data:
--   - semana_inicio (week number when position was created)
--   - cultivo (crop the position is for)
--
-- These fields enable EXACT matching: zone + week_number + crop
-- ============================================================================

-- ============================================================================
-- STEP 1: Add week_number column to positions table
-- ============================================================================

ALTER TABLE positions
ADD COLUMN week_number INTEGER CHECK (week_number IS NULL OR (week_number BETWEEN 1 AND 53));

COMMENT ON COLUMN positions.week_number IS 'Week number from Excel SEMANA INICIO - used for direct campaign linking';

-- ============================================================================
-- STEP 2: Add crop column to positions table
-- ============================================================================

ALTER TABLE positions
ADD COLUMN crop VARCHAR(100);

COMMENT ON COLUMN positions.crop IS 'Crop type from Excel CULTIVO - used for direct campaign linking';

-- ============================================================================
-- STEP 3: Create index for campaign matching queries
-- ============================================================================

-- Composite index for the exact matching: zone + week_number + crop
CREATE INDEX idx_positions_campaign_match ON positions(zone, week_number, crop)
WHERE deleted_at IS NULL AND week_number IS NOT NULL AND crop IS NOT NULL;

-- ============================================================================
-- STEP 4: Add to FIELD_LABELS comment (for TypeScript reference)
-- ============================================================================

COMMENT ON TABLE positions IS 'Posiciones de trabajo - importadas desde CONSOLIDADO. week_number and crop enable direct campaign linking.';

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
