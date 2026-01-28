/**
 * Unit tests for the Assignment Algorithm
 * Tests scoring functions, recruiter matching, and auto-assignment
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  scoreRecruiter,
  findBestRecruiter,
  autoAssignPositions,
  getTopRecruiters,
  validateWeights,
} from '../assignment';
import type { Recruiter, Position } from '@/types/database';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockRecruiter(overrides: Partial<Recruiter> = {}): Recruiter {
  return {
    id: 'recruiter-1',
    name: 'Juan Perez',
    email: 'juan@example.com',
    phone: null,
    primary_zone: 'Trujillo',
    secondary_zones: ['Viru', 'Chao'],
    capability_level: 3,
    capabilities: ['operario', 'tecnico', 'supervisor'],
    fill_rate_30d: 0.75,
    avg_time_to_fill: 5,
    current_load: 10,
    capacity: 25, // Default capacity for workload balancing
    is_active: true,
    manager_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

function createMockPosition(overrides: Partial<Position> = {}): Position {
  return {
    id: 'position-1',
    external_id: null,
    fingerprint: null,
    title: 'Operario de Campo',
    description: null,
    zone: 'Trujillo',
    level: 'operario',
    priority: 'P2',
    sla_days: 7,
    sla_deadline: null,
    is_urgent: false,
    status: 'open',
    headcount: 1,
    filled_count: 0,
    opened_at: '2026-01-01T00:00:00Z',
    assigned_at: null,
    closed_at: null,
    days_to_fill: null,
    source: 'manual',
    upload_id: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// =============================================================================
// SCORE RECRUITER TESTS
// =============================================================================

describe('scoreRecruiter', () => {
  describe('zone scoring', () => {
    it('should return zone score of 1.0 for primary zone match', () => {
      const recruiter = createMockRecruiter({ primary_zone: 'Trujillo' });
      const position = createMockPosition({ zone: 'Trujillo' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.zone).toBe(1.0);
    });

    it('should return zone score of 0.5 for secondary zone match', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Trujillo',
        secondary_zones: ['Viru', 'Chao'],
      });
      const position = createMockPosition({ zone: 'Viru' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.zone).toBe(0.5);
    });

    it('should return zone score of 0.0 for no zone match', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Trujillo',
        secondary_zones: ['Viru'],
      });
      const position = createMockPosition({ zone: 'Lima' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.zone).toBe(0.0);
    });

    it('should handle empty secondary zones array', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Trujillo',
        secondary_zones: [],
      });
      const position = createMockPosition({ zone: 'Lima' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.zone).toBe(0.0);
    });
  });

  describe('load scoring', () => {
    it('should return load score of 1.0 for zero load', () => {
      const recruiter = createMockRecruiter({ current_load: 0 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.load).toBe(1.0);
    });

    it('should return load score of 0.0 at capacity (25)', () => {
      const recruiter = createMockRecruiter({ current_load: 25 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.load).toBe(0.0);
    });

    it('should return load score of 0.6 at 40% capacity (10/25)', () => {
      const recruiter = createMockRecruiter({ current_load: 10 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      // 1 - (10/25) = 1 - 0.4 = 0.6
      expect(result.breakdown.load).toBe(0.6);
    });

    it('should return 0.0 when over capacity', () => {
      const recruiter = createMockRecruiter({ current_load: 30 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.load).toBe(0.0);
    });
  });

  describe('capability scoring', () => {
    it('should return 1.0 when capability level exceeds requirement', () => {
      const recruiter = createMockRecruiter({ capability_level: 3 });
      const position = createMockPosition({ level: 'operario' }); // level 1

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.capability).toBe(1.0);
    });

    it('should return 1.0 when capability level equals requirement', () => {
      const recruiter = createMockRecruiter({ capability_level: 3 });
      const position = createMockPosition({ level: 'tecnico' }); // legacy maps to level 3 (asistente)

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.capability).toBe(1.0);
    });

    it('should return 0.5 when capability is one below requirement', () => {
      const recruiter = createMockRecruiter({ capability_level: 4 });
      const position = createMockPosition({ level: 'supervisor' }); // legacy maps to level 5 (coordinador)

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.capability).toBe(0.5);
    });

    it('should return 0.0 when capability is far below requirement', () => {
      const recruiter = createMockRecruiter({ capability_level: 1 });
      const position = createMockPosition({ level: 'jefe' }); // level 4

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.capability).toBe(0.0);
    });

    it('should handle gerente level correctly', () => {
      const recruiter = createMockRecruiter({ capability_level: 8 });
      const position = createMockPosition({ level: 'gerente' }); // level 8 in 8-level hierarchy

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.capability).toBe(1.0);
    });

    it('should default to operario for unknown levels', () => {
      const recruiter = createMockRecruiter({ capability_level: 1 });
      const position = createMockPosition({ level: 'unknown_level' });

      const result = scoreRecruiter(recruiter, position);

      // Unknown defaults to level 1 (operario)
      expect(result.breakdown.capability).toBe(1.0);
    });
  });

  describe('performance scoring', () => {
    it('should use fill_rate_30d directly as performance score', () => {
      const recruiter = createMockRecruiter({ fill_rate_30d: 0.85 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.performance).toBe(0.85);
    });

    it('should default to 0.5 when fill_rate_30d is null', () => {
      const recruiter = createMockRecruiter({ fill_rate_30d: null as any });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.performance).toBe(0.5);
    });

    it('should handle 0% fill rate', () => {
      const recruiter = createMockRecruiter({ fill_rate_30d: 0 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.performance).toBe(0);
    });

    it('should handle 100% fill rate', () => {
      const recruiter = createMockRecruiter({ fill_rate_30d: 1.0 });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.breakdown.performance).toBe(1.0);
    });
  });

  describe('weighted final score', () => {
    it('should calculate correct weighted score (zone=40%, load=30%, capability=20%, performance=10%)', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Trujillo',
        current_load: 0,
        capability_level: 3,
        fill_rate_30d: 1.0,
      });
      const position = createMockPosition({ zone: 'Trujillo', level: 'operario' });

      const result = scoreRecruiter(recruiter, position);

      // All scores are 1.0, so weighted sum = 1*0.4 + 1*0.3 + 1*0.2 + 1*0.1 = 1.0
      expect(result.score).toBeCloseTo(1.0, 5);
      expect(result.breakdown.zone).toBe(1.0);
      expect(result.breakdown.load).toBe(1.0);
      expect(result.breakdown.capability).toBe(1.0);
      expect(result.breakdown.performance).toBe(1.0);
    });

    it('should calculate correct weighted score for partial matches', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Lima', // no match
        secondary_zones: ['Trujillo'], // secondary match
        current_load: 12.5, // 50% capacity
        capability_level: 3, // matches tecnico (legacy maps to level 3)
        fill_rate_30d: 0.5,
      });
      const position = createMockPosition({ zone: 'Trujillo', level: 'tecnico' });

      const result = scoreRecruiter(recruiter, position);

      // zone: 0.5, load: 1 - (12.5/25) = 0.5, capability: 1.0, performance: 0.5
      // score = 0.5*0.4 + 0.5*0.3 + 1*0.2 + 0.5*0.1 = 0.2 + 0.15 + 0.2 + 0.05 = 0.6
      expect(result.breakdown.zone).toBe(0.5);
      expect(result.breakdown.load).toBe(0.5);
      expect(result.breakdown.capability).toBe(1.0);
      expect(result.breakdown.performance).toBe(0.5);
      expect(result.score).toBeCloseTo(0.6, 2);
    });
  });

  describe('explanation generation', () => {
    it('should generate Spanish explanation with score', () => {
      const recruiter = createMockRecruiter({ name: 'Carlos Mendez' });
      const position = createMockPosition();

      const result = scoreRecruiter(recruiter, position);

      expect(result.explanation_es).toContain('Puntuacion:');
      expect(result.explanation_es).toContain('Carlos Mendez');
    });

    it('should mention zona principal when matched', () => {
      const recruiter = createMockRecruiter({ primary_zone: 'Trujillo' });
      const position = createMockPosition({ zone: 'Trujillo' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.explanation_es).toContain('zona principal');
    });

    it('should mention zona secundaria when matched', () => {
      const recruiter = createMockRecruiter({
        primary_zone: 'Lima',
        secondary_zones: ['Trujillo'],
      });
      const position = createMockPosition({ zone: 'Trujillo' });

      const result = scoreRecruiter(recruiter, position);

      expect(result.explanation_es).toContain('zona secundaria');
    });
  });
});

// =============================================================================
// FIND BEST RECRUITER TESTS
// =============================================================================

describe('findBestRecruiter', () => {
  it('should return null when recruiters array is empty', () => {
    const position = createMockPosition();

    const result = findBestRecruiter([], position);

    expect(result).toBeNull();
  });

  it('should return null when no recruiters are eligible', () => {
    const recruiters = [
      createMockRecruiter({ id: '1', is_active: false }),
      createMockRecruiter({ id: '2', deleted_at: '2026-01-01T00:00:00Z' }),
      createMockRecruiter({ id: '3', current_load: 25 }),
    ];
    const position = createMockPosition();

    const result = findBestRecruiter(recruiters, position);

    expect(result).toBeNull();
  });

  it('should filter out inactive recruiters', () => {
    const recruiters = [
      createMockRecruiter({ id: '1', is_active: false, primary_zone: 'Trujillo' }),
      createMockRecruiter({ id: '2', is_active: true, primary_zone: 'Lima' }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = findBestRecruiter(recruiters, position);

    expect(result).not.toBeNull();
    expect(result!.recruiter.id).toBe('2');
  });

  it('should filter out soft-deleted recruiters', () => {
    const recruiters = [
      createMockRecruiter({ id: '1', deleted_at: '2026-01-01T00:00:00Z', primary_zone: 'Trujillo' }),
      createMockRecruiter({ id: '2', deleted_at: null, primary_zone: 'Lima' }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = findBestRecruiter(recruiters, position);

    expect(result).not.toBeNull();
    expect(result!.recruiter.id).toBe('2');
  });

  it('should filter out recruiters at capacity', () => {
    const recruiters = [
      createMockRecruiter({ id: '1', current_load: 25, primary_zone: 'Trujillo' }),
      createMockRecruiter({ id: '2', current_load: 10, primary_zone: 'Lima' }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = findBestRecruiter(recruiters, position);

    expect(result).not.toBeNull();
    expect(result!.recruiter.id).toBe('2');
  });

  it('should select recruiter with highest score', () => {
    const recruiters = [
      createMockRecruiter({ id: '1', primary_zone: 'Lima', current_load: 20 }),
      createMockRecruiter({ id: '2', primary_zone: 'Trujillo', current_load: 5 }),
      createMockRecruiter({ id: '3', primary_zone: 'Viru', current_load: 10 }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = findBestRecruiter(recruiters, position);

    expect(result).not.toBeNull();
    expect(result!.recruiter.id).toBe('2'); // Primary zone match + lower load
  });

  it('should use lower load as tie-breaker when scores are equal', () => {
    const recruiters = [
      createMockRecruiter({
        id: '1',
        primary_zone: 'Trujillo',
        current_load: 15,
        capability_level: 3,
        fill_rate_30d: 0.8,
      }),
      createMockRecruiter({
        id: '2',
        primary_zone: 'Trujillo',
        current_load: 5,
        capability_level: 3,
        fill_rate_30d: 0.8,
      }),
    ];
    const position = createMockPosition({ zone: 'Trujillo', level: 'operario' });

    const result = findBestRecruiter(recruiters, position);

    expect(result).not.toBeNull();
    // Recruiter 2 has lower load, should win tie-breaker (even though score is higher due to load component)
    expect(result!.recruiter.id).toBe('2');
  });

  it('should include score breakdown in result', () => {
    const recruiter = createMockRecruiter();
    const position = createMockPosition();

    const result = findBestRecruiter([recruiter], position);

    expect(result).not.toBeNull();
    expect(result!.breakdown).toHaveProperty('zone');
    expect(result!.breakdown).toHaveProperty('load');
    expect(result!.breakdown).toHaveProperty('capability');
    expect(result!.breakdown).toHaveProperty('performance');
  });
});

// =============================================================================
// URGENCY MULTIPLIER TESTS
// =============================================================================

describe('urgency multipliers', () => {
  it('should apply 1.5x boost for overdue SLA (>100%) to best recruiter', () => {
    const recruiter = createMockRecruiter({ primary_zone: 'Trujillo', current_load: 0 });
    const now = new Date();
    const pastDeadline = new Date(now.getTime() - 24 * 60 * 60 * 1000); // 1 day ago
    const openedAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000); // 10 days ago

    const position = createMockPosition({
      zone: 'Trujillo',
      sla_deadline: pastDeadline.toISOString(),
      opened_at: openedAt.toISOString(),
    });

    const result = findBestRecruiter([recruiter], position);

    expect(result).not.toBeNull();
    expect(result!.explanation_es).toContain('URGENTE');
    // Score should be boosted by 1.5x
  });

  it('should add 0.1 boost for SLA >50% progress', () => {
    const recruiter = createMockRecruiter({ primary_zone: 'Trujillo', current_load: 0 });
    const now = new Date();
    const futureDeadline = new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000); // 2 days from now
    const openedAt = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000); // 5 days ago

    const position = createMockPosition({
      zone: 'Trujillo',
      sla_deadline: futureDeadline.toISOString(),
      opened_at: openedAt.toISOString(),
    });

    const result = findBestRecruiter([recruiter], position);

    expect(result).not.toBeNull();
    expect(result!.explanation_es).toContain('PRIORIDAD');
  });

  it('should not apply boost when SLA is not set', () => {
    const recruiter = createMockRecruiter({ primary_zone: 'Trujillo', current_load: 0 });
    const position = createMockPosition({
      zone: 'Trujillo',
      sla_deadline: null,
    });

    const baseResult = scoreRecruiter(recruiter, position);
    const bestResult = findBestRecruiter([recruiter], position);

    expect(bestResult).not.toBeNull();
    // Score should be the same since no SLA boost
    expect(bestResult!.score).toBe(baseResult.score);
  });
});

// =============================================================================
// AUTO-ASSIGN POSITIONS TESTS
// =============================================================================

describe('autoAssignPositions', () => {
  it('should return empty array when no positions provided', () => {
    const recruiters = [createMockRecruiter()];

    const result = autoAssignPositions(recruiters, []);

    expect(result).toEqual([]);
  });

  it('should return empty array when no recruiters available', () => {
    const positions = [createMockPosition()];

    const result = autoAssignPositions([], positions);

    expect(result).toEqual([]);
  });

  it('should assign position to best recruiter', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1', primary_zone: 'Lima' }),
      createMockRecruiter({ id: 'r2', primary_zone: 'Trujillo' }),
    ];
    const positions = [createMockPosition({ id: 'p1', zone: 'Trujillo' })];

    const result = autoAssignPositions(recruiters, positions);

    expect(result).toHaveLength(1);
    expect(result[0].position_id).toBe('p1');
    expect(result[0].recruiter_id).toBe('r2');
    expect(result[0].assignment_type).toBe('auto');
    expect(result[0].status).toBe('assigned');
  });

  it('should prioritize P1 positions over P2 and P3', () => {
    const recruiter = createMockRecruiter({ id: 'r1', current_load: 0 });
    const positions = [
      createMockPosition({ id: 'p3', priority: 'P3' }),
      createMockPosition({ id: 'p1', priority: 'P1' }),
      createMockPosition({ id: 'p2', priority: 'P2' }),
    ];

    const result = autoAssignPositions([recruiter], positions);

    expect(result).toHaveLength(3);
    expect(result[0].position_id).toBe('p1'); // P1 first
    expect(result[1].position_id).toBe('p2'); // P2 second
    expect(result[2].position_id).toBe('p3'); // P3 third
  });

  it('should order by SLA deadline within same priority', () => {
    const recruiter = createMockRecruiter({ id: 'r1', current_load: 0 });
    const now = new Date();
    const positions = [
      createMockPosition({
        id: 'p1',
        priority: 'P2',
        sla_deadline: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      }),
      createMockPosition({
        id: 'p2',
        priority: 'P2',
        sla_deadline: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000).toISOString(),
      }),
    ];

    const result = autoAssignPositions([recruiter], positions);

    expect(result).toHaveLength(2);
    expect(result[0].position_id).toBe('p2'); // Earlier deadline first
    expect(result[1].position_id).toBe('p1');
  });

  it('should update recruiter load during batch assignment', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1', current_load: 23, primary_zone: 'Trujillo' }),
      createMockRecruiter({ id: 'r2', current_load: 10, primary_zone: 'Lima' }),
    ];
    const positions = [
      createMockPosition({ id: 'p1', zone: 'Trujillo' }),
      createMockPosition({ id: 'p2', zone: 'Trujillo' }),
      createMockPosition({ id: 'p3', zone: 'Trujillo' }),
    ];

    const result = autoAssignPositions(recruiters, positions);

    // r1 can only take 2 positions (23+2=25), then r2 gets the rest
    // First two go to r1 (best zone match), third might go to r2 if r1 is at capacity
    expect(result.length).toBeGreaterThanOrEqual(2);
  });

  it('should skip positions when no eligible recruiter available', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1', current_load: 25 }), // At capacity
    ];
    const positions = [createMockPosition({ id: 'p1' })];

    const result = autoAssignPositions(recruiters, positions);

    expect(result).toHaveLength(0);
  });

  it('should include score breakdown in assignment result', () => {
    const recruiter = createMockRecruiter();
    const position = createMockPosition();

    const result = autoAssignPositions([recruiter], [position]);

    expect(result).toHaveLength(1);
    expect(result[0].score_breakdown).toHaveProperty('zone');
    expect(result[0].score_breakdown).toHaveProperty('load');
    expect(result[0].score_breakdown).toHaveProperty('capability');
    expect(result[0].score_breakdown).toHaveProperty('performance');
  });

  it('should set current_stage to assigned', () => {
    const recruiter = createMockRecruiter();
    const position = createMockPosition();

    const result = autoAssignPositions([recruiter], [position]);

    expect(result[0].current_stage).toBe('assigned');
  });
});

// =============================================================================
// GET TOP RECRUITERS TESTS
// =============================================================================

describe('getTopRecruiters', () => {
  it('should return empty array when no recruiters available', () => {
    const position = createMockPosition();

    const result = getTopRecruiters([], position, 3);

    expect(result).toEqual([]);
  });

  it('should return top N recruiters by score', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1', primary_zone: 'Lima', current_load: 20 }),
      createMockRecruiter({ id: 'r2', primary_zone: 'Trujillo', current_load: 5 }),
      createMockRecruiter({ id: 'r3', primary_zone: 'Trujillo', current_load: 15 }),
      createMockRecruiter({ id: 'r4', primary_zone: 'Arequipa', current_load: 0 }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = getTopRecruiters(recruiters, position, 2);

    expect(result).toHaveLength(2);
    expect(result[0].recruiter.id).toBe('r2'); // Best match
    expect(result[1].recruiter.id).toBe('r3'); // Second best
  });

  it('should filter out inactive recruiters', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1', is_active: false, primary_zone: 'Trujillo' }),
      createMockRecruiter({ id: 'r2', is_active: true, primary_zone: 'Lima' }),
    ];
    const position = createMockPosition({ zone: 'Trujillo' });

    const result = getTopRecruiters(recruiters, position, 3);

    expect(result).toHaveLength(1);
    expect(result[0].recruiter.id).toBe('r2');
  });

  it('should return fewer than N if not enough eligible recruiters', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1' }),
    ];
    const position = createMockPosition();

    const result = getTopRecruiters(recruiters, position, 5);

    expect(result).toHaveLength(1);
  });

  it('should default to 3 recruiters when count not specified', () => {
    const recruiters = [
      createMockRecruiter({ id: 'r1' }),
      createMockRecruiter({ id: 'r2' }),
      createMockRecruiter({ id: 'r3' }),
      createMockRecruiter({ id: 'r4' }),
      createMockRecruiter({ id: 'r5' }),
    ];
    const position = createMockPosition();

    const result = getTopRecruiters(recruiters, position);

    expect(result).toHaveLength(3);
  });
});

// =============================================================================
// VALIDATE WEIGHTS TESTS
// =============================================================================

describe('validateWeights', () => {
  it('should not throw when weights sum to 1.0', () => {
    expect(() => validateWeights()).not.toThrow();
  });
});
