'use client';

/**
 * Hook para verificar duplicados de candidatos durante la carga
 *
 * Uso:
 * 1. Llamar checkDuplicates con los datos del candidato
 * 2. Si hay duplicados, mostrar modal de resolucion
 * 3. Procesar la resolucion seleccionada
 */

import { useState, useCallback } from 'react';
import type { DuplicateDisplayInfo } from '@/types/dedup';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Datos del candidato para verificar
 */
export interface CandidateCheckData {
  phone: string;
  first_name: string;
  last_name: string;
  maternal_last_name?: string;
  dni?: string;
  zone?: string;
}

/**
 * Respuesta del API de verificacion
 */
export interface DuplicateCheckApiResponse {
  success: boolean;
  tiene_duplicados: boolean;
  mensaje: string;
  datos_verificados: {
    telefono_normalizado: string;
    nombre_fonetico: string;
    similitud_calculada: boolean;
  };
  coincidencias: DuplicateDisplayInfo[];
  total_coincidencias: number;
  recomendacion: {
    accion: 'fusion_automatica' | 'revision_requerida' | 'verificar_manualmente' | 'continuar';
    descripcion: string;
  };
}

/**
 * Resultado de verificacion con datos del candidato original
 */
export interface DuplicateCheckResult {
  candidate: CandidateCheckData;
  response: DuplicateCheckApiResponse;
  hasDuplicates: boolean;
}

/**
 * Estado del hook
 */
interface UseDuplicateCheckState {
  isChecking: boolean;
  results: DuplicateCheckResult[];
  duplicatesFound: Array<{
    newCandidate: CandidateCheckData;
    matches: DuplicateDisplayInfo[];
  }>;
  error: string | null;
  progress: number;
  total: number;
}

/**
 * Retorno del hook
 */
interface UseDuplicateCheckReturn extends UseDuplicateCheckState {
  checkDuplicates: (candidates: CandidateCheckData[]) => Promise<DuplicateCheckResult[]>;
  checkSingle: (candidate: CandidateCheckData) => Promise<DuplicateCheckResult>;
  reset: () => void;
}

// =============================================================================
// HOOK IMPLEMENTATION
// =============================================================================

const INITIAL_STATE: UseDuplicateCheckState = {
  isChecking: false,
  results: [],
  duplicatesFound: [],
  error: null,
  progress: 0,
  total: 0,
};

/**
 * Hook para verificar duplicados de candidatos
 */
export function useDuplicateCheck(): UseDuplicateCheckReturn {
  const [state, setState] = useState<UseDuplicateCheckState>(INITIAL_STATE);

  /**
   * Verifica un solo candidato
   */
  const checkSingle = useCallback(async (candidate: CandidateCheckData): Promise<DuplicateCheckResult> => {
    try {
      const response = await fetch('/api/candidates/check-duplicate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: candidate.phone,
          first_name: candidate.first_name,
          last_name: candidate.last_name,
          maternal_last_name: candidate.maternal_last_name,
          dni: candidate.dni,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const data: DuplicateCheckApiResponse = await response.json();

      return {
        candidate,
        response: data,
        hasDuplicates: data.tiene_duplicados,
      };
    } catch (err) {
      // Return a "no duplicates" result on error to not block the upload
      return {
        candidate,
        response: {
          success: false,
          tiene_duplicados: false,
          mensaje: 'Error al verificar',
          datos_verificados: {
            telefono_normalizado: candidate.phone,
            nombre_fonetico: '',
            similitud_calculada: false,
          },
          coincidencias: [],
          total_coincidencias: 0,
          recomendacion: {
            accion: 'continuar',
            descripcion: 'No se pudo verificar, continuar con la carga',
          },
        },
        hasDuplicates: false,
      };
    }
  }, []);

  /**
   * Verifica multiples candidatos en lote usando endpoint batch optimizado
   * Hace UNA sola llamada al servidor que procesa todos los candidatos
   */
  const checkDuplicates = useCallback(
    async (candidates: CandidateCheckData[]): Promise<DuplicateCheckResult[]> => {
      if (candidates.length === 0) {
        return [];
      }

      setState((prev) => ({
        ...prev,
        isChecking: true,
        error: null,
        progress: 0,
        total: candidates.length,
        results: [],
        duplicatesFound: [],
      }));

      try {
        // Use batch endpoint - single API call for all candidates
        const response = await fetch('/api/candidates/check-duplicate-batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            candidates: candidates.map(c => ({
              phone: c.phone,
              first_name: c.first_name,
              last_name: c.last_name,
              maternal_last_name: c.maternal_last_name,
              dni: c.dni,
            })),
          }),
        });

        if (!response.ok) {
          const errorData = await response.json();
          throw new Error(errorData.error || `Error ${response.status}`);
        }

        const data = await response.json();

        const results: DuplicateCheckResult[] = [];
        const duplicatesFound: Array<{
          newCandidate: CandidateCheckData;
          matches: DuplicateDisplayInfo[];
        }> = [];

        // Process batch results
        for (const item of data.results) {
          const candidate = candidates[item.index];
          const result: DuplicateCheckResult = {
            candidate,
            response: {
              success: item.success,
              tiene_duplicados: item.tiene_duplicados,
              mensaje: item.mensaje,
              datos_verificados: item.datos_verificados,
              coincidencias: item.coincidencias,
              total_coincidencias: item.total_coincidencias,
              recomendacion: item.recomendacion,
            },
            hasDuplicates: item.tiene_duplicados,
          };

          results.push(result);

          if (result.hasDuplicates && result.response.coincidencias.length > 0) {
            duplicatesFound.push({
              newCandidate: result.candidate,
              matches: result.response.coincidencias,
            });
          }
        }

        setState((prev) => ({
          ...prev,
          isChecking: false,
          results,
          duplicatesFound,
          progress: candidates.length,
        }));

        return results;
      } catch (err) {
        // Fallback: return empty results to not block upload
        const emptyResults: DuplicateCheckResult[] = candidates.map(candidate => ({
          candidate,
          response: {
            success: false,
            tiene_duplicados: false,
            mensaje: 'Error al verificar',
            datos_verificados: {
              telefono_normalizado: candidate.phone,
              nombre_fonetico: '',
              similitud_calculada: false,
            },
            coincidencias: [],
            total_coincidencias: 0,
            recomendacion: {
              accion: 'continuar' as const,
              descripcion: 'No se pudo verificar, continuar con la carga',
            },
          },
          hasDuplicates: false,
        }));

        setState((prev) => ({
          ...prev,
          isChecking: false,
          error: err instanceof Error ? err.message : 'Error desconocido',
          results: emptyResults,
          duplicatesFound: [],
          progress: candidates.length,
        }));

        return emptyResults;
      }
    },
    []
  );

  /**
   * Resetea el estado
   */
  const reset = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    checkDuplicates,
    checkSingle,
    reset,
  };
}

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Extrae candidatos de los datos parseados del Excel
 * Esta funcion ayuda a convertir los datos del parser a CandidateCheckData
 */
export function extractCandidatesFromConsolidado(
  data: Array<{
    dni_seleccionado?: string;
    seleccionado?: string;
    telefono?: string;
    zona?: string;
  }>
): CandidateCheckData[] {
  const candidates: CandidateCheckData[] = [];
  const seenDnis = new Set<string>();

  for (const row of data) {
    // Solo procesar filas con candidato seleccionado
    if (!row.dni_seleccionado || !row.seleccionado || !row.telefono) {
      continue;
    }

    // Evitar duplicados por DNI dentro del mismo archivo
    if (seenDnis.has(row.dni_seleccionado)) {
      continue;
    }
    seenDnis.add(row.dni_seleccionado);

    // Parsear nombre (formato: "NOMBRES APELLIDO_PATERNO APELLIDO_MATERNO")
    const nameParts = row.seleccionado.trim().split(/\s+/);
    let firstName = '';
    let lastName = '';
    let maternalLastName = '';

    if (nameParts.length >= 3) {
      // Asumir: primer nombre, apellido paterno, apellido materno
      firstName = nameParts[0];
      lastName = nameParts[1];
      maternalLastName = nameParts.slice(2).join(' ');
    } else if (nameParts.length === 2) {
      firstName = nameParts[0];
      lastName = nameParts[1];
    } else {
      firstName = nameParts[0] || '';
      lastName = '';
    }

    candidates.push({
      phone: row.telefono,
      first_name: firstName,
      last_name: lastName,
      maternal_last_name: maternalLastName || undefined,
      dni: row.dni_seleccionado,
      zone: row.zona,
    });
  }

  return candidates;
}
