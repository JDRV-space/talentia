import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

/**
 * SECURITY: Allowlist of valid redirect paths after authentication
 * Prevents open redirect attacks (OWASP A01:2021)
 */
const ALLOWED_REDIRECT_PATHS = [
  '/panel',
  '/reclutadores',
  '/asignaciones',
  '/candidatos',
  '/posiciones',
  '/campanas',
  '/pronostico',
  '/subir',
  '/duplicados',
  '/configuracion',
]

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/panel'

  // SECURITY: Validate redirect path against allowlist to prevent open redirect
  const safePath = ALLOWED_REDIRECT_PATHS.includes(next) ? next : '/panel'

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(`${origin}${safePath}`)
    }
  }

  // Redirect to login on error
  return NextResponse.redirect(`${origin}/login?error=auth`)
}
