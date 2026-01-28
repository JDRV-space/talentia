"use client";

import * as React from "react";
import { Clock, AlertTriangle, AlertCircle } from "lucide-react";
import { format, parseISO, differenceInDays, addDays } from "date-fns";
import { es } from "date-fns/locale";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { SLA_BY_CAPABILITY, CAPABILITY_LEVELS, POSITION_LEVEL_MAP } from "@/types/constants";

// =============================================================================
// TYPES
// =============================================================================

export interface SlaDeadlineInfo {
  deadline: Date;
  daysRemaining: number;
  percentRemaining: number;
  slaDays: number;
  isOverdue: boolean;
  status: "green" | "yellow" | "red";
}

interface SlaDeadlineBadgeProps {
  /** Fecha de apertura de la posicion (ISO string) */
  openedAt: string;
  /** Nivel del puesto (para calcular SLA si no se provee sla_days) */
  level?: string;
  /** Dias de SLA (opcional, se calcula del nivel si no se provee) */
  slaDays?: number | null;
  /** Fecha limite de SLA (opcional, se calcula si no se provee) */
  slaDeadline?: string | null;
  /** Mostrar tooltip con detalles */
  showTooltip?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Obtiene los dias de SLA basado en el nivel del puesto
 */
function getSlaDaysFromLevel(level: string): number {
  const normalizedLevel = level?.toLowerCase().trim() ?? "operario";
  const capabilityLevel = POSITION_LEVEL_MAP[normalizedLevel] ?? 1;
  return SLA_BY_CAPABILITY[capabilityLevel as keyof typeof SLA_BY_CAPABILITY] ?? 7;
}

/**
 * Calcula la informacion de deadline SLA
 */
export function calculateSlaDeadlineInfo(
  openedAt: string,
  level: string = "operario",
  slaDays?: number | null,
  slaDeadline?: string | null
): SlaDeadlineInfo {
  // Determinar dias de SLA
  const effectiveSlaDays = slaDays ?? getSlaDaysFromLevel(level);

  // Calcular fecha limite
  const openedDate = parseISO(openedAt);
  const deadline = slaDeadline
    ? parseISO(slaDeadline)
    : addDays(openedDate, effectiveSlaDays);

  // Calcular dias restantes
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const daysRemaining = differenceInDays(deadline, today);

  // Calcular porcentaje restante
  const daysElapsed = differenceInDays(today, openedDate);
  const percentRemaining = effectiveSlaDays > 0
    ? Math.max(0, ((effectiveSlaDays - daysElapsed) / effectiveSlaDays) * 100)
    : 0;

  // Determinar estado del color
  let status: "green" | "yellow" | "red";
  if (daysRemaining < 0 || percentRemaining <= 20) {
    status = "red";
  } else if (percentRemaining <= 50) {
    status = "yellow";
  } else {
    status = "green";
  }

  return {
    deadline,
    daysRemaining,
    percentRemaining,
    slaDays: effectiveSlaDays,
    isOverdue: daysRemaining < 0,
    status,
  };
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

export function SlaDeadlineBadge({
  openedAt,
  level = "operario",
  slaDays,
  slaDeadline,
  showTooltip = true,
  className,
}: SlaDeadlineBadgeProps) {
  const info = calculateSlaDeadlineInfo(openedAt, level, slaDays, slaDeadline);

  // Estilos de color
  const colorClasses: Record<string, { badge: string; icon: string }> = {
    green: {
      badge: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800",
      icon: "text-emerald-600 dark:text-emerald-400",
    },
    yellow: {
      badge: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
      icon: "text-amber-600 dark:text-amber-400",
    },
    red: {
      badge: "bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-400 dark:border-rose-800",
      icon: "text-rose-600 dark:text-rose-400",
    },
  };

  const colors = colorClasses[info.status];

  // Seleccionar icono
  const IconComponent = info.isOverdue
    ? AlertTriangle
    : info.status === "yellow"
      ? AlertCircle
      : Clock;

  // Texto del badge
  let label: string;
  if (info.isOverdue) {
    label = `Vencido (${Math.abs(info.daysRemaining)}d)`;
  } else if (info.daysRemaining === 0) {
    label = "Vence hoy";
  } else if (info.daysRemaining === 1) {
    label = "Vence en 1 dia";
  } else {
    label = `${info.daysRemaining} dias`;
  }

  const badge = (
    <Badge
      variant="outline"
      className={cn("gap-1 whitespace-nowrap", colors.badge, className)}
    >
      <IconComponent className={cn("h-3 w-3", colors.icon)} />
      {label}
    </Badge>
  );

  if (!showTooltip) {
    return badge;
  }

  // Obtener label del nivel
  const normalizedLevel = level?.toLowerCase().trim() ?? "operario";
  const capabilityLevel = POSITION_LEVEL_MAP[normalizedLevel] ?? 1;
  const levelLabel = CAPABILITY_LEVELS[capabilityLevel as keyof typeof CAPABILITY_LEVELS]?.label ?? level;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="inline-flex">{badge}</div>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="space-y-1.5 text-xs">
          <div className="font-medium">
            {info.isOverdue
              ? "Fecha limite excedida"
              : info.status === "red"
                ? "Urgente: menos del 20% del tiempo"
                : info.status === "yellow"
                  ? "Advertencia: menos del 50% del tiempo"
                  : "En tiempo"
            }
          </div>
          <div className="space-y-0.5 text-muted-foreground">
            <div>
              Fecha limite: {format(info.deadline, "dd MMM yyyy", { locale: es })}
            </div>
            <div>
              SLA: {info.slaDays} dias ({levelLabel})
            </div>
            <div>
              Abierto: {format(parseISO(openedAt), "dd MMM yyyy", { locale: es })}
            </div>
            {info.isOverdue && (
              <div className="text-rose-600 dark:text-rose-400 font-medium pt-1">
                Retraso: {Math.abs(info.daysRemaining)} dias
              </div>
            )}
          </div>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
