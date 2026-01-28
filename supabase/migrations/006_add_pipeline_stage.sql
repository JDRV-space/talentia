-- ============================================================================
-- TALENTIA - ADD PIPELINE STAGE COLUMN
-- Migration: 006_add_pipeline_stage.sql
-- Fecha: 2026-01-08
-- Descripcion: Adds pipeline_stage column to positions table for tracking
--              recruitment pipeline stages (vacante, proceso, seleccionado, contratado)
-- ============================================================================

-- Add pipeline_stage column to positions
-- Values: vacante, proceso, seleccionado, contratado, cancelled
ALTER TABLE positions
ADD COLUMN IF NOT EXISTS pipeline_stage VARCHAR(50) DEFAULT 'vacante'
CHECK (pipeline_stage IN ('vacante', 'proceso', 'seleccionado', 'contratado', 'cancelled'));

-- Create index for pipeline stage queries
CREATE INDEX IF NOT EXISTS idx_positions_pipeline_stage
ON positions(pipeline_stage)
WHERE deleted_at IS NULL;

-- Comment
COMMENT ON COLUMN positions.pipeline_stage IS 'Pipeline stage: vacante (open), proceso (screening), seleccionado (interviews), contratado (filled), cancelled';

-- Update existing positions to have correct pipeline_stage based on status
UPDATE positions
SET pipeline_stage = CASE
    WHEN status = 'filled' THEN 'contratado'
    WHEN status = 'cancelled' THEN 'cancelled'
    WHEN status IN ('interviewing', 'offer_sent') THEN 'seleccionado'
    WHEN status = 'in_progress' THEN 'proceso'
    ELSE 'vacante'
END
WHERE pipeline_stage IS NULL OR pipeline_stage = 'vacante';
