/**
 * API endpoint for recruiter's positions
 * GET /api/recruiters/[id]/positions - Get positions assigned to a recruiter
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';

// =============================================================================
// TYPES
// =============================================================================

interface PositionSummary {
  id: string;
  external_id: string | null;
  title: string;
  zone: string;
  level: string;
  priority: string;
  status: string;
  pipeline_stage: string | null;
  headcount: number;
  filled_count: number;
  opened_at: string;
  sla_deadline: string | null;
  days_in_process: number | null;
  is_on_time: boolean | null;
}

interface RecruiterPositionsResponse {
  success: boolean;
  data: PositionSummary[];
  total: number;
  recruiter: {
    id: string;
    name: string;
  } | null;
  error?: string;
}

// =============================================================================
// GET /api/recruiters/[id]/positions
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const { id } = await params;
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Query params
    const status = searchParams.get('status'); // Comma-separated: open,in_progress
    const limit = parseInt(searchParams.get('limit') || '50', 10);
    const offset = parseInt(searchParams.get('offset') || '0', 10);

    // First verify recruiter exists
    const { data: recruiter, error: recruiterError } = await supabase
      .from('recruiters')
      .select('id, name')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (recruiterError) {
      if (recruiterError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, data: [], total: 0, recruiter: null, error: 'Reclutador no encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, data: [], total: 0, recruiter: null, error: recruiterError.message },
        { status: 500 }
      );
    }

    // Build positions query
    let query = supabase
      .from('positions')
      .select(
        'id, external_id, title, zone, level, priority, status, pipeline_stage, headcount, filled_count, opened_at, sla_deadline, days_in_process, is_on_time',
        { count: 'exact' }
      )
      .eq('recruiter_id', id)
      .is('deleted_at', null)
      .order('opened_at', { ascending: false });

    // Filter by status if provided
    if (status) {
      const statusList = status.split(',').map(s => s.trim());
      query = query.in('status', statusList);
    }

    // Apply pagination
    query = query.range(offset, offset + limit - 1);

    const { data: positions, error: positionsError, count } = await query;

    if (positionsError) {
      return NextResponse.json(
        { success: false, data: [], total: 0, recruiter: { id: recruiter.id, name: recruiter.name }, error: positionsError.message },
        { status: 500 }
      );
    }

    const positionSummaries: PositionSummary[] = (positions || []).map(p => ({
      id: p.id,
      external_id: p.external_id,
      title: p.title,
      zone: p.zone,
      level: p.level,
      priority: p.priority,
      status: p.status,
      pipeline_stage: p.pipeline_stage,
      headcount: p.headcount,
      filled_count: p.filled_count,
      opened_at: p.opened_at,
      sla_deadline: p.sla_deadline,
      days_in_process: p.days_in_process,
      is_on_time: p.is_on_time,
    }));

    return NextResponse.json({
      success: true,
      data: positionSummaries,
      total: count || 0,
      recruiter: {
        id: recruiter.id,
        name: recruiter.name,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: [],
        total: 0,
        recruiter: null,
        error: error instanceof Error ? error.message : 'Error al obtener posiciones',
      },
      { status: 500 }
    );
  }
}
