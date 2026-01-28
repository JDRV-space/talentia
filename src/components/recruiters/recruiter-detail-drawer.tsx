"use client";

import * as React from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  User,
  Mail,
  MapPin,
  Briefcase,
  TrendingUp,
  Clock,
  Loader2,
  AlertTriangle,
  CheckCircle,
  Circle,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

interface RecruiterDetail {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  primary_zone: string;
  secondary_zones: string[];
  capability_level: number;
  capacity: number;
  current_load: number;
  fill_rate_30d: number;
  avg_time_to_fill: number;
  is_active: boolean;
  utilization_percent: number;
  is_overloaded: boolean;
  positions_count: {
    open: number;
    in_progress: number;
    interviewing: number;
    filled: number;
    cancelled: number;
  };
}

interface PositionSummary {
  id: string;
  external_id: string | null;
  title: string;
  zone: string;
  level: string;
  priority: string;
  status: string;
  pipeline_stage: string | null;
  headcount: number;
  filled_count: number;
  opened_at: string;
  sla_deadline: string | null;
  days_in_process: number | null;
  is_on_time: boolean | null;
}

interface RecruiterDetailDrawerProps {
  recruiterId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Optional status filter - comma-separated: "open,in_progress" */
  statusFilter?: string;
}

// =============================================================================
// STATUS CONFIG
// =============================================================================

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof Circle }> = {
  open: { label: "Abierta", color: "text-sky-600 bg-sky-100", icon: Circle },
  in_progress: { label: "En progreso", color: "text-amber-600 bg-amber-100", icon: Clock },
  interviewing: { label: "Entrevistas", color: "text-violet-600 bg-violet-100", icon: User },
  filled: { label: "Cubierta", color: "text-lime-600 bg-lime-100", icon: CheckCircle },
  cancelled: { label: "Cancelada", color: "text-stone-600 bg-stone-100", icon: AlertTriangle },
  on_hold: { label: "En espera", color: "text-orange-600 bg-orange-100", icon: Clock },
};

const PRIORITY_CONFIG: Record<string, { label: string; color: string }> = {
  critical: { label: "Critica", color: "text-rose-600 border-rose-500" },
  high: { label: "Alta", color: "text-amber-600 border-amber-500" },
  medium: { label: "Media", color: "text-sky-600 border-sky-500" },
  low: { label: "Baja", color: "text-stone-600 border-stone-500" },
};

// =============================================================================
// COMPONENT
// =============================================================================

export function RecruiterDetailDrawer({
  recruiterId,
  open,
  onOpenChange,
  statusFilter,
}: RecruiterDetailDrawerProps) {
  const [recruiter, setRecruiter] = React.useState<RecruiterDetail | null>(null);
  const [positions, setPositions] = React.useState<PositionSummary[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Fetch recruiter detail and positions when drawer opens
  React.useEffect(() => {
    if (!recruiterId || !open) {
      setRecruiter(null);
      setPositions([]);
      return;
    }

    async function fetchData() {
      setIsLoading(true);
      setError(null);

      try {
        // Build positions URL with optional status filter
        const positionsUrl = statusFilter
          ? `/api/recruiters/${recruiterId}/positions?status=${statusFilter}`
          : `/api/recruiters/${recruiterId}/positions`;

        // Fetch recruiter detail and positions in parallel
        const [recruiterRes, positionsRes] = await Promise.all([
          fetch(`/api/recruiters/${recruiterId}`),
          fetch(positionsUrl),
        ]);

        const [recruiterData, positionsData] = await Promise.all([
          recruiterRes.json(),
          positionsRes.json(),
        ]);

        if (!recruiterRes.ok || !recruiterData.success) {
          throw new Error(recruiterData.error || "Error al cargar reclutador");
        }

        setRecruiter(recruiterData.data);
        setPositions(positionsData.success ? positionsData.data : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setIsLoading(false);
      }
    }

    fetchData();
  }, [recruiterId, open, statusFilter]);

  // Format date to Spanish locale
  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("es-PE", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto px-6">
        {isLoading && (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
          </div>
        )}

        {error && (
          <div className="flex h-full items-center justify-center">
            <p className="text-rose-600">{error}</p>
          </div>
        )}

        {!isLoading && !error && recruiter && (
          <>
            <SheetHeader>
              <div className="flex items-center gap-3">
                <div
                  className={cn(
                    "flex h-12 w-12 items-center justify-center rounded-full",
                    recruiter.is_overloaded
                      ? "bg-rose-100 dark:bg-rose-900/30"
                      : "bg-teal-100 dark:bg-teal-900/30"
                  )}
                >
                  <User
                    className={cn(
                      "h-6 w-6",
                      recruiter.is_overloaded
                        ? "text-rose-600"
                        : "text-teal-600"
                    )}
                  />
                </div>
                <div>
                  <SheetTitle className="text-lg">{recruiter.name}</SheetTitle>
                  <SheetDescription className="flex items-center gap-1">
                    <Mail className="h-3 w-3" />
                    {recruiter.email}
                  </SheetDescription>
                </div>
              </div>
            </SheetHeader>

            <div className="mt-6 space-y-6">
              {/* Load Status */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Carga actual</span>
                  <span
                    className={cn(
                      "text-lg font-bold",
                      recruiter.is_overloaded
                        ? "text-rose-600"
                        : recruiter.utilization_percent >= 80
                        ? "text-amber-600"
                        : "text-teal-600"
                    )}
                  >
                    {recruiter.current_load} / {recruiter.capacity}
                  </span>
                </div>
                <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
                  <div
                    className={cn(
                      "h-full transition-all",
                      recruiter.is_overloaded
                        ? "bg-rose-500"
                        : recruiter.utilization_percent >= 80
                        ? "bg-amber-500"
                        : "bg-teal-500"
                    )}
                    style={{ width: `${Math.min(recruiter.utilization_percent, 100)}%` }}
                  />
                </div>
                <p className="mt-1 text-right text-xs text-muted-foreground">
                  {recruiter.utilization_percent}% de capacidad
                </p>
              </div>

              {/* Zones */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  Zonas asignadas
                </h4>
                <div className="flex flex-wrap gap-2">
                  <Badge className="bg-teal-600 hover:bg-teal-600">
                    {recruiter.primary_zone}
                  </Badge>
                  {recruiter.secondary_zones.map((zone) => (
                    <Badge key={zone} variant="secondary">
                      {zone}
                    </Badge>
                  ))}
                </div>
              </div>


              {/* Position Status Breakdown */}
              <div>
                <h4 className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <Briefcase className="h-4 w-4 text-muted-foreground" />
                  Desglose de posiciones
                </h4>
                <div className="space-y-2">
                  {Object.entries(recruiter.positions_count).map(([status, count]) => {
                    const config = STATUS_CONFIG[status];
                    if (!config || count === 0) return null;
                    const Icon = config.icon;
                    return (
                      <div
                        key={status}
                        className="flex items-center justify-between rounded-lg border px-3 py-2"
                      >
                        <div className="flex items-center gap-2">
                          <Icon className={cn("h-4 w-4", config.color.split(" ")[0])} />
                          <span className="text-sm">{config.label}</span>
                        </div>
                        <span className="font-medium">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Positions List */}
              <div>
                <h4 className="mb-3 text-sm font-medium">
                  Posiciones asignadas ({positions.length})
                </h4>
                {positions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No hay posiciones asignadas a este reclutador.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {positions.map((position) => {
                      const statusConfig = STATUS_CONFIG[position.status] || STATUS_CONFIG.open;
                      const priorityConfig = PRIORITY_CONFIG[position.priority] || PRIORITY_CONFIG.medium;
                      return (
                        <div
                          key={position.id}
                          className="rounded-lg border bg-card p-3 hover:bg-stone-50 dark:hover:bg-stone-900"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0 flex-1">
                              <p className="truncate font-medium">{position.title}</p>
                              <p className="text-xs text-muted-foreground">
                                {position.zone} - Nivel {position.level}
                              </p>
                            </div>
                            <Badge
                              variant="outline"
                              className={cn("shrink-0", priorityConfig.color)}
                            >
                              {priorityConfig.label}
                            </Badge>
                          </div>
                          <div className="mt-2 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-1">
                              <Badge
                                variant="secondary"
                                className={cn("text-xs", statusConfig.color)}
                              >
                                {statusConfig.label}
                              </Badge>
                            </div>
                            <span className="text-muted-foreground">
                              {position.filled_count}/{position.headcount} cubiertos
                            </span>
                          </div>
                          {position.days_in_process !== null && (
                            <div className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                              <Clock className="h-3 w-3" />
                              {position.days_in_process} días en proceso
                              {position.is_on_time === false && (
                                <AlertTriangle className="ml-1 h-3 w-3 text-amber-500" />
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
