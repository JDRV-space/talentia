-- Migration 009: Atomic Recruiter Load Increment
-- Fixes race condition in assignment creation
-- Provides atomic increment that respects capacity limits

-- =============================================================================
-- ATOMIC INCREMENT FUNCTION (single recruiter)
-- =============================================================================

-- Creates an atomic increment function for recruiter load
-- Returns the new load value, or -1 if at capacity (increment blocked)
CREATE OR REPLACE FUNCTION increment_recruiter_load(
  p_recruiter_id UUID,
  p_increment INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_load INT;
  v_capacity INT;
BEGIN
  -- Atomic update with capacity check
  UPDATE recruiters
  SET
    current_load = current_load + p_increment,
    updated_at = NOW()
  WHERE id = p_recruiter_id
    AND is_active = true
    AND deleted_at IS NULL
    AND current_load + p_increment <= capacity
  RETURNING current_load, capacity INTO v_new_load, v_capacity;

  -- If no rows updated, recruiter is at capacity or doesn't exist
  IF v_new_load IS NULL THEN
    -- Check if recruiter exists and return their current load
    SELECT current_load INTO v_new_load
    FROM recruiters
    WHERE id = p_recruiter_id;

    -- Return -1 to indicate capacity exceeded
    RETURN -1;
  END IF;

  RETURN v_new_load;
END;
$$;

COMMENT ON FUNCTION increment_recruiter_load IS
'Atomically increments recruiter load. Returns new load value, or -1 if at capacity.';

-- =============================================================================
-- BATCH ATOMIC INCREMENT FUNCTION (truly atomic - single UPDATE statement)
-- =============================================================================

-- Reserve capacity for multiple recruiters in a SINGLE atomic UPDATE statement
-- Takes parallel arrays of recruiter_ids and increments
-- Returns JSON array of results: [{recruiter_id, success, new_load}]
-- Uses unnest pattern for true atomicity - no FOR loop, no race window
CREATE OR REPLACE FUNCTION reserve_batch_capacity(
  p_recruiter_ids UUID[],
  p_increments INT[]
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_updated_ids UUID[];
BEGIN
  -- Validate input arrays are same length
  IF array_length(p_recruiter_ids, 1) IS DISTINCT FROM array_length(p_increments, 1) THEN
    RAISE EXCEPTION 'recruiter_ids and increments arrays must have same length';
  END IF;

  -- Handle empty arrays
  IF array_length(p_recruiter_ids, 1) IS NULL THEN
    RETURN '[]'::JSONB;
  END IF;

  -- SINGLE atomic UPDATE using unnest join pattern
  -- This acquires row locks on ALL matching recruiters simultaneously
  -- No race window between individual updates
  WITH input_data AS (
    SELECT
      unnest(p_recruiter_ids) AS recruiter_id,
      unnest(p_increments) AS increment
  ),
  updated AS (
    UPDATE recruiters r
    SET
      current_load = r.current_load + i.increment,
      updated_at = NOW()
    FROM input_data i
    WHERE r.id = i.recruiter_id
      AND r.is_active = true
      AND r.deleted_at IS NULL
      AND r.current_load + i.increment <= r.capacity
    RETURNING r.id, r.current_load AS new_load
  )
  SELECT array_agg(id) INTO v_updated_ids FROM updated;

  -- Build result JSON with success/failure for each input recruiter
  WITH input_data AS (
    SELECT
      unnest(p_recruiter_ids) AS recruiter_id,
      unnest(p_increments) AS increment
  ),
  results AS (
    SELECT
      i.recruiter_id,
      CASE WHEN i.recruiter_id = ANY(COALESCE(v_updated_ids, ARRAY[]::UUID[]))
           THEN true ELSE false END AS success,
      r.current_load AS new_load
    FROM input_data i
    LEFT JOIN recruiters r ON r.id = i.recruiter_id
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      'recruiter_id', recruiter_id,
      'success', success,
      'new_load', COALESCE(new_load, -1)
    )
  ) INTO v_result FROM results;

  RETURN COALESCE(v_result, '[]'::JSONB);
END;
$$;

COMMENT ON FUNCTION reserve_batch_capacity IS
'Atomically reserves capacity for ALL recruiters in a SINGLE UPDATE statement using unnest pattern. No FOR loop, no race window between updates. True atomic operation.';

-- =============================================================================
-- ATOMIC DECREMENT FUNCTION (for reassignment/completion)
-- =============================================================================

CREATE OR REPLACE FUNCTION decrement_recruiter_load(
  p_recruiter_id UUID,
  p_decrement INT DEFAULT 1
)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_new_load INT;
BEGIN
  -- Atomic decrement, floor at 0
  UPDATE recruiters
  SET
    current_load = GREATEST(0, current_load - p_decrement),
    updated_at = NOW()
  WHERE id = p_recruiter_id
    AND deleted_at IS NULL
  RETURNING current_load INTO v_new_load;

  RETURN COALESCE(v_new_load, 0);
END;
$$;

COMMENT ON FUNCTION decrement_recruiter_load IS
'Atomically decrements recruiter load. Floors at 0.';

-- =============================================================================
-- GRANT PERMISSIONS
-- =============================================================================

GRANT EXECUTE ON FUNCTION increment_recruiter_load TO authenticated;
GRANT EXECUTE ON FUNCTION increment_recruiter_load TO service_role;
GRANT EXECUTE ON FUNCTION reserve_batch_capacity TO authenticated;
GRANT EXECUTE ON FUNCTION reserve_batch_capacity TO service_role;
GRANT EXECUTE ON FUNCTION decrement_recruiter_load TO authenticated;
GRANT EXECUTE ON FUNCTION decrement_recruiter_load TO service_role;
