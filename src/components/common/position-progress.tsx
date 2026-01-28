"use client";

import { cn } from "@/lib/utils";
import { Check, Clock, AlertTriangle } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Estados del pipeline de reclutamiento
 * vacante -> proceso -> seleccionado -> contratado
 */
export type PipelineStage = "vacante" | "proceso" | "seleccionado" | "contratado";

/**
 * Estado del SLA
 */
export type SLAStatus = "on_track" | "at_risk" | "overdue";

/**
 * Datos de transicion de etapa
 */
export interface StageData {
  /** Etapa del pipeline */
  stage: PipelineStage;
  /** Fecha en que se alcanzo esta etapa */
  date?: Date | string | null;
  /** Si esta etapa ha sido completada */
  completed: boolean;
}

/**
 * Props del componente PositionProgress
 */
export interface PositionProgressProps {
  /** Etapa actual de la posicion */
  currentStage: PipelineStage;
  /** Datos de cada etapa con fechas de transicion */
  stages?: StageData[];
  /** Fecha de apertura de la posicion */
  openedAt?: Date | string;
  /** Dias del SLA para esta posicion */
  slaDays?: number;
  /** Estado del SLA */
  slaStatus?: SLAStatus;
  /** Dias transcurridos desde apertura */
  daysElapsed?: number;
  /** Tamano del componente */
  size?: "sm" | "md" | "lg";
  /** Mostrar etiquetas de etapa */
  showLabels?: boolean;
  /** Mostrar informacion de tiempo */
  showTimeInfo?: boolean;
  /** Clase CSS adicional */
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Configuracion de etapas del pipeline
 */
const PIPELINE_STAGES: Record<PipelineStage, {
  label: string;
  shortLabel: string;
  order: number;
  color: string;
  bgColor: string;
  borderColor: string;
}> = {
  vacante: {
    label: "Vacante",
    shortLabel: "Vac",
    order: 0,
    color: "text-sky-600 dark:text-sky-400",
    bgColor: "bg-sky-500",
    borderColor: "border-sky-500",
  },
  proceso: {
    label: "En Proceso",
    shortLabel: "Proc",
    order: 1,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
    borderColor: "border-amber-500",
  },
  seleccionado: {
    label: "Seleccionado",
    shortLabel: "Sel",
    order: 2,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-500",
    borderColor: "border-teal-500",
  },
  contratado: {
    label: "Contratado",
    shortLabel: "Cont",
    order: 3,
    color: "text-lime-600 dark:text-lime-400",
    bgColor: "bg-lime-500",
    borderColor: "border-lime-500",
  },
};

/**
 * Estilos de estado del SLA
 */
const SLA_STYLES: Record<SLAStatus, {
  label: string;
  color: string;
  bgColor: string;
  icon: typeof Clock;
}> = {
  on_track: {
    label: "En tiempo",
    color: "text-lime-600 dark:text-lime-400",
    bgColor: "bg-lime-100 dark:bg-lime-950/30",
    icon: Check,
  },
  at_risk: {
    label: "En riesgo",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-950/30",
    icon: Clock,
  },
  overdue: {
    label: "Vencido",
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-100 dark:bg-rose-950/30",
    icon: AlertTriangle,
  },
};

/**
 * Orden de etapas para procesamiento
 */
const STAGE_ORDER: PipelineStage[] = ["vacante", "proceso", "seleccionado", "contratado"];

// =============================================================================
// UTILITIES
// =============================================================================

/**
 * Formatea una fecha para mostrar
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "-";
  const d = typeof date === "string" ? new Date(date) : date;
  return d.toLocaleDateString("es-PE", {
    day: "2-digit",
    month: "short",
  });
}

/**
 * Calcula los dias transcurridos entre dos fechas
 */
function calculateDaysElapsed(startDate: Date | string): number {
  const start = typeof startDate === "string" ? new Date(startDate) : startDate;
  const now = new Date();
  const diffMs = now.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

// =============================================================================
// COMPONENT
// =============================================================================

/**
 * Componente de indicador de progreso de posicion
 *
 * Muestra el estado actual de una posicion en el pipeline de reclutamiento
 * con indicadores visuales de etapas completadas y estado del SLA.
 *
 * Etapas:
 * - Vacante: Posicion abierta
 * - En Proceso: Candidatos siendo evaluados
 * - Seleccionado: Candidato seleccionado, tramites pendientes
 * - Contratado: Posicion cubierta
 *
 * @example
 * <PositionProgress
 *   currentStage="proceso"
 *   openedAt="2024-01-15"
 *   slaDays={7}
 *   slaStatus="on_track"
 *   showLabels
 *   showTimeInfo
 * />
 */
export function PositionProgress({
  currentStage,
  stages,
  openedAt,
  slaDays,
  slaStatus = "on_track",
  daysElapsed: propDaysElapsed,
  size = "md",
  showLabels = false,
  showTimeInfo = false,
  className,
}: PositionProgressProps) {
  // Calcular dias transcurridos si no se proporcionan
  const daysElapsed = propDaysElapsed ?? (openedAt ? calculateDaysElapsed(openedAt) : 0);

  // Obtener el orden de la etapa actual
  const currentOrder = PIPELINE_STAGES[currentStage].order;

  // Estilos de tamano
  const sizeStyles = {
    sm: {
      dot: "h-2.5 w-2.5",
      line: "h-0.5",
      text: "text-xs",
      icon: "h-3 w-3",
      gap: "gap-1",
    },
    md: {
      dot: "h-3.5 w-3.5",
      line: "h-1",
      text: "text-sm",
      icon: "h-4 w-4",
      gap: "gap-2",
    },
    lg: {
      dot: "h-5 w-5",
      line: "h-1.5",
      text: "text-base",
      icon: "h-5 w-5",
      gap: "gap-3",
    },
  };

  const styles = sizeStyles[size];

  // Obtener datos de etapa
  const getStageData = (stage: PipelineStage): StageData | undefined => {
    return stages?.find((s) => s.stage === stage);
  };

  return (
    <TooltipProvider>
      <div className={cn("flex flex-col", styles.gap, className)}>
        {/* Barra de progreso */}
        <div className="flex items-center">
          {STAGE_ORDER.map((stage, index) => {
            const config = PIPELINE_STAGES[stage];
            const stageData = getStageData(stage);
            const isCompleted = config.order < currentOrder || (config.order === currentOrder && stage === "contratado");
            const isCurrent = stage === currentStage;
            const isPending = config.order > currentOrder;

            return (
              <div key={stage} className="flex items-center flex-1 last:flex-none">
                {/* Punto de etapa */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div
                      className={cn(
                        "rounded-full flex items-center justify-center shrink-0 transition-all duration-200",
                        styles.dot,
                        isCompleted && config.bgColor,
                        isCurrent && !isCompleted && [
                          "ring-2 ring-offset-2 ring-offset-background",
                          config.bgColor,
                          config.borderColor.replace("border", "ring"),
                        ],
                        isPending && "bg-stone-200 dark:bg-stone-700"
                      )}
                    >
                      {isCompleted && size !== "sm" && (
                        <Check className={cn("text-white", styles.icon, "scale-75")} />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-center">
                    <p className="font-medium">{config.label}</p>
                    {stageData?.date && (
                      <p className="text-xs text-muted-foreground">
                        {formatDate(stageData.date)}
                      </p>
                    )}
                  </TooltipContent>
                </Tooltip>

                {/* Linea conectora */}
                {index < STAGE_ORDER.length - 1 && (
                  <div
                    className={cn(
                      "flex-1 mx-1 rounded-full transition-all duration-200",
                      styles.line,
                      config.order < currentOrder
                        ? PIPELINE_STAGES[STAGE_ORDER[index + 1]].bgColor
                        : "bg-stone-200 dark:bg-stone-700"
                    )}
                  />
                )}
              </div>
            );
          })}
        </div>

        {/* Etiquetas de etapa */}
        {showLabels && (
          <div className="flex items-center">
            {STAGE_ORDER.map((stage, index) => {
              const config = PIPELINE_STAGES[stage];
              const isCurrent = stage === currentStage;

              return (
                <div key={stage} className="flex items-center flex-1 last:flex-none">
                  <span
                    className={cn(
                      "shrink-0 text-center",
                      styles.text,
                      isCurrent ? [config.color, "font-medium"] : "text-muted-foreground"
                    )}
                    style={{
                      width: size === "sm" ? "2.5rem" : size === "md" ? "3.5rem" : "4.5rem",
                    }}
                  >
                    {size === "sm" ? config.shortLabel : config.label}
                  </span>
                  {index < STAGE_ORDER.length - 1 && (
                    <div className="flex-1" />
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Información de tiempo y SLA */}
        {showTimeInfo && (
          <div className="flex items-center justify-between pt-1">
            {/* Días transcurridos */}
            <div className={cn("flex items-center gap-1", styles.text)}>
              <Clock className={cn("text-muted-foreground", styles.icon)} />
              <span className="text-muted-foreground">
                {daysElapsed} {daysElapsed === 1 ? "día" : "días"}
              </span>
              {slaDays && (
                <span className="text-muted-foreground">/ {slaDays} SLA</span>
              )}
            </div>

            {/* Estado del SLA */}
            {slaStatus && (
              <div
                className={cn(
                  "flex items-center gap-1 rounded-full px-2 py-0.5",
                  styles.text,
                  SLA_STYLES[slaStatus].bgColor,
                  SLA_STYLES[slaStatus].color
                )}
              >
                {(() => {
                  const Icon = SLA_STYLES[slaStatus].icon;
                  return <Icon className={styles.icon} />;
                })()}
                <span className="font-medium">{SLA_STYLES[slaStatus].label}</span>
              </div>
            )}
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}

// =============================================================================
// COMPACT VARIANT
// =============================================================================

/**
 * Props para la variante compacta
 */
export interface PositionProgressCompactProps {
  /** Etapa actual de la posicion */
  currentStage: PipelineStage;
  /** Estado del SLA */
  slaStatus?: SLAStatus;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Variante compacta del indicador de progreso
 *
 * Muestra solo un badge con la etapa actual y el estado del SLA.
 * Ideal para uso en tablas o listas.
 *
 * @example
 * <PositionProgressCompact
 *   currentStage="proceso"
 *   slaStatus="at_risk"
 * />
 */
export function PositionProgressCompact({
  currentStage,
  slaStatus,
  className,
}: PositionProgressCompactProps) {
  const stageConfig = PIPELINE_STAGES[currentStage];
  const slaConfig = slaStatus ? SLA_STYLES[slaStatus] : null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      {/* Badge de etapa */}
      <span
        className={cn(
          "inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium",
          stageConfig.bgColor,
          "text-white"
        )}
      >
        {stageConfig.label}
      </span>

      {/* Indicador de SLA */}
      {slaConfig && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className={cn("shrink-0", slaConfig.color)}>
                {(() => {
                  const Icon = slaConfig.icon;
                  return <Icon className="h-4 w-4" />;
                })()}
              </span>
            </TooltipTrigger>
            <TooltipContent side="top">
              <p>{slaConfig.label}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { PIPELINE_STAGES, SLA_STYLES, STAGE_ORDER };
