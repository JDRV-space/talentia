import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { ZONES, PRIORITY_LEVELS } from "@/types/constants"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const createPositionSchema = z.object({
  title: z.string().min(3).max(255),
  zone: z.enum(ZONES),
  priority: z.enum(["P1", "P2", "P3"] as const),
  level: z.string().min(1),
  headcount: z.number().int().positive(),
  description: z.string().max(2000).optional(),
  campaign_id: z.string().uuid().optional(),
})

// =============================================================================
// GET /api/positions
// =============================================================================

export async function GET(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const supabase = await createClient()
    const { searchParams } = new URL(request.url)

    const status = searchParams.get("status")
    const zone = searchParams.get("zone")
    const priority = searchParams.get("priority")
    const excludeClosed = searchParams.get("exclude_closed") === "true"
    const unassigned = searchParams.get("unassigned") === "true"
    const page = parseInt(searchParams.get("page") ?? "1", 10)
    const perPage = parseInt(searchParams.get("per_page") ?? "10", 10)

    let query = supabase
      .from("positions")
      .select("*", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })

    // Filter for positions that haven't been assigned yet (for Auto-Assign)
    // These are positions with recruitable statuses AND no recruiter assigned.
    // A position is considered "unassigned" if:
    // - status is open or in_progress (not filled/cancelled)
    // - recruiter_id IS NULL (no RESPONSABLE in Excel, not manually assigned)
    // NO DATE RESTRICTION: Show ALL unassigned positions regardless of age.
    // Historical positions from CONSOLIDADO may have old opened_at dates but still need assignment.
    // Positions from CONSOLIDADO with RESPONSABLE column have recruiter_id set,
    // meaning they're already assigned and should NOT appear in Auto-Assign.
    if (unassigned) {
      query = query
        .in("status", ["open", "in_progress"])
        .is("recruiter_id", null)
    }

    // Exclude filled and cancelled positions (show only active ones)
    if (excludeClosed) {
      query = query.in("status", ["open", "in_progress", "interviewing", "on_hold"])
    }

    if (status && !unassigned) {
      // Don't apply status filter if unassigned is true (it has its own status filter)
      query = query.eq("status", status)
    }

    if (zone) {
      query = query.eq("zone", zone)
    }

    if (priority) {
      query = query.eq("priority", priority)
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
      { success: false, error: "Error al obtener posiciones" },
      { status: 500 }
    )
  }
}

// =============================================================================
// POST /api/positions
// =============================================================================

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validationResult = createPositionSchema.safeParse(body)
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

    // Calculate SLA deadline based on priority
    const sla_days = PRIORITY_LEVELS[data.priority].sla_days
    const sla_deadline = new Date()
    sla_deadline.setDate(sla_deadline.getDate() + sla_days)

    // Insert new position
    const { data: newPosition, error: insertError } = await supabase
      .from("positions")
      .insert({
        title: data.title,
        zone: data.zone,
        priority: data.priority,
        level: data.level,
        headcount: data.headcount,
        description: data.description ?? null,
        campaign_id: data.campaign_id ?? null,
        status: "open",
        sla_days,
        sla_deadline: sla_deadline.toISOString(),
        opened_at: new Date().toISOString(),
        filled_count: 0,
        is_urgent: data.priority === "P1",
        source: "manual",
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
      entity_type: "position",
      entity_id: newPosition.id,
      new_values: data,
    })

    return NextResponse.json(
      {
        success: true,
        data: newPosition,
        message: "Posicion creada exitosamente",
      },
      { status: 201 }
    )
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al crear posicion" },
      { status: 500 }
    )
  }
}
