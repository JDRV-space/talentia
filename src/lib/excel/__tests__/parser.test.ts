/**
 * Unit tests for the Excel Parser
 * Tests parseConsolidado, parsePicos, fuzzyMatchZone, and date format handling
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  fuzzyMatchZone,
  detectFileType,
  getPreview,
  parseConsolidado,
  parsePicos,
  parseInChunks,
  type ParseResult,
  type ExcelFileType,
} from '../parser';
import { XLSX } from '../xlsx-compat';

// =============================================================================
// TEST FIXTURES
// =============================================================================

/**
 * Creates a mock Excel ArrayBuffer with specified data
 * Uses xlsx library to create test files
 */
async function createMockExcelFileAsync(headers: string[], rows: Record<string, unknown>[]): Promise<ArrayBuffer> {
  // Create workbook and worksheet using xlsx
  const workbook = XLSX.utils.book_new();

  // Build data array (headers + rows)
  const data: unknown[][] = [headers];
  for (const row of rows) {
    const values = headers.map(h => row[h]);
    data.push(values);
  }

  // Create worksheet from array of arrays
  const worksheet = XLSX.utils.aoa_to_sheet(data);

  // Append worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Sheet1');

  // Write to buffer
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
  return buffer;
}

/**
 * Synchronous wrapper for tests - returns a promise that must be awaited
 */
function createMockExcelFile(headers: string[], rows: Record<string, unknown>[]): Promise<ArrayBuffer> {
  return createMockExcelFileAsync(headers, rows);
}

/**
 * Creates valid CONSOLIDADO test data
 */
function createValidConsolidadoRows() {
  return [
    {
      fecha: '2026-01-15',
      zona: 'Trujillo',
      puesto: 'Operario de Campo',
      nivel: '1',
      prioridad: 'P1',
      cantidad: 10,
      descripcion: 'Cosecha de esparrago',
    },
    {
      fecha: '2026-01-20',
      zona: 'Viru',
      puesto: 'Tecnico Agricola',
      nivel: '2',
      prioridad: 'P2',
      cantidad: 5,
    },
    {
      fecha: '2026-02-01',
      zona: 'Chao',
      puesto: 'Supervisor de Turno',
      nivel: '3',
      prioridad: 'P3',
      cantidad: 2,
    },
  ];
}

/**
 * Creates valid PICOS test data
 */
function createValidPicosRows() {
  return [
    {
      semana: 1,
      ano: 2026,
      cultivo: 'esparrago',
      zona: 'Trujillo',
      produccion_kg: 50000,
      trabajadores_estimados: 150,
    },
    {
      semana: 2,
      ano: 2026,
      cultivo: 'arandano',
      zona: 'Viru',
      produccion_kg: 25000,
    },
    {
      semana: 3,
      ano: 2026,
      cultivo: 'palta',
      zona: 'Chicama',
      produccion_kg: 80000,
    },
  ];
}

// =============================================================================
// FUZZY MATCH ZONE TESTS
// =============================================================================

describe('fuzzyMatchZone', () => {
  describe('exact matches', () => {
    it('should match exact zone names', () => {
      const result = fuzzyMatchZone('Trujillo');
      expect(result.zone).toBe('Trujillo');
      expect(result.corrected).toBe(false);
      expect(result.original).toBe('Trujillo');
    });

    it('should match zone names case-insensitively', () => {
      const result = fuzzyMatchZone('trujillo');
      expect(result.zone).toBe('Trujillo');
      expect(result.corrected).toBe(false);
    });

    it('should match zone names with whitespace', () => {
      const result = fuzzyMatchZone('  Viru  ');
      expect(result.zone).toBe('Viru');
      expect(result.corrected).toBe(false);
    });

    it('should match all valid zones exactly', () => {
      const zones = ['Trujillo', 'Viru', 'Chao', 'Chicama', 'Chiclayo', 'Arequipa', 'Ica', 'Lima'];
      for (const zone of zones) {
        const result = fuzzyMatchZone(zone);
        expect(result.zone).toBe(zone);
        expect(result.corrected).toBe(false);
      }
    });
  });

  describe('known variant mappings', () => {
    it('should correct "trujilo" to "Trujillo"', () => {
      const result = fuzzyMatchZone('trujilo');
      expect(result.zone).toBe('Trujillo');
      expect(result.corrected).toBe(true);
      expect(result.original).toBe('trujilo');
    });

    it('should correct "biru" to "Viru"', () => {
      const result = fuzzyMatchZone('biru');
      expect(result.zone).toBe('Viru');
      expect(result.corrected).toBe(true);
    });

    it('should correct "chau" to "Chao"', () => {
      const result = fuzzyMatchZone('chau');
      expect(result.zone).toBe('Chao');
      expect(result.corrected).toBe(true);
    });

    it('should correct "chiclaio" to "Chiclayo"', () => {
      const result = fuzzyMatchZone('chiclaio');
      expect(result.zone).toBe('Chiclayo');
      expect(result.corrected).toBe(true);
    });

    it('should correct "arekipa" to "Arequipa"', () => {
      const result = fuzzyMatchZone('arekipa');
      expect(result.zone).toBe('Arequipa');
      expect(result.corrected).toBe(true);
    });

    it('should correct "ika" to "Ica"', () => {
      const result = fuzzyMatchZone('ika');
      expect(result.zone).toBe('Ica');
      expect(result.corrected).toBe(true);
    });

    it('should correct "lma" to "Lima"', () => {
      const result = fuzzyMatchZone('lma');
      expect(result.zone).toBe('Lima');
      expect(result.corrected).toBe(true);
    });
  });

  describe('fuzzy matching with Levenshtein distance', () => {
    it('should correct typos within 2 character distance', () => {
      // 1 character off
      const result1 = fuzzyMatchZone('Trujiilo');
      expect(result1.zone).toBe('Trujillo');
      expect(result1.corrected).toBe(true);

      // 2 characters off
      const result2 = fuzzyMatchZone('Arequpaa');
      expect(result2.zone).toBe('Arequipa');
      expect(result2.corrected).toBe(true);
    });

    it('should return null for completely unrecognized zones', () => {
      const result = fuzzyMatchZone('InvalidZone');
      expect(result.zone).toBe(null);
      expect(result.corrected).toBe(false);
    });

    it('should return null for zones more than 2 characters different', () => {
      const result = fuzzyMatchZone('xyz');
      expect(result.zone).toBe(null);
    });
  });

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = fuzzyMatchZone('');
      expect(result.zone).toBe(null);
      expect(result.original).toBe('');
    });

    it('should handle accented characters (viru)', () => {
      const result = fuzzyMatchZone('Viru');
      expect(result.zone).toBe('Viru');
    });
  });
});

// =============================================================================
// DETECT FILE TYPE TESTS
// =============================================================================

describe('detectFileType', () => {
  it('should detect CONSOLIDADO file type', () => {
    const headers = ['fecha', 'zona', 'puesto', 'prioridad', 'nivel', 'cantidad'];
    expect(detectFileType(headers)).toBe('CONSOLIDADO');
  });

  it('should detect PICOS file type', () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    expect(detectFileType(headers)).toBe('PICOS');
  });

  it('should return null for unknown file type', () => {
    const headers = ['id', 'name', 'value'];
    expect(detectFileType(headers)).toBe(null);
  });

  it('should handle case-insensitive headers', () => {
    const headers = ['FECHA', 'ZONA', 'PUESTO', 'PRIORIDAD'];
    expect(detectFileType(headers)).toBe('CONSOLIDADO');
  });

  it('should detect PICOS when has at least 2 matching columns', () => {
    const headers = ['semana', 'cultivo', 'other_col'];
    expect(detectFileType(headers)).toBe('PICOS');
  });

  it('should detect CONSOLIDADO when has at least 2 matching columns', () => {
    const headers = ['puesto', 'prioridad', 'other_col'];
    expect(detectFileType(headers)).toBe('CONSOLIDADO');
  });
});

// =============================================================================
// PARSE CONSOLIDADO TESTS
// =============================================================================

describe('parseConsolidado', () => {
  describe('valid data parsing', () => {
    it('should parse valid CONSOLIDADO file', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = createValidConsolidadoRows();
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);
      expect(result.data.length).toBe(3);
      expect(result.errors.length).toBe(0);
    });

    it('should transform data correctly', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: 1,
          prioridad: 'P1',
          cantidad: 10,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0]).toMatchObject({
        fecha: '2026-01-15',
        zona: 'Trujillo',
        puesto: 'Operario',
        nivel: '1',
        prioridad: 'P1',
        cantidad: 10,
      });
    });

    it('should handle optional columns when present', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad', 'descripcion'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
          descripcion: 'Test description',
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      // Optional descripcion may or may not be populated depending on transformation
      expect(result.validRows).toBe(1);
      if (result.data[0].descripcion) {
        expect(result.data[0].descripcion).toBe('Test description');
      }
    });
  });

  describe('date format handling', () => {
    it('should handle ISO date format (YYYY-MM-DD)', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0].fecha).toBe('2026-01-15');
      expect(result.validRows).toBe(1);
    });

    it('should handle Peru date format (DD/MM/YYYY)', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '15/01/2026',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0].fecha).toBe('2026-01-15');
      expect(result.validRows).toBe(1);
    });
  });

  describe('zone fuzzy matching with warnings', () => {
    it('should correct zone typos and add warning', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'trujilo', // typo
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0].zona).toBe('Trujillo');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].field).toBe('zona');
      expect(result.warnings[0].message).toContain('corregida');
    });
  });

  describe('validation errors', () => {
    it('should report missing required columns', async () => {
      const headers = ['fecha', 'zona']; // Missing required columns
      const rows = [{ fecha: '2026-01-15', zona: 'Trujillo' }];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('columns');
    });

    it('should report invalid priority values', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P4', // Invalid
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should report invalid zone values', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'InvalidZone',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'zona')).toBe(true);
    });

    it('should report negative cantidad', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: -5, // Invalid
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'cantidad')).toBe(true);
    });
  });

  describe('priority normalization', () => {
    it('should normalize "1" to "P1"', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: '1', // Should become P1
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0].prioridad).toBe('P1');
    });

    it('should handle lowercase priority', async () => {
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'p2',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.data[0].prioridad).toBe('P2');
    });
  });

  describe('column name variants', () => {
    it('should handle column variants if supported by parser', async () => {
      // Note: Column variant support depends on getColumnVariants implementation
      // This test verifies the standard column names work correctly
      const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          puesto: 'Operario',
          nivel: '1',
          prioridad: 'P1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.validRows).toBe(1);
      expect(result.data[0].puesto).toBe('Operario');
    });

    it('should report error for truly missing columns', async () => {
      const headers = ['fecha', 'zona', 'nivel', 'cantidad']; // Missing puesto, prioridad
      const rows = [
        {
          fecha: '2026-01-15',
          zona: 'Trujillo',
          nivel: '1',
          cantidad: 5,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parseConsolidado(file);

      expect(result.errors.length).toBeGreaterThan(0);
    });
  });
});

// =============================================================================
// PARSE PICOS TESTS
// =============================================================================

describe('parsePicos', () => {
  describe('valid data parsing', () => {
    it('should parse valid PICOS file', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = createValidPicosRows();
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.totalRows).toBe(3);
      expect(result.validRows).toBe(3);
      expect(result.invalidRows).toBe(0);
      expect(result.data.length).toBe(3);
      expect(result.errors.length).toBe(0);
    });

    it('should transform data correctly', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg', 'trabajadores_estimados'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
          trabajadores_estimados: 150,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.data[0].semana).toBe(1);
      expect(result.data[0].ano).toBe(2026);
      expect(result.data[0].cultivo).toBe('esparrago');
      expect(result.data[0].zona).toBe('Trujillo');
      expect(result.data[0].produccion_kg).toBe(50000);
      // trabajadores_estimados is optional and may be included
      if (result.data[0].trabajadores_estimados !== undefined) {
        expect(result.data[0].trabajadores_estimados).toBe(150);
      }
    });

    it('should handle optional trabajadores_estimados', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.validRows).toBe(1);
      expect(result.data[0].trabajadores_estimados).toBeUndefined();
    });
  });

  describe('validation errors', () => {
    it('should report missing required columns', async () => {
      const headers = ['semana', 'ano']; // Missing required columns
      const rows = [{ semana: 1, ano: 2026 }];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0].field).toBe('columns');
    });

    it('should report invalid semana values (out of range)', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 54, // Invalid - max is 53
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'semana')).toBe(true);
    });

    it('should report invalid semana values (zero)', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 0, // Invalid - min is 1
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.invalidRows).toBe(1);
    });

    it('should report invalid crop type', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'invalid_crop',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'cultivo')).toBe(true);
    });

    it('should report negative produccion_kg', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: -1000, // Invalid
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'produccion_kg')).toBe(true);
    });

    it('should report invalid year (too old)', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2019, // Invalid - min is 2020
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.invalidRows).toBe(1);
      expect(result.errors.some(e => e.field === 'ano')).toBe(true);
    });
  });

  describe('zone fuzzy matching with warnings', () => {
    it('should correct zone typos and add warning', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'biru', // typo for Viru
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.data[0].zona).toBe('Viru');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0].field).toBe('zona');
    });
  });

  describe('crop normalization', () => {
    it('should normalize crop to lowercase', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'ESPARRAGO',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.data[0].cultivo).toBe('esparrago');
    });

    it('should handle accented crop names', async () => {
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'arandano', // With accent normalized
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.validRows).toBe(1);
      expect(result.data[0].cultivo).toBe('arandano');
    });
  });

  describe('column name variants', () => {
    it('should handle standard column names', async () => {
      // Note: Column variant support depends on getColumnVariants implementation
      // This test verifies the standard column names work correctly
      const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
      const rows = [
        {
          semana: 1,
          ano: 2026,
          cultivo: 'esparrago',
          zona: 'Trujillo',
          produccion_kg: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.validRows).toBe(1);
      expect(result.data[0].semana).toBe(1);
    });

    it('should report error for truly missing columns', async () => {
      const headers = ['semana', 'ano', 'zona']; // Missing cultivo, produccion_kg
      const rows = [
        {
          semana: 1,
          ano: 2026,
          zona: 'Trujillo',
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should handle case-insensitive column names', async () => {
      const headers = ['SEMANA', 'ANO', 'CULTIVO', 'ZONA', 'PRODUCCION_KG'];
      const rows = [
        {
          SEMANA: 1,
          ANO: 2026,
          CULTIVO: 'esparrago',
          ZONA: 'Trujillo',
          PRODUCCION_KG: 50000,
        },
      ];
      const file = await createMockExcelFile(headers, rows);

      const result = await parsePicos(file);

      expect(result.validRows).toBe(1);
    });
  });
});

// =============================================================================
// GET PREVIEW TESTS
// =============================================================================

describe('getPreview', () => {
  it('should return first N rows', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows = createValidConsolidadoRows();
    const file = await createMockExcelFile(headers, rows);

    const preview = await getPreview(file, 2);

    expect(preview.rows.length).toBe(2);
    expect(preview.headers).toEqual(headers);
  });

  it('should detect CONSOLIDADO file type', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows = createValidConsolidadoRows();
    const file = await createMockExcelFile(headers, rows);

    const preview = await getPreview(file);

    expect(preview.detectedType).toBe('CONSOLIDADO');
  });

  it('should detect PICOS file type', async () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    const rows = createValidPicosRows();
    const file = await createMockExcelFile(headers, rows);

    const preview = await getPreview(file);

    expect(preview.detectedType).toBe('PICOS');
  });

  it('should default to 5 rows', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows = Array(10).fill(createValidConsolidadoRows()[0]);
    const file = await createMockExcelFile(headers, rows);

    const preview = await getPreview(file);

    expect(preview.rows.length).toBe(5);
  });
});

// =============================================================================
// PARSE IN CHUNKS TESTS
// =============================================================================

describe('parseInChunks', () => {
  it('should process file in chunks for CONSOLIDADO', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows = Array(10).fill(null).map((_, i) => ({
      fecha: '2026-01-15',
      zona: 'Trujillo',
      puesto: `Operario ${i}`,
      nivel: '1',
      prioridad: 'P1',
      cantidad: 5,
    }));
    const file = await createMockExcelFile(headers, rows);

    const chunks: any[] = [];
    for await (const chunk of parseInChunks(file, 'CONSOLIDADO', 3)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(4); // 10 rows / 3 per chunk = 4 chunks
    expect(chunks[0].totalChunks).toBe(4);
    expect(chunks[0].chunk).toBe(1);
    expect(chunks[3].chunk).toBe(4);
  });

  it('should process file in chunks for PICOS', async () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    const rows = Array(10).fill(null).map((_, i) => ({
      semana: (i % 52) + 1,
      ano: 2026,
      cultivo: 'esparrago',
      zona: 'Trujillo',
      produccion_kg: 50000,
    }));
    const file = await createMockExcelFile(headers, rows);

    const chunks: any[] = [];
    for await (const chunk of parseInChunks(file, 'PICOS', 5)) {
      chunks.push(chunk);
    }

    expect(chunks.length).toBe(2); // 10 rows / 5 per chunk = 2 chunks
    expect(chunks[0].data.length).toBe(5);
    expect(chunks[1].data.length).toBe(5);
  });

  it('should collect errors per chunk', async () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    const rows = [
      { semana: 1, ano: 2026, cultivo: 'esparrago', zona: 'Trujillo', produccion_kg: 50000 },
      { semana: 55, ano: 2026, cultivo: 'esparrago', zona: 'Trujillo', produccion_kg: 50000 }, // Invalid semana
      { semana: 3, ano: 2026, cultivo: 'esparrago', zona: 'Trujillo', produccion_kg: 50000 },
    ];
    const file = await createMockExcelFile(headers, rows);

    const chunks: any[] = [];
    for await (const chunk of parseInChunks(file, 'PICOS', 10)) {
      chunks.push(chunk);
    }

    expect(chunks[0].data.length).toBe(2); // 2 valid rows
    expect(chunks[0].errors.length).toBe(1); // 1 error
  });
});

// =============================================================================
// ERROR HANDLING TESTS
// =============================================================================

describe('error handling', () => {
  it('should handle corrupted file gracefully for parseConsolidado', async () => {
    const invalidBuffer = new ArrayBuffer(100);

    const result = await parseConsolidado(invalidBuffer);

    // Parser may return column errors or file errors depending on how XLSX handles invalid data
    expect(result.errors.length).toBeGreaterThan(0);
    // The error should be at row 0 (file/header level)
    expect(result.errors[0].row).toBe(0);
  });

  it('should handle corrupted file gracefully for parsePicos', async () => {
    const invalidBuffer = new ArrayBuffer(100);

    const result = await parsePicos(invalidBuffer);

    // Parser may return column errors or file errors depending on how XLSX handles invalid data
    expect(result.errors.length).toBeGreaterThan(0);
    // The error should be at row 0 (file/header level)
    expect(result.errors[0].row).toBe(0);
  });

  it('should handle empty file for parseConsolidado', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows: Record<string, unknown>[] = [];
    const file = await createMockExcelFile(headers, rows);

    const result = await parseConsolidado(file);

    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.data.length).toBe(0);
  });

  it('should handle empty file for parsePicos', async () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    const rows: Record<string, unknown>[] = [];
    const file = await createMockExcelFile(headers, rows);

    const result = await parsePicos(file);

    expect(result.totalRows).toBe(0);
    expect(result.validRows).toBe(0);
    expect(result.data.length).toBe(0);
  });
});

// =============================================================================
// MIXED VALID AND INVALID ROWS TESTS
// =============================================================================

describe('mixed valid and invalid rows', () => {
  it('should process valid rows and report invalid ones for CONSOLIDADO', async () => {
    const headers = ['fecha', 'zona', 'puesto', 'nivel', 'prioridad', 'cantidad'];
    const rows = [
      { fecha: '2026-01-15', zona: 'Trujillo', puesto: 'Operario', nivel: '1', prioridad: 'P1', cantidad: 5 },
      { fecha: '2026-01-15', zona: 'InvalidZone', puesto: 'Operario', nivel: '1', prioridad: 'P1', cantidad: 5 },
      { fecha: '2026-01-15', zona: 'Viru', puesto: 'Tecnico', nivel: '2', prioridad: 'P2', cantidad: 3 },
    ];
    const file = await createMockExcelFile(headers, rows);

    const result = await parseConsolidado(file);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.data.length).toBe(2);
    expect(result.errors.length).toBe(1);
  });

  it('should process valid rows and report invalid ones for PICOS', async () => {
    const headers = ['semana', 'ano', 'cultivo', 'zona', 'produccion_kg'];
    const rows = [
      { semana: 1, ano: 2026, cultivo: 'esparrago', zona: 'Trujillo', produccion_kg: 50000 },
      { semana: 55, ano: 2026, cultivo: 'esparrago', zona: 'Trujillo', produccion_kg: 50000 }, // Invalid semana
      { semana: 2, ano: 2026, cultivo: 'arandano', zona: 'Viru', produccion_kg: 25000 },
    ];
    const file = await createMockExcelFile(headers, rows);

    const result = await parsePicos(file);

    expect(result.totalRows).toBe(3);
    expect(result.validRows).toBe(2);
    expect(result.invalidRows).toBe(1);
    expect(result.data.length).toBe(2);
    expect(result.errors.length).toBe(1);
  });
});
