/**
 * Archivo de exportacion central para todos los tipos del sistema Talentia
 * Importar desde '@/types' o 'src/types'
 *
 * NOTE: Field names match database column names exactly (English).
 * Spanish labels are available in constants.ts FIELD_LABELS for UI display.
 */

// =============================================================================
// CONSTANTES DE NEGOCIO
// =============================================================================
export {
  // Prioridades y SLAs
  PRIORITY_LEVELS,
  SLA_BY_CAPABILITY,
  SLA_ALERT_MULTIPLIERS,

  // Pesos de asignacion
  ASSIGNMENT_WEIGHTS,

  // Limites de capacidad
  RECRUITER_HARD_CAP,
  RECRUITER_SOFT_CAP,
  FORECAST_LEAD_DAYS,

  // Zonas y cultivos
  ZONES,
  CROP_TYPES,

  // Niveles de capacidad
  CAPABILITY_LEVELS,

  // Estados
  POSITION_STATUS,
  CANDIDATE_STATUS,
  ASSIGNMENT_STATUS,
  CAMPAIGN_STATUS,

  // Tipos de asignacion
  ASSIGNMENT_TYPES,

  // Tipos de actor
  ACTOR_TYPES,

  // Fuentes de datos
  POSITION_SOURCES,
  CANDIDATE_SOURCES,
  CAMPAIGN_SOURCES,

  // Columnas de Excel
  CONSOLIDADO_REQUIRED_COLUMNS,
  CONSOLIDADO_OPTIONAL_COLUMNS,
  PICOS_REQUIRED_COLUMNS,
  PICOS_OPTIONAL_COLUMNS,

  // Deduplicacion
  DEDUP_THRESHOLDS,

  // Etapas de reclutamiento
  RECRUITMENT_STAGES,

  // Categorias de configuracion
  SETTING_CATEGORIES,

  // Auditoria
  AUDIT_ACTIONS,
  AUDIT_ENTITY_TYPES,

  // Formatos
  DATE_FORMAT_PERU,
  DATE_FORMAT_ISO,
  TIMEZONE_PERU,

  // Labels en espanol para UI
  FIELD_LABELS,
} from './constants';

// Tipos derivados de constantes
export type {
  PriorityLevel,
  AssignmentWeightKey,
  Zone,
  CropType,
  CapabilityLevel,
  PositionStatus,
  CandidateStatus,
  AssignmentStatus,
  CampaignStatus,
  AssignmentType,
  ActorType,
  PositionSource,
  CandidateSource,
  CampaignSource,
  RecruitmentStage,
  SettingCategory,
  AuditAction,
  AuditEntityType,
} from './constants';

// =============================================================================
// TIPOS DE BASE DE DATOS
// =============================================================================
export type {
  // Reclutadores
  Recruiter,
  RecruiterSummary,
  RecruiterDetail,

  // Posiciones
  Position,
  PositionSummary,
  PositionDetail,

  // Candidatos
  Candidate,
  CandidateSummary,
  CandidateDetail,
  ApplicationHistory,
  DuplicateMatch,

  // Asignaciones
  Assignment,
  AssignmentSummary,
  AssignmentDetail,
  ScoreBreakdown,
  StageTransition,

  // Campanas
  Campaign,
  CampaignSummary,
  CampaignDetail,
  DailyProgress,

  // Pronosticos
  Forecast,
  ForecastSummary,
  ForecastResult,
  ForecastBreakdown,
  ModelQuality,
  ForecastAlert,

  // Auditoria
  AuditLog,
  AuditLogEntry,

  // Configuracion
  Setting,
  TypedSettings,

  // Utilidades
  PaginatedResult,
  CommonFilters,
  PositionFilters,
  CandidateFilters,
  AssignmentFilters,
  CampaignFilters,
  RecruiterFilters,
} from './database';

// =============================================================================
// TIPOS DE API
// =============================================================================
export type {
  // Respuesta estandar
  ApiResponse,
  ApiError,
  ApiMeta,

  // Positions
  GetPositionsResponse,
  GetPositionResponse,
  CreatePositionRequest,
  CreatePositionResponse,
  UpdatePositionRequest,
  UpdatePositionResponse,
  DeletePositionResponse,
  BulkPositionRequest,
  BulkPositionResponse,

  // Candidates
  GetCandidatesResponse,
  GetCandidateResponse,
  CreateCandidateRequest,
  CreateCandidateResponse,
  UpdateCandidateRequest,
  UpdateCandidateResponse,
  DeleteCandidateResponse,
  DedupRequest,
  DedupResult,
  DedupResponse,
  MergeCandidatesRequest,
  MergeCandidatesResponse,

  // Assignments
  GetAssignmentsResponse,
  GetAssignmentResponse,
  CreateAssignmentRequest,
  CreateAssignmentResponse,
  UpdateAssignmentRequest,
  UpdateAssignmentResponse,
  AutoAssignRequest,
  AutoAssignResult,
  AutoAssignResponse,
  ReassignRequest,
  ReassignResponse,

  // Recruiters
  GetRecruitersResponse,
  GetRecruiterResponse,
  CreateRecruiterRequest,
  CreateRecruiterResponse,
  UpdateRecruiterRequest,
  UpdateRecruiterResponse,
  TerminateRecruiterRequest,
  TerminationResult,
  TerminateRecruiterResponse,

  // Campaigns
  GetCampaignsResponse,
  GetCampaignResponse,
  CreateCampaignRequest,
  CreateCampaignResponse,
  UpdateCampaignRequest,
  UpdateCampaignResponse,

  // Forecast
  GetForecastParams,
  GetForecastResponse,
  ForecastValidateRequest,
  ForecastValidation,
  ForecastValidateResponse,

  // Upload
  UploadInitResult,
  ValidationError,
  ValidationWarning,
  UploadInitResponse,
  UploadStatus,
  GetUploadStatusResponse,
  PreviewData,
  GetUploadPreviewResponse,
  ConfirmUploadRequest,
  ImportResult,
  ConfirmUploadResponse,

  // Settings
  GetSettingsResponse,
  GetSettingResponse,
  UpdateSettingsRequest,
  UpdateSettingsResponse,
  UpdateSettingRequest,
  UpdateSettingResponse,

  // Audit
  AuditFilters,
  GetAuditLogResponse,

  // Health
  HealthStatus,
  HealthResponse,

  // Dashboard
  DashboardKPIs,
  GetDashboardKPIsResponse,
  DashboardAlert,
  GetDashboardAlertsResponse,
} from './api';

// Constantes de errores de API
export { API_ERRORS } from './api';
export type { ApiErrorCode } from './api';

// =============================================================================
// SCHEMAS DE VALIDACION ZOD
// =============================================================================
export {
  // Utilidades de normalizacion
  normalizePhoneNumber,
  extractPhoneDigits,
  formatZodErrors,

  // Schemas de enums
  priorityLevelSchema,
  positionStatusSchema,
  candidateStatusSchema,
  assignmentStatusSchema,
  campaignStatusSchema,
  capabilityLevelSchema,
  zoneSchema,
  cropTypeSchema,
  recruitmentStageSchema,
  assignmentTypeSchema,
  actorTypeSchema,
  positionSourceSchema,
  candidateSourceSchema,
  campaignSourceSchema,
  settingCategorySchema,
  auditActionSchema,
  auditEntityTypeSchema,

  // Schemas de campos comunes
  uuidSchema,
  emailSchema,
  dniSchema,
  phoneSchema,
  phoneOptionalSchema,
  isoDateSchema,
  peruDateSchema,
  flexibleDateSchema,
  paginationSchema,

  // Schemas de Excel
  consolidadoRowSchema,
  consolidadoFileSchema,
  consolidadoColumnsSchema,
  picosRowSchema,
  picosFileSchema,
  picosColumnsSchema,

  // Schemas de formularios
  createPositionSchema,
  updatePositionSchema,
  createCandidateSchema,
  updateCandidateSchema,
  createRecruiterSchema,
  updateRecruiterSchema,
  createCampaignSchema,
  updateCampaignSchema,

  // Schemas de API requests
  createAssignmentSchema,
  updateAssignmentSchema,
  autoAssignSchema,
  reassignSchema,
  terminateRecruiterSchema,
  dedupRequestSchema,
  mergeCandidatesSchema,
  confirmUploadSchema,
  forecastFiltersSchema,
  forecastValidateSchema,
  updateSettingsSchema,
  updateSettingSchema,
  auditFiltersSchema,

  // Schemas de filtros
  positionFiltersSchema,
  candidateFiltersSchema,
  assignmentFiltersSchema,
  recruiterFiltersSchema,
  campaignFiltersSchema,

  // Schemas de operaciones bulk
  bulkPositionSchema,
} from './schemas';

// Tipos inferidos de Zod schemas
export type {
  ConsolidadoRow,
  PicosRow,
  CreatePositionInput,
  UpdatePositionInput,
  CreateCandidateInput,
  UpdateCandidateInput,
  CreateRecruiterInput,
  UpdateRecruiterInput,
  CreateCampaignInput,
  UpdateCampaignInput,
  CreateAssignmentInput,
  UpdateAssignmentInput,
  AutoAssignInput,
  ReassignInput,
  TerminateRecruiterInput,
  DedupRequestInput,
  MergeCandidatesInput,
  ConfirmUploadInput,
  ForecastFiltersInput,
  ForecastValidateInput,
  UpdateSettingsInput,
  UpdateSettingInput,
  AuditFiltersInput,
  PositionFiltersInput,
  CandidateFiltersInput,
  AssignmentFiltersInput,
  RecruiterFiltersInput,
  CampaignFiltersInput,
  BulkPositionInput,
  FormattedZodError,
} from './schemas';
