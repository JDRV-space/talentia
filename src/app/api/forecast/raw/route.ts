/**
 * API endpoint for raw forecast data from campaigns table
 * GET /api/forecast/raw - Returns campaign data formatted for forecast UI
 *
 * This endpoint provides data in the format expected by the forecast page
 * components (WeeklyZoneForecast format).
 *
 * UPDATED: Now uses historical labor ratios when available instead of
 * hardcoded kg_per_worker values.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import {
  calculateHistoricalLaborRatios,
  getLaborRatio,
  calculateWorkersNeeded,
  type LaborRatioResult,
} from "@/lib/algorithms"
import { CROP_TYPES } from "@/types/constants"
import type { Zone, CropType } from "@/types/constants"
import type { Campaign, Position } from "@/types/database"

// =============================================================================
// TYPES
// =============================================================================

interface CampaignRow {
  id: string
  year: number
  week_number: number
  zone: string
  crop: string
  production_kg: number
  estimated_workers: number | null
  kg_per_worker_day: number | null
  start_date: string
  end_date: string
}

interface WeeklyZoneForecast {
  week: number
  year: number
  zone: Zone
  production_kg: number
  positions_needed: number
  ratio_source?: 'historical' | 'campaign' | 'default'
  kg_per_worker_day?: number
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate positions needed from production kg using labor ratio
 *
 * Priority order:
 * 1. Use estimated_workers from campaign if available
 * 2. Use campaign's kg_per_worker_day if set
 * 3. Use historical labor ratio for crop/zone
 * 4. Fall back to default CROP_TYPES ratio
 *
 * @param campaign - Campaign data
 * @param laborRatios - Calculated historical labor ratios (optional)
 * @returns Object with positions_needed and metadata
 */
function calculatePositionsFromRatio(
  campaign: CampaignRow,
  laborRatios: LaborRatioResult | null
): { positions_needed: number; ratio_source: 'historical' | 'campaign' | 'default'; kg_per_worker_day: number } {
  const { production_kg, estimated_workers, kg_per_worker_day, crop, zone } = campaign

  // Priority 1: Use estimated_workers if available
  if (estimated_workers && estimated_workers > 0) {
    const effectiveRatio = production_kg / (estimated_workers * 6) // 6 working days
    return {
      positions_needed: estimated_workers,
      ratio_source: 'campaign',
      kg_per_worker_day: Math.round(effectiveRatio * 10) / 10,
    }
  }

  // Priority 2: Use campaign's kg_per_worker_day if set
  if (kg_per_worker_day && kg_per_worker_day > 0) {
    return {
      positions_needed: calculateWorkersNeeded(production_kg, kg_per_worker_day),
      ratio_source: 'campaign',
      kg_per_worker_day,
    }
  }

  // Priority 3: Use historical labor ratio
  if (laborRatios && crop && CROP_TYPES[crop as CropType]) {
    const ratio = getLaborRatio(
      crop as CropType,
      zone as Zone,
      laborRatios
    )

    if (ratio.source === 'historical') {
      return {
        positions_needed: calculateWorkersNeeded(production_kg, ratio.kg_per_worker_day),
        ratio_source: 'historical',
        kg_per_worker_day: ratio.kg_per_worker_day,
      }
    }
  }

  // Priority 4: Fall back to default CROP_TYPES ratio
  const cropType = crop as CropType
  const defaultRatio = CROP_TYPES[cropType]?.kg_per_worker_day ?? 50

  return {
    positions_needed: calculateWorkersNeeded(production_kg, defaultRatio),
    ratio_source: 'default',
    kg_per_worker_day: defaultRatio,
  }
}

/**
 * Get current ISO week number
 */
function getCurrentWeek(): { week: number; year: number } {
  const now = new Date()
  const d = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()))
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7))
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1))
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7)
  return { week, year: d.getUTCFullYear() }
}

// =============================================================================
// GET /api/forecast/raw
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Get weeks_ahead parameter (default 8)
    const weeksAhead = parseInt(searchParams.get("weeks_ahead") ?? "8", 10)

    // Option to include ratio metadata in response
    const includeRatioMeta = searchParams.get("include_ratio_meta") === "true"

    // Calculate date range for filtering
    const current = getCurrentWeek()
    const currentYear = current.year
    const currentWeek = current.week

    // Build range of (year, week) tuples to filter
    const targetWeeks: { year: number; week: number }[] = []
    for (let i = 0; i < weeksAhead; i++) {
      let week = currentWeek + i
      let year = currentYear
      if (week > 52) {
        week = week - 52
        year = currentYear + 1
      }
      targetWeeks.push({ year, week })
    }

    // Fetch upcoming campaigns from database
    const { data: upcomingCampaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("id, year, week_number, zone, crop, production_kg, estimated_workers, kg_per_worker_day, start_date, end_date")
      .is("deleted_at", null)
      .in("year", [currentYear, currentYear + 1])
      .gte("week_number", currentWeek)
      .order("year", { ascending: true })
      .order("week_number", { ascending: true })

    if (campaignsError) {
      return NextResponse.json(
        { success: false, error: campaignsError.message },
        { status: 500 }
      )
    }

    // Fetch historical data for labor ratio calculation
    // Get completed campaigns and filled positions
    let laborRatios: LaborRatioResult | null = null

    const [historicalCampaignsRes, positionsRes] = await Promise.all([
      supabase
        .from("campaigns")
        .select("*")
        .is("deleted_at", null)
        .eq("status", "completed")
        .gt("production_kg", 0),
      supabase
        .from("positions")
        .select("*")
        .is("deleted_at", null)
        .gt("filled_count", 0),
    ])

    // Calculate historical labor ratios if data is available
    if (
      !historicalCampaignsRes.error &&
      !positionsRes.error &&
      historicalCampaignsRes.data &&
      historicalCampaignsRes.data.length > 0 &&
      positionsRes.data &&
      positionsRes.data.length > 0
    ) {
      laborRatios = calculateHistoricalLaborRatios({
        campaigns: historicalCampaignsRes.data as Campaign[],
        positions: positionsRes.data as Position[],
      })
    }

    // Transform campaigns to WeeklyZoneForecast format using historical ratios
    const forecasts: WeeklyZoneForecast[] = (upcomingCampaigns ?? []).map((c: CampaignRow) => {
      const ratioResult = calculatePositionsFromRatio(c, laborRatios)

      const forecast: WeeklyZoneForecast = {
        week: c.week_number,
        year: c.year,
        zone: c.zone as Zone,
        production_kg: c.production_kg,
        positions_needed: ratioResult.positions_needed,
      }

      // Include ratio metadata if requested
      if (includeRatioMeta) {
        forecast.ratio_source = ratioResult.ratio_source
        forecast.kg_per_worker_day = ratioResult.kg_per_worker_day
      }

      return forecast
    })

    // Filter to only include weeks within the requested range
    const filteredForecasts = forecasts.filter(f => {
      return targetWeeks.some(t => t.year === f.year && t.week === f.week)
    })

    // Calculate ratio usage statistics
    const ratioStats = {
      historical_count: filteredForecasts.filter(f => f.ratio_source === 'historical').length,
      campaign_count: filteredForecasts.filter(f => f.ratio_source === 'campaign').length,
      default_count: filteredForecasts.filter(f => f.ratio_source === 'default').length,
    }

    return NextResponse.json({
      success: true,
      data: filteredForecasts,
      meta: {
        total: filteredForecasts.length,
        weeks_ahead: weeksAhead,
        current_week: currentWeek,
        current_year: currentYear,
        has_data: filteredForecasts.length > 0,
        // Include ratio statistics
        ratio_usage: includeRatioMeta ? ratioStats : undefined,
        // Include data quality info if historical ratios were calculated
        historical_data_quality: laborRatios?.data_quality ?? null,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al obtener datos de pronostico" },
      { status: 500 }
    )
  }
}
