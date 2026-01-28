/**
 * Browser-side Excel parser for talentia
 *
 * Parses 93MB Excel files in the browser, extracting only the needed columns
 * and sending ~3MB JSON to the API instead of the full file.
 *
 * IMPORTANT: This runs in the browser, not on the server.
 * Uses the xlsx library which is already in package.json.
 */

import * as XLSX from 'xlsx';

// =============================================================================
// TYPES
// =============================================================================

export type FileType = 'PICOS' | 'CONSOLIDADO' | 'UNKNOWN';

/**
 * Metadata about the parsed file
 */
export interface BrowserParseMetadata {
  fileName: string;
  fileType: FileType;
  extractedDate: string | null;
  dateSource: 'filename' | 'header' | 'cell' | 'unknown';
  sheetName: string;
  totalRows: number;
  originalSizeMB: number;
  jsonSizeKB: number;
}

/**
 * CONSOLIDADO row - only the fields we need (optimized payload)
 */
export interface ConsolidadoRow {
  codigo: string;
  responsable: string;
  business_partner?: string;
  fecha: string; // ISO string
  semana_inicio: number;
  mes_inicio: string;
  ano_inicio: number;
  proceso: string;
  zona: string;
  cultivo?: string;
  gerencia?: string;
  puesto: string;
  grupo_ocupacional?: string;
  motivo_vacante?: string;
  status_proceso: string;
  detalle_status?: string;
  etapa_proceso?: string;
  dni_seleccionado?: string;
  seleccionado?: string;
  telefono?: string;
  fecha_ingreso?: string; // ISO string
  dias_proceso?: number;
  cobertura?: string;
}

/**
 * PICOS row - only the fields we need (optimized payload)
 */
export interface PicosRow {
  mes: string;
  semana: number;
  year: number;
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
 * Result of browser parsing
 */
export interface BrowserParseResult {
  success: boolean;
  fileType: FileType;
  metadata: BrowserParseMetadata;
  rows: ConsolidadoRow[] | PicosRow[];
  errors: Array<{ row: number; message: string }>;
}

/**
 * Progress callback for UI updates
 */
export type ProgressCallback = (progress: {
  stage: 'reading' | 'parsing' | 'extracting' | 'complete';
  percent: number;
  message: string;
}) => void;

// =============================================================================
// DATE EXTRACTION
// =============================================================================

/**
 * Extract date from CONSOLIDADO filename
 * Example: "CONSOLIDADO - SELECCION_ 01.12 (1).xlsx" -> December 1st (current year)
 */
function extractDateFromConsolidadoFilename(filename: string): string | null {
  const match = filename.match(/(\d{1,2})[.\-](\d{1,2})/);
  if (match) {
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = new Date().getFullYear();

    if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
      return new Date(year, month - 1, day).toISOString();
    }
  }
  return null;
}

/**
 * Extract date from PICOS header cell
 * Example: "VER 01- 2026" -> January 2026
 */
function extractDateFromPicosHeader(headerValue: string): string | null {
  const match = headerValue.match(/VER\s*(\d{1,2})[.\-\s]+(\d{4})/i);
  if (match) {
    const month = parseInt(match[1], 10);
    const year = parseInt(match[2], 10);

    if (month >= 1 && month <= 12 && year >= 2020 && year <= 2030) {
      return new Date(year, month - 1, 1).toISOString();
    }
  }
  return null;
}

/**
 * Convert Excel serial date to ISO string
 */
function excelDateToISO(serial: number): string | null {
  if (!serial || typeof serial !== 'number' || serial < 1) {
    return null;
  }
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400 * 1000;
  return new Date(utcValue).toISOString();
}

/**
 * Parse Spanish number format
 */
function parseSpanishNumber(value: unknown): number {
  if (typeof value === 'number') return value;
  if (!value || value === '-' || value === '') return 0;

  const str = String(value).trim();
  if (str.match(/,\d{1,2}$/)) {
    return parseFloat(str.replace(/\./g, '').replace(',', '.')) || 0;
  }
  return parseFloat(str.replace(/,/g, '').replace(/\s/g, '')) || 0;
}

// =============================================================================
// FILE TYPE DETECTION
// =============================================================================

/**
 * Detect file type from filename and sheet structure
 */
function detectFileType(filename: string, sheetNames: string[], firstRowSample: string): FileType {
  const lower = filename.toLowerCase();

  if (lower.includes('pico')) return 'PICOS';
  if (lower.includes('consolidado') || lower.includes('seleccion') || lower.includes('seleccion')) {
    return 'CONSOLIDADO';
  }

  // Check sheet names
  const lowerSheets = sheetNames.map(s => s.toLowerCase());
  if (lowerSheets.includes('c') || lowerSheets.includes('cubiertos')) {
    return 'CONSOLIDADO';
  }

  // Check content
  const lowerContent = firstRowSample.toLowerCase();
  if (lowerContent.includes('kg brutos') || lowerContent.includes('proyeccion de materia prima')) {
    return 'PICOS';
  }
  if (lowerContent.includes('status proceso') || lowerContent.includes('responsable') || lowerContent.includes('codigo')) {
    return 'CONSOLIDADO';
  }

  return 'UNKNOWN';
}

// =============================================================================
// CONSOLIDADO PARSER
// =============================================================================

function parseConsolidado(
  workbook: XLSX.WorkBook,
  filename: string,
  onProgress?: ProgressCallback
): { rows: ConsolidadoRow[]; metadata: Partial<BrowserParseMetadata>; errors: Array<{ row: number; message: string }> } {
  const sheetName = workbook.SheetNames.includes('C') ? 'C' : workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const errors: Array<{ row: number; message: string }> = [];
  const rows: ConsolidadoRow[] = [];

  const extractedDate = extractDateFromConsolidadoFilename(filename);
  const dateSource: 'filename' | 'unknown' = extractedDate ? 'filename' : 'unknown';

  // First row is headers
  const headers = (rawData[0] || []) as string[];
  if (headers.length === 0) {
    errors.push({ row: 0, message: 'No headers found' });
    return { rows, metadata: { extractedDate, dateSource, sheetName, totalRows: 0 }, errors };
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
    ano_inicio: headerIndex['ANO INICIO'] ?? headerIndex['AÑO INICIO'],
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

  const totalDataRows = rawData.length - 1;

  // Parse data rows (skip header)
  for (let i = 1; i < rawData.length; i++) {
    // Progress update every 1000 rows
    if (onProgress && i % 1000 === 0) {
      onProgress({
        stage: 'extracting',
        percent: Math.round((i / totalDataRows) * 100),
        message: `Procesando fila ${i} de ${totalDataRows}...`,
      });
    }

    const raw = rawData[i] as unknown[];
    if (!raw || raw.length < 5) continue;

    const codigo = String(raw[cols.codigo] || '').trim();
    if (!codigo) continue;

    try {
      const fechaRaw = raw[cols.fecha];
      const fecha = typeof fechaRaw === 'number'
        ? excelDateToISO(fechaRaw)
        : fechaRaw ? new Date(String(fechaRaw)).toISOString() : null;

      const fechaIngresoRaw = raw[cols.fecha_ingreso];
      const fechaIngreso = typeof fechaIngresoRaw === 'number'
        ? excelDateToISO(fechaIngresoRaw)
        : null;

      // Extract key fields for filtering
      const statusProceso = String(raw[cols.status_proceso] || '').trim().toUpperCase();
      const anoInicio = parseInt(String(raw[cols.ano_inicio] || 0), 10);
      const currentYear = new Date().getFullYear();
      const minYear = currentYear - 1;

      // CLIENT-SIDE FILTER: Only include rows that will actually be imported
      // This matches the server-side filter in upload-json/route.ts
      const isImportableStatus = statusProceso === 'EN PROCESO' || statusProceso === 'CUBIERTO';
      const isRecentYear = anoInicio >= minYear;

      if (!isImportableStatus || !isRecentYear) {
        continue; // Skip rows that won't be imported anyway
      }

      // Build row object, omitting null/undefined values to minimize payload
      const row: ConsolidadoRow = {
        codigo,
        responsable: String(raw[cols.responsable] || '').trim(),
        fecha: fecha || new Date().toISOString(),
        semana_inicio: parseInt(String(raw[cols.semana_inicio] || 0), 10),
        mes_inicio: String(raw[cols.mes_inicio] || '').trim(),
        ano_inicio: anoInicio,
        proceso: String(raw[cols.proceso] || '').trim(),
        zona: String(raw[cols.zona] || '').trim(),
        puesto: String(raw[cols.puesto] || '').trim(),
        status_proceso: statusProceso,
      };

      // Optional fields - only include if they have values
      if (raw[cols.business_partner]) row.business_partner = String(raw[cols.business_partner]).trim();
      if (raw[cols.cultivo]) row.cultivo = String(raw[cols.cultivo]).trim();
      if (raw[cols.gerencia]) row.gerencia = String(raw[cols.gerencia]).trim();
      if (raw[cols.grupo_ocupacional]) row.grupo_ocupacional = String(raw[cols.grupo_ocupacional]).trim();
      if (raw[cols.motivo_vacante]) row.motivo_vacante = String(raw[cols.motivo_vacante]).trim();
      if (raw[cols.detalle_status]) row.detalle_status = String(raw[cols.detalle_status]).trim();
      if (raw[cols.etapa_proceso]) row.etapa_proceso = String(raw[cols.etapa_proceso]).trim();
      if (raw[cols.dni_seleccionado]) row.dni_seleccionado = String(raw[cols.dni_seleccionado]).trim();
      if (raw[cols.seleccionado]) row.seleccionado = String(raw[cols.seleccionado]).trim();
      if (raw[cols.telefono]) row.telefono = String(raw[cols.telefono]).trim();
      if (fechaIngreso) row.fecha_ingreso = fechaIngreso;
      if (raw[cols.dias_proceso] != null) row.dias_proceso = parseInt(String(raw[cols.dias_proceso]), 10);
      if (raw[cols.cobertura]) row.cobertura = String(raw[cols.cobertura]).trim();

      rows.push(row);
    } catch (err) {
      errors.push({ row: i + 1, message: `Error parsing row: ${err}` });
    }
  }

  return {
    rows,
    metadata: { extractedDate, dateSource, sheetName, totalRows: rows.length },
    errors,
  };
}

// =============================================================================
// PICOS PARSER
// =============================================================================

function parsePicos(
  workbook: XLSX.WorkBook,
  filename: string,
  onProgress?: ProgressCallback
): { rows: PicosRow[]; metadata: Partial<BrowserParseMetadata>; errors: Array<{ row: number; message: string }> } {
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1 });

  const errors: Array<{ row: number; message: string }> = [];
  const rows: PicosRow[] = [];

  // Extract date from header
  let extractedDate: string | null = null;
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

  // Find data start row
  let dataStartRow = 8;
  for (let i = 0; i < Math.min(15, rawData.length); i++) {
    const row = rawData[i] as string[];
    if (row && row[0] === 'MES' && row[1] === 'SEMANA') {
      dataStartRow = i + 1;
      break;
    }
  }

  // Product column indices
  const productIndices = {
    pimiento: 6,
    alcachofa_total: 11,
    arandanos: 12,
    palta: 13,
    esparrago: 14,
    uvas: 15,
    mango: 16,
    pina: 17,
    total: 18,
  };

  const year = extractedDate ? new Date(extractedDate).getFullYear() : new Date().getFullYear();
  const totalDataRows = rawData.length - dataStartRow;
  let lastMes = '';

  for (let i = dataStartRow; i < rawData.length; i++) {
    if (onProgress && (i - dataStartRow) % 100 === 0) {
      onProgress({
        stage: 'extracting',
        percent: Math.round(((i - dataStartRow) / totalDataRows) * 100),
        message: `Procesando fila ${i - dataStartRow} de ${totalDataRows}...`,
      });
    }

    const raw = rawData[i] as unknown[];
    if (!raw || raw.length < 3) continue;

    const mesRaw = String(raw[0] || '').trim();
    const semana = parseInt(String(raw[1]), 10);

    if (isNaN(semana) || mesRaw === 'Total general' || mesRaw === 'MES') continue;

    // Carry forward month name
    const mes = mesRaw || lastMes;
    if (mesRaw) lastMes = mesRaw;

    if (!mes) continue;

    try {
      rows.push({
        mes,
        semana,
        year,
        pimiento_kg: parseSpanishNumber(raw[productIndices.pimiento]),
        alcachofa_kg: parseSpanishNumber(raw[productIndices.alcachofa_total]),
        arandanos_kg: parseSpanishNumber(raw[productIndices.arandanos]),
        palta_kg: parseSpanishNumber(raw[productIndices.palta]),
        esparrago_kg: parseSpanishNumber(raw[productIndices.esparrago]),
        uvas_kg: parseSpanishNumber(raw[productIndices.uvas]),
        mango_kg: parseSpanishNumber(raw[productIndices.mango]),
        pina_kg: parseSpanishNumber(raw[productIndices.pina]),
        total_kg: parseSpanishNumber(raw[productIndices.total]),
      });
    } catch (err) {
      errors.push({ row: i + 1, message: `Error parsing row: ${err}` });
    }
  }

  return {
    rows,
    metadata: { extractedDate, dateSource, sheetName, totalRows: rows.length },
    errors,
  };
}

// =============================================================================
// MAIN PARSER FUNCTION
// =============================================================================

/**
 * Parse Excel file in the browser
 *
 * This function:
 * 1. Reads the file using FileReader
 * 2. Parses with xlsx library
 * 3. Extracts only needed columns
 * 4. Returns optimized JSON payload
 *
 * @param file - The File object from input or drag-drop
 * @param onProgress - Optional callback for progress updates
 * @returns Promise with parsed data ready to send to API
 */
export async function parseExcelInBrowser(
  file: File,
  onProgress?: ProgressCallback
): Promise<BrowserParseResult> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onprogress = (event) => {
      if (onProgress && event.lengthComputable) {
        onProgress({
          stage: 'reading',
          percent: Math.round((event.loaded / event.total) * 100),
          message: `Leyendo archivo... ${Math.round(event.loaded / 1024 / 1024)}MB`,
        });
      }
    };

    reader.onload = (event) => {
      try {
        onProgress?.({
          stage: 'parsing',
          percent: 0,
          message: 'Analizando estructura del archivo...',
        });

        const data = event.target?.result;
        if (!data || !(data instanceof ArrayBuffer)) {
          reject(new Error('Error al leer el archivo'));
          return;
        }

        // Parse workbook
        const workbook = XLSX.read(data, { type: 'array' });

        // Build sample for detection
        const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
        const sampleData = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1 });
        let firstRowSample = '';
        for (let i = 0; i < Math.min(10, sampleData.length); i++) {
          const row = sampleData[i] as unknown[];
          if (Array.isArray(row)) {
            for (let j = 0; j < Math.min(20, row.length); j++) {
              if (row[j] != null) {
                firstRowSample += ' ' + String(row[j]).slice(0, 100);
              }
            }
          }
        }

        // Detect file type
        const fileType = detectFileType(file.name, workbook.SheetNames, firstRowSample);

        if (fileType === 'UNKNOWN') {
          resolve({
            success: false,
            fileType: 'UNKNOWN',
            metadata: {
              fileName: file.name,
              fileType: 'UNKNOWN',
              extractedDate: null,
              dateSource: 'unknown',
              sheetName: workbook.SheetNames[0],
              totalRows: 0,
              originalSizeMB: file.size / 1024 / 1024,
              jsonSizeKB: 0,
            },
            rows: [],
            errors: [{ row: 0, message: 'No se pudo detectar el tipo de archivo. Use CONSOLIDADO o PICOS.' }],
          });
          return;
        }

        onProgress?.({
          stage: 'extracting',
          percent: 0,
          message: `Extrayendo datos de ${fileType}...`,
        });

        // Parse based on type
        let parseResult: {
          rows: ConsolidadoRow[] | PicosRow[];
          metadata: Partial<BrowserParseMetadata>;
          errors: Array<{ row: number; message: string }>;
        };

        if (fileType === 'CONSOLIDADO') {
          parseResult = parseConsolidado(workbook, file.name, onProgress);
        } else {
          parseResult = parsePicos(workbook, file.name, onProgress);
        }

        // Calculate JSON size
        const jsonString = JSON.stringify(parseResult.rows);
        const jsonSizeKB = new Blob([jsonString]).size / 1024;

        onProgress?.({
          stage: 'complete',
          percent: 100,
          message: `Listo: ${parseResult.rows.length} registros (${jsonSizeKB.toFixed(0)}KB)`,
        });

        resolve({
          success: true,
          fileType,
          metadata: {
            fileName: file.name,
            fileType,
            extractedDate: parseResult.metadata.extractedDate || null,
            dateSource: parseResult.metadata.dateSource || 'unknown',
            sheetName: parseResult.metadata.sheetName || workbook.SheetNames[0],
            totalRows: parseResult.rows.length,
            originalSizeMB: file.size / 1024 / 1024,
            jsonSizeKB,
          },
          rows: parseResult.rows,
          errors: parseResult.errors,
        });
      } catch (err) {
        reject(err instanceof Error ? err : new Error('Error al procesar el archivo'));
      }
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo'));
    };

    reader.readAsArrayBuffer(file);
  });
}
