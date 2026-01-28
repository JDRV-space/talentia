/**
 * API endpoint for historical labor ratios
 * GET /api/labor-ratios - Calculate and return labor ratios from historical data
 *
 * This endpoint analyzes completed campaigns and matched positions to derive
 * actual kg_per_worker_day ratios instead of using hardcoded defaults.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import {
  calculateHistoricalLaborRatios,
  type LaborRatioResult,
} from "@/lib/algorithms"
import type { Campaign, Position } from "@/types/database"
import { CROP_TYPES } from "@/types/constants"
import type { CropType } from "@/types/constants"

// =============================================================================
// GET /api/labor-ratios - Get calculated labor ratios
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Optional filter by crop
    const cropFilter = searchParams.get("crop") as CropType | null

    // Fetch completed campaigns
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("*")
      .is("deleted_at", null)
      .eq("status", "completed")
      .gt("production_kg", 0)

    if (campaignsError) {
      return NextResponse.json(
        { success: false, error: campaignsError.message },
        { status: 500 }
      )
    }

    // Fetch filled positions (must match algorithm filters)
    // Include week_number and crop for direct campaign matching
    const { data: positions, error: positionsError } = await supabase
      .from("positions")
      .select("*, week_number, crop")
      .is("deleted_at", null)
      .eq("status", "filled")
      .not("closed_at", "is", null)
      .gt("filled_count", 0)

    if (positionsError) {
      return NextResponse.json(
        { success: false, error: positionsError.message },
        { status: 500 }
      )
    }

    // Calculate historical labor ratios
    const ratios = calculateHistoricalLaborRatios({
      campaigns: (campaigns ?? []) as Campaign[],
      positions: (positions ?? []) as Position[],
    })

    // If crop filter provided, return only that crop's data
    if (cropFilter && CROP_TYPES[cropFilter]) {
      const cropRatio = ratios.by_crop[cropFilter]
      const cropZoneRatios = Object.entries(ratios.by_crop_zone)
        .filter(([key]) => key.startsWith(`${cropFilter}_`))
        .reduce((acc, [key, value]) => {
          acc[key] = value
          return acc
        }, {} as typeof ratios.by_crop_zone)

      return NextResponse.json({
        success: true,
        data: {
          crop: cropFilter,
          ratio: cropRatio,
          by_zone: cropZoneRatios,
          default_ratio: CROP_TYPES[cropFilter].kg_per_worker_day,
        },
        meta: {
          using_historical: cropRatio.source === "historical",
          confidence: cropRatio.confidence,
          sample_size: cropRatio.sample_size,
        },
      })
    }

    // Return all ratios with comparison to defaults
    const comparison = Object.entries(ratios.by_crop).map(([crop, ratio]) => {
      const cropKey = crop as CropType
      const defaultRatio = CROP_TYPES[cropKey].kg_per_worker_day
      const difference = ratio.kg_per_worker_day - defaultRatio
      const percentDiff = defaultRatio > 0 ? (difference / defaultRatio) * 100 : 0

      return {
        crop: cropKey,
        historical_ratio: ratio.kg_per_worker_day,
        default_ratio: defaultRatio,
        difference: Math.round(difference * 10) / 10,
        percent_difference: Math.round(percentDiff * 10) / 10,
        source: ratio.source,
        confidence: ratio.confidence,
        sample_size: ratio.sample_size,
      }
    })

    return NextResponse.json({
      success: true,
      data: {
        ratios: ratios.by_crop,
        by_crop_zone: ratios.by_crop_zone,
        overall_average: ratios.overall_average,
        comparison,
      },
      data_quality: ratios.data_quality,
      meta: {
        calculated_at: new Date().toISOString(),
        total_crops: Object.keys(ratios.by_crop).length,
        crops_with_historical: Object.values(ratios.by_crop).filter(
          (r) => r.source === "historical"
        ).length,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al calcular ratios laborales" },
      { status: 500 }
    )
  }
}
