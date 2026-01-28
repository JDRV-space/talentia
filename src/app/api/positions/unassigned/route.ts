/**
 * API endpoint for open positions (for assignment/reassignment)
 * GET /api/positions/unassigned
 *
 * Returns ALL OPEN positions assigned to ACTIVE recruiters
 * with smart reassignment suggestions using the scoring algorithm
 * and priority scores for case prioritization.
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

interface OpenPosition {
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
  suggested_recruiters: SuggestedRecruiter[];
  // Priority algorithm fields
  priority_score: number;
  queue: QueueType;
  // SLA fields for deadline calculation
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
// GET /api/positions/unassigned
// =============================================================================

export async function GET() {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();

    // 1. Get all active recruiters with full data for algorithm
    const { data: activeRecruiters } = await supabase
      .from('recruiters')
      .select('*')
      .is('deleted_at', null)
      .eq('is_active', true);

    const activeRecruiterIds = new Set((activeRecruiters || []).map(r => r.id));

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

    // Build recruiter map with computed current_load for priority algorithm
    const recruitersMap = new Map<string, Recruiter>();
    const recruitersWithLoad = (activeRecruiters || []).map((r) => ({
      ...r,
      current_load: recruiterLoadMap.get(r.id) || 0,
    }));
    recruitersWithLoad.forEach((r) => {
      recruitersMap.set(r.id, r as Recruiter);
    });

    // 2. Get ALL open positions (no date filter)
    const { data: allPositions, error: posError } = await supabase
      .from('positions')
      .select('*')
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .order('priority', { ascending: false })
      .order('opened_at', { ascending: false })
      .limit(500);

    if (posError) {
      return NextResponse.json(
        { success: false, error: posError.message },
        { status: 500 }
      );
    }

    // 3. Filter to positions assigned to ACTIVE recruiters
    const positions = (allPositions || []).filter(p =>
      p.recruiter_id && activeRecruiterIds.has(p.recruiter_id)
    );
    if (!positions || positions.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
      });
    }

    // 4. For each position, calculate priority and suggest reassignments
    const result: OpenPosition[] = positions.map(pos => {
      // Get current recruiter for priority calculation
      const currentRecruiter = pos.recruiter_id
        ? recruitersMap.get(pos.recruiter_id) ?? null
        : null;

      // Calculate priority score and queue
      const priorityResult = calculatePriorityScore(
        pos as Position,
        currentRecruiter
      );

      // Get top 3 recruiters using the scoring algorithm
      // Exclude current recruiter from suggestions
      // Use recruitersWithLoad which has computed current_load
      const otherRecruiters = recruitersWithLoad.filter(
        r => r.id !== pos.recruiter_id
      ) as Recruiter[];

      const topRecruiters = getTopRecruiters(otherRecruiters, pos as Position, 3);

      const suggested: SuggestedRecruiter[] = topRecruiters.map(tr => ({
        id: tr.recruiter.id,
        name: tr.recruiter.name,
        score: Math.round(tr.score * 100), // Convert to percentage
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
        suggested_recruiters: suggested,
        // Priority algorithm fields
        priority_score: priorityResult.score,
        queue: priorityResult.queue,
        // SLA fields for deadline calculation
        level: pos.level || 'operario',
        sla_days: pos.sla_days,
        sla_deadline: pos.sla_deadline,
      };
    });

    // 5. Sort by priority_score DESC (highest priority first)
    result.sort((a, b) => b.priority_score - a.priority_score);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al obtener posiciones' },
      { status: 500 }
    );
  }
}
