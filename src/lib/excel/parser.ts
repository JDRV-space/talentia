/**
 * Utilidad para parseo de archivos Excel CONSOLIDADO y Picos
 * Incluye validacion con Zod, normalizacion de telefonos, y fuzzy matching de zonas
 * SECURITY: Uses exceljs via xlsx-compat (no prototype pollution/ReDoS vulnerabilities)
 */

import * as XLSX from './xlsx-compat';
import { z } from 'zod';
import {
  consolidadoRowSchema,
  picosRowSchema,
  consolidadoColumnsSchema,
  picosColumnsSchema,
  normalizePhoneNumber,
  type ConsolidadoRow,
  type PicosRow,
} from '@/types/schemas';
import {
  ZONES,
  CONSOLIDADO_REQUIRED_COLUMNS,
  PICOS_REQUIRED_COLUMNS,
  type Zone,
} from '@/types/constants';

// =============================================================================
// TIPOS DE RESULTADO
// =============================================================================

/**
 * Error de validacion con informacion de fila
 */
export interface ValidationError {
  row: number;
  field: string;
  value: unknown;
  message: string;
}

// =============================================================================
// TIPOS PARA PIVOT TABLES
// =============================================================================

/**
 * Resultado de parseo de pivot table CONSOLIDADO
 * Cada registro representa una posicion por departamento
 */
export interface ConsolidadoPivotParsed {
  position_name: string;
  department: string;
  count: number;
  total: number;
}

/**
 * Resultado de parseo de pivot table PICOS
 * Cada registro representa produccion por zona/semana
 */
export interface PicosPivotParsed {
  month: string;
  week: number;
  year: number;
  zone: string;
  production_kg: number;
}

/**
 * Resultado generico de parseo de pivot table
 */
export interface PivotParseResult<T> {
  success: boolean;
  data: T[];
  totalRows: number;
  validRows: number;
  errors: Array<{ row: number; message: string }>;
  metadata: {
    fileType: 'CONSOLIDADO' | 'PICOS';
    detectedHeaders: string[];
    skipRows: number;
  };
}

/**
 * Advertencia de validacion (no bloquea, pero requiere atencion)
 */
export interface ValidationWarning {
  row: number;
  field: string;
  value: unknown;
  message: string;
  suggestion?: string;
}

/**
 * Resultado del parseo de Excel
 */
export interface ParseResult<T> {
  data: T[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
  totalRows: number;
  validRows: number;
  invalidRows: number;
}

/**
 * Tipo de archivo Excel soportado
 */
export type ExcelFileType = 'CONSOLIDADO' | 'PICOS';

// =============================================================================
// FUZZY MATCHING DE ZONAS
// =============================================================================

/**
 * Variantes comunes de nombres de zonas (errores tipograficos frecuentes)
 * Basado en analisis de archivos historicos
 */
const ZONE_VARIANTS: Record<string, Zone> = {
  // Trujillo
  'trujillo': 'Trujillo',
  'trujilo': 'Trujillo',
  'trujllo': 'Trujillo',
  'trjillo': 'Trujillo',
  'trujillp': 'Trujillo',
  // Viru
  'viru': 'Viru',
  'virú': 'Viru',
  'biru': 'Viru',
  // Chao
  'chao': 'Chao',
  'chau': 'Chao',
  // Chicama
  'chicama': 'Chicama',
  'chikama': 'Chicama',
  'chicma': 'Chicama',
  // Chiclayo
  'chiclayo': 'Chiclayo',
  'chiclaio': 'Chiclayo',
  'chiclato': 'Chiclayo',
  // Arequipa
  'arequipa': 'Arequipa',
  'arequpa': 'Arequipa',
  'arekipa': 'Arequipa',
  // Ica
  'ica': 'Ica',
  'ika': 'Ica',
  // Lima
  'lima': 'Lima',
  'lma': 'Lima',
};

/**
 * Distancia de Levenshtein simplificada para fuzzy matching
 */
function levenshteinDistance(a: string, b: string): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Normaliza y matchea zona con fuzzy matching
 * Retorna la zona corregida o null si no se puede determinar
 */
export function fuzzyMatchZone(input: string): {
  zone: Zone | null;
  corrected: boolean;
  original: string;
} {
  const original = input;
  const normalized = input.toLowerCase().trim();

  // Buscar en variantes exactas
  if (ZONE_VARIANTS[normalized]) {
    return {
      zone: ZONE_VARIANTS[normalized],
      corrected: normalized !== ZONE_VARIANTS[normalized].toLowerCase(),
      original,
    };
  }

  // Buscar match exacto en zonas
  for (const zone of ZONES) {
    if (zone.toLowerCase() === normalized) {
      return { zone, corrected: false, original };
    }
  }

  // Fuzzy matching con distancia de Levenshtein (max 2 errores)
  let bestMatch: Zone | null = null;
  let bestDistance = 3; // Umbral maximo

  for (const zone of ZONES) {
    const distance = levenshteinDistance(normalized, zone.toLowerCase());
    if (distance < bestDistance) {
      bestDistance = distance;
      bestMatch = zone;
    }
  }

  return {
    zone: bestMatch,
    corrected: bestMatch !== null,
    original,
  };
}

// =============================================================================
// NORMALIZACION DE COLUMNAS
// =============================================================================

/**
 * Normaliza nombres de columnas (minusculas, sin espacios extra, sin acentos)
 */
function normalizeColumnName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remover acentos
    .replace(/\s+/g, '_');
}

/**
 * Mapea columnas del Excel a nombres esperados
 */
function mapColumns(headers: string[], requiredColumns: readonly string[]): {
  mapping: Record<string, string>;
  missingColumns: string[];
} {
  const normalizedHeaders = headers.map(normalizeColumnName);
  const mapping: Record<string, string> = {};
  const missingColumns: string[] = [];

  for (const required of requiredColumns) {
    const normalizedRequired = normalizeColumnName(required);
    const index = normalizedHeaders.indexOf(normalizedRequired);

    if (index !== -1) {
      mapping[headers[index]] = required;
    } else {
      // Buscar variantes comunes
      const variants = getColumnVariants(required);
      let found = false;

      for (const variant of variants) {
        const variantIndex = normalizedHeaders.indexOf(normalizeColumnName(variant));
        if (variantIndex !== -1) {
          mapping[headers[variantIndex]] = required;
          found = true;
          break;
        }
      }

      if (!found) {
        missingColumns.push(required);
      }
    }
  }

  return { mapping, missingColumns };
}

/**
 * Variantes comunes de nombres de columnas
 */
function getColumnVariants(column: string): string[] {
  const variants: Record<string, string[]> = {
    'fecha': ['fecha', 'date', 'fecha_apertura', 'fecha apertura'],
    'zona': ['zona', 'zone', 'region', 'ubicacion'],
    'puesto': ['puesto', 'cargo', 'posicion', 'titulo', 'title'],
    'nivel': ['nivel', 'level', 'categoria', 'grado'],
    'prioridad': ['prioridad', 'priority', 'urgencia'],
    'cantidad': ['cantidad', 'qty', 'headcount', 'vacantes', 'plazas'],
    'descripcion': ['descripcion', 'description', 'detalle'],
    'observaciones': ['observaciones', 'notas', 'comentarios', 'obs'],
    'semana': ['semana', 'week', 'sem'],
    'ano': ['ano', 'year', 'anio', 'anno'],
    'cultivo': ['cultivo', 'crop', 'producto'],
    'produccion_kg': ['produccion_kg', 'produccion', 'kg', 'kilos', 'production'],
    'trabajadores_estimados': ['trabajadores_estimados', 'trabajadores', 'workers', 'personal'],
  };

  return variants[column] || [column];
}

// =============================================================================
// UTILIDADES PARA PIVOT TABLES
// =============================================================================

/**
 * Mapeo de meses en espanol a numero de mes (1-12)
 */
const SPANISH_MONTHS: Record<string, number> = {
  'enero': 1,
  'febrero': 2,
  'marzo': 3,
  'abril': 4,
  'mayo': 5,
  'junio': 6,
  'julio': 7,
  'agosto': 8,
  'septiembre': 9,
  'setiembre': 9, // variante comun en Peru
  'octubre': 10,
  'noviembre': 11,
  'diciembre': 12,
};

/**
 * Convierte nombre de mes en espanol a numero
 */
function spanishMonthToNumber(month: string): number | null {
  const normalized = month.toLowerCase().trim();
  return SPANISH_MONTHS[normalized] ?? null;
}

/**
 * Lee un archivo Excel y retorna todas las filas como arrays (para pivot tables)
 */
async function readExcelRawRows(file: ArrayBuffer): Promise<{
  rows: unknown[][];
  sheetName: string;
}> {
  const workbook = await XLSX.read(file, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Use the _rows from our compat layer
  const rows = worksheet._rows || [];

  return { rows, sheetName };
}

/**
 * Detecta si una fila es la fila de headers de CONSOLIDADO pivot table
 * Busca 'Etiquetas de fila' en la primera columna
 */
function isConsolidadoPivotHeaderRow(row: unknown[]): boolean {
  const firstCell = String(row[0] || '').toLowerCase().trim();
  return firstCell === 'etiquetas de fila';
}

/**
 * Detecta si una fila es la fila de headers de PICOS pivot table
 * Busca 'MES' y 'SEMANA' en las primeras columnas
 */
function isPicosPivotHeaderRow(row: unknown[]): boolean {
  const first = String(row[0] || '').toUpperCase().trim();
  const second = String(row[1] || '').toUpperCase().trim();
  return first === 'MES' && second === 'SEMANA';
}

/**
 * Detecta si el archivo es un pivot table de CONSOLIDADO
 * Busca patrones como 'Etiquetas de fila' o 'Cuenta de PUESTO'
 */
function isConsolidadoPivotTable(rows: unknown[][]): boolean {
  const MAX_COLS_TO_CHECK = 50; // Limit columns to avoid memory issues with wide sheets
  const MAX_CELL_LENGTH = 200; // Only need to check first part of cell content

  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;

    const firstCell = String(row[0] || '').slice(0, MAX_CELL_LENGTH).toLowerCase();

    // Buscar indicadores de pivot table CONSOLIDADO
    if (firstCell.includes('etiquetas de fila')) return true;
    if (firstCell.includes('cuenta de puesto')) return true;

    // Verificar si alguna celda tiene 'Cuenta de PUESTO' - limit to first N columns
    const colsToCheck = Math.min(MAX_COLS_TO_CHECK, row.length);
    for (let j = 0; j < colsToCheck; j++) {
      const cellStr = String(row[j] || '').slice(0, MAX_CELL_LENGTH).toLowerCase();
      if (cellStr.includes('cuenta de puesto')) return true;
    }
  }
  return false;
}

/**
 * Detecta si el archivo es un pivot table de PICOS
 * Busca patrones como 'SEMANA' y nombres de zonas (VIRU, CHINCHA)
 */
function isPicosPivotTable(rows: unknown[][]): boolean {
  for (let i = 0; i < Math.min(10, rows.length); i++) {
    const row = rows[i];
    if (!row) continue;

    // Buscar fila que tenga 'MES' y 'SEMANA' - limit cell length to avoid memory issues
    // BUGFIX: Build string incrementally instead of using join() to avoid RangeError
    let rowStr = '';
    const colsToCheck = Math.min(30, row.length);
    for (let j = 0; j < colsToCheck; j++) {
      const cellStr = String(row[j] || '').slice(0, 50).toUpperCase();
      rowStr += ' ' + cellStr;
      if (rowStr.length > 2000) break; // Early exit if string gets too long
    }

    if (rowStr.includes('MES') && rowStr.includes('SEMANA')) {
      // Verificar si hay nombres de zonas
      const hasZones = ['VIRU', 'CHINCHA', 'PAIJAN', 'SANTA', 'TRUJILLO']
        .some(zone => rowStr.includes(zone));
      if (hasZones) return true;
    }
  }
  return false;
}

/**
 * Valida que un valor sea numerico y positivo
 */
function isValidCount(value: unknown): value is number {
  if (typeof value === 'number') {
    return !isNaN(value) && value >= 0;
  }
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return !isNaN(num) && num >= 0;
  }
  return false;
}

/**
 * Convierte valor a numero o retorna 0
 */
function toNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }
  return 0;
}

// =============================================================================
// PARSEO DE ARCHIVOS
// =============================================================================

/**
 * Lee un archivo Excel y extrae las filas como objetos
 */
async function readExcelFile(file: ArrayBuffer): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  sheetName: string;
}> {
  const workbook = await XLSX.read(file, { type: 'array', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];

  // Get raw rows from compat layer
  const rawRows = worksheet._rows || [];

  if (rawRows.length === 0) {
    return { headers: [], rows: [], sheetName };
  }

  // First row is headers
  const headers: string[] = (rawRows[0] || []).map((cell: unknown, index: number) =>
    cell?.toString() || `Column_${index}`
  );

  // Extract data rows
  const rows: Record<string, unknown>[] = [];
  for (let i = 1; i < rawRows.length; i++) {
    const rawRow = rawRows[i] || [];
    const rowData: Record<string, unknown> = {};
    let hasData = false;

    for (let j = 0; j < headers.length; j++) {
      const cell = rawRow[j];
      const header = headers[j];

      if (cell !== undefined && cell !== null && cell !== '') {
        rowData[header] = cell;
        hasData = true;
      }
    }

    // Only add rows with data
    if (hasData) {
      rows.push(rowData);
    }
  }

  return { headers, rows, sheetName };
}

/**
 * Transforma una fila raw a formato esperado por el schema CONSOLIDADO
 */
function transformConsolidadoRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};

  for (const [excelCol, schemaCol] of Object.entries(mapping)) {
    const value = raw[excelCol];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Transformaciones especificas por campo
    switch (schemaCol) {
      case 'fecha': {
        // Manejar fechas de Excel (pueden ser objetos Date o strings)
        if (value instanceof Date) {
          transformed.fecha = value.toISOString().split('T')[0];
        } else if (typeof value === 'number') {
          // Excel serial date - convert to Date
          // Excel epoch is Jan 1, 1900 (with 1900 leap year bug)
          const excelEpoch = new Date(1899, 11, 30);
          const date = new Date(excelEpoch.getTime() + value * 24 * 60 * 60 * 1000);
          transformed.fecha = date.toISOString().split('T')[0];
        } else {
          transformed.fecha = String(value);
        }
        break;
      }
      case 'zona': {
        // Aplicar fuzzy matching
        const { zone } = fuzzyMatchZone(String(value));
        transformed.zona = zone || String(value);
        break;
      }
      case 'prioridad': {
        // Normalizar prioridad (P1, P2, P3)
        const priority = String(value).toUpperCase().trim();
        transformed.prioridad = priority.startsWith('P') ? priority : `P${priority}`;
        break;
      }
      case 'nivel': {
        // El nivel puede ser numerico o string
        transformed.nivel = String(value);
        break;
      }
      default:
        transformed[schemaCol] = value;
    }
  }

  return transformed;
}

/**
 * Transforma una fila raw a formato esperado por el schema PICOS
 */
function transformPicosRow(
  raw: Record<string, unknown>,
  mapping: Record<string, string>
): Record<string, unknown> {
  const transformed: Record<string, unknown> = {};

  for (const [excelCol, schemaCol] of Object.entries(mapping)) {
    const value = raw[excelCol];

    if (value === undefined || value === null || value === '') {
      continue;
    }

    // Transformaciones especificas por campo
    switch (schemaCol) {
      case 'zona': {
        const { zone } = fuzzyMatchZone(String(value));
        transformed.zona = zone || String(value);
        break;
      }
      case 'cultivo': {
        // Normalizar cultivo a minusculas sin acentos
        const crop = String(value)
          .toLowerCase()
          .trim()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        transformed.cultivo = crop;
        break;
      }
      default:
        transformed[schemaCol] = value;
    }
  }

  return transformed;
}

// =============================================================================
// FUNCIONES PRINCIPALES DE PARSEO
// =============================================================================

/**
 * Parsea archivo Excel CONSOLIDADO con validacion Zod
 * @param file - Buffer del archivo Excel
 * @returns Resultado con datos validados, errores y advertencias
 */
export async function parseConsolidado(file: ArrayBuffer): Promise<ParseResult<ConsolidadoRow>> {
  const result: ParseResult<ConsolidadoRow> = {
    data: [],
    errors: [],
    warnings: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
  };

  try {
    // Leer archivo
    const { headers, rows, sheetName } = await readExcelFile(file);
    result.totalRows = rows.length;

    // Validar columnas requeridas
    const columnsResult = consolidadoColumnsSchema.safeParse({ columns: headers });
    if (!columnsResult.success) {
      result.errors.push({
        row: 0,
        field: 'columns',
        value: headers,
        message: columnsResult.error.issues[0].message,
      });
      return result;
    }

    // Mapear columnas
    const { mapping, missingColumns } = mapColumns(headers, CONSOLIDADO_REQUIRED_COLUMNS);
    if (missingColumns.length > 0) {
      result.errors.push({
        row: 0,
        field: 'columns',
        value: missingColumns,
        message: `Columnas faltantes: ${missingColumns.join(', ')}`,
      });
      return result;
    }

    // Procesar filas
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2; // +2 porque Excel empieza en 1 y la primera fila son headers
      const rawRow = rows[i];

      // Transformar fila
      const transformed = transformConsolidadoRow(rawRow, mapping);

      // Validar con Zod
      const validationResult = consolidadoRowSchema.safeParse(transformed);

      if (validationResult.success) {
        result.data.push(validationResult.data);
        result.validRows++;

        // Agregar advertencias para zonas corregidas
        const originalZona = rawRow[Object.keys(mapping).find(k => mapping[k] === 'zona') || ''];
        if (originalZona) {
          const zoneMatch = fuzzyMatchZone(String(originalZona));
          if (zoneMatch.corrected && zoneMatch.zone) {
            result.warnings.push({
              row: rowNumber,
              field: 'zona',
              value: zoneMatch.original,
              message: 'Zona corregida automaticamente',
              suggestion: `Cambiar "${zoneMatch.original}" a "${zoneMatch.zone}"`,
            });
          }
        }
      } else {
        result.invalidRows++;

        // Agregar errores de validacion
        for (const issue of validationResult.error.issues) {
          result.errors.push({
            row: rowNumber,
            field: issue.path.join('.'),
            value: transformed[issue.path[0] as string],
            message: issue.message,
          });
        }
      }
    }
  } catch (error) {
    result.errors.push({
      row: 0,
      field: 'file',
      value: null,
      message: error instanceof Error ? error.message : 'Error al procesar el archivo',
    });
  }

  return result;
}

/**
 * Parsea archivo Excel Picos con validacion Zod
 * @param file - Buffer del archivo Excel
 * @returns Resultado con datos validados, errores y advertencias
 */
export async function parsePicos(file: ArrayBuffer): Promise<ParseResult<PicosRow>> {
  const result: ParseResult<PicosRow> = {
    data: [],
    errors: [],
    warnings: [],
    totalRows: 0,
    validRows: 0,
    invalidRows: 0,
  };

  try {
    // Leer archivo
    const { headers, rows, sheetName } = await readExcelFile(file);
    result.totalRows = rows.length;

    // Validar columnas requeridas
    const columnsResult = picosColumnsSchema.safeParse({ columns: headers });
    if (!columnsResult.success) {
      result.errors.push({
        row: 0,
        field: 'columns',
        value: headers,
        message: columnsResult.error.issues[0].message,
      });
      return result;
    }

    // Mapear columnas
    const { mapping, missingColumns } = mapColumns(headers, PICOS_REQUIRED_COLUMNS);
    if (missingColumns.length > 0) {
      result.errors.push({
        row: 0,
        field: 'columns',
        value: missingColumns,
        message: `Columnas faltantes: ${missingColumns.join(', ')}`,
      });
      return result;
    }

    // Procesar filas
    for (let i = 0; i < rows.length; i++) {
      const rowNumber = i + 2;
      const rawRow = rows[i];

      // Transformar fila
      const transformed = transformPicosRow(rawRow, mapping);

      // Validar con Zod
      const validationResult = picosRowSchema.safeParse(transformed);

      if (validationResult.success) {
        result.data.push(validationResult.data);
        result.validRows++;

        // Agregar advertencias para zonas corregidas
        const originalZona = rawRow[Object.keys(mapping).find(k => mapping[k] === 'zona') || ''];
        if (originalZona) {
          const zoneMatch = fuzzyMatchZone(String(originalZona));
          if (zoneMatch.corrected && zoneMatch.zone) {
            result.warnings.push({
              row: rowNumber,
              field: 'zona',
              value: zoneMatch.original,
              message: 'Zona corregida automaticamente',
              suggestion: `Cambiar "${zoneMatch.original}" a "${zoneMatch.zone}"`,
            });
          }
        }
      } else {
        result.invalidRows++;

        for (const issue of validationResult.error.issues) {
          result.errors.push({
            row: rowNumber,
            field: issue.path.join('.'),
            value: transformed[issue.path[0] as string],
            message: issue.message,
          });
        }
      }
    }
  } catch (error) {
    result.errors.push({
      row: 0,
      field: 'file',
      value: null,
      message: error instanceof Error ? error.message : 'Error al procesar el archivo',
    });
  }

  return result;
}

/**
 * Detecta automaticamente el tipo de archivo Excel basado en columnas
 */
export function detectFileType(headers: string[]): ExcelFileType | null {
  const normalizedHeaders = headers.map(normalizeColumnName);

  // Verificar si tiene columnas de PICOS (semana, ano, cultivo)
  const picosMatches = ['semana', 'ano', 'cultivo'].filter(col =>
    normalizedHeaders.some(h => h.includes(col))
  );

  // Verificar si tiene columnas de CONSOLIDADO (puesto, prioridad)
  const consolidadoMatches = ['puesto', 'prioridad'].filter(col =>
    normalizedHeaders.some(h => h.includes(col))
  );

  if (picosMatches.length >= 2) return 'PICOS';
  if (consolidadoMatches.length >= 2) return 'CONSOLIDADO';

  return null;
}

/**
 * Obtiene preview de las primeras N filas del archivo
 */
export async function getPreview(file: ArrayBuffer, maxRows: number = 5): Promise<{
  headers: string[];
  rows: Record<string, unknown>[];
  detectedType: ExcelFileType | null;
}> {
  const { headers, rows } = await readExcelFile(file);

  return {
    headers,
    rows: rows.slice(0, maxRows),
    detectedType: detectFileType(headers),
  };
}

/**
 * Procesa archivo en chunks para archivos grandes (>2000 filas)
 * Retorna un generador async para procesar por partes
 */
export async function* parseInChunks<T extends ConsolidadoRow | PicosRow>(
  file: ArrayBuffer,
  fileType: ExcelFileType,
  chunkSize: number = 500
): AsyncGenerator<{
  chunk: number;
  totalChunks: number;
  data: T[];
  errors: ValidationError[];
  warnings: ValidationWarning[];
}> {
  const { headers, rows } = await readExcelFile(file);
  const totalChunks = Math.ceil(rows.length / chunkSize);

  // Mapear columnas una vez
  const requiredColumns = fileType === 'CONSOLIDADO'
    ? CONSOLIDADO_REQUIRED_COLUMNS
    : PICOS_REQUIRED_COLUMNS;
  const { mapping } = mapColumns(headers, requiredColumns);

  // Seleccionar schema y transformer
  const schema = fileType === 'CONSOLIDADO' ? consolidadoRowSchema : picosRowSchema;
  const transformer = fileType === 'CONSOLIDADO'
    ? transformConsolidadoRow
    : transformPicosRow;

  for (let chunk = 0; chunk < totalChunks; chunk++) {
    const start = chunk * chunkSize;
    const end = Math.min(start + chunkSize, rows.length);
    const chunkRows = rows.slice(start, end);

    const data: T[] = [];
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    for (let i = 0; i < chunkRows.length; i++) {
      const rowNumber = start + i + 2;
      const rawRow = chunkRows[i];
      const transformed = transformer(rawRow, mapping);
      const validationResult = schema.safeParse(transformed);

      if (validationResult.success) {
        data.push(validationResult.data as T);

        // Check for zone corrections
        const originalZona = rawRow[Object.keys(mapping).find(k => mapping[k] === 'zona') || ''];
        if (originalZona) {
          const zoneMatch = fuzzyMatchZone(String(originalZona));
          if (zoneMatch.corrected && zoneMatch.zone) {
            warnings.push({
              row: rowNumber,
              field: 'zona',
              value: zoneMatch.original,
              message: 'Zona corregida automaticamente',
              suggestion: `Cambiar "${zoneMatch.original}" a "${zoneMatch.zone}"`,
            });
          }
        }
      } else {
        for (const issue of validationResult.error.issues) {
          errors.push({
            row: rowNumber,
            field: issue.path.join('.'),
            value: transformed[issue.path[0] as string],
            message: issue.message,
          });
        }
      }
    }

    yield {
      chunk: chunk + 1,
      totalChunks,
      data,
      errors,
      warnings,
    };
  }
}

// =============================================================================
// PARSEO DE PIVOT TABLES
// =============================================================================

/**
 * Parsea archivo Excel CONSOLIDADO en formato pivot table
 *
 * Estructura esperada:
 * - Row con 'Etiquetas de fila' contiene nombres de departamentos
 * - Filas de datos: [nombre_posicion, count1, count2, ..., total]
 *
 * @param file - Buffer del archivo Excel
 * @returns Resultado con datos normalizados por posicion/departamento
 */
export async function parseConsolidadoPivot(
  file: ArrayBuffer
): Promise<PivotParseResult<ConsolidadoPivotParsed>> {
  const result: PivotParseResult<ConsolidadoPivotParsed> = {
    success: false,
    data: [],
    totalRows: 0,
    validRows: 0,
    errors: [],
    metadata: {
      fileType: 'CONSOLIDADO',
      detectedHeaders: [],
      skipRows: 0,
    },
  };

  try {
    const { rows } = await readExcelRawRows(file);

    if (rows.length === 0) {
      result.errors.push({
        row: 0,
        message: 'El archivo esta vacio',
      });
      return result;
    }

    // Buscar fila de headers (con 'Etiquetas de fila')
    let headerRowIndex = -1;
    let departments: string[] = [];

    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (isConsolidadoPivotHeaderRow(row)) {
        headerRowIndex = i;
        // Extraer nombres de departamentos (columnas despues de 'Etiquetas de fila')
        departments = row
          .slice(1)
          .filter((cell): cell is string =>
            cell !== null &&
            cell !== undefined &&
            String(cell).trim() !== ''
          )
          .map(cell => String(cell).trim());
        break;
      }
    }

    if (headerRowIndex === -1) {
      result.errors.push({
        row: 0,
        message: 'No se encontro la fila de encabezados. Busque una fila con "Etiquetas de fila".',
      });
      return result;
    }

    result.metadata.skipRows = headerRowIndex + 1;
    result.metadata.detectedHeaders = ['POSICION', ...departments];

    // Procesar filas de datos (despues del header)
    const dataRows = rows.slice(headerRowIndex + 1);
    result.totalRows = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = headerRowIndex + 2 + i; // +2 porque Excel empieza en 1 y tenemos header

      // Saltar filas vacias
      if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
        continue;
      }

      // Primera columna es el nombre de la posicion
      const positionName = String(row[0] || '').trim();

      if (!positionName) {
        result.errors.push({
          row: rowNumber,
          message: 'Nombre de posicion vacio',
        });
        continue;
      }

      // Saltar filas que parecen ser subtotales o resumen
      const positionLower = positionName.toLowerCase();
      if (positionLower === 'total general' ||
          positionLower === 'gran total' ||
          positionLower.startsWith('total')) {
        continue;
      }

      // Calcular el total (ultima columna con valor numerico)
      const numericValues = row.slice(1).filter(isValidCount);
      const total = numericValues.length > 0
        ? toNumber(numericValues[numericValues.length - 1])
        : 0;

      // Crear registro por cada departamento con valor > 0
      for (let j = 0; j < departments.length; j++) {
        const department = departments[j];
        const count = toNumber(row[j + 1]);

        // Solo incluir si hay un conteo positivo
        if (count > 0) {
          result.data.push({
            position_name: positionName,
            department,
            count,
            total,
          });
          result.validRows++;
        }
      }
    }

    result.success = result.data.length > 0;

    if (!result.success && result.errors.length === 0) {
      result.errors.push({
        row: 0,
        message: 'No se encontraron datos validos en el archivo',
      });
    }

  } catch (error) {
    result.errors.push({
      row: 0,
      message: error instanceof Error
        ? `Error al procesar el archivo: ${error.message}`
        : 'Error desconocido al procesar el archivo',
    });
  }

  return result;
}

/**
 * Parsea archivo Excel PICOS en formato pivot table
 *
 * Estructura esperada:
 * - Row con 'MES', 'SEMANA' contiene nombres de zonas
 * - Filas de datos: [mes, semana, prod_zona1, prod_zona2, ...]
 *
 * @param file - Buffer del archivo Excel
 * @param year - Ano a asignar (default: ano actual)
 * @returns Resultado con datos normalizados por zona/semana
 */
export async function parsePicosPivot(
  file: ArrayBuffer,
  year?: number
): Promise<PivotParseResult<PicosPivotParsed>> {
  const result: PivotParseResult<PicosPivotParsed> = {
    success: false,
    data: [],
    totalRows: 0,
    validRows: 0,
    errors: [],
    metadata: {
      fileType: 'PICOS',
      detectedHeaders: [],
      skipRows: 0,
    },
  };

  // Si no se proporciona ano, intentar extraerlo del archivo o usar el actual
  const defaultYear = year ?? new Date().getFullYear();

  try {
    const { rows } = await readExcelRawRows(file);

    if (rows.length === 0) {
      result.errors.push({
        row: 0,
        message: 'El archivo esta vacio',
      });
      return result;
    }

    // Intentar extraer el ano de las primeras filas del archivo
    let detectedYear = defaultYear;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const row = rows[i];
      for (const cell of row) {
        const cellStr = String(cell || '');
        // Buscar patrones como "VER 01- 2026" o "2026"
        const yearMatch = cellStr.match(/20\d{2}/);
        if (yearMatch) {
          detectedYear = parseInt(yearMatch[0], 10);
          break;
        }
      }
    }

    // Buscar fila de headers de zonas (con 'MES', 'SEMANA')
    let headerRowIndex = -1;
    let zones: string[] = [];

    for (let i = 0; i < Math.min(20, rows.length); i++) {
      const row = rows[i];
      if (isPicosPivotHeaderRow(row)) {
        headerRowIndex = i;
        // Extraer nombres de zonas (columnas despues de 'MES' y 'SEMANA')
        zones = row
          .slice(2) // Skip MES y SEMANA
          .filter((cell): cell is string =>
            cell !== null &&
            cell !== undefined &&
            String(cell).trim() !== ''
          )
          .map(cell => String(cell).trim().toUpperCase());
        break;
      }
    }

    if (headerRowIndex === -1) {
      result.errors.push({
        row: 0,
        message: 'No se encontro la fila de encabezados. Busque una fila con "MES" y "SEMANA".',
      });
      return result;
    }

    result.metadata.skipRows = headerRowIndex + 1;
    result.metadata.detectedHeaders = ['MES', 'SEMANA', ...zones];

    // Procesar filas de datos (despues del header)
    const dataRows = rows.slice(headerRowIndex + 1);
    result.totalRows = dataRows.length;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      const rowNumber = headerRowIndex + 2 + i;

      // Saltar filas vacias
      if (!row || row.every(cell => cell === null || cell === undefined || String(cell).trim() === '')) {
        continue;
      }

      // Primera columna es el mes (puede ser nombre en espanol)
      const monthRaw = String(row[0] || '').trim();

      if (!monthRaw) {
        continue; // Saltar filas sin mes
      }

      // Saltar filas que parecen ser totales
      const monthLower = monthRaw.toLowerCase();
      if (monthLower === 'total' ||
          monthLower === 'total general' ||
          monthLower === 'gran total') {
        continue;
      }

      // Segunda columna es la semana
      const weekRaw = row[1];
      const week = toNumber(weekRaw);

      if (week < 1 || week > 53) {
        result.errors.push({
          row: rowNumber,
          message: `Semana invalida: ${weekRaw}. Debe estar entre 1 y 53.`,
        });
        continue;
      }

      // Crear registro por cada zona con produccion > 0
      for (let j = 0; j < zones.length; j++) {
        const zone = zones[j];
        const productionKg = toNumber(row[j + 2]); // +2 para saltar MES y SEMANA

        // Solo incluir si hay produccion positiva
        if (productionKg > 0) {
          result.data.push({
            month: monthRaw.toUpperCase(),
            week: Math.round(week),
            year: detectedYear,
            zone,
            production_kg: productionKg,
          });
          result.validRows++;
        }
      }
    }

    result.success = result.data.length > 0;

    if (!result.success && result.errors.length === 0) {
      result.errors.push({
        row: 0,
        message: 'No se encontraron datos validos en el archivo',
      });
    }

  } catch (error) {
    result.errors.push({
      row: 0,
      message: error instanceof Error
        ? `Error al procesar el archivo: ${error.message}`
        : 'Error desconocido al procesar el archivo',
    });
  }

  return result;
}

/**
 * Detecta automaticamente el tipo de archivo Excel (incluyendo pivot tables)
 * Extiende detectFileType para soportar pivot tables
 */
export async function detectFileTypePivot(file: ArrayBuffer): Promise<{
  type: ExcelFileType | null;
  isPivotTable: boolean;
}> {
  try {
    const { rows } = await readExcelRawRows(file);

    // Primero verificar si es pivot table
    if (isConsolidadoPivotTable(rows)) {
      return { type: 'CONSOLIDADO', isPivotTable: true };
    }

    if (isPicosPivotTable(rows)) {
      return { type: 'PICOS', isPivotTable: true };
    }

    // Si no es pivot table, usar deteccion normal basada en headers
    const { headers } = await readExcelFile(file);
    const detectedType = detectFileType(headers);

    return { type: detectedType, isPivotTable: false };

  } catch {
    return { type: null, isPivotTable: false };
  }
}

/**
 * Obtiene preview de pivot table con estructura detectada
 */
export async function getPreviewPivot(file: ArrayBuffer, maxRows: number = 5): Promise<{
  type: ExcelFileType | null;
  isPivotTable: boolean;
  headers: string[];
  rows: unknown[][];
  metadata: {
    headerRowIndex: number;
    columnCount: number;
  };
}> {
  try {
    const { rows } = await readExcelRawRows(file);
    const { type, isPivotTable } = await detectFileTypePivot(file);

    if (!isPivotTable) {
      // Usar preview normal para archivos tabulares
      const normalPreview = await getPreview(file, maxRows);
      return {
        type,
        isPivotTable: false,
        headers: normalPreview.headers,
        rows: normalPreview.rows.map(r => Object.values(r)),
        metadata: {
          headerRowIndex: 0,
          columnCount: normalPreview.headers.length,
        },
      };
    }

    // Para pivot tables, encontrar el header y mostrar datos estructurados
    let headerRowIndex = 0;
    let headers: string[] = [];

    if (type === 'CONSOLIDADO') {
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        if (isConsolidadoPivotHeaderRow(rows[i])) {
          headerRowIndex = i;
          headers = rows[i].map(cell => String(cell || '').trim());
          break;
        }
      }
    } else if (type === 'PICOS') {
      for (let i = 0; i < Math.min(20, rows.length); i++) {
        if (isPicosPivotHeaderRow(rows[i])) {
          headerRowIndex = i;
          headers = rows[i].map(cell => String(cell || '').trim());
          break;
        }
      }
    }

    // Obtener filas de datos despues del header
    const dataRows = rows.slice(headerRowIndex + 1, headerRowIndex + 1 + maxRows);

    return {
      type,
      isPivotTable: true,
      headers,
      rows: dataRows,
      metadata: {
        headerRowIndex,
        columnCount: headers.length,
      },
    };

  } catch {
    return {
      type: null,
      isPivotTable: false,
      headers: [],
      rows: [],
      metadata: {
        headerRowIndex: 0,
        columnCount: 0,
      },
    };
  }
}
