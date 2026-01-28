"use client"

import * as React from "react"
import { Copy, CheckCircle, Clock, Filter, Loader2 } from "lucide-react"
import { toast } from "sonner"

import { Header } from "@/components/layout/header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
} from "@/components/ui/card"
import { PaginationEllipsis } from "@/components/ui/pagination-ellipsis"
import {
  DuplicatesTable,
  type DuplicateGroup,
  type DuplicateCandidate,
} from "@/components/duplicates/duplicates-table"
import { DuplicateResolutionDialog } from "@/components/duplicates/duplicate-resolution-dialog"

// =============================================================================
// CONSTANTS
// =============================================================================

const ITEMS_PER_PAGE = 10

type ConfidenceFilter = "all" | "high" | "medium" | "low"
type StatusFilter = "all" | "pending" | "resolved"

// =============================================================================
// TYPES
// =============================================================================

interface DuplicateFiltersState {
  confidence: ConfidenceFilter
  status: StatusFilter
  dateFrom: string
  dateTo: string
}

interface DuplicateStats {
  total: number
  resolvedToday: number
  pending: number
}

// Mock data removed - now fetches from API

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function filterGroups(
  groups: DuplicateGroup[],
  filters: DuplicateFiltersState
): DuplicateGroup[] {
  return groups.filter((group) => {
    // Confidence filter
    if (filters.confidence !== "all") {
      if (filters.confidence === "high" && group.confidence < 0.8) return false
      if (filters.confidence === "medium" && (group.confidence < 0.6 || group.confidence >= 0.8)) return false
      if (filters.confidence === "low" && group.confidence >= 0.6) return false
    }

    // Status filter
    if (filters.status !== "all" && group.resolution_status !== filters.status) {
      return false
    }

    // Date range filter
    if (filters.dateFrom) {
      const detectedDate = new Date(group.detected_at)
      const fromDate = new Date(filters.dateFrom)
      if (detectedDate < fromDate) return false
    }
    if (filters.dateTo) {
      const detectedDate = new Date(group.detected_at)
      const toDate = new Date(filters.dateTo)
      toDate.setHours(23, 59, 59, 999)
      if (detectedDate > toDate) return false
    }

    return true
  })
}

function calculateStats(groups: DuplicateGroup[]): DuplicateStats {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const resolvedToday = groups.filter((g) => {
    if (!g.resolved_at) return false
    const resolvedDate = new Date(g.resolved_at)
    return resolvedDate >= today
  }).length

  const pending = groups.filter((g) => g.resolution_status === "pending").length

  return {
    total: groups.length,
    resolvedToday,
    pending,
  }
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function DuplicadosPage() {
  // State
  const [duplicateGroups, setDuplicateGroups] = React.useState<DuplicateGroup[]>([])
  const [isLoadingData, setIsLoadingData] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [filters, setFilters] = React.useState<DuplicateFiltersState>({
    confidence: "all",
    status: "pending",
    dateFrom: "",
    dateTo: "",
  })
  const [currentPage, setCurrentPage] = React.useState(1)

  // Dialog state
  const [selectedGroup, setSelectedGroup] = React.useState<DuplicateGroup | null>(null)
  const [selectedAction, setSelectedAction] = React.useState<"merge" | "link" | "dismiss" | null>(null)
  const [isDialogOpen, setIsDialogOpen] = React.useState(false)
  const [isLoading, setIsLoading] = React.useState(false)

  // Fetch duplicates from API
  const fetchDuplicates = React.useCallback(async () => {
    try {
      setIsLoadingData(true)
      setError(null)
      const response = await fetch("/api/duplicates?status=all")
      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar duplicados")
      }

      setDuplicateGroups(result.data ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar duplicados")
    } finally {
      setIsLoadingData(false)
    }
  }, [])

  // Fetch on mount
  React.useEffect(() => {
    fetchDuplicates()
  }, [fetchDuplicates])

  // Computed values
  const stats = calculateStats(duplicateGroups)
  const filteredGroups = filterGroups(duplicateGroups, filters)
  const totalPages = Math.ceil(filteredGroups.length / ITEMS_PER_PAGE)
  const paginatedGroups = filteredGroups.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE
  )

  // Reset page when filters change
  React.useEffect(() => {
    setCurrentPage(1)
  }, [filters])

  // Handlers
  const handleMerge = (group: DuplicateGroup) => {
    setSelectedGroup(group)
    setSelectedAction("merge")
    setIsDialogOpen(true)
  }

  const handleLink = (group: DuplicateGroup) => {
    setSelectedGroup(group)
    setSelectedAction("link")
    setIsDialogOpen(true)
  }

  const handleDismiss = (group: DuplicateGroup) => {
    setSelectedGroup(group)
    setSelectedAction("dismiss")
    setIsDialogOpen(true)
  }

  const handleViewCandidate = (_candidate: DuplicateCandidate) => {
    // Candidate detail view not yet implemented
  }

  const handleConfirmResolution = async (
    group: DuplicateGroup,
    action: "merge" | "link" | "dismiss",
    primaryId?: string
  ) => {
    setIsLoading(true)

    const actionMessages: Record<typeof action, string> = {
      merge: "Candidatos fusionados exitosamente",
      link: "Candidatos vinculados exitosamente",
      dismiss: "Falso positivo descartado",
    }

    try {
      const candidateId = primaryId ?? group.primary_candidate.id
      const duplicateCandidateId = group.duplicate_candidates[0]?.id

      if (!duplicateCandidateId) {
        throw new Error("No se encontro el candidato duplicado")
      }

      const response = await fetch(`/api/candidates/${candidateId}/resolve-duplicate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          duplicate_candidate_id: duplicateCandidateId,
          action: action,
          notes: "Resolution via UI",
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al resolver duplicado")
      }

      toast.success(actionMessages[action])

      // Close dialog and reset state
      setIsDialogOpen(false)
      setSelectedGroup(null)
      setSelectedAction(null)

      // Refresh duplicates list from server
      await fetchDuplicates()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Error al resolver duplicado")
    } finally {
      setIsLoading(false)
    }
  }

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30"

  // Loading state
  if (isLoadingData) {
    return (
      <>
        <Header title="Duplicados" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando duplicados...</p>
          </div>
        </div>
      </>
    )
  }

  // Error state
  if (error) {
    return (
      <>
        <Header title="Duplicados" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <p className="text-rose-600">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fetchDuplicates()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <Header title="Duplicados" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        {/* Stats Cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Card className="py-4">
            <CardContent className="flex items-center gap-4 px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
                <Copy className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.total}</p>
                <p className="text-sm text-muted-foreground">Total duplicados</p>
              </div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="flex items-center gap-4 px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400">
                <CheckCircle className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.resolvedToday}</p>
                <p className="text-sm text-muted-foreground">Resueltos hoy</p>
              </div>
            </CardContent>
          </Card>

          <Card className="py-4">
            <CardContent className="flex items-center gap-4 px-6">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                <Clock className="h-6 w-6" />
              </div>
              <div>
                <p className="text-2xl font-bold">{stats.pending}</p>
                <p className="text-sm text-muted-foreground">Pendientes</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-4">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Filtros</h3>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Confidence filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="filter-confidence"
                className="text-sm font-medium text-muted-foreground"
              >
                Nivel de confianza
              </label>
              <select
                id="filter-confidence"
                value={filters.confidence}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    confidence: e.target.value as ConfidenceFilter,
                  }))
                }
                className={selectClassName}
              >
                <option value="all">Todos los niveles</option>
                <option value="high">Alta (&gt;80%)</option>
                <option value="medium">Media (60-80%)</option>
                <option value="low">Baja (&lt;60%)</option>
              </select>
            </div>

            {/* Status filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="filter-status"
                className="text-sm font-medium text-muted-foreground"
              >
                Estado
              </label>
              <select
                id="filter-status"
                value={filters.status}
                onChange={(e) =>
                  setFilters((prev) => ({
                    ...prev,
                    status: e.target.value as StatusFilter,
                  }))
                }
                className={selectClassName}
              >
                <option value="all">Todos</option>
                <option value="pending">Pendientes</option>
                <option value="resolved">Resueltos</option>
              </select>
            </div>

            {/* Clear filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  setFilters({
                    confidence: "all",
                    status: "pending",
                    dateFrom: "",
                    dateTo: "",
                  })
                }
                className="w-full"
                disabled={
                  filters.confidence === "all" &&
                  filters.status === "pending" &&
                  !filters.dateFrom &&
                  !filters.dateTo
                }
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
        </div>

        {/* Results count */}
        <div className="flex items-center gap-4">
          <p className="text-sm text-muted-foreground">
            {filteredGroups.length} grupo{filteredGroups.length !== 1 ? "s" : ""} de duplicados
          </p>
          {filters.status === "pending" && filteredGroups.length > 0 && (
            <Badge
              variant="outline"
              className="bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800"
            >
              Requieren revision
            </Badge>
          )}
        </div>

        {/* Table */}
        <DuplicatesTable
          groups={paginatedGroups}
          onMerge={handleMerge}
          onLink={handleLink}
          onDismiss={handleDismiss}
          onViewCandidate={handleViewCandidate}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between px-2">
            <p className="text-sm text-muted-foreground">
              Mostrando {(currentPage - 1) * ITEMS_PER_PAGE + 1} -{" "}
              {Math.min(currentPage * ITEMS_PER_PAGE, filteredGroups.length)} de{" "}
              {filteredGroups.length}
            </p>
            <PaginationEllipsis
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        )}
      </div>

      {/* Resolution Dialog */}
      <DuplicateResolutionDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        group={selectedGroup}
        action={selectedAction}
        onConfirm={handleConfirmResolution}
        isLoading={isLoading}
      />
    </>
  )
}
