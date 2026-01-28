/**
 * HIDDEN PAGE - Redirects to /panel
 *
 * This page was hidden as part of the simplification (600 PEN budget, Jan 2026).
 * The original code is preserved in git history.
 * To restore: revert this file from commit history.
 */
import { redirect } from 'next/navigation'

export default function CandidatosPage() {
  redirect('/panel')
}
