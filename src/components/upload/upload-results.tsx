'use client';

/**
 * Componente para mostrar resultados detallados de la carga de Excel
 * Incluye lista expandible de errores/advertencias y boton de descarga
 */

import * as React from 'react';
import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { ParseResult, ValidationError, ValidationWarning, ExcelFileType } from '@/lib/excel/parser';
import type { ConsolidadoRow, PicosRow } from '@/types/schemas';

// =============================================================================
// TIPOS
// =============================================================================

interface UploadResultsProps {
  result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow>;
  fileType: ExcelFileType;
  fileName?: string;
  onRetry?: () => void;
  onConfirm?: () => void;
}

interface GroupedErrors {
  [field: string]: ValidationError[];
}

interface GroupedWarnings {
  [field: string]: ValidationWarning[];
}

// =============================================================================
// UTILIDADES
// =============================================================================

/**
 * Agrupa errores por campo
 */
function groupByField<T extends { field: string }>(items: T[]): Record<string, T[]> {
  return items.reduce((acc, item) => {
    if (!acc[item.field]) {
      acc[item.field] = [];
    }
    acc[item.field].push(item);
    return acc;
  }, {} as Record<string, T[]>);
}

/**
 * Genera reporte CSV de errores
 */
function generateErrorReport(
  errors: ValidationError[],
  warnings: ValidationWarning[],
  fileType: ExcelFileType,
  fileName: string
): string {
  const lines: string[] = [];

  // Header
  lines.push('Reporte de Errores de Importacion');
  lines.push(`Archivo: ${fileName}`);
  lines.push(`Tipo: ${fileType}`);
  lines.push(`Fecha: ${new Date().toLocaleString('es-PE')}`);
  lines.push('');

  // Errores
  if (errors.length > 0) {
    lines.push('ERRORES');
    lines.push('Fila,Campo,Valor,Mensaje');
    for (const error of errors) {
      const value = error.value !== null && error.value !== undefined
        ? String(error.value).replace(/"/g, '""')
        : '';
      lines.push(`${error.row},"${error.field}","${value}","${error.message}"`);
    }
    lines.push('');
  }

  // Advertencias
  if (warnings.length > 0) {
    lines.push('ADVERTENCIAS');
    lines.push('Fila,Campo,Valor,Mensaje,Sugerencia');
    for (const warning of warnings) {
      const value = warning.value !== null && warning.value !== undefined
        ? String(warning.value).replace(/"/g, '""')
        : '';
      const suggestion = warning.suggestion || '';
      lines.push(`${warning.row},"${warning.field}","${value}","${warning.message}","${suggestion}"`);
    }
  }

  return lines.join('\n');
}

/**
 * Descarga el reporte como archivo CSV
 */
function downloadReport(content: string, fileName: string) {
  const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

/**
 * Seccion expandible de errores/advertencias
 */
function ExpandableSection({
  title,
  count,
  icon: Icon,
  colorClass,
  children,
  defaultExpanded = false,
}: {
  title: string;
  count: number;
  icon: React.ElementType;
  colorClass: string;
  children: React.ReactNode;
  defaultExpanded?: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  if (count === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className={`
          w-full flex items-center justify-between p-3 text-left
          ${colorClass} transition-colors
        `}
      >
        <div className="flex items-center gap-2">
          <Icon className="size-4" />
          <span className="font-medium">{title}</span>
          <Badge variant="secondary" className="ml-2">
            {count}
          </Badge>
        </div>
        {expanded ? (
          <ChevronDown className="size-4" />
        ) : (
          <ChevronRight className="size-4" />
        )}
      </button>

      {expanded && (
        <div className="p-3 border-t bg-card">
          {children}
        </div>
      )}
    </div>
  );
}

/**
 * Tabla de errores agrupados por campo
 */
function ErrorTable({ errors }: { errors: ValidationError[] }) {
  const grouped = useMemo(() => groupByField(errors), [errors]);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const toggleField = (field: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([field, fieldErrors]) => (
        <div key={field} className="border rounded">
          <button
            onClick={() => toggleField(field)}
            className="w-full flex items-center justify-between p-2 text-sm hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            <div className="flex items-center gap-2">
              {expandedFields.has(field) ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <span className="font-medium text-rose-600">{field}</span>
              <span className="text-muted-foreground">
                ({fieldErrors.length} {fieldErrors.length === 1 ? 'error' : 'errores'})
              </span>
            </div>
          </button>

          {expandedFields.has(field) && (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Fila</TableHead>
                    <TableHead className="w-1/3">Valor</TableHead>
                    <TableHead>Mensaje</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldErrors.slice(0, 50).map((error, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{error.row}</TableCell>
                      <TableCell className="text-xs max-w-[200px] truncate">
                        {error.value !== null && error.value !== undefined
                          ? String(error.value)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-rose-600">
                        {error.message}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {fieldErrors.length > 50 && (
                <div className="p-2 text-xs text-muted-foreground text-center border-t">
                  Mostrando 50 de {fieldErrors.length} errores. Descarga el reporte para ver todos.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * Tabla de advertencias agrupadas por campo
 */
function WarningTable({ warnings }: { warnings: ValidationWarning[] }) {
  const grouped = useMemo(() => groupByField(warnings), [warnings]);
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const toggleField = (field: string) => {
    setExpandedFields(prev => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      {Object.entries(grouped).map(([field, fieldWarnings]) => (
        <div key={field} className="border rounded">
          <button
            onClick={() => toggleField(field)}
            className="w-full flex items-center justify-between p-2 text-sm hover:bg-stone-50 dark:hover:bg-stone-900"
          >
            <div className="flex items-center gap-2">
              {expandedFields.has(field) ? (
                <ChevronDown className="size-3" />
              ) : (
                <ChevronRight className="size-3" />
              )}
              <span className="font-medium text-amber-600">{field}</span>
              <span className="text-muted-foreground">
                ({fieldWarnings.length} {fieldWarnings.length === 1 ? 'advertencia' : 'advertencias'})
              </span>
            </div>
          </button>

          {expandedFields.has(field) && (
            <div className="border-t">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Fila</TableHead>
                    <TableHead className="w-1/4">Valor</TableHead>
                    <TableHead className="w-1/4">Mensaje</TableHead>
                    <TableHead>Sugerencia</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fieldWarnings.slice(0, 50).map((warning, idx) => (
                    <TableRow key={idx}>
                      <TableCell className="font-mono text-xs">{warning.row}</TableCell>
                      <TableCell className="text-xs max-w-[150px] truncate">
                        {warning.value !== null && warning.value !== undefined
                          ? String(warning.value)
                          : '-'}
                      </TableCell>
                      <TableCell className="text-xs text-amber-600">
                        {warning.message}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {warning.suggestion || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {fieldWarnings.length > 50 && (
                <div className="p-2 text-xs text-muted-foreground text-center border-t">
                  Mostrando 50 de {fieldWarnings.length} advertencias. Descarga el reporte para ver todas.
                </div>
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function UploadResults({
  result,
  fileType,
  fileName = 'archivo.xlsx',
  onRetry,
  onConfirm,
}: UploadResultsProps) {
  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;
  const canConfirm = result.validRows > 0 && !hasErrors;

  /**
   * Descarga el reporte de errores
   */
  const handleDownloadReport = () => {
    const content = generateErrorReport(result.errors, result.warnings, fileType, fileName);
    const reportName = `reporte-errores-${fileName.replace(/\.[^.]+$/, '')}-${Date.now()}.csv`;
    downloadReport(content, reportName);
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              {hasErrors ? (
                <AlertCircle className="size-5 text-rose-500" />
              ) : hasWarnings ? (
                <AlertTriangle className="size-5 text-amber-500" />
              ) : (
                <CheckCircle2 className="size-5 text-lime-600" />
              )}
              Resultados de la Importacion
            </CardTitle>
            <CardDescription className="mt-1">
              {fileName} - {fileType}
            </CardDescription>
          </div>
          {(hasErrors || hasWarnings) && (
            <Button variant="outline" size="sm" onClick={handleDownloadReport}>
              <Download className="size-4 mr-2" />
              Descargar Reporte
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {/* Resumen */}
        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900">
          <div className="text-center mb-4">
            <p className="text-lg font-medium">
              {result.validRows} registros procesados, {result.errors.length} errores, {result.warnings.length} advertencias
            </p>
          </div>

          <div className="grid grid-cols-4 gap-4 text-center">
            <div>
              <div className="text-2xl font-bold text-stone-600">{result.totalRows}</div>
              <div className="text-xs text-muted-foreground">Total filas</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-teal-600">{result.validRows}</div>
              <div className="text-xs text-muted-foreground">Validos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-rose-500">{result.invalidRows}</div>
              <div className="text-xs text-muted-foreground">Invalidos</div>
            </div>
            <div>
              <div className="text-2xl font-bold text-amber-500">{result.warnings.length}</div>
              <div className="text-xs text-muted-foreground">Advertencias</div>
            </div>
          </div>
        </div>

        {/* Lista de errores */}
        <ExpandableSection
          title="Errores"
          count={result.errors.length}
          icon={AlertCircle}
          colorClass="bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300"
          defaultExpanded={hasErrors}
        >
          <ErrorTable errors={result.errors} />
        </ExpandableSection>

        {/* Lista de advertencias */}
        <ExpandableSection
          title="Advertencias"
          count={result.warnings.length}
          icon={AlertTriangle}
          colorClass="bg-amber-50 dark:bg-amber-950/20 text-amber-700 dark:text-amber-300"
          defaultExpanded={hasWarnings && !hasErrors}
        >
          <WarningTable warnings={result.warnings} />
        </ExpandableSection>

        {/* Mensaje de exito si no hay errores */}
        {!hasErrors && result.validRows > 0 && (
          <div className="flex items-center gap-3 p-4 rounded-lg bg-lime-50 dark:bg-lime-950/20 text-lime-700 dark:text-lime-300">
            <CheckCircle2 className="size-6 shrink-0" />
            <div>
              <p className="font-medium">Archivo listo para importar</p>
              <p className="text-sm opacity-80">
                {result.validRows} registros seran importados al sistema.
                {hasWarnings && ` ${result.warnings.length} advertencias fueron aplicadas automaticamente.`}
              </p>
            </div>
          </div>
        )}

        {/* Acciones */}
        <div className="flex justify-end gap-3 pt-4 border-t">
          {onRetry && (
            <Button variant="outline" onClick={onRetry}>
              Subir otro archivo
            </Button>
          )}
          {onConfirm && canConfirm && (
            <Button onClick={onConfirm} className="bg-teal-600 hover:bg-teal-700">
              Confirmar importacion ({result.validRows} registros)
            </Button>
          )}
          {!canConfirm && hasErrors && (
            <div className="text-sm text-muted-foreground">
              Corrige los errores antes de continuar
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
