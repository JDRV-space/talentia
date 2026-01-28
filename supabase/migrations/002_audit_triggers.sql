-- ============================================================================
-- TALENTIA - AUDIT TRIGGERS
-- Migracion: 002_audit_triggers.sql
-- Fecha: 2026-01-08
-- Descripcion: Triggers de auditoria para capturar INSERT/UPDATE/DELETE
--              en todas las tablas principales del sistema
-- ============================================================================

-- ============================================================================
-- FUNCION: audit_trigger_func
-- Descripcion: Funcion generica de auditoria que captura cambios en tablas
--              y los registra en audit_log con valores anteriores y nuevos
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_type VARCHAR(50);
    v_entity_id UUID;
BEGIN
    -- Obtener el ID del usuario actual de Supabase Auth
    -- Si no hay usuario autenticado, usar UUID nulo y tipo 'system'
    BEGIN
        v_actor_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;

    -- Determinar tipo de actor
    IF v_actor_id IS NULL THEN
        v_actor_type := 'system';
        v_actor_id := '00000000-0000-0000-0000-000000000000'::UUID;
    ELSE
        v_actor_type := 'user';
    END IF;

    -- Obtener el ID de la entidad afectada
    -- Para DELETE usamos OLD.id, para INSERT/UPDATE usamos NEW.id
    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id;
    ELSE
        v_entity_id := NEW.id;
    END IF;

    -- Insertar registro de auditoria
    INSERT INTO audit_log (
        actor_id,
        actor_type,
        action,
        action_category,
        entity_type,
        entity_id,
        previous_values,
        new_values,
        created_at
    ) VALUES (
        v_actor_id,
        v_actor_type,
        TG_OP,  -- 'INSERT', 'UPDATE', o 'DELETE'
        TG_TABLE_NAME,  -- Categoria basada en nombre de tabla
        TG_TABLE_NAME,  -- Tipo de entidad = nombre de tabla
        v_entity_id,
        CASE
            WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD)
            ELSE NULL
        END,
        CASE
            WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW)
            ELSE NULL
        END,
        NOW()
    );

    -- Retornar el registro apropiado
    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Comentario de la funcion
COMMENT ON FUNCTION audit_trigger_func() IS
'Funcion de auditoria generica que captura operaciones INSERT/UPDATE/DELETE
y registra cambios en audit_log con valores anteriores y nuevos en JSONB';

-- ============================================================================
-- TRIGGERS PARA TABLA: recruiters
-- ============================================================================
CREATE TRIGGER audit_recruiters_insert
    AFTER INSERT ON recruiters
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_recruiters_update
    AFTER UPDATE ON recruiters
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_recruiters_delete
    AFTER DELETE ON recruiters
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

COMMENT ON TRIGGER audit_recruiters_insert ON recruiters IS 'Audita creacion de reclutadores';
COMMENT ON TRIGGER audit_recruiters_update ON recruiters IS 'Audita actualizacion de reclutadores';
COMMENT ON TRIGGER audit_recruiters_delete ON recruiters IS 'Audita eliminacion de reclutadores';

-- ============================================================================
-- TRIGGERS PARA TABLA: positions
-- ============================================================================
CREATE TRIGGER audit_positions_insert
    AFTER INSERT ON positions
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_positions_update
    AFTER UPDATE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_positions_delete
    AFTER DELETE ON positions
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

COMMENT ON TRIGGER audit_positions_insert ON positions IS 'Audita creacion de posiciones';
COMMENT ON TRIGGER audit_positions_update ON positions IS 'Audita actualizacion de posiciones';
COMMENT ON TRIGGER audit_positions_delete ON positions IS 'Audita eliminacion de posiciones';

-- ============================================================================
-- TRIGGERS PARA TABLA: candidates
-- ============================================================================
CREATE TRIGGER audit_candidates_insert
    AFTER INSERT ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_candidates_update
    AFTER UPDATE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_candidates_delete
    AFTER DELETE ON candidates
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

COMMENT ON TRIGGER audit_candidates_insert ON candidates IS 'Audita creacion de candidatos';
COMMENT ON TRIGGER audit_candidates_update ON candidates IS 'Audita actualizacion de candidatos';
COMMENT ON TRIGGER audit_candidates_delete ON candidates IS 'Audita eliminacion de candidatos';

-- ============================================================================
-- TRIGGERS PARA TABLA: assignments
-- ============================================================================
CREATE TRIGGER audit_assignments_insert
    AFTER INSERT ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_assignments_update
    AFTER UPDATE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_assignments_delete
    AFTER DELETE ON assignments
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

COMMENT ON TRIGGER audit_assignments_insert ON assignments IS 'Audita creacion de asignaciones';
COMMENT ON TRIGGER audit_assignments_update ON assignments IS 'Audita actualizacion de asignaciones';
COMMENT ON TRIGGER audit_assignments_delete ON assignments IS 'Audita eliminacion de asignaciones';

-- ============================================================================
-- TRIGGERS PARA TABLA: campaigns
-- ============================================================================
CREATE TRIGGER audit_campaigns_insert
    AFTER INSERT ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_campaigns_update
    AFTER UPDATE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

CREATE TRIGGER audit_campaigns_delete
    AFTER DELETE ON campaigns
    FOR EACH ROW
    EXECUTE FUNCTION audit_trigger_func();

COMMENT ON TRIGGER audit_campaigns_insert ON campaigns IS 'Audita creacion de campanas';
COMMENT ON TRIGGER audit_campaigns_update ON campaigns IS 'Audita actualizacion de campanas';
COMMENT ON TRIGGER audit_campaigns_delete ON campaigns IS 'Audita eliminacion de campanas';

-- ============================================================================
-- NOTA: No se agregan triggers a las siguientes tablas por diseno:
-- - audit_log: Evitar recursion infinita
-- - settings: Cambios de configuracion se auditan via aplicacion
-- - forecast: Datos generados automaticamente, no requieren auditoria
-- ============================================================================
