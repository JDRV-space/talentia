"use client"

import * as React from "react"
import {
  AlertTriangle,
  Loader2,
  Merge,
  Link2,
  X,
  ChevronDown,
  ChevronUp,
  Phone,
  User,
  CheckCircle,
} from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import type {
  DuplicateResolutionAction,
  DuplicateDisplayInfo,
  ResolveDuplicateResponse,
} from "@/types/dedup"

// =============================================================================
// TIPOS
// =============================================================================

interface DuplicateResolutionPanelProps {
  /** ID del candidato maestro (el que se esta creando/editando) */
  masterId?: string
  /** Informacion del duplicado detectado */
  duplicate: DuplicateDisplayInfo
  /** Callback cuando se resuelve el duplicado */
  onResolved?: (action: DuplicateResolutionAction, response: ResolveDuplicateResponse) => void
  /** Callback para cerrar/descartar sin accion */
  onDismissPanel?: () => void
  /** Modo compacto para mostrar en-linea */
  compact?: boolean
  /** Clase CSS adicional */
  className?: string
}

interface ResolutionState {
  isLoading: boolean
  action: DuplicateResolutionAction | null
  error: string | null
  success: boolean
}

// =============================================================================
// CONSTANTES
// =============================================================================

const RESOLUTION_ACTIONS: {
  action: DuplicateResolutionAction
  label: string
  description: string
  icon: typeof Merge
  variant: "default" | "secondary" | "outline"
  colorClass: string
}[] = [
  {
    action: "merge",
    label: "Fusionar",
    description: "Combinar registros",
    icon: Merge,
    variant: "default",
    colorClass: "bg-teal-600 hover:bg-teal-700 text-white",
  },
  {
    action: "link",
    label: "Vincular",
    description: "Marcar como relacionados",
    icon: Link2,
    variant: "secondary",
    colorClass: "bg-sky-100 hover:bg-sky-200 text-sky-800 dark:bg-sky-900 dark:hover:bg-sky-800 dark:text-sky-200",
  },
  {
    action: "dismiss",
    label: "Descartar",
    description: "No es duplicado",
    icon: X,
    variant: "outline",
    colorClass: "",
  },
]

// =============================================================================
// COMPONENTE PRINCIPAL
// =============================================================================

export function DuplicateResolutionPanel({
  masterId,
  duplicate,
  onResolved,
  onDismissPanel,
  compact = false,
  className,
}: DuplicateResolutionPanelProps) {
  const [state, setState] = React.useState<ResolutionState>({
    isLoading: false,
    action: null,
    error: null,
    success: false,
  })
  const [isExpanded, setIsExpanded] = React.useState(!compact)

  // Resolver duplicado via API
  const handleResolve = async (action: DuplicateResolutionAction) => {
    if (!masterId) {
      // Si no hay masterId, significa que es un candidato nuevo
      // Solo podemos descartar el warning
      if (action === "dismiss" && onDismissPanel) {
        onDismissPanel()
      }
      return
    }

    setState({ isLoading: true, action, error: null, success: false })

    try {
      const response = await fetch(`/api/candidates/${masterId}/resolve-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicate_candidate_id: duplicate.id,
          action,
        }),
      })

      const data = await response.json()

      if (!response.ok || !data.success) {
        setState({
          isLoading: false,
          action: null,
          error: data.error || "Error al resolver duplicado",
          success: false,
        })
        return
      }

      setState({ isLoading: false, action, error: null, success: true })

      if (onResolved) {
        onResolved(action, data as ResolveDuplicateResponse)
      }
    } catch {
      setState({
        isLoading: false,
        action: null,
        error: "Error de conexion. Intente nuevamente.",
        success: false,
      })
    }
  }

  // Renderizar badge de confianza
  const renderConfidenceBadge = () => {
    const confidence = Math.round(duplicate.confianza)
    let colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"

    if (confidence >= 95) {
      colorClass = "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200"
    } else if (confidence >= 85) {
      colorClass = "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200"
    }

    return (
      <Badge variant="secondary" className={cn("ml-2", colorClass)}>
        {confidence}% confianza
      </Badge>
    )
  }

  // Renderizar tipo de coincidencia
  const renderMatchType = () => {
    const labels: Record<typeof duplicate.tipo_coincidencia, string> = {
      phone: "Telefono coincide",
      name: "Nombre similar",
      phone_and_name: "Telefono y nombre",
    }

    return (
      <span className="text-sm text-muted-foreground">
        {labels[duplicate.tipo_coincidencia]}
      </span>
    )
  }

  // Si se resolvio exitosamente, mostrar mensaje de exito
  if (state.success) {
    const actionLabels: Record<DuplicateResolutionAction, string> = {
      merge: "Registros fusionados",
      link: "Registros vinculados",
      dismiss: "Duplicado descartado",
    }

    return (
      <div className={cn(
        "rounded-md border border-lime-200 bg-lime-50 p-3 dark:border-lime-800 dark:bg-lime-900/20",
        className
      )}>
        <div className="flex items-center gap-2">
          <CheckCircle className="h-5 w-5 text-lime-600 dark:text-lime-400" />
          <span className="text-sm font-medium text-lime-800 dark:text-lime-300">
            {state.action ? actionLabels[state.action] : "Resuelto"} exitosamente
          </span>
        </div>
      </div>
    )
  }

  return (
    <div
      className={cn(
        "rounded-md border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20",
        compact ? "p-2" : "p-3",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-start gap-2">
        <AlertTriangle
          className={cn(
            "shrink-0 text-amber-600 dark:text-amber-400",
            compact ? "h-4 w-4 mt-0.5" : "h-5 w-5"
          )}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center flex-wrap gap-1">
              <span
                className={cn(
                  "font-medium text-amber-800 dark:text-amber-300",
                  compact ? "text-xs" : "text-sm"
                )}
              >
                Posible duplicado detectado
              </span>
              {renderConfidenceBadge()}
            </div>
            {compact && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0 shrink-0"
                onClick={() => setIsExpanded(!isExpanded)}
              >
                {isExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>

          {/* Informacion del duplicado */}
          <div
            className={cn(
              "mt-1",
              compact ? "text-xs" : "text-sm",
              "text-amber-700 dark:text-amber-400"
            )}
          >
            <div className="flex items-center gap-2">
              <User className="h-3.5 w-3.5" />
              <span className="font-semibold">{duplicate.nombre_completo}</span>
            </div>
            <div className="flex items-center gap-2 mt-0.5">
              <Phone className="h-3.5 w-3.5" />
              <span>{duplicate.telefono}</span>
              {duplicate.dni && (
                <span className="text-muted-foreground">
                  | DNI: {duplicate.dni}
                </span>
              )}
            </div>
          </div>

          {/* Detalles expandidos */}
          {(isExpanded || !compact) && (
            <div className="mt-2 space-y-2">
              {/* Tags de coincidencia */}
              <div className="flex flex-wrap gap-1.5">
                {renderMatchType()}
                {duplicate.detalles.coincidencia_fonetica && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200 text-xs"
                  >
                    Coincidencia fonetica
                  </Badge>
                )}
                {duplicate.detalles.similitud_nombre > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-amber-200 text-amber-800 dark:bg-amber-800 dark:text-amber-200 text-xs"
                  >
                    Similitud: {Math.round(duplicate.detalles.similitud_nombre)}%
                  </Badge>
                )}
                {duplicate.veces_contratado > 0 && (
                  <Badge
                    variant="secondary"
                    className="bg-lime-200 text-lime-800 dark:bg-lime-800 dark:text-lime-200 text-xs"
                  >
                    Contratado {duplicate.veces_contratado}x
                  </Badge>
                )}
              </div>

              {/* Error si existe */}
              {state.error && (
                <div className="text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-900/20 p-2 rounded">
                  {state.error}
                </div>
              )}

              {/* Botones de accion */}
              <div className={cn(
                "flex gap-2 pt-1",
                compact ? "flex-wrap" : ""
              )}>
                {RESOLUTION_ACTIONS.map(({ action, label, icon: Icon, variant, colorClass }) => {
                  const isCurrentAction = state.action === action && state.isLoading

                  // Si no hay masterId, solo mostrar el boton de descartar
                  if (!masterId && action !== "dismiss") {
                    return null
                  }

                  return (
                    <Button
                      key={action}
                      variant={variant}
                      size="sm"
                      className={cn(
                        compact ? "h-7 text-xs" : "h-8",
                        colorClass,
                        isCurrentAction && "opacity-75"
                      )}
                      onClick={() => handleResolve(action)}
                      disabled={state.isLoading}
                    >
                      {isCurrentAction ? (
                        <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <Icon className="h-3.5 w-3.5 mr-1.5" />
                      )}
                      {label}
                    </Button>
                  )
                })}
              </div>

              {/* Nota informativa */}
              {!masterId && (
                <p className="text-xs text-muted-foreground mt-1">
                  Guarde el candidato primero para poder fusionar o vincular
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default DuplicateResolutionPanel
