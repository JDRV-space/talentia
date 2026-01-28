"use client";

import * as React from "react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Loader2,
  UserPlus,
  Check,
  AlertTriangle,
  User,
  Filter,
  X,
  Download,
  ChevronDown,
  RefreshCw,
  UserX,
  History,
  Info,
  ArrowRight,
  Undo2,
  Search,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { exportAllTabsToExcel } from "@/lib/excel/export";
import { SlaDeadlineBadge } from "@/components/positions/sla-deadline-badge";

// =============================================================================
// TYPES
// =============================================================================

type QueueType = "critical" | "tecnicos" | "empleados";
type TabType = "assigned" | "unassigned" | "reassigned";

interface Recruiter {
  id: string;
  name: string;
  score: number;
  current_load: number;
  explanation: string;
}

interface OpenPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  current_recruiter_id: string | null;
  current_recruiter_name: string | null;
  suggested_recruiters: Recruiter[];
  // Priority algorithm fields
  priority_score: number;
  queue: QueueType;
  // SLA fields for deadline calculation
  level: string;
  sla_days: number | null;
  sla_deadline: string | null;
}

interface UnassignedPosition {
  id: string;
  external_id: string | null;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  recruiter_name: string | null;
  suggested_recruiters: Recruiter[];
  priority_score: number;
  queue: QueueType;
  level: string;
  sla_days: number | null;
  sla_deadline: string | null;
  source: string | null;
}

interface ReassignedPosition {
  id: string;
  title: string;
  zone: string | null;
  priority: string;
  crop: string | null;
  headcount: number;
  opened_at: string;
  days_open: number;
  current_recruiter_id: string | null;
  current_recruiter_name: string | null;
  previous_recruiter_id: string | null;
  previous_recruiter_name: string | null;
  reassigned_at: string;
  suggested_recruiters: Recruiter[];
  priority_score: number;
  queue: QueueType;
  level: string;
  sla_days: number | null;
  sla_deadline: string | null;
}

interface ReassignmentConfirmation {
  positionId: string;
  positionTitle: string;
  currentRecruiter: string | null;
  newRecruiter: Recruiter;
}

interface UndoConfirmation {
  positionId: string;
  positionTitle: string;
  currentRecruiter: string | null;
  previousRecruiterId: string;
  previousRecruiterName: string;
}

// =============================================================================
// CONSTANTS
// =============================================================================

const QUEUE_CONFIG: Record<
  QueueType,
  { label: string; badgeClass: string; description: string }
> = {
  critical: {
    label: "Critico",
    badgeClass: "bg-rose-100 text-rose-700 border-rose-200",
    description: "SLA >80% consumido",
  },
  tecnicos: {
    label: "Tecnicos",
    badgeClass: "bg-amber-100 text-amber-700 border-amber-200",
    description: "Operarios y auxiliares",
  },
  empleados: {
    label: "Empleados",
    badgeClass: "bg-teal-100 text-teal-700 border-teal-200",
    description: "Asistentes y superiores",
  },
};

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function AsignacionesPage() {
  // Tab state
  const [activeTab, setActiveTab] = React.useState<TabType>("assigned");

  // Assigned positions state
  const [positions, setPositions] = React.useState<OpenPosition[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Unassigned positions state
  const [unassignedPositions, setUnassignedPositions] = React.useState<UnassignedPosition[]>([]);
  const [unassignedCount, setUnassignedCount] = React.useState(0);
  const [isLoadingUnassigned, setIsLoadingUnassigned] = React.useState(true);

  // Reassigned positions state
  const [reassignedPositions, setReassignedPositions] = React.useState<ReassignedPosition[]>([]);
  const [reassignedCount, setReassignedCount] = React.useState(0);
  const [isLoadingReassigned, setIsLoadingReassigned] = React.useState(true);

  // Assignment state
  const [assigning, setAssigning] = React.useState<string | null>(null);
  const [successMessage, setSuccessMessage] = React.useState<string | null>(null);

  // Confirmation dialog state
  const [confirmDialog, setConfirmDialog] = React.useState<ReassignmentConfirmation | null>(null);

  // Undo confirmation dialog state
  const [undoDialog, setUndoDialog] = React.useState<UndoConfirmation | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = React.useState<string>("");
  const [filterDaysOpen, setFilterDaysOpen] = React.useState<string>("all");
  const [filterZone, setFilterZone] = React.useState<string>("all");
  const [filterRecruiter, setFilterRecruiter] = React.useState<string>("all");
  const [filterQueue, setFilterQueue] = React.useState<string>("all");
  const [filterCrop, setFilterCrop] = React.useState<string>("all");

  // Current data based on active tab
  const currentPositions = activeTab === "assigned"
    ? positions
    : activeTab === "unassigned"
      ? unassignedPositions
      : reassignedPositions;
  const currentLoading = activeTab === "assigned"
    ? isLoading
    : activeTab === "unassigned"
      ? isLoadingUnassigned
      : isLoadingReassigned;

  // Extract unique values for filters (from current tab data)
  const uniqueZones = React.useMemo(() =>
    [...new Set(currentPositions.map(p => p.zone).filter(Boolean))].sort() as string[],
    [currentPositions]
  );
  const uniqueRecruiters = React.useMemo(() => {
    if (activeTab === "assigned") {
      return [...new Set((positions as OpenPosition[]).map(p => p.current_recruiter_name).filter(Boolean))].sort() as string[];
    } else if (activeTab === "reassigned") {
      return [...new Set((reassignedPositions as ReassignedPosition[]).map(p => p.current_recruiter_name).filter(Boolean))].sort() as string[];
    }
    return [...new Set((unassignedPositions as UnassignedPosition[]).map(p => p.recruiter_name).filter(Boolean))].sort() as string[];
  }, [activeTab, positions, unassignedPositions, reassignedPositions]);
  const uniqueCrops = React.useMemo(() =>
    [...new Set(currentPositions.map(p => p.crop).filter(Boolean))].sort() as string[],
    [currentPositions]
  );

  // Queue statistics
  const queueStats = React.useMemo(() => {
    return {
      critical: currentPositions.filter(p => p.queue === "critical").length,
      tecnicos: currentPositions.filter(p => p.queue === "tecnicos").length,
      empleados: currentPositions.filter(p => p.queue === "empleados").length,
    };
  }, [currentPositions]);

  // Filtered positions
  const filteredPositions = React.useMemo(() => {
    return currentPositions.filter(p => {
      // Search filter - search across title, zone, crop, recruiter name
      if (searchTerm) {
        const search = searchTerm.toLowerCase();
        const title = p.title?.toLowerCase() || "";
        const zone = p.zone?.toLowerCase() || "";
        const crop = p.crop?.toLowerCase() || "";
        let recruiterName = "";
        if (activeTab === "assigned" || activeTab === "reassigned") {
          recruiterName = (p as OpenPosition | ReassignedPosition).current_recruiter_name?.toLowerCase() || "";
        } else {
          recruiterName = (p as UnassignedPosition).recruiter_name?.toLowerCase() || "";
        }
        if (!title.includes(search) && !zone.includes(search) && !crop.includes(search) && !recruiterName.includes(search)) {
          return false;
        }
      }

      if (filterDaysOpen !== "all") {
        const minDays = parseInt(filterDaysOpen);
        if (p.days_open < minDays) return false;
      }
      if (filterZone !== "all" && p.zone !== filterZone) return false;
      if (filterQueue !== "all" && p.queue !== filterQueue) return false;
      if (filterCrop !== "all" && p.crop !== filterCrop) return false;

      // Recruiter filter based on tab
      if (filterRecruiter !== "all") {
        if (activeTab === "assigned" || activeTab === "reassigned") {
          if ((p as OpenPosition | ReassignedPosition).current_recruiter_name !== filterRecruiter) return false;
        } else {
          if ((p as UnassignedPosition).recruiter_name !== filterRecruiter) return false;
        }
      }
      return true;
    });
  }, [currentPositions, searchTerm, filterDaysOpen, filterZone, filterRecruiter, filterQueue, filterCrop, activeTab]);

  const hasActiveFilters = searchTerm !== "" || filterDaysOpen !== "all" || filterZone !== "all" || filterRecruiter !== "all" || filterQueue !== "all" || filterCrop !== "all";

  const clearFilters = () => {
    setSearchTerm("");
    setFilterDaysOpen("all");
    setFilterZone("all");
    setFilterRecruiter("all");
    setFilterQueue("all");
    setFilterCrop("all");
  };

  // Fetch assigned positions
  const fetchPositions = React.useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await fetch("/api/positions/unassigned");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar posiciones");
      }

      setPositions(result.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar posiciones");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch unassigned positions
  const fetchUnassigned = React.useCallback(async () => {
    try {
      setIsLoadingUnassigned(true);

      const response = await fetch("/api/positions/truly-unassigned");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar posiciones sin asignar");
      }

      setUnassignedPositions(result.data);
      setUnassignedCount(result.count);
    } catch {
      // Silently handle - unassigned positions are supplementary data
    } finally {
      setIsLoadingUnassigned(false);
    }
  }, []);

  // Fetch reassigned positions
  const fetchReassigned = React.useCallback(async () => {
    try {
      setIsLoadingReassigned(true);

      const response = await fetch("/api/positions/reassigned");
      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar posiciones reasignadas");
      }

      setReassignedPositions(result.data);
      setReassignedCount(result.count);
    } catch {
      // Silently handle - reassigned positions are supplementary data
    } finally {
      setIsLoadingReassigned(false);
    }
  }, []);

  React.useEffect(() => {
    fetchPositions();
    fetchUnassigned();
    fetchReassigned();
  }, [fetchPositions, fetchUnassigned, fetchReassigned]);

  // Show confirmation dialog for reassignment (for all tabs including unassigned)
  const handleReassignClick = (
    positionId: string,
    positionTitle: string,
    currentRecruiter: string | null,
    recruiter: Recruiter
  ) => {
    // Show confirmation dialog for all tabs (including unassigned)
    setConfirmDialog({
      positionId,
      positionTitle,
      currentRecruiter,
      newRecruiter: recruiter,
    });
  };

  // Confirm reassignment from dialog
  const handleConfirmReassign = async () => {
    if (!confirmDialog) return;
    setConfirmDialog(null);
    await handleAssign(confirmDialog.positionId, confirmDialog.newRecruiter.id, confirmDialog.newRecruiter.name);
  };

  // Show undo confirmation dialog (for reassigned tab)
  const handleUndoClick = (position: ReassignedPosition) => {
    if (!position.previous_recruiter_id || !position.previous_recruiter_name) return;
    setUndoDialog({
      positionId: position.id,
      positionTitle: position.title,
      currentRecruiter: position.current_recruiter_name,
      previousRecruiterId: position.previous_recruiter_id,
      previousRecruiterName: position.previous_recruiter_name,
    });
  };

  // Confirm undo from dialog
  const handleConfirmUndo = async () => {
    if (!undoDialog) return;
    setUndoDialog(null);
    await handleAssign(undoDialog.positionId, undoDialog.previousRecruiterId, undoDialog.previousRecruiterName);
  };

  // Assign position to recruiter
  const handleAssign = async (positionId: string, recruiterId: string, recruiterName: string) => {
    try {
      setAssigning(positionId);
      setSuccessMessage(null);

      const response = await fetch("/api/positions/assign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ position_id: positionId, recruiter_id: recruiterId }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al asignar");
      }

      if (activeTab === "assigned") {
        // Update list with new recruiter
        setPositions((prev) =>
          prev.map((p) =>
            p.id === positionId
              ? { ...p, current_recruiter_id: recruiterId, current_recruiter_name: recruiterName }
              : p
          )
        );
      } else if (activeTab === "unassigned") {
        // Remove from unassigned list
        setUnassignedPositions((prev) => prev.filter((p) => p.id !== positionId));
        setUnassignedCount((prev) => Math.max(0, prev - 1));
      } else if (activeTab === "reassigned") {
        // Update list with new recruiter
        setReassignedPositions((prev) =>
          prev.map((p) =>
            p.id === positionId
              ? { ...p, current_recruiter_id: recruiterId, current_recruiter_name: recruiterName }
              : p
          )
        );
      }

      setSuccessMessage(`Asignado a ${recruiterName}`);

      // Refresh to get updated data
      setTimeout(() => {
        setSuccessMessage(null);
        fetchPositions();
        fetchUnassigned();
        fetchReassigned();
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al asignar");
    } finally {
      setAssigning(null);
    }
  };

  // Loading state
  if (currentLoading) {
    return (
      <>
        <Header title="Asignaciones" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando casos...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <Header title="Asignaciones" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <AlertTriangle className="mx-auto h-8 w-8 text-rose-500" />
            <p className="mt-2 text-rose-600">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => {
                fetchPositions();
                fetchUnassigned();
                fetchReassigned();
              }}
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
      <Header title="Asignaciones" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Tab selector */}
        <div className="flex gap-2">
          <Button
            variant={activeTab === "assigned" ? "default" : "outline"}
            onClick={() => setActiveTab("assigned")}
            className={activeTab === "assigned" ? "bg-teal-600 hover:bg-teal-700" : ""}
          >
            <User className="mr-2 h-4 w-4" />
            Con Reclutador
            <Badge variant="secondary" className="ml-2">
              {positions.length}
            </Badge>
          </Button>
          <Button
            variant={activeTab === "unassigned" ? "default" : "outline"}
            onClick={() => setActiveTab("unassigned")}
            className={activeTab === "unassigned" ? "bg-amber-600 hover:bg-amber-700" : ""}
          >
            <UserX className="mr-2 h-4 w-4" />
            Sin Asignar
            {unassignedCount > 0 && (
              <Badge variant="destructive" className="ml-2 animate-pulse">
                {unassignedCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={activeTab === "reassigned" ? "default" : "outline"}
            onClick={() => setActiveTab("reassigned")}
            className={activeTab === "reassigned" ? "bg-violet-600 hover:bg-violet-700" : ""}
          >
            <History className="mr-2 h-4 w-4" />
            Reasignados
            {reassignedCount > 0 && (
              <Badge variant="secondary" className="ml-2">
                {reassignedCount}
              </Badge>
            )}
          </Button>
        </div>

        {/* Page header */}
        <div className="rounded-lg border bg-card p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-semibold text-card-foreground">
                {activeTab === "assigned"
                  ? "Casos Abiertos"
                  : activeTab === "unassigned"
                    ? "Casos Sin Asignar"
                    : "Casos Reasignados"}
              </h2>
              <p className="mt-2 text-muted-foreground">
                {filteredPositions.length} de {currentPositions.length} casos
                {activeTab === "unassigned" && " (sin reclutador asignado)"}
                {activeTab === "reassigned" && " (han cambiado de reclutador)"}
              </p>
            </div>
            <div className="flex items-center gap-4">
              {/* Queue summary badges */}
              <div className="flex items-center gap-2">
                <Badge className={QUEUE_CONFIG.critical.badgeClass}>
                  {queueStats.critical} criticos
                </Badge>
                <Badge className={QUEUE_CONFIG.tecnicos.badgeClass}>
                  {queueStats.tecnicos} tecnicos
                </Badge>
                <Badge className={QUEUE_CONFIG.empleados.badgeClass}>
                  {queueStats.empleados} empleados
                </Badge>
              </div>
              {/* Download Excel button - exports all 3 tabs */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportAllTabsToExcel(positions, unassignedPositions, reassignedPositions)}
                disabled={positions.length === 0 && unassignedPositions.length === 0 && reassignedPositions.length === 0}
              >
                <Download className="mr-2 h-4 w-4" />
                Descargar Excel
              </Button>
              {successMessage && (
                <div className="flex items-center gap-2 rounded-lg bg-emerald-50 px-4 py-2 text-emerald-700">
                  <Check className="h-4 w-4" />
                  <span className="text-sm font-medium">{successMessage}</span>
                </div>
              )}
            </div>
          </div>

          {/* Search and Filters */}
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {/* Search bar */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar posicion, zona, cultivo..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-[280px] pl-9"
              />
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Filter className="h-4 w-4" />
              <span>Filtros:</span>
            </div>

            {/* Days open filter */}
            <Select value={filterDaysOpen} onValueChange={setFilterDaysOpen}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Tiempo abierto" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tiempo abierto: Todos</SelectItem>
                <SelectItem value="7">Tiempo abierto: +7 dias</SelectItem>
                <SelectItem value="14">Tiempo abierto: +14 dias</SelectItem>
                <SelectItem value="30">Tiempo abierto: +30 dias</SelectItem>
                <SelectItem value="60">Tiempo abierto: +60 dias</SelectItem>
                <SelectItem value="90">Tiempo abierto: +90 dias</SelectItem>
              </SelectContent>
            </Select>

            {/* Zone filter */}
            <Select value={filterZone} onValueChange={setFilterZone}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Zona" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Zona: Todas</SelectItem>
                {uniqueZones.map(zone => (
                  <SelectItem key={zone} value={zone}>Zona: {zone}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Recruiter filter (for assigned and reassigned tabs) */}
            {(activeTab === "assigned" || activeTab === "reassigned") && (
              <Select value={filterRecruiter} onValueChange={setFilterRecruiter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Reclutador" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Reclutador: Todos</SelectItem>
                  {uniqueRecruiters.map(name => (
                    <SelectItem key={name} value={name}>Reclutador: {name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {/* Priority/Queue filter */}
            <Select value={filterQueue} onValueChange={setFilterQueue}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Prioridad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Prioridad: Todos</SelectItem>
                <SelectItem value="critical">Prioridad: Criticos</SelectItem>
                <SelectItem value="tecnicos">Prioridad: Tecnicos</SelectItem>
                <SelectItem value="empleados">Prioridad: Empleados</SelectItem>
              </SelectContent>
            </Select>

            {/* Crop filter */}
            <Select value={filterCrop} onValueChange={setFilterCrop}>
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="Cultivo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Cultivo: Todos</SelectItem>
                {uniqueCrops.map(crop => (
                  <SelectItem key={crop} value={crop}>Cultivo: {crop}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Clear filters */}
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="text-muted-foreground hover:text-foreground"
              >
                <X className="mr-1 h-4 w-4" />
                Limpiar
              </Button>
            )}
          </div>
        </div>

        {/* Empty state */}
        {filteredPositions.length === 0 ? (
          <div className="rounded-lg border bg-card p-12">
            <div className="flex flex-col items-center justify-center text-center">
              <div className="rounded-full bg-emerald-100 p-4 dark:bg-emerald-900">
                <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-card-foreground">
                {hasActiveFilters
                  ? "No hay resultados"
                  : activeTab === "unassigned"
                    ? "Todos los casos estan asignados"
                    : activeTab === "reassigned"
                      ? "No hay casos reasignados"
                      : "No hay casos abiertos"}
              </h3>
              <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                {hasActiveFilters
                  ? "Intenta con otros filtros."
                  : activeTab === "unassigned"
                    ? "No hay posiciones sin reclutador asignado."
                    : activeTab === "reassigned"
                      ? "No hay posiciones que hayan cambiado de reclutador."
                      : "No hay posiciones abiertas."}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" className="mt-4" onClick={clearFilters}>
                  Limpiar filtros
                </Button>
              )}
            </div>
          </div>
        ) : (
          /* Positions list */
          <div className="space-y-4">
            {filteredPositions.map((position) => (
              <div
                key={position.id}
                className={`rounded-lg border bg-card p-4 ${
                  activeTab === "unassigned"
                    ? "border-amber-200 bg-amber-50/30"
                    : activeTab === "reassigned"
                      ? "border-violet-200 bg-violet-50/30"
                      : ""
                }`}
              >
                <div className="flex items-start justify-between gap-4">
                  {/* Position info */}
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-card-foreground">
                        {position.title}
                      </h3>
                      {/* Queue badge */}
                      <Badge
                        className={QUEUE_CONFIG[position.queue].badgeClass}
                      >
                        {QUEUE_CONFIG[position.queue].label}
                      </Badge>
                      {/* Days open badge */}
                      <Badge
                        variant={position.days_open > 30 ? "destructive" : position.days_open > 14 ? "secondary" : "outline"}
                        className="text-xs"
                      >
                        {position.days_open} dias abierto
                      </Badge>
                      {/* SLA deadline badge */}
                      <SlaDeadlineBadge
                        openedAt={position.opened_at}
                        level={position.level}
                        slaDays={position.sla_days}
                        slaDeadline={position.sla_deadline}
                      />
                    </div>
                    <div className="mt-1 flex items-center gap-4 text-sm text-muted-foreground">
                      <span>Zona: {position.zone || "Nacional"}</span>
                      {position.crop && <span>Cultivo: {position.crop}</span>}
                      <span>Vacantes: {position.headcount}</span>
                    </div>
                    {/* Current recruiter / Original name */}
                    <div className="mt-2 flex items-center gap-2 text-sm">
                      {activeTab === "assigned" ? (
                        <>
                          <User className="h-4 w-4 text-teal-600" />
                          <span className="font-medium text-teal-700">
                            {(position as OpenPosition).current_recruiter_name || "Sin asignar"}
                          </span>
                        </>
                      ) : activeTab === "reassigned" ? (
                        <>
                          <User className="h-4 w-4 text-violet-600" />
                          <span className="font-medium text-violet-700">
                            {(position as ReassignedPosition).current_recruiter_name || "Sin asignar"}
                          </span>
                          {(position as ReassignedPosition).previous_recruiter_name && (
                            <>
                              <ArrowRight className="h-3 w-3 text-muted-foreground mx-1" />
                              <span className="text-muted-foreground">
                                (antes: {(position as ReassignedPosition).previous_recruiter_name})
                              </span>
                            </>
                          )}
                        </>
                      ) : (
                        <>
                          <UserX className="h-4 w-4 text-amber-600" />
                          <span className="font-medium text-amber-700">
                            Sin reclutador
                            {(position as UnassignedPosition).recruiter_name && (
                              <span className="text-muted-foreground ml-1">
                                ({(position as UnassignedPosition).recruiter_name})
                              </span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Assign/Reassign dropdown and Undo button */}
                  <div className="flex items-center gap-2">
                    {/* Undo button - only for reassigned tab */}
                    {activeTab === "reassigned" && (position as ReassignedPosition).previous_recruiter_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={assigning === position.id}
                        className="border-amber-300 text-amber-700 hover:bg-amber-50"
                        onClick={() => handleUndoClick(position as ReassignedPosition)}
                      >
                        <Undo2 className="mr-2 h-4 w-4" />
                        Deshacer
                      </Button>
                    )}

                    {position.suggested_recruiters.length === 0 ? (
                      <span className="text-sm text-muted-foreground">
                        Sin opciones
                      </span>
                    ) : (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            size="sm"
                            variant={activeTab === "unassigned" ? "default" : "outline"}
                            disabled={assigning === position.id}
                            className={`min-w-[140px] ${
                              activeTab === "unassigned"
                                ? "bg-amber-600 hover:bg-amber-700"
                                : activeTab === "reassigned"
                                  ? "border-violet-300 hover:bg-violet-50"
                                  : ""
                            }`}
                          >
                            {assigning === position.id ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Asignando...
                              </>
                            ) : (
                              <>
                                {activeTab === "unassigned" ? (
                                  <UserPlus className="mr-2 h-4 w-4" />
                                ) : (
                                  <RefreshCw className="mr-2 h-4 w-4" />
                                )}
                                {activeTab === "unassigned" ? "Asignar" : "Reasignar"}
                                <ChevronDown className="ml-2 h-4 w-4" />
                              </>
                            )}
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-[320px]">
                          <DropdownMenuLabel className="text-xs text-muted-foreground">
                            Reclutadores sugeridos (Algoritmo: Zona 30%, Nivel 30%, Carga 40%)
                          </DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          {position.suggested_recruiters.map((recruiter, idx) => (
                            <DropdownMenuItem
                              key={recruiter.id}
                              onClick={() => handleReassignClick(
                                position.id,
                                position.title,
                                activeTab === "assigned"
                                  ? (position as OpenPosition).current_recruiter_name
                                  : activeTab === "reassigned"
                                    ? (position as ReassignedPosition).current_recruiter_name
                                    : null,
                                recruiter
                              )}
                              className="flex flex-col items-start gap-1 py-3 cursor-pointer"
                              disabled={
                                (activeTab === "assigned" &&
                                  recruiter.id === (position as OpenPosition).current_recruiter_id) ||
                                (activeTab === "reassigned" &&
                                  recruiter.id === (position as ReassignedPosition).current_recruiter_id)
                              }
                            >
                              <div className="flex w-full items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <UserPlus className="h-4 w-4 text-teal-600" />
                                  <span className="font-medium">{recruiter.name}</span>
                                  {idx === 0 && (
                                    <Badge className="bg-teal-100 text-teal-700 text-xs px-1.5 py-0">
                                      Mejor opcion
                                    </Badge>
                                  )}
                                </div>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className="text-sm font-semibold text-teal-600 flex items-center gap-1 cursor-help">
                                      {recruiter.score}%
                                      <Info className="h-3 w-3 text-muted-foreground" />
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent side="left" className="max-w-xs bg-slate-900 text-white p-3">
                                    <div className="space-y-1">
                                      <p className="font-semibold text-teal-400">Detalle del algoritmo:</p>
                                      <p className="text-xs">{recruiter.explanation}</p>
                                      <div className="border-t border-slate-700 pt-1 mt-2">
                                        <p className="text-xs text-slate-400">
                                          Pesos: Zona 30% | Nivel 30% | Carga 40%
                                        </p>
                                      </div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </div>
                              <span className="text-xs text-muted-foreground line-clamp-2 pl-6">
                                {recruiter.explanation}
                              </span>
                              <span className="text-xs text-muted-foreground pl-6">
                                Carga actual: {recruiter.current_load} casos
                              </span>
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Reassignment Confirmation Dialog */}
      <AlertDialog open={!!confirmDialog} onOpenChange={() => setConfirmDialog(null)}>
        <AlertDialogContent className="max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmDialog?.currentRecruiter ? "Confirmar Reasignacion" : "Confirmar Asignacion"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Estas a punto de {confirmDialog?.currentRecruiter ? "reasignar" : "asignar"} la posicion{" "}
                  <span className="font-semibold text-foreground">
                    {confirmDialog?.positionTitle}
                  </span>
                </p>

                {/* From/To section */}
                <div className="space-y-2">
                  {confirmDialog?.currentRecruiter && (
                    <div className="flex items-center gap-2">
                      <span className="text-muted-foreground text-sm w-16">Antes:</span>
                      <span className="font-medium text-rose-600">
                        {confirmDialog.currentRecruiter}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm w-16">Nuevo:</span>
                    <span className="font-medium text-teal-600">
                      {confirmDialog?.newRecruiter.name}
                    </span>
                  </div>
                </div>

                {/* Algorithm Score Breakdown Chart */}
                <div className="rounded-lg border bg-slate-50 dark:bg-slate-900 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-foreground">Puntuacion del Algoritmo</span>
                    <Badge className="bg-teal-100 text-teal-700 text-sm px-3 py-1">
                      {confirmDialog?.newRecruiter.score}%
                    </Badge>
                  </div>

                  {/* Visual breakdown bars */}
                  <div className="space-y-2">
                    {/* Zone score (30%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Zona (30%)</span>
                        <span className="font-medium">{Math.round((confirmDialog?.newRecruiter.score || 0) * 0.3 / 0.3)}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-sky-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (confirmDialog?.newRecruiter.score || 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* Level score (30%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Nivel (30%)</span>
                        <span className="font-medium">{Math.round((confirmDialog?.newRecruiter.score || 0) * 0.3 / 0.3)}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-violet-500 rounded-full transition-all"
                          style={{ width: `${Math.min(100, (confirmDialog?.newRecruiter.score || 0))}%` }}
                        />
                      </div>
                    </div>

                    {/* Workload score (40%) */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">Carga (40%)</span>
                        <span className="font-medium">{Math.round(100 - (confirmDialog?.newRecruiter.current_load || 0) / 13 * 100)}%</span>
                      </div>
                      <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-teal-500 rounded-full transition-all"
                          style={{ width: `${Math.max(0, 100 - (confirmDialog?.newRecruiter.current_load || 0) / 13 * 100)}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Current load indicator */}
                  <div className="pt-2 border-t border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Carga actual:</span>
                      <span className={`font-semibold ${
                        (confirmDialog?.newRecruiter.current_load || 0) >= 13
                          ? 'text-rose-600'
                          : (confirmDialog?.newRecruiter.current_load || 0) > 10
                            ? 'text-amber-600'
                            : 'text-teal-600'
                      }`}>
                        {confirmDialog?.newRecruiter.current_load} / 13 casos
                      </span>
                    </div>
                  </div>
                </div>

                {/* Explanation text */}
                <p className="text-xs text-muted-foreground">
                  {confirmDialog?.newRecruiter.explanation}
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmReassign}
              className="bg-teal-600 hover:bg-teal-700"
            >
              {confirmDialog?.currentRecruiter ? "Confirmar Reasignacion" : "Confirmar Asignacion"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Undo Confirmation Dialog */}
      <AlertDialog open={!!undoDialog} onOpenChange={() => setUndoDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deshacer Reasignacion</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-4">
                <p>
                  Vas a revertir la reasignacion de{" "}
                  <span className="font-semibold text-foreground">
                    {undoDialog?.positionTitle}
                  </span>
                </p>

                <div className="rounded-lg border bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm w-16">Actual:</span>
                    <span className="font-medium text-rose-600">
                      {undoDialog?.currentRecruiter}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowRight className="h-4 w-4 text-amber-600" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-muted-foreground text-sm w-16">Anterior:</span>
                    <span className="font-medium text-teal-600">
                      {undoDialog?.previousRecruiterName}
                    </span>
                  </div>
                </div>

                <p className="text-xs text-muted-foreground">
                  El caso volvera al reclutador anterior.
                </p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmUndo}
              className="bg-amber-600 hover:bg-amber-700"
            >
              <Undo2 className="mr-2 h-4 w-4" />
              Confirmar Deshacer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
