'use client';

/**
 * Componente Wizard para subir archivos Excel con soporte para pivot tables
 *
 * Flujo de 4 pasos:
 * 1. Seleccion de archivo (drag & drop)
 * 2. Deteccion de tipo (auto-detect con override manual)
 * 3. Preview de datos con confirmacion de mapeo de columnas
 * 4. Resultados de validacion y confirmacion de importacion
 */

import * as React from 'react';
import { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Upload,
  FileSpreadsheet,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2,
  Check,
  ChevronRight,
  ChevronLeft,
  TableProperties,
  Eye,
  ArrowRight,
  Info,
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
import {
  parseConsolidado,
  parsePicos,
  parseConsolidadoPivot,
  parsePicosPivot,
  getPreviewPivot,
  type ParseResult,
  type PivotParseResult,
  type ExcelFileType,
  type ConsolidadoPivotParsed,
  type PicosPivotParsed,
} from '@/lib/excel/parser';
import type { ConsolidadoRow, PicosRow } from '@/types/schemas';

// =============================================================================
// TIPOS
// =============================================================================

interface UploadWizardProps {
  onComplete?: (
    result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow> | PivotParseResult<ConsolidadoPivotParsed> | PivotParseResult<PicosPivotParsed>,
    fileType: ExcelFileType,
    isPivot: boolean,
    fileName: string
  ) => void;
  onCancel?: () => void;
  disabled?: boolean;
  maxFileSizeMB?: number;
}

interface FileDetectionResult {
  type: ExcelFileType | null;
  isPivotTable: boolean;
  headers: string[];
  rows: unknown[][];
  metadata: {
    headerRowIndex: number;
    columnCount: number;
  };
}

type WizardStep = 'file-select' | 'type-detect' | 'preview' | 'validation';

interface WizardState {
  step: WizardStep;
  file: File | null;
  fileBuffer: ArrayBuffer | null;
  detection: FileDetectionResult | null;
  selectedType: ExcelFileType | null;
  isPivot: boolean;
  isProcessing: boolean;
  processingProgress: number;
  result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow> | PivotParseResult<ConsolidadoPivotParsed> | PivotParseResult<PicosPivotParsed> | null;
  error: string | null;
}

const INITIAL_STATE: WizardState = {
  step: 'file-select',
  file: null,
  fileBuffer: null,
  detection: null,
  selectedType: null,
  isPivot: false,
  isProcessing: false,
  processingProgress: 0,
  result: null,
  error: null,
};

const STEP_LABELS: Record<WizardStep, string> = {
  'file-select': 'Seleccionar Archivo',
  'type-detect': 'Tipo de Archivo',
  'preview': 'Vista Previa',
  'validation': 'Validacion',
};

const STEP_ORDER: WizardStep[] = ['file-select', 'type-detect', 'preview', 'validation'];

// =============================================================================
// COMPONENTES DE PASOS
// =============================================================================

/**
 * Indicador de progreso del wizard
 */
function StepIndicator({ currentStep }: { currentStep: WizardStep }) {
  const currentIndex = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 mb-6">
      {STEP_ORDER.map((step, index) => {
        const isActive = index === currentIndex;
        const isCompleted = index < currentIndex;

        return (
          <React.Fragment key={step}>
            <div className="flex items-center gap-2">
              <div
                className={`
                  flex items-center justify-center size-8 rounded-full text-sm font-medium
                  transition-colors duration-200
                  ${isCompleted
                    ? 'bg-teal-600 text-white'
                    : isActive
                      ? 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300 ring-2 ring-teal-600'
                      : 'bg-stone-200 text-stone-500 dark:bg-stone-800 dark:text-stone-400'}
                `}
              >
                {isCompleted ? <Check className="size-4" /> : index + 1}
              </div>
              <span
                className={`
                  text-sm hidden sm:inline
                  ${isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}
                `}
              >
                {STEP_LABELS[step]}
              </span>
            </div>
            {index < STEP_ORDER.length - 1 && (
              <ChevronRight className="size-4 text-muted-foreground mx-1" />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

/**
 * Paso 1: Seleccion de archivo
 */
function FileSelectStep({
  onFileSelect,
  disabled,
  maxFileSizeMB,
}: {
  onFileSelect: (file: File) => void;
  disabled: boolean;
  maxFileSizeMB: number;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const validateFile = useCallback((file: File): string | null => {
    const validExtensions = ['.xlsx', '.xls'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(extension)) {
      return 'Solo se aceptan archivos Excel (.xlsx, .xls)';
    }
    const maxSize = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      return `El archivo excede el tamano maximo de ${maxFileSizeMB}MB`;
    }
    return null;
  }, [maxFileSizeMB]);

  const handleFile = useCallback((file: File) => {
    const error = validateFile(file);
    if (error) {
      alert(error);
      return;
    }
    onFileSelect(file);
  }, [validateFile, onFileSelect]);

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    }
  }, [disabled, handleFile]);

  const handleInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Seleccionar Archivo Excel</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Arrastra un archivo CONSOLIDADO o PICOS, o haz clic para seleccionar
        </p>
      </div>

      <motion.div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        animate={{
          scale: isDragging ? 1.02 : 1,
        }}
        transition={{ duration: 0.2 }}
        className={`
          relative border-2 border-dashed rounded-lg p-12 text-center cursor-pointer
          transition-colors duration-200
          ${isDragging
            ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
            : 'border-stone-300 dark:border-stone-700 hover:border-teal-500 hover:bg-stone-50 dark:hover:bg-stone-900'}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
        `}
        onClick={() => !disabled && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleInputChange}
          className="hidden"
          disabled={disabled}
        />

        <motion.div
          animate={{
            y: isDragging ? -5 : 0,
            scale: isDragging ? 1.1 : 1,
          }}
        >
          <Upload className={`
            size-16 mx-auto mb-4 transition-colors duration-200
            ${isDragging ? 'text-teal-500' : 'text-stone-400'}
          `} />
        </motion.div>

        <p className="text-base text-muted-foreground mb-2">
          {isDragging
            ? 'Suelta el archivo aqui'
            : 'Arrastra un archivo Excel aqui'}
        </p>

        <p className="text-sm text-muted-foreground">
          o <span className="text-teal-600 underline">selecciona un archivo</span>
        </p>

        <p className="text-xs text-muted-foreground mt-6">
          Formatos aceptados: .xlsx, .xls (max {maxFileSizeMB}MB)
        </p>
      </motion.div>

      <div className="mt-6 grid grid-cols-2 gap-4">
        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="size-5 text-teal-600" />
            <span className="font-medium">CONSOLIDADO</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Posiciones de reclutamiento. Soporta formato tabular y pivot table.
          </p>
        </div>
        <div className="p-4 rounded-lg bg-stone-50 dark:bg-stone-900 border">
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="size-5 text-teal-600" />
            <span className="font-medium">PICOS</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Pronostico de produccion por semana. Soporta formato tabular y pivot table.
          </p>
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Paso 2: Deteccion de tipo de archivo
 */
function TypeDetectStep({
  file,
  detection,
  selectedType,
  isPivot,
  onSelectType,
  onTogglePivot,
  onBack,
  onNext,
}: {
  file: File;
  detection: FileDetectionResult;
  selectedType: ExcelFileType | null;
  isPivot: boolean;
  onSelectType: (type: ExcelFileType) => void;
  onTogglePivot: (isPivot: boolean) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const canProceed = selectedType !== null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Tipo de Archivo</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Confirma o selecciona el tipo de archivo a importar
        </p>
      </div>

      {/* Info del archivo */}
      <div className="flex items-center gap-3 p-4 rounded-lg bg-stone-100 dark:bg-stone-900 mb-6">
        <FileSpreadsheet className="size-8 text-teal-600 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {(file.size / 1024).toFixed(1)} KB - {detection.headers.length} columnas detectadas
          </p>
        </div>
        {detection.type && (
          <Badge variant="outline" className="shrink-0">
            {detection.isPivotTable ? 'Pivot Table' : 'Tabular'}
          </Badge>
        )}
      </div>

      {/* Deteccion automatica */}
      {detection.type && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-teal-50 dark:bg-teal-950/20 border border-teal-200 dark:border-teal-800 mb-6">
          <Info className="size-5 text-teal-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-teal-700 dark:text-teal-300">
              Detectamos que es un archivo {detection.type}
              {detection.isPivotTable && ' (Pivot Table)'}
            </p>
            <p className="text-xs text-teal-600 dark:text-teal-400 mt-1">
              Puedes cambiar el tipo manualmente si la deteccion no es correcta
            </p>
          </div>
        </div>
      )}

      {/* Seleccion de tipo */}
      <div className="space-y-4">
        <p className="text-sm font-medium">Tipo de archivo:</p>
        <div className="grid grid-cols-2 gap-4">
          <button
            onClick={() => onSelectType('CONSOLIDADO')}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20
              ${selectedType === 'CONSOLIDADO'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                : 'border-border'}
            `}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`
                size-4 rounded-full border-2 flex items-center justify-center
                ${selectedType === 'CONSOLIDADO' ? 'border-teal-600 bg-teal-600' : 'border-stone-400'}
              `}>
                {selectedType === 'CONSOLIDADO' && <Check className="size-3 text-white" />}
              </div>
              <span className="font-medium">CONSOLIDADO</span>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Posiciones de reclutamiento
            </p>
          </button>

          <button
            onClick={() => onSelectType('PICOS')}
            className={`
              p-4 rounded-lg border-2 text-left transition-all
              hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20
              ${selectedType === 'PICOS'
                ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20 ring-2 ring-teal-500/20'
                : 'border-border'}
            `}
          >
            <div className="flex items-center gap-2 mb-2">
              <div className={`
                size-4 rounded-full border-2 flex items-center justify-center
                ${selectedType === 'PICOS' ? 'border-teal-600 bg-teal-600' : 'border-stone-400'}
              `}>
                {selectedType === 'PICOS' && <Check className="size-3 text-white" />}
              </div>
              <span className="font-medium">PICOS</span>
            </div>
            <p className="text-xs text-muted-foreground ml-6">
              Pronostico de produccion
            </p>
          </button>
        </div>

        {/* Toggle para pivot table */}
        <div className="pt-4 border-t">
          <p className="text-sm font-medium mb-3">Formato del archivo:</p>
          <div className="flex gap-4">
            <button
              onClick={() => onTogglePivot(false)}
              className={`
                flex-1 p-3 rounded-lg border-2 text-left transition-all
                ${!isPivot
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
                  : 'border-border hover:border-stone-400'}
              `}
            >
              <div className="flex items-center gap-2">
                <TableProperties className={`size-4 ${!isPivot ? 'text-teal-600' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${!isPivot ? 'font-medium' : ''}`}>Tabular</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Formato de filas y columnas clasico
              </p>
            </button>

            <button
              onClick={() => onTogglePivot(true)}
              className={`
                flex-1 p-3 rounded-lg border-2 text-left transition-all
                ${isPivot
                  ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
                  : 'border-border hover:border-stone-400'}
              `}
            >
              <div className="flex items-center gap-2">
                <TableProperties className={`size-4 ${isPivot ? 'text-teal-600' : 'text-muted-foreground'}`} />
                <span className={`text-sm ${isPivot ? 'font-medium' : ''}`}>Pivot Table</span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Tabla dinamica de Excel
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Botones de navegacion */}
      <div className="flex justify-between mt-8 pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="size-4 mr-2" />
          Atras
        </Button>
        <Button
          onClick={onNext}
          disabled={!canProceed}
          className="bg-teal-600 hover:bg-teal-700"
        >
          Continuar
          <ChevronRight className="size-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Paso 3: Preview de datos
 */
function PreviewStep({
  file,
  detection,
  selectedType,
  isPivot,
  onBack,
  onProcess,
}: {
  file: File;
  detection: FileDetectionResult;
  selectedType: ExcelFileType;
  isPivot: boolean;
  onBack: () => void;
  onProcess: () => void;
}) {
  const previewRows = useMemo(() => {
    return detection.rows.slice(0, 10);
  }, [detection.rows]);

  const displayHeaders = useMemo(() => {
    if (isPivot) {
      return detection.headers.filter(h => h && h.trim() !== '');
    }
    return detection.headers;
  }, [detection.headers, isPivot]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Vista Previa de Datos</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Verifica que los datos se ven correctamente antes de procesar
        </p>
      </div>

      {/* Info del archivo */}
      <div className="flex items-center justify-between p-3 rounded-lg bg-stone-100 dark:bg-stone-900 mb-4">
        <div className="flex items-center gap-3">
          <FileSpreadsheet className="size-6 text-teal-600" />
          <div>
            <p className="font-medium text-sm">{file.name}</p>
            <p className="text-xs text-muted-foreground">
              {selectedType} - {isPivot ? 'Pivot Table' : 'Tabular'}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Badge variant="outline">{displayHeaders.length} columnas</Badge>
          <Badge variant="outline">{detection.rows.length} filas</Badge>
        </div>
      </div>

      {/* Columnas detectadas */}
      <div className="mb-4">
        <p className="text-sm font-medium mb-2 flex items-center gap-2">
          <Eye className="size-4 text-teal-600" />
          Columnas detectadas:
        </p>
        <div className="flex flex-wrap gap-2">
          {displayHeaders.map((header, idx) => (
            <Badge key={idx} variant="secondary" className="text-xs">
              {header || `Columna ${idx + 1}`}
            </Badge>
          ))}
        </div>
      </div>

      {/* Tabla de preview */}
      <div className="rounded-lg border overflow-hidden">
        <div className="overflow-auto max-h-[300px]">
          <Table>
            <TableHeader className="sticky top-0 bg-stone-50 dark:bg-stone-900">
              <TableRow>
                <TableHead className="w-12 text-center">#</TableHead>
                {displayHeaders.map((header, idx) => (
                  <TableHead key={idx} className="whitespace-nowrap text-xs min-w-[100px]">
                    {header || `Col ${idx + 1}`}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {previewRows.length > 0 ? (
                previewRows.map((row, rowIdx) => (
                  <TableRow key={rowIdx}>
                    <TableCell className="text-center text-xs text-muted-foreground font-mono">
                      {rowIdx + 1}
                    </TableCell>
                    {displayHeaders.map((_, colIdx) => {
                      const cellValue = Array.isArray(row) ? row[colIdx] : null;
                      return (
                        <TableCell key={colIdx} className="text-xs py-2 max-w-[200px] truncate">
                          {cellValue !== null && cellValue !== undefined
                            ? String(cellValue)
                            : <span className="text-muted-foreground">-</span>}
                        </TableCell>
                      );
                    })}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={displayHeaders.length + 1} className="text-center py-8 text-muted-foreground">
                    No se encontraron datos para previsualizar
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        {detection.rows.length > 10 && (
          <div className="p-2 bg-stone-50 dark:bg-stone-900 border-t text-center text-xs text-muted-foreground">
            Mostrando 10 de {detection.rows.length} filas
          </div>
        )}
      </div>

      {/* Mensaje informativo */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-stone-50 dark:bg-stone-900 mt-4">
        <Info className="size-4 text-muted-foreground shrink-0 mt-0.5" />
        <p className="text-xs text-muted-foreground">
          Al hacer clic en &quot;Procesar Archivo&quot;, se validaran todos los datos
          y se mostraran los resultados en el siguiente paso.
        </p>
      </div>

      {/* Botones de navegacion */}
      <div className="flex justify-between mt-6 pt-4 border-t">
        <Button variant="outline" onClick={onBack}>
          <ChevronLeft className="size-4 mr-2" />
          Atras
        </Button>
        <Button onClick={onProcess} className="bg-teal-600 hover:bg-teal-700">
          Procesar Archivo
          <ArrowRight className="size-4 ml-2" />
        </Button>
      </div>
    </motion.div>
  );
}

/**
 * Paso 4: Resultados de validacion
 */
function ValidationStep({
  file,
  selectedType,
  isPivot,
  result,
  onBack,
  onConfirm,
  onReset,
}: {
  file: File;
  selectedType: ExcelFileType;
  isPivot: boolean;
  result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow> | PivotParseResult<ConsolidadoPivotParsed> | PivotParseResult<PicosPivotParsed>;
  onBack: () => void;
  onConfirm: () => void;
  onReset: () => void;
}) {
  const isPivotResult = 'success' in result;

  const stats = useMemo(() => {
    if (isPivotResult) {
      const pivotResult = result as PivotParseResult<ConsolidadoPivotParsed | PicosPivotParsed>;
      return {
        total: pivotResult.totalRows,
        valid: pivotResult.validRows,
        invalid: pivotResult.totalRows - pivotResult.validRows,
        errors: pivotResult.errors.length,
        warnings: 0,
        success: pivotResult.success,
      };
    } else {
      const parseResult = result as ParseResult<ConsolidadoRow | PicosRow>;
      return {
        total: parseResult.totalRows,
        valid: parseResult.validRows,
        invalid: parseResult.invalidRows,
        errors: parseResult.errors.length,
        warnings: parseResult.warnings.length,
        success: parseResult.validRows > 0,
      };
    }
  }, [result, isPivotResult]);

  const hasErrors = stats.errors > 0;
  const canConfirm = stats.valid > 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.3 }}
    >
      <div className="text-center mb-6">
        <h3 className="text-lg font-semibold">Resultados de Validacion</h3>
        <p className="text-sm text-muted-foreground mt-1">
          Revisa los resultados antes de confirmar la importacion
        </p>
      </div>

      {/* Status banner */}
      <div className={`
        flex items-center gap-3 p-4 rounded-lg mb-6
        ${hasErrors
          ? 'bg-rose-50 dark:bg-rose-950/20 text-rose-700 dark:text-rose-300'
          : 'bg-lime-50 dark:bg-lime-950/20 text-lime-700 dark:text-lime-300'}
      `}>
        {hasErrors ? (
          <AlertCircle className="size-6 shrink-0" />
        ) : (
          <CheckCircle2 className="size-6 shrink-0" />
        )}
        <div>
          <p className="font-medium">
            {hasErrors
              ? 'Se encontraron errores en el archivo'
              : 'Archivo procesado correctamente'}
          </p>
          <p className="text-sm opacity-80">
            {stats.valid} de {stats.total} registros son validos
          </p>
        </div>
      </div>

      {/* Info del archivo */}
      <div className="flex items-center gap-3 p-3 rounded-lg bg-stone-100 dark:bg-stone-900 mb-6">
        <FileSpreadsheet className="size-6 text-teal-600" />
        <div className="flex-1">
          <p className="font-medium text-sm">{file.name}</p>
          <p className="text-xs text-muted-foreground">
            {selectedType} - {isPivot ? 'Pivot Table' : 'Tabular'}
          </p>
        </div>
      </div>

      {/* Estadisticas */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="text-center p-4 rounded-lg bg-stone-50 dark:bg-stone-900">
          <div className="text-2xl font-bold text-stone-600">{stats.total}</div>
          <div className="text-xs text-muted-foreground">Total filas</div>
        </div>
        <div className="text-center p-4 rounded-lg bg-stone-50 dark:bg-stone-900">
          <div className="text-2xl font-bold text-teal-600">{stats.valid}</div>
          <div className="text-xs text-muted-foreground">Validos</div>
        </div>
        <div className="text-center p-4 rounded-lg bg-stone-50 dark:bg-stone-900">
          <div className="text-2xl font-bold text-rose-500">{stats.errors}</div>
          <div className="text-xs text-muted-foreground">Errores</div>
        </div>
        <div className="text-center p-4 rounded-lg bg-stone-50 dark:bg-stone-900">
          <div className="text-2xl font-bold text-amber-500">{stats.warnings}</div>
          <div className="text-xs text-muted-foreground">Advertencias</div>
        </div>
      </div>

      {/* Lista de errores */}
      {hasErrors && (
        <div className="mb-6">
          <p className="text-sm font-medium mb-2 text-rose-600">Errores encontrados:</p>
          <div className="max-h-[200px] overflow-auto rounded-lg border border-rose-200 dark:border-rose-800">
            {(isPivotResult
              ? (result as PivotParseResult<ConsolidadoPivotParsed | PicosPivotParsed>).errors
              : (result as ParseResult<ConsolidadoRow | PicosRow>).errors
            ).slice(0, 20).map((error, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 p-2 border-b last:border-b-0 text-sm"
              >
                <AlertCircle className="size-4 text-rose-500 shrink-0 mt-0.5" />
                <span>
                  <span className="font-mono text-xs text-muted-foreground">
                    Fila {error.row}:
                  </span>{' '}
                  {error.message}
                </span>
              </div>
            ))}
            {(isPivotResult
              ? (result as PivotParseResult<ConsolidadoPivotParsed | PicosPivotParsed>).errors.length
              : (result as ParseResult<ConsolidadoRow | PicosRow>).errors.length
            ) > 20 && (
              <div className="p-2 text-center text-xs text-muted-foreground bg-stone-50 dark:bg-stone-900">
                Mostrando 20 de {stats.errors} errores
              </div>
            )}
          </div>
        </div>
      )}

      {/* Mensaje de confirmacion */}
      {canConfirm && !hasErrors && (
        <div className="flex items-start gap-3 p-4 rounded-lg bg-lime-50 dark:bg-lime-950/20 border border-lime-200 dark:border-lime-800 mb-6">
          <CheckCircle2 className="size-5 text-lime-600 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-medium text-lime-700 dark:text-lime-300">
              Archivo listo para importar
            </p>
            <p className="text-xs text-lime-600 dark:text-lime-400 mt-1">
              {stats.valid} registros seran importados al sistema
            </p>
          </div>
        </div>
      )}

      {/* Botones de navegacion */}
      <div className="flex justify-between mt-6 pt-4 border-t">
        <div className="flex gap-2">
          <Button variant="outline" onClick={onBack}>
            <ChevronLeft className="size-4 mr-2" />
            Atras
          </Button>
          <Button variant="ghost" onClick={onReset}>
            Subir otro archivo
          </Button>
        </div>
        {canConfirm && (
          <Button onClick={onConfirm} className="bg-teal-600 hover:bg-teal-700">
            <CheckCircle2 className="size-4 mr-2" />
            Confirmar Importacion ({stats.valid})
          </Button>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Pantalla de procesamiento
 */
function ProcessingScreen({ progress }: { progress: number }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="py-12 text-center"
    >
      <Loader2 className="size-12 text-teal-600 animate-spin mx-auto mb-4" />
      <p className="text-lg font-medium mb-2">Procesando archivo...</p>
      <p className="text-sm text-muted-foreground mb-6">
        Esto puede tomar unos segundos
      </p>
      <div className="max-w-xs mx-auto">
        <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
          <motion.div
            className="h-full bg-teal-600"
            initial={{ width: 0 }}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.3 }}
          />
        </div>
        <p className="text-xs text-muted-foreground mt-2">{progress}%</p>
      </div>
    </motion.div>
  );
}

/**
 * Pantalla de error
 */
function ErrorScreen({
  error,
  onReset,
}: {
  error: string;
  onReset: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="py-12 text-center"
    >
      <AlertCircle className="size-12 text-rose-500 mx-auto mb-4" />
      <p className="text-lg font-medium text-rose-600 mb-2">Error al procesar el archivo</p>
      <p className="text-sm text-muted-foreground mb-6 max-w-md mx-auto">{error}</p>
      <Button variant="outline" onClick={onReset}>
        Intentar de nuevo
      </Button>
    </motion.div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function UploadWizard({
  onComplete,
  onCancel,
  disabled = false,
  maxFileSizeMB = 100,
}: UploadWizardProps) {
  const [state, setState] = useState<WizardState>(INITIAL_STATE);

  /**
   * Maneja la seleccion de archivo
   */
  const handleFileSelect = useCallback(async (file: File) => {
    try {
      const buffer = await file.arrayBuffer();
      const detection = await getPreviewPivot(buffer, 10);

      setState(prev => ({
        ...prev,
        step: 'type-detect',
        file,
        fileBuffer: buffer,
        detection,
        selectedType: detection.type,
        isPivot: detection.isPivotTable,
        error: null,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        error: error instanceof Error ? error.message : 'Error al leer el archivo',
      }));
    }
  }, []);

  /**
   * Maneja la seleccion de tipo
   */
  const handleSelectType = useCallback((type: ExcelFileType) => {
    setState(prev => ({ ...prev, selectedType: type }));
  }, []);

  /**
   * Maneja el toggle de pivot
   */
  const handleTogglePivot = useCallback((isPivot: boolean) => {
    setState(prev => ({ ...prev, isPivot }));
  }, []);

  /**
   * Navega al paso anterior
   */
  const handleBack = useCallback(() => {
    setState(prev => {
      const currentIndex = STEP_ORDER.indexOf(prev.step);
      if (currentIndex > 0) {
        return { ...prev, step: STEP_ORDER[currentIndex - 1] };
      }
      return prev;
    });
  }, []);

  /**
   * Navega al siguiente paso
   */
  const handleNext = useCallback(() => {
    setState(prev => {
      const currentIndex = STEP_ORDER.indexOf(prev.step);
      if (currentIndex < STEP_ORDER.length - 1) {
        return { ...prev, step: STEP_ORDER[currentIndex + 1] };
      }
      return prev;
    });
  }, []);

  /**
   * Procesa el archivo
   */
  const handleProcess = useCallback(async () => {
    if (!state.fileBuffer || !state.selectedType) return;

    setState(prev => ({ ...prev, isProcessing: true, processingProgress: 0 }));

    try {
      // Simular progreso
      const progressInterval = setInterval(() => {
        setState(prev => ({
          ...prev,
          processingProgress: Math.min(prev.processingProgress + 15, 90),
        }));
      }, 100);

      let result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow> | PivotParseResult<ConsolidadoPivotParsed> | PivotParseResult<PicosPivotParsed>;

      if (state.isPivot) {
        if (state.selectedType === 'CONSOLIDADO') {
          result = await parseConsolidadoPivot(state.fileBuffer);
        } else {
          result = await parsePicosPivot(state.fileBuffer);
        }
      } else {
        if (state.selectedType === 'CONSOLIDADO') {
          result = await parseConsolidado(state.fileBuffer);
        } else {
          result = await parsePicos(state.fileBuffer);
        }
      }

      clearInterval(progressInterval);

      setState(prev => ({
        ...prev,
        isProcessing: false,
        processingProgress: 100,
        step: 'validation',
        result,
      }));
    } catch (error) {
      setState(prev => ({
        ...prev,
        isProcessing: false,
        processingProgress: 0,
        error: error instanceof Error ? error.message : 'Error al procesar el archivo',
      }));
    }
  }, [state.fileBuffer, state.selectedType, state.isPivot]);

  /**
   * Confirma la importacion
   */
  const handleConfirm = useCallback(() => {
    if (state.result && state.selectedType && state.file) {
      onComplete?.(state.result, state.selectedType, state.isPivot, state.file.name);
    }
  }, [state.result, state.selectedType, state.isPivot, state.file, onComplete]);

  /**
   * Reinicia el wizard
   */
  const handleReset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-teal-600" />
              Importar Archivo Excel
            </CardTitle>
            <CardDescription>
              Sube archivos CONSOLIDADO o PICOS con soporte para pivot tables
            </CardDescription>
          </div>
          {onCancel && state.step !== 'file-select' && (
            <Button variant="ghost" size="icon" onClick={onCancel}>
              <X className="size-4" />
            </Button>
          )}
        </div>
      </CardHeader>

      <CardContent>
        {/* Indicador de pasos */}
        {!state.isProcessing && !state.error && (
          <StepIndicator currentStep={state.step} />
        )}

        <AnimatePresence mode="wait">
          {/* Error */}
          {state.error && (
            <ErrorScreen error={state.error} onReset={handleReset} />
          )}

          {/* Procesando */}
          {state.isProcessing && !state.error && (
            <ProcessingScreen progress={state.processingProgress} />
          )}

          {/* Paso 1: Seleccion de archivo */}
          {!state.isProcessing && !state.error && state.step === 'file-select' && (
            <FileSelectStep
              onFileSelect={handleFileSelect}
              disabled={disabled}
              maxFileSizeMB={maxFileSizeMB}
            />
          )}

          {/* Paso 2: Deteccion de tipo */}
          {!state.isProcessing && !state.error && state.step === 'type-detect' && state.file && state.detection && (
            <TypeDetectStep
              file={state.file}
              detection={state.detection}
              selectedType={state.selectedType}
              isPivot={state.isPivot}
              onSelectType={handleSelectType}
              onTogglePivot={handleTogglePivot}
              onBack={handleReset}
              onNext={handleNext}
            />
          )}

          {/* Paso 3: Preview */}
          {!state.isProcessing && !state.error && state.step === 'preview' && state.file && state.detection && state.selectedType && (
            <PreviewStep
              file={state.file}
              detection={state.detection}
              selectedType={state.selectedType}
              isPivot={state.isPivot}
              onBack={handleBack}
              onProcess={handleProcess}
            />
          )}

          {/* Paso 4: Validacion */}
          {!state.isProcessing && !state.error && state.step === 'validation' && state.file && state.result && state.selectedType && (
            <ValidationStep
              file={state.file}
              selectedType={state.selectedType}
              isPivot={state.isPivot}
              result={state.result}
              onBack={handleBack}
              onConfirm={handleConfirm}
              onReset={handleReset}
            />
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
