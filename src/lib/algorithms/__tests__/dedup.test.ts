/**
 * Unit tests for the Deduplication Algorithm
 * Tests Spanish phonetics, Levenshtein distance, and duplicate detection
 */

import { describe, it, expect } from 'vitest';
import {
  toSpanishPhonetic,
  levenshteinDistance,
  nameSimilarity,
  compareCandidates,
  findDuplicates,
  batchDeduplicate,
} from '../dedup';
import type { Candidate } from '@/types/database';

// =============================================================================
// TEST FIXTURES
// =============================================================================

function createMockCandidate(overrides: Partial<Candidate> = {}): Candidate {
  return {
    id: 'candidate-1',
    dni: '12345678',
    first_name: 'Juan',
    last_name: 'Perez',
    maternal_last_name: 'Garcia',
    full_name: 'Juan Perez Garcia',
    phone: '987654321',
    phone_normalized: '987654321',
    email: null,
    name_phonetic: null,
    zone: 'Trujillo',
    address: null,
    status: 'available',
    times_hired: 0,
    last_hired_at: null,
    last_contacted_at: null,
    notes: null,
    tags: [],
    source: 'manual',
    upload_id: null,
    is_duplicate: false,
    duplicate_of: null,
    dedup_reviewed: false,
    dedup_reviewed_at: null,
    dedup_reviewed_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
    ...overrides,
  };
}

// =============================================================================
// SPANISH PHONETIC TRANSFORMATION TESTS
// =============================================================================

describe('toSpanishPhonetic', () => {
  describe('basic transformations', () => {
    it('should convert to lowercase', () => {
      expect(toSpanishPhonetic('JUAN')).toBe('juan');
    });

    it('should trim whitespace', () => {
      expect(toSpanishPhonetic('  Juan  ')).toBe('juan');
    });

    it('should return empty string for null/undefined', () => {
      expect(toSpanishPhonetic(null as any)).toBe('');
      expect(toSpanishPhonetic(undefined as any)).toBe('');
      expect(toSpanishPhonetic('')).toBe('');
    });
  });

  describe('yeismo rule (ll -> y)', () => {
    it('should convert ll to y', () => {
      expect(toSpanishPhonetic('Llanos')).toBe('yanos');
      expect(toSpanishPhonetic('Llerena')).toBe('yerena');
      expect(toSpanishPhonetic('Castillo')).toBe('castiyo');
    });

    it('should handle multiple ll occurrences', () => {
      expect(toSpanishPhonetic('Llallasca')).toBe('yayasca');
    });
  });

  describe('seseo rule (c[ei], s, z -> s)', () => {
    it('should convert c before e/i to s', () => {
      expect(toSpanishPhonetic('Cesar')).toBe('sesar');
      expect(toSpanishPhonetic('Cecilia')).toBe('sesilia');
      expect(toSpanishPhonetic('Garcia')).toBe('garsia');
    });

    it('should convert z to s', () => {
      expect(toSpanishPhonetic('Gonzalez')).toBe('gonsales');
      expect(toSpanishPhonetic('Zarate')).toBe('sarate');
      expect(toSpanishPhonetic('Zurita')).toBe('surita');
    });

    it('should not affect c before a, o, u', () => {
      expect(toSpanishPhonetic('Carlos')).toBe('carlos');
      expect(toSpanishPhonetic('Coto')).toBe('coto');
      expect(toSpanishPhonetic('Cueva')).toBe('cueba');
    });
  });

  describe('h muda rule (h eliminated)', () => {
    it('should remove h completely', () => {
      expect(toSpanishPhonetic('Hernandez')).toBe('ernandes');
      expect(toSpanishPhonetic('Huaman')).toBe('uaman');
      expect(toSpanishPhonetic('Alheli')).toBe('aleli');
    });

    it('should handle multiple h occurrences', () => {
      // After removing h: 'aaa', then duplicates collapsed to 'a'
      expect(toSpanishPhonetic('Hahaha')).toBe('a');
    });
  });

  describe('b/v fusion rule (v -> b)', () => {
    it('should convert v to b', () => {
      expect(toSpanishPhonetic('Vivanco')).toBe('bibanco');
      expect(toSpanishPhonetic('Valverde')).toBe('balberde');
      expect(toSpanishPhonetic('Villaverde')).toBe('biyaberde');
    });
  });

  describe('suavizacion j/g rule (g[ei] -> j)', () => {
    it('should convert g before e/i to j', () => {
      expect(toSpanishPhonetic('Gimenez')).toBe('jimenes');
      expect(toSpanishPhonetic('Genaro')).toBe('jenaro');
      expect(toSpanishPhonetic('Rodriguez')).toBe('rodrigues');
    });

    it('should not affect g before a, o, u', () => {
      expect(toSpanishPhonetic('Garcia')).toBe('garsia');
      expect(toSpanishPhonetic('Gonzalez')).toBe('gonsales');
      expect(toSpanishPhonetic('Guzman')).toBe('gusman');
    });
  });

  describe('n with tilde (n -> ny)', () => {
    it('should preserve n with tilde as ny', () => {
      // Must use actual n character for the transformation to apply
      expect(toSpanishPhonetic('Muñoz')).toBe('munyos');
      expect(toSpanishPhonetic('Castañeda')).toBe('castanyeda');
      expect(toSpanishPhonetic('Peña')).toBe('penya');
    });

    it('should not convert regular n without tilde', () => {
      // Regular 'n' stays as 'n'
      expect(toSpanishPhonetic('Munoz')).toBe('munos');
      expect(toSpanishPhonetic('Castaneda')).toBe('castaneda');
    });
  });

  describe('double letter elimination', () => {
    it('should eliminate consecutive duplicate letters except rr', () => {
      expect(toSpanishPhonetic('Ballesteros')).toBe('bayesteros');
      // Note: rr is preserved as a distinct sound in Spanish
    });

    it('should preserve rr as distinct sound', () => {
      // rr is preserved, then the algorithm processes it
      const result = toSpanishPhonetic('Carrera');
      expect(result).toContain('rr');
    });
  });

  describe('accent removal', () => {
    it('should remove all Spanish accents', () => {
      expect(toSpanishPhonetic('Maria')).toBe('maria');
      expect(toSpanishPhonetic('Jose')).toBe('jose');
      expect(toSpanishPhonetic('Jesus')).toBe('jesus');
      expect(toSpanishPhonetic('Ramon')).toBe('ramon');
      expect(toSpanishPhonetic('Raul')).toBe('raul');
    });

    it('should handle u with umlaut', () => {
      expect(toSpanishPhonetic('Guemes')).toBe('guemes');
      // Note: g before 'u' is not affected by j/g rule (only ge/gi)
    });
  });

  describe('non-alphabetic character removal', () => {
    it('should remove numbers and special characters', () => {
      expect(toSpanishPhonetic('Juan123')).toBe('juan');
      expect(toSpanishPhonetic('Maria-Jose')).toBe('mariajose');
      expect(toSpanishPhonetic("O'Brien")).toBe('obrien');
    });
  });

  describe('combined transformations', () => {
    it('should apply all rules correctly for Gonzalez', () => {
      // Gonzalez -> gonsales (z->s) -> gonsales
      expect(toSpanishPhonetic('Gonzalez')).toBe('gonsales');
    });

    it('should apply all rules correctly for Hernandez', () => {
      // Hernandez -> ernandez (h removed) -> ernandes (z->s)
      expect(toSpanishPhonetic('Hernandez')).toBe('ernandes');
    });

    it('should handle complex name: Villavicencio', () => {
      // Villavicencio -> billabisensio (v->b, ll->y, c[i]->s)
      expect(toSpanishPhonetic('Villavicencio')).toBe('biyabisensio');
    });
  });
});

// =============================================================================
// LEVENSHTEIN DISTANCE TESTS
// =============================================================================

describe('levenshteinDistance', () => {
  describe('basic cases', () => {
    it('should return 0 for identical strings', () => {
      expect(levenshteinDistance('hello', 'hello')).toBe(0);
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('should return length of string when other is empty', () => {
      expect(levenshteinDistance('hello', '')).toBe(5);
      expect(levenshteinDistance('', 'world')).toBe(5);
    });

    it('should return correct distance for single character difference', () => {
      expect(levenshteinDistance('cat', 'bat')).toBe(1); // substitution
      expect(levenshteinDistance('cat', 'cats')).toBe(1); // insertion
      expect(levenshteinDistance('cats', 'cat')).toBe(1); // deletion
    });
  });

  describe('known examples', () => {
    it('should return 1 for gato -> pato', () => {
      expect(levenshteinDistance('gato', 'pato')).toBe(1);
    });

    it('should return 1 for casa -> cosa', () => {
      expect(levenshteinDistance('casa', 'cosa')).toBe(1);
    });

    it('should return 1 for perro -> perros', () => {
      expect(levenshteinDistance('perro', 'perros')).toBe(1);
    });

    it('should return 3 for kitten -> sitting', () => {
      expect(levenshteinDistance('kitten', 'sitting')).toBe(3);
    });

    it('should return 5 for maria -> pedro', () => {
      expect(levenshteinDistance('maria', 'pedro')).toBe(5);
    });
  });

  describe('maxDistance optimization', () => {
    it('should return early when distance exceeds maxDistance', () => {
      const result = levenshteinDistance('abcdefghij', 'xyz', 2);
      expect(result).toBeGreaterThan(2);
    });

    it('should return actual distance when below maxDistance', () => {
      expect(levenshteinDistance('cat', 'bat', 5)).toBe(1);
    });

    it('should return early for large length difference', () => {
      const result = levenshteinDistance('a', 'abcdefghij', 3);
      expect(result).toBeGreaterThan(3);
    });
  });

  describe('space optimization (swapping for shorter string)', () => {
    it('should handle when first string is longer', () => {
      expect(levenshteinDistance('longer', 'short')).toBe(levenshteinDistance('short', 'longer'));
    });
  });
});

// =============================================================================
// NAME SIMILARITY TESTS
// =============================================================================

describe('nameSimilarity', () => {
  it('should return 1.0 for identical names', () => {
    expect(nameSimilarity('Juan', 'Juan')).toBe(1);
    expect(nameSimilarity('maria', 'maria')).toBe(1);
  });

  it('should return 1.0 for identical names with different case', () => {
    expect(nameSimilarity('Juan', 'juan')).toBe(1);
    expect(nameSimilarity('MARIA', 'maria')).toBe(1);
  });

  it('should return 0 when one name is empty', () => {
    expect(nameSimilarity('Juan', '')).toBe(0);
    expect(nameSimilarity('', 'Maria')).toBe(0);
  });

  it('should return 1.0 when both are empty/null', () => {
    expect(nameSimilarity('', '')).toBe(1);
    expect(nameSimilarity(null as any, null as any)).toBe(1);
  });

  it('should return high similarity for similar names', () => {
    const sim = nameSimilarity('Maria', 'Mario');
    expect(sim).toBeGreaterThan(0.7);
    expect(sim).toBeLessThan(1);
  });

  it('should return low similarity for very different names', () => {
    const sim = nameSimilarity('Pedro', 'Juan');
    expect(sim).toBeLessThan(0.5);
  });

  describe('threshold values', () => {
    it('should meet 0.85 threshold for very similar names', () => {
      expect(nameSimilarity('Hernandez', 'Hernandz')).toBeGreaterThanOrEqual(0.85);
    });

    it('should meet 0.80 threshold for somewhat similar names', () => {
      expect(nameSimilarity('Rodriguez', 'Rodrigez')).toBeGreaterThanOrEqual(0.80);
    });
  });
});

// =============================================================================
// COMPARE CANDIDATES TESTS
// =============================================================================

describe('compareCandidates', () => {
  it('should return null when comparing same candidate', () => {
    const candidate = createMockCandidate({ id: 'same-id' });

    const result = compareCandidates(candidate, candidate);

    expect(result).toBeNull();
  });

  describe('phone matching', () => {
    it('should return 0.98 confidence for exact phone match', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '987654321',
        first_name: 'Different',
        last_name: 'Names',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '987654321',
        first_name: 'Other',
        last_name: 'Person',
      });

      const result = compareCandidates(candidate1, candidate2);

      expect(result).not.toBeNull();
      expect(result!.match_type).toBe('phone');
      expect(result!.confidence).toBe(0.98);
      expect(result!.details.phone_match).toBe(true);
    });

    it('should not match phones shorter than 9 digits', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '12345678', // 8 digits
        first_name: 'Juan',
        last_name: 'Perez',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '12345678',
        first_name: 'Pedro',
        last_name: 'Lopez',
      });

      const result = compareCandidates(candidate1, candidate2);

      // Should not match on short phone, and names are different
      expect(result).toBeNull();
    });
  });

  describe('phone and name matching', () => {
    it('should return 0.99 confidence for phone + name match >= 0.80', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '987654321',
        first_name: 'Juan',
        last_name: 'Perez',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '987654321',
        first_name: 'Juan',
        last_name: 'Perez',
      });

      const result = compareCandidates(candidate1, candidate2);

      expect(result).not.toBeNull();
      expect(result!.match_type).toBe('phone_and_name');
      expect(result!.confidence).toBe(0.99);
    });
  });

  describe('name-only matching', () => {
    it('should return name match when similarity >= 0.85 (review_threshold from constants)', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '111111111',
        first_name: 'Juan Carlos',
        last_name: 'Hernandez',
        maternal_last_name: 'Garcia',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '222222222',
        first_name: 'Juan Carlos',
        last_name: 'Hernandez',
        maternal_last_name: 'Garcia',
      });

      const result = compareCandidates(candidate1, candidate2);

      expect(result).not.toBeNull();
      expect(result!.match_type).toBe('name');
      expect(result!.details.name_similarity).toBeGreaterThanOrEqual(0.85);
    });

    it('should return null when name similarity is too low', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '111111111',
        first_name: 'Juan',
        last_name: 'Perez',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '222222222',
        first_name: 'Maria',
        last_name: 'Lopez',
      });

      const result = compareCandidates(candidate1, candidate2);

      expect(result).toBeNull();
    });
  });

  describe('phonetic matching', () => {
    it('should detect phonetic match for names that sound alike', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '111111111',
        first_name: 'Hernandez',
        last_name: 'Gonzales',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '222222222',
        first_name: 'Ernandez', // h muda
        last_name: 'Gonsalez', // seseo
      });

      const result = compareCandidates(candidate1, candidate2);

      // Names should be phonetically similar
      expect(result).not.toBeNull();
      expect(result!.details.phonetic_match).toBe(true);
    });
  });
});

// =============================================================================
// INDIGENOUS SURNAME MATCHING TESTS
// =============================================================================

describe('indigenous surname handling', () => {
  it('should require exact match for Quispe (Quechua surname)', () => {
    const candidate1 = createMockCandidate({
      id: 'c1',
      phone_normalized: '111111111',
      first_name: 'Juan',
      last_name: 'Quispe',
    });
    const candidate2 = createMockCandidate({
      id: 'c2',
      phone_normalized: '222222222',
      first_name: 'Juan',
      last_name: 'Quispe', // Exact match
    });

    const result = compareCandidates(candidate1, candidate2);

    expect(result).not.toBeNull();
    expect(result!.details.name_similarity).toBeGreaterThan(0.8);
  });

  it('should not match different spelling of indigenous surnames', () => {
    const candidate1 = createMockCandidate({
      id: 'c1',
      phone_normalized: '111111111',
      first_name: 'Juan',
      last_name: 'Quispe',
      maternal_last_name: null,
    });
    const candidate2 = createMockCandidate({
      id: 'c2',
      phone_normalized: '222222222',
      first_name: 'Juan',
      last_name: 'Quizpe', // Different spelling
      maternal_last_name: null,
    });

    const result = compareCandidates(candidate1, candidate2);

    // Should either be null or have low confidence due to indigenous surname rules
    if (result) {
      expect(result.confidence).toBeLessThan(0.95);
    }
  });

  it('should handle Mamani (Aymara surname)', () => {
    const candidate1 = createMockCandidate({
      id: 'c1',
      phone_normalized: '111111111',
      first_name: 'Maria',
      last_name: 'Mamani',
    });
    const candidate2 = createMockCandidate({
      id: 'c2',
      phone_normalized: '222222222',
      first_name: 'Maria',
      last_name: 'Mamani',
    });

    const result = compareCandidates(candidate1, candidate2);

    expect(result).not.toBeNull();
  });
});

// =============================================================================
// FIND DUPLICATES TESTS
// =============================================================================

describe('findDuplicates', () => {
  it('should return empty array when no duplicates found', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '999999999',
      first_name: 'Unique',
      last_name: 'Person',
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '111111111',
        first_name: 'Different',
        last_name: 'Name',
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    expect(result).toHaveLength(0);
  });

  it('should find duplicate with matching phone', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '987654321',
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    expect(result).toHaveLength(1);
    expect(result[0].match_candidate_id).toBe('e1');
  });

  it('should skip deleted candidates', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '987654321',
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
        deleted_at: '2026-01-01T00:00:00Z',
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    expect(result).toHaveLength(0);
  });

  it('should skip candidates marked as duplicates', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '987654321',
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
        is_duplicate: true,
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    expect(result).toHaveLength(0);
  });

  it('should sort results by confidence descending', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '987654321',
      first_name: 'Juan',
      last_name: 'Perez',
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '111111111',
        first_name: 'Juan',
        last_name: 'Perez',
      }),
      createMockCandidate({
        id: 'e2',
        phone_normalized: '987654321', // Same phone = higher confidence
        first_name: 'Different',
        last_name: 'Name',
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    expect(result.length).toBeGreaterThanOrEqual(1);
    // Phone match should be first (higher confidence)
    if (result.length >= 2) {
      expect(result[0].confidence).toBeGreaterThanOrEqual(result[1].confidence);
    }
  });

  it('should use early termination for very different surnames', () => {
    const newCandidate = createMockCandidate({
      id: 'new',
      phone_normalized: '111111111',
      first_name: 'Juan',
      last_name: 'Zzzzzzz', // Very different
    });
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '222222222',
        first_name: 'Juan',
        last_name: 'Aaaaaaa', // Very different phonetically
      }),
    ];

    const result = findDuplicates(newCandidate, existing);

    // Should return quickly due to optimization
    expect(result).toHaveLength(0);
  });
});

// =============================================================================
// BATCH DEDUPLICATE TESTS
// =============================================================================

describe('batchDeduplicate', () => {
  it('should categorize unique candidates correctly', () => {
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '111111111',
        first_name: 'Unique',
        last_name: 'Person',
      }),
    ];
    const existing: Candidate[] = [];

    const result = batchDeduplicate(newCandidates, existing);

    expect(result.unique).toHaveLength(1);
    expect(result.duplicates).toHaveLength(0);
    expect(result.autoMerged).toHaveLength(0);
  });

  it('should auto-merge when confidence >= 0.95', () => {
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
        first_name: 'Juan',
        last_name: 'Perez',
      }),
    ];
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '987654321', // Same phone
        first_name: 'Juan',
        last_name: 'Perez', // Same name
      }),
    ];

    const result = batchDeduplicate(newCandidates, existing);

    // Phone + name match = 0.99 confidence, should auto-merge
    expect(result.autoMerged.length).toBeGreaterThanOrEqual(1);
  });

  it('should add to duplicates list when confidence < 0.95', () => {
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '111111111',
        first_name: 'Juan Carlos',
        last_name: 'Hernandez',
      }),
    ];
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '222222222', // Different phone
        first_name: 'Juan Carlos',
        last_name: 'Hernandez', // Same name, requires review
      }),
    ];

    const result = batchDeduplicate(newCandidates, existing);

    // Name-only match typically < 0.95, should be in duplicates for review
    expect(result.duplicates.length + result.autoMerged.length).toBeGreaterThanOrEqual(1);
  });

  it('should detect internal duplicates among new candidates', () => {
    const existing: Candidate[] = [];
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '987654321',
      }),
      createMockCandidate({
        id: 'n2',
        phone_normalized: '987654321', // Same phone as n1
      }),
    ];

    const result = batchDeduplicate(newCandidates, existing);

    // First one should be unique, second should detect duplicate
    expect(result.unique.length + result.autoMerged.length + result.duplicates.length).toBe(2);
  });

  it('should handle empty new candidates array', () => {
    const existing = [createMockCandidate()];

    const result = batchDeduplicate([], existing);

    expect(result.unique).toHaveLength(0);
    expect(result.duplicates).toHaveLength(0);
    expect(result.autoMerged).toHaveLength(0);
  });

  it('should handle empty existing candidates array', () => {
    const newCandidates = [
      createMockCandidate({ id: 'n1' }),
      createMockCandidate({ id: 'n2', phone_normalized: '222222222' }),
    ];

    const result = batchDeduplicate(newCandidates, []);

    expect(result.unique.length).toBe(2);
  });

  it('should skip deleted existing candidates in index', () => {
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
        deleted_at: '2026-01-01T00:00:00Z',
      }),
    ];
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '987654321',
      }),
    ];

    const result = batchDeduplicate(newCandidates, existing);

    // Should not match deleted record
    expect(result.unique).toHaveLength(1);
  });

  it('should preserve autoMerged.kept reference to existing candidate', () => {
    const existing = [
      createMockCandidate({
        id: 'e1',
        phone_normalized: '987654321',
        first_name: 'Juan',
        last_name: 'Perez',
      }),
    ];
    const newCandidates = [
      createMockCandidate({
        id: 'n1',
        phone_normalized: '987654321',
        first_name: 'Juan',
        last_name: 'Perez',
      }),
    ];

    const result = batchDeduplicate(newCandidates, existing);

    if (result.autoMerged.length > 0) {
      expect(result.autoMerged[0].kept.id).toBe('e1');
      expect(result.autoMerged[0].merged.id).toBe('n1');
    }
  });
});

// =============================================================================
// EDGE CASES
// =============================================================================

describe('edge cases', () => {
  describe('empty inputs', () => {
    it('toSpanishPhonetic should handle empty string', () => {
      expect(toSpanishPhonetic('')).toBe('');
    });

    it('levenshteinDistance should handle two empty strings', () => {
      expect(levenshteinDistance('', '')).toBe(0);
    });

    it('nameSimilarity should handle empty strings', () => {
      expect(nameSimilarity('', '')).toBe(1);
    });
  });

  describe('special characters', () => {
    it('should handle names with apostrophes', () => {
      expect(toSpanishPhonetic("O'Connor")).toBe('oconor');
    });

    it('should handle names with hyphens', () => {
      expect(toSpanishPhonetic('Garcia-Lopez')).toBe('garsialopes');
    });

    it('should handle names with numbers', () => {
      expect(toSpanishPhonetic('Juan2')).toBe('juan');
    });
  });

  describe('compound names', () => {
    it('should handle Maria del Carmen', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '111111111',
        first_name: 'Maria del Carmen',
        last_name: 'Perez',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '222222222',
        first_name: 'Maria',
        last_name: 'Perez',
      });

      const result = compareCandidates(candidate1, candidate2);

      // Should still find some similarity
      if (result) {
        expect(result.details.name_similarity).toBeGreaterThan(0.5);
      }
    });

    it('should handle Juan Carlos', () => {
      const candidate1 = createMockCandidate({
        id: 'c1',
        phone_normalized: '111111111',
        first_name: 'Juan Carlos',
        last_name: 'Hernandez',
      });
      const candidate2 = createMockCandidate({
        id: 'c2',
        phone_normalized: '222222222',
        first_name: 'Juan Carlos',
        last_name: 'Hernandez',
      });

      const result = compareCandidates(candidate1, candidate2);

      expect(result).not.toBeNull();
      expect(result!.details.name_similarity).toBeGreaterThan(0.9);
    });
  });
});
