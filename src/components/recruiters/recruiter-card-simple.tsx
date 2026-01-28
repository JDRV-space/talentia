"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { User, MapPin, ExternalLink } from "lucide-react";
import { RECRUITER_HARD_CAP, RECRUITER_SOFT_CAP, type Zone } from "@/types/constants";

/**
 * Simplified data structure for recruiter cards
 */
export interface SimpleRecruiterCardData {
  id: string;
  name: string;
  primary_zone: Zone;
  current_load: number; // open + in_progress cases
  is_active: boolean;
}

/**
 * Workload status based on comparison to average
 */
export type WorkloadStatus = "critical" | "warning" | "normal" | "leader";

interface SimpleRecruiterCardProps {
  recruiter: SimpleRecruiterCardData;
  workloadStatus: WorkloadStatus;
  onViewCases?: (recruiterId: string) => void;
}

/**
 * Gets the badge color based on workload status
 * Uses CSS circles instead of emojis for professional appearance
 */
function getWorkloadBadge(status: WorkloadStatus): {
  dotColor: string;
  color: string;
  bgColor: string;
} {
  switch (status) {
    case "critical":
      return {
        dotColor: "bg-rose-500",
        color: "text-rose-600 dark:text-rose-400",
        bgColor: "bg-rose-100 dark:bg-rose-900/30",
      };
    case "warning":
      return {
        dotColor: "bg-amber-500",
        color: "text-amber-600 dark:text-amber-400",
        bgColor: "bg-amber-100 dark:bg-amber-900/30",
      };
    case "normal":
      return {
        dotColor: "bg-teal-500",
        color: "text-teal-600 dark:text-teal-400",
        bgColor: "bg-teal-100 dark:bg-teal-900/30",
      };
    case "leader":
      // No badge for coordinators/leaders
      return {
        dotColor: "",
        color: "text-stone-600 dark:text-stone-400",
        bgColor: "bg-stone-100 dark:bg-stone-900/30",
      };
  }
}

/**
 * SimpleRecruiterCard - Simplified recruiter card with workload indicator
 *
 * Target UI:
 * ┌──────────────────┐
 * │ 👤 Maria Lopez   │
 * │ 🔴 8 casos       │  ← color badge based on workload
 * │ Zona: Trujillo   │
 * │ [Ver casos →]    │
 * └──────────────────┘
 */
export function SimpleRecruiterCard({
  recruiter,
  workloadStatus,
  onViewCases,
}: SimpleRecruiterCardProps) {
  const badge = getWorkloadBadge(workloadStatus);

  return (
    <Card
      className={cn(
        "transition-all hover:shadow-md overflow-hidden",
        !recruiter.is_active && "opacity-60"
      )}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center gap-3">
          {/* Avatar */}
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full",
              badge.bgColor
            )}
          >
            <User className={cn("h-5 w-5", badge.color)} />
          </div>
          <CardTitle className="text-base truncate">{recruiter.name}</CardTitle>
        </div>
      </CardHeader>

      <CardContent className="space-y-3">
        {/* Workload indicator with colored dot badge */}
        <div className="flex items-center gap-2">
          {badge.dotColor && (
            <span className={cn("inline-block h-3 w-3 shrink-0 rounded-full", badge.dotColor)} />
          )}
          <span className={cn("font-semibold text-lg", badge.color)}>
            {recruiter.current_load} caso{recruiter.current_load !== 1 ? "s" : ""}
          </span>
        </div>

        {/* Zone */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <MapPin className="h-4 w-4" />
          <span>Zona: </span>
          <Badge variant="secondary" className="font-normal">
            {recruiter.primary_zone}
          </Badge>
        </div>

        {/* View cases button */}
        {onViewCases && (
          <Button
            variant="outline"
            size="sm"
            className="w-full mt-2"
            onClick={() => onViewCases(recruiter.id)}
          >
            Ver casos
            <ExternalLink className="ml-2 h-4 w-4" />
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Calculates workload status based on HARD_CAP and SOFT_CAP thresholds
 * @param currentLoad - Recruiter's current case count
 * @param _avgLoad - Team average case count (unused, kept for API compatibility)
 * @param isActive - Whether the recruiter is active (inactive recruiters are treated as leaders/coordinators)
 *
 * Thresholds (from constants.ts):
 * - RECRUITER_HARD_CAP = 13 (>= 13 = critical/red/sobrecargado)
 * - RECRUITER_SOFT_CAP = 10 (> 10 = warning/yellow/al limite)
 */
export function calculateWorkloadStatus(
  currentLoad: number,
  _avgLoad: number,
  isActive: boolean
): WorkloadStatus {
  // Inactive recruiters (coordinators/leaders) - no workload alerts
  if (!isActive) {
    return "leader";
  }

  // >= HARD_CAP (13) = critical (red) - sobrecargado
  if (currentLoad >= RECRUITER_HARD_CAP) {
    return "critical";
  }

  // > SOFT_CAP (10) = warning (yellow) - al limite
  if (currentLoad > RECRUITER_SOFT_CAP) {
    return "warning";
  }

  // Normal load (green)
  return "normal";
}
