import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import {
  forecastWorkers,
  generateWeeklyForecast,
  detectCampaignAlerts,
  validateForecastData,
  type ForecastResult,
  type CampaignAlert,
} from "@/lib/algorithms"
import type { Campaign } from "@/types/database"
import type { Zone, CropType } from "@/types/constants"

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const forecastQuerySchema = z.object({
  weeks_ahead: z.coerce.number().int().min(1).max(52).default(4),
  target_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  crop: z.enum(["esparrago", "arandano", "palta", "uva"]).optional(),
  zone: z.enum([
    "Trujillo", "Viru", "Chao", "Chicama",
    "Chiclayo", "Arequipa", "Ica", "Lima",
  ]).optional(),
  include_alerts: z.coerce.boolean().default(true),
  lead_time_days: z.coerce.number().int().min(1).max(90).default(30),
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Filtra campanas por cultivo y/o zona si se especifican
 */
function filterCampaigns(
  campaigns: Campaign[],
  crop?: CropType,
  zone?: Zone
): Campaign[] {
  let filtered = campaigns

  if (crop) {
    filtered = filtered.filter((c) => c.crop === crop)
  }

  if (zone) {
    filtered = filtered.filter((c) => c.zone === zone)
  }

  return filtered
}

/**
 * Formatea resultado de pronostico para respuesta API
 */
function formatForecastResponse(forecast: ForecastResult) {
  return {
    fecha_objetivo: forecast.target_date,
    trabajadores_predichos: forecast.predicted_workers,
    intervalo_confianza: {
      inferior: forecast.confidence_interval.lower,
      superior: forecast.confidence_interval.upper,
    },
    desglose: {
      componente_tendencia: forecast.breakdown.trend_component,
      componente_estacional: forecast.breakdown.seasonal_component,
      por_cultivo: {
        esparrago: forecast.breakdown.by_crop.esparrago,
        arandano: forecast.breakdown.by_crop.arandano,
        palta: forecast.breakdown.by_crop.palta,
        uva: forecast.breakdown.by_crop.uva,
      },
      por_zona: forecast.breakdown.by_zone,
    },
    calidad_modelo: {
      r_cuadrado: forecast.model_quality.r_squared,
      mape: forecast.model_quality.mape,
    },
  }
}

/**
 * Formatea alerta de campana para respuesta API
 */
function formatAlertResponse(alert: CampaignAlert) {
  return {
    campana_id: alert.campaign_id,
    nombre_campana: alert.campaign_name,
    cultivo: alert.crop,
    zona: alert.zone,
    fecha_inicio: alert.start_date,
    dias_hasta_inicio: alert.days_until_start,
    trabajadores_estimados: alert.estimated_workers,
    urgencia: alert.urgency,
    mensaje: alert.message,
  }
}

// =============================================================================
// GET /api/forecast - Get workforce forecast
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Parse and validate query parameters
    const queryParams = {
      weeks_ahead: searchParams.get("weeks_ahead"),
      target_date: searchParams.get("target_date"),
      crop: searchParams.get("crop"),
      zone: searchParams.get("zone"),
      include_alerts: searchParams.get("include_alerts"),
      lead_time_days: searchParams.get("lead_time_days"),
    }

    const validationResult = forecastQuerySchema.safeParse(queryParams)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Parametros invalidos",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const {
      weeks_ahead,
      target_date,
      crop,
      zone,
      include_alerts,
      lead_time_days,
    } = validationResult.data

    // Fetch campaigns from Supabase
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("*")
      .is("deleted_at", null)
      .order("start_date", { ascending: true })

    if (campaignsError) {
      return NextResponse.json(
        { success: false, error: campaignsError.message },
        { status: 500 }
      )
    }

    // Filter campaigns by crop/zone if specified
    const filteredCampaigns = filterCampaigns(
      (campaigns ?? []) as Campaign[],
      crop as CropType | undefined,
      zone as Zone | undefined
    )

    // Validate data quality
    const dataValidation = validateForecastData(filteredCampaigns)

    // Generate forecasts
    let forecasts: ForecastResult[]
    let alerts: CampaignAlert[] = []

    if (target_date) {
      // Single date forecast
      const targetDateObj = new Date(target_date)
      const singleForecast = forecastWorkers(filteredCampaigns, targetDateObj, {
        leadTimeDays: lead_time_days,
      })
      forecasts = [singleForecast]
    } else {
      // Weekly forecast for N weeks ahead
      forecasts = generateWeeklyForecast(filteredCampaigns, weeks_ahead)
    }

    // Get campaign alerts if requested
    if (include_alerts) {
      alerts = detectCampaignAlerts(filteredCampaigns, lead_time_days)
    }

    // Format response
    const formattedForecasts = forecasts.map(formatForecastResponse)
    const formattedAlerts = alerts.map(formatAlertResponse)

    // Calculate summary statistics
    const totalWorkersForecast = forecasts.reduce(
      (sum, f) => sum + f.predicted_workers,
      0
    )
    const avgWorkersForecast = forecasts.length > 0
      ? Math.round(totalWorkersForecast / forecasts.length)
      : 0

    // Count alerts by urgency
    const alertsByUrgency = {
      critico: alerts.filter((a) => a.urgency === "critico").length,
      alto: alerts.filter((a) => a.urgency === "alto").length,
      normal: alerts.filter((a) => a.urgency === "normal").length,
    }

    return NextResponse.json({
      success: true,
      data: {
        pronosticos: formattedForecasts,
        alertas: include_alerts ? formattedAlerts : undefined,
      },
      resumen: {
        semanas_pronosticadas: forecasts.length,
        promedio_trabajadores: avgWorkersForecast,
        total_campanas_analizadas: filteredCampaigns.length,
        alertas_por_urgencia: include_alerts ? alertsByUrgency : undefined,
      },
      calidad_datos: {
        valido: dataValidation.isValid,
        nivel: dataValidation.dataQuality,
        advertencias: dataValidation.warnings,
      },
      filtros_aplicados: {
        cultivo: crop ?? "todos",
        zona: zone ?? "todas",
        semanas_adelante: weeks_ahead,
        dias_anticipacion_alertas: lead_time_days,
      },
    })
  } catch {
    return NextResponse.json(
      { success: false, error: "Error al generar pronostico" },
      { status: 500 }
    )
  }
}
