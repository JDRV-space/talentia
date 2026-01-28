-- Migration: Extend capability_level from 5 to 8 levels
-- Purpose: Update to match 8-level position hierarchy
--
-- New hierarchy:
--   1 = Operario (unchanged)
--   2 = Auxiliar (NEW)
--   3 = Asistente (NEW)
--   4 = Analista (NEW)
--   5 = Coordinador (NEW)
--   6 = Jefe (was 4)
--   7 = Subgerente (NEW)
--   8 = Gerente (was 5)
--
-- Backward compatibility:
--   - Old level 2 (Tecnico) -> will be treated as level 3 (Asistente) by application
--   - Old level 3 (Supervisor) -> will be treated as level 5 (Coordinador) by application
--   - Old level 4 (Jefe) -> remains valid, now level 6
--   - Old level 5 (Gerente) -> remains valid, now level 8
--   NOTE: The application layer handles legacy level string mappings.
--         This migration only extends the numeric range constraint.

-- =============================================================================
-- STEP 1: Drop the old constraint on recruiters table
-- =============================================================================

-- Drop the inline CHECK constraint
ALTER TABLE recruiters
DROP CONSTRAINT IF EXISTS recruiters_capability_level_check;

-- Drop the named constraint (if exists from 001_initial_schema)
ALTER TABLE recruiters
DROP CONSTRAINT IF EXISTS valid_capability_level;

-- =============================================================================
-- STEP 2: Add new constraint allowing levels 1-8
-- =============================================================================

ALTER TABLE recruiters
ADD CONSTRAINT valid_capability_level
CHECK (capability_level >= 1 AND capability_level <= 8);

-- =============================================================================
-- STEP 3: Update the column comment
-- =============================================================================

COMMENT ON COLUMN recruiters.capability_level IS
'Nivel de capacidad 1-8: 1=Operario, 2=Auxiliar, 3=Asistente, 4=Analista, 5=Coordinador, 6=Jefe, 7=Subgerente, 8=Gerente';

-- =============================================================================
-- STEP 4: Create migration for existing data (optional, run manually if needed)
-- =============================================================================

-- NOTE: This migration does NOT automatically update existing recruiter levels.
-- If you need to migrate existing recruiters to the new level structure, run:
--
-- UPDATE recruiters SET capability_level = 6 WHERE capability_level = 4;  -- Jefe: 4 -> 6
-- UPDATE recruiters SET capability_level = 8 WHERE capability_level = 5;  -- Gerente: 5 -> 8
--
-- However, since the application layer maps position level STRINGS (not numbers),
-- existing recruiter capability_level values will continue to work correctly.
-- The scoring algorithm compares recruiter.capability_level (number) against
-- getPositionCapabilityLevel(position) which converts the position.level STRING.
--
-- If your recruiters were using the old 1-5 scale, you may want to review and
-- update their levels to match the new 1-8 scale manually.

-- =============================================================================
-- STEP 5: Add index for new levels (if not already covered)
-- =============================================================================

-- The existing index idx_recruiters_capability_level remains valid and useful

-- =============================================================================
-- ROLLBACK INSTRUCTIONS (if needed)
-- =============================================================================
--
-- To rollback this migration:
--
-- ALTER TABLE recruiters DROP CONSTRAINT IF EXISTS valid_capability_level;
-- ALTER TABLE recruiters ADD CONSTRAINT valid_capability_level CHECK (capability_level >= 1 AND capability_level <= 5);
-- COMMENT ON COLUMN recruiters.capability_level IS 'Nivel de capacidad 1-5: 1=Operario, 2=Tecnico, 3=Supervisor, 4=Jefe, 5=Gerente';
