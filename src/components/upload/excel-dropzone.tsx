'use client';

/**
 * Componente de arrastrar y soltar para archivos Excel
 * Soporta CONSOLIDADO y Picos con preview y validación
 */

import * as React from 'react';
import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, FileSpreadsheet, X, AlertCircle, CheckCircle2, Loader2, Check } from 'lucide-react';
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
  getPreview,
  type ParseResult,
  type ExcelFileType,
  type ValidationError,
  type ValidationWarning,
} from '@/lib/excel/parser';
import type { ConsolidadoRow, PicosRow } from '@/types/schemas';

// =============================================================================
// TIPOS
// =============================================================================

interface ExcelDropzoneProps {
  onUploadComplete?: (result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow>, fileType: ExcelFileType) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  maxFileSizeMB?: number;
}

interface PreviewData {
  headers: string[];
  rows: Record<string, unknown>[];
  detectedType: ExcelFileType | null;
}

type UploadState =
  | { status: 'idle' }
  | { status: 'dragging' }
  | { status: 'file-selected'; file: File; preview: PreviewData | null }
  | { status: 'type-selection'; file: File; preview: PreviewData }
  | { status: 'processing'; file: File; fileType: ExcelFileType; progress: number }
  | { status: 'complete'; file: File; fileType: ExcelFileType; result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow> }
  | { status: 'error'; message: string };

// =============================================================================
// COMPONENTES AUXILIARES
// =============================================================================

/**
 * Selector de tipo de archivo
 */
function FileTypeSelector({
  detectedType,
  onSelect,
  onCancel,
}: {
  detectedType: ExcelFileType | null;
  onSelect: (type: ExcelFileType) => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="text-center">
        <h3 className="font-medium text-foreground">Seleccionar tipo de archivo</h3>
        <p className="text-sm text-muted-foreground mt-1">
          {detectedType
            ? `Detectamos que puede ser un archivo ${detectedType}`
            : 'Por favor indique el tipo de archivo'}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => onSelect('CONSOLIDADO')}
          className={`
            p-4 rounded-lg border-2 text-left transition-all
            hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20
            ${detectedType === 'CONSOLIDADO' ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20' : 'border-border'}
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="size-5 text-teal-600" />
            <span className="font-medium">CONSOLIDADO</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Posiciones de reclutamiento. Se carga 2 veces por semana.
          </p>
        </button>

        <button
          onClick={() => onSelect('PICOS')}
          className={`
            p-4 rounded-lg border-2 text-left transition-all
            hover:border-teal-500 hover:bg-teal-50 dark:hover:bg-teal-950/20
            ${detectedType === 'PICOS' ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20' : 'border-border'}
          `}
        >
          <div className="flex items-center gap-2 mb-2">
            <FileSpreadsheet className="size-5 text-teal-600" />
            <span className="font-medium">PICOS</span>
          </div>
          <p className="text-xs text-muted-foreground">
            Pronóstico de producción por semana. Se carga anualmente.
          </p>
        </button>
      </div>

      <div className="flex justify-center">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

/**
 * Vista previa de datos
 */
function DataPreview({
  preview,
  fileType,
}: {
  preview: PreviewData;
  fileType: ExcelFileType;
}) {
  const { headers, rows } = preview;

  if (rows.length === 0) {
    return (
      <div className="text-center py-4 text-muted-foreground">
        No se encontraron datos para previsualizar
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium">Vista previa (primeras 5 filas)</h4>
        <Badge variant="outline">{fileType}</Badge>
      </div>
      <div className="rounded-md border overflow-auto max-h-[200px]">
        <Table>
          <TableHeader>
            <TableRow>
              {headers.map((header, idx) => (
                <TableHead key={idx} className="whitespace-nowrap text-xs">
                  {header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, rowIdx) => (
              <TableRow key={rowIdx}>
                {headers.map((header, colIdx) => (
                  <TableCell key={colIdx} className="text-xs py-2">
                    {row[header] !== undefined ? String(row[header]) : '-'}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

/**
 * Barra de progreso
 */
function ProgressBar({ progress }: { progress: number }) {
  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span className="text-muted-foreground">Procesando archivo...</span>
        <span className="font-medium">{progress}%</span>
      </div>
      <div className="h-2 rounded-full bg-stone-200 dark:bg-stone-800 overflow-hidden">
        <div
          className="h-full bg-teal-600 transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Resumen rapido de resultados
 */
function QuickSummary({
  result,
  fileType,
}: {
  result: ParseResult<ConsolidadoRow> | ParseResult<PicosRow>;
  fileType: ExcelFileType;
}) {
  const hasErrors = result.errors.length > 0;
  const hasWarnings = result.warnings.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        {hasErrors ? (
          <AlertCircle className="size-5 text-rose-500" />
        ) : (
          <CheckCircle2 className="size-5 text-lime-600" />
        )}
        <span className="font-medium">
          {hasErrors ? 'Archivo procesado con errores' : 'Archivo procesado correctamente'}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-3 rounded-lg bg-stone-100 dark:bg-stone-900">
          <div className="text-2xl font-bold text-teal-600">{result.validRows}</div>
          <div className="text-xs text-muted-foreground">Registros válidos</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-stone-100 dark:bg-stone-900">
          <div className="text-2xl font-bold text-rose-500">{result.errors.length}</div>
          <div className="text-xs text-muted-foreground">Errores</div>
        </div>
        <div className="text-center p-3 rounded-lg bg-stone-100 dark:bg-stone-900">
          <div className="text-2xl font-bold text-amber-500">{result.warnings.length}</div>
          <div className="text-xs text-muted-foreground">Advertencias</div>
        </div>
      </div>

      {hasErrors && result.errors.slice(0, 3).map((error, idx) => (
        <div key={idx} className="flex items-start gap-2 text-sm text-rose-600 dark:text-rose-400">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>
            Fila {error.row}: {error.message} ({error.field})
          </span>
        </div>
      ))}

      {hasWarnings && !hasErrors && result.warnings.slice(0, 3).map((warning, idx) => (
        <div key={idx} className="flex items-start gap-2 text-sm text-amber-600 dark:text-amber-400">
          <AlertCircle className="size-4 mt-0.5 shrink-0" />
          <span>
            Fila {warning.row}: {warning.message}
            {warning.suggestion && <span className="text-muted-foreground"> - {warning.suggestion}</span>}
          </span>
        </div>
      ))}
    </div>
  );
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function ExcelDropzone({
  onUploadComplete,
  onError,
  disabled = false,
  maxFileSizeMB = 100,
}: ExcelDropzoneProps) {
  const [state, setState] = useState<UploadState>({ status: 'idle' });
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  /**
   * Valida el archivo antes de procesarlo
   */
  const validateFile = useCallback((file: File): string | null => {
    // Validar extensión
    const validExtensions = ['.xlsx', '.xls'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(extension)) {
      return 'Solo se aceptan archivos Excel (.xlsx, .xls)';
    }

    // Validar tamaño
    const maxSize = maxFileSizeMB * 1024 * 1024;
    if (file.size > maxSize) {
      return `El archivo excede el tamaño máximo de ${maxFileSizeMB}MB`;
    }

    return null;
  }, [maxFileSizeMB]);

  /**
   * Procesa el archivo seleccionado
   */
  const handleFile = useCallback(async (file: File) => {
    const error = validateFile(file);
    if (error) {
      setState({ status: 'error', message: error });
      onError?.(error);
      return;
    }

    try {
      // Leer archivo y generar preview
      const buffer = await file.arrayBuffer();
      const preview = await getPreview(buffer);

      if (preview.detectedType) {
        // Si detectamos el tipo, ir directo a confirmar
        setState({
          status: 'type-selection',
          file,
          preview,
        });
      } else {
        // Si no detectamos, pedir seleccion
        setState({
          status: 'type-selection',
          file,
          preview,
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al leer el archivo';
      setState({ status: 'error', message });
      onError?.(message);
    }
  }, [validateFile, onError]);

  /**
   * Procesa el archivo con el tipo seleccionado
   */
  const processFile = useCallback(async (file: File, fileType: ExcelFileType) => {
    setState({ status: 'processing', file, fileType, progress: 0 });

    try {
      const buffer = await file.arrayBuffer();

      // Simular progreso
      const progressInterval = setInterval(() => {
        setState(prev => {
          if (prev.status !== 'processing') return prev;
          return { ...prev, progress: Math.min(prev.progress + 10, 90) };
        });
      }, 100);

      // Parsear según tipo
      const result = fileType === 'CONSOLIDADO'
        ? await parseConsolidado(buffer)
        : await parsePicos(buffer);

      clearInterval(progressInterval);

      setState({ status: 'complete', file, fileType, result });
      onUploadComplete?.(result, fileType);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error al procesar el archivo';
      setState({ status: 'error', message });
      onError?.(message);
    }
  }, [onUploadComplete, onError]);

  /**
   * Handlers de drag and drop
   */
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setState({ status: 'dragging' });
    }
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setState({ status: 'idle' });
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    if (disabled) {
      setState({ status: 'idle' });
      return;
    }

    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleFile(files[0]);
    } else {
      setState({ status: 'idle' });
    }
  }, [disabled, handleFile]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  }, [handleFile]);

  const handleReset = useCallback(() => {
    setState({ status: 'idle' });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, []);

  // =============================================================================
  // RENDER
  // =============================================================================

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileSpreadsheet className="size-5 text-teal-600" />
          Subir Archivo Excel
        </CardTitle>
        <CardDescription>
          Arrastra y suelta un archivo CONSOLIDADO o Picos, o haz clic para seleccionar
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* Estado: Idle o Dragging */}
        {(state.status === 'idle' || state.status === 'dragging') && (
          <motion.div
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            initial={{ opacity: 0, y: 10 }}
            animate={{
              opacity: 1,
              y: 0,
              scale: state.status === 'dragging' ? 1.02 : 1,
            }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className={`
              relative border-2 border-dashed rounded-lg p-8 text-center cursor-pointer
              transition-colors duration-200
              ${state.status === 'dragging'
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
              onChange={handleFileInputChange}
              className="hidden"
              disabled={disabled}
            />

            <motion.div
              animate={{
                y: state.status === 'dragging' ? -5 : 0,
                scale: state.status === 'dragging' ? 1.1 : 1,
              }}
              transition={{ duration: 0.2, ease: "easeOut" }}
            >
              <Upload className={`
                size-12 mx-auto mb-4 transition-colors duration-200
                ${state.status === 'dragging' ? 'text-teal-500' : 'text-stone-400'}
              `} />
            </motion.div>

            <p className="text-sm text-muted-foreground mb-2">
              {state.status === 'dragging'
                ? 'Suelta el archivo aquí'
                : 'Arrastra un archivo Excel aquí'}
            </p>

            <p className="text-xs text-muted-foreground">
              o <span className="text-teal-600 underline">selecciona un archivo</span>
            </p>

            <p className="text-xs text-muted-foreground mt-4">
              Formatos aceptados: .xlsx, .xls (max {maxFileSizeMB}MB)
            </p>
          </motion.div>
        )}

        {/* Estado: Seleccion de tipo */}
        {state.status === 'type-selection' && (
          <div className="space-y-6">
            <div className="flex items-center justify-between p-3 rounded-lg bg-stone-100 dark:bg-stone-900">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-8 text-teal-600" />
                <div>
                  <p className="font-medium">{state.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(state.file.size / 1024).toFixed(1)} KB
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleReset}>
                <X className="size-4" />
              </Button>
            </div>

            <FileTypeSelector
              detectedType={state.preview.detectedType}
              onSelect={(type) => processFile(state.file, type)}
              onCancel={handleReset}
            />

            <DataPreview
              preview={state.preview}
              fileType={state.preview.detectedType || 'CONSOLIDADO'}
            />
          </div>
        )}

        {/* Estado: Procesando */}
        {state.status === 'processing' && (
          <div className="space-y-6">
            <div className="flex items-center justify-center gap-3 p-4">
              <Loader2 className="size-6 text-teal-600 animate-spin" />
              <span className="text-muted-foreground">
                Procesando {state.file.name}...
              </span>
            </div>
            <ProgressBar progress={state.progress} />
          </div>
        )}

        {/* Estado: Completo */}
        {state.status === 'complete' && (
          <motion.div
            className="space-y-6"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="flex items-center justify-between p-3 rounded-lg bg-stone-100 dark:bg-stone-900">
              <div className="flex items-center gap-3">
                {/* Animated success checkmark */}
                <motion.div
                  className="relative size-8 flex items-center justify-center"
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{
                    type: "spring",
                    stiffness: 260,
                    damping: 20,
                    delay: 0.1
                  }}
                >
                  <motion.div
                    className="absolute inset-0 rounded-full bg-lime-500"
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ duration: 0.3, delay: 0.1 }}
                  />
                  <motion.div
                    initial={{ pathLength: 0, opacity: 0 }}
                    animate={{ pathLength: 1, opacity: 1 }}
                    transition={{ duration: 0.4, delay: 0.3 }}
                  >
                    <Check className="size-5 text-white relative z-10" strokeWidth={3} />
                  </motion.div>
                </motion.div>
                <div>
                  <p className="font-medium">{state.file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {state.fileType} - {state.result.totalRows} filas
                  </p>
                </div>
              </div>
              <Button variant="ghost" size="icon" onClick={handleReset}>
                <X className="size-4" />
              </Button>
            </div>

            <QuickSummary result={state.result} fileType={state.fileType} />

            <motion.div
              className="flex justify-end gap-2"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Button variant="outline" onClick={handleReset}>
                Subir otro archivo
              </Button>
              {state.result.validRows > 0 && (
                <Button className="bg-teal-600 hover:bg-teal-700">
                  Confirmar importación
                </Button>
              )}
            </motion.div>
          </motion.div>
        )}

        {/* Estado: Error */}
        {state.status === 'error' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3 p-4 rounded-lg bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400">
              <AlertCircle className="size-6 shrink-0" />
              <p className="text-sm">{state.message}</p>
            </div>
            <div className="flex justify-center">
              <Button variant="outline" onClick={handleReset}>
                Intentar de nuevo
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
