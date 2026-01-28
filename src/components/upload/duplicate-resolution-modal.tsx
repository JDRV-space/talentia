'use client';

/**
 * Modal para resolver duplicados detectados durante la carga de candidatos
 *
 * Muestra una lista de candidatos duplicados encontrados y permite al usuario:
 * - Fusionar con el existente (merge)
 * - Crear como nuevo registro (dismiss - marca como revisado)
 * - Omitir (skip)
 *
 * Flujo:
 * 1. Se muestra un duplicado a la vez
 * 2. Usuario elige accion
 * 3. Se procesa via API
 * 4. Siguiente duplicado o resumen final
 */

import * as React from 'react';
import { useState, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  AlertTriangle,
  Users,
  ArrowRight,
  Merge,
  Plus,
  SkipForward,
  Loader2,
  CheckCircle2,
  Phone,
  MapPin,
  Calendar,
  Hash,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { DuplicateDisplayInfo } from '@/types/dedup';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Candidato nuevo que se esta subiendo
 */
export interface NewCandidateData {
  phone: string;
  first_name: string;
  last_name: string;
  maternal_last_name?: string;
  dni?: string;
  zone?: string;
}

/**
 * Resultado de la verificacion de duplicados del API
 */
export interface DuplicateCheckResponse {
  success: boolean;
  tiene_duplicados: boolean;
  mensaje: string;
  coincidencias: DuplicateDisplayInfo[];
  total_coincidencias: number;
  recomendacion: {
    accion: 'fusion_automatica' | 'revision_requerida' | 'verificar_manualmente' | 'continuar';
    descripcion: string;
  };
}

/**
 * Resultado de procesar un duplicado
 */
export interface DuplicateResolution {
  newCandidate: NewCandidateData;
  matchedCandidate: DuplicateDisplayInfo | null;
  action: 'merge' | 'create_new' | 'skip';
  success: boolean;
  error?: string;
}

/**
 * Props del modal
 */
interface DuplicateResolutionModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  duplicates: Array<{
    newCandidate: NewCandidateData;
    matches: DuplicateDisplayInfo[];
  }>;
  onComplete: (resolutions: DuplicateResolution[]) => void;
  onSkipAll: () => void;
}

// =============================================================================
// HELPER COMPONENTS
// =============================================================================

/**
 * Card para mostrar informacion de un candidato
 */
function CandidateCard({
  title,
  name,
  phone,
  dni,
  zone,
  lastContact,
  timesHired,
  confidence,
  isNew = false,
  className,
}: {
  title: string;
  name: string;
  phone: string;
  dni?: string | null;
  zone?: string | null;
  lastContact?: string | null;
  timesHired?: number;
  confidence?: number;
  isNew?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'rounded-lg border p-4',
        isNew
          ? 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'
          : 'border-teal-200 bg-teal-50 dark:border-teal-800 dark:bg-teal-950/30',
        className
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {title}
        </span>
        {confidence !== undefined && (
          <Badge
            variant="outline"
            className={cn(
              'text-xs',
              confidence >= 90
                ? 'border-rose-500 text-rose-600'
                : confidence >= 80
                ? 'border-amber-500 text-amber-600'
                : 'border-stone-400 text-stone-600'
            )}
          >
            {confidence}% coincidencia
          </Badge>
        )}
        {isNew && (
          <Badge className="bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300">
            Nuevo
          </Badge>
        )}
      </div>

      <p className="font-semibold text-lg mb-2">{name}</p>

      <div className="space-y-1.5 text-sm text-muted-foreground">
        <div className="flex items-center gap-2">
          <Phone className="h-3.5 w-3.5" />
          <span>{phone}</span>
        </div>
        {dni && (
          <div className="flex items-center gap-2">
            <Hash className="h-3.5 w-3.5" />
            <span>DNI: {dni}</span>
          </div>
        )}
        {zone && (
          <div className="flex items-center gap-2">
            <MapPin className="h-3.5 w-3.5" />
            <span>{zone}</span>
          </div>
        )}
        {lastContact && (
          <div className="flex items-center gap-2">
            <Calendar className="h-3.5 w-3.5" />
            <span>
              Ultimo contacto:{' '}
              {new Date(lastContact).toLocaleDateString('es-PE', {
                day: '2-digit',
                month: 'short',
                year: 'numeric',
              })}
            </span>
          </div>
        )}
        {timesHired !== undefined && timesHired > 0 && (
          <div className="flex items-center gap-2">
            <Users className="h-3.5 w-3.5" />
            <span>Contratado {timesHired}x</span>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Botones de accion para resolver duplicado
 */
function ActionButtons({
  onMerge,
  onCreateNew,
  onSkip,
  isProcessing,
  disabled,
}: {
  onMerge: () => void;
  onCreateNew: () => void;
  onSkip: () => void;
  isProcessing: boolean;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <Button
        onClick={onMerge}
        disabled={disabled || isProcessing}
        className="bg-teal-600 hover:bg-teal-700 flex flex-col items-center gap-1 h-auto py-3"
      >
        {isProcessing ? (
          <Loader2 className="h-5 w-5 animate-spin" />
        ) : (
          <Merge className="h-5 w-5" />
        )}
        <span className="text-xs">Fusionar</span>
      </Button>

      <Button
        onClick={onCreateNew}
        disabled={disabled || isProcessing}
        variant="outline"
        className="flex flex-col items-center gap-1 h-auto py-3"
      >
        <Plus className="h-5 w-5" />
        <span className="text-xs">Crear nuevo</span>
      </Button>

      <Button
        onClick={onSkip}
        disabled={disabled || isProcessing}
        variant="ghost"
        className="flex flex-col items-center gap-1 h-auto py-3 text-muted-foreground"
      >
        <SkipForward className="h-5 w-5" />
        <span className="text-xs">Omitir</span>
      </Button>
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function DuplicateResolutionModal({
  open,
  onOpenChange,
  duplicates,
  onComplete,
  onSkipAll,
}: DuplicateResolutionModalProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [resolutions, setResolutions] = useState<DuplicateResolution[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const currentDuplicate = duplicates[currentIndex];
  const totalDuplicates = duplicates.length;
  const hasMore = currentIndex < totalDuplicates - 1;

  /**
   * Procesa la resolucion actual y avanza al siguiente
   */
  const processResolution = useCallback(
    async (action: 'merge' | 'create_new' | 'skip') => {
      if (!currentDuplicate) return;

      setIsProcessing(true);
      setError(null);

      const resolution: DuplicateResolution = {
        newCandidate: currentDuplicate.newCandidate,
        matchedCandidate: currentDuplicate.matches[0] || null,
        action,
        success: true,
      };

      // Si es merge, llamar al API de resolucion
      if (action === 'merge' && currentDuplicate.matches[0]) {
        try {
          const masterId = currentDuplicate.matches[0].id;
          const response = await fetch(`/api/candidates/${masterId}/resolve-duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              duplicate_candidate_id: masterId, // En este caso el "nuevo" se fusiona con el existente
              action: 'merge',
              notes: `Fusionado durante carga masiva. Datos nuevos: ${currentDuplicate.newCandidate.first_name} ${currentDuplicate.newCandidate.last_name}`,
            }),
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Error al fusionar candidatos');
          }

          resolution.success = true;
        } catch (err) {
          resolution.success = false;
          resolution.error = err instanceof Error ? err.message : 'Error desconocido';
          setError(resolution.error);
        }
      }

      // Si es create_new o skip, marcar como revisado (dismiss)
      if (action === 'create_new' && currentDuplicate.matches[0]) {
        try {
          const masterId = currentDuplicate.matches[0].id;
          const response = await fetch(`/api/candidates/${masterId}/resolve-duplicate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              duplicate_candidate_id: masterId,
              action: 'dismiss',
              notes: `Confirmado como persona diferente durante carga masiva. Nuevo candidato: ${currentDuplicate.newCandidate.first_name} ${currentDuplicate.newCandidate.last_name}`,
            }),
          });

          if (!response.ok) {
            // Non-fatal - continue regardless
          }

          resolution.success = true;
        } catch (err) {
          // No fatal para create_new
          resolution.success = true;
        }
      }

      setResolutions((prev) => [...prev, resolution]);
      setIsProcessing(false);

      // Avanzar al siguiente o completar
      if (hasMore) {
        setCurrentIndex((prev) => prev + 1);
      } else {
        // Completado todos
        onComplete([...resolutions, resolution]);
        onOpenChange(false);
        // Reset state
        setCurrentIndex(0);
        setResolutions([]);
      }
    },
    [currentDuplicate, currentIndex, hasMore, onComplete, onOpenChange, resolutions]
  );

  /**
   * Maneja fusion
   */
  const handleMerge = useCallback(() => {
    processResolution('merge');
  }, [processResolution]);

  /**
   * Maneja crear nuevo
   */
  const handleCreateNew = useCallback(() => {
    processResolution('create_new');
  }, [processResolution]);

  /**
   * Maneja omitir
   */
  const handleSkip = useCallback(() => {
    processResolution('skip');
  }, [processResolution]);

  /**
   * Maneja omitir todos
   */
  const handleSkipAll = useCallback(() => {
    onSkipAll();
    onOpenChange(false);
    setCurrentIndex(0);
    setResolutions([]);
  }, [onSkipAll, onOpenChange]);

  // Si no hay duplicados, no mostrar nada
  if (!currentDuplicate) return null;

  const bestMatch = currentDuplicate.matches[0];
  const newCandidateName = `${currentDuplicate.newCandidate.first_name} ${currentDuplicate.newCandidate.last_name}${
    currentDuplicate.newCandidate.maternal_last_name
      ? ` ${currentDuplicate.newCandidate.maternal_last_name}`
      : ''
  }`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500" />
            Posible duplicado detectado
          </DialogTitle>
          <DialogDescription>
            {currentIndex + 1} de {totalDuplicates} duplicados encontrados.
            {currentDuplicate.matches.length > 1 && (
              <span className="text-amber-600">
                {' '}
                (+{currentDuplicate.matches.length - 1} coincidencias adicionales)
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {/* Progress bar */}
        <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
          <div
            className="h-full bg-teal-600 transition-all duration-300"
            style={{ width: `${((currentIndex + 1) / totalDuplicates) * 100}%` }}
          />
        </div>

        {/* Comparison */}
        <div className="grid grid-cols-2 gap-4 py-4">
          {/* Nuevo candidato */}
          <CandidateCard
            title="Candidato a importar"
            name={newCandidateName}
            phone={currentDuplicate.newCandidate.phone}
            dni={currentDuplicate.newCandidate.dni}
            zone={currentDuplicate.newCandidate.zone}
            isNew
          />

          {/* Candidato existente */}
          {bestMatch && (
            <CandidateCard
              title="Candidato existente"
              name={bestMatch.nombre_completo}
              phone={bestMatch.telefono}
              dni={bestMatch.dni}
              zone={bestMatch.zona}
              lastContact={bestMatch.ultimo_contacto}
              timesHired={bestMatch.veces_contratado}
              confidence={bestMatch.confianza}
            />
          )}
        </div>

        {/* Match details */}
        {bestMatch && (
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground py-2">
            <ArrowRight className="h-4 w-4" />
            <span>
              Coincidencia por:{' '}
              <span className="font-medium">
                {bestMatch.tipo_coincidencia === 'phone'
                  ? 'Telefono'
                  : bestMatch.tipo_coincidencia === 'name'
                  ? 'Nombre'
                  : 'Telefono y Nombre'}
              </span>
            </span>
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="rounded-lg bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 p-3 text-sm text-rose-600">
            {error}
          </div>
        )}

        {/* Actions */}
        <div className="space-y-4">
          <ActionButtons
            onMerge={handleMerge}
            onCreateNew={handleCreateNew}
            onSkip={handleSkip}
            isProcessing={isProcessing}
            disabled={!bestMatch}
          />

          <p className="text-xs text-center text-muted-foreground">
            <strong>Fusionar:</strong> Combina los datos con el candidato existente.{' '}
            <strong>Crear nuevo:</strong> Importa como candidato separado.{' '}
            <strong>Omitir:</strong> No importar este candidato.
          </p>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button variant="ghost" onClick={handleSkipAll} disabled={isProcessing}>
            Omitir todos los duplicados
          </Button>
          <div className="text-sm text-muted-foreground">
            {resolutions.length} procesados
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
