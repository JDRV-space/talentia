'use client';

/**
 * Pagina de subida de archivos Excel
 *
 * NEW ARCHITECTURE (Jan 2026): Browser-side Excel parsing
 * - Parses 93MB Excel files directly in the browser
 * - Sends only ~3MB JSON to API (no external storage needed)
 * - Bypasses Vercel's 4.5MB upload limit
 * - No R2/S3/external storage required
 *
 * Flow:
 * 1. Usuario selecciona archivo
 * 2. Browser parsea el Excel (muestra progreso)
 * 3. Envia JSON a /api/upload-json
 * 4. Muestra resumen
 * 5. Si es CONSOLIDADO, verificar duplicados
 * 6. Mostrar modal de resolucion si hay duplicados
 */

import * as React from 'react';
import { useState, useCallback, useRef } from 'react';
import { Header } from '@/components/layout/header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertCircle,
  Loader2,
  X,
  History,
  Clock,
  Trash2,
  Users,
  Cpu,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { DuplicateResolutionModal } from '@/components/upload/duplicate-resolution-modal';
import { UploadDuplicateSummary } from '@/components/upload/upload-duplicate-summary';
import { parseExcelInBrowser, type BrowserParseResult } from '@/lib/excel/browser-parser';
import type { DuplicateResolution, NewCandidateData } from '@/components/upload/duplicate-resolution-modal';
import type { DuplicateDisplayInfo } from '@/types/dedup';

// =============================================================================
// TIPOS
// =============================================================================

interface SyncStats {
  positionsProcessed: number;
  positionsUpdated: number;
  positionsInserted: number;
  candidatesProcessed: number;
  campaignsProcessed: number;
  recruitersProcessed: number;
  recruitersCreated: number;
  duplicatesFound: number;
  batchesExecuted: number;
  errors: number;
  durationMs: number;
}

interface UploadResult {
  success: boolean;
  fileType?: 'CONSOLIDADO' | 'PICOS' | 'UNKNOWN';
  data?: {
    metadata: {
      totalRows: number;
      extractedDate: string | null;
      dateSource: string;
    };
    errors: Array<{ row: number; message: string }>;
    data?: Array<{
      dni_seleccionado?: string;
      seleccionado?: string;
      telefono?: string;
      zona?: string;
    }>;
  };
  syncStats?: SyncStats;
  extractedDate?: string | null;
  dateSource?: string;
  error?: string;
  auditId?: string;
}

interface UploadHistoryItem {
  id: string;
  fileName: string;
  fileType: string;
  uploadedAt: Date;
  totalRows: number;
  extractedDate: string | null;
  status: 'success' | 'error';
  error?: string;
  duplicatesHandled?: number;
}

type UploadStatus = 'idle' | 'parsing' | 'sending' | 'checking_duplicates' | 'resolving_duplicates' | 'success' | 'error';

interface ParseProgress {
  stage: 'reading' | 'parsing' | 'extracting' | 'complete';
  percent: number;
  message: string;
}

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export default function SubirPage() {
  const [status, setStatus] = useState<UploadStatus>('idle');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [history, setHistory] = useState<UploadHistoryItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [parseProgress, setParseProgress] = useState<ParseProgress | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Estado para duplicados
  const [duplicatesModalOpen, setDuplicatesModalOpen] = useState(false);
  const [duplicatesToResolve, setDuplicatesToResolve] = useState<Array<{
    newCandidate: NewCandidateData;
    matches: DuplicateDisplayInfo[];
  }>>([]);
  const [duplicateResolutions, setDuplicateResolutions] = useState<DuplicateResolution[]>([]);
  const [duplicateCheckProgress, setDuplicateCheckProgress] = useState({ current: 0, total: 0 });

  /**
   * Limpia todos los datos de la base de datos
   */
  const handleClearData = useCallback(async () => {
    if (!confirm('Seguro que quieres borrar TODOS los datos? Esta accion no se puede deshacer.')) {
      return;
    }

    setClearing(true);
    try {
      const response = await fetch('/api/admin/clear-data', { method: 'DELETE' });
      const data = await response.json();

      if (data.success) {
        alert('Datos borrados exitosamente. Recarga la pagina del Panel.');
        setHistory([]);
      } else {
        alert('Error al borrar datos: ' + (data.error || 'Error desconocido'));
      }
    } catch {
      alert('Error de conexion al servidor');
    } finally {
      setClearing(false);
    }
  }, []);

  /**
   * Maneja la seleccion de archivo
   */
  const handleFileSelect = useCallback((file: File) => {
    // Validar extension
    const validExtensions = ['.xlsx', '.xls'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!validExtensions.includes(extension)) {
      alert('Solo se aceptan archivos Excel (.xlsx, .xls)');
      return;
    }

    // Validar tamano (200MB max for browser parsing)
    const MAX_FILE_SIZE_MB = 200;
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      alert(`El archivo excede el tamano maximo de ${MAX_FILE_SIZE_MB}MB.`);
      return;
    }

    setSelectedFile(file);
    setStatus('idle');
    setResult(null);
    setDuplicateResolutions([]);
    setDuplicatesToResolve([]);
    setParseProgress(null);
  }, []);

  /**
   * Verifica duplicados para los candidatos cargados usando endpoint batch optimizado
   */
  const checkDuplicates = useCallback(async (candidates: Array<{
    dni_seleccionado?: string;
    seleccionado?: string;
    telefono?: string;
    zona?: string;
  }>) => {
    // Extraer candidatos unicos con datos validos
    const seenDnis = new Set<string>();
    const candidatesToCheck: NewCandidateData[] = [];

    for (const row of candidates) {
      if (!row.dni_seleccionado || !row.seleccionado || !row.telefono) {
        continue;
      }
      if (seenDnis.has(row.dni_seleccionado)) {
        continue;
      }
      seenDnis.add(row.dni_seleccionado);

      // Parsear nombre
      const nameParts = row.seleccionado.trim().split(/\s+/);
      const firstName = nameParts[0] || '';
      const lastName = nameParts[1] || '';
      const maternalLastName = nameParts.length > 2 ? nameParts.slice(2).join(' ') : undefined;

      candidatesToCheck.push({
        phone: row.telefono,
        first_name: firstName,
        last_name: lastName,
        maternal_last_name: maternalLastName,
        dni: row.dni_seleccionado,
        zone: row.zona,
      });
    }

    if (candidatesToCheck.length === 0) {
      return [];
    }

    setDuplicateCheckProgress({ current: 0, total: candidatesToCheck.length });

    try {
      // Single batch API call for ALL candidates
      const response = await fetch('/api/candidates/check-duplicate-batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          candidates: candidatesToCheck.map(c => ({
            phone: c.phone,
            first_name: c.first_name,
            last_name: c.last_name,
            maternal_last_name: c.maternal_last_name,
            dni: c.dni,
          })),
        }),
      });

      if (!response.ok) {
        setDuplicateCheckProgress({ current: candidatesToCheck.length, total: candidatesToCheck.length });
        return [];
      }

      const data = await response.json();

      const duplicatesFound: Array<{
        newCandidate: NewCandidateData;
        matches: DuplicateDisplayInfo[];
      }> = [];

      for (const result of data.results) {
        if (result.tiene_duplicados && result.coincidencias?.length > 0) {
          duplicatesFound.push({
            newCandidate: candidatesToCheck[result.index],
            matches: result.coincidencias,
          });
        }
      }

      setDuplicateCheckProgress({ current: candidatesToCheck.length, total: candidatesToCheck.length });
      return duplicatesFound;
    } catch {
      setDuplicateCheckProgress({ current: candidatesToCheck.length, total: candidatesToCheck.length });
      return [];
    }
  }, []);

  /**
   * Agrega resultado exitoso al historial
   */
  const addToHistory = useCallback((data: UploadResult, duplicatesHandled: number) => {
    if (!selectedFile) return;

    const historyItem: UploadHistoryItem = {
      id: data.auditId || Date.now().toString(),
      fileName: selectedFile.name,
      fileType: data.fileType || 'UNKNOWN',
      uploadedAt: new Date(),
      totalRows: data.data?.metadata?.totalRows || 0,
      extractedDate: data.extractedDate || null,
      status: 'success',
      duplicatesHandled,
    };
    setHistory(prev => [historyItem, ...prev.slice(0, 4)]);
  }, [selectedFile]);

  /**
   * Agrega error al historial
   */
  const addErrorToHistory = useCallback((error?: string) => {
    if (!selectedFile) return;

    const historyItem: UploadHistoryItem = {
      id: Date.now().toString(),
      fileName: selectedFile.name,
      fileType: 'ERROR',
      uploadedAt: new Date(),
      totalRows: 0,
      extractedDate: null,
      status: 'error',
      error,
    };
    setHistory(prev => [historyItem, ...prev.slice(0, 4)]);
  }, [selectedFile]);

  /**
   * Procesa el archivo usando parsing en el browser
   *
   * Flow:
   * 1. Parse Excel in browser (shows progress)
   * 2. Send JSON to /api/upload-json
   * 3. Handle response
   */
  const handleUpload = useCallback(async () => {
    if (!selectedFile) return;

    setResult(null);
    setDuplicateResolutions([]);
    setParseProgress(null);

    try {
      // Step 1: Parse Excel in browser
      setStatus('parsing');

      let parseResult: BrowserParseResult;
      try {
        parseResult = await parseExcelInBrowser(selectedFile, (progress) => {
          setParseProgress(progress);
        });
      } catch (parseError) {
        setStatus('error');
        setResult({
          success: false,
          error: parseError instanceof Error ? parseError.message : 'Error al analizar el archivo',
        });
        addErrorToHistory(parseError instanceof Error ? parseError.message : 'Error de parsing');
        return;
      }

      if (!parseResult.success || parseResult.fileType === 'UNKNOWN') {
        setStatus('error');
        setResult({
          success: false,
          error: parseResult.errors[0]?.message || 'No se pudo detectar el tipo de archivo',
        });
        addErrorToHistory('Tipo de archivo desconocido');
        return;
      }

      // Check JSON size (Vercel limit is 4.5MB)
      const MAX_JSON_SIZE_KB = 4400; // 4.4MB to be safe
      if (parseResult.metadata.jsonSizeKB > MAX_JSON_SIZE_KB) {
        setStatus('error');
        setResult({
          success: false,
          error: `El archivo es demasiado grande (${(parseResult.metadata.jsonSizeKB / 1024).toFixed(1)}MB). Maximo: 4.4MB de datos. Intenta con un archivo mas pequeno o contacta soporte.`,
        });
        addErrorToHistory('Archivo demasiado grande');
        return;
      }

      // Step 2: Send JSON to API
      setStatus('sending');

      let response: Response;
      try {
        response = await fetch('/api/upload-json', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            fileType: parseResult.fileType,
            metadata: parseResult.metadata,
            rows: parseResult.rows,
          }),
        });
      } catch (networkError) {
        setStatus('error');
        setResult({
          success: false,
          error: 'Error de red. Verifica tu conexion a internet.',
        });
        addErrorToHistory('Error de red');
        return;
      }

      // Handle HTTP errors
      if (!response.ok) {
        let errorMessage = `Error del servidor (${response.status})`;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error || errorMessage;
        } catch {
          // Response body might not be JSON
          if (response.status === 413) {
            errorMessage = 'El archivo es demasiado grande para el servidor';
          } else if (response.status === 504 || response.status === 408) {
            errorMessage = 'Tiempo de espera agotado. Intenta con un archivo mas pequeno.';
          }
        }
        setStatus('error');
        setResult({ success: false, error: errorMessage });
        addErrorToHistory(errorMessage);
        return;
      }

      const data: UploadResult = await response.json();
      setResult(data);

      if (data.success) {
        // Si es CONSOLIDADO, verificar duplicados
        if (data.fileType === 'CONSOLIDADO' && data.data?.data && data.data.data.length > 0) {
          setStatus('checking_duplicates');

          const duplicates = await checkDuplicates(data.data.data);

          if (duplicates.length > 0) {
            setDuplicatesToResolve(duplicates);
            setDuplicatesModalOpen(true);
            setStatus('resolving_duplicates');
          } else {
            setStatus('success');
            addToHistory(data, 0);
          }
        } else {
          setStatus('success');
          addToHistory(data, 0);
        }
      } else {
        setStatus('error');
        addErrorToHistory(data.error);
      }
    } catch (error) {
      setStatus('error');
      const errorMessage = error instanceof Error ? error.message : 'Error inesperado al procesar la respuesta';
      setResult({
        success: false,
        error: errorMessage,
      });
      addErrorToHistory(errorMessage);
    }
  }, [selectedFile, checkDuplicates, addToHistory, addErrorToHistory]);

  /**
   * Maneja la resolucion de duplicados
   */
  const handleDuplicatesComplete = useCallback((resolutions: DuplicateResolution[]) => {
    setDuplicateResolutions(resolutions);
    setDuplicatesModalOpen(false);
    setStatus('success');

    if (result) {
      addToHistory(result, resolutions.length);
    }
  }, [result, addToHistory]);

  /**
   * Maneja omitir todos los duplicados
   */
  const handleSkipAllDuplicates = useCallback(() => {
    setDuplicatesModalOpen(false);
    setStatus('success');

    if (result) {
      addToHistory(result, 0);
    }
  }, [result, addToHistory]);

  /**
   * Reinicia el estado
   */
  const handleReset = useCallback(() => {
    setSelectedFile(null);
    setStatus('idle');
    setResult(null);
    setDuplicateResolutions([]);
    setDuplicatesToResolve([]);
    setParseProgress(null);
  }, []);

  /**
   * Maneja drag & drop
   */
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  }, [handleFileSelect]);

  /**
   * Genera el mensaje de estado para el boton
   */
  const getStatusMessage = (): React.ReactNode => {
    switch (status) {
      case 'parsing':
        return (
          <>
            <Cpu className="mr-2 h-4 w-4 animate-pulse" />
            {parseProgress?.message || 'Analizando archivo...'}
          </>
        );
      case 'sending':
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Enviando datos al servidor...
          </>
        );
      case 'checking_duplicates':
        return (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Verificando duplicados ({duplicateCheckProgress.current}/{duplicateCheckProgress.total})...
          </>
        );
      default:
        return (
          <>
            <Upload className="mr-2 h-4 w-4" />
            Subir y Procesar
          </>
        );
    }
  };

  return (
    <>
      <Header title="Subir Excel" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Panel principal de subida */}
          <div className="lg:col-span-2">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Upload className="h-5 w-5 text-teal-600" />
                  Subir Archivo Excel
                </CardTitle>
                <CardDescription>
                  Arrastra el archivo CONSOLIDADO o PICOS para actualizar los datos
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Zona de drop */}
                <div
                  className={cn(
                    'relative rounded-lg border-2 border-dashed p-8 transition-colors',
                    isDragging
                      ? 'border-teal-500 bg-teal-50 dark:bg-teal-950/20'
                      : 'border-muted-foreground/25 hover:border-muted-foreground/50',
                    (status === 'parsing' || status === 'sending' || status === 'checking_duplicates') && 'pointer-events-none opacity-50'
                  )}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />

                  <div className="flex flex-col items-center gap-4 text-center">
                    {selectedFile ? (
                      <>
                        <div className="flex items-center gap-3 rounded-lg bg-teal-50 dark:bg-teal-950/30 px-4 py-3">
                          <FileSpreadsheet className="h-8 w-8 text-teal-600" />
                          <div className="text-left">
                            <p className="font-medium">{selectedFile.name}</p>
                            <p className="text-sm text-muted-foreground">
                              {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={handleReset}
                            disabled={status === 'parsing' || status === 'sending' || status === 'checking_duplicates'}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div className="rounded-full bg-teal-100 dark:bg-teal-900/30 p-4">
                          <Upload className="h-8 w-8 text-teal-600" />
                        </div>
                        <div>
                          <p className="font-medium">
                            Arrastra tu archivo aqui
                          </p>
                          <p className="text-sm text-muted-foreground">
                            o haz clic para seleccionar
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Seleccionar archivo
                        </Button>
                        <p className="text-xs text-muted-foreground">
                          Formatos: .xlsx, .xls (max 200MB)
                        </p>
                      </>
                    )}
                  </div>
                </div>

                {/* Barra de progreso de parsing */}
                {status === 'parsing' && parseProgress && (
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{parseProgress.message}</span>
                      <span className="font-medium">{parseProgress.percent}%</span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                      <div
                        className="h-full bg-teal-600 transition-all duration-300"
                        style={{ width: `${parseProgress.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Boton de subida */}
                {selectedFile && status !== 'success' && status !== 'resolving_duplicates' && (
                  <Button
                    className="w-full bg-teal-600 hover:bg-teal-700"
                    size="lg"
                    onClick={handleUpload}
                    disabled={status === 'parsing' || status === 'sending' || status === 'checking_duplicates'}
                  >
                    {getStatusMessage()}
                  </Button>
                )}

                {/* Resumen de duplicados resueltos */}
                {duplicateResolutions.length > 0 && (
                  <UploadDuplicateSummary
                    resolutions={duplicateResolutions}
                    onDismiss={() => setDuplicateResolutions([])}
                  />
                )}

                {/* Resultado */}
                {result && status === 'success' && (
                  <div
                    className={cn(
                      'rounded-lg border p-4',
                      result.success
                        ? 'border-lime-200 bg-lime-50 dark:border-lime-900 dark:bg-lime-950/30'
                        : 'border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30'
                    )}
                  >
                    <div className="flex items-start gap-3">
                      {result.success ? (
                        <CheckCircle2 className="h-5 w-5 text-lime-600 mt-0.5" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <p className="font-medium">
                          {result.success
                            ? 'Archivo procesado exitosamente'
                            : 'Error al procesar archivo'}
                        </p>
                        {result.success && result.data && (
                          <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                            <p>Tipo: <Badge variant="outline">{result.fileType}</Badge></p>
                            <p>Registros procesados: {result.data.metadata.totalRows}</p>
                            {result.syncStats && (
                              <>
                                {result.syncStats.positionsProcessed > 0 && (
                                  <p>Posiciones: {result.syncStats.positionsInserted} nuevas, {result.syncStats.positionsUpdated} actualizadas</p>
                                )}
                                {result.syncStats.candidatesProcessed > 0 && (
                                  <p>Candidatos: {result.syncStats.candidatesProcessed} procesados</p>
                                )}
                                {result.syncStats.duplicatesFound > 0 && (
                                  <p className="flex items-center gap-1 text-amber-600">
                                    <Users className="h-3.5 w-3.5" />
                                    {result.syncStats.duplicatesFound} duplicados detectados automaticamente
                                  </p>
                                )}
                              </>
                            )}
                            {result.extractedDate && (
                              <p>Fecha del archivo: {new Date(result.extractedDate).toLocaleDateString('es-PE')}</p>
                            )}
                            {result.data.errors.length > 0 && (
                              <p className="text-amber-600">
                                Advertencias: {result.data.errors.length} filas con errores
                              </p>
                            )}
                          </div>
                        )}
                        {!result.success && result.error && (
                          <p className="mt-1 text-sm text-rose-600">{result.error}</p>
                        )}
                      </div>
                    </div>

                    {result.success && (
                      <Button
                        variant="outline"
                        className="mt-4 w-full"
                        onClick={handleReset}
                      >
                        Subir otro archivo
                      </Button>
                    )}
                  </div>
                )}

                {/* Error state */}
                {status === 'error' && result && !result.success && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50 dark:border-rose-900 dark:bg-rose-950/30 p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-rose-600 mt-0.5" />
                      <div className="flex-1">
                        <p className="font-medium">Error al procesar archivo</p>
                        {result.error && (
                          <p className="mt-1 text-sm text-rose-600">{result.error}</p>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={handleReset}
                    >
                      Intentar de nuevo
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Tips */}
          <div>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Informacion</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm text-muted-foreground">
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">1.</span>
                    <span><strong>CONSOLIDADO:</strong> Datos historicos de reclutamiento</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">2.</span>
                    <span><strong>PICOS:</strong> Proyeccion de produccion por semana</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">3.</span>
                    <span>La fecha se extrae automaticamente del nombre del archivo o encabezados</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-teal-600 font-bold">4.</span>
                    <span>Los datos se guardan automaticamente en la base de datos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-amber-600 font-bold">5.</span>
                    <span><strong>Duplicados:</strong> Se detectan automaticamente y puedes elegir fusionar o crear nuevos</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-blue-600 font-bold">6.</span>
                    <span><strong>Nuevo:</strong> El archivo se procesa en tu navegador, solo se envian los datos (mas rapido)</span>
                  </li>
                </ul>

                {/* Boton limpiar datos */}
                <div className="mt-6 pt-4 border-t">
                  <Button
                    variant="destructive"
                    className="w-full"
                    onClick={handleClearData}
                    disabled={clearing}
                  >
                    {clearing ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Borrando...
                      </>
                    ) : (
                      <>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Borrar todos los datos
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2 text-center">
                    Usa esto para limpiar antes de re-subir
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Historial */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <History className="h-4 w-4 text-teal-600" />
              Historial de Cargas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {history.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No hay cargas recientes</p>
              </div>
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Archivo</TableHead>
                      <TableHead>Tipo</TableHead>
                      <TableHead>Fecha Archivo</TableHead>
                      <TableHead>Registros</TableHead>
                      <TableHead>Duplicados</TableHead>
                      <TableHead>Estado</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {history.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <FileSpreadsheet className="h-4 w-4 text-teal-600" />
                            <span className="font-medium">{item.fileName}</span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">{item.fileType}</Badge>
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {item.extractedDate
                            ? new Date(item.extractedDate).toLocaleDateString('es-PE')
                            : '-'}
                        </TableCell>
                        <TableCell>{item.totalRows}</TableCell>
                        <TableCell>
                          {item.duplicatesHandled !== undefined && item.duplicatesHandled > 0 ? (
                            <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
                              <Users className="h-3 w-3 mr-1" />
                              {item.duplicatesHandled}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          {item.status === 'success' ? (
                            <Badge className="bg-lime-100 text-lime-700 dark:bg-lime-950 dark:text-lime-300">
                              <CheckCircle2 className="h-3 w-3 mr-1" />
                              OK
                            </Badge>
                          ) : (
                            <Badge className="bg-rose-100 text-rose-700 dark:bg-rose-950 dark:text-rose-300">
                              <AlertCircle className="h-3 w-3 mr-1" />
                              Error
                            </Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal de resolucion de duplicados */}
      <DuplicateResolutionModal
        open={duplicatesModalOpen}
        onOpenChange={setDuplicatesModalOpen}
        duplicates={duplicatesToResolve}
        onComplete={handleDuplicatesComplete}
        onSkipAll={handleSkipAllDuplicates}
      />
    </>
  );
}
