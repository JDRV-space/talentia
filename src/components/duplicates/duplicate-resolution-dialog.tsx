"use client"

import * as React from "react"
import { AlertTriangle, Merge, Link2, X, Check, ChevronRight } from "lucide-react"

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { formatPhoneForDisplay } from "@/types/schemas"
import type { DuplicateGroup, DuplicateCandidate } from "./duplicates-table"

// =============================================================================
// TYPES
// =============================================================================

type ResolutionAction = "merge" | "link" | "dismiss"

interface DuplicateResolutionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  group: DuplicateGroup | null
  action: ResolutionAction | null
  onConfirm: (group: DuplicateGroup, action: ResolutionAction, primaryId?: string) => void
  isLoading?: boolean
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function getActionConfig(action: ResolutionAction | null) {
  const configs: Record<ResolutionAction, {
    title: string
    description: string
    icon: React.ElementType
    buttonLabel: string
    buttonClass: string
    warningMessage: string
  }> = {
    merge: {
      title: "Fusionar Registros",
      description: "Los registros duplicados seran combinados en uno solo. Esta accion no se puede deshacer.",
      icon: Merge,
      buttonLabel: "Fusionar",
      buttonClass: "bg-teal-600 hover:bg-teal-700 text-white",
      warningMessage: "Se conservaran los datos mas recientes y completos del registro principal.",
    },
    link: {
      title: "Relacionar Registros",
      description: "Los registros seran marcados como la misma persona con diferentes datos de contacto.",
      icon: Link2,
      buttonLabel: "Relacionar",
      buttonClass: "bg-sky-600 hover:bg-sky-700 text-white",
      warningMessage: "Ambos registros se mantendran pero estaran vinculados.",
    },
    dismiss: {
      title: "Descartar Duplicado",
      description: "Se marcara este par como falso positivo y no aparecera nuevamente.",
      icon: X,
      buttonLabel: "Descartar",
      buttonClass: "bg-stone-600 hover:bg-stone-700 text-white",
      warningMessage: "Esta accion indica que los registros son de personas diferentes.",
    },
  }

  return action ? configs[action] : null
}

// =============================================================================
// CANDIDATE CARD COMPONENT
// =============================================================================

interface CandidateCardProps {
  candidate: DuplicateCandidate
  isPrimary: boolean
  isSelected: boolean
  onSelect: () => void
  showSelector: boolean
}

function CandidateCard({
  candidate,
  isPrimary,
  isSelected,
  onSelect,
  showSelector,
}: CandidateCardProps) {
  return (
    <div
      className={cn(
        "rounded-lg border p-4 transition-all",
        showSelector && "cursor-pointer hover:border-teal-300 dark:hover:border-teal-700",
        isSelected && "border-teal-500 bg-teal-50 dark:bg-teal-900/20 dark:border-teal-600"
      )}
      onClick={showSelector ? onSelect : undefined}
    >
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="font-medium">{candidate.full_name}</span>
            {isPrimary && (
              <Badge
                variant="outline"
                className="bg-teal-100 text-teal-700 border-teal-200 dark:bg-teal-900/30 dark:text-teal-400 dark:border-teal-800 text-xs"
              >
                Original
              </Badge>
            )}
          </div>
          <div className="text-sm text-muted-foreground">
            {formatPhoneForDisplay(candidate.phone)}
          </div>
          {candidate.dni && (
            <div className="text-sm text-muted-foreground">
              DNI: {candidate.dni}
            </div>
          )}
          <div className="text-xs text-muted-foreground">
            Ultimo contacto:{" "}
            {candidate.last_contacted_at
              ? new Date(candidate.last_contacted_at).toLocaleDateString("es-PE")
              : "Nunca"}
          </div>
        </div>
        {showSelector && (
          <div
            className={cn(
              "flex h-5 w-5 items-center justify-center rounded-full border-2 transition-colors",
              isSelected
                ? "border-teal-500 bg-teal-500 text-white"
                : "border-stone-300 dark:border-stone-600"
            )}
          >
            {isSelected && <Check className="h-3 w-3" />}
          </div>
        )}
      </div>
    </div>
  )
}

// =============================================================================
// COMPONENT
// =============================================================================

export function DuplicateResolutionDialog({
  open,
  onOpenChange,
  group,
  action,
  onConfirm,
  isLoading = false,
}: DuplicateResolutionDialogProps) {
  const [selectedPrimaryId, setSelectedPrimaryId] = React.useState<string | null>(null)

  // Reset selection when dialog opens
  React.useEffect(() => {
    if (open && group) {
      setSelectedPrimaryId(group.primary_candidate.id)
    }
  }, [open, group])

  if (!group || !action) return null

  const config = getActionConfig(action)
  if (!config) return null

  const Icon = config.icon
  const allCandidates = [group.primary_candidate, ...group.duplicate_candidates]
  const showPrimarySelector = action === "merge"

  const handleConfirm = () => {
    onConfirm(group, action, selectedPrimaryId ?? group.primary_candidate.id)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className={cn(
              "flex h-10 w-10 items-center justify-center rounded-full",
              action === "merge" && "bg-teal-100 text-teal-600 dark:bg-teal-900/30 dark:text-teal-400",
              action === "link" && "bg-sky-100 text-sky-600 dark:bg-sky-900/30 dark:text-sky-400",
              action === "dismiss" && "bg-stone-100 text-stone-600 dark:bg-stone-800 dark:text-stone-400"
            )}>
              <Icon className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>{config.title}</DialogTitle>
              <DialogDescription className="mt-1">
                {config.description}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Warning message */}
          <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
            <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />
            <p className="text-sm">{config.warningMessage}</p>
          </div>

          {/* Confidence info */}
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Nivel de confianza:</span>
            <Badge
              variant="outline"
              className={cn(
                group.confidence >= 0.8 && "bg-rose-100 text-rose-700 border-rose-200",
                group.confidence >= 0.6 && group.confidence < 0.8 && "bg-amber-100 text-amber-700 border-amber-200",
                group.confidence < 0.6 && "bg-sky-100 text-sky-700 border-sky-200"
              )}
            >
              {Math.round(group.confidence * 100)}%
            </Badge>
          </div>

          {/* Primary selector instruction */}
          {showPrimarySelector && (
            <p className="text-sm text-muted-foreground">
              Seleccione el registro que desea conservar como principal:
            </p>
          )}

          {/* Candidate cards */}
          <div className="space-y-3">
            {allCandidates.map((candidate, idx) => (
              <CandidateCard
                key={candidate.id}
                candidate={candidate}
                isPrimary={idx === 0}
                isSelected={selectedPrimaryId === candidate.id}
                onSelect={() => setSelectedPrimaryId(candidate.id)}
                showSelector={showPrimarySelector}
              />
            ))}
          </div>

          {/* Merge direction indicator */}
          {action === "merge" && selectedPrimaryId && (
            <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <span>Los datos se fusionaran en</span>
              <ChevronRight className="h-4 w-4" />
              <span className="font-medium text-foreground">
                {allCandidates.find((c) => c.id === selectedPrimaryId)?.full_name}
              </span>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={isLoading}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={isLoading || (showPrimarySelector && !selectedPrimaryId)}
            className={config.buttonClass}
          >
            {isLoading ? "Procesando..." : config.buttonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
