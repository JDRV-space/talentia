"use client"

import * as React from "react"
import { Check, Clock, AlertTriangle } from "lucide-react"
import { format, differenceInDays, parseISO } from "date-fns"
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
  POSITION_WORKFLOW_STATUS,
  type PositionWorkflowStatus,
} from "@/types/constants"

// =============================================================================
// TYPES
// =============================================================================

/**
 * Representa una transicion de estado en el historial
 */
export interface StatusTransition {
  status: PositionWorkflowStatus
  entered_at: string // ISO timestamp
  exited_at: string | null // ISO timestamp, null si es el estado actual
  notes: string | null
}

interface PositionTimelineProps {
  /** Estado actual del workflow */
  currentStatus: PositionWorkflowStatus
  /** Fecha de apertura de la posicion */
  openedAt: string
  /** Historial de transiciones (opcional) */
  transitions?: StatusTransition[]
  /** Orientacion del timeline */
  orientation?: "horizontal" | "vertical"
  /** Mostrar detalles de SLA */
  showSlaDetails?: boolean
  /** Clase CSS adicional */
  className?: string
}

interface TimelineStepProps {
  status: PositionWorkflowStatus
  isActive: boolean
  isCompleted: boolean
  isDelayed: boolean
  daysInStage: number | null
  enteredAt: string | null
  slaTarget: number
  orientation: "horizontal" | "vertical"
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Obtiene las clases CSS para el color de un estado
 */
function getStatusColorClasses(status: PositionWorkflowStatus, isActive: boolean): string {
  const config = POSITION_WORKFLOW_STATUS[status]
  const colorMap: Record<string, { bg: string; border: string; text: string }> = {
    sky: {
      bg: isActive ? "bg-sky-500" : "bg-sky-100 dark:bg-sky-900/30",
      border: "border-sky-500",
      text: isActive ? "text-white" : "text-sky-700 dark:text-sky-400",
    },
    amber: {
      bg: isActive ? "bg-amber-500" : "bg-amber-100 dark:bg-amber-900/30",
      border: "border-amber-500",
      text: isActive ? "text-white" : "text-amber-700 dark:text-amber-400",
    },
    teal: {
      bg: isActive ? "bg-teal-500" : "bg-teal-100 dark:bg-teal-900/30",
      border: "border-teal-500",
      text: isActive ? "text-white" : "text-teal-700 dark:text-teal-400",
    },
    lime: {
      bg: isActive ? "bg-lime-500" : "bg-lime-100 dark:bg-lime-900/30",
      border: "border-lime-500",
      text: isActive ? "text-white" : "text-lime-700 dark:text-lime-400",
    },
  }
  return colorMap[config.color]
    ? `${colorMap[config.color].bg} ${colorMap[config.color].text}`
    : "bg-stone-200 text-stone-600"
}

/**
 * Calcula los dias transcurridos en una etapa
 */
function calculateDaysInStage(
  enteredAt: string | null,
  exitedAt: string | null
): number | null {
  if (!enteredAt) return null
  const start = parseISO(enteredAt)
  const end = exitedAt ? parseISO(exitedAt) : new Date()
  return differenceInDays(end, start)
}

/**
 * Construye el estado de cada etapa del timeline basado en el historial
 */
function buildTimelineState(
  currentStatus: PositionWorkflowStatus,
  openedAt: string,
  transitions?: StatusTransition[]
) {
  const statuses: PositionWorkflowStatus[] = ['vacante', 'proceso', 'seleccionado', 'contratado']
  const currentIndex = statuses.indexOf(currentStatus)

  return statuses.map((status, index) => {
    const config = POSITION_WORKFLOW_STATUS[status]
    const transition = transitions?.find(t => t.status === status)

    const isCompleted = index < currentIndex
    const isActive = index === currentIndex

    // Calcular dias en la etapa
    let daysInStage: number | null = null
    let enteredAt: string | null = null

    if (transition) {
      daysInStage = calculateDaysInStage(transition.entered_at, transition.exited_at)
      enteredAt = transition.entered_at
    } else if (isActive && index === 0) {
      // Primera etapa, usar fecha de apertura
      daysInStage = calculateDaysInStage(openedAt, null)
      enteredAt = openedAt
    }

    const isDelayed = daysInStage !== null && daysInStage > config.sla_days && config.sla_days > 0

    return {
      status,
      isCompleted,
      isActive,
      isDelayed,
      daysInStage,
      enteredAt,
      slaTarget: config.sla_days,
    }
  })
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

function TimelineStep({
  status,
  isActive,
  isCompleted,
  isDelayed,
  daysInStage,
  enteredAt,
  slaTarget,
  orientation,
}: TimelineStepProps) {
  const config = POSITION_WORKFLOW_STATUS[status]
  const isPending = !isActive && !isCompleted

  // Determine icon and colors
  let icon: React.ReactNode
  let circleClasses: string

  if (isCompleted) {
    icon = <Check className="h-4 w-4" />
    circleClasses = cn(
      "bg-lime-500 text-white border-lime-500",
      isDelayed && "bg-amber-500 border-amber-500"
    )
  } else if (isActive) {
    if (isDelayed) {
      icon = <AlertTriangle className="h-4 w-4" />
      circleClasses = "bg-rose-500 text-white border-rose-500 animate-pulse"
    } else {
      icon = <Clock className="h-4 w-4" />
      circleClasses = getStatusColorClasses(status, true)
    }
  } else {
    icon = <span className="text-xs font-semibold">{config.order}</span>
    circleClasses = "bg-stone-100 dark:bg-stone-800 text-stone-400 border-stone-300 dark:border-stone-600"
  }

  const stepContent = (
    <div
      className={cn(
        "flex items-center gap-3",
        orientation === "vertical" && "flex-row",
        orientation === "horizontal" && "flex-col"
      )}
    >
      {/* Circle indicator */}
      <div
        className={cn(
          "flex items-center justify-center w-8 h-8 rounded-full border-2 transition-all",
          circleClasses
        )}
      >
        {icon}
      </div>

      {/* Label and info */}
      <div
        className={cn(
          "flex flex-col",
          orientation === "horizontal" && "items-center text-center"
        )}
      >
        <span
          className={cn(
            "text-sm font-medium",
            isActive && "text-foreground",
            isCompleted && "text-foreground",
            isPending && "text-muted-foreground"
          )}
        >
          {config.label}
        </span>

        {/* Days info */}
        {(isActive || isCompleted) && daysInStage !== null && (
          <span
            className={cn(
              "text-xs",
              isDelayed ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"
            )}
          >
            {daysInStage} dia{daysInStage !== 1 ? "s" : ""}
            {isDelayed && slaTarget > 0 && ` (+${daysInStage - slaTarget})`}
          </span>
        )}

        {/* Entry date */}
        {enteredAt && (isActive || isCompleted) && (
          <span className="text-xs text-muted-foreground">
            {format(parseISO(enteredAt), "dd MMM", { locale: es })}
          </span>
        )}
      </div>
    </div>
  )

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(isPending && "opacity-50")}>{stepContent}</div>
        </TooltipTrigger>
        <TooltipContent side={orientation === "horizontal" ? "bottom" : "right"}>
          <div className="space-y-1">
            <p className="font-medium">{config.label}</p>
            <p className="text-xs text-muted-foreground">{config.description}</p>
            {slaTarget > 0 && (
              <p className="text-xs">
                SLA: {slaTarget} dia{slaTarget !== 1 ? "s" : ""}
              </p>
            )}
            {isDelayed && (
              <Badge
                variant="outline"
                className="mt-1 bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
              >
                Excede SLA
              </Badge>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}

function TimelineConnector({
  isCompleted,
  orientation,
}: {
  isCompleted: boolean
  orientation: "horizontal" | "vertical"
}) {
  return (
    <div
      className={cn(
        "transition-colors",
        orientation === "horizontal" && "flex-1 h-0.5 min-w-8",
        orientation === "vertical" && "w-0.5 h-8 ml-[15px]",
        isCompleted
          ? "bg-lime-500"
          : "bg-stone-200 dark:bg-stone-700"
      )}
    />
  )
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function PositionTimeline({
  currentStatus,
  openedAt,
  transitions,
  orientation = "horizontal",
  showSlaDetails = true,
  className,
}: PositionTimelineProps) {
  const timelineState = buildTimelineState(currentStatus, openedAt, transitions)

  // Calculate total days and SLA status
  const totalDays = differenceInDays(new Date(), parseISO(openedAt))
  const hasDelay = timelineState.some(s => s.isDelayed)

  return (
    <div className={cn("space-y-4", className)}>
      {/* Timeline visualization */}
      <div
        className={cn(
          "flex",
          orientation === "horizontal" && "flex-row items-center gap-2",
          orientation === "vertical" && "flex-col gap-0"
        )}
      >
        {timelineState.map((step, index) => (
          <React.Fragment key={step.status}>
            <TimelineStep
              {...step}
              orientation={orientation}
            />
            {index < timelineState.length - 1 && (
              <TimelineConnector
                isCompleted={step.isCompleted}
                orientation={orientation}
              />
            )}
          </React.Fragment>
        ))}
      </div>

      {/* SLA Summary */}
      {showSlaDetails && (
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">
              Tiempo total: <span className="font-medium text-foreground">{totalDays} días</span>
            </span>
          </div>
          {hasDelay && (
            <Badge
              variant="outline"
              className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
            >
              <AlertTriangle className="h-3 w-3 mr-1" />
              SLA excedido
            </Badge>
          )}
          {!hasDelay && currentStatus !== "contratado" && (
            <Badge
              variant="outline"
              className="bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800"
            >
              <Check className="h-3 w-3 mr-1" />
              En tiempo
            </Badge>
          )}
          {currentStatus === "contratado" && (
            <Badge
              variant="outline"
              className="bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800"
            >
              <Check className="h-3 w-3 mr-1" />
              Completado
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

// =============================================================================
// COMPACT TIMELINE (for table rows)
// =============================================================================

interface CompactTimelineProps {
  currentStatus: PositionWorkflowStatus
  openedAt: string
  className?: string
}

/**
 * Version compacta del timeline para usar en filas de tabla
 */
export function CompactTimeline({
  currentStatus,
  openedAt,
  className,
}: CompactTimelineProps) {
  const statuses: PositionWorkflowStatus[] = ['vacante', 'proceso', 'seleccionado', 'contratado']
  const currentIndex = statuses.indexOf(currentStatus)
  const totalDays = differenceInDays(new Date(), parseISO(openedAt))

  // Check if delayed based on accumulated SLA
  const accumulatedSla = statuses
    .slice(0, currentIndex + 1)
    .reduce((total, s) => total + POSITION_WORKFLOW_STATUS[s].sla_days, 0)
  const isDelayed = totalDays > accumulatedSla

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Progress dots */}
      <div className="flex items-center gap-1">
        {statuses.map((status, index) => {
          const isCompleted = index < currentIndex
          const isActive = index === currentIndex
          const config = POSITION_WORKFLOW_STATUS[status]

          let dotColor: string
          if (isCompleted) {
            dotColor = "bg-lime-500"
          } else if (isActive) {
            dotColor = isDelayed
              ? "bg-rose-500 animate-pulse"
              : config.color === "sky"
              ? "bg-sky-500"
              : config.color === "amber"
              ? "bg-amber-500"
              : config.color === "teal"
              ? "bg-teal-500"
              : "bg-lime-500"
          } else {
            dotColor = "bg-stone-300 dark:bg-stone-600"
          }

          return (
            <div
              key={status}
              className={cn(
                "w-2 h-2 rounded-full transition-colors",
                dotColor
              )}
              title={config.label}
            />
          )
        })}
      </div>

      {/* Status label */}
      <span
        className={cn(
          "text-xs font-medium",
          isDelayed ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
        )}
      >
        {POSITION_WORKFLOW_STATUS[currentStatus].label}
      </span>

      {/* Delay indicator */}
      {isDelayed && (
        <AlertTriangle className="h-3 w-3 text-rose-500" />
      )}
    </div>
  )
}
