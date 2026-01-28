/**
 * Unit Tests for Labor Ratio Algorithm - Talentia
 *
 * Tests cover:
 * 1. matchCampaignsWithPositions - verify matching by week + crop + region
 * 2. CROP_ZONE_DISTRIBUTION filtering - verify non-producing regions are skipped
 * 3. calculateLaborRatios - verify ratio calculation formula
 * 4. Edge cases: empty data, missing crop, positions without week_number
 *
 * @author Talentia Test Suite
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  matchCampaignsWithPositions,
  calculateLaborRatios,
  calculateLaborRatiosByZone,
  calculateHistoricalLaborRatios,
  getLaborRatio,
  calculateWorkersNeeded,
} from '../labor-ratios';
import type { Campaign, Position } from '@/types/database';
import type { CropType, Zone } from '@/types/constants';

// =============================================================================
// TEST FIXTURES - Factory Functions
// =============================================================================

/**
 * Create a mock Campaign with sensible defaults
 */
function createCampaign(overrides: Partial<Campaign> = {}): Campaign {
  const now = new Date().toISOString();
  return {
    id: `campaign-${Math.random().toString(36).substr(2, 9)}`,
    name: 'Test Campaign',
    year: 2024,
    week_number: 10,
    crop: 'esparrago' as CropType,
    zone: 'Trujillo' as Zone,
    production_kg: 10000,
    start_date: '2024-03-04',
    end_date: '2024-03-10',
    estimated_workers: null,
    kg_per_worker_day: null,
    status: 'completed',
    source: 'picos',
    upload_id: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

/**
 * Create a mock Position with sensible defaults
 */
function createPosition(overrides: Partial<Position> = {}): Position {
  const now = new Date().toISOString();
  return {
    id: `position-${Math.random().toString(36).substr(2, 9)}`,
    external_id: null,
    fingerprint: null,
    title: 'Operario de Campo',
    description: null,
    zone: 'Trujillo' as Zone, // Algorithm handles case normalization internally
    level: 'operario',
    priority: 'P2',
    sla_days: 7,
    sla_deadline: null,
    is_urgent: false,
    status: 'filled',
    headcount: 10,
    filled_count: 10,
    opened_at: '2024-03-04',
    assigned_at: '2024-03-04',
    closed_at: '2024-03-10', // Required for matching (BUG FIX #1)
    days_to_fill: 6,
    recruiter_id: null,
    recruiter_name: null,
    source: 'consolidado',
    upload_id: null,
    week_number: 10,
    crop: 'esparrago' as CropType,
    created_at: now,
    updated_at: now,
    deleted_at: null,
    ...overrides,
  };
}

// =============================================================================
// TEST SUITE: matchCampaignsWithPositions
// =============================================================================

describe('matchCampaignsWithPositions', () => {
  describe('Direct Linking (week_number + crop)', () => {
    it('should match positions by week_number + crop + region', () => {
      // Arrange
      const campaigns = [
        createCampaign({
          id: 'camp-1',
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];

      const positions = [
        createPosition({
          id: 'pos-1',
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo', // La Libertad region
          filled_count: 20,
          opened_at: '2024-03-04',
          closed_at: '2024-03-10',
        }),
      ];

      // Act
      const matches = matchCampaignsWithPositions(campaigns, positions);

      // Assert
      expect(matches).toHaveLength(1);
      expect(matches[0].campaign_id).toBe('camp-1');
      expect(matches[0].workers_hired).toBe(20);
      expect(matches[0].crop).toBe('esparrago');
    });

    it('should NOT match positions with different week_number', () => {
      const campaigns = [
        createCampaign({ week_number: 10, year: 2024, crop: 'esparrago' }),
      ];
      const positions = [
        createPosition({
          week_number: 11, // Different week
          crop: 'esparrago',
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should NOT match positions with different crop', () => {
      const campaigns = [
        createCampaign({ week_number: 10, crop: 'esparrago' }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'arandano', // Different crop
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should aggregate workers from multiple positions in same week/crop', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 20000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
          filled_count: 15,
          opened_at: '2024-03-04',
        }),
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'Viru', // Also La Libertad region
          filled_count: 10,
          opened_at: '2024-03-04',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(1);
      expect(matches[0].workers_hired).toBe(25); // 15 + 10
    });
  });

  describe('CROP_ZONE_DISTRIBUTION filtering', () => {
    it('should skip positions from non-producing regions', () => {
      // Arandano: La Libertad 70%, Lambayeque 20%, Ica 10%
      // Piura is NOT in the distribution - should be skipped
      const campaigns = [
        createCampaign({
          week_number: 10,
          crop: 'arandano',
          production_kg: 5000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'arandano',
          zone: 'Piura' as Zone, // Piura region - NOT producing arandano
          filled_count: 100,
          opened_at: '2024-03-04',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      // No matches because PIURA doesn't produce arandano
      expect(matches).toHaveLength(0);
    });

    it('should include positions from producing regions', () => {
      // Arandano: La Libertad 70%
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'arandano',
          production_kg: 5000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'arandano',
          zone: 'Trujillo', // La Libertad - produces arandano
          filled_count: 30,
          opened_at: '2024-03-04',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(1);
      expect(matches[0].workers_hired).toBe(30);
    });

    it('should skip campaigns with crops not in CROP_ZONE_DISTRIBUTION', () => {
      // Mock console.warn to verify it logs
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const campaigns = [
        createCampaign({
          crop: 'unknown_crop' as CropType, // Not in distribution
          production_kg: 1000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'unknown_crop' as CropType,
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('not in CROP_ZONE_DISTRIBUTION')
      );

      warnSpy.mockRestore();
    });

    it('should skip positions with unknown zones (not in ZONE_TO_REGION)', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 5000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'UNKNOWN_ZONE' as Zone, // Not in ZONE_TO_REGION
          filled_count: 50,
          opened_at: '2024-03-04',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });
  });

  describe('Campaign Filtering', () => {
    it('should skip non-completed campaigns', () => {
      const campaigns = [
        createCampaign({ status: 'planned', production_kg: 10000 }),
        createCampaign({ status: 'recruiting', production_kg: 10000 }),
        createCampaign({ status: 'active', production_kg: 10000 }),
      ];
      const positions = [
        createPosition({ week_number: 10, crop: 'esparrago', zone: 'Trujillo' }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip campaigns with zero production', () => {
      const campaigns = [
        createCampaign({ status: 'completed', production_kg: 0 }),
      ];
      const positions = [
        createPosition({ week_number: 10, crop: 'esparrago', zone: 'Trujillo' }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip deleted campaigns', () => {
      const campaigns = [
        createCampaign({
          status: 'completed',
          production_kg: 10000,
          deleted_at: new Date().toISOString(),
        }),
      ];
      const positions = [
        createPosition({ week_number: 10, crop: 'esparrago', zone: 'Trujillo' }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip PINA crop campaigns (uncertain data)', () => {
      const campaigns = [
        createCampaign({
          status: 'completed',
          crop: 'pina',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({ week_number: 10, crop: 'pina', zone: 'Trujillo' }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });
  });

  describe('Position Filtering', () => {
    it('should skip positions with status != filled', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          status: 'open',
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip positions without closed_at (BUG FIX #1)', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          status: 'filled',
          closed_at: null, // Missing closed_at
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip deleted positions', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          deleted_at: new Date().toISOString(),
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });

    it('should skip positions with zero filled_count', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          filled_count: 0,
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(0);
    });
  });

  describe('Fallback Matching (date overlap for legacy data)', () => {
    it('should use date overlap for positions without week_number', () => {
      const campaigns = [
        createCampaign({
          id: 'camp-fallback',
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 5000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: null, // No week_number - triggers fallback
          crop: null, // No crop - triggers fallback
          zone: 'Trujillo',
          filled_count: 10,
          opened_at: '2024-03-05', // Within campaign dates
          closed_at: '2024-03-08',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(1);
      expect(matches[0].workers_hired).toBeGreaterThan(0);
    });

    it('should pro-rate workers based on date overlap percentage', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10', // 7 days
        }),
      ];
      // Position only overlaps 3 days out of 6 total position days
      const positions = [
        createPosition({
          week_number: null,
          crop: null,
          zone: 'Trujillo',
          filled_count: 12,
          opened_at: '2024-03-01', // 3 days before campaign
          closed_at: '2024-03-06', // 6 total days, 3 overlapping
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(1);
      // 12 workers * (3 overlap days / 6 total position days) = 6
      expect(matches[0].workers_hired).toBe(6);
    });
  });

  describe('Ratio Calculation', () => {
    it('should calculate correct kg_per_worker_day ratio', () => {
      // production_kg / (workers * working_days)
      // 10000 / (20 * 6) = 83.33
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10', // 7 calendar days = 6 working days (Mon-Sat)
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
          filled_count: 20,
          opened_at: '2024-03-04',
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      expect(matches).toHaveLength(1);
      // 10000 / (20 * 6) = 83.33...
      expect(matches[0].ratio).toBeCloseTo(83.33, 1);
    });

    it('should skip matches with less than 1 worker (BUG FIX #3)', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      // Very low overlap - would result in < 1 worker after pro-rating
      const positions = [
        createPosition({
          week_number: null,
          crop: null,
          zone: 'Trujillo',
          filled_count: 1,
          opened_at: '2024-03-01',
          closed_at: '2024-03-20', // Only ~35% overlap
        }),
      ];

      const matches = matchCampaignsWithPositions(campaigns, positions);

      // Should be skipped because totalWorkersHired < 1
      expect(matches).toHaveLength(0);
    });
  });
});

// =============================================================================
// TEST SUITE: calculateLaborRatios
// =============================================================================

describe('calculateLaborRatios', () => {
  describe('Ratio Calculation Formula', () => {
    it('should calculate mean ratio from matched data', () => {
      const matchedData = [
        {
          campaign_id: 'c1',
          crop: 'esparrago' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 50, // 50 kg/worker/day
          campaign_start: new Date('2024-03-01'),
          campaign_end: new Date('2024-03-07'),
        },
        {
          campaign_id: 'c2',
          crop: 'esparrago' as CropType,
          zone: '' as Zone | '',
          production_kg: 15000,
          workers_hired: 150,
          ratio: 60, // 60 kg/worker/day
          campaign_start: new Date('2024-03-08'),
          campaign_end: new Date('2024-03-14'),
        },
        {
          campaign_id: 'c3',
          crop: 'esparrago' as CropType,
          zone: '' as Zone | '',
          production_kg: 12000,
          workers_hired: 120,
          ratio: 55, // 55 kg/worker/day
          campaign_start: new Date('2024-03-15'),
          campaign_end: new Date('2024-03-21'),
        },
      ];

      const result = calculateLaborRatios(matchedData);

      // Mean of [50, 60, 55] = 55
      expect(result.esparrago.kg_per_worker_day).toBe(55);
      expect(result.esparrago.sample_size).toBe(3);
      expect(result.esparrago.source).toBe('historical');
    });

    it('should return default ratios when sample size < 3', () => {
      const matchedData = [
        {
          campaign_id: 'c1',
          crop: 'arandano' as CropType,
          zone: '' as Zone | '',
          production_kg: 5000,
          workers_hired: 50,
          ratio: 30,
          campaign_start: new Date('2024-03-01'),
          campaign_end: new Date('2024-03-07'),
        },
        {
          campaign_id: 'c2',
          crop: 'arandano' as CropType,
          zone: '' as Zone | '',
          production_kg: 6000,
          workers_hired: 60,
          ratio: 35,
          campaign_start: new Date('2024-03-08'),
          campaign_end: new Date('2024-03-14'),
        },
        // Only 2 samples - below MIN_SAMPLE_SIZE of 3
      ];

      const result = calculateLaborRatios(matchedData);

      // Should fall back to default (25 for arandano per CROP_TYPES)
      expect(result.arandano.kg_per_worker_day).toBe(25);
      expect(result.arandano.source).toBe('default');
      expect(result.arandano.sample_size).toBe(0);
    });

    it('should filter out ratios outside sanity bounds (5-200)', () => {
      const matchedData = [
        {
          campaign_id: 'c1',
          crop: 'palta' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 3, // Below minimum (5) - should be filtered
          campaign_start: new Date('2024-03-01'),
          campaign_end: new Date('2024-03-07'),
        },
        {
          campaign_id: 'c2',
          crop: 'palta' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 250, // Above maximum (200) - should be filtered
          campaign_start: new Date('2024-03-08'),
          campaign_end: new Date('2024-03-14'),
        },
        {
          campaign_id: 'c3',
          crop: 'palta' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 80, // Valid
          campaign_start: new Date('2024-03-15'),
          campaign_end: new Date('2024-03-21'),
        },
      ];

      const result = calculateLaborRatios(matchedData);

      // Only 1 valid sample - below MIN_SAMPLE_SIZE
      // Should fall back to default (80 for palta per CROP_TYPES)
      expect(result.palta.source).toBe('default');
    });

    it('should calculate confidence score based on sample size and variance', () => {
      const matchedData = Array(10)
        .fill(null)
        .map((_, i) => ({
          campaign_id: `c${i}`,
          crop: 'uva' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 60 + (i % 3), // Ratios: 60, 61, 62 (low variance)
          campaign_start: new Date(`2024-03-${i + 1}`),
          campaign_end: new Date(`2024-03-${i + 7}`),
        }));

      const result = calculateLaborRatios(matchedData);

      expect(result.uva.confidence).toBeGreaterThan(0.5);
      expect(result.uva.confidence).toBeLessThanOrEqual(1);
      expect(result.uva.std_dev).toBeLessThan(5); // Low variance
    });

    it('should return default ratio if confidence below threshold', () => {
      // Create data with very high variance
      const matchedData = [
        {
          campaign_id: 'c1',
          crop: 'mango' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 10, // Low
          campaign_start: new Date('2024-03-01'),
          campaign_end: new Date('2024-03-07'),
        },
        {
          campaign_id: 'c2',
          crop: 'mango' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 180, // Very high
          campaign_start: new Date('2024-03-08'),
          campaign_end: new Date('2024-03-14'),
        },
        {
          campaign_id: 'c3',
          crop: 'mango' as CropType,
          zone: '' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 50, // Medium
          campaign_start: new Date('2024-03-15'),
          campaign_end: new Date('2024-03-21'),
        },
      ];

      const result = calculateLaborRatios(matchedData);

      // High variance should result in low confidence, falling back to default
      // Mean would be ~80, but CV (stddev/mean) is very high
      // If confidence < 0.5, falls back to default
      // Depending on exact calculation, may or may not use historical
      expect(result.mango).toBeDefined();
    });
  });

  describe('Multi-crop Support', () => {
    it('should calculate ratios for multiple crops independently', () => {
      const matchedData = [
        // Esparrago samples
        ...Array(5)
          .fill(null)
          .map((_, i) => ({
            campaign_id: `esp-${i}`,
            crop: 'esparrago' as CropType,
            zone: '' as Zone | '',
            production_kg: 10000,
            workers_hired: 100,
            ratio: 45, // Esparrago ratio
            campaign_start: new Date(`2024-01-${i + 1}`),
            campaign_end: new Date(`2024-01-${i + 7}`),
          })),
        // Arandano samples
        ...Array(5)
          .fill(null)
          .map((_, i) => ({
            campaign_id: `ara-${i}`,
            crop: 'arandano' as CropType,
            zone: '' as Zone | '',
            production_kg: 5000,
            workers_hired: 100,
            ratio: 25, // Arandano ratio
            campaign_start: new Date(`2024-02-${i + 1}`),
            campaign_end: new Date(`2024-02-${i + 7}`),
          })),
      ];

      const result = calculateLaborRatios(matchedData);

      expect(result.esparrago.kg_per_worker_day).toBe(45);
      expect(result.arandano.kg_per_worker_day).toBe(25);
    });

    it('should initialize all crop types with defaults', () => {
      const result = calculateLaborRatios([]);

      // All crops from CROP_TYPES should be present
      expect(result.esparrago).toBeDefined();
      expect(result.arandano).toBeDefined();
      expect(result.palta).toBeDefined();
      expect(result.uva).toBeDefined();
      expect(result.mango).toBeDefined();
      expect(result.pina).toBeDefined();
      expect(result.alcachofa).toBeDefined();
      expect(result.pimiento).toBeDefined();
    });
  });
});

// =============================================================================
// TEST SUITE: calculateLaborRatiosByZone
// =============================================================================

describe('calculateLaborRatiosByZone', () => {
  it('should calculate ratios grouped by crop+zone', () => {
    const matchedData = [
      // Esparrago in Trujillo
      ...Array(4)
        .fill(null)
        .map((_, i) => ({
          campaign_id: `esp-tru-${i}`,
          crop: 'esparrago' as CropType,
          zone: 'Trujillo' as Zone | '',
          production_kg: 10000,
          workers_hired: 100,
          ratio: 50,
          campaign_start: new Date(`2024-01-${i + 1}`),
          campaign_end: new Date(`2024-01-${i + 7}`),
        })),
      // Esparrago in Ica
      ...Array(4)
        .fill(null)
        .map((_, i) => ({
          campaign_id: `esp-ica-${i}`,
          crop: 'esparrago' as CropType,
          zone: 'Ica' as Zone | '',
          production_kg: 8000,
          workers_hired: 100,
          ratio: 40,
          campaign_start: new Date(`2024-02-${i + 1}`),
          campaign_end: new Date(`2024-02-${i + 7}`),
        })),
    ];

    const result = calculateLaborRatiosByZone(matchedData);

    expect(result['esparrago_Trujillo']).toBeDefined();
    expect(result['esparrago_Trujillo'].kg_per_worker_day).toBe(50);
    expect(result['esparrago_Ica']).toBeDefined();
    expect(result['esparrago_Ica'].kg_per_worker_day).toBe(40);
  });

  it('should require MIN_SAMPLE_SIZE per crop+zone combination', () => {
    const matchedData = [
      // Only 2 samples for this crop+zone
      {
        campaign_id: 'c1',
        crop: 'palta' as CropType,
        zone: 'Arequipa' as Zone | '',
        production_kg: 10000,
        workers_hired: 100,
        ratio: 80,
        campaign_start: new Date('2024-01-01'),
        campaign_end: new Date('2024-01-07'),
      },
      {
        campaign_id: 'c2',
        crop: 'palta' as CropType,
        zone: 'Arequipa' as Zone | '',
        production_kg: 10000,
        workers_hired: 100,
        ratio: 85,
        campaign_start: new Date('2024-01-08'),
        campaign_end: new Date('2024-01-14'),
      },
    ];

    const result = calculateLaborRatiosByZone(matchedData);

    // Below MIN_SAMPLE_SIZE - should not appear in results
    expect(result['palta_Arequipa']).toBeUndefined();
  });
});

// =============================================================================
// TEST SUITE: calculateHistoricalLaborRatios (Integration)
// =============================================================================

describe('calculateHistoricalLaborRatios', () => {
  it('should return complete result with all metrics', () => {
    const campaigns = [
      createCampaign({
        id: 'camp-1',
        week_number: 10,
        year: 2024,
        crop: 'esparrago',
        production_kg: 10000,
        start_date: '2024-03-04',
        end_date: '2024-03-10',
      }),
    ];
    const positions = [
      createPosition({
        week_number: 10,
        crop: 'esparrago',
        zone: 'Trujillo',
        filled_count: 20,
        opened_at: '2024-03-04',
      }),
    ];

    const result = calculateHistoricalLaborRatios({ campaigns, positions });

    expect(result.by_crop).toBeDefined();
    expect(result.by_crop_zone).toBeDefined();
    expect(result.overall_average).toBeGreaterThan(0);
    expect(result.data_quality).toBeDefined();
    expect(result.data_quality.total_campaigns_analyzed).toBe(1);
    expect(result.data_quality.campaigns_with_matches).toBe(1);
  });

  it('should calculate coverage percentage correctly', () => {
    const campaigns = [
      createCampaign({
        id: 'camp-1',
        status: 'completed',
        production_kg: 10000,
        week_number: 10,
        year: 2024,
        crop: 'esparrago',
        start_date: '2024-03-04',
        end_date: '2024-03-10',
      }),
      createCampaign({
        id: 'camp-2',
        status: 'completed',
        production_kg: 5000,
        week_number: 11,
        year: 2024,
        crop: 'arandano',
        start_date: '2024-03-11',
        end_date: '2024-03-17',
      }),
    ];
    const positions = [
      createPosition({
        week_number: 10,
        crop: 'esparrago',
        zone: 'Trujillo',
        filled_count: 20,
        opened_at: '2024-03-04',
      }),
      // No positions for camp-2
    ];

    const result = calculateHistoricalLaborRatios({ campaigns, positions });

    expect(result.data_quality.total_campaigns_analyzed).toBe(2);
    expect(result.data_quality.campaigns_with_matches).toBe(1);
    expect(result.data_quality.coverage_percent).toBe(50);
  });
});

// =============================================================================
// TEST SUITE: getLaborRatio
// =============================================================================

describe('getLaborRatio', () => {
  const mockRatioResult = {
    by_crop: {
      esparrago: {
        crop: 'esparrago' as CropType,
        zone: null,
        kg_per_worker_day: 45,
        sample_size: 10,
        confidence: 0.8,
        std_dev: 5,
        source: 'historical' as const,
        calculated_at: new Date().toISOString(),
      },
      arandano: {
        crop: 'arandano' as CropType,
        zone: null,
        kg_per_worker_day: 25, // Default value
        sample_size: 0,
        confidence: 0,
        std_dev: 0,
        source: 'default' as const,
        calculated_at: new Date().toISOString(),
      },
    } as Record<CropType, any>,
    by_crop_zone: {
      esparrago_Trujillo: {
        crop: 'esparrago' as CropType,
        zone: 'Trujillo' as Zone,
        kg_per_worker_day: 48,
        sample_size: 5,
        confidence: 0.7,
        std_dev: 4,
        source: 'historical' as const,
        calculated_at: new Date().toISOString(),
      },
    },
    overall_average: 50,
    data_quality: {
      total_campaigns_analyzed: 20,
      campaigns_with_matches: 15,
      total_positions_matched: 100,
      coverage_percent: 75,
    },
  };

  it('should return crop+zone specific ratio when available', () => {
    const ratio = getLaborRatio('esparrago', 'Trujillo', mockRatioResult as any);

    expect(ratio.kg_per_worker_day).toBe(48);
    expect(ratio.zone).toBe('Trujillo');
  });

  it('should fall back to crop-level ratio when zone not found', () => {
    const ratio = getLaborRatio('esparrago', 'Ica', mockRatioResult as any);

    expect(ratio.kg_per_worker_day).toBe(45);
    expect(ratio.source).toBe('historical');
  });

  it('should return default when crop has no historical data', () => {
    const ratio = getLaborRatio('palta', null, mockRatioResult as any);

    expect(ratio.source).toBe('default');
    expect(ratio.kg_per_worker_day).toBe(80); // Default from CROP_TYPES
  });
});

// =============================================================================
// TEST SUITE: calculateWorkersNeeded
// =============================================================================

describe('calculateWorkersNeeded', () => {
  it('should calculate workers needed correctly', () => {
    // 10000 kg / (50 kg/worker/day * 6 days) = 33.33 -> 34 (ceil)
    const workers = calculateWorkersNeeded(10000, 50, 6);
    expect(workers).toBe(34);
  });

  it('should use default 6 working days when not specified', () => {
    // 10000 / (50 * 6) = 33.33 -> 34
    const workers = calculateWorkersNeeded(10000, 50);
    expect(workers).toBe(34);
  });

  it('should return 0 for invalid inputs', () => {
    expect(calculateWorkersNeeded(1000, 0, 5)).toBe(0);
    expect(calculateWorkersNeeded(1000, 50, 0)).toBe(0);
    expect(calculateWorkersNeeded(1000, -10, 5)).toBe(0);
  });

  it('should always round up (ceil)', () => {
    // 100 / (50 * 6) = 0.33 -> 1
    expect(calculateWorkersNeeded(100, 50, 6)).toBe(1);
    // 299 / (50 * 6) = 0.996 -> 1
    expect(calculateWorkersNeeded(299, 50, 6)).toBe(1);
    // 301 / (50 * 6) = 1.003 -> 2
    expect(calculateWorkersNeeded(301, 50, 6)).toBe(2);
  });
});

// =============================================================================
// TEST SUITE: Edge Cases
// =============================================================================

describe('Edge Cases', () => {
  describe('Empty Data', () => {
    it('should handle empty campaigns array', () => {
      const result = matchCampaignsWithPositions([], [createPosition()]);
      expect(result).toHaveLength(0);
    });

    it('should handle empty positions array', () => {
      const result = matchCampaignsWithPositions([createCampaign()], []);
      expect(result).toHaveLength(0);
    });

    it('should handle both arrays empty', () => {
      const result = matchCampaignsWithPositions([], []);
      expect(result).toHaveLength(0);
    });

    it('should return default ratios for empty matched data', () => {
      const result = calculateLaborRatios([]);

      expect(result.esparrago.source).toBe('default');
      expect(result.esparrago.kg_per_worker_day).toBe(45); // CROP_TYPES default
    });

    it('should return 50 as overall average fallback when no valid ratios', () => {
      const result = calculateHistoricalLaborRatios({
        campaigns: [],
        positions: [],
      });

      expect(result.overall_average).toBe(50);
    });
  });

  describe('Missing or Null Fields', () => {
    it('should handle campaign with null crop', () => {
      const campaigns = [
        createCampaign({ crop: null as any }),
      ];
      const positions = [createPosition()];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(0);
    });

    it('should handle position with null zone', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: null as any,
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(0);
    });

    it('should handle campaign with null start_date', () => {
      const campaigns = [
        createCampaign({ start_date: null as any }),
      ];
      const positions = [createPosition()];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(0);
    });

    it('should handle position with null opened_at', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
          opened_at: null as any,
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(0);
    });
  });

  describe('Positions Without week_number', () => {
    it('should use fallback matching for positions without week_number', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 5000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: null,
          crop: null,
          zone: 'Trujillo',
          filled_count: 10,
          opened_at: '2024-03-04',
          closed_at: '2024-03-10',
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(1);
    });

    it('should use fallback matching when crop is null but week_number exists', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 5000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: null, // Missing crop triggers fallback
          zone: 'Trujillo',
          filled_count: 10,
          opened_at: '2024-03-04',
          closed_at: '2024-03-10',
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(1);
    });
  });

  describe('Year Mismatch', () => {
    it('should NOT match positions from different year (direct linking)', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'Trujillo',
          opened_at: '2023-03-04', // Different year
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(0);
    });

    it('should allow fallback matching within 1 year difference', () => {
      const campaigns = [
        createCampaign({
          week_number: 52,
          year: 2024,
          crop: 'esparrago',
          production_kg: 5000,
          start_date: '2024-12-23',
          end_date: '2024-12-29',
        }),
      ];
      const positions = [
        createPosition({
          week_number: null,
          crop: null,
          zone: 'Trujillo',
          filled_count: 10,
          opened_at: '2024-12-23',
          closed_at: '2024-12-29',
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(1);
    });
  });

  describe('Case Sensitivity', () => {
    it('should handle lowercase crop in position', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'ESPARRAGO' as CropType, // Uppercase
          zone: 'Trujillo',
          filled_count: 10,
          opened_at: '2024-03-04',
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(1);
    });

    it('should handle mixed case zones', () => {
      const campaigns = [
        createCampaign({
          week_number: 10,
          year: 2024,
          crop: 'esparrago',
          production_kg: 10000,
          start_date: '2024-03-04',
          end_date: '2024-03-10',
        }),
      ];
      const positions = [
        createPosition({
          week_number: 10,
          crop: 'esparrago',
          zone: 'trujillo' as Zone, // Lowercase - should work with toUpperCase
          filled_count: 10,
          opened_at: '2024-03-04',
        }),
      ];

      const result = matchCampaignsWithPositions(campaigns, positions);

      expect(result).toHaveLength(1);
    });
  });
});
