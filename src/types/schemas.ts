/**
 * Esquemas de validacion Zod para el sistema Talentia
 * Incluye validacion de Excel, formularios, y requests de API
 *
 * NOTE: Field names match database column names exactly (English).
 * Spanish labels are available in constants.ts FIELD_LABELS for UI display.
 */

import { z } from 'zod';
import {
  ZONES,
  CONSOLIDADO_REQUIRED_COLUMNS,
  PICOS_REQUIRED_COLUMNS,
} from './constants';

// =============================================================================
// UTILIDADES DE NORMALIZACION
// =============================================================================

/**
 * Normaliza numero de telefono a raw 9 digitos para almacenamiento en DB
 * La base de datos almacena telefonos como 9 digitos sin prefijos
 * Ejemplo: "987654321"
 *
 * Acepta multiples formatos de entrada:
 * - 987654321
 * - 0987654321
 * - +51987654321
 * - +51 987 654 321
 * - 51987654321
 */
export function normalizePhoneNumber(phone: string): string {
  // Eliminar todos los caracteres no numericos
  const digits = phone.replace(/\D/g, '');

  // Si empieza con 51 y tiene 11 digitos, remover el 51
  let normalized = digits;
  if (normalized.startsWith('51') && normalized.length === 11) {
    normalized = normalized.substring(2);
  }

  // Si empieza con 0 y tiene 10 digitos, remover el 0
  if (normalized.startsWith('0') && normalized.length === 10) {
    normalized = normalized.substring(1);
  }

  // Debe tener exactamente 9 digitos
  if (normalized.length !== 9) {
    return phone; // Retornar original si no se puede normalizar
  }

  // Retornar raw 9 digitos para consistencia con DB
  return normalized;
}

/**
 * Formatea telefono para mostrar en UI: +51 9XX XXX XXX
 * Usa el telefono normalizado (9 digitos) y agrega formato de display
 */
export function formatPhoneForDisplay(phone: string): string {
  // Primero normalizar a 9 digitos
  const normalized = normalizePhoneNumber(phone);

  // Si no se pudo normalizar, retornar original
  if (normalized.length !== 9) {
    return phone;
  }

  // Formatear para display: +51 9XX XXX XXX
  return `+51 ${normalized.substring(0, 3)} ${normalized.substring(3, 6)} ${normalized.substring(6)}`;
}

/**
 * Extrae solo digitos del telefono para comparacion
 * Alias de normalizePhoneNumber para claridad semantica
 */
export function extractPhoneDigits(phone: string): string {
  return normalizePhoneNumber(phone);
}

// =============================================================================
// TIPOS ENUMERADOS COMO SCHEMAS ZOD
// Aligned with DB CHECK constraints
// =============================================================================

/**
 * Schema para nivel de prioridad
 * Matches DB: priority IN ('P1', 'P2', 'P3')
 */
export const priorityLevelSchema = z.enum(['P1', 'P2', 'P3']);

/**
 * Schema para estado de posicion
 * Matches DB: status IN ('open', 'assigned', 'in_progress', 'interviewing', 'offer_sent', 'filled', 'cancelled', 'on_hold')
 */
export const positionStatusSchema = z.enum([
  'open',
  'assigned',
  'in_progress',
  'interviewing',
  'offer_sent',
  'filled',
  'cancelled',
  'on_hold',
]);

/**
 * Schema para estado de candidato
 * Matches DB: status IN ('available', 'contacted', 'interviewing', 'hired', 'rejected', 'blacklisted', 'inactive')
 */
export const candidateStatusSchema = z.enum([
  'available',
  'contacted',
  'interviewing',
  'hired',
  'rejected',
  'blacklisted',
  'inactive',
]);

/**
 * Schema para estado de asignacion
 * Matches DB: status IN ('assigned', 'accepted', 'in_progress', 'completed', 'reassigned', 'cancelled')
 */
export const assignmentStatusSchema = z.enum([
  'assigned',
  'accepted',
  'in_progress',
  'completed',
  'reassigned',
  'cancelled',
]);

/**
 * Schema para estado de campana
 * Matches DB: status IN ('planned', 'recruiting', 'active', 'completed')
 */
export const campaignStatusSchema = z.enum([
  'planned',
  'recruiting',
  'active',
  'completed',
]);

/**
 * Schema para nivel de capacidad
 * Matches DB: capability_level BETWEEN 1 AND 5
 */
export const capabilityLevelSchema = z.union([
  z.literal(1),
  z.literal(2),
  z.literal(3),
  z.literal(4),
  z.literal(5),
]);

/**
 * Schema para zonas
 */
export const zoneSchema = z.enum([
  'Trujillo',
  'Viru',
  'Chao',
  'Chicama',
  'Chiclayo',
  'Arequipa',
  'Ica',
  'Lima',
]);

/**
 * Schema para tipos de cultivo
 * Matches DB settings: crop_productivity keys
 */
export const cropTypeSchema = z.enum(['esparrago', 'arandano', 'palta', 'uva']);

/**
 * Schema para etapas de reclutamiento
 * Matches DB: current_stage IN ('assigned', 'first_contact', 'first_interview_scheduled', 'interview_completed', 'decision_made', 'offer_sent', 'completed')
 */
export const recruitmentStageSchema = z.enum([
  'assigned',
  'first_contact',
  'first_interview_scheduled',
  'interview_completed',
  'decision_made',
  'offer_sent',
  'completed',
]);

/**
 * Schema para tipo de asignacion
 * Matches DB: assignment_type IN ('auto', 'manual', 'fallback', 'reassigned')
 */
export const assignmentTypeSchema = z.enum([
  'auto',
  'manual',
  'fallback',
  'reassigned',
]);

/**
 * Schema para tipo de actor en auditoria
 * Matches DB: actor_type IN ('user', 'recruiter', 'system', 'cron')
 */
export const actorTypeSchema = z.enum([
  'user',
  'recruiter',
  'system',
  'cron',
]);

/**
 * Schema para fuente de posiciones
 * Matches DB: source IN ('manual', 'consolidado', 'api')
 */
export const positionSourceSchema = z.enum(['manual', 'consolidado', 'api']);

/**
 * Schema para fuente de candidatos
 * Matches DB: source IN ('manual', 'consolidado', 'referral', 'api')
 */
export const candidateSourceSchema = z.enum(['manual', 'consolidado', 'referral', 'api']);

/**
 * Schema para fuente de campanas
 * Matches DB: source IN ('picos', 'manual', 'api')
 */
export const campaignSourceSchema = z.enum(['picos', 'manual', 'api']);

/**
 * Schema para acciones de auditoria
 */
export const auditActionSchema = z.enum([
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
]);

/**
 * Schema para tipos de entidad en auditoria
 */
export const auditEntityTypeSchema = z.enum([
  'position',
  'candidate',
  'recruiter',
  'assignment',
  'campaign',
  'forecast',
  'settings',
  'upload',
]);

/**
 * Schema para categoria de configuracion
 * Matches DB: settings.category
 */
export const settingCategorySchema = z.enum([
  'assignment',
  'sla',
  'dedup',
  'forecast',
  'ui',
]);

// =============================================================================
// SCHEMAS DE CAMPOS COMUNES
// =============================================================================

/**
 * Schema para UUID
 */
export const uuidSchema = z.string().uuid({
  message: 'ID invalido',
});

/**
 * Schema para email
 */
export const emailSchema = z.string().email({
  message: 'Email invalido',
});

/**
 * Schema para DNI peruano (8 digitos)
 */
export const dniSchema = z.string()
  .min(8, { message: 'DNI debe tener 8 digitos' })
  .max(8, { message: 'DNI debe tener 8 digitos' })
  .regex(/^\d{8}$/, { message: 'DNI debe contener solo numeros' });

/**
 * Schema para telefono peruano
 * Acepta multiples formatos, se normaliza automaticamente
 */
export const phoneSchema = z.string()
  .min(9, { message: 'Telefono debe tener al menos 9 digitos' })
  .max(20, { message: 'Telefono muy largo' })
  .refine((val) => {
    const digits = val.replace(/\D/g, '');
    // Debe tener entre 9 y 11 digitos
    return digits.length >= 9 && digits.length <= 11;
  }, { message: 'Formato de telefono invalido' })
  .transform(normalizePhoneNumber);

/**
 * Schema para telefono opcional
 */
export const phoneOptionalSchema = z.string()
  .optional()
  .nullable()
  .transform((val) => val ? normalizePhoneNumber(val) : val);

/**
 * Schema para fecha en formato ISO
 */
export const isoDateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'Fecha debe estar en formato YYYY-MM-DD',
  });

/**
 * Schema para fecha en formato Peru (DD/MM/YYYY)
 * Se transforma a ISO internamente
 */
export const peruDateSchema = z.string()
  .regex(/^\d{2}\/\d{2}\/\d{4}$/, {
    message: 'Fecha debe estar en formato DD/MM/YYYY',
  })
  .transform((val) => {
    const [day, month, year] = val.split('/');
    return `${year}-${month}-${day}`;
  });

/**
 * Schema flexible para fecha (acepta ISO o Peru)
 */
export const flexibleDateSchema = z.string()
  .refine((val) => {
    // ISO format
    if (/^\d{4}-\d{2}-\d{2}$/.test(val)) return true;
    // Peru format
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) return true;
    return false;
  }, { message: 'Fecha debe estar en formato YYYY-MM-DD o DD/MM/YYYY' })
  .transform((val) => {
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(val)) {
      const [day, month, year] = val.split('/');
      return `${year}-${month}-${day}`;
    }
    return val;
  });

/**
 * Schema para paginacion
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
});

// =============================================================================
// SCHEMAS PARA EXCEL - CONSOLIDADO
// =============================================================================

/**
 * Schema para una fila de CONSOLIDADO
 * Maps Excel columns to DB columns
 */
export const consolidadoRowSchema = z.object({
  // Required columns
  fecha: flexibleDateSchema, // -> opened_at
  zona: zoneSchema, // -> zone
  puesto: z.string().min(1, { message: 'Puesto es requerido' }), // -> title
  nivel: z.union([
    z.string(),
    z.coerce.number().int().min(1).max(5),
  ]).transform(val => String(val)), // -> level
  prioridad: priorityLevelSchema, // -> priority
  cantidad: z.coerce.number().int().positive({
    message: 'Cantidad debe ser mayor a 0',
  }), // -> headcount
  // Optional columns
  descripcion: z.string().optional().nullable(), // -> description
  observaciones: z.string().optional().nullable(), // -> appended to description
});

export type ConsolidadoRow = z.infer<typeof consolidadoRowSchema>;

/**
 * Schema para archivo CONSOLIDADO completo
 */
export const consolidadoFileSchema = z.object({
  rows: z.array(consolidadoRowSchema).min(1, {
    message: 'El archivo debe contener al menos una fila',
  }),
});

/**
 * Validar que columnas requeridas esten presentes en CONSOLIDADO
 */
export const consolidadoColumnsSchema = z.object({
  columns: z.array(z.string()).refine(
    (cols) => {
      const lowerCols = cols.map(c => c.toLowerCase().trim());
      return CONSOLIDADO_REQUIRED_COLUMNS.every(req =>
        lowerCols.includes(req.toLowerCase())
      );
    },
    {
      message: `Columnas requeridas faltantes. Se necesitan: ${CONSOLIDADO_REQUIRED_COLUMNS.join(', ')}`,
    }
  ),
});

// =============================================================================
// SCHEMAS PARA EXCEL - PICOS
// =============================================================================

/**
 * Schema para una fila de Picos
 * Maps Excel columns to DB campaigns columns
 */
export const picosRowSchema = z.object({
  // Required columns
  semana: z.coerce.number().int().min(1).max(53, {
    message: 'Semana debe estar entre 1 y 53',
  }), // -> week_number
  ano: z.coerce.number().int().min(2020).max(2100, {
    message: 'Ano invalido',
  }), // -> year
  cultivo: cropTypeSchema, // -> crop
  zona: zoneSchema, // -> zone
  produccion_kg: z.coerce.number().nonnegative({
    message: 'Produccion no puede ser negativa',
  }), // -> production_kg
  // Optional columns
  trabajadores_estimados: z.coerce.number().int().nonnegative().optional().nullable(), // -> estimated_workers
});

export type PicosRow = z.infer<typeof picosRowSchema>;

/**
 * Schema para archivo Picos completo
 */
export const picosFileSchema = z.object({
  rows: z.array(picosRowSchema).min(1, {
    message: 'El archivo debe contener al menos una fila',
  }),
});

/**
 * Validar que columnas requeridas esten presentes en Picos
 */
export const picosColumnsSchema = z.object({
  columns: z.array(z.string()).refine(
    (cols) => {
      const lowerCols = cols.map(c => c.toLowerCase().trim());
      return PICOS_REQUIRED_COLUMNS.every(req =>
        lowerCols.includes(req.toLowerCase())
      );
    },
    {
      message: `Columnas requeridas faltantes. Se necesitan: ${PICOS_REQUIRED_COLUMNS.join(', ')}`,
    }
  ),
});

// =============================================================================
// SCHEMAS PARA FORMULARIOS - CREATE
// =============================================================================

/**
 * Schema para crear posicion
 * Field names match DB columns
 */
export const createPositionSchema = z.object({
  title: z.string()
    .min(3, { message: 'Titulo debe tener al menos 3 caracteres' })
    .max(255, { message: 'Titulo muy largo' }),
  description: z.string().max(2000).optional().nullable(),
  zone: zoneSchema,
  level: z.string().default('operario'),
  priority: priorityLevelSchema,
  headcount: z.coerce.number().int().positive({
    message: 'Cantidad debe ser mayor a 0',
  }).default(1),
  is_urgent: z.boolean().default(false),
  sla_days: z.coerce.number().int().positive().optional(),
});

export type CreatePositionInput = z.infer<typeof createPositionSchema>;

/**
 * Schema para actualizar posicion
 */
export const updatePositionSchema = createPositionSchema.partial().extend({
  status: positionStatusSchema.optional(),
  filled_count: z.coerce.number().int().nonnegative().optional(),
});

export type UpdatePositionInput = z.infer<typeof updatePositionSchema>;

/**
 * Schema para crear candidato
 * Field names match DB columns
 */
export const createCandidateSchema = z.object({
  dni: dniSchema.optional().nullable(),
  first_name: z.string()
    .min(2, { message: 'Nombre debe tener al menos 2 caracteres' })
    .max(100, { message: 'Nombre muy largo' }),
  last_name: z.string()
    .min(2, { message: 'Apellido debe tener al menos 2 caracteres' })
    .max(150, { message: 'Apellido muy largo' }),
  maternal_last_name: z.string().max(100).optional().nullable(),
  phone: phoneSchema,
  email: emailSchema.optional().nullable(),
  zone: zoneSchema.optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  tags: z.array(z.string()).default([]),
});

export type CreateCandidateInput = z.infer<typeof createCandidateSchema>;

/**
 * Schema para actualizar candidato
 */
export const updateCandidateSchema = createCandidateSchema.partial().extend({
  status: candidateStatusSchema.optional(),
});

export type UpdateCandidateInput = z.infer<typeof updateCandidateSchema>;

/**
 * Schema para crear reclutador
 * Field names match DB columns
 */
export const createRecruiterSchema = z.object({
  name: z.string()
    .min(2, { message: 'Nombre debe tener al menos 2 caracteres' })
    .max(255, { message: 'Nombre muy largo' }),
  email: emailSchema,
  phone: phoneOptionalSchema,
  primary_zone: zoneSchema,
  secondary_zones: z.array(zoneSchema).default([]),
  capability_level: capabilityLevelSchema.default(1),
  capabilities: z.array(z.string()).default(['operario']),
  manager_id: uuidSchema.optional().nullable(),
});

export type CreateRecruiterInput = z.infer<typeof createRecruiterSchema>;

/**
 * Schema para actualizar reclutador
 */
export const updateRecruiterSchema = createRecruiterSchema.partial().omit({ email: true }).extend({
  is_active: z.boolean().optional(),
});

export type UpdateRecruiterInput = z.infer<typeof updateRecruiterSchema>;

/**
 * Base schema for campaign fields (without refinement)
 * Field names match DB columns
 */
const campaignFieldsSchema = z.object({
  name: z.string()
    .min(3, { message: 'Nombre debe tener al menos 3 caracteres' })
    .max(255, { message: 'Nombre muy largo' }),
  year: z.coerce.number().int().min(2020).max(2100),
  week_number: z.coerce.number().int().min(1).max(53),
  crop: cropTypeSchema,
  zone: zoneSchema,
  production_kg: z.coerce.number().nonnegative(),
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  estimated_workers: z.coerce.number().int().nonnegative().optional().nullable(),
  kg_per_worker_day: z.coerce.number().nonnegative().optional().nullable(),
});

/**
 * Schema para crear campana (with date validation refinement)
 */
export const createCampaignSchema = campaignFieldsSchema.refine(
  (data) => new Date(data.start_date) <= new Date(data.end_date),
  { message: 'Fecha de inicio debe ser anterior a fecha de fin', path: ['start_date'] }
);

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;

/**
 * Schema para actualizar campana
 */
export const updateCampaignSchema = campaignFieldsSchema.partial().extend({
  status: campaignStatusSchema.optional(),
});

export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;

// =============================================================================
// SCHEMAS PARA API REQUESTS
// =============================================================================

/**
 * Schema para crear asignacion manual
 */
export const createAssignmentSchema = z.object({
  position_id: uuidSchema,
  recruiter_id: uuidSchema,
  notes: z.string().max(2000).optional().nullable(),
});

export type CreateAssignmentInput = z.infer<typeof createAssignmentSchema>;

/**
 * Schema para actualizar asignacion
 */
export const updateAssignmentSchema = z.object({
  status: assignmentStatusSchema.optional(),
  current_stage: recruitmentStageSchema.optional(),
  notes: z.string().max(2000).optional().nullable(),
});

export type UpdateAssignmentInput = z.infer<typeof updateAssignmentSchema>;

/**
 * Schema para asignacion automatica
 */
export const autoAssignSchema = z.object({
  position_ids: z.array(uuidSchema).min(1, {
    message: 'Debe seleccionar al menos una posicion',
  }),
  force: z.boolean().default(false),
});

export type AutoAssignInput = z.infer<typeof autoAssignSchema>;

/**
 * Schema para reasignacion
 */
export const reassignSchema = z.object({
  new_recruiter_id: uuidSchema,
  reason: z.string().max(500).optional(),
});

export type ReassignInput = z.infer<typeof reassignSchema>;

/**
 * Schema para terminacion de reclutador
 */
export const terminateRecruiterSchema = z.object({
  reason: z.string().max(500).optional(),
  reassign_to: uuidSchema.optional().nullable(),
});

export type TerminateRecruiterInput = z.infer<typeof terminateRecruiterSchema>;

/**
 * Schema para deduplicacion
 */
export const dedupRequestSchema = z.object({
  candidate_ids: z.array(uuidSchema).optional(),
  run_all: z.boolean().default(false),
}).refine(
  (data) => data.candidate_ids?.length || data.run_all,
  { message: 'Debe especificar candidate_ids o run_all' }
);

export type DedupRequestInput = z.infer<typeof dedupRequestSchema>;

/**
 * Schema para fusion de candidatos
 */
export const mergeCandidatesSchema = z.object({
  primary_id: uuidSchema,
  secondary_ids: z.array(uuidSchema).min(1, {
    message: 'Debe seleccionar al menos un candidato a fusionar',
  }),
});

export type MergeCandidatesInput = z.infer<typeof mergeCandidatesSchema>;

/**
 * Schema para confirmar importacion
 */
export const confirmUploadSchema = z.object({
  auto_correct: z.boolean().default(false),
  conflict_resolution: z.enum(['excel', 'app', 'skip']).default('skip'),
});

export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

/**
 * Schema para filtros de pronostico
 */
export const forecastFiltersSchema = z.object({
  start_date: isoDateSchema,
  end_date: isoDateSchema,
  crop: cropTypeSchema.optional(),
  zone: zoneSchema.optional(),
}).refine(
  (data) => new Date(data.start_date) <= new Date(data.end_date),
  { message: 'Fecha de inicio debe ser anterior a fecha de fin' }
);

export type ForecastFiltersInput = z.infer<typeof forecastFiltersSchema>;

/**
 * Schema para validacion de pronostico
 */
export const forecastValidateSchema = z.object({
  period_start: isoDateSchema,
  period_end: isoDateSchema,
}).refine(
  (data) => new Date(data.period_start) <= new Date(data.period_end),
  { message: 'Periodo de inicio debe ser anterior a periodo de fin' }
);

export type ForecastValidateInput = z.infer<typeof forecastValidateSchema>;

/**
 * Schema para actualizar configuraciones
 */
export const updateSettingsSchema = z.object({
  settings: z.array(z.object({
    key: z.string().min(1),
    value: z.unknown(),
  })).min(1, { message: 'Debe incluir al menos una configuracion' }),
});

export type UpdateSettingsInput = z.infer<typeof updateSettingsSchema>;

/**
 * Schema para actualizar una configuracion
 */
export const updateSettingSchema = z.object({
  value: z.unknown(),
});

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>;

/**
 * Schema para filtros de auditoria
 */
export const auditFiltersSchema = z.object({
  entity_type: auditEntityTypeSchema.optional(),
  entity_id: uuidSchema.optional(),
  action: auditActionSchema.optional(),
  actor_id: uuidSchema.optional(),
  start_date: isoDateSchema.optional(),
  end_date: isoDateSchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

export type AuditFiltersInput = z.infer<typeof auditFiltersSchema>;

// =============================================================================
// SCHEMAS PARA FILTROS DE LISTADOS
// =============================================================================

/**
 * Schema para filtros de posiciones
 */
export const positionFiltersSchema = paginationSchema.extend({
  status: z.union([positionStatusSchema, z.array(positionStatusSchema)]).optional(),
  zone: z.union([zoneSchema, z.array(zoneSchema)]).optional(),
  level: z.union([z.string(), z.array(z.string())]).optional(),
  priority: z.union([priorityLevelSchema, z.array(priorityLevelSchema)]).optional(),
  opened_from: isoDateSchema.optional(),
  opened_to: isoDateSchema.optional(),
  recruiter_id: uuidSchema.optional(),
  unassigned_only: z.coerce.boolean().default(false),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['opened_at', 'title', 'zone', 'priority', 'sla_days']).default('opened_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type PositionFiltersInput = z.infer<typeof positionFiltersSchema>;

/**
 * Schema para filtros de candidatos
 */
export const candidateFiltersSchema = paginationSchema.extend({
  status: z.union([candidateStatusSchema, z.array(candidateStatusSchema)]).optional(),
  zone: z.union([zoneSchema, z.array(zoneSchema)]).optional(),
  duplicates_only: z.coerce.boolean().default(false),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['full_name', 'dni', 'last_contacted_at', 'created_at']).default('created_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type CandidateFiltersInput = z.infer<typeof candidateFiltersSchema>;

/**
 * Schema para filtros de asignaciones
 */
export const assignmentFiltersSchema = paginationSchema.extend({
  status: z.union([assignmentStatusSchema, z.array(assignmentStatusSchema)]).optional(),
  recruiter_id: uuidSchema.optional(),
  position_id: uuidSchema.optional(),
  stage: recruitmentStageSchema.optional(),
  overdue_only: z.coerce.boolean().default(false),
  sort_by: z.enum(['assigned_at', 'score', 'status']).default('assigned_at'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type AssignmentFiltersInput = z.infer<typeof assignmentFiltersSchema>;

/**
 * Schema para filtros de reclutadores
 */
export const recruiterFiltersSchema = paginationSchema.extend({
  is_active: z.coerce.boolean().optional(),
  primary_zone: z.union([zoneSchema, z.array(zoneSchema)]).optional(),
  capability_level: z.union([capabilityLevelSchema, z.array(capabilityLevelSchema)]).optional(),
  search: z.string().max(100).optional(),
  sort_by: z.enum(['name', 'primary_zone', 'current_load', 'fill_rate_30d']).default('name'),
  sort_order: z.enum(['asc', 'desc']).default('asc'),
});

export type RecruiterFiltersInput = z.infer<typeof recruiterFiltersSchema>;

/**
 * Schema para filtros de campanas
 */
export const campaignFiltersSchema = paginationSchema.extend({
  status: z.union([campaignStatusSchema, z.array(campaignStatusSchema)]).optional(),
  crop: cropTypeSchema.optional(),
  zone: zoneSchema.optional(),
  year: z.coerce.number().int().min(2020).max(2100).optional(),
  sort_by: z.enum(['name', 'start_date', 'status', 'production_kg']).default('start_date'),
  sort_order: z.enum(['asc', 'desc']).default('desc'),
});

export type CampaignFiltersInput = z.infer<typeof campaignFiltersSchema>;

// =============================================================================
// SCHEMAS PARA OPERACIONES BULK
// =============================================================================

/**
 * Schema para operaciones masivas de posiciones
 */
export const bulkPositionSchema = z.object({
  action: z.enum(['assign', 'close', 'delete', 'update_priority']),
  ids: z.array(uuidSchema).min(1, {
    message: 'Debe seleccionar al menos una posicion',
  }),
  data: z.object({
    recruiter_id: uuidSchema.optional(),
    priority: priorityLevelSchema.optional(),
  }).optional(),
}).refine(
  (data) => {
    if (data.action === 'assign' && !data.data?.recruiter_id) {
      return false;
    }
    if (data.action === 'update_priority' && !data.data?.priority) {
      return false;
    }
    return true;
  },
  { message: 'Datos adicionales requeridos para esta accion' }
);

export type BulkPositionInput = z.infer<typeof bulkPositionSchema>;

// =============================================================================
// TIPO INFERIDO DE ERRORES DE VALIDACION
// =============================================================================

/**
 * Tipo para errores de validacion de Zod formateados
 */
export interface FormattedZodError {
  field: string;
  message: string;
}

/**
 * Formatea errores de Zod para API response
 */
export function formatZodErrors(error: z.ZodError<unknown>): FormattedZodError[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.'),
    message: issue.message,
  }));
}
