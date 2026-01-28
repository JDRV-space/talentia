-- =============================================================================
-- Migration 013: Recruiter Tweaks
-- Date: 2026-01-14
-- Description: Deactivate recruiters, unassign positions, add hard blocks,
--              and infer capability levels from historical data
-- =============================================================================

-- 1.1 Deactivate recruiters who are no longer active
UPDATE recruiters
SET
  is_active = false,
  updated_at = NOW()
WHERE name IN (
  'Recruiter A',
  'Recruiter B',
  'Recruiter C',
  'Recruiter D',
  'Recruiter E'
)
AND deleted_at IS NULL;

-- 1.2 Unassign positions from deactivated recruiters
UPDATE positions
SET
  recruiter_id = NULL,
  recruiter_name = NULL,
  status = 'open',
  updated_at = NOW()
WHERE recruiter_id IN (
  SELECT id FROM recruiters
  WHERE name IN ('Recruiter D', 'Recruiter E')
  AND deleted_at IS NULL
)
AND status IN ('open', 'in_progress', 'interviewing')
AND deleted_at IS NULL;

-- 1.3 Add max_position_level column for hard blocking
ALTER TABLE recruiters
ADD COLUMN IF NOT EXISTS max_position_level INTEGER
CHECK (max_position_level IS NULL OR (max_position_level BETWEEN 1 AND 8));

COMMENT ON COLUMN recruiters.max_position_level IS
'Hard cap on position level this recruiter can handle. NULL = no restriction. 1-8 matches POSITION_LEVEL_MAP.';

-- 1.4 Set hard blocks for level-restricted recruiters
UPDATE recruiters
SET
  max_position_level = 3,
  updated_at = NOW()
WHERE name IN ('Recruiter F', 'Recruiter G')
AND deleted_at IS NULL;

-- 1.5 Infer capability_level from historical data (MODE of filled positions)
-- FIXED: Tie-breaker uses numeric level ordering (not alphabetical)
WITH level_counts AS (
  SELECT
    p.recruiter_id,
    p.level,
    COUNT(*) as level_count,
    ROW_NUMBER() OVER (
      PARTITION BY p.recruiter_id
      ORDER BY COUNT(*) DESC,
        -- Tie-breaker: prefer HIGHER numeric level (more capable)
        CASE LOWER(TRIM(p.level))
          WHEN 'operario' THEN 1
          WHEN 'practicante' THEN 1
          WHEN 'auxiliar' THEN 2
          WHEN 'asistente' THEN 3
          WHEN 'tecnico' THEN 3
          WHEN 'analista' THEN 4
          WHEN 'coordinador' THEN 5
          WHEN 'supervisor' THEN 5
          WHEN 'jefe' THEN 6
          WHEN 'subgerente' THEN 7
          WHEN 'gerente' THEN 8
          ELSE 1
        END DESC
    ) as rn
  FROM positions p
  WHERE p.recruiter_id IS NOT NULL
    AND p.deleted_at IS NULL
    AND p.status = 'filled'
  GROUP BY p.recruiter_id, p.level
),
mode_levels AS (
  SELECT
    recruiter_id,
    level as mode_level,
    level_count
  FROM level_counts
  WHERE rn = 1
)
UPDATE recruiters r
SET
  capability_level = CASE LOWER(TRIM(ml.mode_level))
    WHEN 'operario' THEN 1
    WHEN 'practicante' THEN 1
    WHEN 'auxiliar' THEN 2
    WHEN 'asistente' THEN 3
    WHEN 'tecnico' THEN 3
    WHEN 'analista' THEN 4
    WHEN 'coordinador' THEN 5
    WHEN 'supervisor' THEN 5
    WHEN 'jefe' THEN 6
    WHEN 'subgerente' THEN 7
    WHEN 'gerente' THEN 8
    ELSE r.capability_level
  END,
  updated_at = NOW()
FROM mode_levels ml
WHERE r.id = ml.recruiter_id
  AND r.deleted_at IS NULL;

-- Log the migration in audit_log
-- FIXED: actor_id is UUID type, use NULL for system migrations
INSERT INTO audit_log (
  actor_type,
  actor_id,
  action,
  entity_type,
  entity_id,
  details
)
VALUES (
  'system',
  NULL,
  'update',
  'recruiters',
  NULL,
  jsonb_build_object(
    'migration', '013_recruiter_tweaks',
    'date', NOW()::text,
    'changes', ARRAY[
      'Deactivated 5 recruiters',
      'Unassigned positions from deactivated recruiters',
      'Added max_position_level column',
      'Set hard blocks for level-restricted recruiters (max level 3)',
      'Inferred capability_level from historical MODE (numeric tie-breaker)'
    ]
  )
);
