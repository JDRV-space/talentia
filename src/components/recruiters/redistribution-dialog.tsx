"use client";

import * as React from "react";
import { CheckCircle, ArrowRight, MapPin, AlertTriangle } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  calculateRedistribution,
  getRedistributionSummary,
  type RecruiterForRedistribution,
  type RedistributionProposal,
} from "@/lib/algorithms/redistribution";

// =============================================================================
// TYPES
// =============================================================================

interface RedistributionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  recruiters: RecruiterForRedistribution[];
  onConfirm?: (proposal: RedistributionProposal) => void;
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * RedistributionDialog - Shows a proposal for redistributing cases
 * between overloaded and available recruiters
 */
export function RedistributionDialog({
  open,
  onOpenChange,
  recruiters,
  onConfirm,
}: RedistributionDialogProps) {
  // Calculate proposal when dialog opens
  const proposal = React.useMemo(() => {
    if (!open) return null;
    return calculateRedistribution(recruiters);
  }, [open, recruiters]);

  if (!proposal) return null;

  const summary = getRedistributionSummary(proposal);

  // Handle confirm click
  const handleConfirm = () => {
    if (onConfirm && proposal) {
      onConfirm(proposal);
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[550px]">
        <DialogHeader>
          <DialogTitle>Propuesta de Redistribución</DialogTitle>
          <DialogDescription>{summary}</DialogDescription>
        </DialogHeader>

        {/* Balanced state */}
        {proposal.is_balanced && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-lime-100 dark:bg-lime-900/30 mb-4">
              <CheckCircle className="h-8 w-8 text-lime-600 dark:text-lime-400" />
            </div>
            <p className="text-lg font-medium text-foreground">
              La carga está balanceada
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              No hay reclutadores sobrecargados que requieran redistribución.
            </p>
          </div>
        )}

        {/* No capacity available */}
        {!proposal.is_balanced && proposal.moves.length === 0 && (
          <div className="py-8 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-900/30 mb-4">
              <AlertTriangle className="h-8 w-8 text-amber-600 dark:text-amber-400" />
            </div>
            <p className="text-lg font-medium text-foreground">
              Sin capacidad disponible
            </p>
            <p className="text-sm text-muted-foreground mt-2">
              Hay {proposal.summary.overloaded_count} reclutador
              {proposal.summary.overloaded_count > 1 ? "es" : ""} sobrecargado
              {proposal.summary.overloaded_count > 1 ? "s" : ""} pero no hay
              reclutadores con capacidad para recibir casos.
            </p>
          </div>
        )}

        {/* Moves list */}
        {proposal.moves.length > 0 && (
          <div className="space-y-4 max-h-[400px] overflow-y-auto">
            <div className="text-sm text-muted-foreground">
              Se proponen los siguientes movimientos:
            </div>

            <div className="space-y-3">
              {proposal.moves.map((move, index) => (
                <div
                  key={`${move.from_recruiter_id}-${move.to_recruiter_id}-${index}`}
                  className="rounded-lg border bg-card p-4"
                >
                  <div className="flex items-center gap-3">
                    {/* Source recruiter */}
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate text-rose-600 dark:text-rose-400">
                        {move.from_recruiter_name}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {move.from_zone}
                      </div>
                    </div>

                    {/* Arrow with case count */}
                    <div className="flex flex-col items-center shrink-0 px-2">
                      <Badge
                        variant="secondary"
                        className="bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400 mb-1"
                      >
                        {move.cases_to_move} caso{move.cases_to_move > 1 ? "s" : ""}
                      </Badge>
                      <ArrowRight className="h-5 w-5 text-muted-foreground" />
                    </div>

                    {/* Target recruiter */}
                    <div className="flex-1 min-w-0 text-right">
                      <p className="font-medium truncate text-teal-600 dark:text-teal-400">
                        {move.to_recruiter_name}
                      </p>
                      <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground mt-0.5">
                        <MapPin className="h-3 w-3" />
                        {move.to_zone}
                      </div>
                    </div>
                  </div>

                  {/* Zone match indicator */}
                  {move.zone_match && (
                    <div className="mt-2 pt-2 border-t">
                      <Badge
                        variant="outline"
                        className="text-xs bg-lime-50 text-lime-700 border-lime-200 dark:bg-lime-900/20 dark:text-lime-400 dark:border-lime-800"
                      >
                        Misma zona
                      </Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Summary */}
            <div className="rounded-lg bg-muted/50 p-4 mt-4">
              <div className="grid grid-cols-3 gap-4 text-center">
                <div>
                  <p className="text-2xl font-bold text-rose-600 dark:text-rose-400">
                    {proposal.summary.overloaded_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Sobrecargados</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">
                    {proposal.summary.total_cases_to_move}
                  </p>
                  <p className="text-xs text-muted-foreground">Casos a mover</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-teal-600 dark:text-teal-400">
                    {proposal.summary.available_count}
                  </p>
                  <p className="text-xs text-muted-foreground">Con capacidad</p>
                </div>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="pt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {proposal.is_balanced || proposal.moves.length === 0
              ? "Cerrar"
              : "Cancelar"}
          </Button>
          {proposal.moves.length > 0 && (
            <Button
              onClick={handleConfirm}
              className="bg-teal-600 hover:bg-teal-700 text-white"
            >
              Confirmar Redistribución
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
