"use client";

import { useState, useMemo, useEffect, useCallback } from "react";
import { Header } from "@/components/layout/header";
import { ForecastCalendar } from "@/components/forecast/forecast-calendar";
import { ZoneForecastGrid } from "@/components/forecast/zone-forecast-card";
import { KPICard } from "@/components/dashboard/kpi-card";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  TrendingUp,
  Users,
  AlertTriangle,
  MapPin,
  Clock,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  generateMockForecastData,
  aggregateWeeklyForecasts,
  generateZoneSummaries,
  SPANISH_MONTHS,
  type WeeklyForecastSummary,
  type WeeklyZoneForecast,
} from "@/lib/forecast/mock-data";

/**
 * Time range options for forecast
 */
type TimeRange = 4 | 8 | 12;

const TIME_RANGE_OPTIONS: { value: TimeRange; label: string }[] = [
  { value: 4, label: "4 semanas" },
  { value: 8, label: "8 semanas" },
  { value: 12, label: "12 semanas" },
];

/**
 * Format date for display in Spanish
 */
function formatDateSpanish(dateString: string): string {
  const date = new Date(dateString);
  return `${date.getDate()} de ${SPANISH_MONTHS[date.getMonth()]}`;
}

/**
 * Pronostico Page (P9 - Forecast)
 *
 * Main forecast page showing:
 * - Time range selector (4, 8, 12 weeks)
 * - Calendar view of upcoming weeks with demand intensity
 * - Summary KPIs (total forecast positions, peak week)
 * - Grid of zone forecast cards
 *
 * Uses mock data following the schema:
 * - week, year, zone, production_kg, positions_needed
 */
export default function PronosticoPage() {
  // State for time range selection
  const [timeRange, setTimeRange] = useState<TimeRange>(8);

  // State for selected week (for detail view)
  const [selectedWeek, setSelectedWeek] = useState<string | null>(null);

  // State for real data from API
  const [forecastData, setForecastData] = useState<WeeklyZoneForecast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [hasRealData, setHasRealData] = useState(false);

  // Fetch real forecast data from API
  const fetchForecastData = useCallback(async (weeks: number) => {
    try {
      setIsLoading(true);
      const response = await fetch(`/api/forecast/raw?weeks_ahead=${weeks}`);
      const result = await response.json();

      if (result.success && result.data && result.data.length > 0) {
        setForecastData(result.data);
        setHasRealData(true);
      } else {
        // Fall back to mock data if no real data exists
        setForecastData(generateMockForecastData(weeks));
        setHasRealData(false);
      }
    } catch {
      // Fall back to mock data on error
      setForecastData(generateMockForecastData(weeks));
      setHasRealData(false);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch data when time range changes
  useEffect(() => {
    fetchForecastData(timeRange);
  }, [timeRange, fetchForecastData]);

  // Use forecast data (real or mock)
  const mockData = forecastData;

  // Aggregate weekly forecasts
  const weeklyForecasts = useMemo(() => {
    return aggregateWeeklyForecasts(mockData);
  }, [mockData]);

  // Generate zone summaries
  const zoneSummaries = useMemo(() => {
    return generateZoneSummaries(mockData);
  }, [mockData]);

  // Calculate summary statistics
  const stats = useMemo(() => {
    const totalPositions = weeklyForecasts.reduce(
      (sum, w) => sum + w.total_positions_needed,
      0
    );

    const peakWeek = weeklyForecasts.reduce<WeeklyForecastSummary | null>(
      (peak, current) => {
        if (!peak || current.total_positions_needed > peak.total_positions_needed) {
          return current;
        }
        return peak;
      },
      null
    );

    const activeCampaigns = zoneSummaries.filter(
      (z) => z.total_positions_needed > 0
    ).length;

    const alertCount = weeklyForecasts.filter(
      (w) => w.demand_level === "peak" || w.demand_level === "high"
    ).length;

    return {
      totalPositions,
      peakWeek,
      activeCampaigns,
      alertCount,
    };
  }, [weeklyForecasts, zoneSummaries]);

  // Get selected week details
  const selectedWeekDetails = useMemo(() => {
    if (!selectedWeek) return null;
    return weeklyForecasts.find(
      (w) => `${w.year}-${w.week}` === selectedWeek
    ) || null;
  }, [selectedWeek, weeklyForecasts]);

  // Handler for week selection
  const handleWeekSelect = (forecast: WeeklyForecastSummary) => {
    const key = `${forecast.year}-${forecast.week}`;
    setSelectedWeek((prev) => (prev === key ? null : key));
  };

  // Loading state
  if (isLoading) {
    return (
      <>
        <Header title="Pronostico de Demanda" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando pronostico...</p>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Pronostico de Demanda" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        {/* Header section with title and time range selector */}
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-semibold text-card-foreground">
                Pronostico de Trabajadores
              </h2>
              {!hasRealData && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 bg-amber-50">
                  Datos de ejemplo
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {hasRealData
                ? "Prediccion basada en datos de campanas (PICOS)"
                : "Sube un archivo PICOS para ver datos reales"}
            </p>
          </div>

          {/* Time range selector */}
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Periodo:</span>
            <div className="flex rounded-lg border bg-card p-1">
              {TIME_RANGE_OPTIONS.map((option) => (
                <Button
                  key={option.value}
                  variant={timeRange === option.value ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setTimeRange(option.value)}
                  className={cn(
                    "text-xs",
                    timeRange === option.value &&
                      "bg-teal-600 text-white hover:bg-teal-700"
                  )}
                >
                  {option.label}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* KPI Summary Row */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <KPICard
            title={`Proximas ${timeRange} semanas`}
            value={stats.totalPositions}
            subtitle="posiciones estimadas"
            icon={<TrendingUp className="h-5 w-5" />}
          />

          <KPICard
            title="Zonas activas"
            value={stats.activeCampaigns}
            subtitle="con demanda proyectada"
            icon={<MapPin className="h-5 w-5" />}
          />

          <KPICard
            title="Semana pico"
            value={stats.peakWeek ? `S${stats.peakWeek.week}` : "-"}
            subtitle={
              stats.peakWeek
                ? `${stats.peakWeek.total_positions_needed} posiciones`
                : "Sin datos"
            }
            variant="warning"
            icon={<Users className="h-5 w-5" />}
          />

          <KPICard
            title="Alertas de demanda"
            value={stats.alertCount}
            subtitle="semanas con demanda alta/pico"
            variant={stats.alertCount > 0 ? "error" : "default"}
            icon={<AlertTriangle className="h-5 w-5" />}
          />
        </div>

        {/* Calendar View */}
        <ForecastCalendar
          forecasts={weeklyForecasts}
          onWeekSelect={handleWeekSelect}
          selectedWeek={selectedWeek || undefined}
          viewMode="month"
          title="Calendario de Demanda"
        />

        {/* Selected week detail panel */}
        {selectedWeekDetails && (
          <Card className="border-teal-200 bg-teal-50/50 dark:border-teal-800 dark:bg-teal-950/20">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="h-5 w-5 text-teal-600" />
                  <CardTitle className="text-base">
                    Detalle Semana {selectedWeekDetails.week}
                  </CardTitle>
                </div>
                <Badge
                  variant="outline"
                  className="bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-300"
                >
                  {formatDateSpanish(selectedWeekDetails.start_date)} -{" "}
                  {formatDateSpanish(selectedWeekDetails.end_date)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
                {Object.entries(selectedWeekDetails.by_zone)
                  .filter(([, positions]) => positions > 0)
                  .sort(([, a], [, b]) => b - a)
                  .map(([zone, positions]) => (
                    <div
                      key={zone}
                      className="flex items-center justify-between rounded-lg bg-white p-3 dark:bg-stone-900"
                    >
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-teal-600" />
                        <span className="text-sm font-medium">{zone}</span>
                      </div>
                      <span className="font-bold text-teal-600">{positions}</span>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Zone Forecast Cards Section */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-teal-600" />
            <h3 className="text-lg font-semibold text-card-foreground">
              Pronostico por Zona
            </h3>
            <Badge variant="secondary" className="ml-2">
              {zoneSummaries.length} zonas
            </Badge>
          </div>

          <ZoneForecastGrid
            forecasts={zoneSummaries}
            onZoneClick={(_zone) => {
              // Zone detail navigation not yet implemented
            }}
          />
        </div>

        {/* Formula reference note */}
        <Card className="bg-stone-50 dark:bg-stone-900/50">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/40">
                <TrendingUp className="h-4 w-4 text-teal-600" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-medium text-card-foreground">
                  Formula de calculo
                </p>
                <p className="text-xs text-muted-foreground">
                  <code className="rounded bg-stone-200 px-1.5 py-0.5 dark:bg-stone-800">
                    posiciones_necesarias = produccion_kg / 1000
                  </code>
                  <span className="ml-2">
                    (aproximadamente 1 trabajador por cada 1,000 kg de produccion)
                  </span>
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </>
  );
}
