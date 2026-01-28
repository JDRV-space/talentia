/**
 * API endpoint for recruiters
 * GET /api/recruiters - List all recruiters with workload stats
 */

import { NextRequest, NextResponse } from 'next/server';

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';
import { RECRUITER_HARD_CAP } from '@/types/constants';

// =============================================================================
// TYPES
// =============================================================================

interface RecruiterWithLoad {
  id: string;
  name: string;
  email: string;
  primary_zone: string;
  secondary_zones: string[];
  capability_level: number;
  capacity: number;
  current_load: number;
  fill_rate_30d: number;
  avg_time_to_fill: number;
  is_active: boolean;
  utilization_percent: number;
  is_overloaded: boolean;
  positions_count: {
    open: number;
    in_progress: number;
    interviewing: number;
    filled: number;
  };
}

interface RecruitersResponse {
  success: boolean;
  data: RecruiterWithLoad[];
  summary: {
    total_recruiters: number;
    total_active_positions: number;
    avg_load: number;
    overloaded_count: number;
  };
  error?: string;
}

// =============================================================================
// GET /api/recruiters
// =============================================================================

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Query params
    const activeOnly = searchParams.get('active_only') !== 'false'; // Default true
    const withOpenPositions = searchParams.get('with_open_positions') !== 'false'; // Default true - only recruiters with active cases
    const zone = searchParams.get('zone');

    // If we need only recruiters with open positions, first get the list of recruiter IDs
    let activeRecruiterIds: string[] | null = null;

    if (withOpenPositions) {
      // Get unique recruiter IDs that have at least one active position
      // NOTE: 'open', 'in_progress', and 'interviewing' are all active work for recruiters
      const { data: activePositions, error: posError } = await supabase
        .from('positions')
        .select('recruiter_id, status')
        .is('deleted_at', null)
        .in('status', ['open', 'in_progress', 'interviewing'])
        .not('recruiter_id', 'is', null)
        .limit(10000);

      if (posError) {
      }

      // Get unique recruiter IDs (even if error, try with empty array)
      const positions = activePositions || [];
      activeRecruiterIds = [...new Set(positions.map(p => p.recruiter_id).filter(Boolean))];

      // If no recruiters have open positions, return empty
      if (activeRecruiterIds.length === 0) {
        return NextResponse.json({
          success: true,
          data: [],
          summary: {
            total_recruiters: 0,
            total_active_positions: 0,
            avg_load: 0,
            overloaded_count: 0,
          },
        });
      }
    }

    // First, get recruiters
    let recruitersQuery = supabase
      .from('recruiters')
      .select('*')
      .is('deleted_at', null)
      .order('name', { ascending: true });

    if (activeOnly) {
      recruitersQuery = recruitersQuery.eq('is_active', true);
    }

    // Filter to only recruiters with open positions
    if (activeRecruiterIds) {
      recruitersQuery = recruitersQuery.in('id', activeRecruiterIds);
    }

    if (zone) {
      recruitersQuery = recruitersQuery.eq('primary_zone', zone);
    }

    const { data: recruiters, error: recruitersError } = await recruitersQuery;
    if (recruitersError) {
      return NextResponse.json(
        { success: false, data: [], summary: { total_recruiters: 0, total_active_positions: 0, avg_load: 0, overloaded_count: 0 }, error: recruitersError.message },
        { status: 500 }
      );
    }

    if (!recruiters || recruiters.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        summary: {
          total_recruiters: 0,
          total_active_positions: 0,
          avg_load: 0,
          overloaded_count: 0,
        },
      });
    }

    // Get position counts per recruiter
    const recruiterIds = recruiters.map(r => r.id);

    // Get positions grouped by recruiter and status
    // NOTE: Must specify limit to avoid Supabase's default 1000 row limit
    const { data: positionCounts, error: positionsError } = await supabase
      .from('positions')
      .select('recruiter_id, status')
      .is('deleted_at', null)
      .in('recruiter_id', recruiterIds)
      .limit(10000);

    // Count active positions from step 4
    const step4ActiveCount = (positionCounts || []).filter(p =>
      ['open', 'in_progress', 'interviewing'].includes(p.status)
    ).length;
    if (positionsError) {
    }

    // Aggregate position counts per recruiter
    // NOTE: 'open', 'in_progress', and 'interviewing' all count toward active cases
    const countsMap = new Map<string, { open: number; in_progress: number; interviewing: number; filled: number }>();
    for (const pos of positionCounts || []) {
      if (!pos.recruiter_id) continue;

      if (!countsMap.has(pos.recruiter_id)) {
        countsMap.set(pos.recruiter_id, { open: 0, in_progress: 0, interviewing: 0, filled: 0 });
      }
      const counts = countsMap.get(pos.recruiter_id)!;

      switch (pos.status) {
        case 'open':
          counts.open++;
          break;
        case 'in_progress':
          counts.in_progress++;
          break;
        case 'interviewing':
          counts.interviewing++;
          break;
        case 'filled':
          counts.filled++;
          break;
        // Note: 'on_hold', 'cancelled' are not counted as active cases
      }
    }

    // Build response with computed fields
    const recruitersWithLoad: RecruiterWithLoad[] = recruiters.map(r => {
      const positionsCounts = countsMap.get(r.id) || { open: 0, in_progress: 0, interviewing: 0, filled: 0 };
      const capacity = r.capacity || RECRUITER_HARD_CAP;
      // Calculate current_load from actual position counts (open + in_progress + interviewing)
      const currentLoad = positionsCounts.open + positionsCounts.in_progress + positionsCounts.interviewing;

      const utilizationPercent = capacity > 0 ? Math.round((currentLoad / capacity) * 100) : 0;

      return {
        id: r.id,
        name: r.name,
        email: r.email,
        primary_zone: r.primary_zone,
        secondary_zones: r.secondary_zones || [],
        capability_level: r.capability_level || 3,
        capacity,
        current_load: currentLoad,
        fill_rate_30d: r.fill_rate_30d || 0,
        avg_time_to_fill: r.avg_time_to_fill || 0,
        is_active: r.is_active,
        utilization_percent: utilizationPercent,
        is_overloaded: currentLoad >= capacity,
        positions_count: positionsCounts,
      };
    });

    // Calculate summary using DIRECT count (same as Dashboard)
    const { count: directActiveCount } = await supabase
      .from('positions')
      .select('*', { count: 'exact', head: true })
      .is('deleted_at', null)
      .in('status', ['open', 'in_progress'])
      .in('recruiter_id', recruiterIds);

    const summedActivePositions = recruitersWithLoad.reduce(
      (sum, r) => sum + r.positions_count.open + r.positions_count.in_progress + r.positions_count.interviewing,
      0
    );

    // Use direct count to match Dashboard
    const totalActivePositions = directActiveCount || 0;
    const totalLoad = recruitersWithLoad.reduce((sum, r) => sum + r.current_load, 0);
    const avgLoad = recruitersWithLoad.length > 0 ? Math.round(totalLoad / recruitersWithLoad.length) : 0;
    const overloadedCount = recruitersWithLoad.filter(r => r.is_overloaded).length;

    return NextResponse.json({
      success: true,
      data: recruitersWithLoad,
      summary: {
        total_recruiters: recruitersWithLoad.length,
        total_active_positions: totalActivePositions,
        avg_load: avgLoad,
        overloaded_count: overloadedCount,
      },
    }, {
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: [],
        summary: { total_recruiters: 0, total_active_positions: 0, avg_load: 0, overloaded_count: 0 },
        error: error instanceof Error ? error.message : 'Error al obtener reclutadores',
      },
      { status: 500 }
    );
  }
}
