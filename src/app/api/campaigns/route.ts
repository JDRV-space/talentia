/**
 * API endpoint for campaigns
 * GET /api/campaigns - List all campaigns with estimates and available recruiters
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';

// =============================================================================
// TYPES
// =============================================================================

interface AvailableRecruiter {
  id: string;
  name: string;
  current_load: number;
  primary_zone: string | null;
}

interface CampaignWithEstimates {
  id: string;
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
  created_at: string;
  // Enriched fields
  last_year_count: number; // COUNT of positions for same week/crop in 2025
  available_recruiters: AvailableRecruiter[]; // Recruiters in zone with < 2 open cases
}

// Response type matches CampaignWithEstimates[] with meta info

// =============================================================================
// GET /api/campaigns
// =============================================================================

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();
    const { searchParams } = new URL(request.url);

    // Query params
    const year = searchParams.get('year');
    const crop = searchParams.get('crop');
    const zone = searchParams.get('zone');
    const page = parseInt(searchParams.get('page') ?? '1', 10);
    const perPage = parseInt(searchParams.get('per_page') ?? '50', 10);

    // Build query for campaigns
    let query = supabase
      .from('campaigns')
      .select('*', { count: 'exact' })
      .is('deleted_at', null)
      .lte('year', 2026) // Hide 2027 and later
      .order('year', { ascending: false })
      .order('week_number', { ascending: true });

    if (year) {
      query = query.eq('year', parseInt(year, 10));
    }

    if (crop) {
      query = query.eq('crop', crop);
    }

    if (zone) {
      query = query.eq('zone', zone);
    }

    // Apply pagination
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;
    query = query.range(from, to);

    const { data: campaigns, error, count } = await query;

    if (error) {
      return NextResponse.json(
        {
          success: false,
          data: [],
          meta: { total: 0, page, per_page: perPage },
          error: error.message,
        },
        { status: 500 }
      );
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          total: count ?? 0,
          page,
          per_page: perPage,
        },
      });
    }

    // Get all 2025 positions for matching (week_number + crop)
    const { data: positions2025 } = await supabase
      .from('positions')
      .select('week_number, crop, headcount')
      .is('deleted_at', null)
      .gte('opened_at', '2025-01-01')
      .lt('opened_at', '2026-01-01');

    // Build a map of week+crop -> position count
    const positionCountMap = new Map<string, number>();
    for (const pos of positions2025 || []) {
      if (pos.week_number && pos.crop) {
        const key = `${pos.week_number}-${pos.crop}`;
        positionCountMap.set(key, (positionCountMap.get(key) || 0) + (pos.headcount || 1));
      }
    }

    // Get ALL active recruiters (we need all to categorize as principal vs apoyo)
    const { data: recruiters } = await supabase
      .from('recruiters')
      .select('id, name, primary_zone')
      .is('deleted_at', null)
      .eq('is_active', true);

    // Get position counts per recruiter (open + in_progress)
    const recruiterIds = (recruiters || []).map(r => r.id);

    const { data: recruiterPositions } = recruiterIds.length > 0
      ? await supabase
          .from('positions')
          .select('recruiter_id, status')
          .is('deleted_at', null)
          .in('status', ['open', 'in_progress'])
          .in('recruiter_id', recruiterIds)
      : { data: [] };

    // Count open cases per recruiter
    const recruiterLoadMap = new Map<string, number>();
    for (const pos of recruiterPositions || []) {
      if (pos.recruiter_id) {
        recruiterLoadMap.set(pos.recruiter_id, (recruiterLoadMap.get(pos.recruiter_id) || 0) + 1);
      }
    }

    // Build list of ALL available recruiters (< 2 open cases)
    const allAvailableRecruiters: AvailableRecruiter[] = [];

    for (const recruiter of recruiters || []) {
      const load = recruiterLoadMap.get(recruiter.id) || 0;
      // Available if < 2 open cases
      if (load < 2) {
        allAvailableRecruiters.push({
          id: recruiter.id,
          name: recruiter.name,
          current_load: load,
          primary_zone: recruiter.primary_zone,
        });
      }
    }

    // Enrich campaigns with estimates
    // Filter and sort recruiters PER CAMPAIGN based on zone
    const enrichedCampaigns: CampaignWithEstimates[] = campaigns.map(campaign => {
      const key = `${campaign.week_number}-${campaign.crop}`;
      const lastYearCount = positionCountMap.get(key) || 0;

      // Categorize recruiters for THIS campaign's zone
      const campaignZone = campaign.zone?.trim() || '';
      const hasZone = campaignZone !== '' && campaignZone.toLowerCase() !== 'nacional';
      const principals: AvailableRecruiter[] = [];
      const apoyo: AvailableRecruiter[] = [];

      for (const r of allAvailableRecruiters) {
        if (hasZone && r.primary_zone === campaignZone) {
          principals.push(r);
        } else {
          apoyo.push(r);
        }
      }

      // Sort each group by current_load ASC (most free first)
      principals.sort((a, b) => a.current_load - b.current_load);
      apoyo.sort((a, b) => a.current_load - b.current_load);

      // Combine: principals first, then apoyo
      const sortedRecruiters = [...principals, ...apoyo];

      return {
        ...campaign,
        last_year_count: lastYearCount,
        available_recruiters: sortedRecruiters,
      };
    });

    return NextResponse.json({
      success: true,
      data: enrichedCampaigns,
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        data: [],
        meta: { total: 0, page: 1, per_page: 50 },
        error: error instanceof Error ? error.message : 'Error al obtener campañas',
      },
      { status: 500 }
    );
  }
}
