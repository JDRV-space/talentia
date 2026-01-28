/**
 * Motor de Deduplicacion con Fonetica Espanola para Peru
 *
 * Este modulo implementa algoritmos de deduplicacion de candidatos
 * optimizados para el espanol latinoamericano (Peru).
 *
 * NO usa Soundex estandar - implementa reglas foneticas especificas:
 * - Yeismo: 'll' y 'y' suenan igual -> normaliza a 'y'
 * - Seseo: 'c' (antes de e/i), 's', 'z' suenan igual -> normaliza a 's'
 * - H muda: 'h' es silenciosa -> se elimina
 * - Fusion B/V: 'b' y 'v' suenan igual -> normaliza a 'b'
 * - Suavizacion J/G: 'j' y 'g' (antes de e/i) suenan igual -> normaliza a 'j'
 * - N con tilde: 'n' se mantiene distinta (sonido diferente)
 * - Letras dobles: Se eliminan consecutivas (excepto 'rr' que es distinto)
 *
 * @module lib/algorithms/dedup
 */

import type { Candidate } from '@/types/database';
import { DEDUP_THRESHOLDS } from '@/types/constants';
import { normalizePhoneNumber } from '@/types/schemas';

// =============================================================================
// TIPOS
// =============================================================================

/**
 * Resultado de comparacion de duplicados
 */
export interface DuplicateMatch {
  candidate_id: string;
  match_candidate_id: string;
  confidence: number; // 0-1
  match_type: 'phone' | 'name' | 'phone_and_name';
  details: {
    phone_match: boolean;
    name_similarity: number;
    phonetic_match: boolean;
  };
}

/**
 * Resultado de deduplicacion por lotes
 */
export interface BatchDedupResult {
  unique: Candidate[];
  duplicates: Array<{ candidate: Candidate; matches: DuplicateMatch[] }>;
  autoMerged: Array<{ kept: Candidate; merged: Candidate }>;
}

/**
 * Pesos para calculo de similitud de nombres
 * first_name = 30%, last_name = 50%, maternal_last_name = 20%
 */
const NAME_WEIGHTS = {
  first_name: 0.3,
  last_name: 0.5,
  maternal_last_name: 0.2,
} as const;

/**
 * Lista de apellidos indigenas comunes (Quechua/Aymara)
 * Para estos apellidos no aplicamos fonetica, solo coincidencia exacta
 */
const INDIGENOUS_SURNAMES = new Set([
  // Apellidos Quechua comunes
  'quispe', 'mamani', 'condori', 'huanca', 'choque', 'cusi', 'inca',
  'huaman', 'supa', 'yupanqui', 'tito', 'ccama', 'ccari', 'chura',
  'ccanqui', 'apaza', 'catacora', 'colque', 'huallpa', 'ticona',
  'poma', 'chambi', 'cahuana', 'calsina', 'calla', 'callata',
  // Apellidos Aymara comunes
  'paxi', 'pari', 'tarqui', 'quenta', 'quino', 'coaquira',
  'coila', 'coa', 'ramos', 'larico', 'llanos', 'llanqui',
]);

// =============================================================================
// FONETICA ESPANOLA PERUANA
// =============================================================================

/**
 * Convierte un nombre a su representacion fonetica espanola (Peru)
 *
 * Reglas aplicadas:
 * 1. Convertir a minusculas
 * 2. Normalizar caracteres especiales (acentos, n)
 * 3. Aplicar reglas foneticas peruanas
 * 4. Eliminar letras dobles (excepto rr)
 *
 * @param name - Nombre a convertir
 * @returns Representacion fonetica del nombre
 *
 * @example
 * toSpanishPhonetic('Hernández') // 'ernanedes'
 * toSpanishPhonetic('Llanos') // 'yanos'
 * toSpanishPhonetic('Gonzáles') // 'gonsales'
 */
export function toSpanishPhonetic(name: string): string {
  if (!name || typeof name !== 'string') {
    return '';
  }

  let result = name.toLowerCase().trim();

  // Paso 1: Normalizar caracteres especiales
  // Mantener n como caracter especial (representado como 'ny')
  result = result.replace(/ñ/g, 'ny');

  // Eliminar acentos
  result = result
    .replace(/á/g, 'a')
    .replace(/é/g, 'e')
    .replace(/í/g, 'i')
    .replace(/ó/g, 'o')
    .replace(/ú/g, 'u')
    .replace(/ü/g, 'u');

  // Paso 2: Aplicar reglas foneticas peruanas

  // Regla 1: Yeismo - 'll' y 'y' suenan igual
  result = result.replace(/ll/g, 'y');

  // Regla 2: Seseo - 'c' antes de e/i, 's', 'z' suenan igual
  // 'ce' -> 'se', 'ci' -> 'si'
  result = result.replace(/c([ei])/g, 's$1');
  result = result.replace(/z/g, 's');

  // Regla 3: H muda - eliminar 'h'
  result = result.replace(/h/g, '');

  // Regla 4: Fusion B/V - normalizar a 'b'
  result = result.replace(/v/g, 'b');

  // Regla 5: Suavizacion J/G - 'g' antes de e/i suena como 'j'
  // 'ge' -> 'je', 'gi' -> 'ji'
  result = result.replace(/g([ei])/g, 'j$1');

  // Paso 3: Eliminar letras dobles (excepto 'rr' que es distinto)
  // Primero proteger 'rr'
  result = result.replace(/rr/g, '\x00'); // Marcador temporal
  result = result.replace(/(.)\1+/g, '$1'); // Eliminar duplicados
  result = result.replace(/\x00/g, 'rr'); // Restaurar 'rr'

  // Paso 4: Eliminar caracteres no alfabeticos
  result = result.replace(/[^a-z]/g, '');

  return result;
}

/**
 * Verifica si un apellido es indigena (Quechua/Aymara)
 * Para apellidos indigenas no aplicamos fonetica, solo coincidencia exacta
 *
 * @param surname - Apellido a verificar
 * @returns true si es apellido indigena
 */
function isIndigenousSurname(surname: string): boolean {
  if (!surname) return false;
  return INDIGENOUS_SURNAMES.has(surname.toLowerCase().trim());
}

// =============================================================================
// DISTANCIA DE LEVENSHTEIN OPTIMIZADA
// =============================================================================

/**
 * Calcula la distancia de Levenshtein entre dos cadenas
 *
 * Optimizaciones implementadas:
 * - Espacio O(min(n,m)) en lugar de O(n*m)
 * - Terminacion temprana si la distancia excede maxDistance
 * - Caso especial para cadenas vacias
 *
 * @param a - Primera cadena
 * @param b - Segunda cadena
 * @param maxDistance - Distancia maxima antes de terminar (opcional)
 * @returns Distancia de edicion entre las cadenas
 *
 * @example
 * levenshteinDistance('gato', 'pato') // 1
 * levenshteinDistance('casa', 'cosa') // 1
 * levenshteinDistance('perro', 'perros') // 1
 */
export function levenshteinDistance(
  a: string,
  b: string,
  maxDistance?: number
): number {
  // Casos especiales
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  // Asegurar que 'a' sea la cadena mas corta para optimizar espacio
  if (a.length > b.length) {
    [a, b] = [b, a];
  }

  const m = a.length;
  const n = b.length;

  // Si la diferencia de longitud ya excede maxDistance, terminar temprano
  if (maxDistance !== undefined && Math.abs(m - n) > maxDistance) {
    return maxDistance + 1;
  }

  // Usar un solo arreglo para optimizar espacio O(min(n,m))
  const previous: number[] = new Array(m + 1);
  const current: number[] = new Array(m + 1);

  // Inicializar primera fila
  for (let i = 0; i <= m; i++) {
    previous[i] = i;
  }

  // Calcular distancias
  for (let j = 1; j <= n; j++) {
    current[0] = j;

    // Variable para rastrear el minimo en esta fila (para terminacion temprana)
    let rowMin = current[0];

    for (let i = 1; i <= m; i++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;

      current[i] = Math.min(
        previous[i] + 1,      // Eliminacion
        current[i - 1] + 1,   // Insercion
        previous[i - 1] + cost // Sustitucion
      );

      rowMin = Math.min(rowMin, current[i]);
    }

    // Terminacion temprana si el minimo de la fila excede maxDistance
    if (maxDistance !== undefined && rowMin > maxDistance) {
      return maxDistance + 1;
    }

    // Intercambiar arreglos
    for (let i = 0; i <= m; i++) {
      previous[i] = current[i];
    }
  }

  return current[m];
}

// =============================================================================
// SIMILITUD DE NOMBRES
// =============================================================================

/**
 * Calcula la similitud entre dos nombres (0-1)
 *
 * Usa distancia de Levenshtein normalizada:
 * similarity = 1 - (distance / max(len1, len2))
 *
 * @param name1 - Primer nombre
 * @param name2 - Segundo nombre
 * @returns Similitud entre 0 y 1
 *
 * @example
 * nameSimilarity('Juan', 'Juan') // 1.0
 * nameSimilarity('Maria', 'Mario') // 0.8
 * nameSimilarity('Pedro', 'Juan') // ~0.2
 */
export function nameSimilarity(name1: string, name2: string): number {
  if (!name1 && !name2) return 1;
  if (!name1 || !name2) return 0;

  const s1 = name1.toLowerCase().trim();
  const s2 = name2.toLowerCase().trim();

  if (s1 === s2) return 1;

  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1;

  const distance = levenshteinDistance(s1, s2);
  return 1 - distance / maxLen;
}

/**
 * Calcula similitud entre dos nombres usando representacion fonetica
 *
 * @param name1 - Primer nombre
 * @param name2 - Segundo nombre
 * @returns Similitud fonetica entre 0 y 1
 */
function phoneticSimilarity(name1: string, name2: string): number {
  const phonetic1 = toSpanishPhonetic(name1);
  const phonetic2 = toSpanishPhonetic(name2);

  return nameSimilarity(phonetic1, phonetic2);
}

/**
 * Calcula similitud de apellido considerando apellidos indigenas
 *
 * @param surname1 - Primer apellido
 * @param surname2 - Segundo apellido
 * @returns Similitud entre 0 y 1
 */
function surnameSimilarity(surname1: string, surname2: string): number {
  if (!surname1 && !surname2) return 1;
  if (!surname1 || !surname2) return 0;

  // Si alguno es apellido indigena, usar coincidencia exacta
  if (isIndigenousSurname(surname1) || isIndigenousSurname(surname2)) {
    return surname1.toLowerCase().trim() === surname2.toLowerCase().trim()
      ? 1
      : 0;
  }

  // Para otros apellidos, usar el maximo entre similitud directa y fonetica
  const directSim = nameSimilarity(surname1, surname2);
  const phoneticSim = phoneticSimilarity(surname1, surname2);

  return Math.max(directSim, phoneticSim);
}

/**
 * Normaliza nombres compuestos para comparacion
 * Maneja casos como "Maria del Carmen" -> ["maria", "del", "carmen"]
 *
 * @param name - Nombre potencialmente compuesto
 * @returns Arreglo de partes del nombre normalizadas
 */
function normalizeCompoundName(name: string): string[] {
  if (!name) return [];

  return name
    .toLowerCase()
    .trim()
    .split(/\s+/)
    .filter((part) => part.length > 0);
}

/**
 * Calcula similitud ponderada del nombre completo
 *
 * Pesos: first_name = 30%, last_name = 50%, maternal_last_name = 20%
 *
 * @param candidate1 - Primer candidato
 * @param candidate2 - Segundo candidato
 * @returns Similitud ponderada entre 0 y 1
 */
function calculateFullNameSimilarity(
  candidate1: Pick<Candidate, 'first_name' | 'last_name' | 'maternal_last_name'>,
  candidate2: Pick<Candidate, 'first_name' | 'last_name' | 'maternal_last_name'>
): { similarity: number; phoneticMatch: boolean } {
  // Calcular similitud del primer nombre
  // Para nombres compuestos, comparar cada parte
  const parts1 = normalizeCompoundName(candidate1.first_name);
  const parts2 = normalizeCompoundName(candidate2.first_name);

  let firstNameSim = 0;
  if (parts1.length > 0 && parts2.length > 0) {
    // Comparar primera parte principalmente
    const directSim = nameSimilarity(parts1[0], parts2[0]);
    const phoneticSim = phoneticSimilarity(parts1[0], parts2[0]);
    firstNameSim = Math.max(directSim, phoneticSim);

    // Bonus si hay partes adicionales que coinciden
    if (parts1.length > 1 && parts2.length > 1) {
      const secondPartSim = Math.max(
        nameSimilarity(parts1[1] || '', parts2[1] || ''),
        phoneticSimilarity(parts1[1] || '', parts2[1] || '')
      );
      firstNameSim = firstNameSim * 0.7 + secondPartSim * 0.3;
    }
  }

  // Calcular similitud del apellido paterno
  const lastNameSim = surnameSimilarity(
    candidate1.last_name,
    candidate2.last_name
  );

  // Calcular similitud del apellido materno (si existe)
  let maternalSim = 1; // Default a 1 si ambos son null/undefined
  if (candidate1.maternal_last_name || candidate2.maternal_last_name) {
    maternalSim = surnameSimilarity(
      candidate1.maternal_last_name || '',
      candidate2.maternal_last_name || ''
    );
  }

  // Calcular similitud ponderada
  const weightedSimilarity =
    firstNameSim * NAME_WEIGHTS.first_name +
    lastNameSim * NAME_WEIGHTS.last_name +
    maternalSim * NAME_WEIGHTS.maternal_last_name;

  // Determinar si hay coincidencia fonetica
  const firstNamePhonetic =
    toSpanishPhonetic(candidate1.first_name) ===
    toSpanishPhonetic(candidate2.first_name);
  const lastNamePhonetic =
    toSpanishPhonetic(candidate1.last_name) ===
    toSpanishPhonetic(candidate2.last_name);

  const phoneticMatch = firstNamePhonetic && lastNamePhonetic;

  return {
    similarity: weightedSimilarity,
    phoneticMatch,
  };
}

// =============================================================================
// COMPARACION DE CANDIDATOS
// =============================================================================

/**
 * Compara dos candidatos para detectar duplicados potenciales
 *
 * Logica de comparacion:
 * 1. Si los telefonos normalizados coinciden exactamente -> confianza 0.98
 * 2. Si no hay telefono pero nombres coinciden > 0.85 -> confianza = similitud * 0.9
 * 3. Si telefono Y nombre coinciden -> confianza 0.99
 *
 * @param candidate1 - Primer candidato
 * @param candidate2 - Segundo candidato
 * @returns Resultado de la comparacion o null si no hay coincidencia
 *
 * @example
 * const match = compareCandidates(candidate1, candidate2);
 * if (match && match.confidence >= 0.95) {
 *   // Auto-merge
 * }
 */
export function compareCandidates(
  candidate1: Candidate,
  candidate2: Candidate
): DuplicateMatch | null {
  // Evitar comparar con si mismo
  if (candidate1.id === candidate2.id) {
    return null;
  }

  // Normalizar telefonos para comparacion
  const phone1 = candidate1.phone_normalized ||
    normalizePhoneNumber(candidate1.phone);
  const phone2 = candidate2.phone_normalized ||
    normalizePhoneNumber(candidate2.phone);

  // Verificar coincidencia de telefono
  const phoneMatch = phone1.length >= 9 &&
    phone2.length >= 9 &&
    phone1 === phone2;

  // Calcular similitud de nombres
  const { similarity: nameSim, phoneticMatch } = calculateFullNameSimilarity(
    candidate1,
    candidate2
  );

  // Determinar tipo de coincidencia y confianza
  let confidence = 0;
  let matchType: 'phone' | 'name' | 'phone_and_name' = 'name';

  if (phoneMatch && nameSim >= 0.80) {
    // Telefono Y nombre coinciden -> maxima confianza
    confidence = 0.99;
    matchType = 'phone_and_name';
  } else if (phoneMatch) {
    // Solo telefono coincide -> alta confianza
    confidence = 0.98;
    matchType = 'phone';
  } else if (nameSim >= DEDUP_THRESHOLDS.review_threshold) {
    // Solo nombre coincide -> confianza basada en similitud
    confidence = nameSim * 0.9;
    matchType = 'name';
  } else {
    // No hay coincidencia suficiente
    return null;
  }

  // Si la confianza es muy baja, no reportar
  if (confidence < DEDUP_THRESHOLDS.review_threshold) {
    return null;
  }

  return {
    candidate_id: candidate1.id,
    match_candidate_id: candidate2.id,
    confidence,
    match_type: matchType,
    details: {
      phone_match: phoneMatch,
      name_similarity: nameSim,
      phonetic_match: phoneticMatch,
    },
  };
}

// =============================================================================
// BUSQUEDA DE DUPLICADOS
// =============================================================================

/**
 * Busca duplicados para un candidato nuevo contra una lista existente
 *
 * @param newCandidate - Candidato nuevo a verificar
 * @param existingCandidates - Lista de candidatos existentes
 * @returns Lista de coincidencias ordenadas por confianza (descendente)
 *
 * @example
 * const matches = findDuplicates(newCandidate, existingCandidates);
 * if (matches.length > 0 && matches[0].confidence >= 0.95) {
 *   console.log('Duplicado encontrado:', matches[0]);
 * }
 */
export function findDuplicates(
  newCandidate: Candidate,
  existingCandidates: Candidate[]
): DuplicateMatch[] {
  const matches: DuplicateMatch[] = [];

  // Normalizar telefono del nuevo candidato una sola vez
  const newPhone = newCandidate.phone_normalized ||
    normalizePhoneNumber(newCandidate.phone);

  // Pre-calcular fonetica del nuevo candidato para optimizacion
  const newLastNamePhonetic = toSpanishPhonetic(newCandidate.last_name);

  for (const existing of existingCandidates) {
    // Saltar si es el mismo candidato
    if (existing.id === newCandidate.id) continue;

    // Saltar candidatos eliminados o marcados como duplicados
    if (existing.deleted_at || existing.is_duplicate) continue;

    // Optimizacion: verificar telefono primero (mas rapido)
    const existingPhone = existing.phone_normalized ||
      normalizePhoneNumber(existing.phone);
    const phoneMatch = newPhone.length >= 9 &&
      existingPhone.length >= 9 &&
      newPhone === existingPhone;

    // Si no hay coincidencia de telefono, verificar fonetica rapida del apellido
    if (!phoneMatch) {
      const existingLastPhonetic = toSpanishPhonetic(existing.last_name);

      // Optimizacion: si la fonetica del apellido es muy diferente, saltar
      // Esto evita comparaciones costosas cuando claramente no hay coincidencia
      if (existingLastPhonetic !== newLastNamePhonetic) {
        const quickSim = nameSimilarity(
          existingLastPhonetic,
          newLastNamePhonetic
        );
        if (quickSim < 0.6) continue; // Muy diferente, saltar
      }
    }

    // Comparacion completa
    const match = compareCandidates(newCandidate, existing);
    if (match) {
      matches.push(match);
    }
  }

  // Ordenar por confianza descendente
  matches.sort((a, b) => b.confidence - a.confidence);

  return matches;
}

// =============================================================================
// DEDUPLICACION POR LOTES
// =============================================================================

/**
 * Deduplicacion por lotes para carga de Excel
 *
 * Procesa una lista de nuevos candidatos contra la base existente y
 * entre ellos mismos, categorizando resultados en:
 * - unique: Candidatos sin duplicados
 * - duplicates: Candidatos con duplicados que requieren revision
 * - autoMerged: Candidatos fusionados automaticamente (confianza >= 0.95)
 *
 * @param newCandidates - Lista de nuevos candidatos a procesar
 * @param existingCandidates - Lista de candidatos existentes en BD
 * @returns Resultado categorizado de la deduplicacion
 *
 * @example
 * const result = batchDeduplicate(excelCandidates, dbCandidates);
 * console.log(`Unicos: ${result.unique.length}`);
 * console.log(`Duplicados para revision: ${result.duplicates.length}`);
 * console.log(`Auto-fusionados: ${result.autoMerged.length}`);
 */
export function batchDeduplicate(
  newCandidates: Candidate[],
  existingCandidates: Candidate[]
): BatchDedupResult {
  const result: BatchDedupResult = {
    unique: [],
    duplicates: [],
    autoMerged: [],
  };

  // Crear indice de telefonos existentes para busqueda O(1)
  const existingPhoneIndex = new Map<string, Candidate>();
  for (const candidate of existingCandidates) {
    if (candidate.deleted_at || candidate.is_duplicate) continue;

    const phone = candidate.phone_normalized ||
      normalizePhoneNumber(candidate.phone);
    if (phone.length >= 9) {
      existingPhoneIndex.set(phone, candidate);
    }
  }

  // Crear indice de telefonos de nuevos candidatos para detectar duplicados internos
  const newPhoneIndex = new Map<string, Candidate>();

  // Procesar cada nuevo candidato
  for (const newCandidate of newCandidates) {
    const newPhone = newCandidate.phone_normalized ||
      normalizePhoneNumber(newCandidate.phone);

    // Verificar duplicado con candidatos existentes
    const matches = findDuplicates(newCandidate, existingCandidates);

    // Verificar duplicado con otros nuevos candidatos ya procesados
    if (newPhone.length >= 9 && newPhoneIndex.has(newPhone)) {
      const internalDupe = newPhoneIndex.get(newPhone)!;
      const internalMatch = compareCandidates(newCandidate, internalDupe);
      if (internalMatch) {
        matches.push(internalMatch);
        matches.sort((a, b) => b.confidence - a.confidence);
      }
    }

    if (matches.length === 0) {
      // Sin duplicados
      result.unique.push(newCandidate);
      if (newPhone.length >= 9) {
        newPhoneIndex.set(newPhone, newCandidate);
      }
    } else {
      const bestMatch = matches[0];

      if (bestMatch.confidence >= DEDUP_THRESHOLDS.auto_merge_threshold) {
        // Auto-merge: confianza >= 0.95
        const keptCandidate = existingCandidates.find(
          (c) => c.id === bestMatch.match_candidate_id
        ) || newPhoneIndex.get(newPhone);

        if (keptCandidate) {
          result.autoMerged.push({
            kept: keptCandidate,
            merged: newCandidate,
          });
        } else {
          // No encontrado, agregar como unico (caso improbable)
          result.unique.push(newCandidate);
        }
      } else {
        // Requiere revision manual
        result.duplicates.push({
          candidate: newCandidate,
          matches,
        });
      }
    }
  }

  return result;
}
