"use client"

import * as React from "react"
import { ArrowUpDown, Merge, Link2, X } from "lucide-react"
import { formatDistanceToNow } from "date-fns"
import { es } from "date-fns/locale"

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
import { formatPhoneForDisplay } from "@/types/schemas"

// =============================================================================
// TYPES
// =============================================================================

export interface DuplicateCandidate {
  id: string
  full_name: string
  dni: string | null
  phone: string
  last_contacted_at: string | null
  status: string
}

export interface DuplicateGroup {
  id: string
  primary_candidate: DuplicateCandidate
  duplicate_candidates: DuplicateCandidate[]
  confidence: number
  match_reason: "phone" | "name" | "dni" | "compound"
  detected_at: string
  resolution_status: "pending" | "resolved"
  resolved_at: string | null
  resolution_action: "merged" | "linked" | "dismissed" | null
}

type SortColumn = "confidence" | "detected_at" | "primary_name"
type SortDirection = "asc" | "desc"

interface DuplicatesTableProps {
  groups: DuplicateGroup[]
  onMerge: (group: DuplicateGroup) => void
  onLink: (group: DuplicateGroup) => void
  onDismiss: (group: DuplicateGroup) => void
  onViewCandidate: (candidate: DuplicateCandidate) => void
}

interface SortableHeaderProps {
  column: SortColumn
  children: React.ReactNode
  onSort: (column: SortColumn) => void
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getConfidenceBadgeClasses(confidence: number): string {
  if (confidence >= 0.8) {
    return "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800"
  }
  if (confidence >= 0.6) {
    return "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
  }
  return "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800"
}

function getConfidenceLabel(confidence: number): string {
  if (confidence >= 0.8) return "Alta"
  if (confidence >= 0.6) return "Media"
  return "Baja"
}

function getMatchReasonLabel(reason: DuplicateGroup["match_reason"]): string {
  const labels: Record<DuplicateGroup["match_reason"], string> = {
    phone: "Telefono",
    name: "Nombre",
    dni: "DNI",
    compound: "Multiples",
  }
  return labels[reason]
}

function formatDetectedDate(date: string): string {
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: es,
    })
  } catch {
    return "Fecha invalida"
  }
}

function sortGroups(
  groups: DuplicateGroup[],
  column: SortColumn,
  direction: SortDirection
): DuplicateGroup[] {
  return [...groups].sort((a, b) => {
    let comparison = 0

    switch (column) {
      case "confidence":
        comparison = a.confidence - b.confidence
        break
      case "detected_at":
        comparison = new Date(a.detected_at).getTime() - new Date(b.detected_at).getTime()
        break
      case "primary_name":
        comparison = a.primary_candidate.full_name.localeCompare(b.primary_candidate.full_name)
        break
    }

    return direction === "asc" ? comparison : -comparison
  })
}

// =============================================================================
// SORTABLE HEADER COMPONENT
// =============================================================================

function SortableHeader({
  column,
  children,
  onSort,
}: SortableHeaderProps) {
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

export function DuplicatesTable({
  groups,
  onMerge,
  onLink,
  onDismiss,
  onViewCandidate,
}: DuplicatesTableProps) {
  const [sortColumn, setSortColumn] = React.useState<SortColumn>("confidence")
  const [sortDirection, setSortDirection] = React.useState<SortDirection>("desc")

  const handleSort = React.useCallback((column: SortColumn) => {
    setSortColumn((prevColumn) => {
      if (prevColumn === column) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"))
        return prevColumn
      }
      setSortDirection("desc")
      return column
    })
  }, [])

  const sortedGroups = sortGroups(groups, sortColumn, sortDirection)

  return (
    <TooltipProvider>
      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-[280px]">
                <SortableHeader column="primary_name" onSort={handleSort}>
                  Candidatos
                </SortableHeader>
              </TableHead>
              <TableHead>
                <SortableHeader column="confidence" onSort={handleSort}>
                  Confianza
                </SortableHeader>
              </TableHead>
              <TableHead>Coincidencia</TableHead>
              <TableHead>Ultimo Contacto</TableHead>
              <TableHead>
                <SortableHeader column="detected_at" onSort={handleSort}>
                  Detectado
                </SortableHeader>
              </TableHead>
              <TableHead className="text-right">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sortedGroups.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  No hay duplicados para mostrar
                </TableCell>
              </TableRow>
            ) : (
              sortedGroups.map((group) => (
                <TableRow key={group.id}>
                  <TableCell>
                    <div className="space-y-2">
                      {/* Primary candidate */}
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="outline"
                          className="bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800 text-xs"
                        >
                          Principal
                        </Badge>
                        <button
                          onClick={() => onViewCandidate(group.primary_candidate)}
                          className="text-sm font-medium hover:underline text-left"
                        >
                          {group.primary_candidate.full_name}
                        </button>
                      </div>
                      <div className="text-xs text-muted-foreground pl-[70px]">
                        {formatPhoneForDisplay(group.primary_candidate.phone)}
                        {group.primary_candidate.dni && ` | DNI: ${group.primary_candidate.dni}`}
                      </div>

                      {/* Duplicate candidates */}
                      {group.duplicate_candidates.map((candidate, idx) => (
                        <div key={candidate.id} className="border-t pt-2">
                          <div className="flex items-center gap-2">
                            <Badge
                              variant="outline"
                              className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800 text-xs"
                            >
                              Duplicado {idx + 1}
                            </Badge>
                            <button
                              onClick={() => onViewCandidate(candidate)}
                              className="text-sm font-medium hover:underline text-left"
                            >
                              {candidate.full_name}
                            </button>
                          </div>
                          <div className="text-xs text-muted-foreground pl-[84px]">
                            {formatPhoneForDisplay(candidate.phone)}
                            {candidate.dni && ` | DNI: ${candidate.dni}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={getConfidenceBadgeClasses(group.confidence)}
                    >
                      {Math.round(group.confidence * 100)}% - {getConfidenceLabel(group.confidence)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {getMatchReasonLabel(group.match_reason)}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="space-y-1">
                      <div className="text-sm">
                        {group.primary_candidate.last_contacted_at
                          ? formatDetectedDate(group.primary_candidate.last_contacted_at)
                          : "Nunca"}
                      </div>
                      {group.duplicate_candidates.map((candidate) => (
                        <div key={candidate.id} className="text-xs text-muted-foreground">
                          {candidate.last_contacted_at
                            ? formatDetectedDate(candidate.last_contacted_at)
                            : "Nunca"}
                        </div>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <span className="text-sm text-muted-foreground">
                      {formatDetectedDate(group.detected_at)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onMerge(group)}
                            className="text-teal-600 hover:text-teal-700 hover:bg-teal-50 dark:text-teal-400 dark:hover:bg-teal-900/30"
                          >
                            <Merge className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Fusionar registros</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onLink(group)}
                            className="text-sky-600 hover:text-sky-700 hover:bg-sky-50 dark:text-sky-400 dark:hover:bg-sky-900/30"
                          >
                            <Link2 className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Relacionar como misma persona</p>
                        </TooltipContent>
                      </Tooltip>

                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon-sm"
                            onClick={() => onDismiss(group)}
                            className="text-stone-500 hover:text-stone-600 hover:bg-stone-100 dark:text-stone-400 dark:hover:bg-stone-800"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Descartar (falso positivo)</p>
                        </TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </TooltipProvider>
  )
}
