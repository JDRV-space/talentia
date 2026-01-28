"use client"

import * as React from "react"
import { ArrowUpDown, Eye, Pencil, UserPlus } from "lucide-react"

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
  POSITION_STATUS,
  ZONES,
  type PriorityLevel,
  type PositionStatus,
  type Zone,
} from "@/types/constants"
import type { PositionSummary, RecruiterSummary } from "@/types/database"

// =============================================================================
// TYPES
// =============================================================================

type SortColumn = "title" | "zone" | "priority" | "status" | "sla_days"
type SortDirection = "asc" | "desc"

interface PositionsTableProps {
  positions: (PositionSummary & { recruiter?: RecruiterSummary })[]
  onView?: (position: PositionSummary) => void
  onEdit?: (position: PositionSummary) => void
  onAssign?: (position: PositionSummary) => void
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

function getStatusBadgeClasses(status: PositionStatus): string {
  const config = POSITION_STATUS[status]
  const colorMap: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
    amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
    lime: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800",
    stone: "bg-stone-100 text-stone-600 border-stone-200 dark:bg-stone-800/50 dark:text-stone-400 dark:border-stone-700",
    rose: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
  }
  return colorMap[config.color] || colorMap.stone
}

function calculateSlaProgress(position: PositionSummary): { percent: number; label: string; isOverdue: boolean } {
  if (!position.sla_deadline) {
    return { percent: 0, label: "-", isOverdue: false }
  }

  const now = new Date()
  const deadline = new Date(position.sla_deadline)
  const opened = new Date(position.opened_at)

  const totalTime = deadline.getTime() - opened.getTime()
  const elapsedTime = now.getTime() - opened.getTime()

  const percent = Math.round((elapsedTime / totalTime) * 100)
  const isOverdue = now > deadline

  if (isOverdue) {
    const daysOverdue = Math.ceil((now.getTime() - deadline.getTime()) / (1000 * 60 * 60 * 24))
    return { percent: 100, label: `+${daysOverdue}d`, isOverdue: true }
  }

  const daysRemaining = Math.ceil((deadline.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
  return { percent: Math.min(percent, 100), label: `${daysRemaining}d`, isOverdue: false }
}

function sortPositions(
  positions: (PositionSummary & { recruiter?: RecruiterSummary })[],
  column: SortColumn,
  direction: SortDirection
): (PositionSummary & { recruiter?: RecruiterSummary })[] {
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
      case "status":
        comparison = a.status.localeCompare(b.status)
        break
      case "sla_days":
        comparison = a.sla_days - b.sla_days
        break
    }

    return direction === "asc" ? comparison : -comparison
  })
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PositionsTable({
  positions,
  onView,
  onEdit,
  onAssign,
}: PositionsTableProps) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("priority")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sortedPositions = sortPositions(positions, sortColumn, sortDirection)

  const SortableHeader = ({ column, children }: { column: SortColumn; children: React.ReactNode }) => (
    <Button
      variant="ghost"
      size="sm"
      className="-ml-3 h-8 data-[state=open]:bg-accent"
      onClick={() => handleSort(column)}
    >
      {children}
      <ArrowUpDown className="ml-2 h-4 w-4" />
    </Button>
  )

  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-[250px]">
              <SortableHeader column="title">Puesto</SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="zone">Zona</SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="priority">Prioridad</SortableHeader>
            </TableHead>
            <TableHead>
              <SortableHeader column="status">Estado</SortableHeader>
            </TableHead>
            <TableHead>Reclutador</TableHead>
            <TableHead>
              <SortableHeader column="sla_days">SLA</SortableHeader>
            </TableHead>
            <TableHead className="text-right">Acciones</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedPositions.length === 0 ? (
            <TableRow>
              <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                No hay posiciones para mostrar
              </TableCell>
            </TableRow>
          ) : (
            sortedPositions.map((position) => {
              const sla = calculateSlaProgress(position)

              return (
                <TableRow key={position.id}>
                  <TableCell className="font-medium">
                    <div>
                      <div>{position.title}</div>
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
                    <Badge
                      variant="outline"
                      className={getStatusBadgeClasses(position.status)}
                    >
                      {POSITION_STATUS[position.status].label}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    {position.recruiter ? (
                      <span className="text-sm">{position.recruiter.name}</span>
                    ) : (
                      <span className="text-sm text-muted-foreground italic">Sin asignar</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-2 bg-stone-200 dark:bg-stone-700 rounded-full overflow-hidden">
                        <div
                          className={cn(
                            "h-full rounded-full transition-all",
                            sla.isOverdue
                              ? "bg-rose-500"
                              : sla.percent > 75
                              ? "bg-amber-500"
                              : "bg-teal-500"
                          )}
                          style={{ width: `${sla.percent}%` }}
                        />
                      </div>
                      <span
                        className={cn(
                          "text-xs font-medium",
                          sla.isOverdue ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                        )}
                      >
                        {sla.label}
                      </span>
                    </div>
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
                      {!position.recruiter && (
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onAssign?.(position)}
                          title="Asignar reclutador"
                          className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/30"
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
  )
}

