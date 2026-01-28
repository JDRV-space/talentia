/**
 * Utilidades de autenticacion para API routes
 * Usa Supabase auth para verificar sesion del usuario
 */

import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import type { User } from '@supabase/supabase-js'

/**
 * Resultado de la verificacion de autenticacion
 */
export interface AuthResult {
  user: User | null
  error: string | null
}

/**
 * Obtiene el usuario autenticado desde la sesion de Supabase
 * @returns {Promise<AuthResult>} Usuario autenticado o error
 */
export async function getAuthenticatedUser(): Promise<AuthResult> {
  const supabase = await createClient()
  const { data: { user }, error } = await supabase.auth.getUser()

  if (error || !user) {
    return { user: null, error: 'No autorizado' }
  }

  return { user, error: null }
}

/**
 * Respuesta de error de autenticacion
 */
export interface UnauthorizedError {
  success: false
  error: string
}

/**
 * Respuesta estandar para solicitudes no autorizadas
 * @template T - Tipo de respuesta para compatibilidad de tipos
 * @returns {NextResponse} Respuesta 401 con mensaje en espanol
 */
export function unauthorizedResponse<T = UnauthorizedError>(): NextResponse<T | UnauthorizedError> {
  return NextResponse.json(
    { success: false, error: 'No autorizado. Inicia sesion.' },
    { status: 401 }
  )
}
