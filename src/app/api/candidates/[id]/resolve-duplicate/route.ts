import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"

import { createClient } from "@/lib/supabase/server"
import { getAuthenticatedUser, unauthorizedResponse } from "@/lib/auth"
import type { Candidate } from "@/types/database"
import type {
  DuplicateResolutionAction,
  ResolveDuplicateResponse,
  ResolveDuplicateError,
} from "@/types/dedup"

// =============================================================================
// VALIDATION SCHEMA
// =============================================================================

const resolveDuplicateSchema = z.object({
  duplicate_candidate_id: z.string().uuid(),
  action: z.enum(["merge", "link", "dismiss"]),
  notes: z.string().max(1000).optional(),
})

// =============================================================================
// TIPOS INTERNOS
// =============================================================================

interface RouteContext {
  params: Promise<{ id: string }>
}

// =============================================================================
// FUNCIONES DE RESOLUCION
// =============================================================================

/**
 * Fusiona dos candidatos, manteniendo el registro maestro
 * y actualizando el duplicado como referencia
 */
async function mergeCandidates(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  masterId: string,
  duplicateId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error?: string; merged?: Partial<Candidate> }> {
  // Obtener ambos candidatos
  const [masterResult, duplicateResult] = await Promise.all([
    supabase
      .from("candidates")
      .select("*")
      .eq("id", masterId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("candidates")
      .select("*")
      .eq("id", duplicateId)
      .is("deleted_at", null)
      .single(),
  ])

  if (masterResult.error || !masterResult.data) {
    return { success: false, error: "Candidato principal no encontrado" }
  }

  if (duplicateResult.error || !duplicateResult.data) {
    return { success: false, error: "Candidato duplicado no encontrado" }
  }

  const master = masterResult.data as Candidate
  const duplicate = duplicateResult.data as Candidate

  // Fusionar datos: preferir datos del maestro, excepto campos vacios
  const mergedData: Partial<Candidate> = {
    // Usar email del duplicado si el maestro no tiene
    email: master.email || duplicate.email,
    // Usar DNI del duplicado si el maestro no tiene
    dni: master.dni || duplicate.dni,
    // Usar zona del duplicado si el maestro no tiene
    zone: master.zone || duplicate.zone,
    // Usar direccion del duplicado si el maestro no tiene
    address: master.address || duplicate.address,
    // Combinar notas
    notes: [master.notes, duplicate.notes, notes].filter(Boolean).join("\n---\n") || null,
    // Combinar tags sin duplicados
    tags: [...new Set([...(master.tags || []), ...(duplicate.tags || [])])],
    // Sumar veces contratado
    times_hired: (master.times_hired || 0) + (duplicate.times_hired || 0),
    // Usar la fecha de contratacion mas reciente
    last_hired_at: master.last_hired_at && duplicate.last_hired_at
      ? master.last_hired_at > duplicate.last_hired_at
        ? master.last_hired_at
        : duplicate.last_hired_at
      : master.last_hired_at || duplicate.last_hired_at,
    // Usar la fecha de contacto mas reciente
    last_contacted_at: master.last_contacted_at && duplicate.last_contacted_at
      ? master.last_contacted_at > duplicate.last_contacted_at
        ? master.last_contacted_at
        : duplicate.last_contacted_at
      : master.last_contacted_at || duplicate.last_contacted_at,
  }

  // Actualizar el candidato maestro con datos fusionados
  const { error: updateMasterError } = await supabase
    .from("candidates")
    .update({
      ...mergedData,
      updated_at: new Date().toISOString(),
    })
    .eq("id", masterId)

  if (updateMasterError) {
    return { success: false, error: `Error al actualizar maestro: ${updateMasterError.message}` }
  }

  // Marcar el duplicado como tal
  const { error: updateDuplicateError } = await supabase
    .from("candidates")
    .update({
      is_duplicate: true,
      duplicate_of: masterId,
      dedup_reviewed: true,
      dedup_reviewed_at: new Date().toISOString(),
      dedup_reviewed_by: userId,
      status: "inactive",
      notes: duplicate.notes
        ? `${duplicate.notes}\n---\nFusionado con ${master.full_name} (${masterId})`
        : `Fusionado con ${master.full_name} (${masterId})`,
      updated_at: new Date().toISOString(),
    })
    .eq("id", duplicateId)

  if (updateDuplicateError) {
    return { success: false, error: `Error al marcar duplicado: ${updateDuplicateError.message}` }
  }

  // Registrar en audit_log
  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: userId,
    action: "merge",
    action_category: "dedup",
    entity_type: "candidate",
    entity_id: masterId,
    details: {
      accion: "fusion",
      candidato_maestro: masterId,
      candidato_duplicado: duplicateId,
      datos_fusionados: mergedData,
    },
    previous_values: { master, duplicate },
    new_values: mergedData,
  })

  return { success: true, merged: mergedData }
}

/**
 * Vincula dos candidatos como relacionados
 * (misma persona, diferentes datos de contacto)
 */
async function linkCandidates(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  masterId: string,
  relatedId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  // Verificar que ambos candidatos existen
  const [masterResult, relatedResult] = await Promise.all([
    supabase
      .from("candidates")
      .select("id, full_name")
      .eq("id", masterId)
      .is("deleted_at", null)
      .single(),
    supabase
      .from("candidates")
      .select("id, full_name, notes")
      .eq("id", relatedId)
      .is("deleted_at", null)
      .single(),
  ])

  if (masterResult.error || !masterResult.data) {
    return { success: false, error: "Candidato principal no encontrado" }
  }

  if (relatedResult.error || !relatedResult.data) {
    return { success: false, error: "Candidato relacionado no encontrado" }
  }

  const master = masterResult.data
  const related = relatedResult.data

  // Marcar el candidato relacionado con referencia al maestro
  // Nota: No lo marcamos como is_duplicate=true porque es un vinculo, no un duplicado
  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      duplicate_of: masterId, // Vinculo al registro principal
      dedup_reviewed: true,
      dedup_reviewed_at: new Date().toISOString(),
      dedup_reviewed_by: userId,
      notes: [
        related.notes,
        notes,
        `Vinculado como relacionado de ${master.full_name} (${masterId})`,
      ].filter(Boolean).join("\n---\n"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", relatedId)

  if (updateError) {
    return { success: false, error: `Error al vincular: ${updateError.message}` }
  }

  // Registrar en audit_log
  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: userId,
    action: "update",
    action_category: "dedup",
    entity_type: "candidate",
    entity_id: relatedId,
    details: {
      accion: "vinculacion",
      candidato_principal: masterId,
      candidato_vinculado: relatedId,
      notas: notes,
    },
  })

  return { success: true }
}

/**
 * Descarta un posible duplicado como falso positivo
 */
async function dismissDuplicate(
  supabase: ReturnType<typeof createClient> extends Promise<infer T> ? T : never,
  masterId: string,
  dismissedId: string,
  userId: string,
  notes?: string
): Promise<{ success: boolean; error?: string }> {
  // Verificar que el candidato existe
  const { data: candidate, error: fetchError } = await supabase
    .from("candidates")
    .select("id, full_name, notes")
    .eq("id", dismissedId)
    .is("deleted_at", null)
    .single()

  if (fetchError || !candidate) {
    return { success: false, error: "Candidato no encontrado" }
  }

  // Marcar como revisado sin duplicado
  const { error: updateError } = await supabase
    .from("candidates")
    .update({
      is_duplicate: false,
      duplicate_of: null,
      dedup_reviewed: true,
      dedup_reviewed_at: new Date().toISOString(),
      dedup_reviewed_by: userId,
      notes: [
        candidate.notes,
        notes,
        `Falso positivo descartado - No es duplicado de ${masterId}`,
      ].filter(Boolean).join("\n---\n"),
      updated_at: new Date().toISOString(),
    })
    .eq("id", dismissedId)

  if (updateError) {
    return { success: false, error: `Error al descartar: ${updateError.message}` }
  }

  // Registrar en audit_log
  await supabase.from("audit_log").insert({
    actor_type: "user",
    actor_id: userId,
    action: "update",
    action_category: "dedup",
    entity_type: "candidate",
    entity_id: dismissedId,
    details: {
      accion: "descarte_falso_positivo",
      candidato_principal: masterId,
      candidato_descartado: dismissedId,
      notas: notes,
    },
  })

  return { success: true }
}

// =============================================================================
// POST /api/candidates/[id]/resolve-duplicate
// =============================================================================

export async function POST(
  request: NextRequest,
  context: RouteContext
): Promise<NextResponse<ResolveDuplicateResponse | ResolveDuplicateError>> {
  try {
    const { user } = await getAuthenticatedUser()
    if (!user) return unauthorizedResponse()

    const params = await context.params
    const masterId = params.id

    // Validar UUID del maestro
    if (!masterId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(masterId)) {
      return NextResponse.json(
        { success: false, error: "ID de candidato invalido" },
        { status: 400 }
      )
    }

    const body = await request.json()

    // Validar request body
    const validationResult = resolveDuplicateSchema.safeParse(body)
    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: "Datos invalidos",
          detalles: validationResult.error.flatten().fieldErrors.toString(),
        },
        { status: 400 }
      )
    }

    const { duplicate_candidate_id, action, notes } = validationResult.data
    const supabase = await createClient()

    // Obtener informacion de ambos candidatos para la respuesta
    const [masterResult, duplicateResult] = await Promise.all([
      supabase
        .from("candidates")
        .select("id, full_name, phone")
        .eq("id", masterId)
        .is("deleted_at", null)
        .single(),
      supabase
        .from("candidates")
        .select("id, full_name, phone")
        .eq("id", duplicate_candidate_id)
        .is("deleted_at", null)
        .single(),
    ])

    if (masterResult.error || !masterResult.data) {
      return NextResponse.json(
        { success: false, error: "Candidato principal no encontrado" },
        { status: 404 }
      )
    }

    if (duplicateResult.error || !duplicateResult.data) {
      return NextResponse.json(
        { success: false, error: "Candidato duplicado no encontrado" },
        { status: 404 }
      )
    }

    const master = masterResult.data
    const duplicate = duplicateResult.data

    // Ejecutar accion correspondiente
    let result: { success: boolean; error?: string; merged?: Partial<Candidate> }

    switch (action) {
      case "merge":
        result = await mergeCandidates(supabase, masterId, duplicate_candidate_id, user.id, notes)
        break
      case "link":
        result = await linkCandidates(supabase, masterId, duplicate_candidate_id, user.id, notes)
        break
      case "dismiss":
        result = await dismissDuplicate(supabase, masterId, duplicate_candidate_id, user.id, notes)
        break
      default:
        return NextResponse.json(
          { success: false, error: "Accion no reconocida" },
          { status: 400 }
        )
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "Error al procesar la solicitud" },
        { status: 500 }
      )
    }

    // Construir mensaje de exito segun la accion
    const actionMessages: Record<DuplicateResolutionAction, string> = {
      merge: `Candidatos fusionados exitosamente. ${master.full_name} es ahora el registro principal.`,
      link: `Candidatos vinculados exitosamente como registros relacionados.`,
      dismiss: `Falso positivo descartado. Los candidatos no estan relacionados.`,
    }

    const response: ResolveDuplicateResponse = {
      success: true,
      mensaje: actionMessages[action],
      accion_realizada: action,
      candidato_principal: {
        id: master.id,
        nombre_completo: master.full_name,
        telefono: master.phone,
      },
      candidato_secundario: {
        id: duplicate.id,
        nombre_completo: duplicate.full_name,
        telefono: duplicate.phone,
      },
    }

    if (action === "merge" && result.merged) {
      response.datos_fusionados = result.merged
    }

    return NextResponse.json(response)
  } catch (error) {
    return NextResponse.json(
      { success: false, error: "Error interno del servidor" },
      { status: 500 }
    )
  }
}
