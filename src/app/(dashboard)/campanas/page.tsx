"use client";

import * as React from "react";
import { Header } from "@/components/layout/header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  Filter,
  ChevronLeft,
  ChevronRight,
  Calendar,
  TableIcon,
  CalendarDays,
} from "lucide-react";

// =============================================================================
// TYPES
// =============================================================================

interface AvailableRecruiter {
  id: string;
  name: string;
  current_load: number;
  primary_zone: string | null;
}

interface Campaign {
  id: string;
  name: string;
  year: number;
  week_number: number;
  crop: string;
  zone: string;
  production_kg: number;
  start_date: string;
  end_date: string;
  estimated_workers: number;
  kg_per_worker_day: number;
  status: string;
  source: string;
  created_at: string;
  last_year_count: number;
  available_recruiters: AvailableRecruiter[];
}

interface ApiResponse {
  success: boolean;
  data: Campaign[];
  meta: {
    total: number;
    page: number;
    per_page: number;
  };
  error?: string;
}

// =============================================================================
// CROP CONFIG
// =============================================================================

const CROP_CONFIG: Record<string, { label: string; color: string }> = {
  esparrago: { label: "Esparrago", color: "bg-emerald-100 text-emerald-700" },
  arandano: { label: "Arandano", color: "bg-indigo-100 text-indigo-700" },
  palta: { label: "Palta", color: "bg-lime-100 text-lime-700" },
  uva: { label: "Uva", color: "bg-purple-100 text-purple-700" },
  mango: { label: "Mango", color: "bg-amber-100 text-amber-700" },
  pimiento: { label: "Pimiento", color: "bg-red-100 text-red-700" },
  alcachofa: { label: "Alcachofa", color: "bg-teal-100 text-teal-700" },
  pina: { label: "Pina", color: "bg-yellow-100 text-yellow-700" },
};

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Get the current ISO week number
 */
function getCurrentWeekNumber(): number {
  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  const days = Math.floor((now.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
  return Math.ceil((days + startOfYear.getDay() + 1) / 7);
}

/**
 * Format week date range (e.g., "6-12 Ene")
 */
function formatWeekDateRange(startDate: string, endDate: string): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

  const start = new Date(startDate);
  const end = new Date(endDate);

  const startDay = start.getDate();
  const endDay = end.getDate();
  const startMonth = months[start.getMonth()];
  const endMonth = months[end.getMonth()];

  if (startMonth === endMonth) {
    return `${startDay}-${endDay} ${startMonth}`;
  }
  return `${startDay} ${startMonth} - ${endDay} ${endMonth}`;
}

/**
 * Get week date range from week number and year
 */
function getWeekDateRange(weekNumber: number, year: number): { start: Date; end: Date } {
  const jan1 = new Date(year, 0, 1);
  const daysOffset = (weekNumber - 1) * 7;
  const dayOfWeek = jan1.getDay();
  const daysToMonday = dayOfWeek === 0 ? 1 : (dayOfWeek === 1 ? 0 : 8 - dayOfWeek);

  const weekStart = new Date(year, 0, 1 + daysToMonday + daysOffset);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  return { start: weekStart, end: weekEnd };
}

/**
 * Format short month name
 */
function getMonthShort(weekNumber: number, year: number): string {
  const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  const { start } = getWeekDateRange(weekNumber, year);
  return months[start.getMonth()];
}

// =============================================================================
// CALENDAR VIEW COMPONENT (Monthly)
// =============================================================================

interface CalendarViewProps {
  campaigns: Campaign[];
  currentWeek: number;
  currentYear: number;
  selectedYear: string;
}

const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"
];

const DAY_NAMES = ["Lun", "Mar", "Mie", "Jue", "Vie", "Sab", "Dom"];

function CalendarView({ campaigns, currentYear, selectedYear }: CalendarViewProps) {
  const displayYear = selectedYear ? parseInt(selectedYear) : currentYear;

  // Memoize today to prevent recreating on every render
  const today = React.useMemo(() => new Date(), []);

  // Current month state (0-11)
  const [currentMonth, setCurrentMonth] = React.useState(() => {
    // Start at current month if viewing current year, otherwise January
    const now = new Date();
    return displayYear === now.getFullYear() ? now.getMonth() : 0;
  });

  // Reset month when year changes
  React.useEffect(() => {
    const now = new Date();
    if (displayYear === now.getFullYear()) {
      setCurrentMonth(now.getMonth());
    } else {
      setCurrentMonth(0);
    }
  }, [displayYear]);

  // Get days in month
  const getDaysInMonth = (year: number, month: number) => {
    return new Date(year, month + 1, 0).getDate();
  };

  // Get first day of month (0 = Sunday, adjust for Monday start)
  const getFirstDayOfMonth = (year: number, month: number) => {
    const day = new Date(year, month, 1).getDay();
    return day === 0 ? 6 : day - 1; // Convert to Monday = 0
  };

  // Check if a date falls within a campaign
  const getCampaignsForDate = (date: Date) => {
    return campaigns.filter((campaign) => {
      if (!campaign.start_date || !campaign.end_date) return false;
      const start = new Date(campaign.start_date);
      const end = new Date(campaign.end_date);
      return date >= start && date <= end;
    });
  };

  // Generate calendar grid
  const calendarDays = React.useMemo(() => {
    const daysInMonth = getDaysInMonth(displayYear, currentMonth);
    const firstDay = getFirstDayOfMonth(displayYear, currentMonth);
    const days: (Date | null)[] = [];

    // Add empty cells for days before the first of the month
    for (let i = 0; i < firstDay; i++) {
      days.push(null);
    }

    // Add the days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(displayYear, currentMonth, day));
    }

    return days;
  }, [displayYear, currentMonth]);

  // Navigation handlers
  const goToPreviousMonth = () => {
    if (currentMonth === 0) {
      // Don't go to previous year
      return;
    }
    setCurrentMonth(currentMonth - 1);
  };

  const goToNextMonth = () => {
    if (currentMonth === 11) {
      // Don't go to next year
      return;
    }
    setCurrentMonth(currentMonth + 1);
  };

  const goToToday = () => {
    if (displayYear === today.getFullYear()) {
      setCurrentMonth(today.getMonth());
    }
  };

  // Check if date is today
  const isToday = (date: Date | null) => {
    if (!date) return false;
    return (
      date.getDate() === today.getDate() &&
      date.getMonth() === today.getMonth() &&
      date.getFullYear() === today.getFullYear()
    );
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      {/* Calendar header with navigation */}
      <div className="bg-muted/50 border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToPreviousMonth}
                disabled={currentMonth === 0}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <div className="w-40 text-center">
                <span className="font-semibold text-lg">
                  {MONTH_NAMES[currentMonth]} {displayYear}
                </span>
              </div>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={goToNextMonth}
                disabled={currentMonth === 11}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {displayYear === today.getFullYear() && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goToToday}
                className="text-teal-600"
              >
                Hoy
              </Button>
            )}
          </div>
          <div className="flex items-center gap-4 text-sm text-muted-foreground">
            {Object.entries(CROP_CONFIG).slice(0, 5).map(([key, config]) => (
              <div key={key} className="flex items-center gap-1">
                <div className={`w-3 h-3 rounded ${config.color.split(' ')[0]}`} />
                <span>{config.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 border-b bg-muted/30">
        {DAY_NAMES.map((day) => (
          <div
            key={day}
            className="px-2 py-2 text-center text-xs font-medium text-muted-foreground"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7">
        {calendarDays.map((date, index) => {
          const dayCampaigns = date ? getCampaignsForDate(date) : [];
          const isTodayDate = isToday(date);

          return (
            <div
              key={index}
              className={`min-h-[100px] border-b border-r p-1 ${
                !date ? "bg-muted/20" : ""
              } ${isTodayDate ? "bg-amber-50 dark:bg-amber-900/20" : ""}`}
            >
              {date && (
                <>
                  <div className={`text-sm font-medium mb-1 ${
                    isTodayDate
                      ? "text-amber-600 dark:text-amber-400"
                      : "text-muted-foreground"
                  }`}>
                    {date.getDate()}
                  </div>
                  <div className="space-y-0.5">
                    {dayCampaigns.slice(0, 3).map((campaign) => {
                      const cropConfig = CROP_CONFIG[campaign.crop] || {
                        label: campaign.crop,
                        color: "bg-stone-100 text-stone-600",
                      };
                      const bgColor = cropConfig.color.split(" ")[0];

                      return (
                        <div
                          key={campaign.id}
                          className={`${bgColor} rounded px-1 py-0.5 text-[10px] font-medium truncate cursor-pointer hover:opacity-80 transition-opacity`}
                          title={`${cropConfig.label} - ${campaign.zone} - ${campaign.estimated_workers} trabajadores`}
                        >
                          {cropConfig.label.slice(0, 3)}
                        </div>
                      );
                    })}
                    {dayCampaigns.length > 3 && (
                      <div className="text-[10px] text-muted-foreground text-center">
                        +{dayCampaigns.length - 3} más
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend footer */}
      <div className="bg-muted/30 border-t px-4 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Usa las flechas para navegar entre meses</span>
          {displayYear === today.getFullYear() && (
            <div className="flex items-center gap-2">
              <div className="w-4 h-4 bg-amber-100 dark:bg-amber-900/50 rounded" />
              <span>Dia actual</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// PAGE COMPONENT
// =============================================================================

export default function CampanasPage() {
  // State
  const [campaigns, setCampaigns] = React.useState<Campaign[]>([]);
  const [isLoading, setIsLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedYear, setSelectedYear] = React.useState<string>("2026");
  const [selectedCrop, setSelectedCrop] = React.useState<string>("");
  const [page, setPage] = React.useState(1);
  const [totalItems, setTotalItems] = React.useState(0);
  const [viewMode, setViewMode] = React.useState<"table" | "calendar">("table");
  const perPage = 50;

  // Get current week for highlighting
  const currentWeek = getCurrentWeekNumber();
  const currentYear = new Date().getFullYear();

  // Fetch campaigns
  const fetchCampaigns = React.useCallback(async (currentPage: number, year: string, crop: string) => {
    try {
      setIsLoading(true);
      setError(null);

      const params = new URLSearchParams({
        page: currentPage.toString(),
        per_page: perPage.toString(),
      });

      if (year) {
        params.set("year", year);
      }
      if (crop) {
        params.set("crop", crop);
      }

      const response = await fetch(`/api/campaigns?${params.toString()}`);
      const result: ApiResponse = await response.json();

      if (!response.ok || !result.success) {
        throw new Error(result.error || "Error al cargar campañas");
      }

      setCampaigns(result.data);
      setTotalItems(result.meta.total);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al cargar campañas");
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Fetch on filter change
  React.useEffect(() => {
    fetchCampaigns(page, selectedYear, selectedCrop);
  }, [fetchCampaigns, page, selectedYear, selectedCrop]);

  // Reset page when filters change
  const handleYearChange = (value: string) => {
    setSelectedYear(value);
    setPage(1);
  };

  const handleCropChange = (value: string) => {
    setSelectedCrop(value);
    setPage(1);
  };

  // Format number with thousands separator
  const formatNumber = (num: number) => {
    return num.toLocaleString("es-PE");
  };

  const availableYears = ["2026"];

  const selectClassName = "flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:border-ring disabled:cursor-not-allowed disabled:opacity-50 dark:bg-input/30";

  // Loading state
  if (isLoading && campaigns.length === 0) {
    return (
      <>
        <Header title="Campañas" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-teal-600" />
            <p className="mt-2 text-muted-foreground">Cargando campañas...</p>
          </div>
        </div>
      </>
    );
  }

  // Error state
  if (error) {
    return (
      <>
        <Header title="Campañas" />
        <div className="flex flex-1 items-center justify-center p-4">
          <div className="text-center">
            <p className="text-rose-600">{error}</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => fetchCampaigns(page, selectedYear, selectedCrop)}
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
      <Header title="Campañas" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        {/* Page header */}
        <div className="rounded-lg border bg-card p-6">
          <h2 className="text-2xl font-semibold text-card-foreground">
            Campañas de Producción
          </h2>
          <p className="mt-2 text-muted-foreground">
            Estimación de mano de obra basada en datos históricos
          </p>
        </div>

        {/* Filters */}
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2 mb-3">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filtros</span>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            {/* Year filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="filter-year"
                className="text-sm font-medium text-muted-foreground"
              >
                Año
              </label>
              <select
                id="filter-year"
                value={selectedYear}
                onChange={(e) => handleYearChange(e.target.value)}
                className={selectClassName}
              >
                <option value="">Todos los años</option>
                {availableYears.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>

            {/* Crop filter */}
            <div className="space-y-1.5">
              <label
                htmlFor="filter-crop"
                className="text-sm font-medium text-muted-foreground"
              >
                Cultivo
              </label>
              <select
                id="filter-crop"
                value={selectedCrop}
                onChange={(e) => handleCropChange(e.target.value)}
                className={selectClassName}
              >
                <option value="">Todos los cultivos</option>
                {Object.entries(CROP_CONFIG).map(([key, config]) => (
                  <option key={key} value={key}>
                    {config.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Clear filters */}
            <div className="flex items-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSelectedYear("2026");
                  setSelectedCrop("");
                  setPage(1);
                }}
                className="w-full"
              >
                Limpiar filtros
              </Button>
            </div>
          </div>
        </div>

        {/* View Toggle */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-lg border bg-muted/50 p-1">
            <Button
              variant={viewMode === "table" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("table")}
              className="gap-2"
            >
              <TableIcon className="h-4 w-4" />
              Vista Tabla
            </Button>
            <Button
              variant={viewMode === "calendar" ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setViewMode("calendar")}
              className="gap-2"
            >
              <CalendarDays className="h-4 w-4" />
              Vista Calendario
            </Button>
          </div>
          <span className="text-sm text-muted-foreground">
            {totalItems} campañas encontradas
          </span>
        </div>

        {/* Calendar View */}
        {viewMode === "calendar" && (
          <CalendarView
            campaigns={campaigns}
            currentWeek={currentWeek}
            currentYear={currentYear}
            selectedYear={selectedYear}
          />
        )}

        {/* Table View */}
        {viewMode === "table" && (
          <>
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Semana</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Fecha</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Cultivo</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Zona</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground" title="Total de trabajadores necesarios para la operacion">Trabajadores Est</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                      No hay campañas para los filtros seleccionados
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => {
                    const cropConfig = CROP_CONFIG[campaign.crop] || {
                      label: campaign.crop,
                      color: "bg-stone-100 text-stone-600"
                    };
                    // Determine if this is current or upcoming week (for current year campaigns)
                    const isCurrentWeek = campaign.year === currentYear && campaign.week_number === currentWeek;
                    const isUpcoming = campaign.year === currentYear && campaign.week_number > currentWeek && campaign.week_number <= currentWeek + 2;
                    const is2026Upcoming = campaign.year === 2026 && currentYear === 2025; // All 2026 campaigns are "upcoming" in 2025

                    // Row highlight classes
                    const rowClassName = isCurrentWeek
                      ? "bg-amber-50 dark:bg-amber-950/30 hover:bg-amber-100 dark:hover:bg-amber-950/50 transition-colors"
                      : isUpcoming || is2026Upcoming
                      ? "hover:bg-muted/30 transition-colors"
                      : "hover:bg-muted/30 transition-colors";

                    return (
                      <tr key={campaign.id} className={rowClassName}>
                        <td className="px-4 py-3 font-medium">
                          <div className="flex items-center gap-2">
                            S{campaign.week_number}
                            {isCurrentWeek && (
                              <Badge className="bg-amber-500 text-white text-xs">
                                Ahora
                              </Badge>
                            )}
                            {(isUpcoming || is2026Upcoming) && !isCurrentWeek && (
                              <Badge variant="outline" className="text-xs border-blue-300 text-blue-600">
                                <Calendar className="h-3 w-3 mr-1" />
                                Próxima
                              </Badge>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-sm">
                          {campaign.start_date && campaign.end_date
                            ? formatWeekDateRange(campaign.start_date, campaign.end_date)
                            : "-"}
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="secondary" className={cropConfig.color}>
                            {cropConfig.label}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {campaign.zone || "Nacional"}
                        </td>
                        <td className="px-4 py-3 text-right font-mono font-medium text-teal-600">
                          {formatNumber(campaign.estimated_workers)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Pagination */}
        {totalItems > perPage && (
          <div className="flex items-center justify-between px-2">
            <p className="text-sm text-muted-foreground">
              Mostrando {(page - 1) * perPage + 1} -{" "}
              {Math.min(page * perPage, totalItems)} de {totalItems}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4 mr-1" />
                Anterior
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={page * perPage >= totalItems}
              >
                Siguiente
                <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </div>
          </div>
        )}
        </>
        )}
      </div>
    </>
  );
}
