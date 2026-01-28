"use client"

import * as React from "react"
import { ArrowUpDown, Eye, Pencil, UserPlus, RefreshCw } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  PRIORITY_LEVELS,
  POSITION_WORKFLOW_STATUS,
  type PriorityLevel,
  type PositionWorkflowStatus,
} from "@/types/constants"
import type { PositionSummary, RecruiterSummary } from "@/types/database"
import { SlaIndicator, isPositionDelayed } from "./sla-indicator"
import { CompactTimeline } from "./position-timeline"
import { StatusChangeDialog, type StatusChangeData } from "./status-change-dialog"

// =============================================================================
// TYPES
// =============================================================================

type SortColumn = "title" | "zone" | "priority" | "workflow_status" | "sla"
type SortDirection = "asc" | "desc"

/**
 * Posicion extendida con estado de workflow
 * En una implementacion real, esto vendria de la base de datos
 */
export interface PositionWithWorkflow extends PositionSummary {
  workflow_status: PositionWorkflowStatus
  recruiter?: RecruiterSummary
}

interface PositionsTableEnhancedProps {
  positions: PositionWithWorkflow[]
  onView?: (position: PositionWithWorkflow) => void
  onEdit?: (position: PositionWithWorkflow) => void
  onAssign?: (position: PositionWithWorkflow) => void
  onStatusChange?: (data: StatusChangeData) => void | Promise<void>
  isLoading?: boolean
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getPriorityBadgeClasses(priority: PriorityLevel): string {
  const colorMap: Record<PriorityLevel, string> = {
    P1: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
    P2: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    P3: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/50 dark:text-stone-400 dark:border-stone-700",
  }
  return colorMap[priority]
}

function sortPositions(
  positions: PositionWithWorkflow[],
  column: SortColumn,
  direction: SortDirection
): PositionWithWorkflow[] {
  return [...positions].sort((a, b) => {
    let comparison = 0

    switch (column) {
      case "title":
        comparison = a.title.localeCompare(b.title)
        break
      case "zone":
        comparison = a.zone.localeCompare(b.zone)
        break
      case "priority":
        comparison = a.priority.localeCompare(b.priority)
        break
      case "workflow_status":
        comparison = POSITION_WORKFLOW_STATUS[a.workflow_status].order -
                     POSITION_WORKFLOW_STATUS[b.workflow_status].order
        break
      case "sla":
        // Sort by delayed first, then by days open
        const aDelayed = isPositionDelayed(a.workflow_status, a.opened_at)
        const bDelayed = isPositionDelayed(b.workflow_status, b.opened_at)
        if (aDelayed !== bDelayed) {
          comparison = aDelayed ? -1 : 1
        } else {
          comparison = a.days_open - b.days_open
        }
        break
    }

    return direction === "asc" ? comparison : -comparison
  })
}

// =============================================================================
// SUBCOMPONENTS
// =============================================================================

interface SortableHeaderProps {
  column: SortColumn
  children: React.ReactNode
  onSort: (column: SortColumn) => void
}

function SortableHeader({ column, children, onSort }: SortableHeaderProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => onSort(column)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PositionsTableEnhanced({
  positions,
  onView,
  onEdit,
  onAssign,
  onStatusChange,
  isLoading = false,
}: PositionsTableEnhancedProps) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("priority")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")
  const [statusChangePosition, setStatusChangePosition] = React.useState<PositionWithWorkflow | null>(null)

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sortedPositions = sortPositions(positions, sortColumn, sortDirection)

  const handleStatusChangeClick = (position: PositionWithWorkflow) => {
    setStatusChangePosition(position)
  }

  const handleStatusChangeSubmit = async (data: StatusChangeData) => {
    if (onStatusChange) {
      await onStatusChange(data)
    }
    setStatusChangePosition(null)
  }

  return (
    <>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[200px]">
                <SortableHeader column="title" onSort={handleSort}>Puesto</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="zone" onSort={handleSort}>Zona</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="priority" onSort={handleSort}>Prioridad</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="workflow_status" onSort={handleSort}>Estado</SortableHeader>
              </TableHead>
              <TableHead>Reclutador</TableHead>
              <TableHead>
                <SortableHeader column="sla" onSort={handleSort}>SLA</SortableHeader>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center">
                  <div className="flex items-center justify-center gap-2 text-muted-foreground">
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Cargando posiciones...
                  </div>
                </TableCell>
              </TableRow>
            ) : sortedPositions.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  No hay posiciones para mostrar
                </TableCell>
              </TableRow>
            ) : (
              sortedPositions.map((position) => {
                const isDelayed = isPositionDelayed(position.workflow_status, position.opened_at)

                return (
                  <TableRow
                    key={position.id}
                    className={cn(isDelayed && "bg-rose-50/50 dark:bg-rose-900/10")}
                  >
                    <TableCell className="font-medium">
                      <div>
                        <div className="flex items-center gap-2">
                          {position.title}
                          {isDelayed && (
                            <span className="inline-block w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {position.filled_count}/{position.headcount} cubiertos
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{position.zone}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={cn("font-semibold", getPriorityBadgeClasses(position.priority))}
                      >
                        {PRIORITY_LEVELS[position.priority].label_short}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <CompactTimeline
                        currentStatus={position.workflow_status}
                        openedAt={position.opened_at}
                      />
                    </TableCell>
                    <TableCell>
                      {position.recruiter ? (
                        <span className="text-sm">{position.recruiter.name}</span>
                      ) : (
                        <span className="text-sm text-muted-foreground italic">Sin asignar</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <SlaIndicator
                        workflowStatus={position.workflow_status}
                        openedAt={position.opened_at}
                        variant="badge"
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onView?.(position)}
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit?.(position)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        {/* Status change button */}
                        {position.workflow_status !== "contratado" && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => handleStatusChangeClick(position)}
                            title="Cambiar estado"
                            className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/30"
                          >
                            <RefreshCw className="h-4 w-4" />
                          </Button>
                        )}
                        {/* Assign button */}
                        {!position.recruiter && (
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onAssign?.(position)}
                            title="Asignar reclutador"
                            className="text-amber-600 hover:text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-900/30"
                          >
                            <UserPlus className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>

      {/* Status Change Dialog */}
      {statusChangePosition && (
        <StatusChangeDialog
          open={!!statusChangePosition}
          onOpenChange={(open) => !open && setStatusChangePosition(null)}
          positionId={statusChangePosition.id}
          positionTitle={statusChangePosition.title}
          currentStatus={statusChangePosition.workflow_status}
          onStatusChange={handleStatusChangeSubmit}
        />
      )}
    </>
  )
}
