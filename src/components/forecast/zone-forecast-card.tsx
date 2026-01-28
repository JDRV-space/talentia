"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, TrendingDown, Minus, MapPin, Factory, Users, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ZoneForecastSummary } from "@/lib/forecast/mock-data";

/**
 * Props for the ZoneForecastCard component
 */
interface ZoneForecastCardProps {
  /** Zone forecast data */
  forecast: ZoneForecastSummary;
  /** Index for animation delay */
  index?: number;
  /** Click handler */
  onClick?: () => void;
}

/**
 * Trend icon component
 */
function TrendIcon({
  trend,
  className,
}: {
  trend: "up" | "down" | "stable";
  className?: string;
}) {
  const iconClass = cn("h-4 w-4", className);

  switch (trend) {
    case "up":
      return <TrendingUp className={iconClass} />;
    case "down":
      return <TrendingDown className={iconClass} />;
    case "stable":
      return <Minus className={iconClass} />;
  }
}

/**
 * Trend styles
 */
const trendStyles = {
  up: "text-lime-600 dark:text-lime-400 bg-lime-100 dark:bg-lime-900/40",
  down: "text-rose-600 dark:text-rose-400 bg-rose-100 dark:bg-rose-900/40",
  stable: "text-stone-500 dark:text-stone-400 bg-stone-100 dark:bg-stone-800/40",
};

/**
 * Trend labels in Spanish
 */
const trendLabels = {
  up: "En aumento",
  down: "En descenso",
  stable: "Estable",
};

/**
 * Format large numbers for display
 */
function formatNumber(value: number): string {
  if (value >= 1000000) {
    return `${(value / 1000000).toFixed(1)}M`;
  }
  if (value >= 1000) {
    return `${(value / 1000).toFixed(0)}k`;
  }
  return value.toString();
}

/**
 * Create motion-enabled Card
 */
const MotionCard = motion.create(Card);

/**
 * ZoneForecastCard Component
 *
 * Displays forecast summary for a specific zone including:
 * - Production kg expected
 * - Calculated positions needed
 * - Trend indicator
 * - Peak week information
 *
 * @example
 * <ZoneForecastCard
 *   forecast={{
 *     zone: 'Trujillo',
 *     total_production_kg: 180000,
 *     total_positions_needed: 180,
 *     avg_weekly_positions: 45,
 *     peak_week: 32,
 *     peak_positions: 68,
 *     trend: 'up',
 *     trend_percent: 12,
 *   }}
 * />
 */
export function ZoneForecastCard({
  forecast,
  index = 0,
  onClick,
}: ZoneForecastCardProps) {
  const {
    zone,
    total_production_kg,
    total_positions_needed,
    avg_weekly_positions,
    peak_week,
    peak_positions,
    trend,
    trend_percent,
  } = forecast;

  return (
    <MotionCard
      className={cn(
        "cursor-pointer overflow-hidden transition-shadow hover:shadow-md",
        onClick && "hover:border-teal-300 dark:hover:border-teal-700"
      )}
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      whileHover={{ scale: 1.01, transition: { duration: 0.2 } }}
    >
      <CardContent className="p-5">
        {/* Header: Zone name and trend */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <div className="rounded-lg bg-teal-100 p-2 dark:bg-teal-900/40">
              <MapPin className="h-4 w-4 text-teal-600 dark:text-teal-400" />
            </div>
            <div>
              <h3 className="font-semibold text-card-foreground">{zone}</h3>
              <p className="text-xs text-muted-foreground">Zona agricola</p>
            </div>
          </div>

          {/* Trend badge */}
          <Badge
            variant="outline"
            className={cn("gap-1 text-xs", trendStyles[trend])}
          >
            <TrendIcon trend={trend} className="h-3 w-3" />
            {trend_percent > 0 ? `${trend_percent}%` : trendLabels[trend]}
          </Badge>
        </div>

        {/* Main stats */}
        <div className="mt-4 grid grid-cols-2 gap-4">
          {/* Production */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Factory className="h-3.5 w-3.5" />
              <span>Produccion</span>
            </div>
            <p className="text-xl font-bold text-card-foreground">
              {formatNumber(total_production_kg)}{" "}
              <span className="text-sm font-normal text-muted-foreground">kg</span>
            </p>
          </div>

          {/* Positions needed */}
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Users className="h-3.5 w-3.5" />
              <span>Posiciones</span>
            </div>
            <p className="text-xl font-bold text-teal-600 dark:text-teal-400">
              {total_positions_needed}
            </p>
          </div>
        </div>

        {/* Divider */}
        <div className="my-4 h-px bg-border" />

        {/* Secondary stats */}
        <div className="grid grid-cols-2 gap-4 text-sm">
          {/* Average weekly */}
          <div className="space-y-0.5">
            <span className="text-xs text-muted-foreground">Prom. semanal</span>
            <p className="font-medium text-card-foreground">
              {avg_weekly_positions}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                pos/sem
              </span>
            </p>
          </div>

          {/* Peak week */}
          <div className="space-y-0.5">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3 w-3" />
              <span>Semana pico</span>
            </div>
            <p className="font-medium text-card-foreground">
              S{peak_week}{" "}
              <span className="text-xs font-normal text-muted-foreground">
                ({peak_positions} pos.)
              </span>
            </p>
          </div>
        </div>

        {/* Progress bar showing position density */}
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Intensidad de demanda</span>
            <span>
              {Math.round((avg_weekly_positions / 100) * 100)}%
            </span>
          </div>
          <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-stone-100 dark:bg-stone-800">
            <motion.div
              className="h-full rounded-full bg-gradient-to-r from-teal-400 to-teal-600"
              initial={{ width: 0 }}
              animate={{ width: `${Math.min((avg_weekly_positions / 100) * 100, 100)}%` }}
              transition={{ duration: 0.8, delay: index * 0.1 + 0.3 }}
            />
          </div>
        </div>
      </CardContent>
    </MotionCard>
  );
}

/**
 * Grid component for displaying multiple zone cards
 */
interface ZoneForecastGridProps {
  /** Array of zone forecasts */
  forecasts: ZoneForecastSummary[];
  /** Handler when a zone card is clicked */
  onZoneClick?: (zone: string) => void;
}

export function ZoneForecastGrid({ forecasts, onZoneClick }: ZoneForecastGridProps) {
  if (forecasts.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border bg-card p-12 text-center">
        <MapPin className="h-12 w-12 text-stone-300 dark:text-stone-600" />
        <h3 className="mt-4 font-semibold text-card-foreground">
          Sin datos por zona
        </h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          No hay pronosticos disponibles por zona. Sube datos de Picos.xlsx para generar proyecciones.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {forecasts.map((forecast, index) => (
        <ZoneForecastCard
          key={forecast.zone}
          forecast={forecast}
          index={index}
          onClick={() => onZoneClick?.(forecast.zone)}
        />
      ))}
    </div>
  );
}
