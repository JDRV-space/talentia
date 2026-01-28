"use client";

import { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";
import type { WeeklyForecastSummary } from "@/lib/forecast/mock-data";
import { SPANISH_MONTHS } from "@/lib/forecast/mock-data";

/**
 * Props for the ForecastCalendar component
 */
interface ForecastCalendarProps {
  /** Weekly forecast data to display */
  forecasts: WeeklyForecastSummary[];
  /** Callback when a week is selected */
  onWeekSelect?: (forecast: WeeklyForecastSummary) => void;
  /** Currently selected week (week-year key) */
  selectedWeek?: string;
  /** View mode: month or week */
  viewMode?: "month" | "week";
  /** Title override */
  title?: string;
}

/**
 * Color intensity based on demand level
 */
const demandLevelStyles = {
  low: "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-200",
  medium: "bg-teal-200 text-teal-900 dark:bg-teal-800/50 dark:text-teal-100",
  high: "bg-teal-400 text-white dark:bg-teal-700 dark:text-white",
  peak: "bg-teal-600 text-white dark:bg-teal-600 dark:text-white",
};

/**
 * Hover styles for demand levels
 */
const demandLevelHoverStyles = {
  low: "hover:bg-teal-200 dark:hover:bg-teal-900/60",
  medium: "hover:bg-teal-300 dark:hover:bg-teal-800/70",
  high: "hover:bg-teal-500 dark:hover:bg-teal-600",
  peak: "hover:bg-teal-700 dark:hover:bg-teal-500",
};

/**
 * Badge styles for demand levels
 */
const demandBadgeStyles = {
  low: "bg-teal-100 text-teal-700 border-teal-200",
  medium: "bg-teal-200 text-teal-800 border-teal-300",
  high: "bg-teal-500 text-white border-teal-600",
  peak: "bg-teal-700 text-white border-teal-800",
};

/**
 * Spanish labels for demand levels
 */
const demandLevelLabels = {
  low: "Bajo",
  medium: "Medio",
  high: "Alto",
  peak: "Pico",
};

/**
 * Format date range for display in Spanish
 */
function formatDateRange(startDate: string, endDate: string): string {
  const start = new Date(startDate);
  const end = new Date(endDate);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = SPANISH_MONTHS[start.getMonth()];
  const endMonth = SPANISH_MONTHS[end.getMonth()];

  if (startMonth === endMonth) {
    return `${startDay} - ${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth.substring(0, 3)} - ${endDay} ${endMonth.substring(0, 3)}`;
}

/**
 * Get month and year from week data
 */
function getMonthYear(forecasts: WeeklyForecastSummary[], weekIndex: number): {
  month: string;
  year: number;
} {
  if (forecasts.length === 0 || weekIndex >= forecasts.length) {
    const now = new Date();
    return { month: SPANISH_MONTHS[now.getMonth()], year: now.getFullYear() };
  }

  const forecast = forecasts[weekIndex];
  const date = new Date(forecast.start_date);
  return {
    month: SPANISH_MONTHS[date.getMonth()],
    year: forecast.year,
  };
}

/**
 * ForecastCalendar Component
 *
 * Displays a calendar view of expected hiring needs with color intensity
 * based on demand level. Supports month/week view toggle and week selection.
 *
 * @example
 * <ForecastCalendar
 *   forecasts={weeklyData}
 *   onWeekSelect={(week) => console.log(week)}
 *   viewMode="month"
 * />
 */
export function ForecastCalendar({
  forecasts,
  onWeekSelect,
  selectedWeek,
  viewMode = "month",
  title = "Calendario de Demanda",
}: ForecastCalendarProps) {
  const [currentOffset, setCurrentOffset] = useState(0);

  // Number of weeks to show based on view mode
  const weeksToShow = viewMode === "month" ? 4 : 8;

  // Slice forecasts based on current offset
  const visibleForecasts = useMemo(() => {
    return forecasts.slice(currentOffset, currentOffset + weeksToShow);
  }, [forecasts, currentOffset, weeksToShow]);

  // Current month/year display
  const { month, year } = getMonthYear(forecasts, currentOffset);

  // Navigation handlers
  const canGoBack = currentOffset > 0;
  const canGoForward = currentOffset + weeksToShow < forecasts.length;

  const handlePrevious = () => {
    if (canGoBack) {
      setCurrentOffset((prev) => Math.max(0, prev - weeksToShow));
    }
  };

  const handleNext = () => {
    if (canGoForward) {
      setCurrentOffset((prev) => Math.min(forecasts.length - weeksToShow, prev + weeksToShow));
    }
  };

  // Calculate totals for visible range
  const totalPositions = visibleForecasts.reduce(
    (sum, f) => sum + f.total_positions_needed,
    0
  );

  // Find peak week in visible range
  const peakWeek = visibleForecasts.reduce<WeeklyForecastSummary | null>(
    (peak, current) => {
      if (!peak || current.total_positions_needed > peak.total_positions_needed) {
        return current;
      }
      return peak;
    },
    null
  );

  return (
    <Card>
      <CardHeader className="pb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Calendar className="h-5 w-5 text-teal-600" />
            <CardTitle className="text-lg">{title}</CardTitle>
          </div>

          {/* Navigation controls */}
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="icon-sm"
              onClick={handlePrevious}
              disabled={!canGoBack}
              aria-label="Semanas anteriores"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>

            <span className="min-w-[140px] text-center text-sm font-medium">
              {month} {year}
            </span>

            <Button
              variant="outline"
              size="icon-sm"
              onClick={handleNext}
              disabled={!canGoForward}
              aria-label="Semanas siguientes"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Summary badges */}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
            <Users className="h-4 w-4" />
            <span>
              Total periodo:{" "}
              <span className="font-semibold text-foreground">{totalPositions}</span>{" "}
              posiciones
            </span>
          </div>

          {peakWeek && (
            <Badge className={cn("text-xs", demandBadgeStyles.peak)}>
              Pico: Semana {peakWeek.week} ({peakWeek.total_positions_needed} pos.)
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Legend */}
        <div className="mb-4 flex flex-wrap items-center gap-3 text-xs">
          <span className="text-muted-foreground">Nivel de demanda:</span>
          {(["low", "medium", "high", "peak"] as const).map((level) => (
            <div key={level} className="flex items-center gap-1.5">
              <div
                className={cn(
                  "h-3 w-3 rounded-sm",
                  demandLevelStyles[level]
                )}
              />
              <span className="text-muted-foreground">{demandLevelLabels[level]}</span>
            </div>
          ))}
        </div>

        {/* Calendar grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <AnimatePresence mode="popLayout">
            {visibleForecasts.map((forecast, index) => {
              const weekKey = `${forecast.year}-${forecast.week}`;
              const isSelected = selectedWeek === weekKey;

              return (
                <motion.button
                  key={weekKey}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.2, delay: index * 0.05 }}
                  onClick={() => onWeekSelect?.(forecast)}
                  className={cn(
                    "flex flex-col rounded-lg p-3 text-left transition-all",
                    demandLevelStyles[forecast.demand_level],
                    demandLevelHoverStyles[forecast.demand_level],
                    isSelected && "ring-2 ring-teal-600 ring-offset-2 dark:ring-offset-stone-900",
                    "focus:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
                  )}
                  aria-label={`Semana ${forecast.week}: ${forecast.total_positions_needed} posiciones`}
                  aria-pressed={isSelected}
                >
                  {/* Week number */}
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium opacity-80">
                      Semana {forecast.week}
                    </span>
                    <Badge
                      variant="outline"
                      className={cn(
                        "h-5 px-1.5 text-[10px]",
                        demandBadgeStyles[forecast.demand_level]
                      )}
                    >
                      {demandLevelLabels[forecast.demand_level]}
                    </Badge>
                  </div>

                  {/* Date range */}
                  <span className="mt-1 text-[11px] opacity-75">
                    {formatDateRange(forecast.start_date, forecast.end_date)}
                  </span>

                  {/* Positions count */}
                  <div className="mt-2 flex items-baseline gap-1">
                    <span className="text-2xl font-bold">
                      {forecast.total_positions_needed}
                    </span>
                    <span className="text-xs opacity-75">pos.</span>
                  </div>

                  {/* Production */}
                  <span className="mt-1 text-[10px] opacity-70">
                    {(forecast.total_production_kg / 1000).toFixed(0)}k kg
                  </span>
                </motion.button>
              );
            })}
          </AnimatePresence>
        </div>

        {/* Empty state */}
        {visibleForecasts.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Calendar className="h-12 w-12 text-stone-300 dark:text-stone-600" />
            <p className="mt-3 text-sm text-muted-foreground">
              No hay datos de pronostico disponibles
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
