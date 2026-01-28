"use client"

import * as React from "react"
import { ArrowRight, AlertTriangle, Check } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  POSITION_WORKFLOW_STATUS,
  WORKFLOW_TRANSITIONS,
  type PositionWorkflowStatus,
} from "@/types/constants"

// =============================================================================
// TYPES
// =============================================================================

export interface StatusChangeData {
  positionId: string
  previousStatus: PositionWorkflowStatus
  newStatus: PositionWorkflowStatus
  notes: string
  changedAt: string // ISO timestamp
}

interface StatusChangeDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  positionId: string
  positionTitle: string
  currentStatus: PositionWorkflowStatus
  onStatusChange: (data: StatusChangeData) => void | Promise<void>
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Obtiene las clases CSS para el badge de estado
 */
function getStatusBadgeClasses(status: PositionWorkflowStatus): string {
  const config = POSITION_WORKFLOW_STATUS[status]
  const colorMap: Record<string, string> = {
    sky: "bg-sky-100 text-sky-700 border-sky-200 dark:bg-sky-900/30 dark:text-sky-400 dark:border-sky-800",
    amber: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
    teal: "bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800",
    lime: "bg-lime-100 text-lime-700 border-lime-200 dark:bg-lime-900/30 dark:text-lime-400 dark:border-lime-800",
  }
  return colorMap[config.color] || "bg-stone-100 text-stone-600 border-stone-200"
}

/**
 * Obtiene las clases CSS para el boton de seleccion de estado
 */
function getStatusButtonClasses(
  status: PositionWorkflowStatus,
  isSelected: boolean
): string {
  const config = POSITION_WORKFLOW_STATUS[status]

  if (!isSelected) {
    return "border-stone-200 dark:border-stone-700 hover:border-stone-300 dark:hover:border-stone-600"
  }

  const colorMap: Record<string, string> = {
    sky: "border-sky-500 bg-sky-50 dark:bg-sky-900/20 ring-2 ring-sky-500/20",
    amber: "border-amber-500 bg-amber-50 dark:bg-amber-900/20 ring-2 ring-amber-500/20",
    teal: "border-teal-500 bg-teal-50 dark:bg-teal-900/20 ring-2 ring-teal-500/20",
    lime: "border-lime-500 bg-lime-50 dark:bg-lime-900/20 ring-2 ring-lime-500/20",
  }
  return colorMap[config.color] || "border-stone-500 bg-stone-50 ring-2 ring-stone-500/20"
}

// =============================================================================
// COMPONENT
// =============================================================================

export function StatusChangeDialog({
  open,
  onOpenChange,
  positionId,
  positionTitle,
  currentStatus,
  onStatusChange,
}: StatusChangeDialogProps) {
  const [selectedStatus, setSelectedStatus] = React.useState<PositionWorkflowStatus | null>(null)
  const [notes, setNotes] = React.useState("")
  const [isSubmitting, setIsSubmitting] = React.useState(false)

  // Get available transitions from current status
  const availableTransitions = WORKFLOW_TRANSITIONS[currentStatus]
  const currentConfig = POSITION_WORKFLOW_STATUS[currentStatus]

  // Reset state when dialog opens/closes
  React.useEffect(() => {
    if (!open) {
      setSelectedStatus(null)
      setNotes("")
      setIsSubmitting(false)
    }
  }, [open])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!selectedStatus) return

    setIsSubmitting(true)

    try {
      await onStatusChange({
        positionId,
        previousStatus: currentStatus,
        newStatus: selectedStatus,
        notes: notes.trim(),
        changedAt: new Date().toISOString(),
      })
      onOpenChange(false)
    } catch (error) {
      // Keep dialog open on error for user to retry
    } finally {
      setIsSubmitting(false)
    }
  }

  // If no transitions available (e.g., contratado), show message
  if (availableTransitions.length === 0) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Estado Final</DialogTitle>
            <DialogDescription>
              La posición &quot;{positionTitle}&quot; está en estado final.
            </DialogDescription>
          </DialogHeader>

          <div className="py-6 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-lime-100 dark:bg-lime-900/30 mb-4">
              <Check className="h-8 w-8 text-lime-600 dark:text-lime-400" />
            </div>
            <p className="text-muted-foreground">
              Esta posición ha sido{" "}
              <span className="font-medium text-foreground">contratada</span> y no puede
              cambiar de estado.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Cambiar Estado</DialogTitle>
          <DialogDescription>
            Actualizar el estado de la posición &quot;{positionTitle}&quot;
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Current Status */}
          <div className="space-y-2">
            <Label className="text-muted-foreground">Estado actual</Label>
            <div className="flex items-center gap-3">
              <Badge variant="outline" className={cn("text-sm", getStatusBadgeClasses(currentStatus))}>
                {currentConfig.label}
              </Badge>
              <span className="text-xs text-muted-foreground">
                {currentConfig.description}
              </span>
            </div>
          </div>

          {/* Status Selection */}
          <div className="space-y-3">
            <Label>
              Nuevo estado <span className="text-rose-500">*</span>
            </Label>
            <div className="grid gap-3">
              {availableTransitions.map((status) => {
                const config = POSITION_WORKFLOW_STATUS[status]
                const isSelected = selectedStatus === status
                const isBackward = config.order < currentConfig.order

                return (
                  <button
                    key={status}
                    type="button"
                    onClick={() => setSelectedStatus(status)}
                    className={cn(
                      "flex items-start gap-4 p-4 rounded-lg border-2 text-left transition-all",
                      getStatusButtonClasses(status, isSelected)
                    )}
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{config.label}</span>
                        {isBackward && (
                          <Badge variant="outline" className="text-xs bg-amber-50 text-amber-700 border-amber-200">
                            Retroceder
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mt-1">
                        {config.description}
                      </p>
                      {config.sla_days > 0 && (
                        <p className="text-xs text-muted-foreground mt-2">
                          SLA: {config.sla_days} días
                        </p>
                      )}
                    </div>

                    {/* Selection indicator */}
                    <div
                      className={cn(
                        "flex items-center justify-center w-5 h-5 rounded-full border-2 transition-colors",
                        isSelected
                          ? "border-teal-500 bg-teal-500"
                          : "border-stone-300 dark:border-stone-600"
                      )}
                    >
                      {isSelected && <Check className="h-3 w-3 text-white" />}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <textarea
              id="notes"
              rows={3}
              placeholder="Agregar comentarios sobre el cambio de estado..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className={cn(
                "flex w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "dark:bg-input/30",
                "resize-none"
              )}
            />
          </div>

          {/* Transition Preview */}
          {selectedStatus && (
            <div className="flex items-center justify-center gap-3 p-4 rounded-lg bg-muted/50">
              <Badge variant="outline" className={cn("text-sm", getStatusBadgeClasses(currentStatus))}>
                {currentConfig.label}
              </Badge>
              <ArrowRight className="h-4 w-4 text-muted-foreground" />
              <Badge variant="outline" className={cn("text-sm", getStatusBadgeClasses(selectedStatus))}>
                {POSITION_WORKFLOW_STATUS[selectedStatus].label}
              </Badge>
            </div>
          )}

          {/* Warning for backward transitions */}
          {selectedStatus && POSITION_WORKFLOW_STATUS[selectedStatus].order < currentConfig.order && (
            <div className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="h-5 w-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-800 dark:text-amber-300">
                  Retroceso de estado
                </p>
                <p className="text-amber-700 dark:text-amber-400 mt-1">
                  Esta accion retrocede el proceso. Considera agregar una nota explicando el motivo.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSubmitting}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={!selectedStatus || isSubmitting}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              {isSubmitting ? "Guardando..." : "Cambiar Estado"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
