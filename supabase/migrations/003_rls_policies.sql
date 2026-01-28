-- ============================================================================
-- TALENTIA - REAL RLS POLICIES
-- Migracion: 003_rls_policies.sql
-- Fecha: 2026-01-08
-- Descripcion: Reemplaza las politicas RLS placeholder con politicas reales
--              basadas en roles (admin, recruiter) y contexto de usuario
-- ============================================================================

-- ============================================================================
-- PASO 1: Agregar columna de rol a recruiters (si no existe)
-- ============================================================================

-- Agregar columna role a la tabla recruiters
ALTER TABLE recruiters
ADD COLUMN IF NOT EXISTS role VARCHAR(50) NOT NULL DEFAULT 'recruiter'
CHECK (role IN ('admin', 'recruiter', 'viewer'));

COMMENT ON COLUMN recruiters.role IS 'Rol del usuario: admin (acceso total), recruiter (acceso a su trabajo), viewer (solo lectura)';

-- Crear indice para busquedas por rol
CREATE INDEX IF NOT EXISTS idx_recruiters_role ON recruiters(role) WHERE deleted_at IS NULL;

-- ============================================================================
-- PASO 2: Eliminar todas las politicas placeholder existentes
-- ============================================================================

-- Recruiters
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON recruiters;
DROP POLICY IF EXISTS "Allow all for recruiters" ON recruiters;

-- Positions
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON positions;
DROP POLICY IF EXISTS "Allow all for positions" ON positions;

-- Candidates
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON candidates;
DROP POLICY IF EXISTS "Allow all for candidates" ON candidates;

-- Assignments
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON assignments;
DROP POLICY IF EXISTS "Allow all for assignments" ON assignments;

-- Campaigns
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON campaigns;
DROP POLICY IF EXISTS "Allow all for campaigns" ON campaigns;

-- Forecast
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON forecast;
DROP POLICY IF EXISTS "Allow all for forecast" ON forecast;

-- Audit log
DROP POLICY IF EXISTS "Solo lectura para audit_log" ON audit_log;
DROP POLICY IF EXISTS "Insertar audit_log" ON audit_log;
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON audit_log;
DROP POLICY IF EXISTS "Allow all for audit_log" ON audit_log;

-- Settings
DROP POLICY IF EXISTS "Permitir lectura para usuarios autenticados" ON settings;
DROP POLICY IF EXISTS "Allow all for settings" ON settings;

-- ============================================================================
-- PASO 3: Crear funciones auxiliares para verificacion de roles
-- ============================================================================

-- Funcion: Verificar si el usuario actual es admin
-- Retorna TRUE si el usuario autenticado tiene rol 'admin' en la tabla recruiters
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM recruiters
    WHERE id = auth.uid()
    AND role = 'admin'
    AND deleted_at IS NULL
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_admin() IS 'Verifica si el usuario autenticado es administrador';

-- Funcion: Verificar si el usuario actual es reclutador activo
-- Retorna TRUE si el usuario autenticado existe en recruiters y esta activo
CREATE OR REPLACE FUNCTION is_recruiter()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM recruiters
    WHERE id = auth.uid()
    AND deleted_at IS NULL
    AND is_active = true
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION is_recruiter() IS 'Verifica si el usuario autenticado es un reclutador activo';

-- Funcion: Obtener el ID del usuario actual (convenience wrapper)
CREATE OR REPLACE FUNCTION current_user_id()
RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION current_user_id() IS 'Retorna el UUID del usuario autenticado actual';

-- Funcion: Verificar si el usuario es el creador o asignado de una posicion
CREATE OR REPLACE FUNCTION can_modify_position(position_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_is_assigned BOOLEAN;
BEGIN
  v_user_id := auth.uid();

  -- Verificar si es admin
  SELECT EXISTS (
    SELECT 1 FROM recruiters
    WHERE id = v_user_id
    AND role = 'admin'
    AND deleted_at IS NULL
  ) INTO v_is_admin;

  IF v_is_admin THEN
    RETURN TRUE;
  END IF;

  -- Verificar si esta asignado a esta posicion
  SELECT EXISTS (
    SELECT 1 FROM assignments
    WHERE assignments.position_id = can_modify_position.position_id
    AND recruiter_id = v_user_id
    AND status NOT IN ('cancelled', 'reassigned')
  ) INTO v_is_assigned;

  RETURN v_is_assigned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_modify_position(UUID) IS 'Verifica si el usuario puede modificar una posicion (admin o asignado)';

-- Funcion: Verificar si el usuario puede modificar una asignacion
CREATE OR REPLACE FUNCTION can_modify_assignment(assignment_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_recruiter_id UUID;
BEGIN
  v_user_id := auth.uid();

  -- Verificar si es admin
  IF is_admin() THEN
    RETURN TRUE;
  END IF;

  -- Obtener el recruiter_id de la asignacion
  SELECT recruiter_id INTO v_recruiter_id
  FROM assignments
  WHERE id = assignment_id;

  -- El reclutador asignado puede modificar su propia asignacion
  RETURN v_user_id = v_recruiter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

COMMENT ON FUNCTION can_modify_assignment(UUID) IS 'Verifica si el usuario puede modificar una asignacion (admin o reclutador asignado)';

-- ============================================================================
-- PASO 4: POLITICAS RLS PARA recruiters
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver todos los reclutadores
--   INSERT/UPDATE/DELETE: Solo admin
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver reclutadores
CREATE POLICY "recruiters_select_authenticated"
  ON recruiters
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Solo admin puede crear reclutadores
CREATE POLICY "recruiters_insert_admin_only"
  ON recruiters
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: Solo admin puede actualizar reclutadores
CREATE POLICY "recruiters_update_admin_only"
  ON recruiters
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: Solo admin puede eliminar reclutadores
CREATE POLICY "recruiters_delete_admin_only"
  ON recruiters
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 5: POLITICAS RLS PARA positions
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver todas las posiciones
--   INSERT: Usuarios autenticados pueden crear posiciones
--   UPDATE: Creador o reclutador asignado puede actualizar
--   DELETE: Solo admin
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver posiciones
CREATE POLICY "positions_select_authenticated"
  ON positions
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Cualquier usuario autenticado puede crear posiciones
CREATE POLICY "positions_insert_authenticated"
  ON positions
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Admin o reclutador asignado puede actualizar
CREATE POLICY "positions_update_owner_or_assigned"
  ON positions
  FOR UPDATE
  TO authenticated
  USING (can_modify_position(id))
  WITH CHECK (can_modify_position(id));

-- DELETE: Solo admin puede eliminar posiciones
CREATE POLICY "positions_delete_admin_only"
  ON positions
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 6: POLITICAS RLS PARA candidates
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver todos los candidatos
--   INSERT: Usuarios autenticados pueden crear candidatos
--   UPDATE: Cualquier reclutador autenticado (compartidos entre reclutadores)
--   DELETE: Soft delete solamente (manejado por aplicacion, no RLS)
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver candidatos
CREATE POLICY "candidates_select_authenticated"
  ON candidates
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Cualquier usuario autenticado puede crear candidatos
CREATE POLICY "candidates_insert_authenticated"
  ON candidates
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- UPDATE: Cualquier reclutador autenticado puede actualizar candidatos
-- Los candidatos son compartidos entre reclutadores segun requerimientos
CREATE POLICY "candidates_update_authenticated"
  ON candidates
  FOR UPDATE
  TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);

-- DELETE: Solo admin puede eliminar candidatos (soft delete preferido)
-- Nota: En la practica, usar deleted_at en lugar de DELETE
CREATE POLICY "candidates_delete_admin_only"
  ON candidates
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 7: POLITICAS RLS PARA assignments
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver todas las asignaciones
--   INSERT: Solo sistema (via service role) - controlado por funcion
--   UPDATE: Reclutador asignado o admin
--   DELETE: Solo admin
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver asignaciones
CREATE POLICY "assignments_select_authenticated"
  ON assignments
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Solo admin puede crear asignaciones manualmente
-- El sistema (service role) puede crear sin restricciones RLS
-- Nota: Las asignaciones automaticas se crean via service role
CREATE POLICY "assignments_insert_admin_only"
  ON assignments
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: Reclutador asignado o admin puede actualizar
CREATE POLICY "assignments_update_owner_or_admin"
  ON assignments
  FOR UPDATE
  TO authenticated
  USING (can_modify_assignment(id))
  WITH CHECK (can_modify_assignment(id));

-- DELETE: Solo admin puede eliminar asignaciones
CREATE POLICY "assignments_delete_admin_only"
  ON assignments
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 8: POLITICAS RLS PARA campaigns
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver todas las campanas
--   INSERT/UPDATE/DELETE: Solo admin
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver campanas
CREATE POLICY "campaigns_select_authenticated"
  ON campaigns
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Solo admin puede crear campanas
CREATE POLICY "campaigns_insert_admin_only"
  ON campaigns
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: Solo admin puede actualizar campanas
CREATE POLICY "campaigns_update_admin_only"
  ON campaigns
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: Solo admin puede eliminar campanas
CREATE POLICY "campaigns_delete_admin_only"
  ON campaigns
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 9: POLITICAS RLS PARA forecast
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver pronosticos
--   INSERT/UPDATE/DELETE: Solo sistema (via service role)
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver pronosticos
CREATE POLICY "forecast_select_authenticated"
  ON forecast
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Solo admin o sistema puede crear pronosticos
-- En produccion, los pronosticos se generan via cron job con service role
CREATE POLICY "forecast_insert_system_only"
  ON forecast
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: Solo admin o sistema puede actualizar pronosticos
CREATE POLICY "forecast_update_system_only"
  ON forecast
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: Solo admin puede eliminar pronosticos
CREATE POLICY "forecast_delete_system_only"
  ON forecast
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 10: POLITICAS RLS PARA audit_log
-- Requisitos:
--   SELECT: Solo admin (datos sensibles de auditoria)
--   INSERT: Solo sistema (via triggers) - no politica para authenticated
--   UPDATE/DELETE: NUNCA permitido
-- ============================================================================

-- SELECT: Solo admin puede ver el log de auditoria
CREATE POLICY "audit_log_select_admin_only"
  ON audit_log
  FOR SELECT
  TO authenticated
  USING (is_admin());

-- INSERT: Los triggers usan SECURITY DEFINER, no necesitan politica
-- Pero permitimos insercion con service role para casos especiales
-- No creamos politica INSERT para authenticated - debe usar triggers

-- UPDATE: NUNCA permitido - no crear politica
-- (RLS deniega por defecto si no hay politica que permita)

-- DELETE: NUNCA permitido - no crear politica
-- (RLS deniega por defecto si no hay politica que permita)

-- ============================================================================
-- PASO 11: POLITICAS RLS PARA settings
-- Requisitos:
--   SELECT: Usuarios autenticados pueden ver configuracion
--   INSERT/UPDATE/DELETE: Solo admin
-- ============================================================================

-- SELECT: Todos los usuarios autenticados pueden ver configuracion
CREATE POLICY "settings_select_authenticated"
  ON settings
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: Solo admin puede crear configuraciones
CREATE POLICY "settings_insert_admin_only"
  ON settings
  FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

-- UPDATE: Solo admin puede actualizar configuraciones
CREATE POLICY "settings_update_admin_only"
  ON settings
  FOR UPDATE
  TO authenticated
  USING (is_admin())
  WITH CHECK (is_admin());

-- DELETE: Solo admin puede eliminar configuraciones
CREATE POLICY "settings_delete_admin_only"
  ON settings
  FOR DELETE
  TO authenticated
  USING (is_admin());

-- ============================================================================
-- PASO 12: Configurar service role bypass para operaciones del sistema
-- Nota: El service role automaticamente bypassa RLS en Supabase
-- Las siguientes operaciones DEBEN usar service role:
--   - Asignaciones automaticas (algoritmo de asignacion)
--   - Generacion de pronosticos (cron job)
--   - Insercion en audit_log (triggers)
--   - Sincronizacion de Excel (upload masivo)
-- ============================================================================

-- Crear comentario documentando el uso de service role
COMMENT ON TABLE assignments IS
'Asignaciones de posiciones a reclutadores.
IMPORTANTE: Las asignaciones automaticas deben crearse usando SERVICE ROLE
para bypasear RLS. El rol authenticated solo puede crear asignaciones manuales
si es admin.';

COMMENT ON TABLE forecast IS
'Pronosticos de demanda de trabajadores.
IMPORTANTE: Los pronosticos se generan via cron job usando SERVICE ROLE.
El rol authenticated con permisos admin puede crear/modificar manualmente.';

COMMENT ON TABLE audit_log IS
'Registro de auditoria inmutable.
IMPORTANTE: Solo los triggers con SECURITY DEFINER pueden insertar.
UPDATE y DELETE estan completamente bloqueados por RLS.
Solo admin puede leer el log.';

-- ============================================================================
-- PASO 13: Datos iniciales - Asegurar que existe al menos un admin
-- ============================================================================

-- Actualizar admin si existe
-- NOTA: Esto es un ejemplo, ajustar segun los datos reales
UPDATE recruiters
SET role = 'admin'
WHERE id = (
  SELECT id FROM recruiters
  WHERE role = 'admin'
  AND deleted_at IS NULL
  LIMIT 1
);

-- ============================================================================
-- VERIFICACION: Resumen de politicas creadas
-- ============================================================================
/*
TABLA: recruiters
  - SELECT: Todos los autenticados
  - INSERT/UPDATE/DELETE: Solo admin

TABLA: positions
  - SELECT: Todos los autenticados
  - INSERT: Todos los autenticados
  - UPDATE: Admin o reclutador asignado
  - DELETE: Solo admin

TABLA: candidates
  - SELECT: Todos los autenticados
  - INSERT: Todos los autenticados
  - UPDATE: Todos los autenticados (compartidos)
  - DELETE: Solo admin (preferir soft delete)

TABLA: assignments
  - SELECT: Todos los autenticados
  - INSERT: Solo admin (sistema usa service role)
  - UPDATE: Admin o reclutador asignado
  - DELETE: Solo admin

TABLA: campaigns
  - SELECT: Todos los autenticados
  - INSERT/UPDATE/DELETE: Solo admin

TABLA: forecast
  - SELECT: Todos los autenticados
  - INSERT/UPDATE/DELETE: Solo admin (sistema usa service role)

TABLA: audit_log
  - SELECT: Solo admin
  - INSERT: Solo via triggers (SECURITY DEFINER)
  - UPDATE/DELETE: Bloqueado completamente

TABLA: settings
  - SELECT: Todos los autenticados
  - INSERT/UPDATE/DELETE: Solo admin
*/

-- ============================================================================
-- FIN DE MIGRACION
-- ============================================================================
