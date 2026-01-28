/**
 * Dashboard Stats API
 * GET /api/dashboard/stats - Returns real KPIs from Supabase
 *
 * SIMPLIFIED STATS (2026-01-09):
 * 1. Casos Abiertos: COUNT positions WHERE status IN ('open', 'in_progress') AND deleted_at IS NULL
 *    - ONLY for ACTIVE recruiters (is_active = true)
 *    - Uses same recruiter discovery as Reclutadores API (status IN ['open', 'in_progress', 'interviewing'])
 * 2. Reclutadores: COUNT recruiters WHERE is_active = true AND deleted_at IS NULL
 *    (MUST match the recruiters tab filtering logic)
 * 3. Sobrecargados: Recruiters with cases > 2x average (only active recruiters)
 *
 * BUG FIX (2026-01-10): Dashboard was using ['open', 'in_progress'] to find recruiters,
 * while Reclutadores uses ['open', 'in_progress', 'interviewing']. This caused different
 * recruiter sets and position counts. Now both use the same status filter for recruiter discovery.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { RECRUITER_HARD_CAP } from '@/types/constants';

// =============================================================================
// TYPES
// =============================================================================

interface OverloadedRecruiter {
  name: string;
  casos: number;
}

interface DashboardStats {
  // Core metrics (simplified)
  casosAbiertos: number;        // positions WHERE status IN ('open', 'in_progress')
  sinAsignar: number;           // positions with recruiter_id IS NULL
  reclutadores: number;         // recruiters WHERE deleted_at IS NULL
  sobrecargados: OverloadedRecruiter[];  // recruiters with cases > 2x average

  // Legacy metrics (kept for backward compatibility)
  totalPositions: number;
  unassignedPositions: number;
  overduePositions: number;
  filledThisMonth: number;
  inProcess: number;
  selectedCount: number;
  onHoldCount: number;
  avgDaysToFill: number;
  slaCompliancePercent: number;
  pipeline: {
    vacante: number;
    proceso: number;
    seleccionado: number;
    contratado: number;
  };
  recruiterLoad: Array<{
    name: string;
    zone: string;
    activePositions: number;
    capacity: number;
    loadPercent: number;
  }>;
  recruitersOverCapacity: number;
  duplicateCandidates: number;
  lastUploadDate: string | null;
  dataSource: 'excel' | 'empty';
  dataAsOfDate: string | null;
  dataAsOfSource: string | null;
}

// =============================================================================
// GET /api/dashboard/stats
// =============================================================================

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();

    // Fetch data_as_of_date from settings first
    const { data: dataAsOfSetting } = await supabase
      .from('settings')
      .select('value')
      .eq('key', 'data_as_of_date')
      .single();

    const dataAsOfValue = dataAsOfSetting?.value as { date: string | null; source: string | null } | null;
    const referenceDate = dataAsOfValue?.date ? new Date(dataAsOfValue.date) : new Date();
    const now = referenceDate;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // =========================================================================
    // CORE STATS (simplified - the 3 required metrics)
    // =========================================================================

    // MATCH RECLUTADORES LOGIC EXACTLY:
    // 1. Get all positions with active status
    // 2. Get unique recruiter_ids from those positions
    // 3. Check which recruiter_ids have is_active=true
    // 4. Count only positions for those active recruiters

    // Step 1: Get all active positions with their recruiter_ids
    // MUST use same status filter as Reclutadores API for consistency
    // Reclutadores uses ['open', 'in_progress', 'interviewing'] to find recruiters with active work
    const { data: allActivePositions } = await supabase
      .from('positions')
      .select('recruiter_id')
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress', 'interviewing'])
      .not('recruiter_id', 'is', null)
      .limit(10000);

    // Step 2: Get unique recruiter_ids from positions
    const positionRecruiterIds = [...new Set((allActivePositions || []).map(p => p.recruiter_id))];

    // Step 3: Filter to only recruiters that are is_active=true
    const { data: activeRecruitersFromPositions } = await supabase
      .from('recruiters')
      .select('id')
      .is('deleted_at', null)
      .eq('is_active', true)
      .in('id', positionRecruiterIds.length > 0 ? positionRecruiterIds : ['none']);

    const activeRecruiterIds = (activeRecruitersFromPositions || []).map(r => r.id);

    // Step 4: Count positions for only those active recruiters
    const { count: casosAbiertos } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .in('recruiter_id', activeRecruiterIds.length > 0 ? activeRecruiterIds : ['none']);

    // Sin Asignar: COUNT positions with NO recruiter assigned
    const { count: sinAsignar } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .is('recruiter_id', null);
    // 2. Reclutadores: COUNT recruiters WITH ACTIVE CASES
    //    MUST match the recruiters tab filtering logic (withOpenPositions = true by default)
    //    Use the same activeRecruiterIds we computed above (already filtered by is_active=true)
    const reclutadores = activeRecruiterIds.length;
    // 3. Sobrecargados: Recruiters with cases > 2x average
    // Get only ACTIVE recruiters (matching recruiters tab logic)
    const { data: allRecruiters } = await supabase
      .from('recruiters')
      .select('id, name')
      .is('deleted_at', null)
      .eq('is_active', true);

    // Count active positions per recruiter using raw query approach
    const { data: positionsPerRecruiter } = await supabase
      .from('positions')
      .select('recruiter_id')
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .not('recruiter_id', 'is', null);

    // Build a map of recruiter_id -> count
    const recruiterCaseCount: Record<string, number> = {};
    (positionsPerRecruiter || []).forEach((p) => {
      const rid = p.recruiter_id as string;
      recruiterCaseCount[rid] = (recruiterCaseCount[rid] || 0) + 1;
    });

    // Find overloaded recruiters (cases >= RECRUITER_HARD_CAP)
    const sobrecargados: OverloadedRecruiter[] = [];
    (allRecruiters || []).forEach((r) => {
      const casos = recruiterCaseCount[r.id] || 0;
      if (casos >= RECRUITER_HARD_CAP) {
        sobrecargados.push({ name: r.name, casos });
      }
    });

    // Sort by case count descending
    sobrecargados.sort((a, b) => b.casos - a.casos);

    // =========================================================================
    // LEGACY STATS (kept for backward compatibility with existing UI)
    // =========================================================================

    const [
      pipelineVacanteResult,
      pipelineProcesoResult,
      pipelineSeleccionadoResult,
      onHoldResult,
      overdueResult,
      filledMonthResult,
      totalFilledResult,
      recruitersActiveResult,
      duplicatesResult,
      lastUploadResult,
      avgDaysResult,
      slaOnTimeResult,
      slaNotOnTimeResult,
    ] = await Promise.all([
      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress'])
        .eq('pipeline_stage', 'vacante'),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress'])
        .eq('pipeline_stage', 'proceso'),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress'])
        .eq('pipeline_stage', 'seleccionado'),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'on_hold'),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress'])
        .lt('sla_deadline', now.toISOString()),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'filled')
        .gte('closed_at', startOfMonth.toISOString()),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'filled'),

      supabase
        .from('recruiters')
        .select('id, name, primary_zone, current_load')
        .is('deleted_at', null)
        .eq('is_active', true),

      supabase
        .from('candidates')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('is_duplicate', true)
        .eq('dedup_reviewed', false),

      supabase
        .from('audit_log')
        .select('created_at, details')
        .eq('action', 'import')
        .eq('entity_type', 'upload')
        .order('created_at', { ascending: false })
        .limit(1)
        .single(),

      supabase
        .from('positions')
        .select('days_to_fill')
        .is('deleted_at', null)
        .eq('status', 'filled')
        .not('days_to_fill', 'is', null)
        .gte('closed_at', new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString()),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'filled')
        .eq('is_on_time', true),

      supabase
        .from('positions')
        .select('*', { count: 'exact', head: true })
        .is('deleted_at', null)
        .eq('status', 'filled')
        .eq('is_on_time', false),
    ]);

    // Calculate average days to fill
    let avgDaysToFill = 0;
    if (avgDaysResult.data && avgDaysResult.data.length > 0) {
      const total = avgDaysResult.data.reduce((sum, p) => sum + (p.days_to_fill || 0), 0);
      avgDaysToFill = Math.round(total / avgDaysResult.data.length * 10) / 10;
    }

    // Calculate SLA compliance
    let slaCompliancePercent = 0;
    const onTimeCount = slaOnTimeResult.count || 0;
    const notOnTimeCount = slaNotOnTimeResult.count || 0;
    const totalWithCobertura = onTimeCount + notOnTimeCount;
    if (totalWithCobertura > 0) {
      slaCompliancePercent = Math.round((onTimeCount / totalWithCobertura) * 100);
    }

    // Format recruiter load
    const recruiterLoad = (recruitersActiveResult.data || []).map(r => ({
      name: r.name,
      zone: r.primary_zone,
      activePositions: r.current_load || 0,
      capacity: RECRUITER_HARD_CAP,
      loadPercent: Math.round(((r.current_load || 0) / RECRUITER_HARD_CAP) * 100),
    }));

    const recruitersOverCapacity = recruiterLoad.filter(
      r => r.activePositions >= RECRUITER_HARD_CAP
    ).length;

    const vacante = pipelineVacanteResult.count || 0;
    const proceso = pipelineProcesoResult.count || 0;
    const seleccionado = pipelineSeleccionadoResult.count || 0;
    const filledThisMonth = filledMonthResult.count || 0;
    const onHold = onHoldResult.count || 0;

    const stats: DashboardStats = {
      // Core metrics (new, simplified)
      casosAbiertos: casosAbiertos || 0,
      sinAsignar: sinAsignar || 0,
      reclutadores: reclutadores || 0,
      sobrecargados,

      // Legacy metrics (backward compatibility)
      totalPositions: casosAbiertos || 0,
      unassignedPositions: vacante,
      overduePositions: overdueResult.count || 0,
      filledThisMonth,
      inProcess: proceso + seleccionado,
      selectedCount: seleccionado,
      onHoldCount: onHold,
      avgDaysToFill,
      slaCompliancePercent,
      pipeline: {
        vacante,
        proceso,
        seleccionado,
        contratado: filledThisMonth,
      },
      recruiterLoad,
      recruitersOverCapacity,
      duplicateCandidates: duplicatesResult.count || 0,
      lastUploadDate: lastUploadResult.data?.created_at || null,
      dataSource: ((casosAbiertos || 0) > 0 || (totalFilledResult.count ?? 0) > 0) ? 'excel' : 'empty',
      dataAsOfDate: dataAsOfValue?.date || null,
      dataAsOfSource: dataAsOfValue?.source || null,
    };

    return NextResponse.json({
      success: true,
      data: stats,
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'Pragma': 'no-cache',
      },
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al obtener estadisticas' },
      { status: 500 }
    );
  }
}
