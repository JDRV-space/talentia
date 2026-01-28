/**
 * Case Priority Algorithm for Talentia
 *
 * This module implements the priority scoring engine for the Asignaciones page.
 * It calculates a 0-1000 score for each position to help Talentia see urgent cases first.
 *
 * Algorithm derived from @tot analysis (score 16/20):
 * - Urgency (40%): days_elapsed / sla_days * 400
 * - Capability match (20%): recruiter level vs position level (200/150/50)
 * - Position value (15%): position_level * 18.75
 * - Volume pressure (15%): high-volume positions get steady attention
 * - Campaign multiplier: 1.2x during active campaigns (arandano Jul-Dec, pimiento Feb-Dec)
 *
 * Queue Classification:
 * - Critical: SLA >80% consumed OR <2 days left
 * - Tecnicos: position level 1-2 (operario, auxiliar)
 * - Empleados: position level 3+ (asistente and above)
 */

import type { Position, Recruiter } from '@/types/database';
import { SLA_BY_CAPABILITY, POSITION_LEVEL_MAP } from '@/types/constants';
import type { CapabilityLevel } from '@/types/constants';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Queue classification for UI display
 */
export type QueueType = 'critical' | 'tecnicos' | 'empleados';

/**
 * Priority result for a single position
 */
export interface PriorityResult {
  score: number; // 0-1000
  queue: QueueType;
  breakdown: PriorityBreakdown;
  explanation_es: string;
}

/**
 * Breakdown of priority score components
 */
export interface PriorityBreakdown {
  urgency: number; // 0-400
  capability_match: number; // 0-200
  position_value: number; // 0-150
  volume_pressure: number; // 0-150
  campaign_multiplier: number; // 1.0 or 1.2
  raw_score: number; // before multiplier
  final_score: number; // after multiplier
}

/**
 * Position with priority data for API response
 */
export interface PrioritizedPosition {
  position: Position;
  priority_score: number;
  queue: QueueType;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Queue labels for UI display (Spanish)
 */
export const QUEUE_LABELS: Record<QueueType, { label: string; color: string; description: string }> = {
  critical: {
    label: 'Critico',
    color: 'rose',
    description: 'Prioridad P1 (Urgente)',
  },
  tecnicos: {
    label: 'Tecnicos',
    color: 'amber',
    description: 'Operarios y auxiliares (nivel 1-2)',
  },
  empleados: {
    label: 'Empleados',
    color: 'teal',
    description: 'Asistentes y superiores (nivel 3+)',
  },
};

/**
 * Weight constants for the priority formula
 */
const PRIORITY_WEIGHTS = {
  urgency: 400, // 40%
  capability_match: 200, // 20%
  position_value: 150, // 15%
  volume_pressure: 150, // 15%
} as const;

/**
 * Campaign season definitions
 * Campaigns during active seasons get 1.2x multiplier
 */
const CAMPAIGN_SEASONS: Record<string, { months: number[] }> = {
  arandano: { months: [7, 8, 9, 10, 11, 12] }, // Jul-Dec
  pimiento: { months: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] }, // Feb-Dec
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Extract capability level from position's level field
 * Maps string level to numeric 1-8
 */
function getPositionCapabilityLevel(position: Position): number {
  const normalizedLevel = position.level?.toLowerCase().trim() ?? 'operario';
  return POSITION_LEVEL_MAP[normalizedLevel] ?? 1;
}

/**
 * Get SLA days for a position based on its capability level
 */
function getPositionSLA(position: Position): number {
  // Use sla_days from position if set, otherwise derive from capability
  if (position.sla_days && position.sla_days > 0) {
    return position.sla_days;
  }

  const level = getPositionCapabilityLevel(position) as CapabilityLevel;
  return SLA_BY_CAPABILITY[level] ?? 7;
}

/**
 * Calculate days elapsed since position opened
 */
function calculateDaysElapsed(openedAt: string): number {
  const opened = new Date(openedAt);
  const now = new Date();
  const diffMs = now.getTime() - opened.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * Calculate days remaining until SLA deadline
 */
function calculateDaysRemaining(position: Position): number {
  if (position.sla_deadline) {
    const deadline = new Date(position.sla_deadline);
    const now = new Date();
    const diffMs = deadline.getTime() - now.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24));
  }

  // Fallback: calculate from opened_at + sla_days
  const sla = getPositionSLA(position);
  const daysElapsed = calculateDaysElapsed(position.opened_at);
  return sla - daysElapsed;
}

/**
 * Calculate SLA consumption percentage (0 to >1)
 */
function calculateSLAConsumption(position: Position): number {
  const sla = getPositionSLA(position);
  if (sla <= 0) return 1;

  const daysElapsed = calculateDaysElapsed(position.opened_at);
  return daysElapsed / sla;
}

/**
 * Check if a crop is in its active campaign season
 */
function isActiveCampaignSeason(crop: string | null): boolean {
  if (!crop) return false;

  const normalizedCrop = crop.toLowerCase();
  const season = CAMPAIGN_SEASONS[normalizedCrop];
  if (!season) return false;

  const currentMonth = new Date().getMonth() + 1; // 1-12
  return season.months.includes(currentMonth);
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calculate urgency score (0-400)
 * Formula: (days_elapsed / sla_days) * 400
 * Capped at 400 (can exceed SLA but score stays at max)
 */
function calculateUrgencyScore(position: Position): number {
  const slaConsumption = calculateSLAConsumption(position);
  // Cap at 1.0 for scoring (but SLA can still be exceeded)
  const normalizedConsumption = Math.min(1.0, slaConsumption);
  return Math.round(normalizedConsumption * PRIORITY_WEIGHTS.urgency);
}

/**
 * Calculate capability match score (0-200)
 * - 200: recruiter level >= required level (perfect match)
 * - 150: recruiter level == required level - 1 (close match)
 * - 50: recruiter level < required level - 1 (poor match)
 *
 * If no recruiter is assigned, returns 100 (neutral)
 */
function calculateCapabilityMatchScore(
  position: Position,
  recruiter: Recruiter | null
): number {
  if (!recruiter) {
    // No recruiter assigned - neutral score
    return 100;
  }

  const requiredLevel = getPositionCapabilityLevel(position);
  const recruiterLevel = recruiter.capability_level;

  if (recruiterLevel >= requiredLevel) {
    return 200; // Perfect match
  }

  if (recruiterLevel === requiredLevel - 1) {
    return 150; // Close match
  }

  return 50; // Poor match
}

/**
 * Calculate position value score (0-150)
 * Formula: position_level * 18.75
 * Higher level positions = higher value
 */
function calculatePositionValueScore(position: Position): number {
  const level = getPositionCapabilityLevel(position);
  // level 1-8, * 18.75 = 18.75 to 150
  return Math.round(level * 18.75);
}

/**
 * Calculate volume pressure score (0-150)
 * High-volume positions (headcount > 1) need steady attention
 * Formula: min(headcount / 5, 1) * 150
 */
function calculateVolumePressureScore(position: Position): number {
  const headcount = position.headcount || 1;
  // Normalize: 5+ vacancies = full score
  const volumeFactor = Math.min(headcount / 5, 1);
  return Math.round(volumeFactor * PRIORITY_WEIGHTS.volume_pressure);
}

/**
 * Get campaign multiplier (1.0 or 1.2)
 */
function getCampaignMultiplier(position: Position): number {
  if (isActiveCampaignSeason(position.crop)) {
    return 1.2;
  }
  return 1.0;
}

// =============================================================================
// QUEUE CLASSIFICATION
// =============================================================================

/**
 * Classify a position into a queue
 *
 * Queue logic:
 * - Critical: P1 (Urgente) priority positions - business-defined urgency
 * - Tecnicos: Level 1-2 (operario, auxiliar) - field workers
 * - Empleados: Level 3+ (asistente and above) - office/admin workers
 *
 * Note: We use the position's priority field (set by business) rather than
 * SLA consumption because most positions are already overdue and SLA math
 * would mark everything as critical.
 */
export function classifyQueue(position: Position): QueueType {
  // Critical = P1 (Urgente) positions - these are business-critical
  if (position.priority === 'P1') {
    return 'critical';
  }

  // Queue by position level
  const level = getPositionCapabilityLevel(position);
  if (level <= 2) {
    return 'tecnicos'; // Operario (1) or Auxiliar (2)
  }

  return 'empleados'; // Asistente (3) and above
}

// =============================================================================
// MAIN PRIORITY FUNCTION
// =============================================================================

/**
 * Calculate priority score for a position
 *
 * @param position - The position to score
 * @param recruiter - The currently assigned recruiter (optional)
 * @returns Priority result with score (0-1000), queue, breakdown, and explanation
 */
export function calculatePriorityScore(
  position: Position,
  recruiter: Recruiter | null = null
): PriorityResult {
  // Calculate component scores
  const urgency = calculateUrgencyScore(position);
  const capability_match = calculateCapabilityMatchScore(position, recruiter);
  const position_value = calculatePositionValueScore(position);
  const volume_pressure = calculateVolumePressureScore(position);
  const campaign_multiplier = getCampaignMultiplier(position);

  // Calculate raw score (before multiplier)
  const raw_score = urgency + capability_match + position_value + volume_pressure;

  // Apply campaign multiplier
  const final_score = Math.min(1000, Math.round(raw_score * campaign_multiplier));

  // Classify queue
  const queue = classifyQueue(position);

  // Build breakdown
  const breakdown: PriorityBreakdown = {
    urgency,
    capability_match,
    position_value,
    volume_pressure,
    campaign_multiplier,
    raw_score,
    final_score,
  };

  // Generate explanation
  const explanation_es = generateExplanation(position, recruiter, breakdown, queue);

  return {
    score: final_score,
    queue,
    breakdown,
    explanation_es,
  };
}

/**
 * Generate Spanish explanation for priority score
 */
function generateExplanation(
  position: Position,
  recruiter: Recruiter | null,
  breakdown: PriorityBreakdown,
  queue: QueueType
): string {
  const parts: string[] = [];
  const slaConsumption = calculateSLAConsumption(position);
  const slaPercent = Math.round(slaConsumption * 100);
  const daysElapsed = calculateDaysElapsed(position.opened_at);
  const level = getPositionCapabilityLevel(position);

  // Queue indicator
  const queueLabel = QUEUE_LABELS[queue].label;
  parts.push(`[${queueLabel.toUpperCase()}]`);

  // Urgency
  if (slaConsumption > 1) {
    parts.push(`SLA vencido (${slaPercent}%, ${daysElapsed} dias)`);
  } else if (slaConsumption > 0.8) {
    parts.push(`SLA critico (${slaPercent}%)`);
  } else {
    parts.push(`SLA ${slaPercent}%`);
  }

  // Position level
  const levelLabel = position.level || 'operario';
  parts.push(`nivel ${level} (${levelLabel})`);

  // Volume
  if (position.headcount > 1) {
    parts.push(`${position.headcount} vacantes`);
  }

  // Campaign multiplier
  if (breakdown.campaign_multiplier > 1) {
    parts.push(`campana activa (x${breakdown.campaign_multiplier})`);
  }

  // Recruiter match
  if (recruiter) {
    if (breakdown.capability_match === 200) {
      parts.push(`match perfecto con ${recruiter.name}`);
    } else if (breakdown.capability_match === 150) {
      parts.push(`match cercano con ${recruiter.name}`);
    } else {
      parts.push(`match bajo con ${recruiter.name}`);
    }
  }

  return `Prioridad ${breakdown.final_score}: ${parts.join(', ')}.`;
}

// =============================================================================
// BATCH OPERATIONS
// =============================================================================

/**
 * Get prioritized positions sorted by score
 *
 * @param positions - List of positions to prioritize
 * @param recruitersMap - Map of recruiter_id to Recruiter (for capability matching)
 * @returns Positions sorted by priority score DESC with priority data
 */
export function getPrioritizedPositions(
  positions: Position[],
  recruitersMap: Map<string, Recruiter> = new Map()
): PrioritizedPosition[] {
  const prioritized = positions.map((position) => {
    const recruiter = position.recruiter_id
      ? recruitersMap.get(position.recruiter_id) ?? null
      : null;

    const result = calculatePriorityScore(position, recruiter);

    return {
      position,
      priority_score: result.score,
      queue: result.queue,
    };
  });

  // Sort by priority score DESC
  prioritized.sort((a, b) => b.priority_score - a.priority_score);

  return prioritized;
}

/**
 * Interleave positions by queue using 2:1:1 ratio
 * (Critical : Tecnicos : Empleados)
 *
 * @param prioritized - Sorted prioritized positions
 * @returns Interleaved positions maintaining relative priority within each queue
 */
export function interleaveByQueue(
  prioritized: PrioritizedPosition[]
): PrioritizedPosition[] {
  // Separate by queue (already sorted by priority within each)
  const critical = prioritized.filter((p) => p.queue === 'critical');
  const tecnicos = prioritized.filter((p) => p.queue === 'tecnicos');
  const empleados = prioritized.filter((p) => p.queue === 'empleados');

  const result: PrioritizedPosition[] = [];
  let ci = 0, ti = 0, ei = 0;
  let cycle = 0;

  // 2:1:1 interleaving
  while (ci < critical.length || ti < tecnicos.length || ei < empleados.length) {
    const position = cycle % 4;

    if (position < 2) {
      // Critical slots (0, 1)
      if (ci < critical.length) {
        result.push(critical[ci++]);
      } else if (ti < tecnicos.length) {
        result.push(tecnicos[ti++]);
      } else if (ei < empleados.length) {
        result.push(empleados[ei++]);
      }
    } else if (position === 2) {
      // Tecnicos slot
      if (ti < tecnicos.length) {
        result.push(tecnicos[ti++]);
      } else if (ci < critical.length) {
        result.push(critical[ci++]);
      } else if (ei < empleados.length) {
        result.push(empleados[ei++]);
      }
    } else {
      // Empleados slot (position === 3)
      if (ei < empleados.length) {
        result.push(empleados[ei++]);
      } else if (ci < critical.length) {
        result.push(critical[ci++]);
      } else if (ti < tecnicos.length) {
        result.push(tecnicos[ti++]);
      }
    }

    cycle++;
  }

  return result;
}

/**
 * Get queue statistics for a list of positions
 */
export function getQueueStats(
  prioritized: PrioritizedPosition[]
): Record<QueueType, number> {
  return {
    critical: prioritized.filter((p) => p.queue === 'critical').length,
    tecnicos: prioritized.filter((p) => p.queue === 'tecnicos').length,
    empleados: prioritized.filter((p) => p.queue === 'empleados').length,
  };
}
