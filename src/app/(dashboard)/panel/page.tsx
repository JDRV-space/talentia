"use client";

import { useEffect, useState } from "react";
import { Header } from "@/components/layout/header";
import { KPICard } from "@/components/dashboard/kpi-card";
import { DuplicateAlert } from "@/components/dashboard/duplicate-alert";
import { PipelineSummary, type PipelineStageData } from "@/components/dashboard/pipeline-summary";
import { Briefcase, Users, AlertTriangle, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { RECRUITER_HARD_CAP } from "@/types/constants";

// =============================================================================
// TYPES
// =============================================================================

interface OverloadedRecruiter {
  name: string;
  casos: number;
}

interface DashboardStats {
  // Core metrics (simplified)
  casosAbiertos: number;
  sinAsignar: number;
  reclutadores: number;
  sobrecargados: OverloadedRecruiter[];

  // Legacy metrics
  totalPositions: number;
  unassignedPositions: number;
  overduePositions: number;
  filledThisMonth: number;
  inProcess: number;
  selectedCount: number;
  avgDaysToFill: number;
  slaCompliancePercent: number;
  pipeline: {
    vacante: number;
    proceso: number;
    seleccionado: number;
    contratado: number;
  };
  recruiterLoad: Array<{
    name: string;
    zone: string;
    activePositions: number;
    capacity: number;
    loadPercent: number;
  }>;
  duplicateCandidates: number;
  lastUploadDate: string | null;
  dataSource: 'excel' | 'empty';
  dataAsOfDate: string | null;
  dataAsOfSource: string | null;
  recruitersOverCapacity: number;
}

// =============================================================================
// COMPONENTE DE PAGINA
// =============================================================================

/**
 * Pagina principal del dashboard (Panel)
 *
 * Layout simplificado:
 * - Fila de 4 KPIs: Activas, Vacantes, Duplicados, Recruiters sobrecarga
 * - Pipeline de reclutamiento
 * - Alerta de duplicados
 * - Boton: Ver posiciones sin asignar
 */
export default function PanelPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        const response = await fetch('/api/dashboard/stats');
        const data = await response.json();

        if (data.success) {
          setStats(data.data);
        } else {
          setError(data.error || 'Error al cargar estadísticas');
        }
      } catch (err) {
        setError('Error de conexion');
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  // Loading state
  if (loading) {
    return (
      <>
        <Header title="Panel Principal" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando estadísticas...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <Header title="Panel Principal" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />
            <p className="mt-2 text-muted-foreground">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Reintentar
            </Button>
          </div>
        </div>
      </>
    );
  }

  // Empty state - no data uploaded yet
  if (!stats || stats.dataSource === 'empty') {
    return (
      <>
        <Header title="Panel Principal" />
        <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
          {/* Mensaje de bienvenida */}
          <div className="rounded-lg border bg-card p-4">
            <h2 className="text-xl font-semibold text-card-foreground">
              Bienvenido
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Sistema de gestión de reclutamiento
            </p>
          </div>

          {/* Empty state card */}
          <div className="flex flex-1 items-center justify-center rounded-lg border bg-card p-12">
            <div className="text-center max-w-md">
              <Upload className="mx-auto h-12 w-12 text-muted-foreground/50" />
              <h3 className="mt-4 text-lg font-semibold">
                No hay datos cargados
              </h3>
              <p className="mt-2 text-muted-foreground">
                Sube el archivo Excel CONSOLIDADO para ver las estadísticas del dashboard.
              </p>
              <Button asChild className="mt-6 bg-teal-600 hover:bg-teal-700">
                <Link href="/subir">
                  <Upload className="mr-2 h-4 w-4" />
                  Subir Excel
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </>
    );
  }

  // Calculate pipeline data
  const total = stats.casosAbiertos + stats.filledThisMonth;
  const pipelineData: PipelineStageData[] = [
    {
      stage: "vacante",
      count: stats.pipeline.vacante,
      percentage: total > 0 ? Math.round((stats.pipeline.vacante / total) * 100) : 0,
    },
    {
      stage: "proceso",
      count: stats.pipeline.proceso,
      percentage: total > 0 ? Math.round((stats.pipeline.proceso / total) * 100) : 0,
    },
    {
      stage: "seleccionado",
      count: stats.pipeline.seleccionado,
      percentage: total > 0 ? Math.round((stats.pipeline.seleccionado / total) * 100) : 0,
    },
    {
      stage: "contratado",
      count: stats.pipeline.contratado,
      percentage: total > 0 ? Math.round((stats.pipeline.contratado / total) * 100) : 0,
    },
  ];

  // Format data as of date (extracted from Excel file)
  const dataAsOfFormatted = stats.dataAsOfDate
    ? new Date(stats.dataAsOfDate).toLocaleDateString('es-PE', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      })
    : null;

  // Use the new sobrecargados array from API (recruiters with > 2x average cases)
  const sobrecargadosCount = stats.sobrecargados?.length || 0;

  return (
    <>
      <Header title="Panel Principal" />
      <div className="flex flex-1 flex-col gap-6 p-4 md:p-6">
        {/* Mensaje de bienvenida con fecha de datos */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-card-foreground">
                Bienvenido
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Sistema de gestión de reclutamiento
              </p>
            </div>
            {dataAsOfFormatted && (
              <div className="text-right">
                <p className="text-sm font-medium text-card-foreground">
                  Datos al: {dataAsOfFormatted}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Fila de 3 KPIs principales (simplified) */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <KPICard
            title="Casos Abiertos"
            value={stats.casosAbiertos}
            subtitle={stats.sinAsignar > 0 ? `(${stats.sinAsignar} sin asignar)` : "Todos asignados"}
            variant={stats.sinAsignar > 0 ? "warning" : "default"}
            icon={<Briefcase className="h-5 w-5" />}
          />
          <KPICard
            title="Reclutadores"
            value={stats.reclutadores}
            subtitle="Con casos activos"
            icon={<Users className="h-5 w-5" />}
          />
          <div
            className="cursor-pointer"
            onClick={() => window.location.href = "/asignaciones"}
          >
            <KPICard
              title="Sobrecargados"
              value={sobrecargadosCount}
              subtitle={sobrecargadosCount > 0 ? `${RECRUITER_HARD_CAP}+ casos` : "Ninguno"}
              variant={sobrecargadosCount > 0 ? "error" : "success"}
              icon={<AlertTriangle className="h-5 w-5" />}
            />
          </div>
        </div>

        {/* Detalle de sobrecargados si hay alguno */}
        {stats.sobrecargados && stats.sobrecargados.length > 0 && (
          <div
            className="rounded-lg border bg-red-50 p-4 cursor-pointer hover:bg-red-100 transition-colors"
            onClick={() => window.location.href = "/asignaciones"}
          >
            <h3 className="text-sm font-semibold text-red-800 mb-2">
              Reclutadores Sobrecargados ({RECRUITER_HARD_CAP}+ casos)
            </h3>
            <div className="space-y-1">
              {stats.sobrecargados.map((r, idx) => (
                <div key={idx} className="flex justify-between text-sm text-red-700">
                  <span>{r.name}</span>
                  <span className="font-medium">{r.casos} casos</span>
                </div>
              ))}
            </div>
            <p className="text-xs text-red-600 mt-2">Click para ir a Asignaciones</p>
          </div>
        )}

        {/* Pipeline y Duplicados en 2 columnas */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Pipeline de reclutamiento - ocupa 2 columnas */}
          <div className="lg:col-span-2">
            <PipelineSummary
              data={pipelineData}
              total={total}
              title="Pipeline de Reclutamiento"
            />
          </div>

          {/* Alerta de duplicados */}
          <div className="lg:col-span-1">
            <DuplicateAlert />
          </div>
        </div>

      </div>
    </>
  );
}
