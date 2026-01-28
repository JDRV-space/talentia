/**
 * Excel Export Utility for Talentia
 *
 * Exports data to XLSX format for offline work.
 * Uses xlsx library with security mitigations.
 */

import { XLSX } from './xlsx-compat';

// =============================================================================
// TYPES
// =============================================================================

interface AsignacionExportRow {
  'Posicion': string;
  'Zona': string;
  'Reclutador Actual': string;
  'Dias Abierto': number;
  'Cola': string;
  'Score Prioridad': number;
  'Cultivo': string;
  'Vacantes': number;
  'Sugerido 1': string;
  'Score 1': string;
  'Sugerido 2': string;
  'Score 2': string;
  'Estado': string;
}

interface SuggestedRecruiter {
  id: string;
  name: string;
  score: number;
  explanation: string;
}

type QueueType = 'critical' | 'tecnicos' | 'empleados';

interface OpenPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  current_recruiter_id: string | null;
  current_recruiter_name: string | null;
  suggested_recruiters: SuggestedRecruiter[];
  priority_score: number;
  queue: QueueType;
}

// =============================================================================
// EXPORT FUNCTIONS
// =============================================================================

/**
 * Format queue type for display
 */
function formatQueue(queue: QueueType): string {
  const queueMap: Record<QueueType, string> = {
    critical: 'Critico',
    tecnicos: 'Tecnicos',
    empleados: 'Empleados',
  };
  return queueMap[queue] || queue;
}

/**
 * Get status based on days open
 */
function getStatus(daysOpen: number, hasRecruiter: boolean): string {
  if (!hasRecruiter) return 'Sin asignar';
  if (daysOpen > 30) return 'Critico';
  if (daysOpen > 14) return 'Retrasado';
  return 'En tiempo';
}

/**
 * Transform positions data to export format
 */
function transformToExportRows(positions: OpenPosition[]): AsignacionExportRow[] {
  return positions.map((p) => {
    const suggested1 = p.suggested_recruiters[0];
    const suggested2 = p.suggested_recruiters[1];

    return {
      'Posicion': p.title,
      'Zona': p.zone || 'Nacional',
      'Reclutador Actual': p.current_recruiter_name || 'Sin asignar',
      'Dias Abierto': p.days_open,
      'Cola': formatQueue(p.queue),
      'Score Prioridad': p.priority_score,
      'Cultivo': p.crop || '-',
      'Vacantes': p.headcount,
      'Sugerido 1': suggested1?.name || '-',
      'Score 1': suggested1 ? `${suggested1.score}%` : '-',
      'Sugerido 2': suggested2?.name || '-',
      'Score 2': suggested2 ? `${suggested2.score}%` : '-',
      'Estado': getStatus(p.days_open, !!p.current_recruiter_name),
    };
  });
}

/**
 * Generate filename with current date
 */
function generateFilename(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `asignaciones_${year}-${month}-${day}.xlsx`;
}

/**
 * Download workbook as Excel file
 */
function downloadWorkbook(workbook: XLSX.WorkBook, filename: string): void {
  // Write to buffer
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });

  // Create blob and download
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Export asignaciones data to Excel file
 * Downloads the file directly in the browser
 */
export async function exportAsignacionesToExcel(positions: OpenPosition[]): Promise<void> {
  // Transform data to export format
  const exportData = transformToExportRows(positions);

  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Create worksheet from JSON data
  const worksheet = XLSX.utils.json_to_sheet(exportData);

  // Set column widths for better readability
  const columnWidths = [35, 15, 20, 12, 10, 14, 15, 10, 18, 10, 18, 10, 12];
  worksheet['!cols'] = columnWidths.map(width => ({ wch: width }));

  // Append worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Asignaciones');

  // Generate filename and download
  const filename = generateFilename();
  downloadWorkbook(workbook, filename);
}

/**
 * Export generic data to Excel
 * Generic function for other pages that might need Excel export
 */
export async function exportToExcel<T extends Record<string, unknown>>(
  data: T[],
  sheetName: string,
  filename: string
): Promise<void> {
  // Create workbook
  const workbook = XLSX.utils.book_new();

  if (data.length > 0) {
    // Create worksheet from JSON data
    const worksheet = XLSX.utils.json_to_sheet(data);

    // Set default column width
    const headers = Object.keys(data[0]);
    worksheet['!cols'] = headers.map(() => ({ wch: 15 }));

    // Append worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  } else {
    // Create empty worksheet
    const worksheet = XLSX.utils.aoa_to_sheet([]);
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  }

  // Download the workbook
  downloadWorkbook(workbook, filename);
}

// =============================================================================
// TYPES FOR ALL-TABS EXPORT
// =============================================================================

interface UnassignedPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  recruiter_name: string | null;
  suggested_recruiters: SuggestedRecruiter[];
  priority_score: number;
  queue: QueueType;
}

interface ReassignedPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  current_recruiter_id: string | null;
  current_recruiter_name: string | null;
  previous_recruiter_id: string | null;
  previous_recruiter_name: string | null;
  reassigned_at: string;
  suggested_recruiters: SuggestedRecruiter[];
  priority_score: number;
  queue: QueueType;
}

interface UnassignedExportRow {
  'Posicion': string;
  'Zona': string;
  'Reclutador Anterior': string;
  'Dias Abierto': number;
  'Cola': string;
  'Score Prioridad': number;
  'Cultivo': string;
  'Vacantes': number;
  'Sugerido 1': string;
  'Score 1': string;
  'Sugerido 2': string;
  'Score 2': string;
}

interface ReassignedExportRow {
  'Posicion': string;
  'Zona': string;
  'Reclutador Actual': string;
  'Reclutador Anterior': string;
  'Dias Abierto': number;
  'Cola': string;
  'Score Prioridad': number;
  'Cultivo': string;
  'Vacantes': number;
  'Sugerido 1': string;
  'Score 1': string;
}

// =============================================================================
// ALL-TABS EXPORT
// =============================================================================

/**
 * Transform unassigned positions to export format
 */
function transformUnassignedToExportRows(positions: UnassignedPosition[]): UnassignedExportRow[] {
  return positions.map((p) => {
    const suggested1 = p.suggested_recruiters[0];
    const suggested2 = p.suggested_recruiters[1];

    return {
      'Posicion': p.title,
      'Zona': p.zone || 'Nacional',
      'Reclutador Anterior': p.recruiter_name || '-',
      'Dias Abierto': p.days_open,
      'Cola': formatQueue(p.queue),
      'Score Prioridad': p.priority_score,
      'Cultivo': p.crop || '-',
      'Vacantes': p.headcount,
      'Sugerido 1': suggested1?.name || '-',
      'Score 1': suggested1 ? `${suggested1.score}%` : '-',
      'Sugerido 2': suggested2?.name || '-',
      'Score 2': suggested2 ? `${suggested2.score}%` : '-',
    };
  });
}

/**
 * Transform reassigned positions to export format
 */
function transformReassignedToExportRows(positions: ReassignedPosition[]): ReassignedExportRow[] {
  return positions.map((p) => {
    const suggested1 = p.suggested_recruiters[0];

    return {
      'Posicion': p.title,
      'Zona': p.zone || 'Nacional',
      'Reclutador Actual': p.current_recruiter_name || 'Sin asignar',
      'Reclutador Anterior': p.previous_recruiter_name || '-',
      'Dias Abierto': p.days_open,
      'Cola': formatQueue(p.queue),
      'Score Prioridad': p.priority_score,
      'Cultivo': p.crop || '-',
      'Vacantes': p.headcount,
      'Sugerido 1': suggested1?.name || '-',
      'Score 1': suggested1 ? `${suggested1.score}%` : '-',
    };
  });
}

/**
 * Export all 3 tabs (Asignados, Sin Asignar, Reasignados) to a single Excel file
 */
export async function exportAllTabsToExcel(
  assigned: OpenPosition[],
  unassigned: UnassignedPosition[],
  reassigned: ReassignedPosition[]
): Promise<void> {
  // Create workbook
  const workbook = XLSX.utils.book_new();

  // Sheet 1: Asignados
  const assignedData = transformToExportRows(assigned);
  const assignedSheet = XLSX.utils.json_to_sheet(assignedData);
  assignedSheet['!cols'] = [35, 15, 20, 12, 10, 14, 15, 10, 18, 10, 18, 10, 12].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(workbook, assignedSheet, 'Asignados');

  // Sheet 2: Sin Asignar
  const unassignedData = transformUnassignedToExportRows(unassigned);
  const unassignedSheet = XLSX.utils.json_to_sheet(unassignedData);
  unassignedSheet['!cols'] = [35, 15, 20, 12, 10, 14, 15, 10, 18, 10, 18, 10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(workbook, unassignedSheet, 'Sin Asignar');

  // Sheet 3: Reasignados
  const reassignedData = transformReassignedToExportRows(reassigned);
  const reassignedSheet = XLSX.utils.json_to_sheet(reassignedData);
  reassignedSheet['!cols'] = [35, 15, 20, 20, 12, 10, 14, 15, 10, 18, 10].map(w => ({ wch: w }));
  XLSX.utils.book_append_sheet(workbook, reassignedSheet, 'Reasignados');

  // Generate filename and download
  const filename = generateFilename();
  downloadWorkbook(workbook, filename);
}
