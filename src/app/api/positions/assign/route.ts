/**
 * API endpoint to assign a position to a recruiter
 * POST /api/positions/assign
 */

import { NextRequest, NextResponse } from 'next/server';
import { createClient, createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';

// =============================================================================
// POST /api/positions/assign
// =============================================================================

export async function POST(request: NextRequest) {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  try {
    const supabase = await createClient();
    const body = await request.json();

    const { position_id, recruiter_id } = body;

    if (!position_id || !recruiter_id) {
      return NextResponse.json(
        { success: false, error: 'Se requiere position_id y recruiter_id' },
        { status: 400 }
      );
    }

    // 1. Verify position exists and get current recruiter for audit
    const { data: position, error: posError } = await supabase
      .from('positions')
      .select('id, title, recruiter_id, recruiter_name, status')
      .eq('id', position_id)
      .is('deleted_at', null)
      .single();

    if (posError || !position) {
      return NextResponse.json(
        { success: false, error: 'Posición no encontrada' },
        { status: 404 }
      );
    }

    // Store previous values for audit log (for reassignment tracking)
    const previousRecruiterId = position.recruiter_id;
    const previousRecruiterName = position.recruiter_name;

    // 2. Verify recruiter exists and is active
    const { data: recruiter, error: recError } = await supabase
      .from('recruiters')
      .select('id, name, is_active')
      .eq('id', recruiter_id)
      .is('deleted_at', null)
      .single();

    if (recError || !recruiter) {
      return NextResponse.json(
        { success: false, error: 'Reclutador no encontrado' },
        { status: 404 }
      );
    }

    if (!recruiter.is_active) {
      return NextResponse.json(
        { success: false, error: 'El reclutador no está activo' },
        { status: 409 }
      );
    }

    // 3. Update position with recruiter assignment
    const { error: updateError } = await supabase
      .from('positions')
      .update({
        recruiter_id: recruiter_id,
        recruiter_name: recruiter.name,
        status: 'in_progress',
        assigned_at: new Date().toISOString(),
      })
      .eq('id', position_id);

    if (updateError) {
      return NextResponse.json(
        { success: false, error: updateError.message },
        { status: 500 }
      );
    }

    // 4. Log to audit using service role to bypass RLS
    const serviceClient = createServiceRoleClient();
    const { error: auditError } = await serviceClient.from('audit_log').insert({
      actor_id: user.id,
      actor_type: 'user',
      action: 'UPDATE',
      action_category: 'positions',
      entity_type: 'positions',
      entity_id: position_id,
      previous_values: {
        recruiter_id: previousRecruiterId,
        recruiter_name: previousRecruiterName,
      },
      new_values: {
        recruiter_id: recruiter_id,
        recruiter_name: recruiter.name,
      },
    });

    if (auditError) {
    } else {
    }

    return NextResponse.json({
      success: true,
      data: {
        position_id,
        recruiter_id,
        recruiter_name: recruiter.name,
      },
      message: `Posición asignada a ${recruiter.name}`,
    });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error al asignar posición' },
      { status: 500 }
    );
  }
}
