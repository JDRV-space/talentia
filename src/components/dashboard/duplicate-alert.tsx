"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, ChevronRight, Loader2, CheckCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { motion } from "framer-motion";
import type { Candidate } from "@/types/database";

// =============================================================================
// TYPES
// =============================================================================

interface DuplicateAlertData {
  pendingCount: number;
  mostRecent: Pick<Candidate, "id" | "full_name" | "phone"> | null;
}

type UrgencyLevel = "none" | "low" | "high";

// =============================================================================
// URGENCY CONFIGURATION
// =============================================================================

/**
 * Urgency levels based on pending duplicate count
 * - none: 0 pending duplicates (green)
 * - low: 1-10 pending duplicates (yellow/amber)
 * - high: >10 pending duplicates (red/rose)
 */
function getUrgencyLevel(count: number): UrgencyLevel {
  if (count === 0) return "none";
  if (count <= 10) return "low";
  return "high";
}

const urgencyStyles: Record<
  UrgencyLevel,
  {
    bg: string;
    border: string;
    iconBg: string;
    iconColor: string;
    badge: string;
    badgeText: string;
  }
> = {
  none: {
    bg: "bg-lime-50 dark:bg-lime-950/30",
    border: "border-lime-200 dark:border-lime-900",
    iconBg: "bg-lime-100 dark:bg-lime-900/50",
    iconColor: "text-lime-600 dark:text-lime-400",
    badge: "bg-lime-100 dark:bg-lime-900/50",
    badgeText: "text-lime-700 dark:text-lime-400",
  },
  low: {
    bg: "bg-amber-50 dark:bg-amber-950/30",
    border: "border-amber-200 dark:border-amber-900",
    iconBg: "bg-amber-100 dark:bg-amber-900/50",
    iconColor: "text-amber-600 dark:text-amber-400",
    badge: "bg-amber-100 dark:bg-amber-900/50",
    badgeText: "text-amber-700 dark:text-amber-400",
  },
  high: {
    bg: "bg-rose-50 dark:bg-rose-950/30",
    border: "border-rose-200 dark:border-rose-900",
    iconBg: "bg-rose-100 dark:bg-rose-900/50",
    iconColor: "text-rose-600 dark:text-rose-400",
    badge: "bg-rose-100 dark:bg-rose-900/50",
    badgeText: "text-rose-700 dark:text-rose-400",
  },
};

// =============================================================================
// PHONE MASKING UTILITY
// =============================================================================

/**
 * Masks phone number for privacy preview
 * Example: "987654321" -> "987***321"
 */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 6) return phone;
  const start = phone.slice(0, 3);
  const end = phone.slice(-3);
  return `${start}***${end}`;
}

// =============================================================================
// LOADING SKELETON
// =============================================================================

function DuplicateAlertSkeleton() {
  return (
    <Card className="animate-pulse">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="h-5 w-40 rounded bg-muted" />
          <div className="h-6 w-8 rounded-full bg-muted" />
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="h-4 w-full rounded bg-muted" />
          <div className="h-4 w-3/4 rounded bg-muted" />
          <div className="h-9 w-28 rounded bg-muted" />
        </div>
      </CardContent>
    </Card>
  );
}

// =============================================================================
// MAIN COMPONENT
// =============================================================================

const MotionCard = motion.create(Card);

/**
 * DuplicateAlert - Dashboard widget showing pending duplicate candidates
 *
 * Features:
 * - Shows count of pending duplicates
 * - Color-coded urgency (green/yellow/red)
 * - Preview of most recent duplicate detected
 * - Quick link to /duplicados page
 *
 * @example
 * <DuplicateAlert />
 */
export function DuplicateAlert() {
  const [data, setData] = useState<DuplicateAlertData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchDuplicates() {
      try {
        setIsLoading(true);
        setError(null);

        const supabase = createClient();

        // Query pending duplicates (is_duplicate=true and not reviewed)
        // Using dedup_reviewed=false as the "pending" status
        const { data: duplicates, error: queryError, count } = await supabase
          .from("candidates")
          .select("id, full_name, phone, created_at", { count: "exact" })
          .eq("is_duplicate", true)
          .eq("dedup_reviewed", false)
          .is("deleted_at", null)
          .order("created_at", { ascending: false })
          .limit(1);

        if (queryError) {
          throw new Error(queryError.message);
        }

        setData({
          pendingCount: count ?? 0,
          mostRecent: duplicates && duplicates.length > 0 ? duplicates[0] : null,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Error al cargar datos");
      } finally {
        setIsLoading(false);
      }
    }

    fetchDuplicates();
  }, []);

  // Loading state
  if (isLoading) {
    return <DuplicateAlertSkeleton />;
  }

  // Error state
  if (error) {
    return (
      <Card className="border-rose-200 dark:border-rose-900">
        <CardContent className="p-6">
          <p className="text-sm text-rose-600 dark:text-rose-400">
            Error al cargar duplicados: {error}
          </p>
        </CardContent>
      </Card>
    );
  }

  // No data state (should not happen, but handle gracefully)
  if (!data) {
    return null;
  }

  const urgency = getUrgencyLevel(data.pendingCount);
  const styles = urgencyStyles[urgency];

  return (
    <MotionCard
      className={cn("overflow-hidden", styles.bg, styles.border)}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: "easeOut" }}
    >
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center justify-between text-base font-semibold">
          <div className="flex items-center gap-2">
            <div className={cn("rounded-lg p-2", styles.iconBg)}>
              <Users className={cn("h-4 w-4", styles.iconColor)} />
            </div>
            <span>Duplicados</span>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5 text-sm font-medium",
              styles.badge,
              styles.badgeText
            )}
          >
            {data.pendingCount}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {data.pendingCount === 0 ? (
          <div className="flex items-center gap-2 text-sm text-lime-700 dark:text-lime-400">
            <CheckCircle className="h-4 w-4" />
            <span>Sin duplicados pendientes</span>
          </div>
        ) : (
          <>
            {/* Main message */}
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground">
                {data.pendingCount} candidato{data.pendingCount !== 1 ? "s" : ""}{" "}
                duplicado{data.pendingCount !== 1 ? "s" : ""}
              </span>{" "}
              pendiente{data.pendingCount !== 1 ? "s" : ""} de revisar
            </p>

            {/* Most recent duplicate preview */}
            {data.mostRecent && (
              <div
                className={cn(
                  "rounded-lg border p-3",
                  "bg-white/50 dark:bg-black/20",
                  "border-stone-200 dark:border-stone-800"
                )}
              >
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Más reciente
                </p>
                <p className="mt-1 font-medium text-foreground">
                  {data.mostRecent.full_name}
                </p>
                <p className="text-sm text-muted-foreground">
                  Tel: {maskPhone(data.mostRecent.phone)}
                </p>
              </div>
            )}
          </>
        )}

        {/* Action button */}
        <Button
          asChild
          variant={data.pendingCount === 0 ? "outline" : "default"}
          size="sm"
          className={cn(
            "w-full",
            data.pendingCount > 0 && "bg-teal-600 hover:bg-teal-700"
          )}
        >
          <Link href="/duplicados">
            {data.pendingCount === 0 ? "Ver historial" : "Ver todos"}
            <ChevronRight className="ml-1 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </MotionCard>
  );
}
