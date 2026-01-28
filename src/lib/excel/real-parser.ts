/**
 * Parser for REAL Excel files
 *
 * PICOS: Production forecast pivot table (weekly KG by product)
 * CONSOLIDADO: Historical recruitment data (positions, candidates, status)
 *
 * SECURITY: Uses exceljs via compat layer (no prototype pollution/ReDoS vulnerabilities)
 */

import { read, utils, type WorkbookCompat, type SheetCompat } from './xlsx-compat';

// =============================================================================
// TYPES
// =============================================================================

export interface ExcelMetadata {
  fileName: string;
  extractedDate: Date | null;
  dateSource: 'filename' | 'header' | 'cell' | 'unknown';
  sheetName: string;
  totalRows: number;
}

/**
 * PICOS row - weekly production forecast
 */
export interface PicosRealRow {
  mes: string;
  semana: number;
  year: number;
  // Production by product type (KG)
  pimiento_kg: number;
  alcachofa_kg: number;
  arandanos_kg: number;
  palta_kg: number;
  esparrago_kg: number;
  uvas_kg: number;
  mango_kg: number;
  pina_kg: number;
  total_kg: number;
}

/**
 * CONSOLIDADO row - recruitment position data
 */
export interface ConsolidadoRealRow {
  codigo: string;
  responsable: string;
  business_partner: string | null;
  fecha: Date;
  semana_inicio: number;
  mes_inicio: string;
  ano_inicio: number;
  proceso: string;
  zona: string;  // DSUBDIVISION
  cultivo: string | null;
  gerencia: string | null;
  puesto: string;
  grupo_ocupacional: string | null;
  motivo_vacante: string | null;
  status_proceso: string;
  detalle_status: string | null;
  etapa_proceso: string | null;
  dni_seleccionado: string | null;
  seleccionado: string | null;
  telefono: string | null;
  fecha_ingreso: Date | null;
  dias_proceso: number | null;
  cobertura: string | null;  // OPORTUNO, NO OPORTUNO
}

export interface ParseRealResult<T> {
  success: boolean;
  data: T[];
  metadata: ExcelMetadata;
  errors: Array<{ row: number; message: string }>;
}

// =============================================================================
// DATE EXTRACTION
// =============================================================================

/**
 * Extract date from CONSOLIDADO filename
 * Example: "CONSOLIDADO - SELECCIÓN_ 01.12 (1).xlsx" -> December 1st (current year)
 */
function extractDateFromConsolidadoFilename(filename: string): Date | null {
  // Pattern: DD.MM or DD-MM
  const match = filename.match(/(\d{1,2})[.\-](\d{1,2})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = new Date().getFullYear();

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, day);
    }
  }
  return null;
}

/**
 * Extract date from PICOS header cell
 * Example: "VER 01- 2026" -> January 2026
 */
function extractDateFromPicosHeader(headerValue: string): Date | null {
  // Pattern: VER MM- YYYY or similar
  const match = headerValue.match(/VER\s*(\d{1,2})[.\-\s]+(\d{4})/i);
  if (match) {
    const month = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);

    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
      return new Date(year, month - 1, 1);
    }
  }
  return null;
}

/**
 * Convert Excel serial date to JavaScript Date
 */
function excelDateToJS(serial: number): Date | null {
  if (!serial || typeof serial !== 'number' || serial < 1) {
    return null;
  }
  // Excel dates start from 1900-01-01 (serial 1)
  // But Excel incorrectly considers 1900 a leap year, so subtract 1 for dates after Feb 28, 1900
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  return new Date(utcValue);
}

/**
 * Parse Spanish number format (1,234.56 or 1.234,56)
 */
function parseSpanishNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value || value === '-' || value === '') return 0;

  const str = String(value).trim();
  // Remove thousand separators and handle decimal
  // "1,234,567" or "1.234.567" -> 1234567
  // "1,234.56" -> 1234.56

  // If has comma as last separator (European format)
  if (str.match(/,\d{1,2}$/)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  // Standard format or thousands only
  return parseFloat(str.replace(/,/g, '').replace(/\s/g, '')) || 0;
}

// =============================================================================
// PICOS PARSER
// =============================================================================

/**
 * Parse PICOS Excel file (production forecast)
 *
 * Structure:
 * - Rows 0-7: Headers and metadata
 * - Row 8: Column labels (MES, SEMANA, ...)
 * - Row 9+: Data (ENERO, 1, ..., kg values)
 */
export async function parsePicosReal(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseRealResult<PicosRealRow>> {
  const workbook = await read(buffer, { type: 'array' });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const errors: Array<{ row: number; message: string }> = [];
  const data: PicosRealRow[] = [];

  // Extract date from header (row 4 typically has "VER 01- 2026")
  let extractedDate: Date | null = null;
  let dateSource: 'filename' | 'header' | 'cell' | 'unknown' = 'unknown';

  for (let i = 0; i < Math.min(10, rawData.length); i++) {
    const row = rawData[i] as string[];
    for (const cell of row) {
      if (typeof cell === 'string' && cell.includes('VER')) {
        extractedDate = extractDateFromPicosHeader(cell);
        if (extractedDate) {
          dateSource = 'header';
          break;
        }
      }
    }
    if (extractedDate) break;
  }

  // Find data start row (look for MES, SEMANA pattern)
  let dataStartRow = 8; // Default
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const row = rawData[i] as string[];
    if (row && row[0] === 'MES' && row[1] === 'SEMANA') {
      dataStartRow = i + 1;
      break;
    }
  }

  // Product column indices (based on real structure)
  // MES, SEMANA, UNIDAD AGRICOLA, TIPO PROVEEDOR, TIPO MATERIA PRIMA, CARACTERÍSTICA,
  // PIMIENTO, ALCACHOFA zones..., Total ALCACHOFA, ARÁNDANOS, PALTA, ESPÁRRAGO, UVAS, MANGO, PIÑA, Total
  const productIndices = {
    pimiento: 6,
    alcachofa_total: 11,  // Total ALCACHOFA CORAZONES
    arandanos: 12,
    palta: 13,
    esparrago: 14,
    uvas: 15,
    mango: 16,
    pina: 17,
    total: 18
  };

  const year = extractedDate?.getFullYear() || new Date().getFullYear();

  // Parse data rows
  for (let i = dataStartRow; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length < 3) continue;

    const mes = String(row[0] || '').trim();
    const semana = parseInt(String(row[1]), 10);

    // Skip header/total rows
    if (!mes || isNaN(semana) || mes === 'Total general' || mes === 'MES') continue;

    // Carry forward month name for empty cells
    const actualMes = mes || data[data.length - 1]?.mes || '';

    if (!actualMes) continue;

    try {
      data.push({
        mes: actualMes,
        semana,
        year,
        pimiento_kg: parseSpanishNumber(row[productIndices.pimiento]),
        alcachofa_kg: parseSpanishNumber(row[productIndices.alcachofa_total]),
        arandanos_kg: parseSpanishNumber(row[productIndices.arandanos]),
        palta_kg: parseSpanishNumber(row[productIndices.palta]),
        esparrago_kg: parseSpanishNumber(row[productIndices.esparrago]),
        uvas_kg: parseSpanishNumber(row[productIndices.uvas]),
        mango_kg: parseSpanishNumber(row[productIndices.mango]),
        pina_kg: parseSpanishNumber(row[productIndices.pina]),
        total_kg: parseSpanishNumber(row[productIndices.total]),
      });
    } catch (err) {
      errors.push({ row: i + 1, message: `Error parsing row: ${err}` });
    }
  }

  return {
    success: errors.length === 0,
    data,
    metadata: {
      fileName: filename,
      extractedDate,
      dateSource,
      sheetName,
      totalRows: data.length,
    },
    errors,
  };
}

// =============================================================================
// CONSOLIDADO PARSER
// =============================================================================

/**
 * Parse CONSOLIDADO Excel file (recruitment data)
 *
 * Uses sheet "C" which has the detailed position data
 */
export async function parseConsolidadoReal(
  buffer: ArrayBuffer,
  filename: string
): Promise<ParseRealResult<ConsolidadoRealRow>> {
  const workbook = await read(buffer, { type: 'array' });

  // Use sheet "C" which has the detailed data
  const sheetName = workbook.SheetNames.includes('C') ? 'C' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const errors: Array<{ row: number; message: string }> = [];
  const data: ConsolidadoRealRow[] = [];

  // Extract date from filename
  const extractedDate = extractDateFromConsolidadoFilename(filename);
  const dateSource: 'filename' | 'header' | 'cell' | 'unknown' = extractedDate ? 'filename' : 'unknown';

  // First row is headers
  const headers = (rawData[0] || []) as string[];
  if (headers.length === 0) {
    return {
      success: false,
      data: [],
      metadata: { fileName: filename, extractedDate, dateSource, sheetName, totalRows: 0 },
      errors: [{ row: 0, message: 'No headers found' }],
    };
  }

  // Create header index map
  const headerIndex: Record<string, number> = {};
  headers.forEach((h, i) => {
    if (h) headerIndex[String(h).toUpperCase().trim()] = i;
  });

  // Column mapping
  const cols = {
    codigo: headerIndex['CODIGO'],
    responsable: headerIndex['RESPONSABLE'],
    business_partner: headerIndex['BUSSINESS PARTNER'] ?? headerIndex['BUSINESS PARTNER'],
    fecha: headerIndex['FECHA'],
    semana_inicio: headerIndex['SEMANA INICIO'],
    mes_inicio: headerIndex['MES INICIO'],
    ano_inicio: headerIndex['AÑO INICIO'],
    proceso: headerIndex['PROCESO'],
    zona: headerIndex['DSUBDIVISION'],
    cultivo: headerIndex['CULTIVO'],
    gerencia: headerIndex['GERENCIA'],
    puesto: headerIndex['PUESTO'],
    grupo_ocupacional: headerIndex['GRUPO OCUPACIONAL'],
    motivo_vacante: headerIndex['MOTIVO VACANTE'],
    status_proceso: headerIndex['STATUS PROCESO'],
    detalle_status: headerIndex['DETALLE STATUS'],
    etapa_proceso: headerIndex['ETAPA PROCESO'],
    dni_seleccionado: headerIndex['DNI_SELECCIONADO'],
    seleccionado: headerIndex['SELECCIONADO'],
    telefono: headerIndex['TELEFONO'],
    fecha_ingreso: headerIndex['FECHA DE INGRESO A PLANILLA'],
    dias_proceso: headerIndex['DIAS_PROCESO'],
    cobertura: headerIndex['COBERTURA'],
  };

  // Parse data rows (skip header)
  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!row || row.length < 5) continue;

    const codigo = String(row[cols.codigo] || '').trim();
    if (!codigo) continue; // Skip empty rows

    try {
      const fechaRaw = row[cols.fecha];
      const fecha = typeof fechaRaw === 'number'
        ? excelDateToJS(fechaRaw)
        : fechaRaw ? new Date(String(fechaRaw)) : null;

      const fechaIngresoRaw = row[cols.fecha_ingreso];
      const fechaIngreso = typeof fechaIngresoRaw === 'number'
        ? excelDateToJS(fechaIngresoRaw)
        : null;

      data.push({
        codigo,
        responsable: String(row[cols.responsable] || '').trim(),
        business_partner: row[cols.business_partner] ? String(row[cols.business_partner]).trim() : null,
        fecha: fecha || new Date(),
        semana_inicio: parseInt(String(row[cols.semana_inicio] || 0), 10),
        mes_inicio: String(row[cols.mes_inicio] || '').trim(),
        ano_inicio: parseInt(String(row[cols.ano_inicio] || new Date().getFullYear()), 10),
        proceso: String(row[cols.proceso] || '').trim(),
        zona: String(row[cols.zona] || '').trim(),
        cultivo: row[cols.cultivo] ? String(row[cols.cultivo]).trim() : null,
        gerencia: row[cols.gerencia] ? String(row[cols.gerencia]).trim() : null,
        puesto: String(row[cols.puesto] || '').trim(),
        grupo_ocupacional: row[cols.grupo_ocupacional] ? String(row[cols.grupo_ocupacional]).trim() : null,
        motivo_vacante: row[cols.motivo_vacante] ? String(row[cols.motivo_vacante]).trim() : null,
        status_proceso: String(row[cols.status_proceso] || '').trim(),
        detalle_status: row[cols.detalle_status] ? String(row[cols.detalle_status]).trim() : null,
        etapa_proceso: row[cols.etapa_proceso] ? String(row[cols.etapa_proceso]).trim() : null,
        dni_seleccionado: row[cols.dni_seleccionado] ? String(row[cols.dni_seleccionado]).trim() : null,
        seleccionado: row[cols.seleccionado] ? String(row[cols.seleccionado]).trim() : null,
        telefono: row[cols.telefono] ? String(row[cols.telefono]).trim() : null,
        fecha_ingreso: fechaIngreso,
        dias_proceso: row[cols.dias_proceso] != null ? parseInt(String(row[cols.dias_proceso]), 10) : null,
        cobertura: row[cols.cobertura] ? String(row[cols.cobertura]).trim() : null,
      });
    } catch (err) {
      errors.push({ row: i + 1, message: `Error parsing row: ${err}` });
    }
  }

  return {
    success: errors.length === 0,
    data,
    metadata: {
      fileName: filename,
      extractedDate,
      dateSource,
      sheetName,
      totalRows: data.length,
    },
    errors,
  };
}

// =============================================================================
// AUTO-DETECT AND PARSE
// =============================================================================

export type FileType = 'PICOS' | 'CONSOLIDADO' | 'UNKNOWN';

/**
 * Detect file type from filename or content
 */
export async function detectFileType(filename: string, buffer?: ArrayBuffer): Promise<FileType> {
  const lower = filename.toLowerCase();

  if (lower.includes('pico')) return 'PICOS';
  if (lower.includes('consolidado') || lower.includes('seleccion') || lower.includes('selección')) {
    return 'CONSOLIDADO';
  }

  // Try to detect from content
  if (buffer) {
    try {
      const workbook = await read(buffer, { type: 'array' });
      const sheetNames = workbook.SheetNames.map(s => s.toLowerCase());

      if (sheetNames.includes('c') || sheetNames.includes('cubiertos')) {
        return 'CONSOLIDADO';
      }

      // Check first sheet content - limit to avoid memory issues
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const data = utils.sheet_to_json<string[]>(sheet, { header: 1 });

      // Only check first 10 rows, first 20 cols, max 100 chars per cell
      // BUGFIX: Build string incrementally to avoid "Invalid string length" on join()
      let firstRows = '';
      const MAX_SAMPLE_LENGTH = 10000; // 10KB max for detection sample
      for (let i = 0; i < Math.min(10, data.length); i++) {
        const row = data[i];
        if (!Array.isArray(row)) continue;
        for (let j = 0; j < Math.min(20, row.length); j++) {
          const cell = row[j];
          if (cell != null) {
            const cellStr = String(cell).slice(0, 100);
            if (firstRows.length + cellStr.length + 1 < MAX_SAMPLE_LENGTH) {
              firstRows += ' ' + cellStr;
            }
          }
        }
      }
      firstRows = firstRows.toLowerCase();

      if (firstRows.includes('kg brutos') || firstRows.includes('proyección de materia prima')) {
        return 'PICOS';
      }
      if (firstRows.includes('status proceso') || firstRows.includes('responsable')) {
        return 'CONSOLIDADO';
      }
    } catch {
      // Ignore parsing errors
    }
  }

  return 'UNKNOWN';
}

/**
 * Parse Excel file, auto-detecting type
 */
export async function parseExcelAuto(
  buffer: ArrayBuffer,
  filename: string
): Promise<{ type: FileType; result: ParseRealResult<PicosRealRow> | ParseRealResult<ConsolidadoRealRow> }> {
  const type = await detectFileType(filename, buffer);

  if (type === 'PICOS') {
    return { type, result: await parsePicosReal(buffer, filename) };
  }

  if (type === 'CONSOLIDADO') {
    return { type, result: await parseConsolidadoReal(buffer, filename) };
  }

  // Try both and see which has more data
  const picosResult = await parsePicosReal(buffer, filename);
  const consolidadoResult = await parseConsolidadoReal(buffer, filename);

  if (consolidadoResult.data.length > picosResult.data.length) {
    return { type: 'CONSOLIDADO', result: consolidadoResult };
  }

  return { type: 'PICOS', result: picosResult };
}
