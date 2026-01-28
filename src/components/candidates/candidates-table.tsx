"use client"

import * as React from "react"
import { ArrowUpDown, Eye, Pencil, AlertTriangle, Copy } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

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
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  CANDIDATE_STATUS,
  type CandidateStatus,
} from "@/types/constants"
import type { CandidateSummary, Candidate } from "@/types/database"
import { formatPhoneForDisplay } from "@/types/schemas"

// =============================================================================
// TYPES - Extended candidate for table display
// =============================================================================

export type CandidateTableRow = CandidateSummary & {
  last_contacted_at: string | null
  is_duplicate: boolean
  duplicate_of: string | null
  contacted_by?: string
}

// =============================================================================
// TYPES
// =============================================================================

type SortColumn = "full_name" | "dni" | "status" | "last_contacted_at"
type SortDirection = "asc" | "desc"

interface CandidatesTableProps {
  candidates: CandidateTableRow[]
  onView?: (candidate: CandidateTableRow) => void
  onEdit?: (candidate: CandidateTableRow) => void
  highlightPhone?: string
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStatusBadgeClasses(status: CandidateStatus): string {
  const config = CANDIDATE_STATUS[status]
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

function formatLastActivity(date: string | null): string {
  if (!date) return "Nunca"

  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: es,
    })
  } catch {
    return "Fecha inválida"
  }
}

function sortCandidates(
  candidates: CandidateTableRow[],
  column: SortColumn,
  direction: SortDirection
): CandidateTableRow[] {
  return [...candidates].sort((a, b) => {
    let comparison = 0

    switch (column) {
      case "full_name":
        comparison = a.full_name.localeCompare(b.full_name)
        break
      case "dni":
        comparison = (a.dni || "").localeCompare(b.dni || "")
        break
      case "status":
        comparison = a.status.localeCompare(b.status)
        break
      case "last_contacted_at":
        const dateA = a.last_contacted_at ? new Date(a.last_contacted_at).getTime() : 0
        const dateB = b.last_contacted_at ? new Date(b.last_contacted_at).getTime() : 0
        comparison = dateA - dateB
        break
    }

    return direction === "asc" ? comparison : -comparison
  })
}

// =============================================================================
// COMPONENT
// =============================================================================

export function CandidatesTable({
  candidates,
  onView,
  onEdit,
  highlightPhone,
}: CandidatesTableProps) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("full_name")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("asc")

  const handleSort = (column: SortColumn) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc")
    } else {
      setSortColumn(column)
      setSortDirection("asc")
    }
  }

  const sortedCandidates = sortCandidates(candidates, sortColumn, sortDirection)

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
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[250px]">
                <SortableHeader column="full_name">Nombre</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="dni">DNI</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="status">Estado</SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="last_contacted_at">Última Actividad</SortableHeader>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedCandidates.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  No hay candidatos para mostrar
                </TableCell>
              </TableRow>
            ) : (
              sortedCandidates.map((candidate) => {
                const isPhoneHighlighted = highlightPhone && candidate.phone === highlightPhone

                return (
                  <TableRow
                    key={candidate.id}
                    className={cn(
                      isPhoneHighlighted && "bg-amber-50 dark:bg-amber-900/10"
                    )}
                  >
                    <TableCell className="font-medium">
                      <div className="flex items-center gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            {candidate.full_name}
                            {candidate.is_duplicate && (
                              <Tooltip>
                                <TooltipTrigger>
                                  <Badge
                                    variant="outline"
                                    className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 gap-1"
                                  >
                                    <Copy className="h-3 w-3" />
                                    Duplicado
                                  </Badge>
                                </TooltipTrigger>
                                <TooltipContent>
                                  <p>Este registro puede ser duplicado de otro candidato</p>
                                </TooltipContent>
                              </Tooltip>
                            )}
                          </div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <span className="font-mono text-sm">
                        {candidate.dni || "-"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={getStatusBadgeClasses(candidate.status)}
                      >
                        {CANDIDATE_STATUS[candidate.status].label}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <div>
                        <div className="text-sm">
                          {formatLastActivity(candidate.last_contacted_at)}
                        </div>
                        {candidate.contacted_by && (
                          <div className="text-xs text-muted-foreground">
                            por {candidate.contacted_by}
                          </div>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onView?.(candidate)}
                          title="Ver detalles"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => onEdit?.(candidate)}
                          title="Editar"
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
