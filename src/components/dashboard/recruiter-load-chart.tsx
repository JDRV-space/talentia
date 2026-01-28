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
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { RECRUITER_HARD_CAP, RECRUITER_SOFT_CAP } from "@/types/constants";

/**
 * Datos de carga de un reclutador
 */
interface RecruiterLoadData {
  id: string;
  name: string;
  /** Carga actual de posiciones (0-25) */
  current_load: number;
  /** Zona principal del reclutador */
  zone?: string;
}

interface RecruiterLoadChartProps {
  /** Array de datos de reclutadores */
  data: RecruiterLoadData[];
  /** Título del gráfico */
  title?: string;
}

/**
 * Obtiene el color de la barra según la carga del reclutador
 * - teal: normal (0-20)
 * - amber: advertencia (21-24)
 * - rose: al límite (25)
 */
function getBarColor(load: number): string {
  if (load >= RECRUITER_HARD_CAP) {
    return "#f43f5e"; // rose-500
  }
  if (load > RECRUITER_SOFT_CAP) {
    return "#f59e0b"; // amber-500
  }
  return "#14b8a6"; // teal-500
}

/**
 * Tooltip personalizado en español
 */
interface TooltipPayload {
  value: number;
  payload: RecruiterLoadData;
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
  const percentage = Math.round((load / RECRUITER_HARD_CAP) * 100);

  let statusText = "Normal";
  let statusColor = "text-teal-600";

  if (load >= RECRUITER_HARD_CAP) {
    statusText = "Al límite";
    statusColor = "text-rose-600";
  } else if (load > RECRUITER_SOFT_CAP) {
    statusText = "Advertencia";
    statusColor = "text-amber-600";
  }

  return (
    <div className="rounded-lg border bg-popover p-3 shadow-md">
      <p className="font-semibold text-popover-foreground">{data.name}</p>
      {data.zone && (
        <p className="text-sm text-muted-foreground">{data.zone}</p>
      )}
      <div className="mt-2 space-y-1">
        <p className="text-sm">
          <span className="text-muted-foreground">Carga: </span>
          <span className="font-medium">{load} posiciones</span>
        </p>
        <p className="text-sm">
          <span className="text-muted-foreground">Capacidad: </span>
          <span className="font-medium">{percentage}%</span>
        </p>
        <p className={`text-sm font-medium ${statusColor}`}>{statusText}</p>
      </div>
    </div>
  );
}

/**
 * Componente de gráfico de barras para visualizar la carga de trabajo de cada reclutador.
 *
 * El gráfico muestra:
 * - Eje X: Nombres de reclutadores
 * - Eje Y: Carga actual (0-25)
 * - Colores: teal (normal), amber (>20), rose (25/al límite)
 *
 * @example
 * <RecruiterLoadChart
 *   data={[
 *     { id: '1', name: 'Ana Garcia', current_load: 15 },
 *     { id: '2', name: 'Juan Lopez', current_load: 22 },
 *     { id: '3', name: 'Maria Perez', current_load: 25 },
 *   ]}
 *   title="Carga de Reclutadores"
 * />
 */
export function RecruiterLoadChart({
  data,
  title = "Carga de Reclutadores",
}: RecruiterLoadChartProps) {
  // Ordenar por carga descendente para mejor visualización
  const sortedData = [...data].sort((a, b) => b.current_load - a.current_load);

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
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
              data={sortedData}
              margin={{
                top: 10,
                right: 10,
                left: 10,
                bottom: 20,
              }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="#e5e7eb"
              />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                angle={-45}
                textAnchor="end"
                height={80}
                interval={0}
              />
              <YAxis
                domain={[0, RECRUITER_HARD_CAP]}
                tick={{ fontSize: 12 }}
                tickLine={false}
                axisLine={{ stroke: "#e5e7eb" }}
                label={{
                  value: "Posiciones",
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fontSize: 12 },
                }}
              />
              <Tooltip content={<CustomTooltip />} />
              <Bar dataKey="current_load" radius={[4, 4, 0, 0]} maxBarSize={50}>
                {sortedData.map((entry, index) => (
                  <Cell key={index} fill={getBarColor(entry.current_load)} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}

        {/* Leyenda */}
        <div className="mt-4 flex flex-wrap justify-center gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-teal-500" />
            <span className="text-muted-foreground">Normal (0-20)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-amber-500" />
            <span className="text-muted-foreground">Advertencia (21-24)</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="h-3 w-3 rounded bg-rose-500" />
            <span className="text-muted-foreground">Al límite (25)</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
