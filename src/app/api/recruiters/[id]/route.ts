/**
 * API endpoint for single recruiter
 * GET /api/recruiters/[id] - Get recruiter detail with stats
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';

// Force dynamic rendering - no caching
export const dynamic = 'force-dynamic';
export const revalidate = 0;

// =============================================================================
// TYPES
// =============================================================================

interface RecruiterDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  primary_zone: string;
  secondary_zones: string[];
  capability_level: number;
  capabilities: string[];
  capacity: number;
  current_load: number;
  fill_rate_30d: number;
  avg_time_to_fill: number;
  is_active: boolean;
  manager_id: string | null;
  created_at: string;
  updated_at: string;
  // Computed fields
  utilization_percent: number;
  is_overloaded: boolean;
  positions_count: {
    open: number;
    in_progress: number;
    interviewing: number;
    filled: number;
    cancelled: number;
  };
  performance_trend: {
    month: string;
    filled: number;
    avg_days: number;
  }[];
}

interface RecruiterDetailResponse {
  success: boolean;
  data: RecruiterDetail | null;
  error?: string;
}

// =============================================================================
// GET /api/recruiters/[id]
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

    // Get recruiter
    const { data: recruiter, error: recruiterError } = await supabase
      .from('recruiters')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .single();

    if (recruiterError) {
      if (recruiterError.code === 'PGRST116') {
        return NextResponse.json(
          { success: false, data: null, error: 'Reclutador no encontrado' },
          { status: 404 }
        );
      }
      return NextResponse.json(
        { success: false, data: null, error: recruiterError.message },
        { status: 500 }
      );
    }

    // Get position counts by status
    const { data: positions, error: positionsError } = await supabase
      .from('positions')
      .select('status, days_to_fill, closed_at')
      .eq('recruiter_id', id)
      .is('deleted_at', null);

    if (positionsError) {
    }

    // Aggregate position counts
    const positionsCounts = {
      open: 0,
      in_progress: 0,
      interviewing: 0,
      filled: 0,
      cancelled: 0,
    };

    // Performance data for trend
    const monthlyData = new Map<string, { filled: number; totalDays: number; count: number }>();

    for (const pos of positions || []) {
      switch (pos.status) {
        case 'open':
          positionsCounts.open++;
          break;
        case 'in_progress':
          positionsCounts.in_progress++;
          break;
        case 'interviewing':
          positionsCounts.interviewing++;
          break;
        case 'filled':
          positionsCounts.filled++;

          // Track monthly filled data
          if (pos.closed_at) {
            const month = pos.closed_at.substring(0, 7); // YYYY-MM
            if (!monthlyData.has(month)) {
              monthlyData.set(month, { filled: 0, totalDays: 0, count: 0 });
            }
            const data = monthlyData.get(month)!;
            data.filled++;
            if (pos.days_to_fill !== null) {
              data.totalDays += pos.days_to_fill;
              data.count++;
            }
          }
          break;
        case 'cancelled':
          positionsCounts.cancelled++;
          break;
      }
    }

    // Build performance trend (last 6 months)
    const performanceTrend: { month: string; filled: number; avg_days: number }[] = [];
    const sortedMonths = Array.from(monthlyData.keys()).sort().slice(-6);
    for (const month of sortedMonths) {
      const data = monthlyData.get(month)!;
      performanceTrend.push({
        month,
        filled: data.filled,
        avg_days: data.count > 0 ? Math.round(data.totalDays / data.count) : 0,
      });
    }

    // Compute derived fields
    const capacity = recruiter.capacity || 25;
    // Calculate current_load from actual position counts (not stored field)
    const currentLoad = positionsCounts.open + positionsCounts.in_progress + positionsCounts.interviewing;
    const utilizationPercent = capacity > 0 ? Math.round((currentLoad / capacity) * 100) : 0;

    const recruiterDetail: RecruiterDetail = {
      id: recruiter.id,
      name: recruiter.name,
      email: recruiter.email,
      phone: recruiter.phone,
      primary_zone: recruiter.primary_zone,
      secondary_zones: recruiter.secondary_zones || [],
      capability_level: recruiter.capability_level || 3,
      capabilities: recruiter.capabilities || [],
      capacity,
      current_load: currentLoad,
      fill_rate_30d: recruiter.fill_rate_30d || 0,
      avg_time_to_fill: recruiter.avg_time_to_fill || 0,
      is_active: recruiter.is_active,
      manager_id: recruiter.manager_id,
      created_at: recruiter.created_at,
      updated_at: recruiter.updated_at,
      utilization_percent: utilizationPercent,
      is_overloaded: currentLoad >= capacity,
      positions_count: positionsCounts,
      performance_trend: performanceTrend,
    };

    return NextResponse.json({
      success: true,
      data: recruiterDetail,
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: null,
        error: error instanceof Error ? error.message : 'Error al obtener reclutador',
      },
      { status: 500 }
    );
  }
}
