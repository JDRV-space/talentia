-- ============================================================================
-- TALENTIA - ESQUEMA INICIAL DE BASE DE DATOS
-- Migracion: 001_initial_schema.sql
-- Fecha: 2026-01-08
-- Descripcion: Esquema completo para el sistema de reclutamiento
-- ============================================================================

-- Habilitar extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";      -- Para generacion de UUIDs
CREATE EXTENSION IF NOT EXISTS "pg_trgm";        -- Para busqueda por trigramas (nombres)
CREATE EXTENSION IF NOT EXISTS "unaccent";       -- Para normalizar acentos en busquedas

-- ============================================================================
-- TABLA: recruiters
-- Descripcion: Almacena los reclutadores del sistema con sus zonas asignadas
--              y niveles de capacidad (1-5) para diferentes tipos de posiciones
-- ============================================================================
CREATE TABLE recruiters (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Datos personales
    name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    phone VARCHAR(20),

    -- Asignacion de zona y capacidades
    -- La zona primaria determina las posiciones que se asignan automaticamente
    primary_zone VARCHAR(100) NOT NULL,
    -- Zonas secundarias que puede cubrir en caso de overflow
    secondary_zones VARCHAR(100)[] DEFAULT '{}',

    -- Niveles de capacidad para diferentes tipos de posiciones (1-5)
    -- 1 = Solo operario, 5 = Puede manejar hasta Jefe
    capability_level INTEGER NOT NULL DEFAULT 1 CHECK (capability_level BETWEEN 1 AND 5),
    -- Lista de tipos de posicion que puede manejar
    capabilities VARCHAR(50)[] DEFAULT ARRAY['operario'],

    -- Metricas de rendimiento (actualizadas por cron jobs)
    fill_rate_30d DECIMAL(5,4) DEFAULT 0.5,      -- Tasa de colocacion ultimos 30 dias
    avg_time_to_fill INTEGER DEFAULT 0,          -- Dias promedio para llenar posicion
    current_load INTEGER DEFAULT 0,               -- Posiciones activas actuales

    -- Estado
    is_active BOOLEAN NOT NULL DEFAULT true,
    manager_id UUID REFERENCES recruiters(id),   -- Para escalaciones

    -- Timestamps y soft delete
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE,

    -- Constraints
    CONSTRAINT valid_email CHECK (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$'),
    CONSTRAINT valid_capability_level CHECK (capability_level >= 1 AND capability_level <= 5)
);

-- Indices para recruiters
CREATE INDEX idx_recruiters_primary_zone ON recruiters(primary_zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruiters_is_active ON recruiters(is_active) WHERE deleted_at IS NULL;
CREATE INDEX idx_recruiters_capability_level ON recruiters(capability_level) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_recruiters_email_unique ON recruiters(email) WHERE deleted_at IS NULL;

-- Comentario de tabla
COMMENT ON TABLE recruiters IS 'Reclutadores del sistema con zonas y capacidades asignadas';
COMMENT ON COLUMN recruiters.capability_level IS 'Nivel de capacidad 1-5: 1=Operario, 2=Tecnico, 3=Supervisor, 4=Jefe, 5=Gerente';
COMMENT ON COLUMN recruiters.fill_rate_30d IS 'Tasa de colocacion exitosa en los ultimos 30 dias (0.0 a 1.0)';

-- ============================================================================
-- TABLA: positions
-- Descripcion: Posiciones de trabajo con titulo, zona, prioridad y fechas SLA
--              Importadas desde CONSOLIDADO.xlsx
-- ============================================================================
CREATE TABLE positions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificador externo (de Excel)
    external_id VARCHAR(100),
    fingerprint VARCHAR(64),  -- Hash para detectar cambios en sincronizacion

    -- Informacion de la posicion
    title VARCHAR(255) NOT NULL,
    description TEXT,
    zone VARCHAR(100) NOT NULL,

    -- Nivel de la posicion
    level VARCHAR(50) NOT NULL DEFAULT 'operario',

    -- Prioridad y SLA
    -- P1 = 3 dias, P2 = 7 dias, P3 = 14 dias
    priority VARCHAR(10) NOT NULL DEFAULT 'P2' CHECK (priority IN ('P1', 'P2', 'P3')),
    sla_days INTEGER NOT NULL DEFAULT 7,
    sla_deadline TIMESTAMP WITH TIME ZONE,
    is_urgent BOOLEAN DEFAULT false,

    -- Estado del proceso
    status VARCHAR(50) NOT NULL DEFAULT 'open' CHECK (status IN (
        'open',           -- Nueva, sin asignar
        'assigned',       -- Asignada a reclutador
        'in_progress',    -- En proceso de reclutamiento
        'interviewing',   -- En etapa de entrevistas
        'offer_sent',     -- Oferta enviada
        'filled',         -- Posicion cubierta
        'cancelled',      -- Cancelada
        'on_hold'         -- En pausa
    )),

    -- Cantidad requerida
    headcount INTEGER NOT NULL DEFAULT 1,
    filled_count INTEGER DEFAULT 0,

    -- Fechas importantes
    opened_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    assigned_at TIMESTAMP WITH TIME ZONE,
    closed_at TIMESTAMP WITH TIME ZONE,
    days_to_fill INTEGER,  -- Calculado al cerrar

    -- Fuente de datos
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'consolidado', 'api')),
    upload_id UUID,  -- Referencia al batch de carga

    -- Timestamps y soft delete
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indices para positions
CREATE INDEX idx_positions_zone ON positions(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_status ON positions(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_priority ON positions(priority) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_level ON positions(level) WHERE deleted_at IS NULL;
CREATE INDEX idx_positions_sla_deadline ON positions(sla_deadline) WHERE deleted_at IS NULL AND status NOT IN ('filled', 'cancelled');
CREATE INDEX idx_positions_external_id ON positions(external_id) WHERE external_id IS NOT NULL;
CREATE INDEX idx_positions_fingerprint ON positions(fingerprint) WHERE fingerprint IS NOT NULL;
CREATE INDEX idx_positions_opened_at ON positions(opened_at DESC) WHERE deleted_at IS NULL;

-- Indice GIN para busqueda de texto en titulo
CREATE INDEX idx_positions_title_trgm ON positions USING gin(title gin_trgm_ops);

-- Comentario de tabla
COMMENT ON TABLE positions IS 'Posiciones de trabajo - importadas desde CONSOLIDADO o creadas manualmente';
COMMENT ON COLUMN positions.priority IS 'Prioridad: P1=3 dias, P2=7 dias, P3=14 dias';
COMMENT ON COLUMN positions.fingerprint IS 'Hash MD5 de campos clave para detectar cambios en sincronizacion Excel';

-- ============================================================================
-- TABLA: candidates
-- Descripcion: Base de datos de candidatos con telefono normalizado, nombre,
--              DNI e historial. Soporte para deduplicacion con fonetica espanola.
-- ============================================================================
CREATE TABLE candidates (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificacion
    dni VARCHAR(20),  -- Documento Nacional de Identidad (Peru)

    -- Datos personales
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(150) NOT NULL,       -- Apellido paterno
    maternal_last_name VARCHAR(100),        -- Apellido materno (comun en Peru)
    full_name VARCHAR(255) GENERATED ALWAYS AS (
        first_name || ' ' || last_name || COALESCE(' ' || maternal_last_name, '')
    ) STORED,

    -- Contacto - telefono normalizado sin codigo de pais
    phone VARCHAR(20) NOT NULL,
    phone_normalized VARCHAR(20) NOT NULL,  -- Solo digitos, sin prefijos
    email VARCHAR(255),

    -- Fonetica para deduplicacion (Soundex Espanol)
    name_phonetic VARCHAR(100),  -- Codigo fonetico del nombre completo

    -- Ubicacion
    zone VARCHAR(100),
    address TEXT,

    -- Estado del candidato
    status VARCHAR(50) DEFAULT 'available' CHECK (status IN (
        'available',      -- Disponible para contactar
        'contacted',      -- Ya contactado
        'interviewing',   -- En proceso de entrevista
        'hired',          -- Contratado
        'rejected',       -- Rechazado
        'blacklisted',    -- No contactar
        'inactive'        -- Inactivo
    )),

    -- Historial de contrataciones
    times_hired INTEGER DEFAULT 0,
    last_hired_at TIMESTAMP WITH TIME ZONE,
    last_contacted_at TIMESTAMP WITH TIME ZONE,

    -- Notas y metadata
    notes TEXT,
    tags VARCHAR(50)[] DEFAULT '{}',

    -- Fuente de datos
    source VARCHAR(50) DEFAULT 'manual' CHECK (source IN ('manual', 'consolidado', 'referral', 'api')),
    upload_id UUID,

    -- Deduplicacion
    is_duplicate BOOLEAN DEFAULT false,
    duplicate_of UUID REFERENCES candidates(id),
    dedup_reviewed BOOLEAN DEFAULT false,
    dedup_reviewed_at TIMESTAMP WITH TIME ZONE,
    dedup_reviewed_by UUID,

    -- Timestamps y soft delete
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indices para candidates
-- CRITICO: Indice de telefono normalizado para busqueda rapida de duplicados
CREATE INDEX idx_candidates_phone_normalized ON candidates(phone_normalized) WHERE deleted_at IS NULL;
CREATE UNIQUE INDEX idx_candidates_dni_unique ON candidates(dni) WHERE deleted_at IS NULL AND dni IS NOT NULL;
CREATE INDEX idx_candidates_zone ON candidates(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_status ON candidates(status) WHERE deleted_at IS NULL;
CREATE INDEX idx_candidates_last_name ON candidates(last_name) WHERE deleted_at IS NULL;

-- Indices para busqueda de texto (deduplicacion por nombre)
CREATE INDEX idx_candidates_full_name_trgm ON candidates USING gin(full_name gin_trgm_ops);
CREATE INDEX idx_candidates_name_phonetic ON candidates(name_phonetic) WHERE name_phonetic IS NOT NULL;

-- Indice para duplicados
CREATE INDEX idx_candidates_is_duplicate ON candidates(is_duplicate) WHERE is_duplicate = true;

-- Comentario de tabla
COMMENT ON TABLE candidates IS 'Base de datos de candidatos - 11,518+ registros historicos con soporte para deduplicacion';
COMMENT ON COLUMN candidates.phone_normalized IS 'Telefono normalizado: solo digitos, sin +51 ni ceros iniciales';
COMMENT ON COLUMN candidates.name_phonetic IS 'Codigo fonetico Soundex Espanol para deteccion de duplicados';

-- ============================================================================
-- TABLA: assignments
-- Descripcion: Vincula posiciones con reclutadores. Incluye puntuacion del
--              algoritmo de asignacion y explicacion en espanol.
-- ============================================================================
CREATE TABLE assignments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Relaciones
    position_id UUID NOT NULL REFERENCES positions(id) ON DELETE CASCADE,
    recruiter_id UUID NOT NULL REFERENCES recruiters(id) ON DELETE RESTRICT,

    -- Puntuacion del algoritmo
    score DECIMAL(5,4) NOT NULL,  -- Puntuacion total (0-1)
    score_breakdown JSONB,         -- Desglose: {zone: 0.4, load: 0.3, capability: 0.2, performance: 0.1}

    -- Explicacion legible
    explanation_es TEXT NOT NULL,  -- "Asignado por zona primaria, carga baja"

    -- Tipo de asignacion
    assignment_type VARCHAR(50) NOT NULL DEFAULT 'auto' CHECK (assignment_type IN (
        'auto',           -- Asignacion automatica por algoritmo
        'manual',         -- Asignacion manual por admin
        'fallback',       -- Asignacion por cadena de respaldo
        'reassigned'      -- Reasignado de otro reclutador
    )),
    fallback_reason VARCHAR(100),  -- Si es fallback, por que?

    -- Estado de la asignacion
    status VARCHAR(50) NOT NULL DEFAULT 'assigned' CHECK (status IN (
        'assigned',       -- Recien asignado
        'accepted',       -- Reclutador acepto
        'in_progress',    -- Trabajando activamente
        'completed',      -- Posicion llenada
        'reassigned',     -- Reasignado a otro
        'cancelled'       -- Cancelado
    )),

    -- Seguimiento de etapas (Process SLA)
    current_stage VARCHAR(50) DEFAULT 'assigned' CHECK (current_stage IN (
        'assigned',
        'first_contact',
        'first_interview_scheduled',
        'interview_completed',
        'decision_made',
        'offer_sent',
        'completed'
    )),
    stage_entered_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    -- Notas
    notes TEXT,
    override_reason TEXT,  -- Si fue override manual, por que?

    -- Reasignacion
    reassigned_from UUID REFERENCES recruiters(id),
    reassigned_at TIMESTAMP WITH TIME ZONE,

    -- Timestamps
    assigned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    accepted_at TIMESTAMP WITH TIME ZONE,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indices para assignments
CREATE INDEX idx_assignments_position_id ON assignments(position_id);
CREATE INDEX idx_assignments_recruiter_id ON assignments(recruiter_id);
CREATE INDEX idx_assignments_status ON assignments(status);
CREATE INDEX idx_assignments_current_stage ON assignments(current_stage) WHERE status IN ('assigned', 'accepted', 'in_progress');
CREATE INDEX idx_assignments_assigned_at ON assignments(assigned_at DESC);

-- Evitar asignaciones duplicadas activas
CREATE UNIQUE INDEX idx_assignments_unique_active ON assignments(position_id)
    WHERE status NOT IN ('reassigned', 'cancelled');

-- Comentario de tabla
COMMENT ON TABLE assignments IS 'Asignaciones de posiciones a reclutadores con puntuacion y explicacion';
COMMENT ON COLUMN assignments.score IS 'Puntuacion total del algoritmo (0-1): zone*0.4 + load*0.3 + capability*0.2 + performance*0.1';
COMMENT ON COLUMN assignments.score_breakdown IS 'Desglose JSON de componentes de puntuacion';

-- ============================================================================
-- TABLA: campaigns
-- Descripcion: Campanas de produccion importadas desde Picos.xlsx
--              Contiene cultivo, zona, fechas y kilogramos proyectados
-- ============================================================================
CREATE TABLE campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Identificacion de campana
    name VARCHAR(255) NOT NULL,
    year INTEGER NOT NULL,
    week_number INTEGER NOT NULL CHECK (week_number BETWEEN 1 AND 53),

    -- Detalles de produccion
    crop VARCHAR(100) NOT NULL,  -- esparrago, arandano, palta, etc.
    zone VARCHAR(100) NOT NULL,

    -- Produccion proyectada
    production_kg DECIMAL(12,2) NOT NULL,  -- Kilogramos proyectados

    -- Fechas de la campana
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,

    -- Calculo de trabajadores necesarios
    -- Basado en KG_PER_WORKER_DAY por cultivo
    estimated_workers INTEGER,
    kg_per_worker_day DECIMAL(8,2),  -- Productividad usada para calculo

    -- Estado
    status VARCHAR(50) DEFAULT 'planned' CHECK (status IN (
        'planned',        -- Planificada
        'recruiting',     -- En reclutamiento
        'active',         -- Campana activa
        'completed'       -- Completada
    )),

    -- Fuente de datos
    source VARCHAR(50) DEFAULT 'picos' CHECK (source IN ('picos', 'manual', 'api')),
    upload_id UUID,

    -- Timestamps y soft delete
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMP WITH TIME ZONE
);

-- Indices para campaigns
CREATE INDEX idx_campaigns_year_week ON campaigns(year, week_number) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_crop ON campaigns(crop) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_zone ON campaigns(zone) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_start_date ON campaigns(start_date) WHERE deleted_at IS NULL;
CREATE INDEX idx_campaigns_status ON campaigns(status) WHERE deleted_at IS NULL;

-- Indice unico para evitar duplicados de campana
CREATE UNIQUE INDEX idx_campaigns_unique ON campaigns(year, week_number, crop, zone) WHERE deleted_at IS NULL;

-- Comentario de tabla
COMMENT ON TABLE campaigns IS 'Campanas de produccion agricola - importadas desde Picos.xlsx anualmente';
COMMENT ON COLUMN campaigns.production_kg IS 'Produccion proyectada en kilogramos para la semana';
COMMENT ON COLUMN campaigns.kg_per_worker_day IS 'Productividad por cultivo: esparrago=45, arandano=25, palta=80';

-- ============================================================================
-- TABLA: forecast
-- Descripcion: Resultados del pronostico de demanda de trabajadores
--              Generado por forecast-v2.ts usando descomposicion estacional
-- ============================================================================
CREATE TABLE forecast (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Fecha objetivo del pronostico
    target_date DATE NOT NULL,

    -- Resultados del pronostico
    predicted_workers INTEGER NOT NULL,
    confidence_lower INTEGER NOT NULL,  -- Limite inferior del intervalo de confianza
    confidence_upper INTEGER NOT NULL,  -- Limite superior
    confidence_level DECIMAL(3,2) DEFAULT 0.95,  -- Nivel de confianza (95%)

    -- Desglose por componente
    breakdown JSONB NOT NULL,  -- {trend: 1.05, seasonal: 1.35, crop_adjustments: {...}}

    -- Desglose por cultivo
    by_crop JSONB,  -- {esparrago: 180, arandano: 65, palta: 30}

    -- Desglose por zona
    by_zone JSONB,  -- {Trujillo: 120, Viru: 80, Chao: 45}

    -- Calidad del modelo
    model_quality JSONB,  -- {r_squared: 0.82, mape: 0.15, rmse: 12.5}

    -- Alertas generadas
    alerts JSONB DEFAULT '[]',  -- [{type: 'high_demand', message: '...'}]

    -- Lead time usado (dias de anticipacion)
    lead_time_days INTEGER DEFAULT 30,

    -- Fuente de datos
    data_source VARCHAR(50) DEFAULT 'automatic',
    campaign_ids UUID[] DEFAULT '{}',  -- Campanas usadas para el pronostico

    -- Timestamps
    generated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indices para forecast
CREATE INDEX idx_forecast_target_date ON forecast(target_date);
CREATE INDEX idx_forecast_generated_at ON forecast(generated_at DESC);

-- Solo un pronostico activo por fecha
CREATE UNIQUE INDEX idx_forecast_unique_date ON forecast(target_date);

-- Comentario de tabla
COMMENT ON TABLE forecast IS 'Pronosticos de demanda de trabajadores - generados diariamente por cron';
COMMENT ON COLUMN forecast.breakdown IS 'Componentes: Y(t) = Trend(t) + Seasonal(t) + Residual(t)';
COMMENT ON COLUMN forecast.lead_time_days IS 'Dias de anticipacion para alertas de campana (default: 30)';

-- ============================================================================
-- TABLA: audit_log
-- Descripcion: Registro de todas las acciones del sistema
--              Quien, que, cuando, entidad afectada
-- ============================================================================
CREATE TABLE audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Quien realizo la accion
    actor_id UUID,                    -- NULL para acciones del sistema
    actor_type VARCHAR(50) NOT NULL DEFAULT 'system' CHECK (actor_type IN (
        'user',           -- Usuario humano
        'recruiter',      -- Reclutador
        'system',         -- Proceso automatico
        'cron'            -- Tarea programada
    )),
    actor_name VARCHAR(255),          -- Nombre para referencia rapida

    -- Que accion se realizo
    action VARCHAR(100) NOT NULL,     -- create, update, delete, assign, upload, etc.
    action_category VARCHAR(50),      -- position, candidate, assignment, settings, etc.

    -- Sobre que entidad
    entity_type VARCHAR(50) NOT NULL, -- positions, candidates, recruiters, etc.
    entity_id UUID,                   -- ID de la entidad afectada

    -- Detalles de la accion
    details JSONB,                    -- Datos especificos de la accion
    previous_values JSONB,            -- Valores anteriores (para updates)
    new_values JSONB,                 -- Valores nuevos (para updates)

    -- Metadata de la solicitud
    ip_address INET,
    user_agent TEXT,

    -- Timestamp
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indices para audit_log
CREATE INDEX idx_audit_log_actor_id ON audit_log(actor_id) WHERE actor_id IS NOT NULL;
CREATE INDEX idx_audit_log_action ON audit_log(action);
CREATE INDEX idx_audit_log_entity ON audit_log(entity_type, entity_id);
CREATE INDEX idx_audit_log_created_at ON audit_log(created_at DESC);
CREATE INDEX idx_audit_log_action_category ON audit_log(action_category) WHERE action_category IS NOT NULL;

-- Indice para busqueda de texto en detalles
CREATE INDEX idx_audit_log_details ON audit_log USING gin(details jsonb_path_ops);

-- Comentario de tabla
COMMENT ON TABLE audit_log IS 'Registro de auditoria - todas las acciones del sistema con retencion de 90 dias';
COMMENT ON COLUMN audit_log.actor_type IS 'Tipo de actor: user, recruiter, system, cron';
COMMENT ON COLUMN audit_log.details IS 'Detalles especificos de la accion en formato JSON';

-- ============================================================================
-- TABLA: settings
-- Descripcion: Configuracion del sistema almacenada en JSON
--              Pesos de asignacion, SLAs, umbrales de deduplicacion, etc.
-- ============================================================================
CREATE TABLE settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Clave unica de configuracion
    key VARCHAR(100) NOT NULL UNIQUE,

    -- Valor en JSONB para flexibilidad
    value JSONB NOT NULL,

    -- Metadata
    description TEXT,                  -- Descripcion en espanol
    category VARCHAR(50),              -- assignment, sla, dedup, forecast, ui

    -- Control de cambios
    is_system BOOLEAN DEFAULT false,   -- true = no editable por UI
    last_modified_by UUID,

    -- Timestamps
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indice para settings
CREATE INDEX idx_settings_category ON settings(category) WHERE category IS NOT NULL;

-- Comentario de tabla
COMMENT ON TABLE settings IS 'Configuracion del sistema - pesos, SLAs, umbrales, etc.';

-- ============================================================================
-- DATOS INICIALES: Configuracion por defecto
-- ============================================================================

-- Pesos del algoritmo de asignacion (derivados estadisticamente)
INSERT INTO settings (key, value, description, category, is_system) VALUES
('assignment_weights', '{
    "zone": 0.40,
    "load": 0.30,
    "capability": 0.20,
    "performance": 0.10
}'::jsonb, 'Pesos para el algoritmo de asignacion automatica', 'assignment', false);

-- Configuracion de SLA por prioridad
INSERT INTO settings (key, value, description, category, is_system) VALUES
('sla_config', '{
    "P1": {"days": 3, "label": "Urgente"},
    "P2": {"days": 7, "label": "Normal"},
    "P3": {"days": 14, "label": "Baja"}
}'::jsonb, 'Dias de SLA por nivel de prioridad', 'sla', false);

-- Capacidad maxima por reclutador
INSERT INTO settings (key, value, description, category, is_system) VALUES
('recruiter_capacity', '{
    "hard_cap": 25,
    "soft_warning": 20
}'::jsonb, 'Limite de posiciones activas por reclutador', 'assignment', false);

-- Umbrales de deduplicacion
INSERT INTO settings (key, value, description, category, is_system) VALUES
('dedup_thresholds', '{
    "phone_exact": 0.99,
    "name_high": 0.90,
    "name_medium": 0.80,
    "auto_merge_threshold": 0.95,
    "review_threshold": 0.80
}'::jsonb, 'Umbrales de confianza para deduplicacion de candidatos', 'dedup', false);

-- Productividad por cultivo (kg/trabajador/dia)
INSERT INTO settings (key, value, description, category, is_system) VALUES
('crop_productivity', '{
    "esparrago": 45,
    "arandano": 25,
    "palta": 80,
    "uva": 60,
    "default": 50
}'::jsonb, 'Kilogramos por trabajador por dia por cultivo', 'forecast', false);

-- Lead time para alertas de campana
INSERT INTO settings (key, value, description, category, is_system) VALUES
('forecast_config', '{
    "lead_time_days": 30,
    "confidence_level": 0.95,
    "trend_years": 3
}'::jsonb, 'Configuracion del motor de pronostico', 'forecast', false);

-- ============================================================================
-- FUNCION: Actualizar updated_at automaticamente
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers para updated_at
CREATE TRIGGER update_recruiters_updated_at BEFORE UPDATE ON recruiters
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_positions_updated_at BEFORE UPDATE ON positions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_assignments_updated_at BEFORE UPDATE ON assignments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_campaigns_updated_at BEFORE UPDATE ON campaigns
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_forecast_updated_at BEFORE UPDATE ON forecast
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- FUNCION: Normalizar telefono peruano
-- ============================================================================
CREATE OR REPLACE FUNCTION normalize_peru_phone(phone_input VARCHAR)
RETURNS VARCHAR AS $$
DECLARE
    cleaned VARCHAR;
BEGIN
    -- Remover todo excepto digitos
    cleaned := regexp_replace(phone_input, '[^0-9]', '', 'g');

    -- Remover codigo de pais Peru (+51)
    IF LEFT(cleaned, 2) = '51' AND LENGTH(cleaned) > 9 THEN
        cleaned := SUBSTRING(cleaned FROM 3);
    END IF;

    -- Remover cero inicial (comun en numeros locales)
    IF LEFT(cleaned, 1) = '0' THEN
        cleaned := SUBSTRING(cleaned FROM 2);
    END IF;

    RETURN cleaned;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger para normalizar telefono en candidates
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
-- VISTAS: Datos activos (sin deleted_at)
-- ============================================================================

-- Vista de reclutadores activos
CREATE VIEW active_recruiters AS
SELECT * FROM recruiters WHERE deleted_at IS NULL AND is_active = true;

-- Vista de posiciones activas (no cerradas, no eliminadas)
CREATE VIEW active_positions AS
SELECT * FROM positions
WHERE deleted_at IS NULL
AND status NOT IN ('filled', 'cancelled');

-- Vista de candidatos disponibles
CREATE VIEW available_candidates AS
SELECT * FROM candidates
WHERE deleted_at IS NULL
AND status = 'available'
AND is_duplicate = false;

-- Vista de campanas futuras (para pronostico)
CREATE VIEW upcoming_campaigns AS
SELECT * FROM campaigns
WHERE deleted_at IS NULL
AND start_date > CURRENT_DATE
AND status IN ('planned', 'recruiting');

-- ============================================================================
-- ROW LEVEL SECURITY (RLS) - Placeholder basico
-- Nota: Implementar politicas completas segun roles de usuario
-- ============================================================================

-- Habilitar RLS en todas las tablas principales
ALTER TABLE recruiters ENABLE ROW LEVEL SECURITY;
ALTER TABLE positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE forecast ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- Politica por defecto: permitir todo para usuarios autenticados
-- TODO: Implementar politicas granulares por rol

CREATE POLICY "Permitir lectura para usuarios autenticados" ON recruiters
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON positions
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON candidates
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON assignments
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON campaigns
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON forecast
    FOR SELECT USING (true);

CREATE POLICY "Permitir lectura para usuarios autenticados" ON settings
    FOR SELECT USING (true);

-- Audit log: solo lectura, nunca modificar
CREATE POLICY "Solo lectura para audit_log" ON audit_log
    FOR SELECT USING (true);

CREATE POLICY "Insertar audit_log" ON audit_log
    FOR INSERT WITH CHECK (true);

-- ============================================================================
-- COMENTARIOS FINALES
-- ============================================================================

