/**
 * Tipos de base de datos para Talentia
 * Estos tipos representan las filas de las tablas en PostgreSQL/Supabase
 *
 * NOTE: Field names match database column names exactly (English).
 * Spanish labels are available in constants.ts FIELD_LABELS for UI display.
 */

import type {
  PriorityLevel,
  PositionStatus,
  CandidateStatus,
  AssignmentStatus,
  CampaignStatus,
  CapabilityLevel,
  Zone,
  CropType,
  ActorType,
  RecruitmentStage,
  AssignmentType,
  PositionSource,
  CandidateSource,
  CampaignSource,
  SettingCategory,
} from './constants';

// =============================================================================
// TIPOS BASE
// =============================================================================

/**
 * Campos comunes de auditoria en todas las tablas
 */
interface BaseTimestamps {
  created_at: string; // ISO timestamp
  updated_at: string; // ISO timestamp
}

/**
 * Campos para soft delete
 */
interface SoftDelete {
  deleted_at: string | null; // ISO timestamp o null si no esta eliminado
}

// =============================================================================
// RECRUITERS (RECLUTADORES)
// =============================================================================

/**
 * Fila de la tabla recruiters
 * Represents a recruiter in the system
 */
export interface Recruiter extends BaseTimestamps, SoftDelete {
  id: string; // UUID
  // Personal data
  name: string;
  email: string;
  phone: string | null;
  // Zone assignment
  primary_zone: Zone;
  secondary_zones: Zone[];
  // Capability levels (1-5)
  capability_level: CapabilityLevel;
  capabilities: string[]; // Array of position types they can handle
  // Performance metrics (updated by cron)
  fill_rate_30d: number; // Decimal 0-1
  avg_time_to_fill: number; // Days
  current_load: number; // Active positions count
  // Capacity for workload balancing
  capacity: number; // Max positions this recruiter can handle (default: RECRUITER_HARD_CAP)
  // Status
  is_active: boolean;
  manager_id: string | null; // UUID for escalations
}

/**
 * Version resumida de Recruiter para listados
 */
export interface RecruiterSummary {
  id: string;
  name: string;
  email: string;
  primary_zone: Zone;
  is_active: boolean;
  current_load: number;
  fill_rate_30d: number;
}

/**
 * Detalle completo de reclutador con estadisticas
 */
export interface RecruiterDetail extends Recruiter {
  manager?: RecruiterSummary | null;
  positions_this_month: number;
  positions_filled_this_month: number;
  avg_fill_time_this_month: number | null;
}

/**
 * Workload summary for UI - computed from positions
 * Used by /api/recruiters endpoint
 */
export interface RecruiterWorkload {
  recruiter_id: string;
  recruiter_name: string;
  current_load: number;
  capacity: number;
  utilization_percent: number; // current_load / capacity * 100
  positions_by_status: {
    open: number;
    in_progress: number;
    interviewing: number;
    filled_this_month: number;
  };
  is_overloaded: boolean; // current_load >= capacity
}

// =============================================================================
// POSITIONS (POSICIONES)
// =============================================================================

/**
 * Fila de la tabla positions
 * Represents a job position/vacancy to fill
 */
export interface Position extends BaseTimestamps, SoftDelete {
  id: string; // UUID
  // External identifiers
  external_id: string | null; // ID from Excel import
  fingerprint: string | null; // MD5 hash for sync detection
  // Position info
  title: string;
  description: string | null;
  zone: Zone;
  // Level (matches capability_level)
  level: string; // Default: 'operario'
  // Priority and SLA
  priority: PriorityLevel;
  sla_days: number;
  sla_deadline: string | null; // ISO timestamp
  is_urgent: boolean;
  // Process status
  status: PositionStatus;
  // Headcount
  headcount: number;
  filled_count: number;
  // Important dates
  opened_at: string; // ISO timestamp
  assigned_at: string | null;
  closed_at: string | null;
  days_to_fill: number | null; // Calculated on close
  // Recruiter assignment (from Excel RESPONSABLE column)
  recruiter_id: string | null; // FK to recruiters table
  recruiter_name: string | null; // Denormalized for display without JOIN
  // Data source
  source: PositionSource;
  upload_id: string | null; // Reference to batch upload
  // Direct campaign linking fields (from Excel CONSOLIDADO)
  week_number: number | null; // From Excel semana_inicio - enables direct campaign matching
  crop: CropType | null; // From Excel cultivo - enables direct campaign matching
}

/**
 * Version resumida de Position para listados
 */
export interface PositionSummary {
  id: string;
  title: string;
  zone: Zone;
  level: string;
  priority: PriorityLevel;
  status: PositionStatus;
  headcount: number;
  filled_count: number;
  opened_at: string;
  sla_days: number;
  sla_deadline: string | null;
  days_open: number; // Calculated: days since opened
}

/**
 * Detalle completo de posicion con relaciones
 */
export interface PositionDetail extends Position {
  assignment?: AssignmentSummary | null;
  candidates_count: number;
  candidates_in_process: number;
}

// =============================================================================
// CANDIDATES (CANDIDATOS)
// =============================================================================

/**
 * Fila de la tabla candidates
 * Represents a candidate in the system
 */
export interface Candidate extends BaseTimestamps, SoftDelete {
  id: string; // UUID
  // Identification
  dni: string | null; // National ID (Peru)
  // Personal data
  first_name: string;
  last_name: string; // Apellido paterno
  maternal_last_name: string | null; // Apellido materno
  full_name: string; // Generated column
  // Contact - normalized phone
  phone: string;
  phone_normalized: string; // Digits only, no prefixes
  email: string | null;
  // Phonetics for deduplication
  name_phonetic: string | null; // Spanish Soundex code
  // Location
  zone: Zone | null;
  address: string | null;
  // Status
  status: CandidateStatus;
  // Hiring history
  times_hired: number;
  last_hired_at: string | null;
  last_contacted_at: string | null;
  // Notes and metadata
  notes: string | null;
  tags: string[];
  // Data source
  source: CandidateSource;
  upload_id: string | null;
  // Deduplication
  is_duplicate: boolean;
  duplicate_of: string | null; // UUID of master record
  dedup_reviewed: boolean;
  dedup_reviewed_at: string | null;
  dedup_reviewed_by: string | null;
}

/**
 * Version resumida de Candidate para listados
 */
export interface CandidateSummary {
  id: string;
  full_name: string;
  dni: string | null;
  phone: string;
  zone: Zone | null;
  status: CandidateStatus;
}

/**
 * Detalle completo de candidato con historial
 */
export interface CandidateDetail extends Candidate {
  applications: ApplicationHistory[];
  potential_duplicates?: DuplicateMatch[];
}

/**
 * Historial de postulaciones de un candidato
 */
export interface ApplicationHistory {
  position_id: string;
  position_title: string;
  position_zone: Zone;
  applied_at: string;
  status: CandidateStatus;
  result: 'hired' | 'rejected' | 'withdrawn' | 'in_progress' | null;
}

/**
 * Resultado de deteccion de duplicados
 */
export interface DuplicateMatch {
  candidate_id: string;
  full_name: string;
  dni: string | null;
  phone: string | null;
  confidence: number; // 0-1
  match_reason: 'phone' | 'name' | 'dni' | 'compound';
}

// =============================================================================
// ASSIGNMENTS (ASIGNACIONES)
// =============================================================================

/**
 * Fila de la tabla assignments
 * Links positions to recruiters
 */
export interface Assignment extends BaseTimestamps {
  id: string; // UUID
  // Relations
  position_id: string;
  recruiter_id: string;
  // Algorithm score
  score: number; // Decimal 0-1
  score_breakdown: ScoreBreakdown | null; // JSON breakdown
  // Human-readable explanation
  explanation_es: string; // Spanish explanation
  // Assignment type
  assignment_type: AssignmentType;
  fallback_reason: string | null; // If fallback, why?
  // Assignment status
  status: AssignmentStatus;
  // Stage tracking (Process SLA)
  current_stage: RecruitmentStage | null;
  stage_entered_at: string | null;
  // Notes
  notes: string | null;
  override_reason: string | null; // If manual override, why?
  // Reassignment
  reassigned_from: string | null; // UUID of previous recruiter
  reassigned_at: string | null;
  // Timestamps
  assigned_at: string;
  accepted_at: string | null;
  completed_at: string | null;
}

/**
 * Desglose de puntuacion del algoritmo de asignacion
 * Matches DB: score_breakdown JSONB
 */
export interface ScoreBreakdown {
  zone: number;
  level: number;     // Capability level match
  workload: number;  // Current workload score (lower load = higher score)
}

/**
 * Version resumida de Assignment para listados
 */
export interface AssignmentSummary {
  id: string;
  recruiter_id: string;
  recruiter_name: string;
  status: AssignmentStatus;
  assigned_at: string;
  current_stage: RecruitmentStage | null;
  score: number;
}

/**
 * Detalle completo de asignacion con relaciones
 */
export interface AssignmentDetail extends Assignment {
  position: PositionSummary;
  recruiter: RecruiterSummary;
  stage_history: StageTransition[];
}

/**
 * Transicion entre etapas del proceso
 */
export interface StageTransition {
  from_stage: RecruitmentStage | null;
  to_stage: RecruitmentStage;
  transitioned_at: string;
  sla_target: string;
  sla_met: boolean;
  transitioned_by: string | null;
}

// =============================================================================
// CAMPAIGNS (CAMPANAS)
// =============================================================================

/**
 * Fila de la tabla campaigns
 * Represents a production campaign from Picos.xlsx
 */
export interface Campaign extends BaseTimestamps, SoftDelete {
  id: string; // UUID
  // Campaign identification
  name: string;
  year: number;
  week_number: number; // 1-53
  // Production details
  crop: CropType;
  zone: Zone;
  // Projected production
  production_kg: number;
  // Campaign dates
  start_date: string; // ISO date
  end_date: string; // ISO date
  // Worker calculations
  estimated_workers: number | null;
  kg_per_worker_day: number | null;
  // Status
  status: CampaignStatus;
  // Data source
  source: CampaignSource;
  upload_id: string | null;
}

/**
 * Version resumida de Campaign para listados
 */
export interface CampaignSummary {
  id: string;
  name: string;
  crop: CropType;
  zone: Zone;
  start_date: string;
  end_date: string;
  status: CampaignStatus;
  estimated_workers: number | null;
  progress_percent: number; // Calculated
}

/**
 * Detalle completo de campana con estadisticas
 */
export interface CampaignDetail extends Campaign {
  positions: PositionSummary[];
  forecast?: ForecastSummary | null;
  daily_progress: DailyProgress[];
}

/**
 * Progreso diario de una campana
 */
export interface DailyProgress {
  date: string;
  hired_cumulative: number;
  target_cumulative: number;
  variance: number; // Difference vs target
}

// =============================================================================
// FORECAST (PRONOSTICO)
// =============================================================================

/**
 * Fila de la tabla forecast
 * Represents a worker demand forecast
 */
export interface Forecast extends BaseTimestamps {
  id: string; // UUID
  // Target date
  target_date: string; // ISO date
  // Forecast results
  predicted_workers: number;
  confidence_lower: number;
  confidence_upper: number;
  confidence_level: number; // Default 0.95
  // Component breakdown
  breakdown: ForecastBreakdown;
  // Breakdown by crop
  by_crop: Record<string, number> | null;
  // Breakdown by zone
  by_zone: Record<string, number> | null;
  // Model quality
  model_quality: ModelQuality | null;
  // Generated alerts
  alerts: ForecastAlert[];
  // Lead time used
  lead_time_days: number;
  // Data source
  data_source: string;
  campaign_ids: string[];
  // Generation timestamp
  generated_at: string;
}

/**
 * Desglose de componentes del pronostico
 * Matches DB: breakdown JSONB
 */
export interface ForecastBreakdown {
  trend: number;
  seasonal: number;
  crop_adjustments?: Record<string, number>;
}

/**
 * Calidad del modelo de pronostico
 * Matches DB: model_quality JSONB
 */
export interface ModelQuality {
  r_squared: number;
  mape: number;
  rmse: number;
}

/**
 * Alerta generada por pronostico
 * Matches DB: alerts JSONB array
 */
export interface ForecastAlert {
  type: string;
  message: string;
}

/**
 * Version resumida de Forecast para UI
 */
export interface ForecastSummary {
  id: string;
  target_date: string;
  predicted_workers: number;
  confidence_lower: number;
  confidence_upper: number;
}

/**
 * Resultado completo de pronostico con desglose
 */
export interface ForecastResult {
  target_date: string;
  predicted_workers: number;
  confidence_interval: [number, number];
  breakdown: ForecastBreakdown;
  model_quality: ModelQuality | null;
}

// =============================================================================
// LABOR RATIOS (RATIOS LABORALES)
// =============================================================================

/**
 * Calculated labor ratio for a crop/zone combination
 * Derived from historical campaign and position data
 */
export interface LaborRatio {
  id?: string; // UUID (if stored in DB)
  /** Crop type */
  crop: CropType;
  /** Zone (null = applies to all zones for this crop) */
  zone: Zone | null;
  /** Calculated kg per worker per day */
  kg_per_worker_day: number;
  /** Number of historical data points used */
  sample_size: number;
  /** Confidence score (0-1) based on sample size and variance */
  confidence: number;
  /** Standard deviation of the ratio */
  std_dev: number;
  /** Source of the ratio: historical (calculated) or default (from CROP_TYPES) */
  source: 'historical' | 'default';
  /** Last calculated timestamp */
  calculated_at: string;
}

/**
 * Summary of labor ratio data quality
 */
export interface LaborRatioDataQuality {
  total_campaigns_analyzed: number;
  campaigns_with_matches: number;
  total_positions_matched: number;
  coverage_percent: number;
}

// =============================================================================
// AUDIT LOG (REGISTRO DE AUDITORIA)
// =============================================================================

/**
 * Fila de la tabla audit_log
 * Immutable record of all system actions
 */
export interface AuditLog {
  id: string; // UUID
  // Who performed the action
  actor_id: string | null; // NULL for system actions
  actor_type: ActorType;
  actor_name: string | null;
  // What action was performed
  action: string;
  action_category: string | null;
  // On what entity
  entity_type: string;
  entity_id: string | null;
  // Action details
  details: Record<string, unknown> | null;
  previous_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  // Request metadata
  ip_address: string | null;
  user_agent: string | null;
  // Timestamp
  created_at: string;
}

/**
 * Entrada resumida de auditoria para UI
 */
export interface AuditLogEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  actor_name: string | null;
  summary: string; // Human-readable description
  created_at: string;
}

// =============================================================================
// SETTINGS (CONFIGURACION)
// =============================================================================

/**
 * Fila de la tabla settings
 * System configuration as key-value pairs
 */
export interface Setting {
  id: string;
  key: string; // Unique key
  value: unknown; // JSONB value
  description: string | null;
  category: SettingCategory | null;
  is_system: boolean; // true = not editable via UI
  last_modified_by: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Configuraciones tipadas conocidas
 * Matches DB initial settings data
 */
export interface TypedSettings {
  assignment_weights: {
    zone: number;
    load: number;
    capability: number;
    performance: number;
  };
  sla_config: {
    P1: { days: number; label: string };
    P2: { days: number; label: string };
    P3: { days: number; label: string };
  };
  recruiter_capacity: {
    hard_cap: number;
    soft_warning: number;
  };
  dedup_thresholds: {
    phone_exact: number;
    name_high: number;
    name_medium: number;
    auto_merge_threshold: number;
    review_threshold: number;
  };
  crop_productivity: {
    esparrago: number;
    arandano: number;
    palta: number;
    uva: number;
    default: number;
  };
  forecast_config: {
    lead_time_days: number;
    confidence_level: number;
    trend_years: number;
  };
}

// =============================================================================
// TIPOS AUXILIARES
// =============================================================================

/**
 * Resultado de paginacion
 */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  has_more: boolean;
}

/**
 * Filtros comunes para listados
 */
export interface CommonFilters {
  page?: number;
  limit?: number;
  sort_by?: string;
  sort_order?: 'asc' | 'desc';
  search?: string;
  include_deleted?: boolean;
}

/**
 * Filtros especificos para posiciones
 */
export interface PositionFilters extends CommonFilters {
  status?: PositionStatus | PositionStatus[];
  zone?: Zone | Zone[];
  level?: string | string[];
  priority?: PriorityLevel | PriorityLevel[];
  opened_from?: string;
  opened_to?: string;
  recruiter_id?: string;
  unassigned_only?: boolean;
}

/**
 * Filtros especificos para candidatos
 */
export interface CandidateFilters extends CommonFilters {
  status?: CandidateStatus | CandidateStatus[];
  zone?: Zone | Zone[];
  duplicates_only?: boolean;
}

/**
 * Filtros especificos para asignaciones
 */
export interface AssignmentFilters extends CommonFilters {
  status?: AssignmentStatus | AssignmentStatus[];
  recruiter_id?: string;
  position_id?: string;
  stage?: RecruitmentStage;
  overdue_only?: boolean;
}

/**
 * Filtros especificos para campanas
 */
export interface CampaignFilters extends CommonFilters {
  status?: CampaignStatus | CampaignStatus[];
  crop?: CropType;
  zone?: Zone;
  year?: number;
}

/**
 * Filtros especificos para reclutadores
 */
export interface RecruiterFilters extends CommonFilters {
  is_active?: boolean;
  primary_zone?: Zone | Zone[];
  capability_level?: CapabilityLevel | CapabilityLevel[];
}
