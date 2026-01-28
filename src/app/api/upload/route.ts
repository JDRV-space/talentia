/**
 * API endpoint para carga de archivos Excel
 * POST /api/upload - Procesa archivo Excel y retorna datos validados
 *
 * IMPORTANT: This route handles large file uploads (up to 100MB).
 * The middleware skips this route to preserve the raw body stream.
 * Body size limits are configured in next.config.ts.
 *
 * Performance: Uses batch inserts with in-memory deduplication for 11k+ rows in <30s
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import {
  parseConsolidadoReal,
  parsePicosReal,
  detectFileType,
  type ParseRealResult,
  type ConsolidadoRealRow,
  type PicosRealRow,
  type FileType,
} from '@/lib/excel/real-parser';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { findDuplicates, toSpanishPhonetic } from '@/lib/algorithms/dedup';
import { calculateHistoricalLaborRatios, getLaborRatio, type LaborRatioResult } from '@/lib/algorithms';
import { DEDUP_THRESHOLDS, CROP_TYPES } from '@/types/constants';
import type { Candidate, Campaign, Position } from '@/types/database';
import type { CropType } from '@/types/constants';

// =============================================================================
// ROUTE SEGMENT CONFIG
// =============================================================================

/**
 * Maximum execution time for large file processing (Vercel/Edge deployments)
 * Default is 10s for hobby, 60s for pro, 900s for enterprise
 */
export const maxDuration = 60;

/**
 * Force Node.js runtime (not Edge) for better compatibility with xlsx library
 */
export const runtime = 'nodejs';

/**
 * Disable static generation for this dynamic API route
 */
export const dynamic = 'force-dynamic';

// =============================================================================
// TIPOS
// =============================================================================

interface UploadResponse {
  success: boolean;
  fileType?: FileType;
  data?: ParseRealResult<ConsolidadoRealRow> | ParseRealResult<PicosRealRow>;
  extractedDate?: string | null;
  dateSource?: string;
  error?: string;
  auditId?: string;
  syncStats?: SyncStats;
}

interface SyncStats {
  positionsProcessed: number;
  positionsUpdated: number;
  positionsInserted: number;
  candidatesProcessed: number;
  campaignsProcessed: number;
  recruitersProcessed: number;
  recruitersCreated: number;
  duplicatesFound: number;
  batchesExecuted: number;
  errors: number;
  defaultEstimatesUsed: number;
  durationMs: number;
}

interface PositionData {
  external_id: string;
  fingerprint: string;
  title: string;
  zone: string;
  level: string;
  priority: string;
  status: string;
  headcount: number;
  filled_count: number;
  opened_at: string;
  sla_deadline: string | null;
  closed_at: string | null;
  days_to_fill: number | null;
  days_in_process: number | null;
  is_on_time: boolean | null;
  source: string;
  pipeline_stage: string;
  recruiter_id: string | null;
  recruiter_name: string | null;
  // Direct campaign linking fields
  week_number: number | null;
  crop: string | null;
}

interface CandidateData {
  dni: string;
  first_name: string;
  last_name: string;
  maternal_last_name: string | null;
  full_name: string;
  name_phonetic: string;
  phone: string;
  phone_normalized: string;
  zone: string;
  status: string;
  source: string;
}

interface CampaignData {
  name: string;
  year: number;
  week_number: number;
  crop: string;
  zone: string;
  production_kg: number;
  start_date: string;
  end_date: string;
  estimated_workers: number;
  kg_per_worker_day: number;
  status: string;
  source: string;
}

// =============================================================================
// CONFIGURACION
// =============================================================================

/**
 * Tamaño máximo de archivo (100MB)
 */
const MAX_FILE_SIZE = 100 * 1024 * 1024;

/**
 * Extensiones de archivo permitidas
 */
const ALLOWED_EXTENSIONS = ['.xlsx', '.xls'];

/**
 * MIME types permitidos
 */
const ALLOWED_MIME_TYPES = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
  'application/vnd.ms-excel', // xls
  'application/octet-stream', // fallback para algunos navegadores
];

/**
 * Batch processing configuration
 */
const BATCH_SIZE = 500;
const CONCURRENCY = 5;

/**
 * ==========================================================================
 * FEATURE FLAG: Simple Estimates
 * ==========================================================================
 * When true: Uses simple "last year + 10%" estimate for campaigns
 * When false: Uses complex labor ratio algorithm
 *
 * Set to true for 600 PEN budget simplification (Jan 2026)
 * To restore complex algorithm: set to false
 * ==========================================================================
 */
const USE_SIMPLE_ESTIMATES = true;

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Valida el archivo antes de procesarlo
 */
function validateFile(file: File): string | null {
  // Validar tamaño
  if (file.size > MAX_FILE_SIZE) {
    return `El archivo excede el tamaño máximo de ${MAX_FILE_SIZE / 1024 / 1024}MB`;
  }

  // Validar extension
  const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(extension)) {
    return `Extension no permitida. Se aceptan: ${ALLOWED_EXTENSIONS.join(', ')}`;
  }

  // Validar MIME type (con fallback para navegadores que no lo envian correctamente)
  if (file.type && !ALLOWED_MIME_TYPES.includes(file.type)) {
    return 'Tipo de archivo no permitido. Solo se aceptan archivos Excel';
  }

  return null;
}

/**
 * Genera ID de auditoria (UUID format for audit_log table)
 */
function generateAuditId(): string {
  return randomUUID();
}

/**
 * Chunks an array into smaller arrays of specified size
 */
function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

/**
 * Process items in parallel with concurrency limit
 */
async function processInParallel<T, R>(
  items: T[],
  fn: (item: T) => Promise<R>,
  concurrency: number
): Promise<R[]> {
  const results: R[] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    const batchResults = await Promise.all(batch.map(fn));
    results.push(...batchResults);
  }
  return results;
}

// =============================================================================
// BATCH SYNC FUNCTIONS
// =============================================================================

/**
 * Sync CONSOLIDADO data using true upsert behavior:
 * - UPDATE existing positions (by external_id)
 * - INSERT new positions
 * Preserves existing data while adding/updating from new uploads
 */
/**
 * Map Excel GRUPO OCUPACIONAL to position level
 * IMPORTANT: Order matters! Check specific patterns before general ones
 * (e.g., SUBGERENTE before GERENTE to avoid false matches)
 */
function mapGrupoOcupacional(grupo: string | null): string {
  if (!grupo) return 'operario';
  const normalized = grupo.toUpperCase().trim();

  // Order matters! Check specific before general
  if (normalized.includes('SUBGERENTE')) return 'subgerente';
  if (normalized.includes('GERENTE')) return 'gerente';
  if (normalized.includes('JEFE')) return 'jefe';
  if (normalized.includes('SUPERVISOR')) return 'supervisor';
  if (normalized.includes('COORDINADOR')) return 'coordinador';
  if (normalized.includes('ANALISTA')) return 'analista';
  if (normalized.includes('ASISTENTE')) return 'asistente';
  if (normalized.includes('PRACTICANTE')) return 'practicante';
  if (normalized.includes('CONTROLADOR')) return 'controlador';
  if (normalized.includes('TECNICO') || normalized.includes('TECNICO')) return 'tecnico';
  if (normalized.includes('AUXILIAR')) return 'auxiliar';
  if (normalized.includes('OPERARIO')) return 'operario';
  if (normalized.includes('EMPLEADO')) return 'analista';

  // Default
  return 'operario';
}

/**
 * Map Excel COBERTURA to is_on_time boolean
 * - "OPORTUNO" -> true
 * - "NO OPORTUNO" -> false
 * - empty/null -> null
 */
function mapCobertura(cobertura: string | null): boolean | null {
  if (!cobertura) return null;
  const normalized = cobertura.toUpperCase().trim();

  if (normalized === 'OPORTUNO') return true;
  if (normalized === 'NO OPORTUNO') return false;

  return null;
}

/**
 * SLA days by capability level
 * Based on complexity of the role:
 * - Lower levels (practicante, operario) = faster SLA
 * - Higher levels (gerente, subgerente) = longer SLA
 */
const SLA_BY_CAPABILITY: Record<string, number> = {
  practicante: 15,
  asistente: 20,
  analista: 25,
  coordinador: 30,
  jefe: 35,
  subgerente: 40,
  gerente: 45,
  operario: 30, // Default for field workers
  supervisor: 30,
  controlador: 25,
  tecnico: 25,
  auxiliar: 20,
};

/**
 * Calculate SLA deadline based on opened_at date and capability level
 */
function calculateSlaDeadline(openedAt: Date, level: string): string {
  const slaDays = SLA_BY_CAPABILITY[level] || 30; // Default 30 days
  const deadline = new Date(openedAt);
  deadline.setDate(deadline.getDate() + slaDays);
  return deadline.toISOString();
}

/**
 * Calculate priority based on dias_proceso (days in process)
 * - >30 days = P1 (urgent)
 * - 14-30 days = P2 (normal)
 * - <14 days = P3 (low)
 */
function calculatePriority(diasProceso: number | null): string {
  if (diasProceso === null || diasProceso === undefined) {
    return 'P2'; // Default to normal priority
  }
  if (diasProceso > 30) return 'P1'; // Urgent
  if (diasProceso >= 14) return 'P2'; // Normal
  return 'P3'; // Low
}

/**
 * Map Excel STATUS PROCESO to database status (case-insensitive)
 */
function mapStatusProceso(status: string): string {
  const normalized = status.toUpperCase().trim();

  if (normalized === 'EN PROCESO') return 'in_progress';
  if (normalized === 'CUBIERTO') return 'filled';
  if (normalized === 'ANULADO') return 'cancelled';
  if (normalized === 'STAND BY') return 'on_hold';

  // Default for unknown statuses
  return 'open';
}

/**
 * Map Excel ETAPA PROCESO to pipeline stage
 * Pipeline: vacante -> proceso -> seleccionado -> contratado
 */
function mapEtapaProceso(etapa: string | null, status: string): string {
  const normalizedStatus = status.toUpperCase().trim();
  const normalizedEtapa = (etapa || '').toUpperCase().trim();

  // If already filled/cancelled, use contratado
  if (normalizedStatus === 'CUBIERTO') return 'contratado';
  if (normalizedStatus === 'ANULADO') return 'cancelled';

  // Map ETAPA PROCESO to pipeline stage
  switch (normalizedEtapa) {
    case 'ABIERTO':
    case 'CONVOCATORIA':
    case '':
    case 'EMPTY':
      return 'vacante';

    case 'FILTRO CURRICULAR':
    case 'EVALUACIONES':
      return 'proceso';

    case 'ENTREVISTA USUARIO':
    case 'APROBACION DEL USUARIO':
      return 'seleccionado';

    case 'CERRADO':
      return 'contratado';

    default:
      return 'vacante';
  }
}

async function syncConsolidadoData(
  consolidadoData: ConsolidadoRealRow[],
  auditId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ positionsProcessed: number; positionsUpdated: number; positionsInserted: number; candidatesProcessed: number; recruitersProcessed: number; recruitersCreated: number; duplicatesFound: number; batchesExecuted: number; errors: number }> {
  // ==========================================================================
  // STEP -1: Filter to importable cases (EN PROCESO + CUBIERTO + current year)
  // CUBIERTO needed for historical labor ratio calculations
  // Skip: ANULADO (cancelled), STAND BY (on hold), and old years
  // ==========================================================================
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 1; // 2025 if we're in 2026

  const activeData = consolidadoData.filter(row => {
    const status = (row.status_proceso || '').toUpperCase().trim();
    const year = row.ano_inicio || 0;

    // Import EN PROCESO (active) and CUBIERTO (filled - needed for historical ratios)
    // Skip: ANULADO (cancelled), STAND BY (on hold)
    const isImportableStatus = status === 'EN PROCESO' || status === 'CUBIERTO';
    const isRecentYear = year >= minYear;

    return isImportableStatus && isRecentYear;
  });

  // If no active data, return early
  if (activeData.length === 0) {
    return {
      positionsProcessed: 0,
      positionsUpdated: 0,
      positionsInserted: 0,
      candidatesProcessed: 0,
      recruitersProcessed: 0,
      recruitersCreated: 0,
      duplicatesFound: 0,
      batchesExecuted: 0,
      errors: 0,
    };
  }

  // Use filtered data from now on
  const filteredData = activeData;

  // Use service role client for recruiter operations (bypasses RLS)
  const serviceClient = createServiceRoleClient();

  // ==========================================================================
  // STEP 0: Extract and upsert recruiters from RESPONSABLE column
  // IMPORTANT: Extract from ALL rows (consolidadoData), not just filtered,
  // so we create recruiters even if they only appear on historical rows
  // Also collect zones for each recruiter to set primary_zone correctly
  // ==========================================================================
  const recruiterZones = new Map<string, Map<string, number>>(); // name -> {zone -> count}
  for (const row of consolidadoData) {
    const recruiterName = row.responsable?.trim();
    const zone = row.zona?.trim();
    if (recruiterName && zone) {
      if (!recruiterZones.has(recruiterName)) {
        recruiterZones.set(recruiterName, new Map());
      }
      const zones = recruiterZones.get(recruiterName)!;
      zones.set(zone, (zones.get(zone) || 0) + 1);
    }
  }

  // Map recruiter name -> id for position linking
  const recruitersMap = new Map<string, string>();
  let recruitersCreated = 0;

  // Upsert recruiters one by one (small set, typically 8-15)
  // Using serviceClient to bypass RLS policies
  for (const [name, zones] of recruiterZones) {
    // Determine primary zone (most common) and secondary zones
    const sortedZones = Array.from(zones.entries()).sort((a, b) => b[1] - a[1]);
    const primaryZone = sortedZones[0]?.[0] || 'Trujillo';
    const secondaryZones = sortedZones.slice(1).map(([z]) => z);

    // Check if recruiter already exists
    const { data: existing, error: fetchError } = await serviceClient
      .from('recruiters')
      .select('id')
      .eq('name', name)
      .is('deleted_at', null)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      // PGRST116 = no rows returned (expected for new recruiters)
      continue;
    }

    if (existing) {
      // Update existing recruiter's zones based on Excel data
      await serviceClient
        .from('recruiters')
        .update({ primary_zone: primaryZone, secondary_zones: secondaryZones })
        .eq('id', existing.id);
      recruitersMap.set(name, existing.id);
    } else {
      // Auto-create recruiter with zones from Excel
      const emailSlug = name.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // Remove accents
        .replace(/\s+/g, '.');

      const { data: created, error: createError } = await serviceClient
        .from('recruiters')
        .insert({
          name,
          email: `${emailSlug}@example.com`,
          primary_zone: primaryZone,
          secondary_zones: secondaryZones,
          capability_level: 3, // Mid-level default
          capabilities: [],
          capacity: 25, // Default capacity per ADR
          is_active: true,
        })
        .select('id')
        .single();

      if (createError) {
      } else if (created) {
        recruitersMap.set(name, created.id);
        recruitersCreated++;
      }
    }
  }
  // 1. Fetch all existing position external_ids from database
  const { data: existingPositions, error: fetchError } = await supabase
    .from('positions')
    .select('id, external_id')
    .eq('source', 'consolidado');

  if (fetchError) {
  }

  const existingIds = new Set(existingPositions?.map(p => p.external_id) || []);
  const idMap = new Map(existingPositions?.map(p => [p.external_id, p.id]) || []);

  // In-memory deduplication using Maps
  const positionsMap = new Map<string, PositionData>();
  const candidatesMap = new Map<string, CandidateData>();

  for (const row of filteredData) {
    // Use case-insensitive status mapping
    const dbStatus = mapStatusProceso(row.status_proceso);

    // Map ETAPA PROCESO to pipeline stage
    const pipelineStage = mapEtapaProceso(row.etapa_proceso, row.status_proceso);

    // Determine level from GRUPO OCUPACIONAL (order matters!)
    const level = mapGrupoOcupacional(row.grupo_ocupacional);

    // Map COBERTURA to is_on_time boolean
    const isOnTime = mapCobertura(row.cobertura);

    // Calculate SLA deadline based on opened_at and level
    const slaDeadline = calculateSlaDeadline(row.fecha, level);

    // Calculate priority based on dias_proceso
    const priority = calculatePriority(row.dias_proceso);

    // Get recruiter_id from map (if responsable exists)
    const recruiterName = row.responsable?.trim() || null;
    const recruiterId = recruiterName ? recruitersMap.get(recruiterName) || null : null;

    // Normalize crop from Excel (cultivo) to match CropType if possible
    const rawCrop = row.cultivo?.toLowerCase().trim() || null;
    // Map common crop names to our CropType values
    // Covers: base crops, plurals, accented variants, and PICOS crops
    const cropMap: Record<string, string> = {
      // Esparrago variants
      'esparrago': 'esparrago',
      'espárrago': 'esparrago',
      'esparragos': 'esparrago',
      'espárragos': 'esparrago',
      // Arandano variants
      'arandano': 'arandano',
      'arándano': 'arandano',
      'arandanos': 'arandano',
      'arándanos': 'arandano',
      'arandano azul': 'arandano',
      'arándano azul': 'arandano',
      // Palta variants
      'palta': 'palta',
      'paltas': 'palta',
      'aguacate': 'palta',
      'palta hass': 'palta',
      // Uva variants
      'uva': 'uva',
      'uvas': 'uva',
      'uva de mesa': 'uva',
      'uva red globe': 'uva',
      // PICOS crops
      'mango': 'mango',
      'mangos': 'mango',
      'pina': 'pina',
      'piña': 'pina',
      'pinas': 'pina',
      'piñas': 'pina',
      'alcachofa': 'alcachofa',
      'alcachofas': 'alcachofa',
      'pimiento': 'pimiento',
      'pimientos': 'pimiento',
    };
    const normalizedCrop = rawCrop ? (cropMap[rawCrop] || rawCrop) : null;

    // Deduplicate positions by external_id (codigo)
    positionsMap.set(row.codigo, {
      external_id: row.codigo,
      fingerprint: `${row.codigo}_${row.fecha.toISOString()}`,
      title: row.puesto,
      zone: row.zona,
      level,
      priority, // Dynamic priority based on dias_proceso
      status: dbStatus,
      headcount: 1,
      filled_count: dbStatus === 'filled' ? 1 : 0,
      opened_at: row.fecha.toISOString(),
      sla_deadline: slaDeadline, // Calculated SLA deadline
      closed_at: dbStatus === 'filled' && row.fecha_ingreso ? row.fecha_ingreso.toISOString() : null,
      days_to_fill: dbStatus === 'filled' ? row.dias_proceso : null,
      days_in_process: row.dias_proceso, // Always populate for ALL positions
      is_on_time: isOnTime, // Real COBERTURA data from Excel
      source: 'consolidado',
      pipeline_stage: pipelineStage,
      recruiter_id: recruiterId, // Link to recruiter
      recruiter_name: recruiterName, // Denormalized for display
      // Direct campaign linking fields
      week_number: row.semana_inicio || null, // From Excel SEMANA INICIO
      crop: normalizedCrop, // From Excel CULTIVO (normalized)
    });

    // Deduplicate candidates by DNI
    if (row.dni_seleccionado && row.seleccionado) {
      // Peruvian name format: "APELLIDO_PATERNO APELLIDO_MATERNO NOMBRES"
      // Example: "RODRIGUEZ PEREZ JUAN DIEGO" -> last_name=RODRIGUEZ, maternal=PEREZ, first=JUAN DIEGO
      const nameParts = row.seleccionado.trim().split(/\s+/);
      let lastName = '';
      let maternalLastName = '';
      let firstName = '';

      if (nameParts.length >= 3) {
        // Standard format: AP_PATERNO AP_MATERNO NOMBRES...
        lastName = nameParts[0];
        maternalLastName = nameParts[1];
        firstName = nameParts.slice(2).join(' ');
      } else if (nameParts.length === 2) {
        // Only two parts: assume AP_PATERNO NOMBRE
        lastName = nameParts[0];
        firstName = nameParts[1];
      } else {
        // Single name
        firstName = nameParts[0] || '';
      }

      // Build full name and phonetic hash for dedup
      const fullName = [firstName, lastName, maternalLastName].filter(Boolean).join(' ');
      const namePhonetic = toSpanishPhonetic(fullName);

      candidatesMap.set(row.dni_seleccionado, {
        dni: row.dni_seleccionado,
        first_name: firstName,
        last_name: lastName,
        maternal_last_name: maternalLastName || null,
        full_name: fullName,
        name_phonetic: namePhonetic,
        phone: row.telefono || '000000000',
        phone_normalized: (row.telefono || '000000000').replace(/\D/g, ''),
        zone: row.zona,
        status: dbStatus === 'filled' ? 'hired' : 'available',
        source: 'consolidado',
      });
    }
  }

  // 2. Split into updates vs inserts
  const updates: (PositionData & { id: string })[] = [];
  const inserts: PositionData[] = [];

  Array.from(positionsMap.entries()).forEach(([extId, data]) => {
    if (existingIds.has(extId)) {
      updates.push({ ...data, id: idMap.get(extId)! });
    } else {
      inserts.push(data);
    }
  });

  let errorCount = 0;
  let batchCount = 0;

  // 3. Batch insert NEW positions
  if (inserts.length > 0) {
    const insertChunks = chunkArray(inserts, BATCH_SIZE);
    await processInParallel(
      insertChunks,
      async (chunk) => {
        batchCount++;
        const { error } = await supabase.from('positions').insert(chunk);
        if (error) {
          errorCount++;
        }
        return { success: !error, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  // 4. Batch update EXISTING positions
  if (updates.length > 0) {
    const updateChunks = chunkArray(updates, BATCH_SIZE);
    await processInParallel(
      updateChunks,
      async (chunk) => {
        batchCount++;
        // Execute individual updates in parallel within chunk
        const results = await Promise.all(
          chunk.map(pos => {
            const { id, ...updateData } = pos;
            return supabase
              .from('positions')
              .update(updateData)
              .eq('id', id);
          })
        );
        const chunkErrors = results.filter(r => r.error).length;
        if (chunkErrors > 0) {
          errorCount += chunkErrors;
        }
        return { success: chunkErrors === 0, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  // 5. Fetch existing candidates by DNI for upsert logic
  const { data: existingCandidates, error: candidateFetchError } = await supabase
    .from('candidates')
    .select('id, dni')
    .eq('source', 'consolidado');

  if (candidateFetchError) {
  }

  const existingCandidateDnis = new Set(existingCandidates?.map(c => c.dni) || []);
  const candidateIdMap = new Map(existingCandidates?.map(c => [c.dni, c.id]) || []);

  // 6. Split candidates into updates vs inserts
  const candidateUpdates: (CandidateData & { id: string })[] = [];
  const candidateInserts: CandidateData[] = [];

  Array.from(candidatesMap.entries()).forEach(([dni, data]) => {
    if (existingCandidateDnis.has(dni)) {
      candidateUpdates.push({ ...data, id: candidateIdMap.get(dni)! });
    } else {
      candidateInserts.push(data);
    }
  });

  // 7. Batch insert NEW candidates
  if (candidateInserts.length > 0) {
    const candidateInsertChunks = chunkArray(candidateInserts, BATCH_SIZE);
    await processInParallel(
      candidateInsertChunks,
      async (chunk) => {
        batchCount++;
        const { error } = await supabase.from('candidates').insert(chunk);
        if (error) {
          errorCount++;
        }
        return { success: !error, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  // 8. Batch update EXISTING candidates
  if (candidateUpdates.length > 0) {
    const candidateUpdateChunks = chunkArray(candidateUpdates, BATCH_SIZE);
    await processInParallel(
      candidateUpdateChunks,
      async (chunk) => {
        batchCount++;
        const results = await Promise.all(
          chunk.map(candidate => {
            const { id, ...updateData } = candidate;
            return supabase
              .from('candidates')
              .update(updateData)
              .eq('id', id);
          })
        );
        const chunkErrors = results.filter(r => r.error).length;
        if (chunkErrors > 0) {
          errorCount += chunkErrors;
        }
        return { success: chunkErrors === 0, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  // Call update_all_recruiter_loads() to sync current_load after positions are updated
  const { error: loadUpdateError } = await supabase.rpc('update_all_recruiter_loads');
  if (loadUpdateError) {
  }

  // 9. Run duplicate detection on all candidates
  let duplicatesFound = 0;
  try {
    // Fetch all candidates with required fields for dedup
    const { data: allCandidates, error: fetchAllError } = await supabase
      .from('candidates')
      .select('id, first_name, last_name, maternal_last_name, phone, phone_normalized, dni, is_duplicate, duplicate_of, deleted_at')
      .is('deleted_at', null)
      .is('is_duplicate', false);

    if (!fetchAllError && allCandidates && allCandidates.length > 0) {
      // Convert to Candidate type with minimal required fields
      const candidates = allCandidates as Candidate[];

      // For each candidate, find duplicates among existing candidates
      const duplicateUpdates: { id: string; is_duplicate: boolean; duplicate_of: string }[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        // Compare against all OTHER candidates (those we haven't checked yet)
        const otherCandidates = candidates.filter((c, j) => j !== i);

        const matches = findDuplicates(candidate, otherCandidates);

        // Use review_threshold from constants for consistent dedup across all routes
        if (matches.length > 0 && matches[0].confidence >= DEDUP_THRESHOLDS.review_threshold) {
          // Mark this candidate as duplicate of the matched one
          // Keep the one with the lower index (first in list) as the "original"
          const matchIdx = candidates.findIndex(c => c.id === matches[0].match_candidate_id);
          if (matchIdx < i) {
            // The match came before this one, so this one is the duplicate
            duplicateUpdates.push({
              id: candidate.id,
              is_duplicate: true,
              duplicate_of: matches[0].match_candidate_id,
            });
          }
        }
      }

      // Batch update duplicates
      if (duplicateUpdates.length > 0) {
        for (const dup of duplicateUpdates) {
          await supabase
            .from('candidates')
            .update({ is_duplicate: dup.is_duplicate, duplicate_of: dup.duplicate_of })
            .eq('id', dup.id);
        }
        duplicatesFound = duplicateUpdates.length;
      }
    }
  } catch (dedupError) {
  }

  return {
    positionsProcessed: positionsMap.size,
    positionsUpdated: updates.length,
    positionsInserted: inserts.length,
    candidatesProcessed: candidatesMap.size,
    recruitersProcessed: recruiterZones.size,
    recruitersCreated,
    duplicatesFound,
    batchesExecuted: batchCount,
    errors: errorCount,
  };
}

/**
 * Sync PICOS data using batch inserts with in-memory deduplication
 *
 * MODES:
 * - USE_SIMPLE_ESTIMATES=true: Simple "last year + 10%" estimate (600 PEN budget)
 * - USE_SIMPLE_ESTIMATES=false: Complex labor ratio algorithm (historical data)
 */
async function syncPicosData(
  picosData: PicosRealRow[],
  auditId: string,
  _supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{ campaignsProcessed: number; batchesExecuted: number; errors: number; defaultEstimatesUsed: number }> {
  // Use service role client to bypass RLS (campaigns_insert_admin_only policy)
  const serviceClient = createServiceRoleClient();

  // In-memory deduplication using Map with composite key
  const campaignsMap = new Map<string, CampaignData>();

  // Track how many campaigns used default estimates (no historical data)
  let defaultEstimatesUsed = 0;

  // ==========================================================================
  // SIMPLE ESTIMATES MODE (USE_SIMPLE_ESTIMATES = true)
  // Formula: last_year_count * 1.1
  // ==========================================================================
  if (USE_SIMPLE_ESTIMATES) {
    for (const row of picosData) {
      // Calculate start and end date of the week
      const startDate = new Date(row.year, 0, 1);
      startDate.setDate(startDate.getDate() + (row.semana - 1) * 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      // Process each crop with production > 0
      const crops = [
        { name: 'pimiento', kg: row.pimiento_kg },
        { name: 'alcachofa', kg: row.alcachofa_kg },
        { name: 'arandano', kg: row.arandanos_kg },
        { name: 'palta', kg: row.palta_kg },
        { name: 'esparrago', kg: row.esparrago_kg },
        { name: 'uva', kg: row.uvas_kg },
        { name: 'mango', kg: row.mango_kg },
        { name: 'pina', kg: row.pina_kg },
      ];

      for (const crop of crops) {
        if (crop.kg > 0) {
          // Simple estimate: count last year's positions for same week/crop, multiply by 1.1
          const lastYear = row.year - 1;
          const { count: lastYearCount } = await serviceClient
            .from('positions')
            .select('id', { count: 'exact', head: true })
            .eq('week_number', row.semana)
            .eq('crop', crop.name)
            .gte('opened_at', `${lastYear}-01-01`)
            .lte('opened_at', `${lastYear}-12-31`);

          // Default to 10 if no historical data
          const hasHistoricalData = lastYearCount && lastYearCount > 0;
          if (!hasHistoricalData) {
            defaultEstimatesUsed++;
          }
          const estimatedWorkers = Math.ceil(((lastYearCount || 10) * 1.1));

          // Composite key for deduplication
          const key = `${row.year}_${row.semana}_${crop.name}`;

          campaignsMap.set(key, {
            name: `${crop.name.charAt(0).toUpperCase() + crop.name.slice(1)} S${row.semana} ${row.year}`,
            year: row.year,
            week_number: row.semana,
            crop: crop.name,
            zone: '',
            production_kg: crop.kg,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            estimated_workers: estimatedWorkers,
            kg_per_worker_day: 0, // Not used in simple mode
            status: 'planned',
            source: 'picos',
          });
        }
      }
    }
  } else {
    // ==========================================================================
    // COMPLEX LABOR RATIO MODE (USE_SIMPLE_ESTIMATES = false)
    // Uses historical labor ratios from completed campaigns + filled positions
    // DISABLED: Set USE_SIMPLE_ESTIMATES = false to enable
    // ==========================================================================
    let laborRatios: LaborRatioResult | null = null;

    try {
      // Fetch completed campaigns and filled positions for ratio calculation
      const [campaignsRes, positionsRes] = await Promise.all([
        serviceClient
          .from('campaigns')
          .select('*')
          .is('deleted_at', null)
          .eq('status', 'completed')
          .gt('production_kg', 0),
        serviceClient
          .from('positions')
          .select('*')
          .is('deleted_at', null)
          .eq('status', 'filled')
          .gt('filled_count', 0),
      ]);
      if (
        !campaignsRes.error &&
        !positionsRes.error &&
        campaignsRes.data &&
        campaignsRes.data.length > 0 &&
        positionsRes.data &&
        positionsRes.data.length > 0
      ) {
        laborRatios = calculateHistoricalLaborRatios({
          campaigns: campaignsRes.data as Campaign[],
          positions: positionsRes.data as Position[],
        });
      } else {
      }
    } catch (ratioError) {
    }

    for (const row of picosData) {
      const startDate = new Date(row.year, 0, 1);
      startDate.setDate(startDate.getDate() + (row.semana - 1) * 7);
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);

      const crops = [
        { name: 'pimiento', kg: row.pimiento_kg },
        { name: 'alcachofa', kg: row.alcachofa_kg },
        { name: 'arandano', kg: row.arandanos_kg },
        { name: 'palta', kg: row.palta_kg },
        { name: 'esparrago', kg: row.esparrago_kg },
        { name: 'uva', kg: row.uvas_kg },
        { name: 'mango', kg: row.mango_kg },
        { name: 'pina', kg: row.pina_kg },
      ];

      for (const crop of crops) {
        if (crop.kg > 0) {
          const WORKING_DAYS_PER_WEEK = 6;
          let kgPerWorkerDay: number;

          if (laborRatios) {
            const ratio = getLaborRatio(
              crop.name as CropType,
              null,
              laborRatios
            );
            kgPerWorkerDay = ratio.kg_per_worker_day;
          } else {
            const cropConfig = CROP_TYPES[crop.name as keyof typeof CROP_TYPES];
            kgPerWorkerDay = cropConfig?.kg_per_worker_day || 50;
          }

          const estimatedWorkers = Math.ceil(crop.kg / (kgPerWorkerDay * WORKING_DAYS_PER_WEEK));
          const key = `${row.year}_${row.semana}_${crop.name}`;

          campaignsMap.set(key, {
            name: `${crop.name.charAt(0).toUpperCase() + crop.name.slice(1)} S${row.semana} ${row.year}`,
            year: row.year,
            week_number: row.semana,
            crop: crop.name,
            zone: '',
            production_kg: crop.kg,
            start_date: startDate.toISOString().split('T')[0],
            end_date: endDate.toISOString().split('T')[0],
            estimated_workers: estimatedWorkers,
            kg_per_worker_day: kgPerWorkerDay,
            status: 'completed',
            source: 'picos',
          });
        }
      }
    }
  }

  let errorCount = 0;
  let batchCount = 0;

  // Batch insert campaigns
  const campaignChunks = chunkArray(Array.from(campaignsMap.values()), BATCH_SIZE);
  await processInParallel(
    campaignChunks,
    async (chunk) => {
      batchCount++;
      // Delete existing campaigns for these keys first, then insert
      // (Supabase upsert doesn't work well with partial unique indexes)
      for (const campaign of chunk) {
        await serviceClient.from('campaigns')
          .delete()
          .eq('year', campaign.year)
          .eq('week_number', campaign.week_number)
          .eq('crop', campaign.crop)
          .eq('zone', campaign.zone)
          .is('deleted_at', null);
      }
      const { error } = await serviceClient.from('campaigns').insert(chunk);
      if (error) {
        errorCount++;
      }
      return { success: !error, count: chunk.length };
    },
    CONCURRENCY
  );

  return {
    campaignsProcessed: campaignsMap.size,
    batchesExecuted: batchCount,
    errors: errorCount,
    defaultEstimatesUsed,
  };
}

// =============================================================================
// HANDLER POST
// =============================================================================

export async function POST(request: NextRequest): Promise<NextResponse<UploadResponse>> {
  // Verificar autenticacion
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  // SECURITY: Rate limiting for uploads (5 per minute)
  const { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitHeaders } = await import('@/lib/rate-limit');
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`upload:${clientIP}`, RATE_LIMITS.strict);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes. Intente de nuevo en un minuto.' },
      { status: 429, headers: rateLimitHeaders(rateLimitResult) }
    );
  }

  const supabase = await createClient();
  const auditId = generateAuditId();
  const startTime = Date.now();

  try {
    // Obtener FormData with explicit error handling for large files
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch (parseError) {
      const errorMessage = parseError instanceof Error ? parseError.message : 'Unknown error';

      // Check for common body size limit errors
      if (errorMessage.includes('body size') || errorMessage.includes('limit') || errorMessage.includes('too large')) {
        return NextResponse.json(
          {
            success: false,
            error: 'El archivo excede el límite de tamaño del servidor. Contacte al administrador.',
            auditId,
          },
          { status: 413 }
        );
      }

      // Check for FormData parsing errors (often caused by body consumption)
      if (errorMessage.includes('FormData') || errorMessage.includes('parse')) {
        return NextResponse.json(
          {
            success: false,
            error: 'Error al procesar el archivo. Intente de nuevo o use un archivo más pequeño.',
            auditId,
          },
          { status: 400 }
        );
      }

      throw parseError; // Re-throw for general error handler
    }

    const file = formData.get('file') as File | null;
    const fileTypeHint = formData.get('fileType') as string | null;

    // Validar presencia de archivo
    if (!file) {
      return NextResponse.json(
        { success: false, error: 'No se recibió ningún archivo' },
        { status: 400 }
      );
    }

    // Validar archivo
    const validationError = validateFile(file);
    if (validationError) {
      return NextResponse.json(
        { success: false, error: validationError },
        { status: 400 }
      );
    }

    // Leer buffer del archivo
    const buffer = await file.arrayBuffer();

    // Auto-detect file type (or use hint)
    let fileType: FileType = await detectFileType(file.name, buffer);
    if (fileTypeHint && ['CONSOLIDADO', 'PICOS'].includes(fileTypeHint)) {
      fileType = fileTypeHint as FileType;
    }

    if (fileType === 'UNKNOWN') {
      return NextResponse.json(
        { success: false, error: 'No se pudo detectar el tipo de archivo. Use un archivo CONSOLIDADO o PICOS.' },
        { status: 400 }
      );
    }

    // Parsear segun tipo
    let result: ParseRealResult<ConsolidadoRealRow> | ParseRealResult<PicosRealRow>;
    const syncStats: SyncStats = {
      positionsProcessed: 0,
      positionsUpdated: 0,
      positionsInserted: 0,
      candidatesProcessed: 0,
      campaignsProcessed: 0,
      recruitersProcessed: 0,
      recruitersCreated: 0,
      duplicatesFound: 0,
      batchesExecuted: 0,
      errors: 0,
      defaultEstimatesUsed: 0,
      durationMs: 0,
    };

    const syncStartTime = Date.now();

    if (fileType === 'CONSOLIDADO') {
      result = await parseConsolidadoReal(buffer, file.name);
      const consolidadoData = result.data as ConsolidadoRealRow[];

      const consolidadoStats = await syncConsolidadoData(consolidadoData, auditId, supabase);
      syncStats.positionsProcessed = consolidadoStats.positionsProcessed;
      syncStats.positionsUpdated = consolidadoStats.positionsUpdated;
      syncStats.positionsInserted = consolidadoStats.positionsInserted;
      syncStats.candidatesProcessed = consolidadoStats.candidatesProcessed;
      syncStats.recruitersProcessed = consolidadoStats.recruitersProcessed;
      syncStats.recruitersCreated = consolidadoStats.recruitersCreated;
      syncStats.duplicatesFound = consolidadoStats.duplicatesFound;
      syncStats.batchesExecuted = consolidadoStats.batchesExecuted;
      syncStats.errors = consolidadoStats.errors;
    } else {
      result = await parsePicosReal(buffer, file.name);
      const picosData = result.data as PicosRealRow[];

      const picosStats = await syncPicosData(picosData, auditId, supabase);
      syncStats.campaignsProcessed = picosStats.campaignsProcessed;
      syncStats.batchesExecuted = picosStats.batchesExecuted;
      syncStats.errors = picosStats.errors;
      syncStats.defaultEstimatesUsed = picosStats.defaultEstimatesUsed;
    }

    syncStats.durationMs = Date.now() - syncStartTime;

    // Save extracted date to settings (for CONSOLIDADO files)
    // Use service role client to bypass RLS policies on settings table
    if (fileType === 'CONSOLIDADO' && result.metadata.extractedDate) {
      try {
        const serviceClient = createServiceRoleClient();
        const { error: settingsError } = await serviceClient
          .from('settings')
          .upsert({
            key: 'data_as_of_date',
            value: {
              date: result.metadata.extractedDate.toISOString(),
              source: result.metadata.dateSource,
              updated_at: new Date().toISOString(),
            },
            description: 'Fecha de referencia del archivo Excel para calculos de vencimiento y dias en proceso',
            category: 'data',
            is_system: true,
          }, { onConflict: 'key' });

        if (settingsError) {
          // Continue even if settings save fails
        }
      } catch (serviceError) {
        // Continue even if service client fails (env var may not be set)
      }
    }

    // Registrar en audit log con Supabase
    const processingTime = Date.now() - startTime;
    const { error: auditError } = await supabase.from('audit_log').insert({
      id: auditId,
      actor_id: user.id,
      actor_type: 'user',
      action: 'import',
      action_category: 'data_import',
      entity_type: 'upload',
      entity_id: auditId,
      details: {
        fileType,
        fileName: file.name,
        fileSize: file.size,
        totalRows: result.metadata.totalRows,
        errorCount: result.errors.length,
        extractedDate: result.metadata.extractedDate?.toISOString() || null,
        dateSource: result.metadata.dateSource,
        processingTimeMs: processingTime,
        syncStats,
      },
    });

    if (auditError) {
      // Continue even if audit logging fails
    }

    // Build warnings array
    const warnings: string[] = [];
    if (syncStats.defaultEstimatesUsed > 0) {
      warnings.push(
        `${syncStats.defaultEstimatesUsed} campañas usan estimaciones por defecto (10 trabajadores). ` +
        `Para estimaciones basadas en datos históricos, suba primero un archivo CONSOLIDADO del año anterior.`
      );
    }

    // Retornar resultado con fecha extraida y sync stats
    return NextResponse.json({
      success: true,
      fileType,
      data: result,
      syncStats,
      extractedDate: result.metadata.extractedDate?.toISOString() || null,
      dateSource: result.metadata.dateSource,
      auditId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });

  } catch (error) {
    // Registrar error en audit log
    const { error: auditError } = await supabase.from('audit_log').insert({
      id: auditId,
      actor_id: user.id,
      actor_type: 'user',
      action: 'import',
      action_category: 'data_import',
      entity_type: 'upload',
      entity_id: auditId,
      details: {
        status: 'error',
        error: error instanceof Error ? error.message : 'Error desconocido',
      },
    });

    if (auditError) {
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar el archivo',
        auditId,
      },
      { status: 500 }
    );
  }
}

// =============================================================================
// HANDLER GET - Info del endpoint
// =============================================================================

export async function GET(): Promise<NextResponse> {
  // Verificar autenticacion
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  return NextResponse.json({
    endpoint: '/api/upload',
    methods: ['POST'],
    description: 'Endpoint para carga de archivos Excel CONSOLIDADO y Picos',
    parameters: {
      file: {
        type: 'File',
        required: true,
        description: 'Archivo Excel (.xlsx o .xls)',
        maxSize: `${MAX_FILE_SIZE / 1024 / 1024}MB`,
      },
      fileType: {
        type: 'string',
        required: true,
        enum: ['CONSOLIDADO', 'PICOS'],
        description: 'Tipo de archivo a procesar',
      },
    },
    response: {
      success: 'boolean',
      data: {
        totalRows: 'number',
        validRows: 'number',
        invalidRows: 'number',
        errors: 'ValidationError[]',
        warnings: 'ValidationWarning[]',
        data: 'ConsolidadoRow[] | PicosRow[]',
      },
      syncStats: {
        positionsProcessed: 'number',
        positionsUpdated: 'number',
        positionsInserted: 'number',
        candidatesProcessed: 'number',
        campaignsProcessed: 'number',
        batchesExecuted: 'number',
        errors: 'number',
        durationMs: 'number',
      },
      auditId: 'string (ID para tracking)',
    },
  });
}
