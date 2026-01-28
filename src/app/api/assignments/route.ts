import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient, createServiceRoleClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import {
  autoAssignPositions,
  getAssignmentStats,
  type AutoAssignmentResult,
} from "@/lib/algorithms"
import type { Recruiter, Position } from "@/types/database"

// =============================================================================
// VALIDATION SCHEMAS
// =============================================================================

const autoAssignRequestSchema = z.object({
  position_id: z.string().uuid().optional(),
  position_ids: z.array(z.string().uuid()).optional(),
  force: z.boolean().default(false),
}).refine(
  (data) => data.position_id || (data.position_ids && data.position_ids.length > 0),
  { message: "Debe proporcionar position_id o position_ids" }
)

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Formatea el resultado de asignacion para respuesta API
 */
function formatAssignmentResponse(
  assignment: AutoAssignmentResult,
  recruiters: Recruiter[]
) {
  const recruiter = recruiters.find((r) => r.id === assignment.recruiter_id)

  return {
    position_id: assignment.position_id,
    recruiter_id: assignment.recruiter_id,
    recruiter_name: recruiter?.name ?? "Desconocido",
    score: assignment.score,
    score_breakdown: assignment.score_breakdown,
    explanation_es: assignment.explanation_es,
    assignment_type: assignment.assignment_type,
    status: assignment.status,
    current_stage: assignment.current_stage,
    assigned_at: assignment.assigned_at,
  }
}

// =============================================================================
// GET /api/assignments - List assignments
// =============================================================================

export async function GET(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const positionId = searchParams.get("position_id")
    const recruiterId = searchParams.get("recruiter_id")
    const status = searchParams.get("status")
    const page = parseInt(searchParams.get("page") ?? "1", 10)
    const perPage = parseInt(searchParams.get("per_page") ?? "50", 10)

    // Build query with recruiter join for name
    // Use explicit FK hint to resolve ambiguity (assignments has recruiter_id AND reassigned_from)
    let query = supabase
      .from("assignments")
      .select(`
        *,
        recruiters!assignments_recruiter_id_fkey (id, name, email, primary_zone),
        positions (id, title, zone, priority, headcount)
      `, { count: "exact" })
      .order("created_at", { ascending: false })

    if (positionId) {
      query = query.eq("position_id", positionId)
    }

    if (recruiterId) {
      query = query.eq("recruiter_id", recruiterId)
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

    // Format response with recruiter names
    const formattedAssignments = (data ?? []).map((a: any) => ({
      id: a.id,
      position_id: a.position_id,
      recruiter_id: a.recruiter_id,
      recruiter_name: a.recruiters?.name ?? "Desconocido",
      position_title: a.positions?.title ?? "Desconocido",
      position_zone: a.positions?.zone ?? null,
      score: a.score,
      score_breakdown: a.score_breakdown,
      explanation_es: a.explanation_es,
      assignment_type: a.assignment_type,
      status: a.status,
      current_stage: a.current_stage,
      assigned_at: a.assigned_at ?? a.created_at,
    }))

    return NextResponse.json({
      success: true,
      data: formattedAssignments,
      meta: {
        total: count ?? 0,
        page,
        per_page: perPage,
      },
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al obtener asignaciones" },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST /api/assignments - Auto-assign positions
// =============================================================================

export async function POST(request: NextRequest) {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const supabase = await createClient()
    // Service role client for operations that bypass RLS (inserts, RPC calls)
    const supabaseAdmin = createServiceRoleClient()
    const body = await request.json()

    // Validate request body
    const validationResult = autoAssignRequestSchema.safeParse(body)
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

    const { position_id, position_ids, force } = validationResult.data

    // Fetch active recruiters from Supabase
    const { data: recruiters, error: recruitersError } = await supabase
      .from("recruiters")
      .select("*")
      .eq("is_active", true)
      .is("deleted_at", null)

    if (recruitersError) {
      return NextResponse.json(
        { success: false, error: recruitersError.message },
        { status: 500 }
      )
    }

    if (!recruiters || recruiters.length === 0) {
      return NextResponse.json(
        { success: false, error: "No hay reclutadores activos disponibles" },
        { status: 409 }
      )
    }

    // Get positions to assign
    let positionsToAssign: Position[]

    if (position_id) {
      // Single position assignment
      const { data: position, error: positionError } = await supabase
        .from("positions")
        .select("*")
        .eq("id", position_id)
        .is("deleted_at", null)
        .single()

      if (positionError || !position) {
        return NextResponse.json(
          { success: false, error: "Posicion no encontrada" },
          { status: 404 }
        )
      }

      // Check if already assigned (unless force=true)
      if (!force && position.status !== "open") {
        return NextResponse.json(
          {
            success: false,
            error: "Esta posicion ya esta asignada. Use force=true para reasignar.",
          },
          { status: 409 }
        )
      }

      positionsToAssign = [position as Position]
    } else {
      // Multiple positions assignment
      const requestedIds = position_ids ?? []

      let positionsQuery = supabase
        .from("positions")
        .select("*")
        .in("id", requestedIds)
        .is("deleted_at", null)

      if (!force) {
        positionsQuery = positionsQuery.eq("status", "open")
      }

      const { data: positions, error: positionsError } = await positionsQuery

      if (positionsError) {
        return NextResponse.json(
          { success: false, error: positionsError.message },
          { status: 500 }
        )
      }

      if (!positions || positions.length === 0) {
        return NextResponse.json(
          {
            success: false,
            error: "No se encontraron posiciones validas para asignar",
          },
          { status: 404 }
        )
      }

      positionsToAssign = positions as Position[]
    }

    // Execute assignment algorithm
    const assignments = autoAssignPositions(
      recruiters as Recruiter[],
      positionsToAssign
    )

    if (assignments.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "No hay reclutadores elegibles disponibles. Todos estan en capacidad maxima o no cumplen los requisitos.",
        },
        { status: 409 }
      )
    }

    // STEP 1: Reserve capacity FIRST using batch atomic increment (single transaction, no race window)
    // This must happen BEFORE inserting assignments to prevent over-capacity assignments
    const recruiterLoadUpdates = new Map<string, number>()
    for (const assignment of assignments) {
      const current = recruiterLoadUpdates.get(assignment.recruiter_id) ?? 0
      recruiterLoadUpdates.set(assignment.recruiter_id, current + 1)
    }

    // Prepare arrays for batch RPC call (eliminates race window between individual increments)
    const recruiterIds = Array.from(recruiterLoadUpdates.keys())
    const increments = Array.from(recruiterLoadUpdates.values())

    // Single atomic transaction for all capacity reservations (using service role to bypass RLS)
    const { data: batchResult, error: batchError } = await supabaseAdmin.rpc(
      "reserve_batch_capacity",
      { p_recruiter_ids: recruiterIds, p_increments: increments }
    )

    if (batchError) {
      return NextResponse.json(
        { success: false, error: "Error al reservar capacidad de reclutadores" },
        { status: 500 }
      )
    }

    // Parse batch results to identify failed reservations
    const capacityReservations: { recruiterId: string; increment: number; success: boolean }[] = []
    const failedRecruiters = new Set<string>()

    const results = (batchResult as { recruiter_id: string; success: boolean; new_load: number }[]) || []
    for (const result of results) {
      const increment = recruiterLoadUpdates.get(result.recruiter_id) ?? 0
      capacityReservations.push({
        recruiterId: result.recruiter_id,
        increment,
        success: result.success
      })
      if (!result.success) {
        failedRecruiters.add(result.recruiter_id)
      }
    }

    // Filter out assignments to recruiters who are at capacity
    const validAssignments = assignments.filter(a => !failedRecruiters.has(a.recruiter_id))

    if (validAssignments.length === 0) {
      // Rollback any successful capacity reservations
      for (const reservation of capacityReservations) {
        if (reservation.success) {
          await supabaseAdmin.rpc("decrement_recruiter_load", {
            p_recruiter_id: reservation.recruiterId,
            p_decrement: reservation.increment,
          })
        }
      }
      return NextResponse.json(
        {
          success: false,
          error: "No hay reclutadores con capacidad disponible. Todos los reclutadores elegibles estan al limite.",
        },
        { status: 409 }
      )
    }

    // STEP 2: Insert only valid assignments (capacity already reserved)
    const assignmentsToInsert = validAssignments.map((a) => ({
      position_id: a.position_id,
      recruiter_id: a.recruiter_id,
      score: a.score,
      score_breakdown: a.score_breakdown,
      explanation_es: a.explanation_es,
      assignment_type: a.assignment_type,
      status: a.status,
      current_stage: a.current_stage,
      assigned_at: a.assigned_at,
    }))

    const { data: insertedAssignments, error: insertError } = await supabaseAdmin
      .from("assignments")
      .insert(assignmentsToInsert)
      .select()

    if (insertError) {
      // Rollback capacity reservations on insert failure
      for (const reservation of capacityReservations) {
        if (reservation.success) {
          await supabaseAdmin.rpc("decrement_recruiter_load", {
            p_recruiter_id: reservation.recruiterId,
            p_decrement: reservation.increment,
          })
        }
      }
      return NextResponse.json(
        { success: false, error: insertError.message },
        { status: 500 }
      )
    }

    // STEP 3: Update position statuses to 'assigned'
    const positionIdsToUpdate = validAssignments.map((a) => a.position_id)
    const { error: positionUpdateError } = await supabaseAdmin
      .from("positions")
      .update({ status: "assigned", assigned_at: new Date().toISOString() })
      .in("id", positionIdsToUpdate)

    // Log position update errors but don't fail the whole operation
    // (assignments are already created, capacity reserved)
    let positionUpdateWarning: string | null = null
    if (positionUpdateError) {
      positionUpdateWarning = `Asignaciones creadas pero hubo error actualizando estado de posiciones: ${positionUpdateError.message}`
    }

    // Calculate statistics using validAssignments (only those that were actually assigned)
    const positionsAssigned = positionsToAssign.filter(p =>
      validAssignments.some(a => a.position_id === p.id)
    )
    const stats = getAssignmentStats(validAssignments, positionsAssigned)

    // Format response using validAssignments
    const formattedAssignments = (insertedAssignments ?? validAssignments).map((a: any) => ({
      id: a.id,
      position_id: a.position_id,
      recruiter_id: a.recruiter_id,
      recruiter_name: recruiters.find((r: any) => r.id === a.recruiter_id)?.name ?? "Desconocido",
      score: a.score,
      score_breakdown: a.score_breakdown,
      explanation_es: a.explanation_es,
      assignment_type: a.assignment_type,
      status: a.status,
      current_stage: a.current_stage,
      assigned_at: a.assigned_at,
    }))

    // Track failed assignments (recruiters at capacity)
    const failedAssignments = assignments.filter(a => failedRecruiters.has(a.recruiter_id))

    // Log to audit_log (using service role for insert permission)
    await supabaseAdmin.from("audit_log").insert({
      actor_type: "system",
      actor_id: user.id,
      action: "assign",
      entity_type: "assignment",
      details: {
        assignments_count: formattedAssignments.length,
        failed_count: failedAssignments.length,
        position_ids: positionIdsToUpdate,
        failed_recruiter_ids: Array.from(failedRecruiters),
        stats,
      },
    })

    // Build response message in Spanish
    let message: string
    if (failedAssignments.length > 0) {
      message = `${formattedAssignments.length} posicion(es) asignada(s). ${failedAssignments.length} no asignada(s) por capacidad de reclutador.`
    } else if (formattedAssignments.length === 1) {
      message = `Posicion asignada exitosamente a ${formattedAssignments[0].recruiter_name}`
    } else {
      message = `${formattedAssignments.length} posiciones asignadas exitosamente`
    }

    return NextResponse.json(
      {
        success: true,
        data: formattedAssignments,
        stats: {
          total_assigned: stats.total,
          total_failed: failedAssignments.length,
          average_score: stats.avgScore,
          by_priority: stats.byPriority,
        },
        message,
        // Include warning if position status update failed
        ...(positionUpdateWarning && { warning: positionUpdateWarning }),
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al crear asignaciones" },
      { status: 500 }
    )
  }
}
