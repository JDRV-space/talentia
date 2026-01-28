-- ============================================================================
-- TALENTIA - FULL MIGRATION
-- Run this in Supabase SQL Editor
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ============================================================================
-- TABLA: recruiters
-- ============================================================================
CREATE TABLE recruiters (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),
    primary_zone VARCHAR(100) NOT NULL,
    secondary_zones VARCHAR(100)[] DEFAULT '{}',
    capability_level INTEGER NOT NULL DEFAULT 1 CHECK (capability_level BETWEEN 1 AND 5),
    capabilities VARCHAR(50)[] DEFAULT ARRAY['operario'],
    fill_rate_30d DECIMAL(5,4) DEFAULT 0.5,
    avg_time_to_fill INTEGER DEFAULT 0,
    current_load INTEGER DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    manager_id UUID REFERENCES recruiters(id),
    role VARCHAR(50) NOT NULL DEFAULT 'recruiter' CHECK (role IN ('admin', 'recruiter', 'viewer')),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

CREATE INDEX idx_recruiters_primary_zone ON recruiters(primary_zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruiters_is_active ON recruiters(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruiters_capability_level ON recruiters(capability_level) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_recruiters_email_unique ON recruiters(email) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruiters_role ON recruiters(role) WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLA: positions
-- ============================================================================
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    external_id VARCHAR(100),
    fingerprint VARCHAR(64),
    title VARCHAR(255) NOT NULL,
    description TEXT,
    zone VARCHAR(100) NOT NULL,
    level VARCHAR(50) NOT NULL DEFAULT 'operario',
    priority VARCHAR(10) NOT NULL DEFAULT 'P2' CHECK (priority IN ('P1', 'P2', 'P3')),
    sla_days INTEGER NOT NULL DEFAULT 7,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    is_urgent BOOLEAN DEFAULT false,
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN (
        'open', 'assigned', 'in_progress', 'interviewing', 'offer_sent', 'filled', 'cancelled', 'on_hold'
    )),
    headcount INTEGER NOT NULL DEFAULT 1,
    filled_count INTEGER DEFAULT 0,
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    days_to_fill INTEGER,
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'consolidado', 'api')),
    upload_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_positions_zone ON positions(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_status ON positions(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_priority ON positions(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_level ON positions(level) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_sla_deadline ON positions(sla_deadline) WHERE deleted_at IS NULL AND status NOT IN ('filled', 'cancelled');
CREATE INDEX idx_positions_external_id ON positions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_positions_fingerprint ON positions(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_positions_opened_at ON positions(opened_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_title_trgm ON positions USING gin(title gin_trgm_ops);

-- ============================================================================
-- TABLA: candidates
-- ============================================================================
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    dni VARCHAR(20),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(150) NOT NULL,
    maternal_last_name VARCHAR(100),
    full_name VARCHAR(255) GENERATED ALWAYS AS (
        first_name || ' ' || last_name || COALESCE(' ' || maternal_last_name, '')
    ) STORED,
    phone VARCHAR(20) NOT NULL,
    phone_normalized VARCHAR(20) NOT NULL,
    email VARCHAR(255),
    name_phonetic VARCHAR(100),
    zone VARCHAR(100),
    address TEXT,
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN (
        'available', 'contacted', 'interviewing', 'hired', 'rejected', 'blacklisted', 'inactive'
    )),
    times_hired INTEGER DEFAULT 0,
    last_hired_at TIMESTAMP WITH TIME ZONE,
    last_contacted_at TIMESTAMP WITH TIME ZONE,
    notes TEXT,
    tags VARCHAR(50)[] DEFAULT '{}',
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'consolidado', 'referral', 'api')),
    upload_id UUID,
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES candidates(id),
    dedup_reviewed BOOLEAN DEFAULT false,
    dedup_reviewed_at TIMESTAMP WITH TIME ZONE,
    dedup_reviewed_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_candidates_phone_normalized ON candidates(phone_normalized) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_candidates_dni_unique ON candidates(dni) WHERE deleted_at IS NULL AND dni IS NOT NULL;
CREATE INDEX idx_candidates_zone ON candidates(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_status ON candidates(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_last_name ON candidates(last_name) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_full_name_trgm ON candidates USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_candidates_name_phonetic ON candidates(name_phonetic) WHERE name_phonetic IS NOT NULL;
CREATE INDEX idx_candidates_is_duplicate ON candidates(is_duplicate) WHERE is_duplicate = true;

-- ============================================================================
-- TABLA: assignments
-- ============================================================================
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES recruiters(id) ON DELETE RESTRICT,
    score DECIMAL(5,4) NOT NULL,
    score_breakdown JSONB,
    explanation_es TEXT NOT NULL,
    assignment_type VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK (assignment_type IN (
        'auto', 'manual', 'fallback', 'reassigned'
    )),
    fallback_reason VARCHAR(100),
    status VARCHAR(50) NOT NULL DEFAULT 'assigned' CHECK (status IN (
        'assigned', 'accepted', 'in_progress', 'completed', 'reassigned', 'cancelled'
    )),
    current_stage VARCHAR(50) DEFAULT 'assigned' CHECK (current_stage IN (
        'assigned', 'first_contact', 'first_interview_scheduled', 'interview_completed', 'decision_made', 'offer_sent', 'completed'
    )),
    stage_entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    notes TEXT,
    override_reason TEXT,
    reassigned_from UUID REFERENCES recruiters(id),
    reassigned_at TIMESTAMP WITH TIME ZONE,
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_assignments_position_id ON assignments(position_id);
CREATE INDEX idx_assignments_recruiter_id ON assignments(recruiter_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_current_stage ON assignments(current_stage) WHERE status IN ('assigned', 'accepted', 'in_progress');
CREATE INDEX idx_assignments_assigned_at ON assignments(assigned_at DESC);
CREATE UNIQUE INDEX idx_assignments_unique_active ON assignments(position_id) WHERE status NOT IN ('reassigned', 'cancelled');

-- ============================================================================
-- TABLA: campaigns
-- ============================================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),
    crop VARCHAR(100) NOT NULL,
    zone VARCHAR(100) NOT NULL,
    production_kg DECIMAL(12,2) NOT NULL,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    estimated_workers INTEGER,
    kg_per_worker_day DECIMAL(8,2),
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN ('planned', 'recruiting', 'active', 'completed')),
    source VARCHAR(50) DEFAULT 'picos' CHECK (source IN ('picos', 'manual', 'api')),
    upload_id UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

CREATE INDEX idx_campaigns_year_week ON campaigns(year, week_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_crop ON campaigns(crop) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_zone ON campaigns(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_start_date ON campaigns(start_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_campaigns_unique ON campaigns(year, week_number, crop, zone) WHERE deleted_at IS NULL;

-- ============================================================================
-- TABLA: forecast
-- ============================================================================
CREATE TABLE forecast (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    target_date DATE NOT NULL,
    predicted_workers INTEGER NOT NULL,
    confidence_lower INTEGER NOT NULL,
    confidence_upper INTEGER NOT NULL,
    confidence_level DECIMAL(3,2) DEFAULT 0.95,
    breakdown JSONB NOT NULL,
    by_crop JSONB,
    by_zone JSONB,
    model_quality JSONB,
    alerts JSONB DEFAULT '[]',
    lead_time_days INTEGER DEFAULT 30,
    data_source VARCHAR(50) DEFAULT 'automatic',
    campaign_ids UUID[] DEFAULT '{}',
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecast_target_date ON forecast(target_date);
CREATE INDEX idx_forecast_generated_at ON forecast(generated_at DESC);
CREATE UNIQUE INDEX idx_forecast_unique_date ON forecast(target_date);

-- ============================================================================
-- TABLA: audit_log
-- ============================================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_id UUID,
    actor_type VARCHAR(50) NOT NULL DEFAULT 'system' CHECK (actor_type IN ('user', 'recruiter', 'system', 'cron')),
    actor_name VARCHAR(255),
    action VARCHAR(100) NOT NULL,
    action_category VARCHAR(50),
    entity_type VARCHAR(50) NOT NULL,
    entity_id UUID,
    details JSONB,
    previous_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action_category ON audit_log(action_category) WHERE action_category IS NOT NULL;
CREATE INDEX idx_audit_log_details ON audit_log USING gin(details jsonb_path_ops);

-- ============================================================================
-- TABLA: settings
-- ============================================================================
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value JSONB NOT NULL,
    description TEXT,
    category VARCHAR(50),
    is_system BOOLEAN DEFAULT false,
    last_modified_by UUID,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settings_category ON settings(category) WHERE category IS NOT NULL;

-- ============================================================================
-- DATOS INICIALES
-- ============================================================================
INSERT INTO settings (key, value, description, category, is_system) VALUES
('assignment_weights', '{"zone": 0.40, "load": 0.30, "capability": 0.20, "performance": 0.10}'::jsonb, 'Pesos para el algoritmo de asignacion automatica', 'assignment', false),
('sla_config', '{"P1": {"days": 3, "label": "Urgente"}, "P2": {"days": 7, "label": "Normal"}, "P3": {"days": 14, "label": "Baja"}}'::jsonb, 'Dias de SLA por nivel de prioridad', 'sla', false),
('recruiter_capacity', '{"hard_cap": 25, "soft_warning": 20}'::jsonb, 'Limite de posiciones activas por reclutador', 'assignment', false),
('dedup_thresholds', '{"phone_exact": 0.99, "name_high": 0.90, "name_medium": 0.80, "auto_merge_threshold": 0.95, "review_threshold": 0.80}'::jsonb, 'Umbrales de confianza para deduplicacion de candidatos', 'dedup', false),
('crop_productivity', '{"esparrago": 45, "arandano": 25, "palta": 80, "uva": 60, "default": 50}'::jsonb, 'Kilogramos por trabajador por dia por cultivo', 'forecast', false),
('forecast_config', '{"lead_time_days": 30, "confidence_level": 0.95, "trend_years": 3}'::jsonb, 'Configuracion del motor de pronostico', 'forecast', false);

-- ============================================================================
-- FUNCIONES Y TRIGGERS
-- ============================================================================

-- Funcion: Actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_recruiters_updated_at BEFORE UPDATE ON recruiters FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_forecast_updated_at BEFORE UPDATE ON forecast FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Funcion: Normalizar telefono peruano
CREATE OR REPLACE FUNCTION normalize_peru_phone(phone_input VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    cleaned VARCHAR;
BEGIN
    cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');
    IF LEFT(cleaned, 2) = '51' AND LENGTH(cleaned) > 9 THEN
        cleaned := SUBSTRING(cleaned FROM 3);
    END IF;
    IF LEFT(cleaned, 1) = '0' THEN
        cleaned := SUBSTRING(cleaned FROM 2);
    END IF;
    RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

CREATE OR REPLACE FUNCTION normalize_candidate_phone()
RETURNS TRIGGER AS $$
BEGIN
    NEW.phone_normalized := normalize_peru_phone(NEW.phone);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_normalize_candidate_phone
    BEFORE INSERT OR UPDATE OF phone ON candidates
    FOR EACH ROW EXECUTE FUNCTION normalize_candidate_phone();

-- ============================================================================
-- AUDIT TRIGGERS
-- ============================================================================
CREATE OR REPLACE FUNCTION audit_trigger_func()
RETURNS TRIGGER AS $$
DECLARE
    v_actor_id UUID;
    v_actor_type VARCHAR(50);
    v_entity_id UUID;
BEGIN
    BEGIN
        v_actor_id := auth.uid();
    EXCEPTION WHEN OTHERS THEN
        v_actor_id := NULL;
    END;

    IF v_actor_id IS NULL THEN
        v_actor_type := 'system';
        v_actor_id := '00000000-0000-0000-0000-000000000000'::UUID;
    ELSE
        v_actor_type := 'user';
    END IF;

    IF TG_OP = 'DELETE' THEN
        v_entity_id := OLD.id;
    ELSE
        v_entity_id := NEW.id;
    END IF;

    INSERT INTO audit_log (actor_id, actor_type, action, action_category, entity_type, entity_id, previous_values, new_values, created_at)
    VALUES (
        v_actor_id,
        v_actor_type,
        TG_OP,
        TG_TABLE_NAME,
        TG_TABLE_NAME,
        v_entity_id,
        CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) ELSE NULL END,
        CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) ELSE NULL END,
        NOW()
    );

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    ELSE
        RETURN NEW;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER audit_recruiters_insert AFTER INSERT ON recruiters FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_recruiters_update AFTER UPDATE ON recruiters FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_recruiters_delete AFTER DELETE ON recruiters FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_positions_insert AFTER INSERT ON positions FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_positions_update AFTER UPDATE ON positions FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_positions_delete AFTER DELETE ON positions FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_candidates_insert AFTER INSERT ON candidates FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_candidates_update AFTER UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_candidates_delete AFTER DELETE ON candidates FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_assignments_insert AFTER INSERT ON assignments FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_assignments_update AFTER UPDATE ON assignments FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_assignments_delete AFTER DELETE ON assignments FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_campaigns_insert AFTER INSERT ON campaigns FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_campaigns_update AFTER UPDATE ON campaigns FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();
CREATE TRIGGER audit_campaigns_delete AFTER DELETE ON campaigns FOR EACH ROW EXECUTE FUNCTION audit_trigger_func();

-- ============================================================================
-- VISTAS
-- ============================================================================
CREATE VIEW active_recruiters AS SELECT * FROM recruiters WHERE deleted_at IS NULL AND is_active = true;
CREATE VIEW active_positions AS SELECT * FROM positions WHERE deleted_at IS NULL AND status NOT IN ('filled', 'cancelled');
CREATE VIEW available_candidates AS SELECT * FROM candidates WHERE deleted_at IS NULL AND status = 'available' AND is_duplicate = false;
CREATE VIEW upcoming_campaigns AS SELECT * FROM campaigns WHERE deleted_at IS NULL AND start_date > CURRENT_DATE AND status IN ('planned', 'recruiting');

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
ALTER TABLE recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Helper functions
CREATE OR REPLACE FUNCTION is_admin() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM recruiters WHERE id = auth.uid() AND role = 'admin' AND deleted_at IS NULL AND is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION is_recruiter() RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (SELECT 1 FROM recruiters WHERE id = auth.uid() AND deleted_at IS NULL AND is_active = true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION current_user_id() RETURNS UUID AS $$
BEGIN
  RETURN auth.uid();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_modify_position(position_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_is_admin BOOLEAN;
  v_is_assigned BOOLEAN;
BEGIN
  v_user_id := auth.uid();
  SELECT EXISTS (SELECT 1 FROM recruiters WHERE id = v_user_id AND role = 'admin' AND deleted_at IS NULL) INTO v_is_admin;
  IF v_is_admin THEN RETURN TRUE; END IF;
  SELECT EXISTS (SELECT 1 FROM assignments WHERE assignments.position_id = can_modify_position.position_id AND recruiter_id = v_user_id AND status NOT IN ('cancelled', 'reassigned')) INTO v_is_assigned;
  RETURN v_is_assigned;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

CREATE OR REPLACE FUNCTION can_modify_assignment(assignment_id UUID) RETURNS BOOLEAN AS $$
DECLARE
  v_user_id UUID;
  v_recruiter_id UUID;
BEGIN
  v_user_id := auth.uid();
  IF is_admin() THEN RETURN TRUE; END IF;
  SELECT recruiter_id INTO v_recruiter_id FROM assignments WHERE id = assignment_id;
  RETURN v_user_id = v_recruiter_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- RLS Policies
CREATE POLICY "recruiters_select_authenticated" ON recruiters FOR SELECT TO authenticated USING (true);
CREATE POLICY "recruiters_insert_admin_only" ON recruiters FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "recruiters_update_admin_only" ON recruiters FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "recruiters_delete_admin_only" ON recruiters FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "positions_select_authenticated" ON positions FOR SELECT TO authenticated USING (true);
CREATE POLICY "positions_insert_authenticated" ON positions FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "positions_update_owner_or_assigned" ON positions FOR UPDATE TO authenticated USING (can_modify_position(id)) WITH CHECK (can_modify_position(id));
CREATE POLICY "positions_delete_admin_only" ON positions FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "candidates_select_authenticated" ON candidates FOR SELECT TO authenticated USING (true);
CREATE POLICY "candidates_insert_authenticated" ON candidates FOR INSERT TO authenticated WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "candidates_update_authenticated" ON candidates FOR UPDATE TO authenticated USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL);
CREATE POLICY "candidates_delete_admin_only" ON candidates FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "assignments_select_authenticated" ON assignments FOR SELECT TO authenticated USING (true);
CREATE POLICY "assignments_insert_admin_only" ON assignments FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "assignments_update_owner_or_admin" ON assignments FOR UPDATE TO authenticated USING (can_modify_assignment(id)) WITH CHECK (can_modify_assignment(id));
CREATE POLICY "assignments_delete_admin_only" ON assignments FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "campaigns_select_authenticated" ON campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "campaigns_insert_admin_only" ON campaigns FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "campaigns_update_admin_only" ON campaigns FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "campaigns_delete_admin_only" ON campaigns FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "forecast_select_authenticated" ON forecast FOR SELECT TO authenticated USING (true);
CREATE POLICY "forecast_insert_system_only" ON forecast FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "forecast_update_system_only" ON forecast FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "forecast_delete_system_only" ON forecast FOR DELETE TO authenticated USING (is_admin());

CREATE POLICY "audit_log_select_admin_only" ON audit_log FOR SELECT TO authenticated USING (is_admin());

CREATE POLICY "settings_select_authenticated" ON settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "settings_insert_admin_only" ON settings FOR INSERT TO authenticated WITH CHECK (is_admin());
CREATE POLICY "settings_update_admin_only" ON settings FOR UPDATE TO authenticated USING (is_admin()) WITH CHECK (is_admin());
CREATE POLICY "settings_delete_admin_only" ON settings FOR DELETE TO authenticated USING (is_admin());

-- ============================================================================
-- DONE!
-- ============================================================================
