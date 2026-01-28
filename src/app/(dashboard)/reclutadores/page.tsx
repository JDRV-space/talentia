"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/layout/header";
import {
  SimpleRecruiterCard,
  calculateWorkloadStatus,
  type SimpleRecruiterCardData,
} from "@/components/recruiters/recruiter-card-simple";
import { WorkloadChart, type WorkloadChartData } from "@/components/recruiters/workload-chart";
import { RecruiterDetailDrawer } from "@/components/recruiters/recruiter-detail-drawer";
import { RedistributionDialog } from "@/components/recruiters/redistribution-dialog";
import type { RecruiterForRedistribution } from "@/lib/algorithms/redistribution";
import {
  UserCheck,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

// =============================================================================
// TYPES
// =============================================================================

interface ApiRecruiter {
  id: string;
  name: string;
  email: string;
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
  };
}

interface ApiResponse {
  success: boolean;
  data: ApiRecruiter[];
  summary: {
    total_recruiters: number;
    total_active_positions: number;
    avg_load: number;
    overloaded_count: number;
  };
  error?: string;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Maps API recruiter data to SimpleRecruiterCardData format
 */
function mapToSimpleCardData(apiRecruiter: ApiRecruiter): SimpleRecruiterCardData {
  return {
    id: apiRecruiter.id,
    name: apiRecruiter.name,
    primary_zone: apiRecruiter.primary_zone as SimpleRecruiterCardData["primary_zone"],
    current_load: apiRecruiter.current_load,
    is_active: apiRecruiter.is_active,
  };
}

/**
 * Transforms recruiter data for the workload chart
 */
function toWorkloadChartData(recruiters: SimpleRecruiterCardData[], capacity: number = 25): WorkloadChartData[] {
  return recruiters
    .filter((r) => r.is_active)
    .map((r) => ({
      id: r.id,
      name: r.name.split(" ").slice(0, 2).join(" "), // First name + last name only
      current_load: r.current_load,
      max_capacity: capacity,
    }));
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

/**
 * Reclutadores page - Simplified workload distribution visualization
 *
 * This page shows:
 * - Summary stats (total recruiters, avg load, overloaded count)
 * - Workload distribution chart (horizontal bar chart)
 * - Grid of recruiter cards with workload indicators
 */
export default function ReclutadoresPage() {
  // Router for navigation
  const router = useRouter();

  // State
  const [recruiters, setRecruiters] = React.useState<SimpleRecruiterCardData[]>([]);
  const [summary, setSummary] = React.useState({
    total_recruiters: 0,
    total_active_positions: 0,
    avg_load: 0,
    overloaded_count: 0,
  });
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedRecruiterId, setSelectedRecruiterId] = React.useState<string | null>(null);
  const [drawerStatusFilter, setDrawerStatusFilter] = React.useState<string | undefined>(undefined);
  const [isRedistributionDialogOpen, setIsRedistributionDialogOpen] = React.useState(false);
  const [fullRecruitersData, setFullRecruitersData] = React.useState<ApiRecruiter[]>([]);

  // Fetch recruiters from API
  const fetchRecruiters = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/recruiters");
      const result: ApiResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar reclutadores");
      }

      const mappedRecruiters = result.data.map(mapToSimpleCardData);
      setRecruiters(mappedRecruiters);
      setFullRecruitersData(result.data);
      setSummary(result.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar reclutadores");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchRecruiters();
  }, [fetchRecruiters]);

  // Derived data for chart
  const chartData = React.useMemo(() => toWorkloadChartData(recruiters), [recruiters]);

  // Handle card click to open drawer (shows only active positions, excludes filled/cubierta)
  const handleRecruiterClick = (recruiterId: string) => {
    setDrawerStatusFilter("open,in_progress"); // Only active cases, exclude filled/cubierta
    setSelectedRecruiterId(recruiterId);
  };

  // Handle "Ver casos" button - open drawer with only open/in_progress cases
  // Filters out filled/cubierta positions
  const handleViewCases = (recruiterId: string) => {
    setDrawerStatusFilter("open,in_progress"); // Only active cases
    setSelectedRecruiterId(recruiterId);
  };

  // Handle redistribution button - navigate to asignaciones
  const handleRedistribute = () => {
    router.push("/asignaciones");
  };

  // Map full recruiter data to redistribution format
  const recruitersForRedistribution: RecruiterForRedistribution[] = React.useMemo(() => {
    return fullRecruitersData.map((r) => ({
      id: r.id,
      name: r.name,
      primary_zone: r.primary_zone,
      secondary_zones: r.secondary_zones || [],
      current_load: r.current_load,
      capacity: r.capacity,
    }));
  }, [fullRecruitersData]);

  // Calculate overloaded count based on > 1.5x average
  const overloadedCount = React.useMemo(() => {
    if (summary.avg_load === 0) return 0;
    return recruiters.filter((r) => {
      const status = calculateWorkloadStatus(r.current_load, summary.avg_load, r.is_active);
      return status === "critical" || status === "warning";
    }).length;
  }, [recruiters, summary.avg_load]);

  // Loading state
  if (isLoading) {
    return (
      <>
        <Header title="Reclutadores" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando reclutadores...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <Header title="Reclutadores" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <p className="text-rose-600">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fetchRecruiters()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <Header title="Reclutadores" />
      <div className="flex flex-1 flex-col gap-6 p-4">
        {/* Page description */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-2xl font-semibold text-card-foreground">
            Distribución de Carga de Trabajo
          </h2>
          <p className="mt-2 text-muted-foreground">
            Visualiza la carga de trabajo de cada reclutador. Los indicadores de color
            muestran si un reclutador tiene más casos que el promedio del equipo.
          </p>
        </div>

        {/* Summary Stats */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <UserCheck className="h-4 w-4 text-teal-600" />
              <h3 className="text-sm font-medium text-muted-foreground">
                Total reclutadores
              </h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-card-foreground">
              {summary.total_recruiters}
            </p>
            <p className="text-xs text-muted-foreground">activos en el sistema</p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <BarChart3 className="h-4 w-4 text-sky-600" />
              <h3 className="text-sm font-medium text-muted-foreground">
                Carga promedio
              </h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-card-foreground">
              {summary.avg_load}
            </p>
            <p className="text-xs text-muted-foreground">
              casos por reclutador
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-medium text-muted-foreground">
                Sobrecargados
              </h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-card-foreground">
              <span
                className={
                  overloadedCount > 0
                    ? "text-rose-600 dark:text-rose-400"
                    : "text-lime-600 dark:text-lime-400"
                }
              >
                {overloadedCount}
              </span>
            </p>
            <p className="text-xs text-muted-foreground">
              sobre el promedio
            </p>
          </div>

          <div className="rounded-lg border bg-card p-4">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-lime-600" />
              <h3 className="text-sm font-medium text-muted-foreground">
                Casos activos
              </h3>
            </div>
            <p className="mt-2 text-2xl font-bold text-card-foreground">
              {summary.total_active_positions}
            </p>
            <p className="text-xs text-muted-foreground">abiertos + en progreso</p>
          </div>
        </div>

        {/* Workload Chart */}
        {chartData.length > 0 && <WorkloadChart data={chartData} />}

        {/* Quick Reassign Action */}
        {overloadedCount > 0 && (
          <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-amber-600" />
              <div>
                <p className="font-medium text-amber-800 dark:text-amber-200">
                  {overloadedCount} reclutador{overloadedCount > 1 ? "es" : ""}{" "}
                  sobrecargado{overloadedCount > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                  Tienen más de 1.5x el promedio de casos del equipo
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              className="border-amber-500 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900/50"
              onClick={handleRedistribute}
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Redistribuir
            </Button>
          </div>
        )}

        {/* Empty state */}
        {recruiters.length === 0 && (
          <div className="rounded-lg border bg-card p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-stone-100 p-4 dark:bg-stone-800">
                <UserCheck className="h-8 w-8 text-stone-500 dark:text-stone-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-card-foreground">
                No hay reclutadores
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                Aun no se han cargado reclutadores al sistema. Sube un archivo Excel
                con la informacion de reclutadores desde la pagina de Subir Excel.
              </p>
            </div>
          </div>
        )}

        {/* Recruiter Cards Grid */}
        {recruiters.length > 0 && (
          <div>
            <h3 className="mb-4 text-lg font-semibold text-card-foreground">
              Equipo de Reclutamiento
            </h3>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {recruiters.map((recruiter) => {
                const workloadStatus = calculateWorkloadStatus(
                  recruiter.current_load,
                  summary.avg_load,
                  recruiter.is_active
                );

                return (
                  <div
                    key={recruiter.id}
                    onClick={() => handleRecruiterClick(recruiter.id)}
                    className="cursor-pointer"
                  >
                    <SimpleRecruiterCard
                      recruiter={recruiter}
                      workloadStatus={workloadStatus}
                      onViewCases={handleViewCases}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Recruiter Detail Drawer */}
      <RecruiterDetailDrawer
        recruiterId={selectedRecruiterId}
        open={selectedRecruiterId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRecruiterId(null);
            setDrawerStatusFilter(undefined);
          }
        }}
        statusFilter={drawerStatusFilter}
      />

      {/* Redistribution Dialog */}
      <RedistributionDialog
        open={isRedistributionDialogOpen}
        onOpenChange={setIsRedistributionDialogOpen}
        recruiters={recruitersForRedistribution}
        onConfirm={(_proposal) => {
          // Redistribution API call not yet implemented
        }}
      />
    </>
  );
}
