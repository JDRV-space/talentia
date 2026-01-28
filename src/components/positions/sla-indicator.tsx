"use client"

import * as React from "react"
import { Clock, AlertTriangle, Check, AlertCircle } from "lucide-react"
import { differenceInDays, parseISO, format, addDays } from "date-fns"
import { es } from "date-fns/locale"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  getWorkflowSlaTotalDays,
  type PositionWorkflowStatus,
} from "@/types/constants"

// =============================================================================
// TYPES
// =============================================================================

export interface SlaStatus {
  isDelayed: boolean
  isWarning: boolean // Near deadline (>75% of SLA)
  isCompleted: boolean
  daysElapsed: number
  daysRemaining: number | null // null if completed or overdue
  daysOverdue: number | null // null if not overdue
  percentUsed: number
  slaTarget: number
}

interface SlaIndicatorProps {
  /** Estado actual del workflow */
  workflowStatus: PositionWorkflowStatus
  /** Fecha de apertura de la posicion (ISO string) */
  openedAt: string
  /** Variante de visualizacion */
  variant?: "badge" | "progress" | "compact"
  /** Mostrar tooltips con detalles */
  showTooltip?: boolean
  /** Clase CSS adicional */
  className?: string
}

interface SlaProgressBarProps {
  slaStatus: SlaStatus
  className?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Calcula el estado del SLA para una posicion
 */
export function calculateSlaStatus(
  workflowStatus: PositionWorkflowStatus,
  openedAt: string
): SlaStatus {
  const slaTarget = getWorkflowSlaTotalDays(workflowStatus)
  const daysElapsed = differenceInDays(new Date(), parseISO(openedAt))

  // Estado final completado
  if (workflowStatus === "contratado") {
    return {
      isDelayed: daysElapsed > slaTarget,
      isWarning: false,
      isCompleted: true,
      daysElapsed,
      daysRemaining: null,
      daysOverdue: daysElapsed > slaTarget ? daysElapsed - slaTarget : null,
      percentUsed: slaTarget > 0 ? Math.round((daysElapsed / slaTarget) * 100) : 100,
      slaTarget,
    }
  }

  const daysRemaining = Math.max(0, slaTarget - daysElapsed)
  const isDelayed = daysElapsed > slaTarget
  const percentUsed = slaTarget > 0 ? Math.round((daysElapsed / slaTarget) * 100) : 0
  const isWarning = !isDelayed && percentUsed >= 75

  return {
    isDelayed,
    isWarning,
    isCompleted: false,
    daysElapsed,
    daysRemaining: isDelayed ? null : daysRemaining,
    daysOverdue: isDelayed ? daysElapsed - slaTarget : null,
    percentUsed: Math.min(percentUsed, 100),
    slaTarget,
  }
}

/**
 * Obtiene el color base para el indicador SLA
 */
function getSlaColor(slaStatus: SlaStatus): "rose" | "amber" | "teal" | "lime" {
  if (slaStatus.isCompleted && !slaStatus.isDelayed) return "lime"
  if (slaStatus.isDelayed) return "rose"
  if (slaStatus.isWarning) return "amber"
  return "teal"
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function SlaProgressBar({ slaStatus, className }: SlaProgressBarProps) {
  const color = getSlaColor(slaStatus)

  const colorClasses: Record<string, string> = {
    rose: "bg-rose-500",
    amber: "bg-amber-500",
    teal: "bg-teal-500",
    lime: "bg-lime-500",
  }

  return (
    <div
      className={cn(
        "w-full h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden",
        className
      )}
    >
      <div
        className={cn(
          "h-full rounded-full transition-all",
          colorClasses[color],
          slaStatus.isDelayed && "animate-pulse"
        )}
        style={{ width: `${Math.min(slaStatus.percentUsed, 100)}%` }}
      />
    </div>
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SlaIndicator({
  workflowStatus,
  openedAt,
  variant = "badge",
  showTooltip = true,
  className,
}: SlaIndicatorProps) {
  const slaStatus = calculateSlaStatus(workflowStatus, openedAt)
  const color = getSlaColor(slaStatus)

  // Render functions for each variant
  const renderBadge = () => {
    const colorClasses: Record<string, string> = {
      rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
      amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
      teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
      lime: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800",
    }

    let label: string
    let icon: React.ReactNode

    if (slaStatus.isCompleted) {
      label = slaStatus.isDelayed ? `+${slaStatus.daysOverdue}d` : "Completado"
      icon = slaStatus.isDelayed ? <AlertTriangle className="h-3 w-3" /> : <Check className="h-3 w-3" />
    } else if (slaStatus.isDelayed) {
      label = `+${slaStatus.daysOverdue}d`
      icon = <AlertTriangle className="h-3 w-3" />
    } else if (slaStatus.daysRemaining !== null) {
      label = `${slaStatus.daysRemaining}d`
      icon = slaStatus.isWarning ? <AlertCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />
    } else {
      label = "-"
      icon = <Clock className="h-3 w-3" />
    }

    return (
      <Badge
        variant="outline"
        className={cn("gap-1", colorClasses[color], className)}
      >
        {icon}
        {label}
      </Badge>
    )
  }

  const renderProgress = () => {
    let label: string
    if (slaStatus.isDelayed && slaStatus.daysOverdue !== null) {
      label = `+${slaStatus.daysOverdue}d de retraso`
    } else if (slaStatus.daysRemaining !== null) {
      label = `${slaStatus.daysRemaining}d restantes`
    } else {
      label = "Completado"
    }

    return (
      <div className={cn("space-y-1", className)}>
        <div className="flex items-center justify-between">
          <span
            className={cn(
              "text-xs font-medium",
              color === "rose" && "text-rose-600 dark:text-rose-400",
              color === "amber" && "text-amber-600 dark:text-amber-400",
              color === "teal" && "text-teal-600 dark:text-teal-400",
              color === "lime" && "text-lime-600 dark:text-lime-400"
            )}
          >
            {label}
          </span>
          <span className="text-xs text-muted-foreground">
            {slaStatus.daysElapsed}/{slaStatus.slaTarget}d
          </span>
        </div>
        <SlaProgressBar slaStatus={slaStatus} />
      </div>
    )
  }

  const renderCompact = () => {
    const colorClasses: Record<string, string> = {
      rose: "text-rose-600 dark:text-rose-400",
      amber: "text-amber-600 dark:text-amber-400",
      teal: "text-teal-600 dark:text-teal-400",
      lime: "text-lime-600 dark:text-lime-400",
    }

    let label: string
    if (slaStatus.isDelayed && slaStatus.daysOverdue !== null) {
      label = `+${slaStatus.daysOverdue}d`
    } else if (slaStatus.daysRemaining !== null) {
      label = `${slaStatus.daysRemaining}d`
    } else {
      label = "OK"
    }

    return (
      <div className={cn("flex items-center gap-1.5", className)}>
        {slaStatus.isDelayed ? (
          <AlertTriangle className={cn("h-3.5 w-3.5", colorClasses[color])} />
        ) : slaStatus.isWarning ? (
          <AlertCircle className={cn("h-3.5 w-3.5", colorClasses[color])} />
        ) : slaStatus.isCompleted ? (
          <Check className={cn("h-3.5 w-3.5", colorClasses[color])} />
        ) : (
          <Clock className={cn("h-3.5 w-3.5", colorClasses[color])} />
        )}
        <span className={cn("text-xs font-medium", colorClasses[color])}>
          {label}
        </span>
      </div>
    )
  }

  // Select renderer based on variant
  const content = variant === "badge"
    ? renderBadge()
    : variant === "progress"
    ? renderProgress()
    : renderCompact()

  // Wrap with tooltip if enabled
  if (!showTooltip) return content

  const deadlineDate = addDays(parseISO(openedAt), slaStatus.slaTarget)

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div>{content}</div>
        </TooltipTrigger>
        <TooltipContent>
          <div className="space-y-1 text-xs">
            <div className="font-medium">
              {slaStatus.isDelayed
                ? "SLA excedido"
                : slaStatus.isWarning
                ? "Cerca del limite"
                : slaStatus.isCompleted
                ? "Proceso completado"
                : "En tiempo"}
            </div>
            <div className="text-muted-foreground">
              Días transcurridos: {slaStatus.daysElapsed}
            </div>
            <div className="text-muted-foreground">
              SLA objetivo: {slaStatus.slaTarget} días
            </div>
            <div className="text-muted-foreground">
              Fecha límite: {format(deadlineDate, "dd MMM yyyy", { locale: es })}
            </div>
            {slaStatus.isDelayed && slaStatus.daysOverdue !== null && (
              <div className="text-rose-600 dark:text-rose-400 font-medium">
                Retraso: {slaStatus.daysOverdue} días
              </div>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

// =============================================================================
// HELPER COMPONENT FOR FILTERING
// =============================================================================

/**
 * Determina si una posicion esta retrasada segun su estado workflow y fecha
 */
export function isPositionDelayed(
  workflowStatus: PositionWorkflowStatus,
  openedAt: string
): boolean {
  const slaStatus = calculateSlaStatus(workflowStatus, openedAt)
  return slaStatus.isDelayed
}
