/**
 * API endpoint for reassigned positions (positions that have changed recruiters)
 * GET /api/positions/reassigned
 *
 * Returns positions that have been reassigned at least once,
 * with history for undo/tracking functionality.
 */

import { NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { getTopRecruiters } from '@/lib/algorithms/assignment';
import {
  calculatePriorityScore,
  type QueueType,
} from '@/lib/algorithms/priority';
import type { Recruiter, Position } from '@/types/database';

// =============================================================================
// TYPES
// =============================================================================

interface SuggestedRecruiter {
  id: string;
  name: string;
  score: number;
  current_load: number;
  explanation: string;
}

interface ReassignedPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  current_recruiter_id: string | null;
  current_recruiter_name: string | null;
  previous_recruiter_id: string | null;
  previous_recruiter_name: string | null;
  reassigned_at: string;
  suggested_recruiters: SuggestedRecruiter[];
  priority_score: number;
  queue: QueueType;
  level: string;
  sla_days: number | null;
  sla_deadline: string | null;
}

// =============================================================================
// HELPERS
// =============================================================================

function calculateDaysOpen(openedAt: string): number {
  const opened = new Date(openedAt);
  const now = new Date();
  const diffMs = now.getTime() - opened.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// =============================================================================
// GET /api/positions/reassigned
// =============================================================================

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();
    const serviceClient = createServiceRoleClient();

    // 1. Get all active recruiters
    const { data: activeRecruiters } = await supabase
      .from('recruiters')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true);

    // 1b. Compute current_load for each recruiter from actual position counts
    const recruiterLoadMap = new Map<string, number>();
    if (activeRecruiters && activeRecruiters.length > 0) {
      const { data: positionCounts } = await supabase
        .from('positions')
        .select('recruiter_id')
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress', 'interviewing'])
        .in('recruiter_id', activeRecruiters.map(r => r.id));

      (positionCounts || []).forEach(p => {
        if (p.recruiter_id) {
          recruiterLoadMap.set(p.recruiter_id, (recruiterLoadMap.get(p.recruiter_id) || 0) + 1);
        }
      });
    }

    // Build recruiters with computed current_load
    const recruitersWithLoad = (activeRecruiters || []).map((r) => ({
      ...r,
      current_load: recruiterLoadMap.get(r.id) || 0,
    }));

    const recruitersMap = new Map<string, Recruiter>();
    recruitersWithLoad.forEach((r) => {
      recruitersMap.set(r.id, r as Recruiter);
    });

    // 2. Get audit log entries for recruiter assignments/reassignments using service role to bypass RLS
    // This includes both:
    // - Reassignments (previous recruiter existed and changed)
    // - New assignments (previous recruiter was NULL, now assigned)
    const { data: auditLogs, error: auditError } = await serviceClient
      .from('audit_log')
      .select('entity_id, previous_values, new_values, created_at')
      .eq('entity_type', 'positions')
      .eq('action', 'UPDATE')
      .not('new_values->recruiter_id', 'is', null) // Must have a new recruiter assigned
      .order('created_at', { ascending: false });

    if (auditError) {
    }
    // Build map of position_id -> latest reassignment info
    const reassignmentMap = new Map<string, {
      previous_recruiter_id: string | null;
      previous_recruiter_name: string | null;
      reassigned_at: string;
    }>();

    // Process audit logs to find assignments/reassignments (recruiter changes)
    for (const log of auditLogs || []) {
      const posId = log.entity_id;
      const prevValues = log.previous_values as Record<string, unknown> | null;
      const newValues = log.new_values as Record<string, unknown> | null;

      // Check if recruiter_id actually changed (either reassignment OR new assignment)
      const recruiterChanged = prevValues?.recruiter_id !== newValues?.recruiter_id;

      if (recruiterChanged && newValues?.recruiter_id) {
        // Only keep the most recent assignment/reassignment per position
        if (!reassignmentMap.has(posId)) {
          // If previous was null, this was a new assignment (from unassigned)
          const wasUnassigned = prevValues?.recruiter_id === null || prevValues?.recruiter_id === undefined;
          reassignmentMap.set(posId, {
            previous_recruiter_id: wasUnassigned ? null : (prevValues?.recruiter_id as string | null),
            previous_recruiter_name: wasUnassigned ? 'Sin asignar' : (prevValues?.recruiter_name as string | null),
            reassigned_at: log.created_at,
          });
        }
      }
    }

    // 3. Get open positions that have been reassigned
    const reassignedPositionIds = Array.from(reassignmentMap.keys());

    if (reassignedPositionIds.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        count: 0,
      });
    }

    const { data: positions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress', 'interviewing'])
      .in('id', reassignedPositionIds)
      .order('opened_at', { ascending: false });

    if (posError) {
      return NextResponse.json(
        { success: false, error: posError.message },
        { status: 500 }
      );
    }

    // 4. Build response with reassignment info
    const result: ReassignedPosition[] = (positions || []).map(pos => {
      const reassignInfo = reassignmentMap.get(pos.id)!;
      const currentRecruiter = pos.recruiter_id
        ? recruitersMap.get(pos.recruiter_id) ?? null
        : null;

      // Calculate priority
      const priorityResult = calculatePriorityScore(
        pos as Position,
        currentRecruiter
      );

      // Get suggestions for further reassignment
      const otherRecruiters = recruitersWithLoad.filter(
        r => r.id !== pos.recruiter_id
      ) as Recruiter[];

      const topRecruiters = getTopRecruiters(otherRecruiters, pos as Position, 3);

      const suggested: SuggestedRecruiter[] = topRecruiters.map(tr => ({
        id: tr.recruiter.id,
        name: tr.recruiter.name,
        score: Math.round(tr.score * 100),
        current_load: tr.recruiter.current_load,
        explanation: tr.explanation_es,
      }));

      return {
        id: pos.id,
        title: pos.title,
        zone: pos.zone,
        priority: pos.priority || 'normal',
        crop: pos.crop,
        headcount: pos.headcount || 1,
        opened_at: pos.opened_at,
        days_open: calculateDaysOpen(pos.opened_at),
        current_recruiter_id: pos.recruiter_id,
        current_recruiter_name: pos.recruiter_name,
        previous_recruiter_id: reassignInfo.previous_recruiter_id,
        previous_recruiter_name: reassignInfo.previous_recruiter_name,
        reassigned_at: reassignInfo.reassigned_at,
        suggested_recruiters: suggested,
        priority_score: priorityResult.score,
        queue: priorityResult.queue,
        level: pos.level || 'operario',
        sla_days: pos.sla_days,
        sla_deadline: pos.sla_deadline,
      };
    });

    // Sort by reassignment date (most recent first)
    result.sort((a, b) =>
      new Date(b.reassigned_at).getTime() - new Date(a.reassigned_at).getTime()
    );

    return NextResponse.json({
      success: true,
      data: result,
      count: result.length,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al obtener posiciones reasignadas' },
      { status: 500 }
    );
  }
}
