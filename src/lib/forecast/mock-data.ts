/**
 * Mock data for forecast page - Talentia
 *
 * Schema for forecast data:
 * - week: number (1-53 ISO week)
 * - year: number
 * - zone: Zone
 * - production_kg: number
 * - positions_needed: number (calculated as production_kg / 1000)
 */

import type { Zone } from '@/types/constants';

/**
 * Zones for the forecast display (subset of ZONES relevant for PICOS)
 * These are the main agricultural zones where forecasting is needed
 */
export const FORECAST_ZONES: Zone[] = [
  'Trujillo',
  'Viru',
  'Chao',
  'Chiclayo',
  'Arequipa',
];

/**
 * Spanish month names for calendar display
 */
export const SPANISH_MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
] as const;

/**
 * Spanish day abbreviations for calendar display
 */
export const SPANISH_DAYS_SHORT = [
  'Lun',
  'Mar',
  'Mie',
  'Jue',
  'Vie',
  'Sab',
  'Dom',
] as const;

/**
 * Forecast data point for a single week and zone
 */
export interface WeeklyZoneForecast {
  week: number;
  year: number;
  zone: Zone;
  production_kg: number;
  positions_needed: number;
}

/**
 * Aggregated weekly forecast across all zones
 */
export interface WeeklyForecastSummary {
  week: number;
  year: number;
  start_date: string;
  end_date: string;
  total_production_kg: number;
  total_positions_needed: number;
  by_zone: Record<Zone, number>;
  demand_level: 'low' | 'medium' | 'high' | 'peak';
}

/**
 * Zone forecast summary with trend
 */
export interface ZoneForecastSummary {
  zone: Zone;
  total_production_kg: number;
  total_positions_needed: number;
  avg_weekly_positions: number;
  peak_week: number;
  peak_positions: number;
  trend: 'up' | 'down' | 'stable';
  trend_percent: number;
}

/**
 * Calculate positions needed from production kg
 * Formula: 1 worker per 1000 kg
 */
export function calculatePositionsNeeded(production_kg: number): number {
  return Math.ceil(production_kg / 1000);
}

/**
 * Get ISO week number from date
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

/**
 * Get start date (Monday) of ISO week
 */
function getWeekStartDate(year: number, week: number): Date {
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1);

  const result = new Date(mondayWeek1);
  result.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return result;
}

/**
 * Get end date (Sunday) of ISO week
 */
function getWeekEndDate(year: number, week: number): Date {
  const startDate = getWeekStartDate(year, week);
  const endDate = new Date(startDate);
  endDate.setDate(startDate.getDate() + 6);
  return endDate;
}

/**
 * Format date as ISO string (YYYY-MM-DD)
 */
function formatDateISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

/**
 * Determine demand level based on positions needed
 */
function getDemandLevel(positions: number): 'low' | 'medium' | 'high' | 'peak' {
  if (positions >= 150) return 'peak';
  if (positions >= 100) return 'high';
  if (positions >= 50) return 'medium';
  return 'low';
}

/**
 * Generate mock forecast data for the next N weeks
 * Simulates realistic agricultural production patterns
 */
export function generateMockForecastData(weeksAhead: number): WeeklyZoneForecast[] {
  const data: WeeklyZoneForecast[] = [];
  const today = new Date();
  const currentWeek = getISOWeekNumber(today);
  const currentYear = today.getFullYear();

  // Base production values per zone (kg per week)
  const baseProduction: Record<Zone, number> = {
    'Trujillo': 45000,
    'Viru': 38000,
    'Chao': 32000,
    'Chiclayo': 25000,
    'Arequipa': 20000,
    'Ica': 15000,
    'Lima': 10000,
    'Chicama': 22000,
  };

  // Seasonal multipliers (peak in weeks 2-8 and 30-40)
  const getSeasonalMultiplier = (week: number): number => {
    if (week >= 2 && week <= 8) return 1.5 + Math.random() * 0.3;
    if (week >= 30 && week <= 40) return 1.8 + Math.random() * 0.4;
    if (week >= 45 || week <= 1) return 0.6 + Math.random() * 0.2;
    return 0.9 + Math.random() * 0.3;
  };

  for (let i = 0; i < weeksAhead; i++) {
    let week = currentWeek + i;
    let year = currentYear;

    // Handle year rollover
    if (week > 52) {
      week = week - 52;
      year = currentYear + 1;
    }

    const seasonalMultiplier = getSeasonalMultiplier(week);

    for (const zone of FORECAST_ZONES) {
      // Add some random variation (+-20%)
      const variation = 0.8 + Math.random() * 0.4;
      const production_kg = Math.round(
        baseProduction[zone] * seasonalMultiplier * variation
      );

      data.push({
        week,
        year,
        zone,
        production_kg,
        positions_needed: calculatePositionsNeeded(production_kg),
      });
    }
  }

  return data;
}

/**
 * Aggregate forecast data into weekly summaries
 */
export function aggregateWeeklyForecasts(
  data: WeeklyZoneForecast[]
): WeeklyForecastSummary[] {
  // Group by week-year
  const grouped = new Map<string, WeeklyZoneForecast[]>();

  for (const item of data) {
    const key = `${item.year}-${item.week}`;
    if (!grouped.has(key)) {
      grouped.set(key, []);
    }
    grouped.get(key)!.push(item);
  }

  const summaries: WeeklyForecastSummary[] = [];

  for (const [key, items] of grouped) {
    const [yearStr, weekStr] = key.split('-');
    const year = parseInt(yearStr, 10);
    const week = parseInt(weekStr, 10);

    const by_zone: Record<Zone, number> = {
      'Trujillo': 0,
      'Viru': 0,
      'Chao': 0,
      'Chiclayo': 0,
      'Arequipa': 0,
      'Ica': 0,
      'Lima': 0,
      'Chicama': 0,
    };

    let total_production_kg = 0;
    let total_positions_needed = 0;

    for (const item of items) {
      by_zone[item.zone] = item.positions_needed;
      total_production_kg += item.production_kg;
      total_positions_needed += item.positions_needed;
    }

    summaries.push({
      week,
      year,
      start_date: formatDateISO(getWeekStartDate(year, week)),
      end_date: formatDateISO(getWeekEndDate(year, week)),
      total_production_kg,
      total_positions_needed,
      by_zone,
      demand_level: getDemandLevel(total_positions_needed),
    });
  }

  // Sort by year and week
  summaries.sort((a, b) => {
    if (a.year !== b.year) return a.year - b.year;
    return a.week - b.week;
  });

  return summaries;
}

/**
 * Generate zone forecast summaries with trends
 */
export function generateZoneSummaries(
  data: WeeklyZoneForecast[]
): ZoneForecastSummary[] {
  const summaries: ZoneForecastSummary[] = [];

  for (const zone of FORECAST_ZONES) {
    const zoneData = data.filter((d) => d.zone === zone);

    if (zoneData.length === 0) continue;

    const total_production_kg = zoneData.reduce((sum, d) => sum + d.production_kg, 0);
    const total_positions_needed = zoneData.reduce((sum, d) => sum + d.positions_needed, 0);
    const avg_weekly_positions = Math.round(total_positions_needed / zoneData.length);

    // Find peak week
    let peak_positions = 0;
    let peak_week = 0;
    for (const d of zoneData) {
      if (d.positions_needed > peak_positions) {
        peak_positions = d.positions_needed;
        peak_week = d.week;
      }
    }

    // Calculate trend (comparing first half vs second half)
    const midpoint = Math.floor(zoneData.length / 2);
    const firstHalf = zoneData.slice(0, midpoint);
    const secondHalf = zoneData.slice(midpoint);

    const firstHalfAvg = firstHalf.reduce((sum, d) => sum + d.positions_needed, 0) / firstHalf.length;
    const secondHalfAvg = secondHalf.reduce((sum, d) => sum + d.positions_needed, 0) / secondHalf.length;

    const trend_percent = Math.round(((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100);
    let trend: 'up' | 'down' | 'stable' = 'stable';
    if (trend_percent > 5) trend = 'up';
    else if (trend_percent < -5) trend = 'down';

    summaries.push({
      zone,
      total_production_kg,
      total_positions_needed,
      avg_weekly_positions,
      peak_week,
      peak_positions,
      trend,
      trend_percent: Math.abs(trend_percent),
    });
  }

  // Sort by total positions needed (descending)
  summaries.sort((a, b) => b.total_positions_needed - a.total_positions_needed);

  return summaries;
}
