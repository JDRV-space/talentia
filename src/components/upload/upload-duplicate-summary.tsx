'use client';

/**
 * Resumen de duplicados manejados durante la carga
 *
 * Muestra:
 * - Cantidad de duplicados encontrados
 * - Cuantos fueron fusionados
 * - Cuantos se crearon como nuevos
 * - Cuantos fueron omitidos
 */

import * as React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Merge,
  Plus,
  SkipForward,
  Users,
  AlertTriangle,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DuplicateResolution } from './duplicate-resolution-modal';

// =============================================================================
// TYPES
// =============================================================================

interface UploadDuplicateSummaryProps {
  resolutions: DuplicateResolution[];
  onDismiss?: () => void;
  className?: string;
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function UploadDuplicateSummary({
  resolutions,
  onDismiss,
  className,
}: UploadDuplicateSummaryProps) {
  const [expanded, setExpanded] = React.useState(false);

  // Calcular estadisticas
  const stats = React.useMemo(() => {
    const merged = resolutions.filter((r) => r.action === 'merge');
    const created = resolutions.filter((r) => r.action === 'create_new');
    const skipped = resolutions.filter((r) => r.action === 'skip');
    const failed = resolutions.filter((r) => !r.success);

    return {
      total: resolutions.length,
      merged: merged.length,
      created: created.length,
      skipped: skipped.length,
      failed: failed.length,
      mergedList: merged,
      createdList: created,
      skippedList: skipped,
      failedList: failed,
    };
  }, [resolutions]);

  // No mostrar si no hay resolutions
  if (resolutions.length === 0) return null;

  const hasFailures = stats.failed > 0;

  return (
    <Card
      className={cn(
        'border-l-4',
        hasFailures
          ? 'border-l-amber-500 bg-amber-50 dark:bg-amber-950/20'
          : 'border-l-teal-500 bg-teal-50 dark:bg-teal-950/20',
        className
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-teal-600" />
            Resumen de Duplicados
          </CardTitle>
          {onDismiss && (
            <Button variant="ghost" size="sm" onClick={onDismiss}>
              Cerrar
            </Button>
          )}
        </div>
        <CardDescription>
          Se procesaron {stats.total} candidatos con posibles duplicados
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Stats Grid */}
        <div className="grid grid-cols-4 gap-3">
          {/* Fusionados */}
          <div className="rounded-lg bg-white dark:bg-stone-900 p-3 text-center border">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Merge className="h-4 w-4 text-teal-600" />
            </div>
            <div className="text-2xl font-bold text-teal-600">{stats.merged}</div>
            <div className="text-xs text-muted-foreground">Fusionados</div>
          </div>

          {/* Creados */}
          <div className="rounded-lg bg-white dark:bg-stone-900 p-3 text-center border">
            <div className="flex items-center justify-center gap-1 mb-1">
              <Plus className="h-4 w-4 text-sky-600" />
            </div>
            <div className="text-2xl font-bold text-sky-600">{stats.created}</div>
            <div className="text-xs text-muted-foreground">Nuevos</div>
          </div>

          {/* Omitidos */}
          <div className="rounded-lg bg-white dark:bg-stone-900 p-3 text-center border">
            <div className="flex items-center justify-center gap-1 mb-1">
              <SkipForward className="h-4 w-4 text-stone-500" />
            </div>
            <div className="text-2xl font-bold text-stone-500">{stats.skipped}</div>
            <div className="text-xs text-muted-foreground">Omitidos</div>
          </div>

          {/* Errores */}
          <div className="rounded-lg bg-white dark:bg-stone-900 p-3 text-center border">
            <div className="flex items-center justify-center gap-1 mb-1">
              <AlertTriangle className="h-4 w-4 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-amber-500">{stats.failed}</div>
            <div className="text-xs text-muted-foreground">Errores</div>
          </div>
        </div>

        {/* Success message */}
        {!hasFailures && (
          <div className="flex items-center gap-2 text-sm text-teal-700 dark:text-teal-400">
            <CheckCircle2 className="h-4 w-4" />
            <span>Todos los duplicados fueron procesados correctamente</span>
          </div>
        )}

        {/* Warning for failures */}
        {hasFailures && (
          <div className="flex items-start gap-2 text-sm text-amber-700 dark:text-amber-400 p-2 rounded bg-amber-100 dark:bg-amber-900/30">
            <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <div>
              <p className="font-medium">{stats.failed} error(es) durante el procesamiento</p>
              <p className="text-xs opacity-80">
                Puedes revisar los duplicados pendientes en la seccion de Duplicados
              </p>
            </div>
          </div>
        )}

        {/* Expandable details */}
        <div>
          <button
            onClick={() => setExpanded(!expanded)}
            className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
            <span>Ver detalles</span>
          </button>

          {expanded && (
            <div className="mt-3 space-y-3">
              {/* Merged list */}
              {stats.mergedList.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Fusionados ({stats.merged})
                  </p>
                  <div className="space-y-1">
                    {stats.mergedList.slice(0, 5).map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm p-2 rounded bg-white dark:bg-stone-900 border"
                      >
                        <span>
                          {r.newCandidate.first_name} {r.newCandidate.last_name}
                        </span>
                        <Badge className="bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300">
                          <Merge className="h-3 w-3 mr-1" />
                          Fusionado con {r.matchedCandidate?.nombre_completo || 'existente'}
                        </Badge>
                      </div>
                    ))}
                    {stats.mergedList.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        +{stats.mergedList.length - 5} mas
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Created list */}
              {stats.createdList.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Creados como nuevos ({stats.created})
                  </p>
                  <div className="space-y-1">
                    {stats.createdList.slice(0, 5).map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm p-2 rounded bg-white dark:bg-stone-900 border"
                      >
                        <span>
                          {r.newCandidate.first_name} {r.newCandidate.last_name}
                        </span>
                        <Badge className="bg-sky-100 text-sky-700 dark:bg-sky-900 dark:text-sky-300">
                          <Plus className="h-3 w-3 mr-1" />
                          Nuevo registro
                        </Badge>
                      </div>
                    ))}
                    {stats.createdList.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        +{stats.createdList.length - 5} mas
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Skipped list */}
              {stats.skippedList.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-2">
                    Omitidos ({stats.skipped})
                  </p>
                  <div className="space-y-1">
                    {stats.skippedList.slice(0, 5).map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm p-2 rounded bg-white dark:bg-stone-900 border"
                      >
                        <span>
                          {r.newCandidate.first_name} {r.newCandidate.last_name}
                        </span>
                        <Badge variant="outline" className="text-stone-500">
                          <SkipForward className="h-3 w-3 mr-1" />
                          No importado
                        </Badge>
                      </div>
                    ))}
                    {stats.skippedList.length > 5 && (
                      <p className="text-xs text-muted-foreground text-center py-1">
                        +{stats.skippedList.length - 5} mas
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Failed list */}
              {stats.failedList.length > 0 && (
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-amber-600 mb-2">
                    Con errores ({stats.failed})
                  </p>
                  <div className="space-y-1">
                    {stats.failedList.map((r, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between text-sm p-2 rounded bg-amber-100 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800"
                      >
                        <span>
                          {r.newCandidate.first_name} {r.newCandidate.last_name}
                        </span>
                        <span className="text-xs text-amber-600">{r.error || 'Error desconocido'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
