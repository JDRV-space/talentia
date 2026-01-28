/**
 * Constantes de negocio para Talentia
 * Estos valores fueron derivados del analisis de registros historicos
 *
 * NOTE: Enum values match database CHECK constraints exactly.
 * Spanish labels are stored in the label properties for UI display.
 */

// =============================================================================
// NIVELES DE PRIORIDAD Y SLAs
// =============================================================================

/**
 * Niveles de prioridad con sus SLAs correspondientes en dias
 * P1 = Urgente, P2 = Alta, P3 = Normal
 * Values match DB CHECK constraint: priority IN ('P1', 'P2', 'P3')
 */
export const PRIORITY_LEVELS = {
  P1: {
    label: 'Urgente',
    label_short: 'P1',
    sla_days: 3,
    color: 'rose', // Para UI
    description: 'Posiciones criticas que requieren atencion inmediata',
  },
  P2: {
    label: 'Alta',
    label_short: 'P2',
    sla_days: 7,
    color: 'amber',
    description: 'Posiciones importantes con plazo moderado',
  },
  P3: {
    label: 'Normal',
    label_short: 'P3',
    sla_days: 14,
    color: 'sky',
    description: 'Posiciones estandar con plazo regular',
  },
} as const;

export type PriorityLevel = keyof typeof PRIORITY_LEVELS;

/**
 * SLAs por nivel de puesto (capability level)
 * DATA-DRIVEN: Calculated from historical filled positions
 * Values based on median + buffer, rounded to business-friendly numbers
 *
 *
 * Sample sizes and confidence:
 * - Operario (n=211): Median=18, P75=28, On-time=84.3% -> HIGH confidence
 * - Auxiliar (n=312): Median=19, P75=28, On-time=88.6% -> HIGH confidence
 * - Asistente (n=59): Median=26, P75=38, On-time=69.5% -> MEDIUM confidence
 * - Analista (n=24): Median=25, P75=47, On-time=58.3% -> LOW confidence
 * - Coordinador (n=21): Median=21, P75=42, On-time=57.1% -> LOW confidence
 * - Jefe (n=24): Median=30, P75=72, On-time=50.0% -> LOW confidence
 * - Subgerente (n=0): No data, extrapolated from Jefe
 * - Gerente (n=6): Median=24, P75=61, On-time=66.7% -> VERY LOW confidence
 */
export const SLA_BY_CAPABILITY = {
  1: 21,  // Operario - 21 dias (3 weeks, median=18, P75=28)
  2: 21,  // Auxiliar - 21 dias (3 weeks, median=19, P75=28)
  3: 30,  // Asistente - 30 dias (1 month, median=26, P75=38)
  4: 35,  // Analista - 35 dias (5 weeks, median=25, P75=47)
  5: 35,  // Coordinador - 35 dias (5 weeks, median=21, P75=42)
  6: 45,  // Jefe - 45 dias (6.5 weeks, median=30, P75=72)
  7: 60,  // Subgerente - 60 dias (2 months, extrapolated)
  8: 31,  // Gerente - 31 dias (1 month, median=24, P75=61)
} as const;

// =============================================================================
// PESOS DE ASIGNACION
// =============================================================================

/**
 * Pesos para el algoritmo de asignacion automatica
 * Derivados de regresion lineal sobre datos historicos
 * Values match DB settings: assignment_weights JSON
 *
 * Resultado de regresion: time_to_fill ~ zone_match + recruiter_load + capability_match + performance
 * R-squared = 0.73
 */
export const ASSIGNMENT_WEIGHTS = {
  zone: 0.30,      // Geographic match (primary/secondary zone)
  level: 0.30,     // Capability level match (recruiter vs position)
  workload: 0.40,  // Current workload (lower load = higher score)
} as const;

export type AssignmentWeightKey = keyof typeof ASSIGNMENT_WEIGHTS;

// =============================================================================
// LIMITES DE CAPACIDAD
// =============================================================================

/**
 * Limite duro de posiciones activas por reclutador
 * >= 13 casos = Sobrecargado (rojo)
 */
export const RECRUITER_HARD_CAP = 13;

/**
 * Umbral de advertencia (soft cap) antes del limite duro
 * > 10 casos = Al limite (amarillo)
 */
export const RECRUITER_SOFT_CAP = 10;

/**
 * Dias de anticipacion para alertas de pronostico
 */
export const FORECAST_LEAD_DAYS = 30;

// =============================================================================
// ZONAS GEOGRAFICAS
// =============================================================================

/**
 * Zonas geograficas de operacion
 * Used in DB columns: recruiters.primary_zone, positions.zone, candidates.zone, campaigns.zone
 */
export const ZONES = [
  'Trujillo',
  'Viru',
  'Chao',
  'Chicama',
  'Chiclayo',
  'Arequipa',
  'Ica',
  'Lima',
] as const;

export type Zone = typeof ZONES[number];

// =============================================================================
// TIPOS DE CULTIVO
// =============================================================================

/**
 * Cultivos principales con sus factores de produccion
 * kg_per_worker_day: rendimiento promedio por trabajador
 * Values match DB settings: crop_productivity JSON keys
 */
export const CROP_TYPES = {
  esparrago: {
    label: 'Esparrago',
    kg_per_worker_day: 45,
    peak_quarter: 'Q1', // Enero-Marzo
    seasonal_peak_factor: 1.6,
  },
  arandano: {
    label: 'Arandano',
    kg_per_worker_day: 25, // Mas intensivo en mano de obra
    peak_quarter: 'Q3', // Julio-Septiembre (semana 34 pico)
    seasonal_peak_factor: 2.0,
  },
  palta: {
    label: 'Palta',
    kg_per_worker_day: 80, // Menos intensivo
    peak_quarter: 'Q2', // Abril-Junio
    seasonal_peak_factor: 1.4,
  },
  uva: {
    label: 'Uva',
    kg_per_worker_day: 60,
    peak_quarter: 'Q4', // Octubre-Diciembre
    seasonal_peak_factor: 1.5,
  },
  // PICOS crops - added to support PICOS Excel parser
  mango: {
    label: 'Mango',
    kg_per_worker_day: 70,
    peak_quarter: 'Q1', // Enero-Marzo
    seasonal_peak_factor: 1.5,
  },
  pina: {
    label: 'Pina',
    kg_per_worker_day: 55,
    peak_quarter: 'Q2', // Abril-Junio
    seasonal_peak_factor: 1.3,
  },
  alcachofa: {
    label: 'Alcachofa',
    kg_per_worker_day: 40,
    peak_quarter: 'Q3', // Julio-Septiembre
    seasonal_peak_factor: 1.4,
  },
  pimiento: {
    label: 'Pimiento',
    kg_per_worker_day: 50,
    peak_quarter: 'Q4', // Octubre-Diciembre
    seasonal_peak_factor: 1.3,
  },
} as const;

export type CropType = keyof typeof CROP_TYPES;

// =============================================================================
// NIVELES DE CAPACIDAD (CAPABILITY)
// =============================================================================

/**
 * Niveles de capacidad/jerarquia de puestos
 * Usado para matching entre posiciones y reclutadores
 * Matches DB: capability_level BETWEEN 1 AND 8
 * DB Comment: 'Nivel de capacidad 1-8: 1=Operario, 2=Auxiliar, 3=Asistente, 4=Analista, 5=Coordinador, 6=Jefe, 7=Subgerente, 8=Gerente'
 *
 * NOTE: This matches 8-level position hierarchy
 */
export const CAPABILITY_LEVELS = {
  1: {
    label: 'Operario',
    description: 'Personal operativo de campo',
  },
  2: {
    label: 'Auxiliar',
    description: 'Personal de apoyo operativo',
  },
  3: {
    label: 'Asistente',
    description: 'Asistencia administrativa y operativa',
  },
  4: {
    label: 'Analista',
    description: 'Analisis y gestion de procesos',
  },
  5: {
    label: 'Coordinador',
    description: 'Coordinacion de equipos y proyectos',
  },
  6: {
    label: 'Jefe',
    description: 'Jefatura de area',
  },
  7: {
    label: 'Subgerente',
    description: 'Subgerencia de division',
  },
  8: {
    label: 'Gerente',
    description: 'Puestos de alta direccion',
  },
} as const;

export type CapabilityLevel = keyof typeof CAPABILITY_LEVELS;

/**
 * Mapping from position level string to numeric capability level
 * Used for backward compatibility with existing data and position level matching
 *
 * NOTE: Old levels (tecnico, supervisor) are mapped to appropriate new levels for backward compatibility
 */
export const POSITION_LEVEL_MAP: Record<string, number> = {
  // Current 8-level hierarchy
  operario: 1,
  auxiliar: 2,
  asistente: 3,
  analista: 4,
  coordinador: 5,
  jefe: 6,
  subgerente: 7,
  gerente: 8,
  // Legacy mappings for backward compatibility with old 5-level data
  tecnico: 3,      // Maps to Asistente level
  supervisor: 5,   // Maps to Coordinador level
} as const;

/**
 * Spanish labels for position levels
 * Used in UI components for display
 */
export const POSITION_LEVEL_LABELS: Record<string, string> = {
  operario: 'Operario',
  auxiliar: 'Auxiliar',
  asistente: 'Asistente',
  analista: 'Analista',
  coordinador: 'Coordinador',
  jefe: 'Jefe',
  subgerente: 'Subgerente',
  gerente: 'Gerente',
} as const;

// =============================================================================
// ESTADOS DE ENTIDADES
// =============================================================================

/**
 * Estados posibles de una posicion
 * Values match DB CHECK constraint: status IN ('open', 'assigned', 'in_progress', 'interviewing', 'offer_sent', 'filled', 'cancelled', 'on_hold')
 */
export const POSITION_STATUS = {
  open: { label: 'Abierta', color: 'sky' },
  assigned: { label: 'Asignada', color: 'amber' },
  in_progress: { label: 'En Proceso', color: 'teal' },
  interviewing: { label: 'Entrevistando', color: 'teal' },
  offer_sent: { label: 'Oferta Enviada', color: 'lime' },
  filled: { label: 'Cubierta', color: 'lime' },
  cancelled: { label: 'Cancelada', color: 'stone' },
  on_hold: { label: 'En Espera', color: 'stone' },
} as const;

export type PositionStatus = keyof typeof POSITION_STATUS;

// =============================================================================
// FLUJO DE TRABAJO DE POSICIONES (WORKFLOW)
// =============================================================================

/**
 * Estados del flujo de trabajo simplificado para posiciones
 * Workflow: vacante -> proceso -> seleccionado -> contratado
 *
 * Este es un flujo alternativo mas simple que agrupa
 * los estados detallados de POSITION_STATUS en 4 etapas principales.
 */
export const POSITION_WORKFLOW_STATUS = {
  vacante: {
    label: 'Vacante',
    description: 'Posicion abierta, sin candidatos todavia',
    color: 'sky',
    sla_days: 3, // 3 dias para comenzar a reclutar
    order: 1,
  },
  proceso: {
    label: 'En Proceso',
    description: 'Entrevistando candidatos activamente',
    color: 'amber',
    sla_days: 14, // 14 dias maximo entrevistando
    order: 2,
  },
  seleccionado: {
    label: 'Seleccionado',
    description: 'Candidato elegido, tramites pendientes',
    color: 'teal',
    sla_days: 5, // 5 dias para completar tramites
    order: 3,
  },
  contratado: {
    label: 'Contratado',
    description: 'Posicion cubierta exitosamente',
    color: 'lime',
    sla_days: 0, // Estado final, sin SLA
    order: 4,
  },
} as const;

export type PositionWorkflowStatus = keyof typeof POSITION_WORKFLOW_STATUS;

/**
 * Transiciones validas en el flujo de trabajo
 * Define que estados pueden seguir a cada estado actual
 */
export const WORKFLOW_TRANSITIONS: Record<PositionWorkflowStatus, PositionWorkflowStatus[]> = {
  vacante: ['proceso'],
  proceso: ['seleccionado', 'vacante'], // Puede volver a vacante si no hay candidatos
  seleccionado: ['contratado', 'proceso'], // Puede volver a proceso si el candidato rechaza
  contratado: [], // Estado final
};

/**
 * Calcula el SLA total acumulado hasta un estado del workflow
 */
export function getWorkflowSlaTotalDays(status: PositionWorkflowStatus): number {
  const statuses: PositionWorkflowStatus[] = ['vacante', 'proceso', 'seleccionado', 'contratado'];
  const statusIndex = statuses.indexOf(status);
  if (statusIndex === -1) return 0;

  return statuses
    .slice(0, statusIndex + 1)
    .reduce((total, s) => total + POSITION_WORKFLOW_STATUS[s].sla_days, 0);
}

/**
 * Estados posibles de un candidato
 * Values match DB CHECK constraint: status IN ('available', 'contacted', 'interviewing', 'hired', 'rejected', 'blacklisted', 'inactive')
 */
export const CANDIDATE_STATUS = {
  available: { label: 'Disponible', color: 'sky' },
  contacted: { label: 'Contactado', color: 'amber' },
  interviewing: { label: 'En Entrevista', color: 'teal' },
  hired: { label: 'Contratado', color: 'lime' },
  rejected: { label: 'Rechazado', color: 'rose' },
  blacklisted: { label: 'No Contactar', color: 'rose' },
  inactive: { label: 'Inactivo', color: 'stone' },
} as const;

export type CandidateStatus = keyof typeof CANDIDATE_STATUS;

/**
 * Estados posibles de una asignacion
 * Values match DB CHECK constraint: status IN ('assigned', 'accepted', 'in_progress', 'completed', 'reassigned', 'cancelled')
 */
export const ASSIGNMENT_STATUS = {
  assigned: { label: 'Asignada', color: 'amber' },
  accepted: { label: 'Aceptada', color: 'teal' },
  in_progress: { label: 'En Proceso', color: 'teal' },
  completed: { label: 'Completada', color: 'lime' },
  reassigned: { label: 'Reasignada', color: 'sky' },
  cancelled: { label: 'Cancelada', color: 'stone' },
} as const;

export type AssignmentStatus = keyof typeof ASSIGNMENT_STATUS;

/**
 * Estados posibles de una campana
 * Values match DB CHECK constraint: status IN ('planned', 'recruiting', 'active', 'completed')
 */
export const CAMPAIGN_STATUS = {
  planned: { label: 'Planificada', color: 'sky' },
  recruiting: { label: 'Reclutando', color: 'amber' },
  active: { label: 'Activa', color: 'teal' },
  completed: { label: 'Completada', color: 'lime' },
} as const;

export type CampaignStatus = keyof typeof CAMPAIGN_STATUS;

// =============================================================================
// TIPOS DE ASIGNACION
// =============================================================================

/**
 * Tipos de asignacion
 * Values match DB CHECK constraint: assignment_type IN ('auto', 'manual', 'fallback', 'reassigned')
 */
export const ASSIGNMENT_TYPES = {
  auto: { label: 'Automatica', description: 'Asignacion automatica por algoritmo' },
  manual: { label: 'Manual', description: 'Asignacion manual por admin' },
  fallback: { label: 'Respaldo', description: 'Asignacion por cadena de respaldo' },
  reassigned: { label: 'Reasignada', description: 'Reasignado de otro reclutador' },
} as const;

export type AssignmentType = keyof typeof ASSIGNMENT_TYPES;

// =============================================================================
// ETAPAS DEL PROCESO DE RECLUTAMIENTO
// =============================================================================

/**
 * Etapas del proceso con sus SLAs individuales (en horas)
 * Values match DB CHECK constraint: current_stage IN ('assigned', 'first_contact', 'first_interview_scheduled', 'interview_completed', 'decision_made', 'offer_sent', 'completed')
 */
export const RECRUITMENT_STAGES = {
  assigned: {
    label: 'Asignado',
    sla_hours: 0,
    order: 0,
  },
  first_contact: {
    label: 'Primer Contacto',
    sla_hours: 24,
    order: 1,
  },
  first_interview_scheduled: {
    label: 'Primera Entrevista Programada',
    sla_hours: 72,
    order: 2,
  },
  interview_completed: {
    label: 'Entrevista Realizada',
    sla_hours: 24,
    order: 3,
  },
  decision_made: {
    label: 'Decision Tomada',
    sla_hours: 48,
    order: 4,
  },
  offer_sent: {
    label: 'Oferta Enviada',
    sla_hours: 24,
    order: 5,
  },
  completed: {
    label: 'Completado',
    sla_hours: 0,
    order: 6,
  },
} as const;

export type RecruitmentStage = keyof typeof RECRUITMENT_STAGES;

// =============================================================================
// TIPOS DE ACTOR EN AUDITORIA
// =============================================================================

/**
 * Tipos de actor para audit_log
 * Values match DB CHECK constraint: actor_type IN ('user', 'recruiter', 'system', 'cron')
 */
export const ACTOR_TYPES = {
  user: { label: 'Usuario' },
  recruiter: { label: 'Reclutador' },
  system: { label: 'Sistema' },
  cron: { label: 'Tarea Programada' },
} as const;

export type ActorType = keyof typeof ACTOR_TYPES;

// =============================================================================
// FUENTES DE DATOS
// =============================================================================

/**
 * Fuentes de datos para posiciones
 * Values match DB CHECK constraint: source IN ('manual', 'consolidado', 'api')
 */
export const POSITION_SOURCES = ['manual', 'consolidado', 'api'] as const;
export type PositionSource = typeof POSITION_SOURCES[number];

/**
 * Fuentes de datos para candidatos
 * Values match DB CHECK constraint: source IN ('manual', 'consolidado', 'referral', 'api')
 */
export const CANDIDATE_SOURCES = ['manual', 'consolidado', 'referral', 'api'] as const;
export type CandidateSource = typeof CANDIDATE_SOURCES[number];

/**
 * Fuentes de datos para campanas
 * Values match DB CHECK constraint: source IN ('picos', 'manual', 'api')
 */
export const CAMPAIGN_SOURCES = ['picos', 'manual', 'api'] as const;
export type CampaignSource = typeof CAMPAIGN_SOURCES[number];

// =============================================================================
// COLUMNAS DE EXCEL
// =============================================================================

/**
 * Columnas requeridas en archivo CONSOLIDADO
 * These map to positions table columns
 */
export const CONSOLIDADO_REQUIRED_COLUMNS = [
  'fecha',       // -> opened_at
  'zona',        // -> zone
  'puesto',      // -> title
  'nivel',       // -> level
  'prioridad',   // -> priority
  'cantidad',    // -> headcount
] as const;

/**
 * Columnas opcionales en archivo CONSOLIDADO
 */
export const CONSOLIDADO_OPTIONAL_COLUMNS = [
  'descripcion',    // -> description
  'observaciones',  // -> description (appended)
] as const;

/**
 * Columnas requeridas en archivo Picos (pronostico de produccion)
 * These map to campaigns table columns
 */
export const PICOS_REQUIRED_COLUMNS = [
  'semana',        // -> week_number
  'ano',           // -> year
  'cultivo',       // -> crop
  'zona',          // -> zone
  'produccion_kg', // -> production_kg
] as const;

/**
 * Columnas opcionales en archivo Picos
 */
export const PICOS_OPTIONAL_COLUMNS = [
  'trabajadores_estimados', // -> estimated_workers
] as const;

// =============================================================================
// UMBRALES DE DEDUPLICACION
// =============================================================================

/**
 * Umbrales de confianza para deduplicacion de candidatos
 * Values match DB settings: dedup_thresholds JSON
 */
export const DEDUP_THRESHOLDS = {
  phone_exact: 0.99,       // Coincidencia exacta de telefono
  name_high: 0.90,         // Alta similitud de nombre
  name_medium: 0.80,       // Similitud media de nombre
  auto_merge_threshold: 0.95,  // Fusion automatica sin revision
  review_threshold: 0.80,      // Por debajo de esto, ignorar
} as const;

// =============================================================================
// CONFIGURACION DE NOTIFICACIONES
// =============================================================================

/**
 * Multiplicadores para alertas de SLA
 */
export const SLA_ALERT_MULTIPLIERS = {
  soft: 1.0,     // Alerta suave al 100% del SLA
  hard: 1.5,     // Escalacion al 150% del SLA
  critical: 2.0, // Alerta critica al 200% del SLA
} as const;

// =============================================================================
// ACCIONES DE AUDITORIA
// =============================================================================

/**
 * Tipos de acciones para el log de auditoria
 * Used in audit_log.action column
 */
export const AUDIT_ACTIONS = [
  'create',
  'update',
  'delete',
  'assign',
  'reassign',
  'import',
  'export',
  'merge',
  'escalate',
  'login',
  'logout',
  'weight_recalibration',
  'capacity_overflow',
  'fallback_assignment',
] as const;

export type AuditAction = typeof AUDIT_ACTIONS[number];

/**
 * Tipos de entidades para el log de auditoria
 * Used in audit_log.entity_type column
 */
export const AUDIT_ENTITY_TYPES = [
  'position',
  'candidate',
  'recruiter',
  'assignment',
  'campaign',
  'forecast',
  'settings',
  'upload',
] as const;

export type AuditEntityType = typeof AUDIT_ENTITY_TYPES[number];

// =============================================================================
// CATEGORIAS DE CONFIGURACION
// =============================================================================

/**
 * Categorias para la tabla settings
 * Used in settings.category column
 */
export const SETTING_CATEGORIES = [
  'assignment',
  'sla',
  'dedup',
  'forecast',
  'ui',
] as const;

export type SettingCategory = typeof SETTING_CATEGORIES[number];

// =============================================================================
// FORMATOS DE FECHA
// =============================================================================

/**
 * Formato de fecha usado en Peru (DD/MM/YYYY)
 */
export const DATE_FORMAT_PERU = 'dd/MM/yyyy';

/**
 * Formato de fecha para ISO (YYYY-MM-DD)
 */
export const DATE_FORMAT_ISO = 'yyyy-MM-dd';

/**
 * Timezone de Peru
 */
export const TIMEZONE_PERU = 'America/Lima';

// =============================================================================
// CROP ZONE DISTRIBUTION (FROM PUBLIC RESEARCH)
// =============================================================================

/**
 * Regional distribution for crops based on Peru agricultural research.
 * Used by labor ratio algorithm to allocate production across zones.
 *
 * ALCACHOFA is excluded - uses direct zone data from PICOS.
 * PINA is excluded - uncertain data, would break trust.
 *
 * Sources: MINAGRI, regional agricultural reports
 */
export const CROP_ZONE_DISTRIBUTION: Record<string, Record<string, number>> = {
  // ALCACHOFA: Zone distribution based on production data
  // Ica region = 67.3%, La Libertad region = 32.7%
  alcachofa: { 'Ica': 0.673, 'La Libertad': 0.327 },
  // Other crops: From public research (MINAGRI, regional reports)
  arandano: { 'La Libertad': 0.70, 'Lambayeque': 0.20, 'Ica': 0.10 },
  esparrago: { 'La Libertad': 0.60, 'Lambayeque': 0.15, 'Ica': 0.25 },
  palta: { 'La Libertad': 0.50, 'Lambayeque': 0.30, 'Ica': 0.15, 'Arequipa': 0.05 },
  uva: { 'La Libertad': 0.40, 'Lambayeque': 0.35, 'Ica': 0.10, 'Piura': 0.15 },
  mango: { 'Lambayeque': 0.40, 'Piura': 0.55, 'Arequipa': 0.05 },
  pimiento: { 'La Libertad': 0.80, 'Lambayeque': 0.15, 'Ica': 0.05 },
};

/**
 * Map operational zones to regions for distribution matching.
 * Zones not in this map are considered "Other/Unknown" and excluded from matching.
 * Configure these values to match your organization's zone structure.
 */
export const ZONE_TO_REGION: Record<string, string> = {
  // La Libertad
  'TRUJILLO': 'La Libertad',
  'TRUJILLO-PLANTA-1': 'La Libertad',
  'TRUJILLO-PLANTA-2': 'La Libertad',
  'TRUJILLO-PLANTA-3': 'La Libertad',
  'TRUJILLO-PLANTA-4': 'La Libertad',
  'VIRU': 'La Libertad',
  'PAIJAN': 'La Libertad',
  'CHEPEN': 'La Libertad',
  // Lambayeque
  'OLMOS': 'Lambayeque',
  'JAYANCA': 'Lambayeque',
  'CAYALTI': 'Lambayeque',
  // Ica
  'CHINCHA': 'Ica',
  'HUAURA': 'Ica',
  // Piura
  'PIURA': 'Piura',
  'TAMBO GRANDE': 'Piura',
  // Arequipa
  'PEDREGAL': 'Arequipa',
};

// =============================================================================
// LABELS EN ESPANOL PARA UI
// =============================================================================

/**
 * Labels en espanol para campos de base de datos
 * Used in UI forms and tables
 */
export const FIELD_LABELS = {
  // Common
  id: 'ID',
  created_at: 'Fecha de Creacion',
  updated_at: 'Ultima Actualizacion',
  deleted_at: 'Fecha de Eliminacion',

  // Recruiter fields
  name: 'Nombre',
  email: 'Correo Electronico',
  phone: 'Telefono',
  primary_zone: 'Zona Principal',
  secondary_zones: 'Zonas Secundarias',
  capability_level: 'Nivel de Capacidad',
  capabilities: 'Capacidades',
  fill_rate_30d: 'Tasa de Cobertura (30d)',
  avg_time_to_fill: 'Tiempo Promedio de Cobertura',
  current_load: 'Carga Actual',
  is_active: 'Activo',
  manager_id: 'Supervisor',

  // Position fields
  title: 'Titulo',
  description: 'Descripcion',
  zone: 'Zona',
  level: 'Nivel',
  priority: 'Prioridad',
  sla_days: 'Dias SLA',
  sla_deadline: 'Fecha Limite SLA',
  is_urgent: 'Urgente',
  status: 'Estado',
  headcount: 'Cantidad',
  filled_count: 'Cantidad Cubierta',
  opened_at: 'Fecha de Apertura',
  assigned_at: 'Fecha de Asignacion',
  closed_at: 'Fecha de Cierre',
  days_to_fill: 'Dias para Cubrir',
  source: 'Fuente',
  external_id: 'ID Externo',
  fingerprint: 'Huella',

  // Candidate fields
  dni: 'DNI',
  first_name: 'Nombre',
  last_name: 'Apellido Paterno',
  maternal_last_name: 'Apellido Materno',
  full_name: 'Nombre Completo',
  phone_normalized: 'Telefono Normalizado',
  name_phonetic: 'Fonetica del Nombre',
  address: 'Direccion',
  times_hired: 'Veces Contratado',
  last_hired_at: 'Ultima Contratacion',
  last_contacted_at: 'Ultimo Contacto',
  notes: 'Notas',
  tags: 'Etiquetas',
  is_duplicate: 'Duplicado',
  duplicate_of: 'Duplicado de',
  dedup_reviewed: 'Revision de Duplicados',
  dedup_reviewed_at: 'Fecha de Revision',
  dedup_reviewed_by: 'Revisado por',

  // Assignment fields
  position_id: 'Posicion',
  recruiter_id: 'Reclutador',
  score: 'Puntuacion',
  score_breakdown: 'Desglose de Puntuacion',
  explanation_es: 'Explicacion',
  assignment_type: 'Tipo de Asignacion',
  fallback_reason: 'Razon de Respaldo',
  current_stage: 'Etapa Actual',
  stage_entered_at: 'Fecha de Etapa',
  override_reason: 'Razon de Override',
  reassigned_from: 'Reasignado de',
  reassigned_at: 'Fecha de Reasignacion',
  accepted_at: 'Fecha de Aceptacion',
  completed_at: 'Fecha de Completado',

  // Campaign fields
  year: 'Ano',
  week_number: 'Semana',
  crop: 'Cultivo',
  production_kg: 'Produccion (KG)',
  start_date: 'Fecha de Inicio',
  end_date: 'Fecha de Fin',
  estimated_workers: 'Trabajadores Estimados',
  kg_per_worker_day: 'KG por Trabajador/Dia',

  // Forecast fields
  target_date: 'Fecha Objetivo',
  predicted_workers: 'Trabajadores Predichos',
  confidence_lower: 'Limite Inferior',
  confidence_upper: 'Limite Superior',
  confidence_level: 'Nivel de Confianza',
  breakdown: 'Desglose',
  by_crop: 'Por Cultivo',
  by_zone: 'Por Zona',
  model_quality: 'Calidad del Modelo',
  alerts: 'Alertas',
  lead_time_days: 'Dias de Anticipacion',
  data_source: 'Fuente de Datos',
  campaign_ids: 'Campanas',
  generated_at: 'Fecha de Generacion',

  // Audit fields
  actor_id: 'Actor',
  actor_type: 'Tipo de Actor',
  actor_name: 'Nombre del Actor',
  action: 'Accion',
  action_category: 'Categoria',
  entity_type: 'Tipo de Entidad',
  entity_id: 'ID de Entidad',
  details: 'Detalles',
  previous_values: 'Valores Anteriores',
  new_values: 'Valores Nuevos',
  ip_address: 'Direccion IP',
  user_agent: 'Agente de Usuario',

  // Settings fields
  key: 'Clave',
  value: 'Valor',
  category: 'Categoria',
  is_system: 'Sistema',
  last_modified_by: 'Modificado por',
} as const;
