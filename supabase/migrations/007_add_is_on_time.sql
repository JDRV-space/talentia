-- Add is_on_time column for real SLA tracking from COBERTURA field
ALTER TABLE positions ADD COLUMN IF NOT EXISTS is_on_time BOOLEAN DEFAULT NULL;

-- Add days_in_process for tracking current process duration (not just filled positions)
ALTER TABLE positions ADD COLUMN IF NOT EXISTS days_in_process INTEGER DEFAULT NULL;

-- Index for SLA queries
CREATE INDEX IF NOT EXISTS idx_positions_is_on_time ON positions(is_on_time) WHERE deleted_at IS NULL;
