/**
 * Algoritmo de Asignacion Automatica para Talentia
 *
 * Este modulo implementa el algoritmo de puntuacion y asignacion de reclutadores
 * a posiciones basado en pesos configurables.
 *
 * Pesos actuales:
 * - Zone match: 30%
 * - Level match: 30%
 * - Workload: 40% (lower load = higher score)
 */

import type {
  Recruiter,
  Position,
  Assignment,
  ScoreBreakdown,
} from '@/types/database';
import type { AssignmentType, RecruitmentStage } from '@/types/constants';
import {
  ASSIGNMENT_WEIGHTS,
  RECRUITER_HARD_CAP,
  PRIORITY_LEVELS,
  POSITION_LEVEL_MAP,
} from '@/types/constants';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Resultado de la puntuacion de un reclutador para una posicion
 */
export interface ScoringResult {
  score: number;
  breakdown: ScoreBreakdown;
  explanation_es: string;
}

/**
 * Resultado de buscar el mejor reclutador
 */
export interface BestRecruiterResult {
  recruiter: Recruiter;
  score: number;
  breakdown: ScoreBreakdown;
  explanation_es: string;
}

/**
 * Resultado de asignacion automatica para una posicion
 */
export interface AutoAssignmentResult {
  position_id: string;
  recruiter_id: string;
  score: number;
  score_breakdown: ScoreBreakdown;
  explanation_es: string;
  assignment_type: AssignmentType;
  assigned_at: string;
  status: 'assigned';
  current_stage: RecruitmentStage;
  stage_entered_at: string;
}

// =============================================================================
// SCORING FUNCTIONS
// =============================================================================

/**
 * Calcula el score de zona (0-1)
 * - 1.0 si la posicion esta en la zona principal del reclutador
 * - 0.5 si esta en una zona secundaria
 * - 0.0 si no hay match de zona
 */
function calculateZoneScore(
  recruiter: Recruiter,
  position: Position
): number {
  if (position.zone === recruiter.primary_zone) {
    return 1.0;
  }

  if (recruiter.secondary_zones?.includes(position.zone)) {
    return 0.5;
  }

  return 0.0;
}

/**
 * Get the effective capacity for a recruiter
 * Uses recruiter.capacity if set, otherwise falls back to RECRUITER_HARD_CAP
 */
function getRecruiterCapacity(recruiter: Recruiter): number {
  return recruiter.capacity ?? RECRUITER_HARD_CAP;
}

/**
 * Calcula el score de workload (0-1)
 * Lower load = higher score
 * - Formula: 1 - (current_load / recruiter_capacity)
 * - 0 si el reclutador esta en o sobre capacidad
 */
export function calculateWorkloadScore(recruiter: Recruiter): number {
  const capacity = getRecruiterCapacity(recruiter);
  const currentLoad = recruiter.current_load;

  if (currentLoad >= capacity) {
    return 0.0;
  }

  return 1.0 - (currentLoad / capacity);
}

/**
 * Extrae el nivel de capacidad de una posicion desde su campo level
 * Mapeo (8-level hierarchy):
 *   operario=1, auxiliar=2, asistente=3, analista=4,
 *   coordinador=5, jefe=6, subgerente=7, gerente=8
 *
 * NOTE: Legacy levels (tecnico, supervisor) are mapped for backward compatibility
 */
function getPositionCapabilityLevel(position: Position): number {
  const normalizedLevel = position.level?.toLowerCase().trim() ?? 'operario';
  return POSITION_LEVEL_MAP[normalizedLevel] ?? 1;
}

/**
 * Calcula el score de level (0-1)
 * Compares recruiter capability_level vs position required level
 * - 1.0 if recruiter level >= position level
 * - Penalty of 0.3 per level below required
 */
export function calculateLevelScore(
  recruiter: Recruiter,
  position: Position
): number {
  const positionLevel = getPositionCapabilityLevel(position);
  const recruiterLevel = recruiter.capability_level;

  if (recruiterLevel >= positionLevel) {
    return 1.0;
  }

  const gap = positionLevel - recruiterLevel;
  return Math.max(0, 1.0 - (gap * 0.3));
}

/**
 * Calcula el progreso del SLA de una posicion
 * Retorna un valor entre 0 y infinito (>1 significa vencido)
 */
function calculateSLAProgress(position: Position): number {
  if (!position.sla_deadline) {
    return 0;
  }

  const now = new Date();
  const deadline = new Date(position.sla_deadline);
  const opened = new Date(position.opened_at);

  const totalDuration = deadline.getTime() - opened.getTime();
  const elapsed = now.getTime() - opened.getTime();

  if (totalDuration <= 0) {
    return 1;
  }

  return elapsed / totalDuration;
}

/**
 * Aplica el multiplicador de urgencia al score final
 * - Si la posicion esta vencida (>100% SLA): multiplica por 1.5 para el top recruiter
 * - Si la posicion esta >50% del SLA: agrega 0.1 al score
 */
function applyUrgencyMultiplier(
  score: number,
  position: Position,
  isTopRecruiter: boolean
): number {
  const slaProgress = calculateSLAProgress(position);

  // Posicion vencida - boost significativo para el mejor reclutador
  if (slaProgress > 1.0 && isTopRecruiter) {
    return score * 1.5;
  }

  // Posicion en segunda mitad del SLA - pequeno boost
  if (slaProgress > 0.5) {
    return score + 0.1;
  }

  return score;
}

/**
 * Genera la explicacion en espanol del score
 * Updated for new weights: zone 30%, level 30%, workload 40%
 */
function generateExplanation(
  recruiter: Recruiter,
  position: Position,
  breakdown: ScoreBreakdown,
  finalScore: number
): string {
  const parts: string[] = [];
  const capacity = getRecruiterCapacity(recruiter);

  // Zona (30%)
  if (breakdown.zone === 1.0) {
    parts.push(`Zona: ${position.zone} (principal)`);
  } else if (breakdown.zone === 0.5) {
    parts.push(`Zona: ${position.zone} (secundaria)`);
  } else {
    parts.push(`Zona: ${position.zone} (no coincide)`);
  }

  // Level (30%)
  const requiredLevel = getPositionCapabilityLevel(position);
  if (breakdown.level === 1.0) {
    parts.push(`Nivel: ${recruiter.capability_level}>=${requiredLevel}`);
  } else {
    parts.push(`Nivel: ${recruiter.capability_level}<${requiredLevel}`);
  }

  // Workload (40%)
  const workloadPercent = Math.round(breakdown.workload * 100);
  parts.push(`Carga: ${recruiter.current_load}/${capacity} (${workloadPercent}% disp)`);

  return `${recruiter.name}: ${parts.join(' | ')} → ${Math.round(finalScore * 100)}%`;
}

// =============================================================================
// MAIN SCORING FUNCTION
// =============================================================================

/**
 * Puntua un reclutador para una posicion especifica
 *
 * @param recruiter - El reclutador a evaluar
 * @param position - La posicion a asignar
 * @returns El score, desglose y explicacion en espanol
 */
export function scoreRecruiter(
  recruiter: Recruiter,
  position: Position
): ScoringResult {
  // Calcular scores individuales
  const zoneScore = calculateZoneScore(recruiter, position);
  const levelScore = calculateLevelScore(recruiter, position);
  const workloadScore = calculateWorkloadScore(recruiter);

  // Crear breakdown
  const breakdown: ScoreBreakdown = {
    zone: zoneScore,
    level: levelScore,
    workload: workloadScore,
  };

  // Calcular score final ponderado (zone 30%, level 30%, workload 40%)
  const finalScore =
    zoneScore * ASSIGNMENT_WEIGHTS.zone +
    levelScore * ASSIGNMENT_WEIGHTS.level +
    workloadScore * ASSIGNMENT_WEIGHTS.workload;

  // Generar explicacion
  const explanation_es = generateExplanation(
    recruiter,
    position,
    breakdown,
    finalScore
  );

  return {
    score: finalScore,
    breakdown,
    explanation_es,
  };
}

// =============================================================================
// BEST RECRUITER FINDER
// =============================================================================

/**
 * Encuentra el mejor reclutador para una posicion
 *
 * @param recruiters - Lista de reclutadores disponibles
 * @param position - La posicion a asignar
 * @returns El mejor reclutador con su score, o null si no hay elegibles
 */
export function findBestRecruiter(
  recruiters: Recruiter[],
  position: Position
): BestRecruiterResult | null {
  // Filtrar reclutadores elegibles
  const eligibleRecruiters = recruiters.filter((r) => {
    // Debe estar activo
    if (!r.is_active) return false;

    // No debe estar eliminado (soft delete)
    if (r.deleted_at !== null) return false;

    // No debe estar en o sobre capacidad (use individual capacity)
    const capacity = getRecruiterCapacity(r);
    if (r.current_load >= capacity) return false;

    return true;
  });

  if (eligibleRecruiters.length === 0) {
    return null;
  }

  // Puntuar todos los reclutadores elegibles
  const scoredRecruiters = eligibleRecruiters.map((recruiter) => {
    const result = scoreRecruiter(recruiter, position);
    return {
      recruiter,
      ...result,
    };
  });

  // Ordenar por score descendente
  // Desempate: menor carga gana (load score mas alto = menor carga)
  scoredRecruiters.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    // Desempate por menor carga actual
    return a.recruiter.current_load - b.recruiter.current_load;
  });

  const best = scoredRecruiters[0];

  // Aplicar multiplicador de urgencia al mejor reclutador
  const adjustedScore = applyUrgencyMultiplier(best.score, position, true);

  // Regenerar explicacion si el score cambio por urgencia
  let finalExplanation = best.explanation_es;
  if (adjustedScore !== best.score) {
    const slaProgress = calculateSLAProgress(position);
    if (slaProgress > 1.0) {
      finalExplanation = `[URGENTE - SLA vencido] ${best.explanation_es.replace(
        /Puntuacion: [\d.]+/,
        `Puntuacion: ${adjustedScore.toFixed(2)}`
      )}`;
    } else {
      finalExplanation = `[PRIORIDAD - SLA >50%] ${best.explanation_es.replace(
        /Puntuacion: [\d.]+/,
        `Puntuacion: ${adjustedScore.toFixed(2)}`
      )}`;
    }
  }

  return {
    recruiter: best.recruiter,
    score: adjustedScore,
    breakdown: best.breakdown,
    explanation_es: finalExplanation,
  };
}

// =============================================================================
// AUTO-ASSIGNMENT
// =============================================================================

/**
 * Asigna automaticamente posiciones no asignadas a reclutadores
 *
 * @param recruiters - Lista de todos los reclutadores
 * @param positions - Lista de posiciones a asignar (debe ser posiciones sin asignar)
 * @returns Lista de asignaciones creadas
 */
export function autoAssignPositions(
  recruiters: Recruiter[],
  positions: Position[]
): AutoAssignmentResult[] {
  const assignments: AutoAssignmentResult[] = [];
  const now = new Date().toISOString();

  // Crear una copia mutable de la carga de reclutadores para actualizar durante el proceso
  const recruiterLoadMap = new Map<string, number>();
  recruiters.forEach((r) => {
    recruiterLoadMap.set(r.id, r.current_load);
  });

  // Ordenar posiciones por urgencia (P1 primero, luego P2, luego P3)
  // Dentro de cada prioridad, ordenar por SLA deadline (mas cercano primero)
  const sortedPositions = [...positions].sort((a, b) => {
    // Primero por prioridad
    const priorityOrder = { P1: 0, P2: 1, P3: 2 };
    const priorityDiff =
      (priorityOrder[a.priority] ?? 2) - (priorityOrder[b.priority] ?? 2);
    if (priorityDiff !== 0) return priorityDiff;

    // Luego por SLA deadline
    const aDeadline = a.sla_deadline ? new Date(a.sla_deadline).getTime() : Infinity;
    const bDeadline = b.sla_deadline ? new Date(b.sla_deadline).getTime() : Infinity;
    return aDeadline - bDeadline;
  });

  for (const position of sortedPositions) {
    // Crear una vista de reclutadores con la carga actualizada
    const updatedRecruiters = recruiters.map((r) => ({
      ...r,
      current_load: recruiterLoadMap.get(r.id) ?? r.current_load,
    }));

    const best = findBestRecruiter(updatedRecruiters, position);

    if (best === null) {
      // No hay reclutador elegible - skip (fallback chain se maneja en otro modulo)
      continue;
    }

    // Crear la asignacion
    const assignment: AutoAssignmentResult = {
      position_id: position.id,
      recruiter_id: best.recruiter.id,
      score: best.score,
      score_breakdown: best.breakdown,
      explanation_es: best.explanation_es,
      assignment_type: 'auto',
      assigned_at: now,
      status: 'assigned',
      current_stage: 'assigned',
      stage_entered_at: now,
    };

    assignments.push(assignment);

    // Actualizar la carga del reclutador para las siguientes iteraciones
    const currentLoad = recruiterLoadMap.get(best.recruiter.id) ?? 0;
    recruiterLoadMap.set(best.recruiter.id, currentLoad + 1);
  }

  return assignments;
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Obtiene los top N reclutadores para una posicion
 * Util para mostrar opciones al admin
 */
export function getTopRecruiters(
  recruiters: Recruiter[],
  position: Position,
  count: number = 3
): BestRecruiterResult[] {
  // Filtrar reclutadores elegibles
  const eligibleRecruiters = recruiters.filter((r) => {
    if (!r.is_active) return false;
    if (r.deleted_at !== null) return false;
    // Use individual capacity for filtering
    const capacity = getRecruiterCapacity(r);
    if (r.current_load >= capacity) return false;
    return true;
  });

  if (eligibleRecruiters.length === 0) {
    return [];
  }

  // Puntuar todos
  const scored = eligibleRecruiters.map((recruiter) => {
    const result = scoreRecruiter(recruiter, position);
    return {
      recruiter,
      ...result,
    };
  });

  // Ordenar y tomar los top N
  scored.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.recruiter.current_load - b.recruiter.current_load;
  });

  return scored.slice(0, count);
}

/**
 * Valida que los pesos de asignacion sumen 1.0
 * Lanza error si no es asi
 */
export function validateWeights(): void {
  const weightSum =
    ASSIGNMENT_WEIGHTS.zone +
    ASSIGNMENT_WEIGHTS.level +
    ASSIGNMENT_WEIGHTS.workload;

  if (Math.abs(weightSum - 1.0) > 0.001) {
    throw new Error(
      `Los pesos de asignacion deben sumar 1.0, obtenido ${weightSum}`
    );
  }
}

/**
 * Calcula estadisticas de una asignacion para el dashboard
 *
 * @param assignments - Lista de asignaciones automaticas
 * @param positions - Lista opcional de posiciones para calcular estadisticas por prioridad
 * @returns Estadisticas con total, promedio de score, y desglose por prioridad
 */
export function getAssignmentStats(
  assignments: AutoAssignmentResult[],
  positions?: Position[]
): {
  total: number;
  avgScore: number;
  byPriority: Record<string, number>;
} {
  if (assignments.length === 0) {
    return {
      total: 0,
      avgScore: 0,
      byPriority: {},
    };
  }

  const totalScore = assignments.reduce((sum, a) => sum + a.score, 0);
  const avgScore = totalScore / assignments.length;

  // Calcular desglose por prioridad si se proporcionan posiciones
  const byPriority: Record<string, number> = {};

  if (positions && positions.length > 0) {
    // Crear mapa de position_id a prioridad
    const positionPriorityMap = new Map<string, string>();
    for (const pos of positions) {
      positionPriorityMap.set(pos.id, pos.priority);
    }

    // Contar asignaciones por prioridad
    for (const assignment of assignments) {
      const priority = positionPriorityMap.get(assignment.position_id) ?? 'unknown';
      byPriority[priority] = (byPriority[priority] ?? 0) + 1;
    }
  }

  return {
    total: assignments.length,
    avgScore: Math.round(avgScore * 100) / 100,
    byPriority,
  };
}
