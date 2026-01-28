"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AlertTriangle, Clock, UserX, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

/**
 * Tipos de alertas del dashboard
 */
type AlertType = "sla_overdue" | "sla_at_risk" | "unassigned";

/**
 * Datos de una alerta
 */
interface AlertData {
  id: string;
  type: AlertType;
  title: string;
  message: string;
  /** ID de la posición afectada */
  position_id: string;
  /** Nombre de la posición para mostrar */
  position_title: string;
  /** Fecha de creación de la alerta */
  created_at: string;
}

interface AlertsListProps {
  /** Array de alertas activas */
  alerts: AlertData[];
  /** Título del componente */
  title?: string;
}

/**
 * Estilos según tipo de alerta
 */
const alertStyles: Record<AlertType, {
  icon: typeof AlertTriangle;
  bg: string;
  border: string;
  iconColor: string;
  textColor: string;
  label: string;
}> = {
  sla_overdue: {
    icon: Clock,
    bg: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-l-rose-500",
    iconColor: "text-rose-600 dark:text-rose-400",
    textColor: "text-rose-700 dark:text-rose-300",
    label: "SLA Vencido",
  },
  sla_at_risk: {
    icon: AlertTriangle,
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-l-amber-500",
    iconColor: "text-amber-600 dark:text-amber-400",
    textColor: "text-amber-700 dark:text-amber-300",
    label: "SLA En Riesgo",
  },
  unassigned: {
    icon: UserX,
    bg: "bg-stone-100 dark:bg-stone-900/50",
    border: "border-l-stone-400",
    iconColor: "text-stone-600 dark:text-stone-400",
    textColor: "text-stone-700 dark:text-stone-300",
    label: "Sin Asignar",
  },
};

/**
 * Formatea el tiempo transcurrido desde la creación
 */
function formatTimeAgo(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays > 0) {
    return `hace ${diffDays} ${diffDays === 1 ? "día" : "días"}`;
  }
  if (diffHours > 0) {
    return `hace ${diffHours} ${diffHours === 1 ? "hora" : "horas"}`;
  }
  if (diffMins > 0) {
    return `hace ${diffMins} ${diffMins === 1 ? "minuto" : "minutos"}`;
  }
  return "ahora";
}

/**
 * Componente de item de alerta individual
 */
function AlertItem({ alert }: { alert: AlertData }) {
  const style = alertStyles[alert.type];
  const Icon = style.icon;

  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-r-lg border-l-4 p-4 transition-colors",
        style.bg,
        style.border,
        "hover:bg-opacity-80"
      )}
    >
      {/* Icono */}
      <div className={cn("mt-0.5 shrink-0", style.iconColor)}>
        <Icon className="h-5 w-5" />
      </div>

      {/* Contenido */}
      <div className="flex-1 min-w-0">
        {/* Tipo de alerta y tiempo */}
        <div className="flex items-center justify-between gap-2 mb-1">
          <span className={cn("text-xs font-semibold uppercase", style.textColor)}>
            {style.label}
          </span>
          <span className="text-xs text-muted-foreground shrink-0">
            {formatTimeAgo(alert.created_at)}
          </span>
        </div>

        {/* Título */}
        <p className="font-medium text-foreground text-sm">
          {alert.title}
        </p>

        {/* Mensaje */}
        <p className="text-sm text-muted-foreground mt-1">
          {alert.message}
        </p>

        {/* Link a la posición */}
        <Link
          href={`/posiciones/${alert.position_id}`}
          className={cn(
            "inline-flex items-center gap-1 mt-2 text-sm font-medium transition-colors",
            "text-teal-600 hover:text-teal-700 dark:text-teal-400 dark:hover:text-teal-300"
          )}
        >
          Ver posición
          <ExternalLink className="h-3 w-3" />
        </Link>
      </div>
    </div>
  );
}

/**
 * Componente que muestra la lista de alertas activas del sistema.
 *
 * Tipos de alertas:
 * - SLA Vencido (rojo): Posiciones que excedieron su fecha límite
 * - SLA En Riesgo (amarillo): Posiciones próximas a vencer
 * - Sin Asignar (gris): Posiciones que no tienen reclutador asignado
 *
 * @example
 * <AlertsList
 *   alerts={[
 *     {
 *       id: '1',
 *       type: 'sla_overdue',
 *       title: 'Operario - Trujillo',
 *       message: 'SLA vencido hace 2 días',
 *       position_id: 'pos-123',
 *       position_title: 'Operario de Campo',
 *       created_at: '2024-01-10T10:00:00Z',
 *     },
 *   ]}
 * />
 */
export function AlertsList({
  alerts,
  title = "Alertas Activas",
}: AlertsListProps) {
  // Ordenar alertas: primero las vencidas, luego en riesgo, luego sin asignar
  const priorityOrder: Record<AlertType, number> = {
    sla_overdue: 0,
    sla_at_risk: 1,
    unassigned: 2,
  };

  const sortedAlerts = [...alerts].sort((a, b) => {
    const priorityDiff = priorityOrder[a.type] - priorityOrder[b.type];
    if (priorityDiff !== 0) return priorityDiff;
    // Dentro del mismo tipo, ordenar por fecha (mas recientes primero)
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Contar por tipo
  const counts = {
    sla_overdue: alerts.filter((a) => a.type === "sla_overdue").length,
    sla_at_risk: alerts.filter((a) => a.type === "sla_at_risk").length,
    unassigned: alerts.filter((a) => a.type === "unassigned").length,
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between text-lg font-semibold">
          <span>{title}</span>
          {alerts.length > 0 && (
            <span className="rounded-full bg-rose-100 px-2 py-0.5 text-sm font-medium text-rose-700 dark:bg-rose-950 dark:text-rose-400">
              {alerts.length}
            </span>
          )}
        </CardTitle>

        {/* Resumen de alertas por tipo */}
        {alerts.length > 0 && (
          <div className="flex flex-wrap gap-3 text-sm">
            {counts.sla_overdue > 0 && (
              <span className="text-rose-600 dark:text-rose-400">
                {counts.sla_overdue} vencidos
              </span>
            )}
            {counts.sla_at_risk > 0 && (
              <span className="text-amber-600 dark:text-amber-400">
                {counts.sla_at_risk} en riesgo
              </span>
            )}
            {counts.unassigned > 0 && (
              <span className="text-stone-600 dark:text-stone-400">
                {counts.unassigned} sin asignar
              </span>
            )}
          </div>
        )}
      </CardHeader>
      <CardContent>
        {alerts.length === 0 ? (
          <div className="flex h-32 flex-col items-center justify-center text-center">
            <div className="rounded-full bg-lime-100 p-3 dark:bg-lime-950/50">
              <AlertTriangle className="h-6 w-6 text-lime-600 dark:text-lime-400" />
            </div>
            <p className="mt-3 font-medium text-foreground">Sin alertas</p>
            <p className="text-sm text-muted-foreground">
              Todo está funcionando correctamente
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAlerts.map((alert) => (
              <AlertItem key={alert.id} alert={alert} />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
