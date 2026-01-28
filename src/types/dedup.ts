/**
 * Tipos para el sistema de deduplicacion y resolucion de candidatos
 * Talentia
 *
 * Este modulo define los tipos para las acciones de resolucion de duplicados:
 * - merge: Fusionar registros (combinar datos)
 * - link: Vincular como relacionados (misma persona, diferentes contactos)
 * - dismiss: Descartar como falso positivo
 */

// =============================================================================
// TIPOS DE ACCIONES DE RESOLUCION
// =============================================================================

/**
 * Tipos de accion para resolver duplicados
 */
export type DuplicateResolutionAction = 'merge' | 'link' | 'dismiss';

/**
 * Etiquetas en espanol para acciones de resolucion
 */
export const RESOLUTION_ACTION_LABELS: Record<DuplicateResolutionAction, {
  label: string;
  description: string;
  icon: string;
  color: string;
}> = {
  merge: {
    label: 'Fusionar',
    description: 'Combinar ambos registros en uno solo, manteniendo los datos mas recientes',
    icon: 'merge',
    color: 'teal',
  },
  link: {
    label: 'Vincular',
    description: 'Marcar como registros relacionados (misma persona, diferentes datos de contacto)',
    icon: 'link',
    color: 'sky',
  },
  dismiss: {
    label: 'Descartar',
    description: 'Marcar como falso positivo - no son la misma persona',
    icon: 'x',
    color: 'stone',
  },
} as const;

// =============================================================================
// SOLICITUDES API
// =============================================================================

/**
 * Solicitud para resolver un duplicado
 */
export interface ResolveDuplicateRequest {
  /** ID del candidato que se considera duplicado */
  duplicate_candidate_id: string;
  /** Accion a realizar */
  action: DuplicateResolutionAction;
  /** Notas opcionales sobre la decision */
  notes?: string;
}

/**
 * Solicitud de fusion de candidatos
 */
export interface MergeCandidatesRequest {
  /** ID del candidato maestro (se mantiene) */
  master_id: string;
  /** ID del candidato a fusionar (se marca como duplicado) */
  duplicate_id: string;
  /** Campos a tomar del duplicado (override) */
  fields_from_duplicate?: string[];
}

// =============================================================================
// RESPUESTAS API
// =============================================================================

/**
 * Respuesta de resolucion de duplicado
 */
export interface ResolveDuplicateResponse {
  success: boolean;
  mensaje: string;
  accion_realizada: DuplicateResolutionAction;
  candidato_principal?: {
    id: string;
    nombre_completo: string;
    telefono: string;
  };
  candidato_secundario?: {
    id: string;
    nombre_completo: string;
    telefono: string;
  };
  /** Datos fusionados (solo para accion merge) */
  datos_fusionados?: Record<string, unknown>;
}

/**
 * Error de resolucion de duplicado
 */
export interface ResolveDuplicateError {
  success: false;
  error: string;
  detalles?: string;
}

// =============================================================================
// TIPOS DE ESTADO DE DUPLICADO
// =============================================================================

/**
 * Estado de revision de duplicado
 */
export type DedupReviewStatus = 'pending' | 'reviewed' | 'merged' | 'linked' | 'dismissed';

/**
 * Etiquetas para estado de revision
 */
export const DEDUP_REVIEW_STATUS_LABELS: Record<DedupReviewStatus, {
  label: string;
  color: string;
}> = {
  pending: { label: 'Pendiente', color: 'amber' },
  reviewed: { label: 'Revisado', color: 'sky' },
  merged: { label: 'Fusionado', color: 'teal' },
  linked: { label: 'Vinculado', color: 'lime' },
  dismissed: { label: 'Descartado', color: 'stone' },
} as const;

// =============================================================================
// TIPOS PARA UI DE DUPLICADOS
// =============================================================================

/**
 * Informacion de duplicado para mostrar en UI
 */
export interface DuplicateDisplayInfo {
  id: string;
  nombre_completo: string;
  telefono: string;
  dni: string | null;
  zona: string | null;
  estado: string;
  ultimo_contacto: string | null;
  veces_contratado: number;
  confianza: number;
  tipo_coincidencia: 'phone' | 'name' | 'phone_and_name';
  detalles: {
    coincide_telefono: boolean;
    similitud_nombre: number;
    coincidencia_fonetica: boolean;
  };
}

/**
 * Resultado de verificacion de duplicados con opciones de resolucion
 */
export interface DuplicateCheckResult {
  tiene_duplicados: boolean;
  mensaje: string;
  coincidencias: DuplicateDisplayInfo[];
  total_coincidencias: number;
  recomendacion: {
    accion: 'fusion_automatica' | 'revision_requerida' | 'verificar_manualmente' | 'continuar';
    descripcion: string;
  };
}

// =============================================================================
// TIPOS PARA HISTORIAL DE VINCULACIONES
// =============================================================================

/**
 * Registro de vinculacion entre candidatos
 */
export interface CandidateLinkRecord {
  id: string;
  candidato_principal_id: string;
  candidato_vinculado_id: string;
  tipo_vinculo: 'duplicate' | 'related';
  creado_por: string | null;
  creado_en: string;
  notas: string | null;
}
