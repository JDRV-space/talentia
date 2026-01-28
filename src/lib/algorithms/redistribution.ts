/**
 * Algoritmo de Redistribución de Carga de Trabajo para Talentia Recruitment SaaS
 *
 * Este módulo implementa la lógica para proponer redistribuciones de casos
 * entre reclutadores sobrecargados y aquellos con capacidad disponible.
 *
 * Criterios:
 * - Sobrecargado: >= 13 casos activos
 * - Capacidad disponible: < 10 casos activos
 * - Preferencia: Misma zona primaria
 */

// =============================================================================
// TYPES
// =============================================================================

export interface RecruiterForRedistribution {
  id: string;
  name: string;
  primary_zone: string;
  secondary_zones: string[];
  current_load: number;
  capacity: number;
  is_active: boolean;
}

export interface RedistributionMove {
  from_recruiter_id: string;
  from_recruiter_name: string;
  to_recruiter_id: string;
  to_recruiter_name: string;
  cases_to_move: number;
  zone_match: boolean; // true if same zone
  from_zone: string;
  to_zone: string;
}

export interface RedistributionProposal {
  is_balanced: boolean;
  moves: RedistributionMove[];
  summary: {
    total_cases_to_move: number;
    overloaded_count: number;
    available_count: number;
  };
}

// =============================================================================
// CONSTANTS
// =============================================================================

/** Threshold for considering a recruiter overloaded */
const OVERLOAD_THRESHOLD = 13;

/** Threshold for considering a recruiter has available capacity */
const AVAILABLE_THRESHOLD = 10;

/** Ideal target load after redistribution */
const TARGET_LOAD = 10;

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Checks if two recruiters share a zone (primary or secondary)
 */
function sharesZone(
  recruiter1: RecruiterForRedistribution,
  recruiter2: RecruiterForRedistribution
): boolean {
  // Check if recruiter2's primary zone matches recruiter1's zones
  const recruiter1Zones = [recruiter1.primary_zone, ...(recruiter1.secondary_zones || [])];
  const recruiter2Zones = [recruiter2.primary_zone, ...(recruiter2.secondary_zones || [])];

  return (
    recruiter1Zones.includes(recruiter2.primary_zone) ||
    recruiter2Zones.includes(recruiter1.primary_zone)
  );
}

// =============================================================================
// MAIN ALGORITHM
// =============================================================================

/**
 * Calculates a redistribution proposal for the given recruiters
 *
 * Algorithm:
 * 1. Identify overloaded recruiters (>= OVERLOAD_THRESHOLD)
 * 2. Identify recruiters with available capacity (< AVAILABLE_THRESHOLD)
 * 3. For each overloaded recruiter:
 *    a. Calculate how many cases to move (to reach TARGET_LOAD)
 *    b. Find best match among available recruiters (prefer same zone)
 *    c. Create move proposal
 *
 * @param recruiters - List of recruiters with their current load
 * @returns Redistribution proposal with moves
 */
export function calculateRedistribution(
  recruiters: RecruiterForRedistribution[]
): RedistributionProposal {
  // Skip inactive recruiters (coordinators/leaders) from redistribution
  const eligibleRecruiters = recruiters.filter(
    (r) => r.is_active
  );

  // Identify overloaded and available recruiters
  const overloaded = eligibleRecruiters.filter(
    (r) => r.current_load >= OVERLOAD_THRESHOLD
  );
  const available = eligibleRecruiters.filter(
    (r) => r.current_load < AVAILABLE_THRESHOLD
  );

  // If no one is overloaded, load is balanced
  if (overloaded.length === 0) {
    return {
      is_balanced: true,
      moves: [],
      summary: {
        total_cases_to_move: 0,
        overloaded_count: 0,
        available_count: available.length,
      },
    };
  }

  // If no one has capacity, we cannot redistribute
  if (available.length === 0) {
    return {
      is_balanced: false,
      moves: [],
      summary: {
        total_cases_to_move: 0,
        overloaded_count: overloaded.length,
        available_count: 0,
      },
    };
  }

  const moves: RedistributionMove[] = [];

  // Create mutable copies for tracking remaining load/capacity
  const overloadedMutable = overloaded.map((r) => ({
    ...r,
    remaining_excess: r.current_load - TARGET_LOAD,
  }));

  const availableMutable = available.map((r) => ({
    ...r,
    remaining_capacity: AVAILABLE_THRESHOLD - r.current_load,
  }));

  // Sort overloaded by excess (highest first)
  overloadedMutable.sort((a, b) => b.remaining_excess - a.remaining_excess);

  // Sort available by capacity (highest first)
  availableMutable.sort((a, b) => b.remaining_capacity - a.remaining_capacity);

  // Match overloaded to available
  for (const source of overloadedMutable) {
    if (source.remaining_excess <= 0) continue;

    // Find best match (prefer same zone)
    const sameZoneTargets = availableMutable.filter(
      (t) => t.remaining_capacity > 0 && sharesZone(source, t)
    );
    const otherTargets = availableMutable.filter(
      (t) => t.remaining_capacity > 0 && !sharesZone(source, t)
    );

    // Try same zone first, then others
    const prioritizedTargets = [...sameZoneTargets, ...otherTargets];

    for (const target of prioritizedTargets) {
      if (source.remaining_excess <= 0) break;
      if (target.remaining_capacity <= 0) continue;

      const casesToMove = Math.min(source.remaining_excess, target.remaining_capacity);

      if (casesToMove > 0) {
        moves.push({
          from_recruiter_id: source.id,
          from_recruiter_name: source.name,
          to_recruiter_id: target.id,
          to_recruiter_name: target.name,
          cases_to_move: casesToMove,
          zone_match: sharesZone(source, target),
          from_zone: source.primary_zone,
          to_zone: target.primary_zone,
        });

        // Update remaining values
        source.remaining_excess -= casesToMove;
        target.remaining_capacity -= casesToMove;
      }
    }
  }

  const totalCasesToMove = moves.reduce((sum, m) => sum + m.cases_to_move, 0);

  return {
    is_balanced: false,
    moves,
    summary: {
      total_cases_to_move: totalCasesToMove,
      overloaded_count: overloaded.length,
      available_count: available.length,
    },
  };
}

/**
 * Returns a human-readable summary of the redistribution proposal
 */
export function getRedistributionSummary(proposal: RedistributionProposal): string {
  if (proposal.is_balanced) {
    return 'La carga de trabajo está balanceada. No se requiere redistribución.';
  }

  if (proposal.moves.length === 0) {
    return `Hay ${proposal.summary.overloaded_count} reclutador(es) sobrecargado(s) pero no hay capacidad disponible para redistribuir.`;
  }

  return `Se propone mover ${proposal.summary.total_cases_to_move} caso(s) de ${proposal.summary.overloaded_count} reclutador(es) sobrecargado(s) a ${proposal.summary.available_count} reclutador(es) con capacidad.`;
}
