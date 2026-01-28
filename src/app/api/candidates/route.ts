import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { normalizePhoneNumber } from "@/types/schemas"
import { toSpanishPhonetic, findDuplicates, type DuplicateMatch } from "@/lib/algorithms/dedup"
import { DEDUP_THRESHOLDS, ZONES, type Zone } from "@/types/constants"
import type { Candidate } from "@/types/database"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const createCandidateSchema = z.object({
  first_name: z.string().min(2).max(100),
  last_name: z.string().min(2).max(150),
  maternal_last_name: z.string().max(100).optional(),
  phone: z.string().min(9).max(20),
  email: z.string().email().optional().or(z.literal("")),
  dni: z.string().regex(/^\d{8}$/).optional().or(z.literal("")),
  zone: z.string().optional(),
})

// Helper to validate and cast zone to Zone type
function validateZone(zone: string | undefined): Zone | null {
  if (!zone) return null
  return ZONES.includes(zone as Zone) ? (zone as Zone) : null
}

// =============================================================================
// GET /api/candidates
// =============================================================================

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)
    const phone = searchParams.get("phone")
    const dni = searchParams.get("dni")
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") ?? "1", 10)
    const perPage = parseInt(searchParams.get("per_page") ?? "10", 10)

    let query = supabase
      .from("candidates")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone)
      query = query.eq("phone_normalized", normalizedPhone)
    }

    // DNI search - exact match on 8-digit document number
    if (dni) {
      query = query.eq("dni", dni)
    }

    if (status) {
      query = query.eq("status", status)
    }

    // Apply pagination
    const from = (page - 1) * perPage
    const to = from + perPage - 1
    query = query.range(from, to)

    const { data, error, count } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al obtener candidatos" },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST /api/candidates
// =============================================================================

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validationResult = createCandidateSchema.safeParse(body)
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

    const data = validationResult.data

    // Normalize phone number
    const phoneNormalized = normalizePhoneNumber(data.phone)

    // Generate full name
    const fullName = `${data.first_name} ${data.last_name}${data.maternal_last_name ? ` ${data.maternal_last_name}` : ""}`

    // Generate phonetic representation for name matching
    const namePhonetic = toSpanishPhonetic(fullName)

    // Fetch existing candidates for full duplicate detection (same as check-duplicate endpoint)
    const { data: existingCandidates } = await supabase
      .from("candidates")
      .select("*")
      .is("deleted_at", null)
      .eq("is_duplicate", false)

    // Create temporary candidate object for comparison
    const tempCandidate: Candidate = {
      id: `temp-${Date.now()}`,
      dni: data.dni || null,
      first_name: data.first_name,
      last_name: data.last_name,
      maternal_last_name: data.maternal_last_name ?? null,
      full_name: fullName,
      phone: data.phone,
      phone_normalized: phoneNormalized,
      email: data.email || null,
      name_phonetic: namePhonetic,
      zone: validateZone(data.zone),
      address: null,
      status: "available",
      times_hired: 0,
      last_hired_at: null,
      last_contacted_at: null,
      notes: null,
      tags: [],
      source: "manual",
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

    // Run full duplicate detection algorithm (same as batch import and check-duplicate)
    const activeCandidates = (existingCandidates ?? []) as Candidate[]
    const matches = findDuplicates(tempCandidate, activeCandidates)

    let duplicateWarning: {
      type: string
      confidence: number
      match_candidate_id: string
    } | null = null

    // Use review_threshold from constants (0.80) for consistency
    if (matches.length > 0 && matches[0].confidence >= DEDUP_THRESHOLDS.review_threshold) {
      duplicateWarning = {
        type: matches[0].match_type,
        confidence: matches[0].confidence,
        match_candidate_id: matches[0].match_candidate_id,
      }
    }

    // Insert new candidate
    const { data: newCandidate, error: insertError } = await supabase
      .from("candidates")
      .insert({
        first_name: data.first_name,
        last_name: data.last_name,
        maternal_last_name: data.maternal_last_name ?? null,
        full_name: fullName,
        phone: data.phone,
        phone_normalized: phoneNormalized,
        email: data.email || null,
        dni: data.dni || null,
        name_phonetic: namePhonetic,
        zone: validateZone(data.zone),
        status: "available",
        is_duplicate: duplicateWarning !== null,
        duplicate_of: duplicateWarning?.match_candidate_id ?? null,
      })
      .select()
      .single()

    if (insertError) {
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    // Log to audit_log
    await supabase.from("audit_log").insert({
      actor_type: "user",
      actor_id: user.id,
      action: "create",
      entity_type: "candidate",
      entity_id: newCandidate.id,
      new_values: data,
    })

    const response: {
      success: boolean
      data: typeof newCandidate
      message: string
      warning?: {
        type: string
        confidence: number
        match_candidate_id: string
      }
    } = {
      success: true,
      data: newCandidate,
      message: "Candidato creado exitosamente",
    }

    // Include duplicate warning if found
    if (duplicateWarning) {
      response.warning = {
        type: "duplicate_detected",
        confidence: duplicateWarning.confidence,
        match_candidate_id: duplicateWarning.match_candidate_id,
      }
    }

    return NextResponse.json(response, { status: 201 })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al crear candidato" },
      { status: 500 }
    )
  }
}
