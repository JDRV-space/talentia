"use client"

import * as React from "react"
import { Search, X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import {
  ZONES,
  PRIORITY_LEVELS,
  POSITION_STATUS,
  type Zone,
  type PriorityLevel,
  type PositionStatus,
} from "@/types/constants"
import type { RecruiterSummary } from "@/types/database"

// =============================================================================
// TYPES
// =============================================================================

export interface PositionFiltersState {
  search: string
  zone: Zone | ""
  priority: PriorityLevel | ""
  status: PositionStatus | ""
  recruiter_id: string
}

interface PositionFiltersProps {
  filters: PositionFiltersState
  onFiltersChange: (filters: PositionFiltersState) => void
  recruiters?: RecruiterSummary[]
}

// =============================================================================
// COMPONENT
// =============================================================================

export function PositionFilters({
  filters,
  onFiltersChange,
  recruiters = [],
}: PositionFiltersProps) {
  const handleFilterChange = (
    key: keyof PositionFiltersState,
    value: string
  ) => {
    onFiltersChange({
      ...filters,
      [key]: value,
    })
  }

  const handleClearFilters = () => {
    onFiltersChange({
      search: "",
      zone: "",
      priority: "",
      status: "",
      recruiter_id: "",
    })
  }

  const hasActiveFilters =
    filters.search !== "" ||
    filters.zone !== "" ||
    filters.priority !== "" ||
    filters.status !== "" ||
    filters.recruiter_id !== ""

  const activeFiltersCount = [
    filters.zone,
    filters.priority,
    filters.status,
    filters.recruiter_id,
  ].filter((v) => v !== "").length

  const selectClassName = cn(
    "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors",
    "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
    "disabled:cursor-not-allowed disabled:opacity-50",
    "dark:bg-input/30"
  )

  return (
    <div className="space-y-4">
      {/* Search and filter row */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Buscar por título de puesto..."
            value={filters.search}
            onChange={(e) => handleFilterChange("search", e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Clear filters button */}
        {hasActiveFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleClearFilters}
            className="shrink-0 text-muted-foreground hover:text-foreground"
          >
            <X className="mr-2 h-4 w-4" />
            Limpiar filtros
            {activeFiltersCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
        )}
      </div>

      {/* Filter dropdowns */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {/* Zone filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="filter-zone"
            className="text-sm font-medium text-muted-foreground"
          >
            Zona
          </label>
          <select
            id="filter-zone"
            value={filters.zone}
            onChange={(e) => handleFilterChange("zone", e.target.value)}
            className={cn(
              selectClassName,
              filters.zone === "" && "text-muted-foreground"
            )}
          >
            <option value="">Todas las zonas</option>
            {ZONES.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </div>

        {/* Priority filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="filter-priority"
            className="text-sm font-medium text-muted-foreground"
          >
            Prioridad
          </label>
          <select
            id="filter-priority"
            value={filters.priority}
            onChange={(e) => handleFilterChange("priority", e.target.value)}
            className={cn(
              selectClassName,
              filters.priority === "" && "text-muted-foreground"
            )}
          >
            <option value="">Todas las prioridades</option>
            {(Object.keys(PRIORITY_LEVELS) as PriorityLevel[]).map((key) => (
              <option key={key} value={key}>
                {PRIORITY_LEVELS[key].label_short} - {PRIORITY_LEVELS[key].label}
              </option>
            ))}
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
            onChange={(e) => handleFilterChange("status", e.target.value)}
            className={cn(
              selectClassName,
              filters.status === "" && "text-muted-foreground"
            )}
          >
            <option value="">Todos los estados</option>
            {(Object.keys(POSITION_STATUS) as PositionStatus[]).map((key) => (
              <option key={key} value={key}>
                {POSITION_STATUS[key].label}
              </option>
            ))}
          </select>
        </div>

        {/* Recruiter filter */}
        <div className="space-y-1.5">
          <label
            htmlFor="filter-recruiter"
            className="text-sm font-medium text-muted-foreground"
          >
            Reclutador
          </label>
          <select
            id="filter-recruiter"
            value={filters.recruiter_id}
            onChange={(e) => handleFilterChange("recruiter_id", e.target.value)}
            className={cn(
              selectClassName,
              filters.recruiter_id === "" && "text-muted-foreground"
            )}
          >
            <option value="">Todos los reclutadores</option>
            <option value="unassigned">Sin asignar</option>
            {recruiters.map((recruiter) => (
              <option key={recruiter.id} value={recruiter.id}>
                {recruiter.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtros activos:</span>
          {filters.zone && (
            <Badge variant="secondary" className="gap-1">
              Zona: {filters.zone}
              <button
                onClick={() => handleFilterChange("zone", "")}
                className="ml-1 rounded-full hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.priority && (
            <Badge variant="secondary" className="gap-1">
              Prioridad: {PRIORITY_LEVELS[filters.priority].label}
              <button
                onClick={() => handleFilterChange("priority", "")}
                className="ml-1 rounded-full hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.status && (
            <Badge variant="secondary" className="gap-1">
              Estado: {POSITION_STATUS[filters.status].label}
              <button
                onClick={() => handleFilterChange("status", "")}
                className="ml-1 rounded-full hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {filters.recruiter_id && (
            <Badge variant="secondary" className="gap-1">
              Reclutador:{" "}
              {filters.recruiter_id === "unassigned"
                ? "Sin asignar"
                : recruiters.find((r) => r.id === filters.recruiter_id)?.name}
              <button
                onClick={() => handleFilterChange("recruiter_id", "")}
                className="ml-1 rounded-full hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
        </div>
      )}
    </div>
  )
}

export const DEFAULT_POSITION_FILTERS: PositionFiltersState = {
  search: "",
  zone: "",
  priority: "",
  status: "",
  recruiter_id: "",
}
