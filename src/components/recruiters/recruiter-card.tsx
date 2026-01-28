"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  User,
  MapPin,
  Briefcase,
  TrendingUp,
  Layers,
} from "lucide-react";
import {
  RECRUITER_HARD_CAP,
  RECRUITER_SOFT_CAP,
  CAPABILITY_LEVELS,
  type CapabilityLevel,
  type Zone,
} from "@/types/constants";

/**
 * Data structure for a recruiter in the workload view
 */
export interface RecruiterCardData {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  primary_zone: Zone;
  secondary_zones: Zone[];
  capability_min: CapabilityLevel;
  capability_max: CapabilityLevel;
  current_load: number;
  max_capacity: number;
  performance_score: number; // 0-1 decimal
  is_active: boolean;
}

interface RecruiterCardProps {
  recruiter: RecruiterCardData;
  onReassign?: (recruiterId: string) => void;
}

/**
 * Determines load status based on current load vs capacity
 */
function getLoadStatus(currentLoad: number, maxCapacity: number): {
  status: "normal" | "warning" | "overloaded";
  color: string;
  bgColor: string;
  label: string;
} {
  const percentage = (currentLoad / maxCapacity) * 100;

  if (currentLoad >= RECRUITER_HARD_CAP || percentage >= 100) {
    return {
      status: "overloaded",
      color: "text-rose-600 dark:text-rose-400",
      bgColor: "bg-rose-100 dark:bg-rose-900/30",
      label: "Sobrecargado",
    };
  }

  if (currentLoad > RECRUITER_SOFT_CAP || percentage >= 80) {
    return {
      status: "warning",
      color: "text-amber-600 dark:text-amber-400",
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      label: "Al limite",
    };
  }

  return {
    status: "normal",
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    label: "Normal",
  };
}

/**
 * Formats capability range as a readable string
 */
function formatCapabilityRange(min: CapabilityLevel, max: CapabilityLevel): string {
  if (min === max) {
    return CAPABILITY_LEVELS[min].label;
  }
  return `${CAPABILITY_LEVELS[min].label} - ${CAPABILITY_LEVELS[max].label}`;
}

/**
 * Formats performance score as percentage
 */
function formatPerformance(score: number): string {
  return `${Math.round(score * 100)}%`;
}

/**
 * RecruiterCard component displays individual recruiter information
 * including workload, zones, capability levels, and performance metrics.
 *
 * @example
 * <RecruiterCard
 *   recruiter={{
 *     id: "1",
 *     name: "Ana Garcia",
 *     email: "ana@example.com",
 *     phone: "+51999888777",
 *     primary_zone: "Trujillo",
 *     secondary_zones: ["Viru", "Chao"],
 *     capability_min: 1,
 *     capability_max: 4,
 *     current_load: 18,
 *     max_capacity: 25,
 *     performance_score: 0.85,
 *     is_active: true,
 *   }}
 *   onReassign={(id) => console.log("Reassign", id)}
 * />
 */
export function RecruiterCard({ recruiter, onReassign }: RecruiterCardProps) {
  const loadStatus = getLoadStatus(recruiter.current_load, recruiter.max_capacity);
  const loadPercentage = Math.round((recruiter.current_load / recruiter.max_capacity) * 100);

  return (
    <Card className={cn(
      "transition-all hover:shadow-md overflow-hidden min-w-0",
      !recruiter.is_active && "opacity-60"
    )}>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 min-w-0">
          <div className="flex items-center gap-3 min-w-0 flex-1">
            {/* Avatar placeholder */}
            <div className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              loadStatus.bgColor
            )}>
              <User className={cn("h-5 w-5", loadStatus.color)} />
            </div>
            <div className="min-w-0 flex-1">
              <CardTitle className="text-base truncate">{recruiter.name}</CardTitle>
              <p className="text-sm text-muted-foreground truncate">{recruiter.email}</p>
            </div>
          </div>
          {/* Status badge */}
          <Badge
            variant="outline"
            className={cn(
              "shrink-0 whitespace-nowrap",
              loadStatus.status === "overloaded" && "border-rose-500 text-rose-600",
              loadStatus.status === "warning" && "border-amber-500 text-amber-600",
              loadStatus.status === "normal" && "border-teal-500 text-teal-600"
            )}
          >
            {loadStatus.label}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Load bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <Briefcase className="h-4 w-4" />
              Carga actual
            </span>
            <span className={cn("font-medium", loadStatus.color)}>
              {recruiter.current_load} / {recruiter.max_capacity}
            </span>
          </div>
          {/* Progress bar */}
          <div className="h-2 w-full overflow-hidden rounded-full bg-stone-200 dark:bg-stone-700">
            <div
              className={cn(
                "h-full transition-all duration-300",
                loadStatus.status === "overloaded" && "bg-rose-500",
                loadStatus.status === "warning" && "bg-amber-500",
                loadStatus.status === "normal" && "bg-teal-500"
              )}
              style={{ width: `${Math.min(loadPercentage, 100)}%` }}
            />
          </div>
          <p className="text-right text-xs text-muted-foreground">
            {loadPercentage}% de capacidad
          </p>
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-2 gap-3">
          {/* Performance */}
          <div className="rounded-lg bg-stone-50 p-2.5 dark:bg-stone-900">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <TrendingUp className="h-3.5 w-3.5" />
              % Contratados
            </div>
            <p className={cn(
              "mt-1 text-lg font-semibold",
              recruiter.performance_score >= 0.8 && "text-lime-600 dark:text-lime-400",
              recruiter.performance_score >= 0.5 && recruiter.performance_score < 0.8 && "text-amber-600 dark:text-amber-400",
              recruiter.performance_score < 0.5 && "text-rose-600 dark:text-rose-400"
            )}>
              {formatPerformance(recruiter.performance_score)}
            </p>
          </div>

          {/* Capability levels */}
          <div className="rounded-lg bg-stone-50 p-2.5 dark:bg-stone-900">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Layers className="h-3.5 w-3.5" />
              Niveles
            </div>
            <p className="mt-1 text-sm font-medium">
              {formatCapabilityRange(recruiter.capability_min, recruiter.capability_max)}
            </p>
          </div>
        </div>

        {/* Zone assignments */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <MapPin className="h-3.5 w-3.5" />
            Zonas asignadas
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Badge variant="default" className="bg-teal-600 hover:bg-teal-600">
              {recruiter.primary_zone}
            </Badge>
            {recruiter.secondary_zones.map((zone) => (
              <Badge key={zone} variant="secondary">
                {zone}
              </Badge>
            ))}
          </div>
        </div>

        {/* Quick reassign button (UI only) */}
        {onReassign && loadStatus.status === "overloaded" && (
          <button
            onClick={() => onReassign(recruiter.id)}
            className={cn(
              "w-full rounded-lg border border-rose-200 bg-rose-50 px-3 py-2",
              "text-sm font-medium text-rose-700",
              "transition-colors hover:bg-rose-100",
              "dark:border-rose-800 dark:bg-rose-950/30 dark:text-rose-400 dark:hover:bg-rose-900/50"
            )}
          >
            Redistribuir carga
          </button>
        )}
      </CardContent>
    </Card>
  );
}
