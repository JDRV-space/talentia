/**
 * API endpoint for processing Excel data parsed in the browser
 * POST /api/upload-json - Receives JSON data directly, no file upload needed
 *
 * This endpoint receives pre-parsed Excel data as JSON from the browser.
 * The browser parses the 93MB Excel file and sends only ~3MB of extracted data.
 *
 * Benefits:
 * - No external storage (R2, S3) needed
 * - Bypasses Vercel's 4.5MB limit for file uploads
 * - Faster processing (no file download step)
 * - Works with Vercel's 4MB body size limit (JSON compresses well)
 */

import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { findDuplicates, toSpanishPhonetic } from '@/lib/algorithms/dedup';
import { DEDUP_THRESHOLDS } from '@/types/constants';
import type { Candidate } from '@/types/database';
import type { ConsolidadoRow, PicosRow, BrowserParseMetadata } from '@/lib/excel/browser-parser';

// =============================================================================
// ROUTE SEGMENT CONFIG
// =============================================================================

export const maxDuration = 60;
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// =============================================================================
// TYPES
// =============================================================================

interface UploadJsonRequest {
  fileType: 'CONSOLIDADO' | 'PICOS';
  metadata: BrowserParseMetadata;
  rows: ConsolidadoRow[] | PicosRow[];
}

interface UploadResponse {
  success: boolean;
  fileType?: 'CONSOLIDADO' | 'PICOS';
  data?: {
    metadata: {
      totalRows: number;
      extractedDate: string | null;
      dateSource: string;
    };
    errors: Array<{ row: number; message: string }>;
    data?: Array<{
      dni_seleccionado?: string;
      seleccionado?: string;
      telefono?: string;
      zona?: string;
    }>;
  };
  extractedDate?: string | null;
  dateSource?: string;
  error?: string;
  auditId?: string;
  syncStats?: SyncStats;
  warnings?: string[];
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
// CONFIGURATION
// =============================================================================

const BATCH_SIZE = 500;
const CONCURRENCY = 5;

// =============================================================================
// UTILITIES
// =============================================================================

function generateAuditId(): string {
  return randomUUID();
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

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

function mapGrupoOcupacional(grupo: string | undefined): string {
  if (!grupo) return 'operario';
  const normalized = grupo.toUpperCase().trim();
  if (normalized.includes('SUBGERENTE')) return 'subgerente';
  if (normalized.includes('GERENTE')) return 'gerente';
  if (normalized.includes('JEFE')) return 'jefe';
  if (normalized.includes('SUPERVISOR')) return 'supervisor';
  if (normalized.includes('COORDINADOR')) return 'coordinador';
  if (normalized.includes('ANALISTA')) return 'analista';
  if (normalized.includes('ASISTENTE')) return 'asistente';
  if (normalized.includes('PRACTICANTE')) return 'practicante';
  if (normalized.includes('CONTROLADOR')) return 'controlador';
  if (normalized.includes('TECNICO')) return 'tecnico';
  if (normalized.includes('AUXILIAR')) return 'auxiliar';
  if (normalized.includes('OPERARIO')) return 'operario';
  if (normalized.includes('EMPLEADO')) return 'analista';
  return 'operario';
}

function mapCobertura(cobertura: string | undefined): boolean | null {
  if (!cobertura) return null;
  const normalized = cobertura.toUpperCase().trim();
  if (normalized === 'OPORTUNO') return true;
  if (normalized === 'NO OPORTUNO') return false;
  return null;
}

const SLA_BY_CAPABILITY: Record<string, number> = {
  practicante: 15,
  asistente: 20,
  analista: 25,
  coordinador: 30,
  jefe: 35,
  subgerente: 40,
  gerente: 45,
  operario: 30,
  supervisor: 30,
  controlador: 25,
  tecnico: 25,
  auxiliar: 20,
};

function calculateSlaDeadline(openedAt: Date, level: string): string {
  const slaDays = SLA_BY_CAPABILITY[level] || 30;
  const deadline = new Date(openedAt);
  deadline.setDate(deadline.getDate() + slaDays);
  return deadline.toISOString();
}

function calculatePriority(diasProceso: number | undefined): string {
  if (diasProceso === undefined) return 'P2';
  if (diasProceso > 30) return 'P1';
  if (diasProceso >= 14) return 'P2';
  return 'P3';
}

function mapStatusProceso(status: string): string {
  const normalized = status.toUpperCase().trim();
  if (normalized === 'EN PROCESO') return 'in_progress';
  if (normalized === 'CUBIERTO') return 'filled';
  if (normalized === 'ANULADO') return 'cancelled';
  if (normalized === 'STAND BY') return 'on_hold';
  return 'open';
}

function mapEtapaProceso(etapa: string | undefined, status: string): string {
  const normalizedStatus = status.toUpperCase().trim();
  const normalizedEtapa = (etapa || '').toUpperCase().trim();
  if (normalizedStatus === 'CUBIERTO') return 'contratado';
  if (normalizedStatus === 'ANULADO') return 'cancelled';
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

// =============================================================================
// SYNC CONSOLIDADO DATA
// =============================================================================

async function syncConsolidadoData(
  consolidadoData: ConsolidadoRow[],
  auditId: string,
  supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{
  positionsProcessed: number;
  positionsUpdated: number;
  positionsInserted: number;
  candidatesProcessed: number;
  recruitersProcessed: number;
  recruitersCreated: number;
  duplicatesFound: number;
  batchesExecuted: number;
  errors: number;
}> {
  const currentYear = new Date().getFullYear();
  const minYear = currentYear - 1;

  const activeData = consolidadoData.filter((row) => {
    const status = (row.status_proceso || '').toUpperCase().trim();
    const year = row.ano_inicio || 0;
    const isImportableStatus = status === 'EN PROCESO' || status === 'CUBIERTO';
    const isRecentYear = year >= minYear;
    return isImportableStatus && isRecentYear;
  });
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

  const serviceClient = createServiceRoleClient();

  // Extract recruiters
  const recruiterZones = new Map<string, Map<string, number>>();
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

  const recruitersMap = new Map<string, string>();
  let recruitersCreated = 0;

  for (const [name, zones] of recruiterZones) {
    const sortedZones = Array.from(zones.entries()).sort((a, b) => b[1] - a[1]);
    const primaryZone = sortedZones[0]?.[0] || 'Trujillo';
    const secondaryZones = sortedZones.slice(1).map(([z]) => z);

    const { data: existing, error: fetchError } = await serviceClient
      .from('recruiters')
      .select('id')
      .eq('name', name)
      .is('deleted_at', null)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') {
      continue;
    }

    if (existing) {
      await serviceClient
        .from('recruiters')
        .update({ primary_zone: primaryZone, secondary_zones: secondaryZones })
        .eq('id', existing.id);
      recruitersMap.set(name, existing.id);
    } else {
      const emailSlug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, '.');

      const { data: created, error: createError } = await serviceClient
        .from('recruiters')
        .insert({
          name,
          email: `${emailSlug}@example.com`,
          primary_zone: primaryZone,
          secondary_zones: secondaryZones,
          capability_level: 3,
          capabilities: [],
          capacity: 25,
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
  const { data: existingPositions, error: fetchError } = await supabase
    .from('positions')
    .select('id, external_id')
    .eq('source', 'consolidado');

  if (fetchError) {
  }

  const existingIds = new Set(existingPositions?.map((p) => p.external_id) || []);
  const idMap = new Map(existingPositions?.map((p) => [p.external_id, p.id]) || []);

  const positionsMap = new Map<string, PositionData>();
  const candidatesMap = new Map<string, CandidateData>();

  for (const row of activeData) {
    const dbStatus = mapStatusProceso(row.status_proceso);
    const pipelineStage = mapEtapaProceso(row.etapa_proceso, row.status_proceso);
    const level = mapGrupoOcupacional(row.grupo_ocupacional);
    const isOnTime = mapCobertura(row.cobertura);
    const fecha = new Date(row.fecha);
    const slaDeadline = calculateSlaDeadline(fecha, level);
    const priority = calculatePriority(row.dias_proceso);
    const recruiterName = row.responsable?.trim() || null;
    const recruiterId = recruiterName ? recruitersMap.get(recruiterName) || null : null;

    const rawCrop = row.cultivo?.toLowerCase().trim() || null;
    const cropMap: Record<string, string> = {
      esparrago: 'esparrago',
      espárrago: 'esparrago',
      esparragos: 'esparrago',
      espárragos: 'esparrago',
      arandano: 'arandano',
      arándano: 'arandano',
      arandanos: 'arandano',
      arándanos: 'arandano',
      'arandano azul': 'arandano',
      'arándano azul': 'arandano',
      palta: 'palta',
      paltas: 'palta',
      aguacate: 'palta',
      'palta hass': 'palta',
      uva: 'uva',
      uvas: 'uva',
      'uva de mesa': 'uva',
      'uva red globe': 'uva',
      mango: 'mango',
      mangos: 'mango',
      pina: 'pina',
      piña: 'pina',
      pinas: 'pina',
      piñas: 'pina',
      alcachofa: 'alcachofa',
      alcachofas: 'alcachofa',
      pimiento: 'pimiento',
      pimientos: 'pimiento',
    };
    const normalizedCrop = rawCrop ? cropMap[rawCrop] || rawCrop : null;

    positionsMap.set(row.codigo, {
      external_id: row.codigo,
      fingerprint: `${row.codigo}_${row.fecha}`,
      title: row.puesto,
      zone: row.zona,
      level,
      priority,
      status: dbStatus,
      headcount: 1,
      filled_count: dbStatus === 'filled' ? 1 : 0,
      opened_at: row.fecha,
      sla_deadline: slaDeadline,
      closed_at: dbStatus === 'filled' && row.fecha_ingreso ? row.fecha_ingreso : null,
      days_to_fill: dbStatus === 'filled' ? (row.dias_proceso ?? null) : null,
      days_in_process: row.dias_proceso ?? null,
      is_on_time: isOnTime,
      source: 'consolidado',
      pipeline_stage: pipelineStage,
      recruiter_id: recruiterId,
      recruiter_name: recruiterName,
      week_number: row.semana_inicio || null,
      crop: normalizedCrop,
    });

    if (row.dni_seleccionado && row.seleccionado) {
      const nameParts = row.seleccionado.trim().split(/\s+/);
      let lastName = '';
      let maternalLastName = '';
      let firstName = '';

      if (nameParts.length >= 3) {
        lastName = nameParts[0];
        maternalLastName = nameParts[1];
        firstName = nameParts.slice(2).join(' ');
      } else if (nameParts.length === 2) {
        lastName = nameParts[0];
        firstName = nameParts[1];
      } else {
        firstName = nameParts[0] || '';
      }

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

  if (updates.length > 0) {
    const updateChunks = chunkArray(updates, BATCH_SIZE);
    await processInParallel(
      updateChunks,
      async (chunk) => {
        batchCount++;
        const results = await Promise.all(
          chunk.map((pos) => {
            const { id, ...updateData } = pos;
            return supabase.from('positions').update(updateData).eq('id', id);
          })
        );
        const chunkErrors = results.filter((r) => r.error).length;
        if (chunkErrors > 0) {
          errorCount += chunkErrors;
        }
        return { success: chunkErrors === 0, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  const { data: existingCandidates, error: candidateFetchError } = await supabase
    .from('candidates')
    .select('id, dni')
    .eq('source', 'consolidado');

  if (candidateFetchError) {
  }

  const existingCandidateDnis = new Set(existingCandidates?.map((c) => c.dni) || []);
  const candidateIdMap = new Map(existingCandidates?.map((c) => [c.dni, c.id]) || []);

  const candidateUpdates: (CandidateData & { id: string })[] = [];
  const candidateInserts: CandidateData[] = [];

  Array.from(candidatesMap.entries()).forEach(([dni, data]) => {
    if (existingCandidateDnis.has(dni)) {
      candidateUpdates.push({ ...data, id: candidateIdMap.get(dni)! });
    } else {
      candidateInserts.push(data);
    }
  });

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

  if (candidateUpdates.length > 0) {
    const candidateUpdateChunks = chunkArray(candidateUpdates, BATCH_SIZE);
    await processInParallel(
      candidateUpdateChunks,
      async (chunk) => {
        batchCount++;
        const results = await Promise.all(
          chunk.map((candidate) => {
            const { id, ...updateData } = candidate;
            return supabase.from('candidates').update(updateData).eq('id', id);
          })
        );
        const chunkErrors = results.filter((r) => r.error).length;
        if (chunkErrors > 0) {
          errorCount += chunkErrors;
        }
        return { success: chunkErrors === 0, count: chunk.length };
      },
      CONCURRENCY
    );
  }

  const { error: loadUpdateError } = await supabase.rpc('update_all_recruiter_loads');
  if (loadUpdateError) {
  }

  let duplicatesFound = 0;
  try {
    const { data: allCandidates, error: fetchAllError } = await supabase
      .from('candidates')
      .select(
        'id, first_name, last_name, maternal_last_name, phone, phone_normalized, dni, is_duplicate, duplicate_of, deleted_at'
      )
      .is('deleted_at', null)
      .is('is_duplicate', false);

    if (!fetchAllError && allCandidates && allCandidates.length > 0) {
      const candidates = allCandidates as Candidate[];
      const duplicateUpdates: { id: string; is_duplicate: boolean; duplicate_of: string }[] = [];

      for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        const otherCandidates = candidates.filter((c, j) => j !== i);
        const matches = findDuplicates(candidate, otherCandidates);

        if (matches.length > 0 && matches[0].confidence >= DEDUP_THRESHOLDS.review_threshold) {
          const matchIdx = candidates.findIndex((c) => c.id === matches[0].match_candidate_id);
          if (matchIdx < i) {
            duplicateUpdates.push({
              id: candidate.id,
              is_duplicate: true,
              duplicate_of: matches[0].match_candidate_id,
            });
          }
        }
      }

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

// =============================================================================
// SYNC PICOS DATA
// =============================================================================

async function syncPicosData(
  picosData: PicosRow[],
  _auditId: string,
  _supabase: Awaited<ReturnType<typeof createClient>>
): Promise<{
  campaignsProcessed: number;
  batchesExecuted: number;
  errors: number;
  defaultEstimatesUsed: number;
}> {
  const serviceClient = createServiceRoleClient();
  const campaignsMap = new Map<string, CampaignData>();
  let defaultEstimatesUsed = 0;

  // Get all years from PICOS data
  const years = [...new Set(picosData.map(r => r.year))];
  const lastYears = years.map(y => y - 1);

  // OPTIMIZATION: Single query to get all historical counts (instead of 400+ queries)
  const historicalCounts = new Map<string, number>();

  if (lastYears.length > 0) {
    const minYear = Math.min(...lastYears);
    const maxYear = Math.max(...lastYears);

    const { data: positionCounts } = await serviceClient
      .from('positions')
      .select('week_number, crop')
      .gte('opened_at', `${minYear}-01-01`)
      .lte('opened_at', `${maxYear}-12-31`)
      .not('week_number', 'is', null)
      .not('crop', 'is', null);

    // Count positions by week+crop
    if (positionCounts) {
      for (const pos of positionCounts) {
        if (pos.week_number && pos.crop) {
          const key = `${pos.week_number}_${pos.crop}`;
          historicalCounts.set(key, (historicalCounts.get(key) || 0) + 1);
        }
      }
    }
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
        // Use cached historical count instead of individual query
        const lookupKey = `${row.semana}_${crop.name}`;
        const lastYearCount = historicalCounts.get(lookupKey) || 0;

        const hasHistoricalData = lastYearCount > 0;
        if (!hasHistoricalData) {
          defaultEstimatesUsed++;
        }
        const estimatedWorkers = Math.ceil((lastYearCount || 10) * 1.1);
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
          kg_per_worker_day: 0,
          status: 'planned',
          source: 'picos',
        });
      }
    }
  }

  let errorCount = 0;
  let batchCount = 0;

  const campaignChunks = chunkArray(Array.from(campaignsMap.values()), BATCH_SIZE);
  await processInParallel(
    campaignChunks,
    async (chunk) => {
      batchCount++;
      for (const campaign of chunk) {
        await serviceClient
          .from('campaigns')
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
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  const { checkRateLimit, getClientIP, RATE_LIMITS, rateLimitHeaders } = await import(
    '@/lib/rate-limit'
  );
  const clientIP = getClientIP(request);
  const rateLimitResult = checkRateLimit(`upload:${clientIP}`, RATE_LIMITS.strict);

  if (!rateLimitResult.success) {
    return NextResponse.json(
      { success: false, error: 'Demasiadas solicitudes. Intente de nuevo en un minuto.' },
      { status: 429, headers: rateLimitHeaders(rateLimitResult) }
    );
  }

  const supabase = await createClient();
  const serviceClient = createServiceRoleClient();
  const auditId = generateAuditId();
  const startTime = Date.now();

  try {
    let body: UploadJsonRequest;
    try {
      body = await request.json();
    } catch (parseError) {
      return NextResponse.json(
        { success: false, error: 'Error al parsear JSON. El archivo puede ser demasiado grande.' },
        { status: 400 }
      );
    }
    const { fileType, metadata, rows } = body;

    if (!fileType || !metadata || !rows) {
      return NextResponse.json(
        { success: false, error: 'Parametros faltantes: fileType, metadata y rows son requeridos' },
        { status: 400 }
      );
    }

    if (!['CONSOLIDADO', 'PICOS'].includes(fileType)) {
      return NextResponse.json(
        { success: false, error: 'Tipo de archivo invalido. Use CONSOLIDADO o PICOS.' },
        { status: 400 }
      );
    }

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

    // Data for duplicate checking (returned in response for CONSOLIDADO)
    let candidateData: Array<{
      dni_seleccionado?: string;
      seleccionado?: string;
      telefono?: string;
      zona?: string;
    }> = [];

    if (fileType === 'CONSOLIDADO') {
      const consolidadoRows = rows as ConsolidadoRow[];
      const consolidadoStats = await syncConsolidadoData(consolidadoRows, auditId, supabase);

      syncStats.positionsProcessed = consolidadoStats.positionsProcessed;
      syncStats.positionsUpdated = consolidadoStats.positionsUpdated;
      syncStats.positionsInserted = consolidadoStats.positionsInserted;
      syncStats.candidatesProcessed = consolidadoStats.candidatesProcessed;
      syncStats.recruitersProcessed = consolidadoStats.recruitersProcessed;
      syncStats.recruitersCreated = consolidadoStats.recruitersCreated;
      syncStats.duplicatesFound = consolidadoStats.duplicatesFound;
      syncStats.batchesExecuted = consolidadoStats.batchesExecuted;
      syncStats.errors = consolidadoStats.errors;

      // Extract candidate data for duplicate checking in frontend
      candidateData = consolidadoRows
        .filter(r => r.dni_seleccionado && r.seleccionado && r.telefono)
        .map(r => ({
          dni_seleccionado: r.dni_seleccionado,
          seleccionado: r.seleccionado,
          telefono: r.telefono,
          zona: r.zona,
        }));
    } else {
      const picosRows = rows as PicosRow[];
      const picosStats = await syncPicosData(picosRows, auditId, supabase);

      syncStats.campaignsProcessed = picosStats.campaignsProcessed;
      syncStats.batchesExecuted = picosStats.batchesExecuted;
      syncStats.errors = picosStats.errors;
      syncStats.defaultEstimatesUsed = picosStats.defaultEstimatesUsed;
    }

    syncStats.durationMs = Date.now() - syncStartTime;

    // Save extracted date to settings
    if (fileType === 'CONSOLIDADO' && metadata.extractedDate) {
      try {
        const { error: settingsError } = await serviceClient
          .from('settings')
          .upsert(
            {
              key: 'data_as_of_date',
              value: {
                date: metadata.extractedDate,
                source: metadata.dateSource,
                updated_at: new Date().toISOString(),
              },
              description:
                'Fecha de referencia del archivo Excel para calculos de vencimiento y dias en proceso',
              category: 'data',
              is_system: true,
            },
            { onConflict: 'key' }
          );

        if (settingsError) {
        }
      } catch (serviceError) {
      }
    }

    // Audit log
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
        fileName: metadata.fileName,
        totalRows: metadata.totalRows,
        originalSizeMB: metadata.originalSizeMB,
        jsonSizeKB: metadata.jsonSizeKB,
        extractedDate: metadata.extractedDate,
        dateSource: metadata.dateSource,
        processingTimeMs: processingTime,
        syncStats,
        uploadMethod: 'browser-json',
      },
    });

    if (auditError) {
    }

    // Build warnings array
    const warnings: string[] = [];
    if (syncStats.defaultEstimatesUsed > 0) {
      warnings.push(
        `${syncStats.defaultEstimatesUsed} campanas usan estimaciones por defecto (10 trabajadores). ` +
          `Para estimaciones basadas en datos historicos, suba primero un archivo CONSOLIDADO del ano anterior.`
      );
    }

    return NextResponse.json({
      success: true,
      fileType,
      data: {
        metadata: {
          totalRows: metadata.totalRows,
          extractedDate: metadata.extractedDate,
          dateSource: metadata.dateSource,
        },
        errors: [],
        data: candidateData,
      },
      syncStats,
      extractedDate: metadata.extractedDate,
      dateSource: metadata.dateSource,
      auditId,
      warnings: warnings.length > 0 ? warnings : undefined,
    });
  } catch (error) {
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
        uploadMethod: 'browser-json',
      },
    });

    if (auditError) {
    }
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Error al procesar los datos',
        auditId,
      },
      { status: 500 }
    );
  }
}
