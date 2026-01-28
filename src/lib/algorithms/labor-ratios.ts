/**
 * Historical Labor Ratio Algorithm - Talentia
 *
 * This module calculates labor ratios from historical campaign and position data.
 * Instead of using hardcoded kg_per_worker_day values, it derives ratios from
 * actual hiring data matched to completed campaigns.
 *
 * FORMULA:
 *   ratio = production_kg / actual_workers_hired
 *
 * Where:
 *   - production_kg comes from completed campaigns
 *   - actual_workers_hired = sum of filled_count from positions
 *     in the same zone with overlapping dates
 *
 * @author Talentia
 * @version 1.0.0
 */

import type { Campaign, Position } from '@/types/database';
import type { CropType, Zone } from '@/types/constants';
import { CROP_TYPES, ZONES, CROP_ZONE_DISTRIBUTION, ZONE_TO_REGION } from '@/types/constants';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Calculated labor ratio for a crop/zone combination
 */
export interface LaborRatio {
  /** Crop type */
  crop: CropType;
  /** Zone (null for crop-level, empty string for company-wide, or specific zone) */
  zone: Zone | null | '';
  /** Calculated kg per worker per day */
  kg_per_worker_day: number;
  /** Number of historical data points used */
  sample_size: number;
  /** Confidence score (0-1) based on sample size and variance */
  confidence: number;
  /** Standard deviation of the ratio */
  std_dev: number;
  /** Source of the ratio */
  source: 'historical' | 'default';
  /** Last updated timestamp */
  calculated_at: string;
}

/**
 * Input data for labor ratio calculation
 */
export interface LaborRatioInput {
  campaigns: Campaign[];
  positions: Position[];
}

/**
 * Result of labor ratio calculation
 */
export interface LaborRatioResult {
  /** Calculated ratios by crop */
  by_crop: Record<CropType, LaborRatio>;
  /** Calculated ratios by crop and zone */
  by_crop_zone: Record<string, LaborRatio>; // key: `${crop}_${zone}`
  /** Overall average ratio (fallback) */
  overall_average: number;
  /** Data quality metrics */
  data_quality: {
    total_campaigns_analyzed: number;
    campaigns_with_matches: number;
    total_positions_matched: number;
    coverage_percent: number;
  };
}

/**
 * Internal type for matched campaign data
 */
interface MatchedCampaignData {
  campaign_id: string;
  crop: CropType;
  zone: Zone | ''; // Empty string for company-wide campaigns from PICOS
  production_kg: number;
  workers_hired: number;
  ratio: number;
  campaign_start: Date;
  campaign_end: Date;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Minimum sample size for a ratio to be considered reliable
 */
const MIN_SAMPLE_SIZE = 3;

/**
 * Working days per week (Peru: Monday-Saturday)
 */
const WORKING_DAYS_PER_WEEK = 6;

/**
 * Minimum confidence threshold for using historical ratio
 */
const MIN_CONFIDENCE_THRESHOLD = 0.5;

/**
 * Sanity bounds for labor ratios (kg per worker per day)
 * Based on actual crop productivity ranges in Peru agriculture.
 * Ratios outside this range are likely data errors and are discarded.
 */
const RATIO_BOUNDS = {
  min: 5,   // Below 5 kg/worker/day is unrealistically low
  max: 200, // Above 200 kg/worker/day is unrealistically high
} as const;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calculate mean of an array of numbers
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calculate standard deviation of an array of numbers
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Parse date string to Date object (handles ISO and various formats)
 */
function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parsed = new Date(dateStr);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Get ISO week number from a date
 */
function getISOWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
}

/**
 * Check if two date ranges overlap
 */
function datesOverlap(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): boolean {
  return start1 <= end2 && end1 >= start2;
}

/**
 * Calculate the number of overlapping days between two date ranges
 */
function getOverlapDays(
  start1: Date,
  end1: Date,
  start2: Date,
  end2: Date
): number {
  const overlapStart = new Date(Math.max(start1.getTime(), start2.getTime()));
  const overlapEnd = new Date(Math.min(end1.getTime(), end2.getTime()));
  const diffTime = overlapEnd.getTime() - overlapStart.getTime();
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
  return Math.max(0, diffDays);
}

/**
 * Calculate confidence score based on sample size and coefficient of variation
 */
function calculateConfidence(sampleSize: number, stdDev: number, mean: number): number {
  // Base confidence from sample size (logarithmic scale)
  const sizeConfidence = Math.min(1, Math.log10(sampleSize + 1) / Math.log10(20));

  // Variance penalty (coefficient of variation)
  const cv = mean > 0 ? stdDev / mean : 1;
  const variancePenalty = Math.max(0, 1 - cv);

  // Combined confidence (weighted average)
  return sizeConfidence * 0.6 + variancePenalty * 0.4;
}

// =============================================================================
// MAIN FUNCTIONS
// =============================================================================

/**
 * Match campaigns with positions using DIRECT LINKING (preferred) or date overlap (fallback)
 *
 * DIRECT MATCHING (NEW):
 * Uses zone + week_number + crop to exactly match positions to campaigns.
 * This data comes from Excel CONSOLIDADO fields: DSUBDIVISION, SEMANA INICIO, CULTIVO
 *
 * FALLBACK MATCHING (LEGACY):
 * For positions without week_number/crop, uses zone + date overlap.
 * This is the old behavior kept for backward compatibility.
 *
 * @param campaigns - Array of campaigns (from campaigns table)
 * @param positions - Array of positions (from positions table)
 * @returns Array of matched campaign data with calculated ratios
 */
export function matchCampaignsWithPositions(
  campaigns: Campaign[],
  positions: Position[]
): MatchedCampaignData[] {
  const matches: MatchedCampaignData[] = [];

  // Filter completed campaigns with valid data
  // SKIP PINA: Omitted from algorithm due to uncertain data
  const validCampaigns = campaigns.filter(
    (c) =>
      c.status === 'completed' &&
      c.production_kg > 0 &&
      c.start_date &&
      c.end_date &&
      !c.deleted_at &&
      c.crop?.toLowerCase().trim() !== 'pina' // Skip PINA entirely
  );

  // Filter filled positions with valid data
  // Note: closed_at may be null for CUBIERTO positions imported from CONSOLIDADO
  // that don't have fecha_ingreso. We still count them as filled if status='filled'.
  const filledPositions = positions.filter(
    (p) =>
      p.status === 'filled' &&
      p.filled_count > 0 &&
      p.opened_at &&
      !p.deleted_at
  );

  // Separate positions by crop type:
  // 1. Direct link positions: have week_number + specific crop (arandano, esparrago, etc.)
  // 2. Indirect positions: crop="indirecto" or "especialidades" - support workers to distribute
  // 3. Fallback positions: no week/crop data - use date-based matching
  const INDIRECT_CROPS = ['indirecto', 'especialidades'];

  const directLinkPositions = filledPositions.filter(
    (p) => {
      if (p.week_number === null || p.week_number === undefined) return false;
      if (p.crop === null || p.crop === undefined) return false;
      const cropLower = typeof p.crop === 'string' ? p.crop.toLowerCase().trim() : '';
      return cropLower && !INDIRECT_CROPS.includes(cropLower);
    }
  );

  // OPTION B: "Indirecto" positions - support workers that should be distributed across crops
  // These are positions where crop="indirecto" (553 positions) or "especialidades" (3 positions)
  // They represent support labor that works across all crops in a region
  const indirectPositions = filledPositions.filter(
    (p) => {
      if (!p.zone) return false; // Need zone to distribute
      const cropLower = typeof p.crop === 'string' ? p.crop.toLowerCase().trim() : '';
      return INDIRECT_CROPS.includes(cropLower);
    }
  );

  const fallbackPositions = filledPositions.filter(
    (p) => {
      if (p.week_number === null || p.week_number === undefined || p.crop === null || p.crop === undefined) {
        return true;
      }
      const cropLower = typeof p.crop === 'string' ? p.crop.toLowerCase().trim() : '';
      // Already handled by directLink or indirect
      return !cropLower || (!INDIRECT_CROPS.includes(cropLower) && false);
    }
  ).filter(p => p.week_number === null || p.week_number === undefined || p.crop === null || p.crop === undefined);

  // Debug logging
  if (validCampaigns.length > 0) {
    const c = validCampaigns[0];
  }
  if (filledPositions.length > 0) {
    const p = filledPositions[0];
    const pYear = p.opened_at ? new Date(p.opened_at).getFullYear() : null;
  }

  for (const campaign of validCampaigns) {
    const campaignStart = parseDate(campaign.start_date);
    const campaignEnd = parseDate(campaign.end_date);

    if (!campaignStart || !campaignEnd) continue;

    // Normalize campaign crop for matching
    // Zone can be empty for company-wide campaigns from PICOS
    const campaignCrop = campaign.crop?.toLowerCase().trim();
    if (!campaignCrop) continue; // Crop is required

    let totalWorkersHired = 0;
    let positionsMatched = 0;

    // ========================================================================
    // ALL CROPS: Use regional distribution to match positions
    // PICOS data is company-wide (no zone breakdown per crop)
    // Maps positions by region using ZONE_TO_REGION and CROP_ZONE_DISTRIBUTION
    // ========================================================================
    const cropDistribution = CROP_ZONE_DISTRIBUTION[campaignCrop];
    if (!cropDistribution) {
      // Crop not in distribution table - skip this campaign
      // Log for debugging (helps identify missing crops in CROP_ZONE_DISTRIBUTION)
      continue;
    }

    // For each position with direct linking (week_number + crop), check regional match
    for (const position of directLinkPositions) {
      const positionCrop = typeof position.crop === 'string'
        ? position.crop.toLowerCase().trim()
        : null;
      if (!positionCrop || positionCrop !== campaignCrop) continue;

      // Map position zone to region
      const positionZoneUpper = position.zone?.toUpperCase().trim();
      if (!positionZoneUpper) continue;
      const positionRegion = ZONE_TO_REGION[positionZoneUpper];
      if (!positionRegion) continue; // Unknown zone - skip

      // Get this region's share of the crop distribution
      const regionShare = cropDistribution[positionRegion];
      if (!regionShare || regionShare <= 0) continue; // Region doesn't produce this crop

      // Week validation (ignore year - we want to match seasonal patterns across years)
      // e.g., Week 10 of 2025 positions informs Week 10 of 2026 campaigns
      if (position.week_number !== campaign.week_number) continue;

      // NOTE: Removed year validation - historical positions from previous years
      // should inform future campaigns for the same week number

      // Count workers from producing regions
      // All workers in producing regions contribute to the total
      totalWorkersHired += position.filled_count;
      positionsMatched++;
    }

    // ========================================================================
    // OPTION B: Distribute "indirecto" positions proportionally across crops
    // ========================================================================
    // Indirect workers (support labor) are distributed based on:
    // 1. Position zone -> Region mapping
    // 2. Region's share of the campaign crop (from CROP_ZONE_DISTRIBUTION)
    // Example: Position in TRUJILLO (La Libertad), crop=arandano (70% in La Libertad)
    //          -> This region produces 70% of arandano, so add 70% of workers
    for (const position of indirectPositions) {
      if (!position.zone) continue;

      // Map position zone to region
      const positionZoneUpper = position.zone.toUpperCase().trim();
      const positionRegion = ZONE_TO_REGION[positionZoneUpper];
      if (!positionRegion) continue; // Unknown zone - skip

      // Check if this region produces the campaign crop
      const regionShare = cropDistribution[positionRegion];
      if (!regionShare || regionShare <= 0) continue; // Region doesn't produce this crop

      // Get position week for matching (use week_number if available, else derive from opened_at)
      let positionWeek: number | null = null;
      if (position.week_number !== null && position.week_number !== undefined) {
        positionWeek = position.week_number;
      } else if (position.opened_at) {
        const positionStart = parseDate(position.opened_at);
        if (positionStart) {
          positionWeek = getISOWeek(positionStart);
        }
      }

      // Match by week (if we have week info)
      if (positionWeek !== null && campaign.week_number && positionWeek !== campaign.week_number) {
        continue;
      }

      // Distribute workers proportionally based on region's share of crop production
      // e.g., If La Libertad produces 70% of arandano, and position has 10 workers,
      //       add 10 * 0.70 = 7 workers to the arandano campaign
      const distributedWorkers = position.filled_count * regionShare;
      totalWorkersHired += distributedWorkers;
      positionsMatched++;
    }

    // Fallback for positions without week/crop data (legacy data)
    // Use week-of-year matching to handle cross-year scenarios (2025 positions → 2026 campaigns)
    for (const position of fallbackPositions) {
      if (!position.zone) continue;

      // Map position zone to region
      const positionZoneUpper = position.zone.toUpperCase().trim();
      const positionRegion = ZONE_TO_REGION[positionZoneUpper];
      if (!positionRegion) continue;

      // Check if region produces this crop
      const regionShare = cropDistribution[positionRegion];
      if (!regionShare || regionShare <= 0) continue;

      const positionStart = parseDate(position.opened_at);
      if (!positionStart) continue;

      // Match by week-of-year (seasonal pattern matching across years)
      // Get ISO week number for the position
      const positionWeek = getISOWeek(positionStart);

      // Campaign week comes from week_number field (from PICOS)
      if (campaign.week_number && positionWeek !== campaign.week_number) continue;

      // Count workers (no pro-rating needed for week-based matching)
      totalWorkersHired += position.filled_count;
      positionsMatched++;
    }

    // Only include if we found matching positions
    // BUG FIX #3: Skip insignificant matches where fractional workers cause ratio explosion
    // If totalWorkersHired < 1, the ratio becomes 5x+ the actual value
    if (totalWorkersHired >= 1 && positionsMatched > 0) {
      // Calculate working days in the campaign period
      const campaignDays = Math.ceil(
        (campaignEnd.getTime() - campaignStart.getTime()) / (1000 * 60 * 60 * 24)
      ) + 1;

      // Calculate kg per worker per day
      // Formula: production_kg / (workers * working_days)
      const workingDays = Math.ceil(campaignDays * (WORKING_DAYS_PER_WEEK / 7));
      const ratio = campaign.production_kg / (totalWorkersHired * workingDays);

      matches.push({
        campaign_id: campaign.id,
        crop: campaign.crop as CropType,
        zone: (campaign.zone || '') as Zone | '', // Empty string for company-wide campaigns
        production_kg: campaign.production_kg,
        workers_hired: Math.round(totalWorkersHired),
        ratio: ratio,
        campaign_start: campaignStart,
        campaign_end: campaignEnd,
      });
    }
  }

  return matches;
}

/**
 * Calculate labor ratios from matched campaign data
 *
 * Groups matched data by crop and zone, calculates statistics,
 * and returns ratios with confidence scores.
 *
 * @param matchedData - Array of matched campaign data
 * @returns Record of crop to LaborRatio
 */
export function calculateLaborRatios(
  matchedData: MatchedCampaignData[]
): Record<CropType, LaborRatio> {
  const result: Record<CropType, LaborRatio> = {} as Record<CropType, LaborRatio>;

  // Initialize with default values for all crop types
  for (const cropKey of Object.keys(CROP_TYPES) as CropType[]) {
    const defaultKgPerWorker = CROP_TYPES[cropKey].kg_per_worker_day;
    result[cropKey] = {
      crop: cropKey,
      zone: null,
      kg_per_worker_day: defaultKgPerWorker,
      sample_size: 0,
      confidence: 0,
      std_dev: 0,
      source: 'default',
      calculated_at: new Date().toISOString(),
    };
  }

  // BUG FIX #6: Initialize dynamically from CROP_TYPES instead of hardcoding
  // This ensures new crops added to CROP_TYPES are automatically supported
  const byCrop: Record<CropType, number[]> = {} as Record<CropType, number[]>;
  for (const cropKey of Object.keys(CROP_TYPES) as CropType[]) {
    byCrop[cropKey] = [];
  }

  for (const match of matchedData) {
    // BUG FIX #4: Sanity bounds were too permissive (0-1000)
    // 1000 kg/worker/day is absurd - realistic range is 5-200 based on actual crop productivity
    // - Asparagus: 15-40 kg/worker/day
    // - Blueberry: 8-25 kg/worker/day
    // - Avocado: 30-80 kg/worker/day
    // - Grape: 50-150 kg/worker/day
    if (match.ratio > RATIO_BOUNDS.min && match.ratio < RATIO_BOUNDS.max) {
      byCrop[match.crop].push(match.ratio);
    }
  }

  // Calculate statistics for each crop
  for (const cropKey of Object.keys(byCrop) as CropType[]) {
    const ratios = byCrop[cropKey];

    if (ratios.length >= MIN_SAMPLE_SIZE) {
      const avgRatio = mean(ratios);
      const stdDev = standardDeviation(ratios);
      const confidence = calculateConfidence(ratios.length, stdDev, avgRatio);

      // Only use historical ratio if confidence is above threshold
      if (confidence >= MIN_CONFIDENCE_THRESHOLD) {
        result[cropKey] = {
          crop: cropKey,
          zone: null,
          kg_per_worker_day: Math.round(avgRatio * 10) / 10, // Round to 1 decimal
          sample_size: ratios.length,
          confidence: Math.round(confidence * 100) / 100,
          std_dev: Math.round(stdDev * 10) / 10,
          source: 'historical',
          calculated_at: new Date().toISOString(),
        };
      }
    }
  }

  return result;
}

/**
 * Calculate labor ratios by crop and zone combination
 *
 * More granular than crop-only ratios, useful for zones with
 * different productivity levels.
 *
 * @param matchedData - Array of matched campaign data
 * @returns Record of crop_zone key to LaborRatio
 */
export function calculateLaborRatiosByZone(
  matchedData: MatchedCampaignData[]
): Record<string, LaborRatio> {
  const result: Record<string, LaborRatio> = {};

  // Group matched data by crop+zone
  const byCropZone: Record<string, { crop: CropType; zone: Zone | ''; ratios: number[] }> = {};

  for (const match of matchedData) {
    const key = `${match.crop}_${match.zone}`;
    if (!byCropZone[key]) {
      byCropZone[key] = { crop: match.crop, zone: match.zone, ratios: [] };
    }
    // BUG FIX #4: Apply same realistic sanity bounds (5-200 kg/worker/day)
    if (match.ratio > RATIO_BOUNDS.min && match.ratio < RATIO_BOUNDS.max) {
      byCropZone[key].ratios.push(match.ratio);
    }
  }

  // Calculate statistics for each crop+zone combination
  for (const [key, data] of Object.entries(byCropZone)) {
    const { crop, zone, ratios } = data;

    if (ratios.length >= MIN_SAMPLE_SIZE) {
      const avgRatio = mean(ratios);
      const stdDev = standardDeviation(ratios);
      const confidence = calculateConfidence(ratios.length, stdDev, avgRatio);

      if (confidence >= MIN_CONFIDENCE_THRESHOLD) {
        result[key] = {
          crop,
          zone,
          kg_per_worker_day: Math.round(avgRatio * 10) / 10,
          sample_size: ratios.length,
          confidence: Math.round(confidence * 100) / 100,
          std_dev: Math.round(stdDev * 10) / 10,
          source: 'historical',
          calculated_at: new Date().toISOString(),
        };
      }
    }
  }

  return result;
}

/**
 * Main function to calculate all labor ratios from historical data
 *
 * @param input - Campaigns and positions data
 * @returns Complete labor ratio result with data quality metrics
 */
export function calculateHistoricalLaborRatios(
  input: LaborRatioInput
): LaborRatioResult {
  const { campaigns, positions } = input;

  // Match campaigns with positions
  const matchedData = matchCampaignsWithPositions(campaigns, positions);

  // Calculate ratios by crop
  const byCrop = calculateLaborRatios(matchedData);

  // Calculate ratios by crop+zone
  const byCropZone = calculateLaborRatiosByZone(matchedData);

  // Calculate overall average from all matched data
  // BUG FIX #4: Apply same realistic sanity bounds (5-200 kg/worker/day)
  const allRatios = matchedData
    .map((m) => m.ratio)
    .filter((r) => r > 5 && r < 200);
  const overallAverage = allRatios.length > 0 ? mean(allRatios) : 50; // Default fallback

  // Count campaigns with valid data
  const completedCampaigns = campaigns.filter(
    (c) => c.status === 'completed' && c.production_kg > 0
  ).length;

  return {
    by_crop: byCrop,
    by_crop_zone: byCropZone,
    overall_average: Math.round(overallAverage * 10) / 10,
    data_quality: {
      total_campaigns_analyzed: completedCampaigns,
      campaigns_with_matches: matchedData.length,
      total_positions_matched: matchedData.reduce((sum, m) => sum + m.workers_hired, 0),
      coverage_percent:
        completedCampaigns > 0
          ? Math.round((matchedData.length / completedCampaigns) * 100)
          : 0,
    },
  };
}

/**
 * Get the best available labor ratio for a crop/zone combination
 *
 * Fallback order:
 * 1. Historical ratio for exact crop+zone
 * 2. Historical ratio for crop (any zone)
 * 3. Default constant from CROP_TYPES
 *
 * @param crop - Crop type
 * @param zone - Zone (optional)
 * @param ratios - Calculated labor ratios
 * @returns Labor ratio to use
 */
export function getLaborRatio(
  crop: CropType,
  zone: Zone | null,
  ratios: LaborRatioResult
): LaborRatio {
  // Try crop+zone specific ratio first
  if (zone) {
    const zoneKey = `${crop}_${zone}`;
    if (ratios.by_crop_zone[zoneKey]) {
      return ratios.by_crop_zone[zoneKey];
    }
  }

  // Try crop-level ratio
  if (ratios.by_crop[crop] && ratios.by_crop[crop].source === 'historical') {
    return ratios.by_crop[crop];
  }

  // Fall back to default
  return {
    crop,
    zone: null,
    kg_per_worker_day: CROP_TYPES[crop].kg_per_worker_day,
    sample_size: 0,
    confidence: 0,
    std_dev: 0,
    source: 'default',
    calculated_at: new Date().toISOString(),
  };
}

/**
 * Calculate workers needed based on production and labor ratio
 *
 * @param production_kg - Production in kg
 * @param kg_per_worker_day - Labor productivity ratio
 * @param days - Number of working days
 * @returns Number of workers needed
 */
export function calculateWorkersNeeded(
  production_kg: number,
  kg_per_worker_day: number,
  days: number = WORKING_DAYS_PER_WEEK
): number {
  if (kg_per_worker_day <= 0 || days <= 0) return 0;
  return Math.ceil(production_kg / (kg_per_worker_day * days));
}
