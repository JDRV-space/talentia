"use client";

import { Card, CardContent } from "@/components/ui/card";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { motion } from "framer-motion";

/**
 * Variantes de color para el KPI card
 * Siguiendo la paleta del proyecto: teal primary, lime success, amber warning, rose error
 */
type KPIVariant = "default" | "success" | "warning" | "error";

interface KPICardProps {
  /** Título del KPI */
  title: string;
  /** Valor principal a mostrar */
  value: string | number;
  /** Subtitulo opcional (por ejemplo: "vs mes anterior") */
  subtitle?: string;
  /** Dirección de la tendencia: up, down, o neutral */
  trend?: "up" | "down" | "neutral";
  /** Texto de la tendencia (por ejemplo: "+12%") */
  trendValue?: string;
  /** Variante de color */
  variant?: KPIVariant;
  /** Icono opcional para mostrar */
  icon?: React.ReactNode;
}

/**
 * Mapeo de variantes a clases de Tailwind
 */
const variantStyles: Record<KPIVariant, { bg: string; text: string; icon: string }> = {
  default: {
    bg: "bg-card",
    text: "text-card-foreground",
    icon: "text-teal-600",
  },
  success: {
    bg: "bg-lime-50 dark:bg-lime-950/30",
    text: "text-lime-700 dark:text-lime-400",
    icon: "text-lime-600",
  },
  warning: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    text: "text-amber-700 dark:text-amber-400",
    icon: "text-amber-600",
  },
  error: {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    text: "text-rose-700 dark:text-rose-400",
    icon: "text-rose-600",
  },
};

/**
 * Colores de tendencia
 */
const trendStyles = {
  up: "text-lime-600 dark:text-lime-400",
  down: "text-rose-600 dark:text-rose-400",
  neutral: "text-stone-500 dark:text-stone-400",
};

/**
 * Iconos de tendencia
 */
const TrendIcon = ({ trend }: { trend: "up" | "down" | "neutral" }) => {
  const iconClass = "h-4 w-4";

  switch (trend) {
    case "up":
      return <ArrowUp className={iconClass} />;
    case "down":
      return <ArrowDown className={iconClass} />;
    case "neutral":
      return <Minus className={iconClass} />;
  }
};

/**
 * Componente KPI Card para mostrar métricas clave en el dashboard
 *
 * @example
 * <KPICard
 *   title="Posiciones Abiertas"
 *   value={42}
 *   trend="up"
 *   trendValue="+5"
 *   subtitle="vs semana anterior"
 *   variant="default"
 * />
 */
/**
 * Create a motion-enabled Card component
 */
const MotionCard = motion.create(Card);

export function KPICard({
  title,
  value,
  subtitle,
  trend,
  trendValue,
  variant = "default",
  icon,
}: KPICardProps) {
  const styles = variantStyles[variant];

  return (
    <MotionCard
      className={cn("overflow-hidden", styles.bg)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
      whileHover={{ scale: 1.02, transition: { duration: 0.2 } }}
    >
      <CardContent className="p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Título */}
            <p className="text-sm font-medium text-muted-foreground">
              {title}
            </p>

            {/* Valor principal */}
            <p className={cn(
              "mt-2 text-3xl font-bold tracking-tight",
              variant !== "default" ? styles.text : "text-foreground"
            )}>
              {value}
            </p>

            {/* Tendencia y subtitulo */}
            {(trend || subtitle) && (
              <div className="mt-2 flex items-center gap-2">
                {trend && (
                  <div className={cn(
                    "flex items-center gap-1 text-sm font-medium",
                    trendStyles[trend]
                  )}>
                    <TrendIcon trend={trend} />
                    {trendValue && <span>{trendValue}</span>}
                  </div>
                )}
                {subtitle && (
                  <span className="text-sm text-muted-foreground">
                    {subtitle}
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Icono opcional */}
          {icon && (
            <div className={cn(
              "rounded-lg p-2",
              variant === "default"
                ? "bg-teal-100 dark:bg-teal-900/30"
                : "bg-white/50 dark:bg-black/20"
            )}>
              <div className={styles.icon}>
                {icon}
              </div>
            </div>
          )}
        </div>
      </CardContent>
    </MotionCard>
  );
}
