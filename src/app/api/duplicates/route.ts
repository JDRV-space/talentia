/**
 * API endpoint for duplicate candidate groups
 * GET /api/duplicates - Returns grouped duplicate candidates
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

// =============================================================================
// TYPES
// =============================================================================

interface DuplicateCandidate {
  id: string
  full_name: string
  dni: string | null
  phone: string
  last_contacted_at: string | null
  status: string
}

interface DuplicateGroup {
  id: string
  primary_candidate: DuplicateCandidate
  duplicate_candidates: DuplicateCandidate[]
  confidence: number
  match_reason: "phone" | "name" | "dni" | "compound"
  detected_at: string
  resolution_status: "pending" | "resolved"
  resolved_at: string | null
  resolution_action: "merged" | "linked" | "dismissed" | null
}

interface CandidateRow {
  id: string
  full_name: string
  dni: string | null
  phone: string
  phone_normalized: string
  last_contacted_at: string | null
  status: string
  is_duplicate: boolean
  duplicate_of: string | null
  dedup_reviewed: boolean
  created_at: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Determine match reason based on candidate data
 */
function determineMatchReason(
  primary: CandidateRow,
  duplicate: CandidateRow
): "phone" | "name" | "dni" | "compound" {
  const phoneMatch = primary.phone_normalized === duplicate.phone_normalized
  const dniMatch = primary.dni && duplicate.dni && primary.dni === duplicate.dni
  const nameMatch = primary.full_name.toLowerCase() === duplicate.full_name.toLowerCase()

  if (phoneMatch && dniMatch) return "compound"
  if (dniMatch) return "dni"
  if (phoneMatch) return "phone"
  return "name"
}

/**
 * Calculate confidence based on match type
 */
function calculateConfidence(matchReason: "phone" | "name" | "dni" | "compound"): number {
  switch (matchReason) {
    case "compound": return 0.99
    case "dni": return 0.95
    case "phone": return 0.90
    case "name": return 0.70
    default: return 0.60
  }
}

// =============================================================================
// GET /api/duplicates
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    // Get filter parameters
    const status = searchParams.get("status") ?? "pending" // "pending" | "resolved" | "all"

    // Fetch all candidates marked as duplicates
    let query = supabase
      .from("candidates")
      .select("id, full_name, dni, phone, phone_normalized, last_contacted_at, status, is_duplicate, duplicate_of, dedup_reviewed, created_at")
      .eq("is_duplicate", true)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    // Filter by review status
    if (status === "pending") {
      query = query.eq("dedup_reviewed", false)
    } else if (status === "resolved") {
      query = query.eq("dedup_reviewed", true)
    }

    const { data: duplicateCandidates, error } = await query

    if (error) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 500 }
      )
    }

    if (!duplicateCandidates || duplicateCandidates.length === 0) {
      return NextResponse.json({
        success: true,
        data: [],
        meta: {
          total: 0,
          pending: 0,
          resolved: 0,
        },
      })
    }

    // Get the primary candidates (the ones duplicates point to)
    const primaryIds = [...new Set(duplicateCandidates
      .filter(c => c.duplicate_of)
      .map(c => c.duplicate_of as string))]

    let primaryCandidatesMap = new Map<string, CandidateRow>()

    if (primaryIds.length > 0) {
      const { data: primaries } = await supabase
        .from("candidates")
        .select("id, full_name, dni, phone, phone_normalized, last_contacted_at, status, is_duplicate, duplicate_of, dedup_reviewed, created_at")
        .in("id", primaryIds)
        .is("deleted_at", null)

      if (primaries) {
        primaries.forEach(p => primaryCandidatesMap.set(p.id, p as CandidateRow))
      }
    }

    // Group duplicates by their primary candidate
    const groupsMap = new Map<string, {
      primary: CandidateRow
      duplicates: CandidateRow[]
    }>()

    for (const duplicate of duplicateCandidates) {
      const primaryId = duplicate.duplicate_of

      if (primaryId && primaryCandidatesMap.has(primaryId)) {
        const primary = primaryCandidatesMap.get(primaryId)!
        if (!groupsMap.has(primaryId)) {
          groupsMap.set(primaryId, { primary, duplicates: [] })
        }
        groupsMap.get(primaryId)!.duplicates.push(duplicate as CandidateRow)
      } else {
        // If no primary reference, this duplicate is standalone - make it its own group
        if (!groupsMap.has(duplicate.id)) {
          groupsMap.set(duplicate.id, {
            primary: duplicate as CandidateRow,
            duplicates: []
          })
        }
      }
    }

    // Transform to DuplicateGroup format
    const groups: DuplicateGroup[] = []
    let groupIndex = 1

    for (const [primaryId, group] of groupsMap) {
      const matchReason = group.duplicates.length > 0
        ? determineMatchReason(group.primary, group.duplicates[0])
        : "name"
      const confidence = calculateConfidence(matchReason)

      // Determine resolution status based on dedup_reviewed
      const allReviewed = group.duplicates.every(d => d.dedup_reviewed)
      const resolutionStatus = allReviewed ? "resolved" : "pending"

      groups.push({
        id: `group-${groupIndex++}`,
        primary_candidate: {
          id: group.primary.id,
          full_name: group.primary.full_name,
          dni: group.primary.dni,
          phone: group.primary.phone,
          last_contacted_at: group.primary.last_contacted_at,
          status: group.primary.status,
        },
        duplicate_candidates: group.duplicates.map(d => ({
          id: d.id,
          full_name: d.full_name,
          dni: d.dni,
          phone: d.phone,
          last_contacted_at: d.last_contacted_at,
          status: d.status,
        })),
        confidence,
        match_reason: matchReason,
        detected_at: group.duplicates[0]?.created_at ?? group.primary.created_at,
        resolution_status: resolutionStatus,
        resolved_at: null, // Would need additional tracking in DB
        resolution_action: null,
      })
    }

    // Calculate stats
    const pending = groups.filter(g => g.resolution_status === "pending").length
    const resolved = groups.filter(g => g.resolution_status === "resolved").length

    return NextResponse.json({
      success: true,
      data: groups,
      meta: {
        total: groups.length,
        pending,
        resolved,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al obtener duplicados" },
      { status: 500 }
    )
  }
}
