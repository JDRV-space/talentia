"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECRUITER_HARD_CAP, RECRUITER_SOFT_CAP } from "@/types/constants";

/**
 * Data structure for workload chart entries
 */
export interface WorkloadChartData {
  id: string;
  name: string;
  current_load: number;
  max_capacity: number;
}

interface WorkloadChartProps {
  /** Array of recruiter workload data */
  data: WorkloadChartData[];
  /** Chart title */
  title?: string;
  /** Chart height in pixels */
  height?: number;
}

/**
 * Returns color based on load percentage and thresholds
 * - Green (teal): under soft cap (normal)
 * - Yellow (amber): between soft cap and hard cap (at capacity)
 * - Red (rose): at or over hard cap (overloaded)
 */
function getBarColor(currentLoad: number, maxCapacity: number): string {
  const percentage = (currentLoad / maxCapacity) * 100;

  if (currentLoad >= RECRUITER_HARD_CAP || percentage >= 100) {
    return "#f43f5e"; // rose-500 (overloaded)
  }
  if (currentLoad > RECRUITER_SOFT_CAP || percentage >= 80) {
    return "#f59e0b"; // amber-500 (at capacity)
  }
  return "#14b8a6"; // teal-500 (normal)
}

/**
 * Custom tooltip for the workload chart
 */
interface TooltipPayload {
  value: number;
  payload: WorkloadChartData;
}

function CustomTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload || !payload.length) {
    return null;
  }

  const data = payload[0].payload;
  const load = data.current_load;
  const capacity = data.max_capacity;
  const percentage = Math.round((load / capacity) * 100);

  let statusText = "Normal";
  let statusColor = "text-teal-600";

  if (load >= RECRUITER_HARD_CAP || percentage >= 100) {
    statusText = "Sobrecargado";
    statusColor = "text-rose-600";
  } else if (load > RECRUITER_SOFT_CAP || percentage >= 80) {
    statusText = "Al limite";
    statusColor = "text-amber-600";
  }

  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md">
      <p className="font-semibold text-popover-foreground">{data.name}</p>
      <div className="mt-2 space-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">Carga: </span>
          <span className="font-medium">{load} posiciones</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Capacidad: </span>
          <span className="font-medium">{capacity} max</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Utilizacion: </span>
          <span className="font-medium">{percentage}%</span>
        </p>
        <p className={`text-sm font-medium ${statusColor}`}>{statusText}</p>
      </div>
    </div>
  );
}

/**
 * WorkloadChart component displays a horizontal bar chart
 * showing the workload distribution across recruiters.
 *
 * Features:
 * - Horizontal bars for easy comparison
 * - Color coding: green (under capacity), yellow (at capacity), red (over)
 * - Reference lines for soft and hard caps
 * - Spanish labels throughout
 *
 * @example
 * <WorkloadChart
 *   data={[
 *     { id: "1", name: "Ana Garcia", current_load: 15, max_capacity: 25 },
 *     { id: "2", name: "Juan Lopez", current_load: 22, max_capacity: 25 },
 *     { id: "3", name: "Maria Perez", current_load: 25, max_capacity: 25 },
 *   ]}
 *   title="Distribucion de Carga"
 * />
 */
export function WorkloadChart({
  data,
  title = "Distribucion de Carga por Reclutador",
  height = 400,
}: WorkloadChartProps) {
  // Sort by load descending for better visualization
  const sortedData = [...data].sort((a, b) => b.current_load - a.current_load);

  // Calculate dynamic height based on data length (min 40px per bar)
  const dynamicHeight = Math.max(height, sortedData.length * 50 + 80);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg font-semibold">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <div className="flex h-64 items-center justify-center text-muted-foreground">
            No hay datos de reclutadores
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <div style={{ minWidth: "500px" }}>
                <ResponsiveContainer width="100%" height={dynamicHeight}>
                  <BarChart
                data={sortedData}
                layout="vertical"
                margin={{
                  top: 30,
                  right: 30,
                  left: 20,
                  bottom: 10,
                }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  horizontal={false}
                  stroke="#e5e7eb"
                />
                <XAxis
                  type="number"
                  domain={[0, Math.max(RECRUITER_HARD_CAP, ...data.map(d => d.current_load)) + 2]}
                  tick={{ fontSize: 12 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                  label={{
                    value: "Posiciones asignadas",
                    position: "bottom",
                    offset: -5,
                    style: { textAnchor: "middle", fontSize: 12 },
                  }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: "#e5e7eb" }}
                  width={150}
                />
                <Tooltip content={<CustomTooltip />} />

                {/* Reference line for soft cap */}
                <ReferenceLine
                  x={RECRUITER_SOFT_CAP}
                  stroke="#f59e0b"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: "Advertencia",
                    position: "top",
                    fill: "#f59e0b",
                    fontSize: 11,
                  }}
                />

                {/* Reference line for hard cap */}
                <ReferenceLine
                  x={RECRUITER_HARD_CAP}
                  stroke="#f43f5e"
                  strokeDasharray="5 5"
                  strokeWidth={2}
                  label={{
                    value: "Limite",
                    position: "top",
                    fill: "#f43f5e",
                    fontSize: 11,
                  }}
                />

                <Bar
                  dataKey="current_load"
                  radius={[0, 4, 4, 0]}
                  maxBarSize={35}
                >
                  {sortedData.map((entry, index) => (
                    <Cell
                      key={index}
                      fill={getBarColor(entry.current_load, entry.max_capacity)}
                    />
                  ))}
                </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Legend */}
            <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-teal-500" />
                <span className="text-muted-foreground">Normal (0-{RECRUITER_SOFT_CAP})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-amber-500" />
                <span className="text-muted-foreground">Al limite ({RECRUITER_SOFT_CAP + 1}-{RECRUITER_HARD_CAP - 1})</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="h-3 w-3 rounded bg-rose-500" />
                <span className="text-muted-foreground">Sobrecargado ({RECRUITER_HARD_CAP}+)</span>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
