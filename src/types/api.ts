/**
 * Tipos para API request/response del sistema Talentia
 * Todos los endpoints siguen el formato ApiResponse<T>
 *
 * NOTE: Field names match database column names exactly (English).
 * Spanish labels are available in constants.ts FIELD_LABELS for UI display.
 */

import type {
  Position,
  PositionSummary,
  PositionDetail,
  Candidate,
  CandidateSummary,
  CandidateDetail,
  Recruiter,
  RecruiterSummary,
  RecruiterDetail,
  Assignment,
  AssignmentSummary,
  AssignmentDetail,
  Campaign,
  CampaignSummary,
  CampaignDetail,
  Forecast,
  ForecastResult,
  AuditLogEntry,
  Setting,
  DuplicateMatch,
  ScoreBreakdown,
  PaginatedResult,
} from './database';

import type {
  PriorityLevel,
  PositionStatus,
  CandidateStatus,
  AssignmentStatus,
  CampaignStatus,
  CapabilityLevel,
  Zone,
  CropType,
  RecruitmentStage,
  AuditAction,
  AuditEntityType,
} from './constants';

// =============================================================================
// RESPUESTA ESTANDAR
// =============================================================================

/**
 * Formato estandar de respuesta de API
 * Todas las respuestas siguen esta estructura
 */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
  meta?: ApiMeta;
}

/**
 * Estructura de error de API
 */
export interface ApiError {
  code: string;
  message: string; // Mensaje tecnico (ingles)
  message_es: string; // Mensaje para usuario (espanol)
  details?: unknown;
  field?: string; // Campo con error (para validacion)
}

/**
 * Metadata de paginacion
 */
export interface ApiMeta {
  total?: number;
  page?: number;
  limit?: number;
  has_more?: boolean;
}

// =============================================================================
// CODIGOS DE ERROR
// =============================================================================

/**
 * Constantes de errores de API
 * Usar estos codigos para mensajes consistentes
 */
export const API_ERRORS = {
  // Errores de validacion (400)
  VALIDATION_ERROR: {
    code: 'VALIDATION_ERROR',
    message: 'Request validation failed',
    message_es: 'Error de validacion en la solicitud',
  },
  INVALID_FILE_TYPE: {
    code: 'INVALID_FILE_TYPE',
    message: 'Invalid file type',
    message_es: 'Tipo de archivo invalido',
  },
  FILE_TOO_LARGE: {
    code: 'FILE_TOO_LARGE',
    message: 'File exceeds size limit',
    message_es: 'El archivo excede el limite de tamano',
  },
  INVALID_DATE_FORMAT: {
    code: 'INVALID_DATE_FORMAT',
    message: 'Invalid date format',
    message_es: 'Formato de fecha invalido. Use DD/MM/YYYY',
  },
  MISSING_REQUIRED_COLUMN: {
    code: 'MISSING_REQUIRED_COLUMN',
    message: 'Missing required column',
    message_es: 'Columna requerida faltante',
  },

  // Errores de autenticacion (401)
  UNAUTHORIZED: {
    code: 'UNAUTHORIZED',
    message: 'Authentication required',
    message_es: 'Autenticacion requerida',
  },
  SESSION_EXPIRED: {
    code: 'SESSION_EXPIRED',
    message: 'Session has expired',
    message_es: 'La sesion ha expirado. Inicie sesion nuevamente.',
  },

  // Errores de autorizacion (403)
  FORBIDDEN: {
    code: 'FORBIDDEN',
    message: 'Insufficient permissions',
    message_es: 'No tiene permisos para esta accion',
  },

  // Errores de recurso no encontrado (404)
  NOT_FOUND: {
    code: 'NOT_FOUND',
    message: 'Resource not found',
    message_es: 'Recurso no encontrado',
  },
  POSITION_NOT_FOUND: {
    code: 'POSITION_NOT_FOUND',
    message: 'Position not found',
    message_es: 'Posicion no encontrada',
  },
  CANDIDATE_NOT_FOUND: {
    code: 'CANDIDATE_NOT_FOUND',
    message: 'Candidate not found',
    message_es: 'Candidato no encontrado',
  },
  RECRUITER_NOT_FOUND: {
    code: 'RECRUITER_NOT_FOUND',
    message: 'Recruiter not found',
    message_es: 'Reclutador no encontrado',
  },
  ASSIGNMENT_NOT_FOUND: {
    code: 'ASSIGNMENT_NOT_FOUND',
    message: 'Assignment not found',
    message_es: 'Asignacion no encontrada',
  },
  CAMPAIGN_NOT_FOUND: {
    code: 'CAMPAIGN_NOT_FOUND',
    message: 'Campaign not found',
    message_es: 'Campaña no encontrada',
  },

  // Errores de conflicto (409)
  DUPLICATE_ENTRY: {
    code: 'DUPLICATE_ENTRY',
    message: 'Duplicate entry exists',
    message_es: 'Ya existe un registro con estos datos',
  },
  POSITION_ALREADY_ASSIGNED: {
    code: 'POSITION_ALREADY_ASSIGNED',
    message: 'Position already assigned',
    message_es: 'La posicion ya esta asignada',
  },
  CANDIDATE_ALREADY_EXISTS: {
    code: 'CANDIDATE_ALREADY_EXISTS',
    message: 'Candidate already exists',
    message_es: 'El candidato ya existe en el sistema',
  },

  // Errores de logica de negocio (422)
  NO_ELIGIBLE_RECRUITERS: {
    code: 'NO_ELIGIBLE_RECRUITERS',
    message: 'No eligible recruiters for this position',
    message_es: 'No hay reclutadores elegibles para esta posicion',
  },
  RECRUITER_AT_CAPACITY: {
    code: 'RECRUITER_AT_CAPACITY',
    message: 'Recruiter is at maximum capacity',
    message_es: 'El reclutador esta al maximo de su capacidad',
  },
  POSITION_CLOSED: {
    code: 'POSITION_CLOSED',
    message: 'Position is already closed',
    message_es: 'La posicion ya esta cerrada',
  },
  INVALID_STATUS_TRANSITION: {
    code: 'INVALID_STATUS_TRANSITION',
    message: 'Invalid status transition',
    message_es: 'Transicion de estado no permitida',
  },
  CAPABILITY_MISMATCH: {
    code: 'CAPABILITY_MISMATCH',
    message: 'Recruiter capability does not match position level',
    message_es: 'El nivel del reclutador no coincide con el nivel de la posicion',
  },

  // Errores del servidor (500)
  INTERNAL_ERROR: {
    code: 'INTERNAL_ERROR',
    message: 'Internal server error',
    message_es: 'Error interno del servidor. Intente nuevamente.',
  },
  DATABASE_ERROR: {
    code: 'DATABASE_ERROR',
    message: 'Database error',
    message_es: 'Error de base de datos. Contacte al administrador.',
  },
} as const;

export type ApiErrorCode = keyof typeof API_ERRORS;

// =============================================================================
// POSITIONS API
// =============================================================================

/**
 * GET /api/positions
 * Lista de posiciones con filtros
 */
export type GetPositionsResponse = ApiResponse<PaginatedResult<PositionSummary>>;

/**
 * GET /api/positions/[id]
 * Detalle de una posicion
 */
export type GetPositionResponse = ApiResponse<PositionDetail>;

/**
 * POST /api/positions
 * Crear una posicion
 * Field names match DB columns
 */
export interface CreatePositionRequest {
  title: string;
  description?: string;
  zone: Zone;
  level?: string;
  priority: PriorityLevel;
  headcount: number;
  is_urgent?: boolean;
  sla_days?: number;
}

export type CreatePositionResponse = ApiResponse<Position>;

/**
 * PUT /api/positions/[id]
 * Actualizar una posicion
 */
export interface UpdatePositionRequest {
  title?: string;
  description?: string;
  zone?: Zone;
  level?: string;
  priority?: PriorityLevel;
  status?: PositionStatus;
  headcount?: number;
  filled_count?: number;
  is_urgent?: boolean;
}

export type UpdatePositionResponse = ApiResponse<Position>;

/**
 * DELETE /api/positions/[id]
 * Eliminar una posicion (soft delete)
 */
export type DeletePositionResponse = ApiResponse<{ deleted: true }>;

/**
 * POST /api/positions/bulk
 * Operaciones masivas sobre posiciones
 */
export interface BulkPositionRequest {
  action: 'assign' | 'close' | 'delete' | 'update_priority';
  ids: string[];
  data?: {
    recruiter_id?: string; // Para assign
    priority?: PriorityLevel; // Para update_priority
  };
}

export type BulkPositionResponse = ApiResponse<{ affected: number }>;

// =============================================================================
// CANDIDATES API
// =============================================================================

/**
 * GET /api/candidates
 * Lista de candidatos con filtros
 */
export type GetCandidatesResponse = ApiResponse<PaginatedResult<CandidateSummary>>;

/**
 * GET /api/candidates/[id]
 * Detalle de un candidato
 */
export type GetCandidateResponse = ApiResponse<CandidateDetail>;

/**
 * POST /api/candidates
 * Crear un candidato
 * Field names match DB columns
 */
export interface CreateCandidateRequest {
  dni?: string;
  first_name: string;
  last_name: string;
  maternal_last_name?: string;
  phone: string; // Se normaliza automaticamente
  email?: string;
  zone?: Zone;
  address?: string;
  notes?: string;
  tags?: string[];
}

export type CreateCandidateResponse = ApiResponse<Candidate>;

/**
 * PUT /api/candidates/[id]
 * Actualizar un candidato
 */
export interface UpdateCandidateRequest {
  first_name?: string;
  last_name?: string;
  maternal_last_name?: string;
  phone?: string;
  email?: string;
  zone?: Zone;
  address?: string;
  status?: CandidateStatus;
  notes?: string;
  tags?: string[];
}

export type UpdateCandidateResponse = ApiResponse<Candidate>;

/**
 * DELETE /api/candidates/[id]
 * Eliminar un candidato (soft delete)
 */
export type DeleteCandidateResponse = ApiResponse<{ deleted: true }>;

/**
 * POST /api/candidates/dedup
 * Ejecutar deduplicacion de candidatos
 */
export interface DedupRequest {
  candidate_ids?: string[]; // IDs especificos a revisar
  run_all?: boolean; // Revisar todos
}

export interface DedupResult {
  total_checked: number;
  duplicates_found: number;
  auto_merged: number; // Fusionados automaticamente (>95% confianza)
  review_required: number; // Requieren revision manual
  matches: Array<{
    candidate_id: string;
    candidate_name: string;
    matches: DuplicateMatch[];
  }>;
  processing_time_ms: number;
}

export type DedupResponse = ApiResponse<DedupResult>;

/**
 * POST /api/candidates/merge
 * Fusionar candidatos duplicados
 */
export interface MergeCandidatesRequest {
  primary_id: string; // Candidato maestro
  secondary_ids: string[]; // Candidatos a fusionar
}

export type MergeCandidatesResponse = ApiResponse<{
  merged_count: number;
  primary_candidate: Candidate;
}>;

// =============================================================================
// ASSIGNMENTS API
// =============================================================================

/**
 * GET /api/assignments
 * Lista de asignaciones con filtros
 */
export type GetAssignmentsResponse = ApiResponse<PaginatedResult<AssignmentSummary>>;

/**
 * GET /api/assignments/[id]
 * Detalle de una asignacion
 */
export type GetAssignmentResponse = ApiResponse<AssignmentDetail>;

/**
 * POST /api/assignments
 * Crear asignacion manual
 */
export interface CreateAssignmentRequest {
  position_id: string;
  recruiter_id: string;
  notes?: string;
}

export type CreateAssignmentResponse = ApiResponse<Assignment>;

/**
 * PUT /api/assignments/[id]
 * Actualizar asignacion
 */
export interface UpdateAssignmentRequest {
  status?: AssignmentStatus;
  current_stage?: RecruitmentStage;
  notes?: string;
}

export type UpdateAssignmentResponse = ApiResponse<Assignment>;

/**
 * POST /api/assignments/auto
 * Asignacion automatica
 */
export interface AutoAssignRequest {
  position_ids: string[];
  force?: boolean; // Ignorar advertencias
}

export interface AutoAssignResult {
  assigned: Array<{
    position_id: string;
    recruiter_id: string;
    recruiter_name: string;
    score: number;
    explanation_es: string;
    score_breakdown: ScoreBreakdown;
  }>;
  skipped: Array<{
    position_id: string;
    reason: string;
    reason_es: string;
  }>;
  fallback_used: boolean;
}

export type AutoAssignResponse = ApiResponse<AutoAssignResult>;

/**
 * POST /api/assignments/[id]/reassign
 * Reasignar a otro reclutador
 */
export interface ReassignRequest {
  new_recruiter_id: string;
  reason?: string;
}

export type ReassignResponse = ApiResponse<Assignment>;

// =============================================================================
// RECRUITERS API
// =============================================================================

/**
 * GET /api/recruiters
 * Lista de reclutadores
 */
export type GetRecruitersResponse = ApiResponse<PaginatedResult<RecruiterSummary>>;

/**
 * GET /api/recruiters/[id]
 * Detalle de un reclutador
 */
export type GetRecruiterResponse = ApiResponse<RecruiterDetail>;

/**
 * POST /api/recruiters
 * Crear un reclutador
 * Field names match DB columns
 */
export interface CreateRecruiterRequest {
  name: string;
  email: string;
  phone?: string;
  primary_zone: Zone;
  secondary_zones?: Zone[];
  capability_level?: CapabilityLevel;
  capabilities?: string[];
  manager_id?: string;
}

export type CreateRecruiterResponse = ApiResponse<Recruiter>;

/**
 * PUT /api/recruiters/[id]
 * Actualizar un reclutador
 */
export interface UpdateRecruiterRequest {
  name?: string;
  phone?: string;
  primary_zone?: Zone;
  secondary_zones?: Zone[];
  capability_level?: CapabilityLevel;
  capabilities?: string[];
  is_active?: boolean;
  manager_id?: string;
}

export type UpdateRecruiterResponse = ApiResponse<Recruiter>;

/**
 * POST /api/recruiters/[id]/terminate
 * Desactivar reclutador y reasignar posiciones
 */
export interface TerminateRecruiterRequest {
  reason?: string;
  reassign_to?: string; // UUID del reclutador que recibe las posiciones
}

export interface TerminationResult {
  recruiter_id: string;
  positions_reassigned: number;
  reassignment_details: Array<{
    position_id: string;
    position_title: string;
    new_recruiter_id: string;
    new_recruiter_name: string;
  }>;
}

export type TerminateRecruiterResponse = ApiResponse<TerminationResult>;

// =============================================================================
// CAMPAIGNS API
// =============================================================================

/**
 * GET /api/campaigns
 * Lista de campanas
 */
export type GetCampaignsResponse = ApiResponse<PaginatedResult<CampaignSummary>>;

/**
 * GET /api/campaigns/[id]
 * Detalle de una campana
 */
export type GetCampaignResponse = ApiResponse<CampaignDetail>;

/**
 * POST /api/campaigns
 * Crear una campana
 * Field names match DB columns
 */
export interface CreateCampaignRequest {
  name: string;
  year: number;
  week_number: number;
  crop: CropType;
  zone: Zone;
  production_kg: number;
  start_date: string;
  end_date: string;
  estimated_workers?: number;
  kg_per_worker_day?: number;
}

export type CreateCampaignResponse = ApiResponse<Campaign>;

/**
 * PUT /api/campaigns/[id]
 * Actualizar una campana
 */
export interface UpdateCampaignRequest {
  name?: string;
  status?: CampaignStatus;
  start_date?: string;
  end_date?: string;
  estimated_workers?: number;
  kg_per_worker_day?: number;
}

export type UpdateCampaignResponse = ApiResponse<Campaign>;

// =============================================================================
// FORECAST API
// =============================================================================

/**
 * GET /api/forecast
 * Obtener pronostico para rango de fechas
 */
export interface GetForecastParams {
  start_date: string;
  end_date: string;
  crop?: CropType;
  zone?: Zone;
}

export type GetForecastResponse = ApiResponse<ForecastResult[]>;

/**
 * POST /api/forecast/validate
 * Validar precision del pronostico vs datos reales
 */
export interface ForecastValidateRequest {
  period_start: string;
  period_end: string;
}

export interface ForecastValidation {
  period: {
    start: string;
    end: string;
  };
  accuracy_metrics: {
    mape: number; // Mean Absolute Percentage Error
    rmse: number; // Root Mean Square Error
    bias: number; // Positive = over-forecast, Negative = under-forecast
  };
  by_crop: Record<CropType, {
    predicted: number;
    actual: number;
    error_percent: number;
  }>;
}

export type ForecastValidateResponse = ApiResponse<ForecastValidation>;

// =============================================================================
// UPLOAD API
// =============================================================================

/**
 * POST /api/upload
 * Iniciar carga de archivo Excel
 */
export interface UploadInitResult {
  upload_id: string;
  file_name: string;
  file_type: 'consolidado' | 'picos';
  validation: {
    valid: boolean;
    stats: {
      total_rows: number;
      valid_rows: number;
      error_rows: number;
      warning_rows: number;
    };
    errors: ValidationError[];
    warnings: ValidationWarning[];
  };
  preview_url: string;
}

export interface ValidationError {
  row: number;
  column: string;
  value: string | null;
  error: string;
  error_es: string;
}

export interface ValidationWarning {
  row: number;
  column: string;
  value: string | null;
  warning: string;
  warning_es: string;
  suggestion?: string;
}

export type UploadInitResponse = ApiResponse<UploadInitResult>;

/**
 * GET /api/upload/[id]
 * Estado de una carga
 */
export interface UploadStatus {
  upload_id: string;
  status: 'pending' | 'validating' | 'preview' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  stage: string; // Descripcion de etapa actual
  stage_es: string;
  created_at: string;
  completed_at: string | null;
  error?: string;
}

export type GetUploadStatusResponse = ApiResponse<UploadStatus>;

/**
 * GET /api/upload/[id]/preview
 * Vista previa de datos a importar
 */
export interface PreviewData {
  rows: Array<Record<string, unknown>>;
  columns: string[];
  total: number;
  page: number;
  limit: number;
}

export type GetUploadPreviewResponse = ApiResponse<PreviewData>;

/**
 * POST /api/upload/[id]/confirm
 * Confirmar importacion
 */
export interface ConfirmUploadRequest {
  auto_correct?: boolean; // Aplicar correcciones automaticas
  conflict_resolution?: 'excel' | 'app' | 'skip'; // Como resolver conflictos
}

export interface ImportResult {
  upload_id: string;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  details: {
    positions_created?: number;
    positions_updated?: number;
    candidates_created?: number;
    candidates_updated?: number;
    forecasts_created?: number;
  };
}

export type ConfirmUploadResponse = ApiResponse<ImportResult>;

// =============================================================================
// SETTINGS API
// =============================================================================

/**
 * GET /api/settings
 * Obtener todas las configuraciones
 */
export type GetSettingsResponse = ApiResponse<Record<string, Setting>>;

/**
 * GET /api/settings/[key]
 * Obtener una configuracion especifica
 */
export type GetSettingResponse = ApiResponse<Setting>;

/**
 * PUT /api/settings
 * Actualizar multiples configuraciones
 */
export interface UpdateSettingsRequest {
  settings: Array<{
    key: string;
    value: unknown;
  }>;
}

export type UpdateSettingsResponse = ApiResponse<{ updated: string[] }>;

/**
 * PUT /api/settings/[key]
 * Actualizar una configuracion especifica
 */
export interface UpdateSettingRequest {
  value: unknown;
}

export type UpdateSettingResponse = ApiResponse<Setting>;

// =============================================================================
// AUDIT API
// =============================================================================

/**
 * GET /api/audit
 * Obtener log de auditoria con filtros
 */
export interface AuditFilters {
  entity_type?: AuditEntityType;
  entity_id?: string;
  action?: AuditAction;
  actor_id?: string;
  start_date?: string;
  end_date?: string;
  page?: number;
  limit?: number;
}

export type GetAuditLogResponse = ApiResponse<PaginatedResult<AuditLogEntry>>;

// =============================================================================
// HEALTH API
// =============================================================================

/**
 * GET /api/health
 * Estado del servidor
 */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  checks: {
    database: 'connected' | 'error';
    storage: 'connected' | 'error';
  };
}

export type HealthResponse = HealthStatus;

// =============================================================================
// DASHBOARD API
// =============================================================================

/**
 * GET /api/dashboard/kpis
 * KPIs principales para el dashboard
 */
export interface DashboardKPIs {
  positions: {
    total_open: number;
    unassigned: number;
    overdue: number;
    filled_this_month: number;
  };
  recruiters: {
    total_active: number;
    avg_load: number;
    at_capacity: number;
  };
  candidates: {
    total: number;
    new_this_week: number;
    potential_duplicates: number;
  };
  performance: {
    avg_days_to_fill: number;
    sla_compliance_percent: number;
    fill_rate_percent: number;
  };
}

export type GetDashboardKPIsResponse = ApiResponse<DashboardKPIs>;

/**
 * GET /api/dashboard/alerts
 * Alertas activas para el dashboard
 */
export interface DashboardAlert {
  id: string;
  type: 'sla_warning' | 'sla_violation' | 'capacity_warning' | 'unassigned' | 'forecast_gap';
  severity: 'warning' | 'error' | 'info';
  title_es: string;
  message_es: string;
  entity_type: AuditEntityType;
  entity_id: string;
  created_at: string;
  action_url?: string;
}

export type GetDashboardAlertsResponse = ApiResponse<DashboardAlert[]>;
