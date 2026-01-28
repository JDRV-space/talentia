/**
 * Motor de Pronostico de Demanda de Trabajadores - Talentia
 *
 * Este modulo implementa el algoritmo de pronostico de demanda de mano de obra
 * basado en descomposicion estacional clasica.
 *
 * FORMULA PRINCIPAL:
 *   Y(t) = Trend(t) + Seasonal(t) + Residual(t)
 *
 * Donde:
 *   - Y(t) = Valor observado (produccion en kg)
 *   - Trend(t) = Componente de tendencia (promedio movil)
 *   - Seasonal(t) = Componente estacional (patron repetitivo 52 semanas)
 *   - Residual(t) = Ruido aleatorio
 *
 * CALCULO DE TRABAJADORES:
 *   workers = production_kg / (kg_per_worker_day * days_in_period * seasonal_factor)
 *
 * @author Talentia
 * @version 1.0.0
 */

import type { Campaign, ForecastBreakdown, ModelQuality } from '@/types/database';
import type { CropType, Zone } from '@/types/constants';
import { CROP_TYPES, ZONES, FORECAST_LEAD_DAYS } from '@/types/constants';

// =============================================================================
// CONSTANTES INTERNAS
// =============================================================================

/**
 * Numero de semanas en un ano (usado para calculos estacionales)
 */
const WEEKS_PER_YEAR = 52;

/**
 * Semana maxima en ISO 8601 (algunas anos tienen 53 semanas)
 */
const MAX_ISO_WEEK = 53;

/**
 * Dias habiles por semana para calculo de trabajadores
 * En agricultura peruana: lunes a sabado
 */
const WORKING_DAYS_PER_WEEK = 6;

/**
 * Factor Z para intervalo de confianza del 95%
 * P(Z <= 1.96) = 0.975, entonces P(-1.96 <= Z <= 1.96) = 0.95
 */
const Z_SCORE_95 = 1.96;

/**
 * Minimo de datos historicos requeridos para pronostico confiable
 * Si hay menos de este numero de puntos, usamos promedios simples
 */
const MIN_HISTORICAL_DATA_POINTS = 4;

// =============================================================================
// TIPOS LOCALES
// =============================================================================

/**
 * Resultado completo de pronostico con desglose detallado
 */
export interface ForecastResult {
  /** Fecha objetivo del pronostico (ISO date) */
  target_date: string;
  /** Numero predicho de trabajadores necesarios */
  predicted_workers: number;
  /** Intervalo de confianza [limite_inferior, limite_superior] */
  confidence_interval: { lower: number; upper: number };
  /** Desglose de componentes del modelo */
  breakdown: {
    trend_component: number;
    seasonal_component: number;
    by_crop: Record<CropType, number>;
    by_zone: Record<Zone, number>;
  };
  /** Metricas de calidad del modelo */
  model_quality: {
    r_squared: number;
    mape: number;
  };
}

/**
 * Alerta de campaña próxima
 */
export interface CampaignAlert {
  /** ID de la campaña */
  campaign_id: string;
  /** Nombre de la campaña */
  campaign_name: string;
  /** Tipo de cultivo */
  crop: CropType;
  /** Zona */
  zone: Zone;
  /** Fecha de inicio */
  start_date: string;
  /** Dias restantes hasta el inicio */
  days_until_start: number;
  /** Trabajadores estimados necesarios */
  estimated_workers: number;
  /** Nivel de urgencia: 'critico' | 'alto' | 'normal' */
  urgency: 'critico' | 'alto' | 'normal';
  /** Mensaje en espanol */
  message: string;
}

/**
 * Datos internos para calculo estacional
 */
interface WeeklyDataPoint {
  year: number;
  week: number;
  crop: CropType;
  zone: Zone;
  production_kg: number;
}

// =============================================================================
// FUNCIONES AUXILIARES MATEMATICAS
// =============================================================================

/**
 * Calcula la media aritmetica de un array de numeros
 *
 * @param values - Array de valores numericos
 * @returns Media aritmetica, o 0 si el array esta vacio
 */
function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, v) => sum + v, 0) / values.length;
}

/**
 * Calcula la desviacion estandar muestral
 *
 * Formula: sqrt(sum((x - mean)^2) / (n - 1))
 * Usamos n-1 (Bessel's correction) para muestra, no poblacion
 *
 * @param values - Array de valores numericos
 * @returns Desviacion estandar, o 0 si hay menos de 2 valores
 */
function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const squaredDiffs = values.map((v) => Math.pow(v - avg, 2));
  const variance = squaredDiffs.reduce((sum, v) => sum + v, 0) / (values.length - 1);
  return Math.sqrt(variance);
}

/**
 * Calcula el coeficiente de determinacion R-cuadrado
 *
 * Formula: 1 - (SS_res / SS_tot)
 *   SS_res = sum((y_actual - y_predicho)^2)
 *   SS_tot = sum((y_actual - y_mean)^2)
 *
 * @param actual - Valores reales observados
 * @param predicted - Valores predichos por el modelo
 * @returns R-cuadrado entre 0 y 1 (puede ser negativo si el modelo es muy malo)
 */
function calculateRSquared(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || actual.length !== predicted.length) return 0;

  const meanActual = mean(actual);
  const ssTotal = actual.reduce((sum, y) => sum + Math.pow(y - meanActual, 2), 0);
  const ssResidual = actual.reduce(
    (sum, y, i) => sum + Math.pow(y - predicted[i], 2),
    0
  );

  // Evitar division por cero
  if (ssTotal === 0) return 1; // Todos los valores son iguales = modelo perfecto
  return 1 - ssResidual / ssTotal;
}

/**
 * Calcula el MAPE (Mean Absolute Percentage Error)
 *
 * Formula: (1/n) * sum(|actual - predicted| / |actual|) * 100
 *
 * MAPE es una metrica comun en pronosticos porque es interpretable
 * como porcentaje de error promedio.
 *
 * @param actual - Valores reales observados (deben ser > 0)
 * @param predicted - Valores predichos por el modelo
 * @returns MAPE como porcentaje (ej: 15.5 = 15.5% error)
 */
function calculateMAPE(actual: number[], predicted: number[]): number {
  if (actual.length === 0 || actual.length !== predicted.length) return 0;

  // Filtramos valores donde actual = 0 para evitar division por cero
  const validPairs = actual
    .map((a, i) => ({ actual: a, predicted: predicted[i] }))
    .filter((pair) => pair.actual > 0);

  if (validPairs.length === 0) return 0;

  const sumPercentageErrors = validPairs.reduce(
    (sum, pair) =>
      sum + Math.abs(pair.actual - pair.predicted) / Math.abs(pair.actual),
    0
  );

  return (sumPercentageErrors / validPairs.length) * 100;
}

/**
 * Obtiene el numero de semana ISO del ano para una fecha
 *
 * Semana 1 es la primera semana con al menos 4 dias en el nuevo ano
 * (ISO 8601 standard)
 *
 * @param date - Fecha a evaluar
 * @returns Numero de semana (1-53)
 */
function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // Set to nearest Thursday: current date + 4 - current day number
  // Make Sunday's day number 7
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  // Get first day of year
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  // Calculate full weeks to nearest Thursday
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return weekNo;
}

/**
 * Convierte numero de semana y ano a fecha (primer dia de esa semana)
 *
 * @param year - Ano
 * @param week - Numero de semana (1-53)
 * @returns Fecha del primer dia (lunes) de esa semana
 */
function weekToDate(year: number, week: number): Date {
  // Enero 4 siempre esta en la semana 1 (ISO 8601)
  const jan4 = new Date(year, 0, 4);
  const dayOfWeek = jan4.getDay() || 7; // Domingo = 7
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setDate(jan4.getDate() - dayOfWeek + 1);

  const result = new Date(mondayWeek1);
  result.setDate(mondayWeek1.getDate() + (week - 1) * 7);
  return result;
}

/**
 * Calcula la diferencia en dias entre dos fechas
 */
function daysBetween(date1: Date, date2: Date): number {
  const diffTime = date2.getTime() - date1.getTime();
  return Math.floor(diffTime / (1000 * 60 * 60 * 24));
}

/**
 * Obtiene el indice seguro para factores estacionales (0-based)
 * Maneja ISO semana 53 promediando semanas 52 y 1
 *
 * @param weekNumber - Numero de semana ISO (1-53)
 * @param seasonalFactors - Array de 52 factores estacionales
 * @returns Indice seguro entre 0 y 51
 */
function getSafeWeekIndex(weekNumber: number): number {
  // Clamp a rango valido [1, 53]
  const clampedWeek = Math.min(Math.max(weekNumber, 1), MAX_ISO_WEEK);

  // Semana 53 se mapea al indice de semana 52 (indice 51)
  // El factor real se calculara como promedio de semana 52 y 1 en el caller
  if (clampedWeek === MAX_ISO_WEEK) {
    return WEEKS_PER_YEAR - 1; // Indice 51 (semana 52)
  }

  // Semanas 1-52: indice = semana - 1 (0-based)
  return clampedWeek - 1;
}

/**
 * Obtiene el factor estacional para una semana, manejando semana 53
 *
 * @param seasonalFactors - Array de 52 factores estacionales para un cultivo
 * @param weekNumber - Numero de semana ISO (1-53)
 * @returns Factor estacional (promediando semana 52 y 1 si es semana 53)
 */
function getSeasonalFactorForWeek(seasonalFactors: number[], weekNumber: number): number {
  // Clamp a rango valido [1, 53]
  const clampedWeek = Math.min(Math.max(weekNumber, 1), MAX_ISO_WEEK);

  // Semana 53: promedio de semana 52 (indice 51) y semana 1 (indice 0)
  if (clampedWeek === MAX_ISO_WEEK) {
    const week52Factor = seasonalFactors[WEEKS_PER_YEAR - 1] ?? 1;
    const week1Factor = seasonalFactors[0] ?? 1;
    return (week52Factor + week1Factor) / 2;
  }

  // Semanas 1-52: indice directo
  return seasonalFactors[clampedWeek - 1] ?? 1;
}

// =============================================================================
// FUNCIONES PRINCIPALES DE PRONOSTICO
// =============================================================================

/**
 * Calcula factores estacionales para cada cultivo basado en datos historicos
 *
 * METODOLOGIA:
 * 1. Agrupa datos por cultivo y semana del ano
 * 2. Calcula promedio de produccion por semana
 * 3. Normaliza cada semana dividiendo por el promedio anual
 * 4. Factor > 1 = temporada alta, Factor < 1 = temporada baja
 *
 * Ejemplo para arandano:
 *   - Semana 34 (agosto) tiene factor 2.0 = el doble de produccion normal
 *   - Semana 10 (marzo) tiene factor 0.5 = la mitad de produccion normal
 *
 * @param historicalData - Campanas historicas de Picos.xlsx
 * @returns Record de CropType a array de 52 factores estacionales (uno por semana)
 */
export function calculateSeasonalFactors(
  historicalData: Campaign[]
): Record<CropType, number[]> {
  // Inicializamos estructura para cada cultivo con 52 semanas
  // Includes all CROP_TYPES: esparrago, arandano, palta, uva, mango, pina, alcachofa, pimiento
  const result: Record<CropType, number[]> = {
    esparrago: new Array(WEEKS_PER_YEAR).fill(1),
    arandano: new Array(WEEKS_PER_YEAR).fill(1),
    palta: new Array(WEEKS_PER_YEAR).fill(1),
    uva: new Array(WEEKS_PER_YEAR).fill(1),
    mango: new Array(WEEKS_PER_YEAR).fill(1),
    pina: new Array(WEEKS_PER_YEAR).fill(1),
    alcachofa: new Array(WEEKS_PER_YEAR).fill(1),
    pimiento: new Array(WEEKS_PER_YEAR).fill(1),
  };

  // Agrupamos datos por cultivo
  const cropData: Record<CropType, WeeklyDataPoint[]> = {
    esparrago: [],
    arandano: [],
    palta: [],
    uva: [],
    mango: [],
    pina: [],
    alcachofa: [],
    pimiento: [],
  };

  for (const campaign of historicalData) {
    if (campaign.crop && cropData[campaign.crop]) {
      cropData[campaign.crop].push({
        year: campaign.year,
        week: campaign.week_number,
        crop: campaign.crop,
        zone: campaign.zone,
        production_kg: campaign.production_kg,
      });
    }
  }

  // Calculamos factores estacionales para cada cultivo
  for (const crop of Object.keys(cropData) as CropType[]) {
    const data = cropData[crop];
    if (data.length === 0) continue;

    // Agrupamos produccion por semana
    const weeklyProduction: Record<number, number[]> = {};
    for (let w = 1; w <= WEEKS_PER_YEAR; w++) {
      weeklyProduction[w] = [];
    }

    for (const point of data) {
      // Semana 53 se mapea a semana 52 para almacenamiento (indice 52 -> semana 52)
      const weekIndex = point.week === MAX_ISO_WEEK
        ? WEEKS_PER_YEAR
        : Math.min(Math.max(point.week, 1), WEEKS_PER_YEAR);
      weeklyProduction[weekIndex].push(point.production_kg);
    }

    // Calculamos promedio por semana
    const weeklyAverages: number[] = [];
    for (let w = 1; w <= WEEKS_PER_YEAR; w++) {
      const weekData = weeklyProduction[w];
      weeklyAverages.push(weekData.length > 0 ? mean(weekData) : 0);
    }

    // Calculamos promedio anual (solo semanas con datos)
    const nonZeroAverages = weeklyAverages.filter((avg) => avg > 0);
    const overallMean = nonZeroAverages.length > 0 ? mean(nonZeroAverages) : 1;

    // Calculamos factor estacional para cada semana
    // Factor = promedio_semana / promedio_anual
    for (let w = 0; w < WEEKS_PER_YEAR; w++) {
      if (weeklyAverages[w] > 0 && overallMean > 0) {
        result[crop][w] = weeklyAverages[w] / overallMean;
      } else {
        // Si no hay datos, usamos el factor de pico del cultivo como default
        result[crop][w] = CROP_TYPES[crop].seasonal_peak_factor;
      }
    }
  }

  return result;
}

/**
 * Pronostica trabajadores necesarios para una fecha objetivo
 *
 * ALGORITMO:
 * 1. Identifica campañas activas o próximas para la fecha objetivo
 * 2. Para cada campaña, calcula trabajadores = kg / (kg_per_worker * días * factor_estacional)
 * 3. Suma total de trabajadores por cultivo y zona
 * 4. Calcula intervalo de confianza basado en variabilidad histórica
 *
 * @param campaigns - Datos de campañas (de Picos.xlsx)
 * @param targetDate - Fecha para la cual pronosticar
 * @param options - Opciones adicionales (leadTimeDays, etc.)
 * @returns Resultado del pronóstico con desglose y métricas de calidad
 */
export function forecastWorkers(
  campaigns: Campaign[],
  targetDate: Date,
  options: { leadTimeDays?: number } = {}
): ForecastResult {
  const { leadTimeDays = FORECAST_LEAD_DAYS } = options;

  // Obtenemos numero de semana de la fecha objetivo
  const targetWeek = getISOWeekNumber(targetDate);
  const targetYear = targetDate.getFullYear();

  // Calculamos factores estacionales historicos
  const seasonalFactors = calculateSeasonalFactors(campaigns);

  // Inicializamos acumuladores por cultivo y zona
  const workersByCrop: Record<CropType, number> = {
    esparrago: 0,
    arandano: 0,
    palta: 0,
    uva: 0,
    mango: 0,
    pina: 0,
    alcachofa: 0,
    pimiento: 0,
  };

  const workersByZone: Partial<Record<Zone, number>> = {};
  for (const zone of ZONES) {
    workersByZone[zone] = 0;
  }

  // Arrays para calcular metricas de calidad
  const predictedValues: number[] = [];
  const actualValues: number[] = [];

  // Componentes del modelo
  let trendComponent = 0;
  let seasonalComponent = 0;

  // Filtramos campañas relevantes para la fecha objetivo
  // Una campaña es relevante si:
  // - Está en la misma semana/año que el target, O
  // - Su fecha de inicio está dentro del rango de lead time
  const relevantCampaigns = campaigns.filter((c) => {
    // Campaña exacta para esa semana
    if (c.year === targetYear && c.week_number === targetWeek) {
      return true;
    }

    // Campañas con fecha de inicio dentro del lead time desde la fecha objetivo
    if (c.start_date) {
      const startDate = new Date(c.start_date);
      const daysUntilStart = daysBetween(targetDate, startDate);
      return daysUntilStart >= 0 && daysUntilStart <= leadTimeDays;
    }

    return false;
  });

  // Si no hay campanas relevantes, usamos datos historicos como fallback
  if (relevantCampaigns.length === 0) {
    // Buscamos campanas de la misma semana en anos anteriores
    const historicalWeekCampaigns = campaigns.filter(
      (c) => c.week_number === targetWeek && c.year < targetYear
    );

    if (historicalWeekCampaigns.length > 0) {
      // Usamos promedio historico
      for (const campaign of historicalWeekCampaigns) {
        const crop = campaign.crop;
        const zone = campaign.zone;
        const kgPerWorker = CROP_TYPES[crop]?.kg_per_worker_day ?? 50;

        // Factor estacional para esta semana (maneja semana 53)
        const cropFactors = seasonalFactors[crop] ?? [];
        const rawSeasonalFactor = getSeasonalFactorForWeek(cropFactors, targetWeek);
        // Guard against division by zero or very small factors
        const seasonalFactor = Math.max(rawSeasonalFactor, 0.1);

        // Calculamos trabajadores: kg / (kg_per_worker * dias_semana * factor_estacional)
        const workersNeeded =
          campaign.production_kg / (kgPerWorker * WORKING_DAYS_PER_WEEK * seasonalFactor);

        workersByCrop[crop] += workersNeeded;
        workersByZone[zone] = (workersByZone[zone] ?? 0) + workersNeeded;

        // Guardamos para metricas
        if (campaign.estimated_workers) {
          actualValues.push(campaign.estimated_workers);
          predictedValues.push(workersNeeded);
        }
      }

      // Normalizamos por numero de anos historicos
      const yearsCount = new Set(historicalWeekCampaigns.map((c) => c.year)).size;
      for (const crop of Object.keys(workersByCrop) as CropType[]) {
        workersByCrop[crop] /= yearsCount;
      }
      for (const zone of Object.keys(workersByZone) as Zone[]) {
        workersByZone[zone] = (workersByZone[zone] ?? 0) / yearsCount;
      }
    }
  } else {
    // Procesamos campanas relevantes directamente
    for (const campaign of relevantCampaigns) {
      const crop = campaign.crop;
      const zone = campaign.zone;
      const kgPerWorker = CROP_TYPES[crop]?.kg_per_worker_day ?? 50;

      // Factor estacional para esta semana (maneja semana 53)
      const cropFactors = seasonalFactors[crop] ?? [];
      const rawSeasonalFactor = getSeasonalFactorForWeek(cropFactors, targetWeek);
      // Guard against division by zero or very small factors
      const seasonalFactor = Math.max(rawSeasonalFactor, 0.1);

      // Calculamos trabajadores
      const workersNeeded =
        campaign.production_kg / (kgPerWorker * WORKING_DAYS_PER_WEEK * seasonalFactor);

      workersByCrop[crop] += workersNeeded;
      workersByZone[zone] = (workersByZone[zone] ?? 0) + workersNeeded;

      // Acumulamos componentes
      seasonalComponent += seasonalFactor;

      // Para metricas
      if (campaign.estimated_workers) {
        actualValues.push(campaign.estimated_workers);
        predictedValues.push(workersNeeded);
      }
    }

    // Promediamos el componente estacional
    if (relevantCampaigns.length > 0) {
      seasonalComponent /= relevantCampaigns.length;
    }
  }

  // Calculamos total de trabajadores
  const totalWorkers = Object.values(workersByCrop).reduce((sum, w) => sum + w, 0);

  // Componente de tendencia = total / componente estacional
  trendComponent = seasonalComponent > 0 ? totalWorkers / seasonalComponent : totalWorkers;

  // Calculamos desviacion estandar para intervalo de confianza
  const allWorkerValues = Object.values(workersByCrop).filter((w) => w > 0);
  const stdDev = standardDeviation(allWorkerValues);

  // Intervalo de confianza 95%: mean +/- Z * (std / sqrt(n))
  const standardError =
    allWorkerValues.length > 0 ? stdDev / Math.sqrt(allWorkerValues.length) : 0;
  const marginOfError = Z_SCORE_95 * standardError;

  // Metricas de calidad del modelo
  const rSquared =
    actualValues.length >= MIN_HISTORICAL_DATA_POINTS
      ? calculateRSquared(actualValues, predictedValues)
      : 0.5; // Valor default moderado si no hay suficientes datos

  const mape =
    actualValues.length >= MIN_HISTORICAL_DATA_POINTS
      ? calculateMAPE(actualValues, predictedValues)
      : 25; // 25% error default si no hay suficientes datos

  // Construimos resultado
  const result: ForecastResult = {
    target_date: targetDate.toISOString().split('T')[0],
    predicted_workers: Math.round(totalWorkers),
    confidence_interval: {
      lower: Math.max(0, Math.round(totalWorkers - marginOfError)),
      upper: Math.round(totalWorkers + marginOfError),
    },
    breakdown: {
      trend_component: Math.round(trendComponent),
      seasonal_component: parseFloat(seasonalComponent.toFixed(2)),
      by_crop: {
        esparrago: Math.round(workersByCrop.esparrago),
        arandano: Math.round(workersByCrop.arandano),
        palta: Math.round(workersByCrop.palta),
        uva: Math.round(workersByCrop.uva),
        mango: Math.round(workersByCrop.mango),
        pina: Math.round(workersByCrop.pina),
        alcachofa: Math.round(workersByCrop.alcachofa),
        pimiento: Math.round(workersByCrop.pimiento),
      },
      by_zone: workersByZone as Record<Zone, number>,
    },
    model_quality: {
      r_squared: parseFloat(rSquared.toFixed(3)),
      mape: parseFloat(mape.toFixed(2)),
    },
  };

  // Redondeamos valores de zona
  for (const zone of Object.keys(result.breakdown.by_zone) as Zone[]) {
    result.breakdown.by_zone[zone] = Math.round(result.breakdown.by_zone[zone]);
  }

  return result;
}

/**
 * Genera pronóstico semanal para las próximas N semanas
 *
 * @param campaigns - Datos de campañas históricos y proyectados
 * @param weeksAhead - Número de semanas a pronosticar
 * @returns Array de resultados de pronóstico, uno por semana
 */
export function generateWeeklyForecast(
  campaigns: Campaign[],
  weeksAhead: number
): ForecastResult[] {
  const results: ForecastResult[] = [];
  const today = new Date();

  for (let i = 0; i < weeksAhead; i++) {
    // Calculamos fecha objetivo (avanzamos i semanas)
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() + i * 7);

    const forecast = forecastWorkers(campaigns, targetDate);
    results.push(forecast);
  }

  return results;
}

/**
 * Detecta alertas de campanas que inician dentro del periodo de anticipacion
 *
 * Esta funcion es crucial para que Talentia pueda planificar con tiempo
 * y asignar reclutadores a las posiciones que se abriran pronto.
 *
 * NIVELES DE URGENCIA:
 * - Critico: <= 7 dias para inicio
 * - Alto: 8-14 dias para inicio
 * - Normal: 15-30 dias para inicio
 *
 * @param campaigns - Campanas con fechas de inicio definidas
 * @param leadTimeDays - Dias de anticipacion para alertas (default: 30)
 * @returns Array de alertas ordenadas por urgencia y fecha
 */
export function detectCampaignAlerts(
  campaigns: Campaign[],
  leadTimeDays: number = FORECAST_LEAD_DAYS
): CampaignAlert[] {
  const alerts: CampaignAlert[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Normalizamos a medianoche

  // Calculamos factores estacionales para estimacion de trabajadores
  const seasonalFactors = calculateSeasonalFactors(campaigns);

  for (const campaign of campaigns) {
    // Solo procesamos campanas con fecha de inicio definida
    if (!campaign.start_date) continue;

    const startDate = new Date(campaign.start_date);
    startDate.setHours(0, 0, 0, 0);

    const daysUntilStart = daysBetween(today, startDate);

    // Solo alertamos si esta dentro del periodo de anticipacion
    if (daysUntilStart < 0 || daysUntilStart > leadTimeDays) continue;

    // Calculamos trabajadores estimados
    const crop = campaign.crop;
    const kgPerWorker = CROP_TYPES[crop]?.kg_per_worker_day ?? 50;
    const startWeek = getISOWeekNumber(startDate);
    const cropFactors = seasonalFactors[crop] ?? [];
    const rawSeasonalFactor = getSeasonalFactorForWeek(cropFactors, startWeek);
    // Guard against division by zero or very small factors
    const seasonalFactor = Math.max(rawSeasonalFactor, 0.1);

    // Usamos el estimated_workers de la campana si existe, sino calculamos
    const estimatedWorkers =
      campaign.estimated_workers ??
      Math.round(
        campaign.production_kg / (kgPerWorker * WORKING_DAYS_PER_WEEK * seasonalFactor)
      );

    // Determinamos nivel de urgencia
    let urgency: 'critico' | 'alto' | 'normal';
    let urgencyLabel: string;

    if (daysUntilStart <= 7) {
      urgency = 'critico';
      urgencyLabel = 'CRITICO';
    } else if (daysUntilStart <= 14) {
      urgency = 'alto';
      urgencyLabel = 'ALTO';
    } else {
      urgency = 'normal';
      urgencyLabel = 'Normal';
    }

    // Construimos mensaje en español
    const cropLabel = CROP_TYPES[crop]?.label ?? crop;
    const message =
      daysUntilStart === 0
        ? `[${urgencyLabel}] Campaña de ${cropLabel} en ${campaign.zone} inicia HOY. Se necesitan ${estimatedWorkers} trabajadores.`
        : daysUntilStart === 1
          ? `[${urgencyLabel}] Campaña de ${cropLabel} en ${campaign.zone} inicia MAÑANA. Se necesitan ${estimatedWorkers} trabajadores.`
          : `[${urgencyLabel}] Campaña de ${cropLabel} en ${campaign.zone} inicia en ${daysUntilStart} días. Se necesitan ${estimatedWorkers} trabajadores.`;

    alerts.push({
      campaign_id: campaign.id,
      campaign_name: campaign.name,
      crop,
      zone: campaign.zone,
      start_date: campaign.start_date,
      days_until_start: daysUntilStart,
      estimated_workers: estimatedWorkers,
      urgency,
      message,
    });
  }

  // Ordenamos: primero por urgencia (critico > alto > normal), luego por dias restantes
  const urgencyOrder = { critico: 0, alto: 1, normal: 2 };
  alerts.sort((a, b) => {
    const urgencyDiff = urgencyOrder[a.urgency] - urgencyOrder[b.urgency];
    if (urgencyDiff !== 0) return urgencyDiff;
    return a.days_until_start - b.days_until_start;
  });

  return alerts;
}

// =============================================================================
// FUNCIONES AUXILIARES EXPORTADAS
// =============================================================================

/**
 * Valida que los datos de campanas sean suficientes para pronostico confiable
 *
 * @param campaigns - Array de campanas a validar
 * @returns Objeto con validez y mensajes de advertencia
 */
export function validateForecastData(campaigns: Campaign[]): {
  isValid: boolean;
  warnings: string[];
  dataQuality: 'alta' | 'media' | 'baja';
} {
  const warnings: string[] = [];

  // Verificamos que haya datos
  if (campaigns.length === 0) {
    return {
      isValid: false,
      warnings: ['No hay datos de campanas disponibles'],
      dataQuality: 'baja',
    };
  }

  // Verificamos cobertura por cultivo
  const cropCoverage: Record<CropType, number> = {
    esparrago: 0,
    arandano: 0,
    palta: 0,
    uva: 0,
    mango: 0,
    pina: 0,
    alcachofa: 0,
    pimiento: 0,
  };

  for (const campaign of campaigns) {
    if (campaign.crop && cropCoverage[campaign.crop] !== undefined) {
      cropCoverage[campaign.crop]++;
    }
  }

  for (const [crop, count] of Object.entries(cropCoverage)) {
    if (count === 0) {
      warnings.push(`Sin datos historicos para ${CROP_TYPES[crop as CropType]?.label ?? crop}`);
    } else if (count < MIN_HISTORICAL_DATA_POINTS) {
      warnings.push(
        `Datos limitados para ${CROP_TYPES[crop as CropType]?.label ?? crop}: solo ${count} registros`
      );
    }
  }

  // Verificamos cobertura temporal (anos)
  const years = new Set(campaigns.map((c) => c.year));
  if (years.size < 2) {
    warnings.push(
      'Solo hay datos de un ano. Se recomienda al menos 2 anos para mejor precision.'
    );
  }

  // Determinamos calidad de datos
  let dataQuality: 'alta' | 'media' | 'baja';
  const cropsWithData = Object.values(cropCoverage).filter((c) => c >= MIN_HISTORICAL_DATA_POINTS)
    .length;

  if (cropsWithData >= 3 && years.size >= 2) {
    dataQuality = 'alta';
  } else if (cropsWithData >= 2 || years.size >= 2) {
    dataQuality = 'media';
  } else {
    dataQuality = 'baja';
  }

  return {
    isValid: campaigns.length > 0,
    warnings,
    dataQuality,
  };
}

/**
 * Compara pronostico con valores reales para medir precision
 *
 * @param forecastDate - Fecha del pronostico original
 * @param predictedWorkers - Trabajadores predichos
 * @param actualWorkers - Trabajadores realmente usados
 * @returns Metricas de precision del pronostico
 */
export function compareForecastToActual(
  forecastDate: string,
  predictedWorkers: number,
  actualWorkers: number
): {
  accuracy_percent: number;
  error_absolute: number;
  error_percent: number;
  performance: 'excelente' | 'bueno' | 'aceptable' | 'pobre';
} {
  const errorAbsolute = Math.abs(predictedWorkers - actualWorkers);
  const errorPercent =
    actualWorkers > 0 ? (errorAbsolute / actualWorkers) * 100 : 100;
  const accuracyPercent = Math.max(0, 100 - errorPercent);

  // Determinamos nivel de rendimiento
  let performance: 'excelente' | 'bueno' | 'aceptable' | 'pobre';
  if (errorPercent <= 10) {
    performance = 'excelente';
  } else if (errorPercent <= 20) {
    performance = 'bueno';
  } else if (errorPercent <= 35) {
    performance = 'aceptable';
  } else {
    performance = 'pobre';
  }

  return {
    accuracy_percent: parseFloat(accuracyPercent.toFixed(1)),
    error_absolute: errorAbsolute,
    error_percent: parseFloat(errorPercent.toFixed(1)),
    performance,
  };
}
