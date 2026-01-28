/**
 * API endpoint for truly unassigned positions
 * GET /api/positions/truly-unassigned
 *
 * Returns positions with NO recruiter assigned (recruiter_id IS NULL)
 * with smart assignment suggestions using the scoring algorithm.
 */

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { getTopRecruiters } from '@/lib/algorithms/assignment';
import {
  calculatePriorityScore,
  type QueueType,
} from '@/lib/algorithms/priority';
import type { Recruiter, Position } from '@/types/database';

export const dynamic = 'force-dynamic';

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

interface UnassignedPosition {
  id: string;
  external_id: string | null;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  recruiter_name: string | null; // Name from Excel (but no matching recruiter_id)
  suggested_recruiters: SuggestedRecruiter[];
  // Priority algorithm fields
  priority_score: number;
  queue: QueueType;
  // SLA fields
  level: string;
  sla_days: number | null;
  sla_deadline: string | null;
  source: string | null;
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
// GET /api/positions/truly-unassigned
// =============================================================================

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();

    // 1. Get all active recruiters for suggestions
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

    // 2. Get positions with NO recruiter assigned
    const { data: unassigned, error } = await supabase
      .from('positions')
      .select('*')
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .is('recruiter_id', null)
      .order('opened_at', { ascending: false })
      .limit(500);

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    if (!unassigned || unassigned.length === 0) {
      return NextResponse.json({
        success: true,
        count: 0,
        data: [],
      });
    }

    // 3. For each position, calculate priority and suggest recruiters
    const result: UnassignedPosition[] = unassigned.map(pos => {
      // Calculate priority score (no current recruiter)
      const priorityResult = calculatePriorityScore(
        pos as Position,
        null
      );

      // Get top 3 recruiters using the scoring algorithm
      // Use recruitersWithLoad which has computed current_load
      const topRecruiters = getTopRecruiters(
        recruitersWithLoad as Recruiter[],
        pos as Position,
        3
      );

      const suggested: SuggestedRecruiter[] = topRecruiters.map(tr => ({
        id: tr.recruiter.id,
        name: tr.recruiter.name,
        score: Math.round(tr.score * 100),
        current_load: tr.recruiter.current_load,
        explanation: tr.explanation_es,
      }));

      return {
        id: pos.id,
        external_id: pos.external_id,
        title: pos.title,
        zone: pos.zone,
        priority: pos.priority || 'normal',
        crop: pos.crop,
        headcount: pos.headcount || 1,
        opened_at: pos.opened_at,
        days_open: calculateDaysOpen(pos.opened_at),
        recruiter_name: pos.recruiter_name, // Original name from Excel
        suggested_recruiters: suggested,
        priority_score: priorityResult.score,
        queue: priorityResult.queue,
        level: pos.level || 'operario',
        sla_days: pos.sla_days,
        sla_deadline: pos.sla_deadline,
        source: pos.source,
      };
    });

    // 4. Sort by priority_score DESC
    result.sort((a, b) => b.priority_score - a.priority_score);

    return NextResponse.json({
      success: true,
      count: result.length,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al obtener posiciones sin asignar' },
      { status: 500 }
    );
  }
}
