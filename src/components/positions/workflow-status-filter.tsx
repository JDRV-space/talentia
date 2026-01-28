"use client"

import * as React from "react"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  POSITION_WORKFLOW_STATUS,
  type PositionWorkflowStatus,
} from "@/types/constants"

// =============================================================================
// TYPES
// =============================================================================

export interface WorkflowStatusFilterState {
  workflowStatus: PositionWorkflowStatus | ""
  slaStatus: "all" | "on_time" | "delayed"
}

interface WorkflowStatusFilterProps {
  value: WorkflowStatusFilterState
  onChange: (value: WorkflowStatusFilterState) => void
  className?: string
}

// =============================================================================
// CONSTANTS
// =============================================================================

export const DEFAULT_WORKFLOW_FILTER: WorkflowStatusFilterState = {
  workflowStatus: "",
  slaStatus: "all",
}

const SLA_STATUS_OPTIONS = [
  { value: "all" as const, label: "Todos" },
  { value: "on_time" as const, label: "En tiempo" },
  { value: "delayed" as const, label: "Retrasados" },
] as const

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getStatusPillClasses(
  status: PositionWorkflowStatus,
  isSelected: boolean
): string {
  const config = POSITION_WORKFLOW_STATUS[status]

  if (!isSelected) {
    return "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-muted-foreground"
  }

  const colorMap: Record<string, string> = {
    sky: "border-sky-500 bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-400",
    amber: "border-amber-500 bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    teal: "border-teal-500 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400",
    lime: "border-lime-500 bg-lime-100 text-lime-700 dark:bg-lime-900/30 dark:text-lime-400",
  }
  return colorMap[config.color] || "border-stone-500 bg-stone-100 text-stone-700"
}

// =============================================================================
// COMPONENT
// =============================================================================

export function WorkflowStatusFilter({
  value,
  onChange,
  className,
}: WorkflowStatusFilterProps) {
  const statuses = Object.keys(POSITION_WORKFLOW_STATUS) as PositionWorkflowStatus[]

  const handleStatusClick = (status: PositionWorkflowStatus) => {
    onChange({
      ...value,
      workflowStatus: value.workflowStatus === status ? "" : status,
    })
  }

  const handleSlaChange = (slaStatus: WorkflowStatusFilterState["slaStatus"]) => {
    onChange({
      ...value,
      slaStatus,
    })
  }

  const handleClear = () => {
    onChange(DEFAULT_WORKFLOW_FILTER)
  }

  const hasActiveFilters = value.workflowStatus !== "" || value.slaStatus !== "all"

  return (
    <div className={cn("space-y-4", className)}>
      {/* Workflow Status Pills */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-muted-foreground">
            Estado del Proceso
          </label>
          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClear}
              className="h-6 px-2 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Limpiar
            </Button>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {statuses.map((status) => {
            const config = POSITION_WORKFLOW_STATUS[status]
            const isSelected = value.workflowStatus === status

            return (
              <button
                key={status}
                type="button"
                onClick={() => handleStatusClick(status)}
                className={cn(
                  "inline-flex items-center px-3 py-1.5 rounded-full border text-sm font-medium transition-colors",
                  getStatusPillClasses(status, isSelected)
                )}
              >
                <span
                  className={cn(
                    "w-2 h-2 rounded-full mr-2",
                    config.color === "sky" && "bg-sky-500",
                    config.color === "amber" && "bg-amber-500",
                    config.color === "teal" && "bg-teal-500",
                    config.color === "lime" && "bg-lime-500"
                  )}
                />
                {config.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* SLA Status Filter */}
      <div className="space-y-2">
        <label className="text-sm font-medium text-muted-foreground">
          Estado SLA
        </label>
        <div className="flex gap-2">
          {SLA_STATUS_OPTIONS.map((option) => {
            const isSelected = value.slaStatus === option.value

            return (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSlaChange(option.value)}
                className={cn(
                  "inline-flex items-center px-3 py-1.5 rounded-md border text-sm font-medium transition-colors",
                  isSelected
                    ? option.value === "delayed"
                      ? "border-rose-500 bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
                      : option.value === "on_time"
                      ? "border-teal-500 bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-400"
                      : "border-teal-500 bg-teal-50 text-teal-700 dark:bg-teal-900/20 dark:text-teal-400"
                    : "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600 text-muted-foreground"
                )}
              >
                {option.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Active filters display */}
      {hasActiveFilters && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
          <span className="text-xs text-muted-foreground">Filtros activos:</span>
          {value.workflowStatus && (
            <Badge variant="secondary" className="gap-1 text-xs">
              {POSITION_WORKFLOW_STATUS[value.workflowStatus].label}
              <button
                onClick={() => onChange({ ...value, workflowStatus: "" })}
                className="ml-1 rounded-full hover:bg-foreground/10"
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          )}
          {value.slaStatus !== "all" && (
            <Badge
              variant="secondary"
              className={cn(
                "gap-1 text-xs",
                value.slaStatus === "delayed" && "bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400"
              )}
            >
              {value.slaStatus === "on_time" ? "En tiempo" : "Retrasados"}
              <button
                onClick={() => onChange({ ...value, slaStatus: "all" })}
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
