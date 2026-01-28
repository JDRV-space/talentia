import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import {
  findDuplicates,
  toSpanishPhonetic,
  type DuplicateMatch,
} from "@/lib/algorithms"
import { DEDUP_THRESHOLDS } from "@/types/constants"
import { normalizePhoneNumber } from "@/types/schemas"
import type { Candidate } from "@/types/database"

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const candidateSchema = z.object({
  phone: z.string().min(9).max(20),
  first_name: z.string().min(1).max(100),
  last_name: z.string().min(1).max(150),
  maternal_last_name: z.string().max(100).optional(),
  dni: z.string().regex(/^\d{8}$/).optional(),
})

const batchSchema = z.object({
  candidates: z.array(candidateSchema).min(1).max(1000),
})

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function formatMatchResponse(match: DuplicateMatch, candidates: Candidate[]) {
  const matchedCandidate = candidates.find((c) => c.id === match.match_candidate_id)

  return {
    candidato_id: match.match_candidate_id,
    nombre_completo: matchedCandidate?.full_name ?? "Desconocido",
    telefono: matchedCandidate?.phone ?? null,
    dni: matchedCandidate?.dni ?? null,
    zona: matchedCandidate?.zone ?? null,
    estado: matchedCandidate?.status ?? null,
    ultimo_contacto: matchedCandidate?.last_contacted_at ?? null,
    veces_contratado: matchedCandidate?.times_hired ?? 0,
    confianza: Math.round(match.confidence * 100),
    tipo_coincidencia: translateMatchType(match.match_type),
    detalles: {
      coincide_telefono: match.details.phone_match,
      similitud_nombre: Math.round(match.details.name_similarity * 100),
      coincidencia_fonetica: match.details.phonetic_match,
    },
  }
}

function translateMatchType(matchType: DuplicateMatch["match_type"]): string {
  const translations: Record<DuplicateMatch["match_type"], string> = {
    phone: "Coincidencia de telefono",
    name: "Coincidencia de nombre",
    phone_and_name: "Coincidencia de telefono y nombre",
  }
  return translations[matchType]
}

function getRecommendation(confidence: number): {
  accion: string
  descripcion: string
} {
  if (confidence >= 95) {
    return {
      accion: "fusion_automatica",
      descripcion: "Alta confianza de duplicado. Se recomienda fusionar automaticamente.",
    }
  }
  if (confidence >= 85) {
    return {
      accion: "revision_requerida",
      descripcion: "Probable duplicado. Requiere revision manual antes de proceder.",
    }
  }
  if (confidence >= 80) {
    return {
      accion: "verificar_manualmente",
      descripcion: "Posible duplicado. Verificar datos con el candidato.",
    }
  }
  return {
    accion: "continuar",
    descripcion: "Baja probabilidad de duplicado. Puede continuar con el registro.",
  }
}

// =============================================================================
// POST /api/candidates/check-duplicate-batch
// Optimized batch endpoint - fetches existing candidates ONCE
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validationResult = batchSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos invalidos",
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 }
      )
    }

    const { candidates: candidatesToCheck } = validationResult.data

    // Fetch existing candidates ONCE (the key optimization)
    const { data: existingCandidates, error } = await supabase
      .from("candidates")
      .select("*")
      .is("deleted_at", null)
      .eq("is_duplicate", false)

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    const activeCandidates = (existingCandidates ?? []) as Candidate[]

    // Process all candidates against the same dataset
    const results = candidatesToCheck.map((candidateData, index) => {
      const { phone, first_name, last_name, maternal_last_name, dni } = candidateData

      const phoneNormalized = normalizePhoneNumber(phone)
      const namePhonetic = toSpanishPhonetic(
        `${first_name} ${last_name} ${maternal_last_name ?? ""}`
      )

      const newCandidateData: Candidate = {
        id: `temp-${Date.now()}-${index}`,
        dni: dni ?? null,
        first_name,
        last_name,
        maternal_last_name: maternal_last_name ?? null,
        full_name: `${first_name} ${last_name}${maternal_last_name ? ` ${maternal_last_name}` : ""}`,
        phone,
        phone_normalized: phoneNormalized,
        email: null,
        name_phonetic: namePhonetic,
        zone: null,
        address: null,
        status: "available",
        times_hired: 0,
        last_hired_at: null,
        last_contacted_at: null,
        notes: null,
        tags: [],
        source: "api",
        upload_id: null,
        is_duplicate: false,
        duplicate_of: null,
        dedup_reviewed: false,
        dedup_reviewed_at: null,
        dedup_reviewed_by: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        deleted_at: null,
      }

      const matches = findDuplicates(newCandidateData, activeCandidates)
      const formattedMatches = matches.map((m) =>
        formatMatchResponse(m, activeCandidates)
      )

      const highestConfidence =
        matches.length > 0 ? Math.round(matches[0].confidence * 100) : 0
      const recommendation = getRecommendation(highestConfidence)
      const hasDuplicate = matches.length > 0 && matches[0].confidence >= DEDUP_THRESHOLDS.review_threshold

      let message: string
      if (matches.length === 0) {
        message = "No se encontraron duplicados."
      } else if (hasDuplicate) {
        message = `Se encontraron ${matches.length} posible(s) duplicado(s).`
      } else {
        message = `Se encontraron ${matches.length} coincidencia(s) de baja confianza.`
      }

      return {
        index,
        candidate: candidateData,
        success: true,
        tiene_duplicados: hasDuplicate,
        mensaje: message,
        datos_verificados: {
          telefono_normalizado: phoneNormalized,
          nombre_fonetico: namePhonetic,
          similitud_calculada: true,
        },
        coincidencias: formattedMatches,
        total_coincidencias: matches.length,
        recomendacion: recommendation,
      }
    })

    // Summary stats
    const withDuplicates = results.filter(r => r.tiene_duplicados).length
    const withoutDuplicates = results.length - withDuplicates

    return NextResponse.json({
      success: true,
      total_checked: results.length,
      with_duplicates: withDuplicates,
      without_duplicates: withoutDuplicates,
      results,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al verificar duplicados" },
      { status: 500 }
    )
  }
}
