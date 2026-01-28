/**
 * API endpoint for individual position operations
 * GET /api/positions/[id] - Get position by ID
 * PUT /api/positions/[id] - Update position
 * DELETE /api/positions/[id] - Soft delete position
 */

import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { ZONES } from "@/types/constants"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const updatePositionSchema = z.object({
  title: z.string().min(3).max(255).optional(),
  zone: z.enum(ZONES).optional(),
  priority: z.enum(["P1", "P2", "P3"] as const).optional(),
  level: z.string().min(1).optional(),
  headcount: z.number().int().positive().optional(),
  status: z.enum(["open", "in_progress", "filled", "cancelled", "on_hold"]).optional(),
  description: z.string().max(2000).optional(),
  campaign_id: z.string().uuid().nullable().optional(),
})

// =============================================================================
// GET /api/positions/[id]
// =============================================================================

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: position, error } = await supabase
      .from("positions")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (error || !position) {
      return NextResponse.json(
        { success: false, error: "Posicion no encontrada" },
        { status: 404 }
      )
    }

    return NextResponse.json({
      success: true,
      data: position,
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al obtener posicion" },
      { status: 500 }
    )
  }
}

// =============================================================================
// PUT /api/positions/[id]
// =============================================================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const { id } = await params
    const supabase = await createClient()
    const body = await request.json()

    // Validate request body
    const validationResult = updatePositionSchema.safeParse(body)
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

    const updateData = validationResult.data

    // Check if position exists
    const { data: existing, error: fetchError } = await supabase
      .from("positions")
      .select("*")
      .eq("id", id)
      .is("deleted_at", null)
      .single()

    if (fetchError || !existing) {
      return NextResponse.json(
        { success: false, error: "Posicion no encontrada" },
        { status: 404 }
      )
    }

    // Build update object (only include provided fields)
    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }

    if (updateData.title !== undefined) updates.title = updateData.title
    if (updateData.zone !== undefined) updates.zone = updateData.zone
    if (updateData.priority !== undefined) {
      updates.priority = updateData.priority
      updates.is_urgent = updateData.priority === "P1"
    }
    if (updateData.level !== undefined) updates.level = updateData.level
    if (updateData.headcount !== undefined) updates.headcount = updateData.headcount
    if (updateData.status !== undefined) {
      updates.status = updateData.status
      // Set closed_at if status is filled or cancelled
      if (updateData.status === "filled" || updateData.status === "cancelled") {
        updates.closed_at = new Date().toISOString()
      }
    }
    if (updateData.description !== undefined) updates.description = updateData.description
    if (updateData.campaign_id !== undefined) updates.campaign_id = updateData.campaign_id

    // Update position
    const { data: updatedPosition, error: updateError } = await supabase
      .from("positions")
      .update(updates)
      .eq("id", id)
      .select()
      .single()

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      )
    }

    // Log to audit_log
    await supabase.from("audit_log").insert({
      actor_type: "user",
      actor_id: user.id,
      action: "update",
      entity_type: "position",
      entity_id: id,
      old_values: existing,
      new_values: updateData,
    })

    return NextResponse.json({
      success: true,
      data: updatedPosition,
      message: "Posicion actualizada exitosamente",
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al actualizar posicion" },
      { status: 500 }
    )
  }
}

// =============================================================================
// DELETE /api/positions/[id] (Soft Delete)
// =============================================================================

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { user } = await getAuthenticatedUser()
  if (!user) return unauthorizedResponse()

  try {
    const { id } = await params
    const supabase = await createClient()

    // Soft delete by setting deleted_at
    const { data, error } = await supabase
      .from("positions")
      .update({
        deleted_at: new Date().toISOString(),
        status: "cancelled",
      })
      .eq("id", id)
      .is("deleted_at", null)
      .select()
      .single()

    if (error || !data) {
      return NextResponse.json(
        { success: false, error: "Posicion no encontrada" },
        { status: 404 }
      )
    }

    // Log to audit_log
    await supabase.from("audit_log").insert({
      actor_type: "user",
      actor_id: user.id,
      action: "delete",
      entity_type: "position",
      entity_id: id,
    })

    return NextResponse.json({
      success: true,
      message: "Posicion eliminada exitosamente",
    })
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error al eliminar posicion" },
      { status: 500 }
    )
  }
}
