-- ============================================================================
-- TALENTIA - RECRUITER SYSTEM
-- Migration: 008_add_recruiter_to_positions.sql
-- Date: 2026-01-09
-- Description: Links positions to recruiters via FK, enables workload tracking
-- ADR: /docs/architecture/ADR-002-recruiter-system.md
-- ============================================================================

-- ============================================================================
-- STEP 1: Add recruiter columns to positions table
-- ============================================================================

-- FK to recruiters table (nullable for backward compatibility)
ALTER TABLE positions
ADD COLUMN recruiter_id UUID REFERENCES recruiters(id) ON DELETE SET NULL;

-- Denormalized recruiter name for display without JOIN
ALTER TABLE positions
ADD COLUMN recruiter_name VARCHAR(255);

-- Add comments
COMMENT ON COLUMN positions.recruiter_id IS 'FK to recruiters table - auto-populated from Excel RESPONSABLE column';
COMMENT ON COLUMN positions.recruiter_name IS 'Denormalized recruiter name for display without JOIN';

-- ============================================================================
-- STEP 2: Add capacity column to recruiters
-- ============================================================================

-- Max positions a recruiter can handle (default 25)
ALTER TABLE recruiters
ADD COLUMN capacity INTEGER NOT NULL DEFAULT 25;

COMMENT ON COLUMN recruiters.capacity IS 'Maximum positions this recruiter can handle simultaneously';

-- ============================================================================
-- STEP 3: Create indexes for workload queries
-- ============================================================================

-- Index for recruiter workload queries (active positions only)
CREATE INDEX idx_positions_recruiter_id ON positions(recruiter_id)
WHERE deleted_at IS NULL AND status NOT IN ('filled', 'cancelled');

-- Index for recruiter name lookup (for upsert by name)
CREATE INDEX idx_recruiters_name ON recruiters(name)
WHERE deleted_at IS NULL;

-- ============================================================================
-- STEP 4: Function to update recruiter current_load
-- ============================================================================

-- Function to recalculate all recruiter loads (for periodic sync)
CREATE OR REPLACE FUNCTION update_all_recruiter_loads()
RETURNS void AS $$
BEGIN
  UPDATE recruiters r
  SET current_load = COALESCE((
    SELECT COUNT(*)
    FROM positions p
    WHERE p.recruiter_id = r.id
      AND p.deleted_at IS NULL
      AND p.status NOT IN ('filled', 'cancelled')
  ), 0),
  updated_at = NOW()
  WHERE r.deleted_at IS NULL;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_all_recruiter_loads IS 'Recalculates current_load for all recruiters based on active positions';

-- ============================================================================
-- STEP 5: Trigger to maintain current_load on position changes
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_update_recruiter_load()
RETURNS TRIGGER AS $$
DECLARE
  v_old_active BOOLEAN;
  v_new_active BOOLEAN;
BEGIN
  -- Determine if position was/is active (not filled, cancelled, or deleted)
  v_old_active := (TG_OP = 'UPDATE' OR TG_OP = 'DELETE')
    AND OLD.deleted_at IS NULL
    AND OLD.status NOT IN ('filled', 'cancelled');

  v_new_active := (TG_OP = 'INSERT' OR TG_OP = 'UPDATE')
    AND NEW.deleted_at IS NULL
    AND NEW.status NOT IN ('filled', 'cancelled');

  -- Handle recruiter_id changes
  IF TG_OP = 'UPDATE' AND OLD.recruiter_id IS DISTINCT FROM NEW.recruiter_id THEN
    -- Decrement old recruiter if position was active
    IF v_old_active AND OLD.recruiter_id IS NOT NULL THEN
      UPDATE recruiters SET current_load = GREATEST(current_load - 1, 0)
      WHERE id = OLD.recruiter_id;
    END IF;
    -- Increment new recruiter if position is active
    IF v_new_active AND NEW.recruiter_id IS NOT NULL THEN
      UPDATE recruiters SET current_load = current_load + 1
      WHERE id = NEW.recruiter_id;
    END IF;
  END IF;

  -- Handle INSERT of active position
  IF TG_OP = 'INSERT' AND v_new_active AND NEW.recruiter_id IS NOT NULL THEN
    UPDATE recruiters SET current_load = current_load + 1
    WHERE id = NEW.recruiter_id;
  END IF;

  -- Handle status change to inactive (filled/cancelled)
  IF TG_OP = 'UPDATE'
     AND v_old_active
     AND NOT v_new_active
     AND NEW.recruiter_id IS NOT NULL THEN
    UPDATE recruiters SET current_load = GREATEST(current_load - 1, 0)
    WHERE id = NEW.recruiter_id;
  END IF;

  -- Handle status change from inactive to active
  IF TG_OP = 'UPDATE'
     AND NOT v_old_active
     AND v_new_active
     AND NEW.recruiter_id IS NOT NULL THEN
    UPDATE recruiters SET current_load = current_load + 1
    WHERE id = NEW.recruiter_id;
  END IF;

  -- Handle soft delete
  IF TG_OP = 'UPDATE'
     AND OLD.deleted_at IS NULL
     AND NEW.deleted_at IS NOT NULL
     AND v_old_active
     AND OLD.recruiter_id IS NOT NULL THEN
    UPDATE recruiters SET current_load = GREATEST(current_load - 1, 0)
    WHERE id = OLD.recruiter_id;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Create trigger
DROP TRIGGER IF EXISTS trg_position_recruiter_load ON positions;
CREATE TRIGGER trg_position_recruiter_load
AFTER INSERT OR UPDATE OR DELETE ON positions
FOR EACH ROW EXECUTE FUNCTION trigger_update_recruiter_load();

COMMENT ON FUNCTION trigger_update_recruiter_load IS 'Maintains recruiter.current_load when positions are created, updated, or deleted';

-- ============================================================================
-- STEP 6: View for recruiter workload summary
-- ============================================================================

CREATE OR REPLACE VIEW recruiter_workload AS
SELECT
  r.id,
  r.name,
  r.email,
  r.primary_zone,
  r.secondary_zones,
  r.capability_level,
  r.capacity,
  r.current_load,
  r.fill_rate_30d,
  r.avg_time_to_fill,
  r.is_active,
  -- Computed fields
  ROUND((r.current_load::NUMERIC / NULLIF(r.capacity, 0)) * 100, 1) AS utilization_percent,
  r.current_load >= r.capacity AS is_overloaded,
  r.current_load >= (r.capacity * 0.8) AS is_near_capacity,
  -- Position counts by status
  COALESCE(open_count, 0) AS positions_open,
  COALESCE(in_progress_count, 0) AS positions_in_progress,
  COALESCE(interviewing_count, 0) AS positions_interviewing,
  COALESCE(filled_count, 0) AS positions_filled_total
FROM recruiters r
LEFT JOIN LATERAL (
  SELECT
    COUNT(*) FILTER (WHERE status = 'open') AS open_count,
    COUNT(*) FILTER (WHERE status = 'in_progress') AS in_progress_count,
    COUNT(*) FILTER (WHERE status = 'interviewing') AS interviewing_count,
    COUNT(*) FILTER (WHERE status = 'filled') AS filled_count
  FROM positions p
  WHERE p.recruiter_id = r.id AND p.deleted_at IS NULL
) counts ON true
WHERE r.deleted_at IS NULL AND r.is_active = true;

COMMENT ON VIEW recruiter_workload IS 'Aggregated view of recruiter workload with utilization metrics';

-- ============================================================================
-- STEP 7: Initialize current_load for any existing positions
-- (Run once after migration to sync existing data)
-- ============================================================================

SELECT update_all_recruiter_loads();

-- ============================================================================
-- STEP 8: RLS Policy for recruiter columns in positions
-- ============================================================================

-- Allow reading recruiter info on positions
CREATE POLICY "Allow reading recruiter info on positions"
ON positions FOR SELECT
USING (true);

-- Allow updating recruiter assignment (for reassignment)
CREATE POLICY "Allow updating recruiter assignment"
ON positions FOR UPDATE
USING (true)
WITH CHECK (true);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
