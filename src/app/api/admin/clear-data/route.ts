/**
 * Admin endpoint to clear all uploaded data
 * DELETE /api/admin/clear-data
 *
 * IMPORTANT: This endpoint uses the service role client to bypass RLS.
 * The authenticated user's auth.uid() does not match any recruiter ID,
 * so normal RLS policies would block the delete even though it returns 200.
 */

import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import { getAuthenticatedUser, unauthorizedResponse } from '@/lib/auth';

export async function DELETE() {
  const { user } = await getAuthenticatedUser();
  if (!user) return unauthorizedResponse();

  // Verify admin role - only admins can clear all data
  const userRole = user.app_metadata?.role ?? user.user_metadata?.role;
  if (userRole !== 'admin') {
    return NextResponse.json(
      { success: false, error: 'Forbidden. Se requiere rol de administrador.' },
      { status: 403 }
    );
  }

  // Use service role client to bypass RLS policies
  // Regular authenticated client cannot delete due to is_admin() check failing
  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: 'SUPABASE_SERVICE_ROLE_KEY no esta configurado. Obtenlo desde Supabase Dashboard > Settings > API > service_role key.',
        hint: 'Agrega SUPABASE_SERVICE_ROLE_KEY a tu archivo .env.local'
      },
      { status: 500 }
    );
  }

  try {
    // Delete in order respecting FK constraints:
    // 1. assignments (references positions and recruiters)
    // 2. positions (references recruiters)
    // 3. candidates
    // 4. campaigns
    // 5. audit_log (optional cleanup)
    // 6. settings (data_as_of_date)
    // NOTE: Recruiters are PRESERVED to keep active/inactive settings
    const results = {
      assignments: { deleted: 0, error: null as string | null },
      positions: { deleted: 0, error: null as string | null },
      candidates: { deleted: 0, error: null as string | null },
      campaigns: { deleted: 0, error: null as string | null },
      audit_log: { deleted: 0, error: null as string | null },
      settings: { deleted: 0, error: null as string | null },
    };

    // Clear assignments first (FK to positions)
    const { data: assignData, error: assignError } = await supabase
      .from('assignments')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (assignError) {
      results.assignments.error = assignError.message;
    } else {
      results.assignments.deleted = assignData?.length || 0;
    }

    // Clear positions
    const { data: posData, error: posError } = await supabase
      .from('positions')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (posError) {
      results.positions.error = posError.message;
    } else {
      results.positions.deleted = posData?.length || 0;
    }

    // Clear candidates
    const { data: candData, error: candError } = await supabase
      .from('candidates')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (candError) {
      results.candidates.error = candError.message;
    } else {
      results.candidates.deleted = candData?.length || 0;
    }

    // Clear campaigns
    const { data: campData, error: campError } = await supabase
      .from('campaigns')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (campError) {
      results.campaigns.error = campError.message;
    } else {
      results.campaigns.deleted = campData?.length || 0;
    }

    // Note: Recruiters are preserved to keep active/inactive settings
    // They will be matched by name during re-upload

    // Clear audit_log (upload records)
    const { data: auditData, error: auditError } = await supabase
      .from('audit_log')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')
      .select('id');

    if (auditError) {
      results.audit_log.error = auditError.message;
    } else {
      results.audit_log.deleted = auditData?.length || 0;
    }

    // Clear data_as_of_date setting
    const { data: settingsData, error: settingsError } = await supabase
      .from('settings')
      .delete()
      .eq('key', 'data_as_of_date')
      .select('id');

    if (settingsError) {
      results.settings.error = settingsError.message;
    } else {
      results.settings.deleted = settingsData?.length || 0;
    }

    const totalDeleted =
      results.assignments.deleted +
      results.positions.deleted +
      results.candidates.deleted +
      results.campaigns.deleted +
      results.audit_log.deleted +
      results.settings.deleted;

    return NextResponse.json({
      success: true,
      message: `Data cleared successfully. ${totalDeleted} total records deleted.`,
      results,
    });

  } catch (error) {
    return NextResponse.json(
      { success: false, error: 'Error clearing data' },
      { status: 500 }
    );
  }
}
