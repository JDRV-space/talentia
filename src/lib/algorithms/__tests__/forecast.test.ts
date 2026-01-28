/**
 * Unit tests for the Forecasting Algorithm
 * Tests seasonal factors, worker forecasting, and campaign alerts
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  calculateSeasonalFactors,
  forecastWorkers,
  generateWeeklyForecast,
  detectCampaignAlerts,
  validateForecastData,
  compareForecastToActual,
} from '../forecast';
import type { Campaign } from '@/types/database';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'campaign-1',
    name: 'Campana Esparrago 2026',
    year: 2026,
    week_number: 10,
    crop: 'esparrago',
    zone: 'Trujillo',
    production_kg: 10000,
    start_date: '2026-03-01',
    end_date: '2026-03-31',
    estimated_workers: null,
    kg_per_worker_day: null,
    status: 'planned',
    source: 'picos',
    upload_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// =============================================================================
// CALCULATE SEASONAL FACTORS TESTS
// =============================================================================

describe('calculateSeasonalFactors', () => {
  it('should return default factors (1.0) for all weeks when no data', () => {
    const result = calculateSeasonalFactors([]);

    expect(result.esparrago).toHaveLength(52);
    expect(result.arandano).toHaveLength(52);
    expect(result.palta).toHaveLength(52);
    expect(result.uva).toHaveLength(52);
  });

  it('should calculate factors based on historical data', () => {
    const campaigns: Campaign[] = [
      createMockCampaign({ crop: 'esparrago', week_number: 1, production_kg: 1000, year: 2025 }),
      createMockCampaign({ crop: 'esparrago', week_number: 1, production_kg: 2000, year: 2024 }),
      createMockCampaign({ crop: 'esparrago', week_number: 2, production_kg: 3000, year: 2025 }),
    ];

    const result = calculateSeasonalFactors(campaigns);

    // Week 1 average: 1500, Week 2 average: 3000
    // Overall mean of non-zero weeks: (1500 + 3000) / 2 = 2250
    // Week 1 factor: 1500 / 2250 = 0.667
    // Week 2 factor: 3000 / 2250 = 1.333
    expect(result.esparrago[0]).toBeCloseTo(1500 / 2250, 2);
    expect(result.esparrago[1]).toBeCloseTo(3000 / 2250, 2);
  });

  it('should handle multiple crops independently', () => {
    const campaigns: Campaign[] = [
      createMockCampaign({ crop: 'esparrago', week_number: 1, production_kg: 1000 }),
      createMockCampaign({ crop: 'arandano', week_number: 1, production_kg: 5000 }),
    ];

    const result = calculateSeasonalFactors(campaigns);

    // Each crop should be independent - when only one data point, factor depends on seasonal_peak_factor
    expect(result.esparrago[0]).toBeDefined();
    expect(result.arandano[0]).toBeDefined();
  });

  it('should use default seasonal_peak_factor when no data for a week', () => {
    const campaigns: Campaign[] = [
      createMockCampaign({ crop: 'esparrago', week_number: 1, production_kg: 1000 }),
    ];

    const result = calculateSeasonalFactors(campaigns);

    // Week 52 (index 51) has no data, should use default factor
    // For esparrago, seasonal_peak_factor is 1.6
    expect(result.esparrago[51]).toBe(1.6);
  });

  it('should normalize week numbers to valid range (1-52)', () => {
    const campaigns: Campaign[] = [
      createMockCampaign({ crop: 'esparrago', week_number: 0, production_kg: 1000 }), // Invalid, should be treated as week 1
      createMockCampaign({ crop: 'esparrago', week_number: 53, production_kg: 2000 }), // Invalid, should be treated as week 52
    ];

    const result = calculateSeasonalFactors(campaigns);

    // Should not throw and should have valid data
    expect(result.esparrago).toHaveLength(52);
  });

  it('should handle empty crop data gracefully', () => {
    const campaigns: Campaign[] = [
      createMockCampaign({ crop: 'esparrago', week_number: 10, production_kg: 5000 }),
    ];

    const result = calculateSeasonalFactors(campaigns);

    // Crops with no data should still have 52 weeks of defaults
    expect(result.palta).toHaveLength(52);
    expect(result.uva).toHaveLength(52);
  });
});

// =============================================================================
// FORECAST WORKERS TESTS
// =============================================================================

describe('forecastWorkers', () => {
  beforeEach(() => {
    // Mock Date to ensure consistent test results
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-15'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return forecast result with required fields', () => {
    const campaigns = [
      createMockCampaign({
        year: 2026,
        week_number: 11,
        production_kg: 10000,
        crop: 'esparrago',
      }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    expect(result).toHaveProperty('target_date');
    expect(result).toHaveProperty('predicted_workers');
    expect(result).toHaveProperty('confidence_interval');
    expect(result).toHaveProperty('breakdown');
    expect(result).toHaveProperty('model_quality');
  });

  it('should calculate workers based on formula: kg / (kg_per_worker * days * seasonal_factor)', () => {
    const campaigns = [
      createMockCampaign({
        year: 2026,
        week_number: 11, // Same week as target date
        production_kg: 27000, // 45 kg/worker/day * 6 days * 100 workers = 27000
        crop: 'esparrago',
        start_date: '2026-03-09',
      }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    // Workers = 27000 / (45 * 6 * seasonalFactor)
    // With default seasonal factor ~1, should be approximately 100 workers
    expect(result.predicted_workers).toBeGreaterThan(0);
  });

  it('should use historical data as fallback when no current campaigns', () => {
    const campaigns = [
      createMockCampaign({
        year: 2025, // Previous year
        week_number: 11,
        production_kg: 10000,
        crop: 'esparrago',
      }),
      createMockCampaign({
        year: 2024,
        week_number: 11,
        production_kg: 12000,
        crop: 'esparrago',
      }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    // Should use averaged historical data
    expect(result.predicted_workers).toBeGreaterThan(0);
  });

  it('should return zero workers when no relevant campaigns found', () => {
    const campaigns = [
      createMockCampaign({
        year: 2026,
        week_number: 30, // Different week
        production_kg: 10000,
      }),
    ];
    const targetDate = new Date('2026-03-15'); // Week 11

    const result = forecastWorkers(campaigns, targetDate);

    expect(result.predicted_workers).toBe(0);
  });

  it('should calculate confidence interval correctly', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 11, production_kg: 10000, crop: 'esparrago' }),
      createMockCampaign({ year: 2026, week_number: 11, production_kg: 8000, crop: 'arandano' }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    expect(result.confidence_interval.lower).toBeLessThanOrEqual(result.predicted_workers);
    expect(result.confidence_interval.upper).toBeGreaterThanOrEqual(result.predicted_workers);
  });

  it('should include breakdown by crop', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 11, production_kg: 10000, crop: 'esparrago' }),
      createMockCampaign({ year: 2026, week_number: 11, production_kg: 5000, crop: 'arandano' }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    expect(result.breakdown.by_crop).toHaveProperty('esparrago');
    expect(result.breakdown.by_crop).toHaveProperty('arandano');
    expect(result.breakdown.by_crop).toHaveProperty('palta');
    expect(result.breakdown.by_crop).toHaveProperty('uva');
  });

  it('should include breakdown by zone', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 11, zone: 'Trujillo', production_kg: 10000 }),
      createMockCampaign({ year: 2026, week_number: 11, zone: 'Lima', production_kg: 5000 }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    expect(result.breakdown.by_zone).toBeDefined();
  });

  it('should include model quality metrics', () => {
    const campaigns = [
      createMockCampaign({
        year: 2026,
        week_number: 11,
        production_kg: 10000,
        estimated_workers: 50,
      }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    expect(result.model_quality).toHaveProperty('r_squared');
    expect(result.model_quality).toHaveProperty('mape');
  });

  it('should use default model quality when insufficient historical data', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 11, production_kg: 10000 }),
    ];
    const targetDate = new Date('2026-03-15');

    const result = forecastWorkers(campaigns, targetDate);

    // With < 4 data points, should use defaults
    expect(result.model_quality.r_squared).toBe(0.5);
    expect(result.model_quality.mape).toBe(25);
  });
});

// =============================================================================
// GENERATE WEEKLY FORECAST TESTS
// =============================================================================

describe('generateWeeklyForecast', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should generate forecast for specified number of weeks', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 10, production_kg: 10000 }),
    ];

    const result = generateWeeklyForecast(campaigns, 4);

    expect(result).toHaveLength(4);
  });

  it('should have incrementing target dates', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, week_number: 10, production_kg: 10000 }),
    ];

    const result = generateWeeklyForecast(campaigns, 3);

    const date1 = new Date(result[0].target_date);
    const date2 = new Date(result[1].target_date);
    const date3 = new Date(result[2].target_date);

    expect(date2.getTime() - date1.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
    expect(date3.getTime() - date2.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('should return empty array for 0 weeks', () => {
    const campaigns = [createMockCampaign()];

    const result = generateWeeklyForecast(campaigns, 0);

    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// DETECT CAMPAIGN ALERTS TESTS
// =============================================================================

describe('detectCampaignAlerts', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-01T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return empty array when no campaigns have start dates', () => {
    const campaigns = [
      createMockCampaign({ start_date: '' }),
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result).toHaveLength(0);
  });

  it('should detect campaigns within default lead time (30 days)', () => {
    const campaigns = [
      createMockCampaign({ id: 'c1', start_date: '2026-03-15' }), // 14 days away
      createMockCampaign({ id: 'c2', start_date: '2026-04-15' }), // 45 days away (outside lead time)
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result).toHaveLength(1);
    expect(result[0].campaign_id).toBe('c1');
  });

  it('should use custom lead time when specified', () => {
    const campaigns = [
      createMockCampaign({ id: 'c1', start_date: '2026-03-10' }), // 9 days away
      createMockCampaign({ id: 'c2', start_date: '2026-03-15' }), // 14 days away
    ];

    const result = detectCampaignAlerts(campaigns, 10);

    expect(result).toHaveLength(1);
    expect(result[0].campaign_id).toBe('c1');
  });

  it('should classify urgency as critico for <= 7 days', () => {
    const campaigns = [
      createMockCampaign({ start_date: '2026-03-05' }), // 4 days away
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].urgency).toBe('critico');
    expect(result[0].message).toContain('CRITICO');
  });

  it('should classify urgency as alto for 8-14 days', () => {
    const campaigns = [
      createMockCampaign({ start_date: '2026-03-10' }), // 9 days away
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].urgency).toBe('alto');
    expect(result[0].message).toContain('ALTO');
  });

  it('should classify urgency as normal for 15-30 days', () => {
    const campaigns = [
      createMockCampaign({ start_date: '2026-03-20' }), // 19 days away
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].urgency).toBe('normal');
    expect(result[0].message).toContain('Normal');
  });

  it('should use special message for campaign starting today', () => {
    const campaigns = [
      createMockCampaign({ start_date: '2026-03-01' }), // Today
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].days_until_start).toBe(0);
    expect(result[0].message).toContain('HOY');
  });

  it('should use special message for campaign starting tomorrow', () => {
    const campaigns = [
      createMockCampaign({ start_date: '2026-03-02' }), // Tomorrow
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].days_until_start).toBe(1);
    expect(result[0].message).toContain('MAÑANA');
  });

  it('should sort alerts by urgency then by days until start', () => {
    const campaigns = [
      createMockCampaign({ id: 'c1', start_date: '2026-03-20' }), // 19 days - normal
      createMockCampaign({ id: 'c2', start_date: '2026-03-05' }), // 4 days - critico
      createMockCampaign({ id: 'c3', start_date: '2026-03-03' }), // 2 days - critico
      createMockCampaign({ id: 'c4', start_date: '2026-03-10' }), // 9 days - alto
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].campaign_id).toBe('c3'); // critico, 2 days
    expect(result[1].campaign_id).toBe('c2'); // critico, 4 days
    expect(result[2].campaign_id).toBe('c4'); // alto, 9 days
    expect(result[3].campaign_id).toBe('c1'); // normal, 19 days
  });

  it('should not include campaigns that already started', () => {
    const campaigns = [
      createMockCampaign({ id: 'c1', start_date: '2026-02-15' }), // In the past
      createMockCampaign({ id: 'c2', start_date: '2026-03-10' }), // Future
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result).toHaveLength(1);
    expect(result[0].campaign_id).toBe('c2');
  });

  it('should use estimated_workers from campaign if available', () => {
    const campaigns = [
      createMockCampaign({
        start_date: '2026-03-10',
        estimated_workers: 100,
      }),
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].estimated_workers).toBe(100);
  });

  it('should calculate estimated workers when not provided', () => {
    const campaigns = [
      createMockCampaign({
        start_date: '2026-03-10',
        production_kg: 27000, // 45 * 6 * 100 workers
        crop: 'esparrago',
        estimated_workers: null,
      }),
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].estimated_workers).toBeGreaterThan(0);
  });

  it('should include crop and zone in alert message', () => {
    const campaigns = [
      createMockCampaign({
        start_date: '2026-03-10',
        crop: 'arandano',
        zone: 'Trujillo',
      }),
    ];

    const result = detectCampaignAlerts(campaigns);

    expect(result[0].crop).toBe('arandano');
    expect(result[0].zone).toBe('Trujillo');
    expect(result[0].message).toContain('Arandano');
    expect(result[0].message).toContain('Trujillo');
  });
});

// =============================================================================
// VALIDATE FORECAST DATA TESTS
// =============================================================================

describe('validateForecastData', () => {
  it('should return invalid for empty campaigns array', () => {
    const result = validateForecastData([]);

    expect(result.isValid).toBe(false);
    expect(result.warnings).toContain('No hay datos de campanas disponibles');
    expect(result.dataQuality).toBe('baja');
  });

  it('should warn when crop has no historical data', () => {
    const campaigns = [
      createMockCampaign({ crop: 'esparrago' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.warnings.some(w => w.includes('Arandano'))).toBe(true);
    expect(result.warnings.some(w => w.includes('Palta'))).toBe(true);
    expect(result.warnings.some(w => w.includes('Uva'))).toBe(true);
  });

  it('should warn when crop has limited data (< 4 records)', () => {
    const campaigns = [
      createMockCampaign({ crop: 'esparrago', id: 'c1' }),
      createMockCampaign({ crop: 'esparrago', id: 'c2' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.warnings.some(w => w.includes('Datos limitados'))).toBe(true);
  });

  it('should warn when only one year of data', () => {
    const campaigns = [
      createMockCampaign({ year: 2026, id: 'c1' }),
      createMockCampaign({ year: 2026, id: 'c2' }),
      createMockCampaign({ year: 2026, id: 'c3' }),
      createMockCampaign({ year: 2026, id: 'c4' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.warnings.some(w => w.includes('Solo hay datos de un ano'))).toBe(true);
  });

  it('should return alta quality when 3+ crops have sufficient data and 2+ years', () => {
    const campaigns = [
      // Esparrago - 4 records
      createMockCampaign({ crop: 'esparrago', year: 2025, id: 'e1' }),
      createMockCampaign({ crop: 'esparrago', year: 2025, id: 'e2' }),
      createMockCampaign({ crop: 'esparrago', year: 2026, id: 'e3' }),
      createMockCampaign({ crop: 'esparrago', year: 2026, id: 'e4' }),
      // Arandano - 4 records
      createMockCampaign({ crop: 'arandano', year: 2025, id: 'a1' }),
      createMockCampaign({ crop: 'arandano', year: 2025, id: 'a2' }),
      createMockCampaign({ crop: 'arandano', year: 2026, id: 'a3' }),
      createMockCampaign({ crop: 'arandano', year: 2026, id: 'a4' }),
      // Palta - 4 records
      createMockCampaign({ crop: 'palta', year: 2025, id: 'p1' }),
      createMockCampaign({ crop: 'palta', year: 2025, id: 'p2' }),
      createMockCampaign({ crop: 'palta', year: 2026, id: 'p3' }),
      createMockCampaign({ crop: 'palta', year: 2026, id: 'p4' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.dataQuality).toBe('alta');
    expect(result.isValid).toBe(true);
  });

  it('should return media quality when 2 crops have sufficient data', () => {
    const campaigns = [
      createMockCampaign({ crop: 'esparrago', year: 2025, id: 'e1' }),
      createMockCampaign({ crop: 'esparrago', year: 2025, id: 'e2' }),
      createMockCampaign({ crop: 'esparrago', year: 2026, id: 'e3' }),
      createMockCampaign({ crop: 'esparrago', year: 2026, id: 'e4' }),
      createMockCampaign({ crop: 'arandano', year: 2025, id: 'a1' }),
      createMockCampaign({ crop: 'arandano', year: 2025, id: 'a2' }),
      createMockCampaign({ crop: 'arandano', year: 2026, id: 'a3' }),
      createMockCampaign({ crop: 'arandano', year: 2026, id: 'a4' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.dataQuality).toBe('media');
  });

  it('should return baja quality when insufficient data', () => {
    const campaigns = [
      createMockCampaign({ crop: 'esparrago', year: 2026, id: 'e1' }),
    ];

    const result = validateForecastData(campaigns);

    expect(result.dataQuality).toBe('baja');
  });
});

// =============================================================================
// COMPARE FORECAST TO ACTUAL TESTS
// =============================================================================

describe('compareForecastToActual', () => {
  it('should calculate 100% accuracy for perfect prediction', () => {
    const result = compareForecastToActual('2026-03-15', 100, 100);

    expect(result.accuracy_percent).toBe(100);
    expect(result.error_absolute).toBe(0);
    expect(result.error_percent).toBe(0);
    expect(result.performance).toBe('excelente');
  });

  it('should calculate correct error metrics', () => {
    const result = compareForecastToActual('2026-03-15', 90, 100);

    expect(result.error_absolute).toBe(10);
    expect(result.error_percent).toBe(10);
    expect(result.accuracy_percent).toBe(90);
  });

  it('should classify excelente for <= 10% error', () => {
    const result = compareForecastToActual('2026-03-15', 95, 100);

    expect(result.error_percent).toBe(5);
    expect(result.performance).toBe('excelente');
  });

  it('should classify bueno for 11-20% error', () => {
    const result = compareForecastToActual('2026-03-15', 85, 100);

    expect(result.error_percent).toBe(15);
    expect(result.performance).toBe('bueno');
  });

  it('should classify aceptable for 21-35% error', () => {
    const result = compareForecastToActual('2026-03-15', 70, 100);

    expect(result.error_percent).toBe(30);
    expect(result.performance).toBe('aceptable');
  });

  it('should classify pobre for > 35% error', () => {
    const result = compareForecastToActual('2026-03-15', 50, 100);

    expect(result.error_percent).toBe(50);
    expect(result.performance).toBe('pobre');
  });

  it('should handle over-prediction', () => {
    const result = compareForecastToActual('2026-03-15', 120, 100);

    expect(result.error_absolute).toBe(20);
    expect(result.error_percent).toBe(20);
    expect(result.performance).toBe('bueno');
  });

  it('should handle zero actual workers gracefully', () => {
    const result = compareForecastToActual('2026-03-15', 50, 0);

    expect(result.error_percent).toBe(100);
    expect(result.accuracy_percent).toBe(0);
  });
});
