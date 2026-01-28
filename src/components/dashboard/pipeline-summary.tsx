"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";
import { Users, TrendingUp, ChevronRight } from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

/**
 * Etapas del pipeline de reclutamiento
 */
export type PipelineStage = "vacante" | "proceso" | "seleccionado" | "contratado";

/**
 * Datos de una etapa del pipeline
 */
export interface PipelineStageData {
  /** Identificador de la etapa */
  stage: PipelineStage;
  /** Numero de candidatos/posiciones en esta etapa */
  count: number;
  /** Porcentaje respecto al total */
  percentage: number;
}

/**
 * Props del componente PipelineSummary
 */
export interface PipelineSummaryProps {
  /** Datos de cada etapa del pipeline */
  data: PipelineStageData[];
  /** Total de posiciones */
  total?: number;
  /** Titulo del componente */
  title?: string;
  /** Callback al hacer click en una etapa */
  onStageClick?: (stage: PipelineStage) => void;
  /** Etapa actualmente seleccionada/filtrada */
  selectedStage?: PipelineStage | null;
  /** Clase CSS adicional */
  className?: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

/**
 * Configuracion visual de cada etapa
 */
const STAGE_CONFIG: Record<PipelineStage, {
  label: string;
  description: string;
  color: string;
  bgColor: string;
  bgColorLight: string;
  borderColor: string;
  hoverBg: string;
}> = {
  vacante: {
    label: "Vacante",
    description: "Posiciones abiertas",
    color: "text-sky-600 dark:text-sky-400",
    bgColor: "bg-sky-500",
    bgColorLight: "bg-sky-100 dark:bg-sky-950/30",
    borderColor: "border-sky-500",
    hoverBg: "hover:bg-sky-50 dark:hover:bg-sky-950/20",
  },
  proceso: {
    label: "En Proceso",
    description: "Evaluando candidatos",
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-500",
    bgColorLight: "bg-amber-100 dark:bg-amber-950/30",
    borderColor: "border-amber-500",
    hoverBg: "hover:bg-amber-50 dark:hover:bg-amber-950/20",
  },
  seleccionado: {
    label: "Seleccionado",
    description: "Tramites pendientes",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-500",
    bgColorLight: "bg-teal-100 dark:bg-teal-950/30",
    borderColor: "border-teal-500",
    hoverBg: "hover:bg-teal-50 dark:hover:bg-teal-950/20",
  },
  contratado: {
    label: "Contratado",
    description: "Posiciones cubiertas",
    color: "text-lime-600 dark:text-lime-400",
    bgColor: "bg-lime-500",
    bgColorLight: "bg-lime-100 dark:bg-lime-950/30",
    borderColor: "border-lime-500",
    hoverBg: "hover:bg-lime-50 dark:hover:bg-lime-950/20",
  },
};

/**
 * Orden de etapas para el funnel
 */
const STAGE_ORDER: PipelineStage[] = ["vacante", "proceso", "seleccionado", "contratado"];

// =============================================================================
// SUB-COMPONENTS
// =============================================================================

/**
 * Create motion-enabled elements
 */
const MotionCard = motion.create(Card);

/**
 * Item individual del funnel
 */
interface FunnelItemProps {
  stage: PipelineStage;
  count: number;
  percentage: number;
  isSelected: boolean;
  onClick?: () => void;
  index: number;
}

function FunnelItem({
  stage,
  count,
  percentage,
  isSelected,
  onClick,
  index,
}: FunnelItemProps) {
  const config = STAGE_CONFIG[stage];
  // Ancho de la barra basado en el porcentaje real
  // Si es 0, mostrar solo un pequeño indicador (2%)
  // Si es >0, mostrar mínimo 8% para visibilidad
  const barWidth = percentage === 0 ? 2 : Math.max(percentage, 8);

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: index * 0.1 }}
      className={cn(
        "w-full text-left p-3 rounded-lg border-2 transition-all duration-200",
        "focus:outline-none focus:ring-2 focus:ring-teal-500 focus:ring-offset-2",
        onClick && "cursor-pointer",
        !onClick && "cursor-default",
        isSelected
          ? [config.bgColorLight, config.borderColor]
          : ["border-transparent", config.hoverBg]
      )}
    >
      <div className="flex items-center justify-between mb-2">
        {/* Label y descripcion */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className={cn("font-semibold", config.color)}>
              {config.label}
            </span>
            {isSelected && (
              <span className="text-xs bg-teal-600 text-white px-1.5 py-0.5 rounded">
                Filtrado
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground truncate">
            {config.description}
          </p>
        </div>

        {/* Contador y porcentaje */}
        <div className="text-right shrink-0 ml-2">
          <p className={cn("text-2xl font-bold", config.color)}>{count}</p>
          <p className="text-xs text-muted-foreground">{percentage.toFixed(0)}%</p>
        </div>
      </div>

      {/* Barra de progreso visual */}
      <div className="h-2 bg-stone-100 dark:bg-stone-800 rounded-full overflow-hidden">
        <motion.div
          className={cn("h-full rounded-full", config.bgColor)}
          initial={{ width: 0 }}
          animate={{ width: `${barWidth}%` }}
          transition={{ duration: 0.5, delay: index * 0.1 + 0.2 }}
        />
      </div>
    </motion.button>
  );
}

/**
 * Flecha conectora entre etapas
 */
function StageConnector() {
  return (
    <div className="flex items-center justify-center py-1">
      <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
    </div>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

/**
 * Componente de resumen visual del pipeline de reclutamiento
 *
 * Muestra un funnel con las etapas del proceso de reclutamiento,
 * incluyendo conteo y porcentaje de posiciones en cada etapa.
 * Permite filtrar al hacer click en cada etapa.
 *
 * Etapas del pipeline:
 * - Vacante: Posiciones abiertas, sin candidato seleccionado
 * - En Proceso: Candidatos siendo evaluados activamente
 * - Seleccionado: Candidato elegido, tramites de contratacion en curso
 * - Contratado: Posicion exitosamente cubierta
 *
 * @example
 * <PipelineSummary
 *   data={[
 *     { stage: "vacante", count: 15, percentage: 37.5 },
 *     { stage: "proceso", count: 12, percentage: 30 },
 *     { stage: "seleccionado", count: 8, percentage: 20 },
 *     { stage: "contratado", count: 5, percentage: 12.5 },
 *   ]}
 *   total={40}
 *   onStageClick={(stage) => setFilter(stage)}
 *   selectedStage={currentFilter}
 * />
 */
export function PipelineSummary({
  data,
  total,
  title = "Pipeline de Reclutamiento",
  onStageClick,
  selectedStage,
  className,
}: PipelineSummaryProps) {
  // Calcular total si no se proporciona
  const calculatedTotal = total ?? data.reduce((sum, d) => sum + d.count, 0);

  // Obtener datos ordenados por etapa
  const orderedData = STAGE_ORDER.map((stage) => {
    const stageData = data.find((d) => d.stage === stage);
    return stageData ?? { stage, count: 0, percentage: 0 };
  });

  // Crear datos por defecto si no hay datos
  const hasData = data.length > 0 && calculatedTotal > 0;

  return (
    <MotionCard
      className={cn("overflow-hidden", className)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-lg font-semibold">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5 text-teal-600" />
            <span>{title}</span>
          </div>
          {calculatedTotal > 0 && (
            <span className="text-sm font-normal text-muted-foreground">
              {calculatedTotal} posiciones
            </span>
          )}
        </CardTitle>
      </CardHeader>

      <CardContent>
        {!hasData ? (
          // Estado vacio
          <div className="flex h-48 flex-col items-center justify-center text-center">
            <div className="rounded-full bg-stone-100 p-4 dark:bg-stone-800">
              <Users className="h-8 w-8 text-stone-400" />
            </div>
            <p className="mt-4 font-medium text-foreground">Sin datos del pipeline</p>
            <p className="text-sm text-muted-foreground">
              Los datos se mostraran cuando haya posiciones activas
            </p>
          </div>
        ) : (
          // Funnel visual
          <div className="space-y-1">
            {orderedData.map((stageData, index) => (
              <div key={stageData.stage}>
                <FunnelItem
                  stage={stageData.stage}
                  count={stageData.count}
                  percentage={stageData.percentage}
                  isSelected={selectedStage === stageData.stage}
                  onClick={onStageClick ? () => onStageClick(stageData.stage) : undefined}
                  index={index}
                />
                {index < orderedData.length - 1 && <StageConnector />}
              </div>
            ))}
          </div>
        )}

        {/* Boton para limpiar filtro */}
        {selectedStage && onStageClick && (
          <motion.button
            type="button"
            onClick={() => onStageClick(selectedStage)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className={cn(
              "w-full mt-4 py-2 text-sm font-medium text-center rounded-lg",
              "bg-stone-100 dark:bg-stone-800 text-muted-foreground",
              "hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
            )}
          >
            Limpiar filtro
          </motion.button>
        )}
      </CardContent>
    </MotionCard>
  );
}

// =============================================================================
// COMPACT VARIANT
// =============================================================================

/**
 * Props para la variante compacta
 */
export interface PipelineSummaryCompactProps {
  /** Datos de cada etapa del pipeline */
  data: PipelineStageData[];
  /** Callback al hacer click en una etapa */
  onStageClick?: (stage: PipelineStage) => void;
  /** Clase CSS adicional */
  className?: string;
}

/**
 * Variante compacta del resumen de pipeline
 *
 * Muestra una barra horizontal con las etapas del pipeline.
 * Ideal para uso en headers o espacios reducidos.
 *
 * @example
 * <PipelineSummaryCompact
 *   data={[
 *     { stage: "vacante", count: 15, percentage: 37.5 },
 *     { stage: "proceso", count: 12, percentage: 30 },
 *     { stage: "seleccionado", count: 8, percentage: 20 },
 *     { stage: "contratado", count: 5, percentage: 12.5 },
 *   ]}
 * />
 */
export function PipelineSummaryCompact({
  data,
  onStageClick,
  className,
}: PipelineSummaryCompactProps) {
  const total = data.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <div className={cn("flex items-center gap-2 text-sm text-muted-foreground", className)}>
        <Users className="h-4 w-4" />
        <span>Sin posiciones activas</span>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-4", className)}>
      {STAGE_ORDER.map((stage) => {
        const stageData = data.find((d) => d.stage === stage);
        const config = STAGE_CONFIG[stage];
        const count = stageData?.count ?? 0;

        return (
          <button
            key={stage}
            type="button"
            onClick={onStageClick ? () => onStageClick(stage) : undefined}
            disabled={!onStageClick}
            className={cn(
              "flex items-center gap-1.5 text-sm",
              onStageClick && "cursor-pointer hover:opacity-80 transition-opacity",
              !onStageClick && "cursor-default"
            )}
          >
            <span className={cn("h-2.5 w-2.5 rounded-full", config.bgColor)} />
            <span className="text-muted-foreground">{config.label}:</span>
            <span className={cn("font-semibold", config.color)}>{count}</span>
          </button>
        );
      })}
    </div>
  );
}

// =============================================================================
// EXPORTS
// =============================================================================

export { STAGE_CONFIG, STAGE_ORDER };
