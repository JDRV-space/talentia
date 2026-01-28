/**
 * Modulo de Algoritmos - Talentia
 *
 * Este modulo re-exporta todos los algoritmos principales del sistema:
 *
 * - Assignment: Algoritmo de asignacion automatica de posiciones a reclutadores
 * - Forecast: Motor de pronostico de demanda de trabajadores
 * - Dedup: Motor de deduplicacion con fonetica espanola para Peru
 *
 * @module lib/algorithms
 */

// =============================================================================
// ALGORITMO DE ASIGNACION
// =============================================================================

export {
  // Tipos
  type ScoringResult,
  type BestRecruiterResult,
  type AutoAssignmentResult,
  // Funciones principales
  scoreRecruiter,
  findBestRecruiter,
  autoAssignPositions,
  // Utilidades
  getTopRecruiters,
  validateWeights,
  getAssignmentStats,
} from './assignment';

// =============================================================================
// MOTOR DE PRONOSTICO
// =============================================================================

export {
  // Tipos
  type ForecastResult,
  type CampaignAlert,
  // Funciones principales
  calculateSeasonalFactors,
  forecastWorkers,
  generateWeeklyForecast,
  detectCampaignAlerts,
  // Utilidades
  validateForecastData,
  compareForecastToActual,
} from './forecast';

// =============================================================================
// MOTOR DE DEDUPLICACION
// =============================================================================

export {
  // Tipos
  type DuplicateMatch,
  type BatchDedupResult,
  // Funciones de fonetica
  toSpanishPhonetic,
  // Funciones de similitud
  nameSimilarity,
  levenshteinDistance,
  // Funciones de comparacion
  compareCandidates,
  findDuplicates,
  batchDeduplicate,
} from './dedup';

// =============================================================================
// MOTOR DE RATIOS LABORALES HISTORICOS
// =============================================================================

export {
  // Tipos
  type LaborRatio,
  type LaborRatioInput,
  type LaborRatioResult,
  // Funciones principales
  matchCampaignsWithPositions,
  calculateLaborRatios,
  calculateLaborRatiosByZone,
  calculateHistoricalLaborRatios,
  // Utilidades
  getLaborRatio,
  calculateWorkersNeeded,
} from './labor-ratios';

// =============================================================================
// MOTOR DE PRIORIZACION DE CASOS
// =============================================================================

export {
  // Tipos
  type QueueType,
  type PriorityResult,
  type PriorityBreakdown,
  type PrioritizedPosition,
  // Constantes
  QUEUE_LABELS,
  // Funciones principales
  calculatePriorityScore,
  classifyQueue,
  getPrioritizedPositions,
  // Utilidades
  interleaveByQueue,
  getQueueStats,
} from './priority';
