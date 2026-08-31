"use client";

import { TriangleAlertIcon } from "lucide-react";
import { useMemo } from "react";
import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";

import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDateTime } from "@/lib/format";
import type { GeneratedMeasurement } from "@/lib/generator/types";
import { describeSeries } from "@/lib/statistics/descriptive";
import { downsampleExtremes } from "@/lib/statistics/downsample";
import { formatDuration, planBatches } from "@/lib/upload/batching";

const CHART_POINTS = 800;
const EDGE_ROWS = 20;

const chartConfig = {
  temperature: { label: "Temperatura (°C)", color: "var(--chart-1)" },
  humidity: { label: "Humedad (%)", color: "var(--chart-2)" },
} satisfies ChartConfig;

export function GeneratorPreview({ rows }: { rows: GeneratedMeasurement[] }) {
  const chartData = useMemo(
    () =>
      downsampleExtremes(rows, CHART_POINTS, (row) => row.temperature).map(
        (row) => ({
          time: new Date(row.createdAt).getTime(),
          temperature: row.temperature,
          humidity: row.humidity,
        }),
      ),
    [rows],
  );

  const temperatureStats = useMemo(
    () => describeSeries(rows.map((row) => row.temperature)),
    [rows],
  );
  const humidityStats = useMemo(
    () => describeSeries(rows.map((row) => row.humidity)),
    [rows],
  );

  const anomalies = useMemo(
    () => rows.filter((row) => row.anomaly).length,
    [rows],
  );

  const plan = planBatches(rows.length);

  const head = rows.slice(0, EDGE_ROWS);
  const tail = rows.length > EDGE_ROWS * 2 ? rows.slice(-EDGE_ROWS) : [];

  return (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric
          label="Mediciones"
          value={rows.length.toLocaleString("es-CO")}
        />
        <Metric label="Lotes de envío" value={String(plan.totalBatches)} />
        <Metric
          label="Duración mínima"
          value={formatDuration(plan.minimumDurationSeconds)}
        />
        <Metric
          label="Anomalías"
          value={`${anomalies} (${((anomalies / rows.length) * 100).toFixed(2)} %)`}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Series generadas</CardTitle>
          <CardDescription>
            {rows.length > CHART_POINTS
              ? `Muestra de ${chartData.length} puntos conservando máximos y mínimos, para no ocultar anomalías.`
              : "Todos los puntos generados."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={chartConfig} className="h-[280px] w-full">
            <LineChart data={chartData} margin={{ left: 4, right: 12 }}>
              <CartesianGrid vertical={false} />
              <XAxis
                dataKey="time"
                type="number"
                domain={["dataMin", "dataMax"]}
                scale="time"
                tickLine={false}
                axisLine={false}
                tickMargin={8}
                minTickGap={48}
                tickFormatter={(value) =>
                  new Date(value).toLocaleTimeString("es-CO", {
                    timeZone: "America/Bogota",
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                }
              />
              <YAxis
                yAxisId="t"
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["dataMin - 1", "dataMax + 1"]}
              />
              <YAxis
                yAxisId="h"
                orientation="right"
                tickLine={false}
                axisLine={false}
                width={40}
                domain={["dataMin - 2", "dataMax + 2"]}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(_, payload) =>
                      formatDateTime(
                        new Date(payload?.[0]?.payload?.time).toISOString(),
                      )
                    }
                  />
                }
              />
              <Line
                yAxisId="t"
                dataKey="temperature"
                type="monotone"
                stroke="var(--color-temperature)"
                strokeWidth={1.5}
                dot={false}
              />
              <Line
                yAxisId="h"
                dataKey="humidity"
                type="monotone"
                stroke="var(--color-humidity)"
                strokeWidth={1.5}
                dot={false}
              />
            </LineChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <StatsCard
          title="Temperatura (°C)"
          stats={temperatureStats}
          decimals={2}
        />
        <StatsCard title="Humedad (%)" stats={humidityStats} decimals={2} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filas</CardTitle>
          <CardDescription>
            {tail.length > 0
              ? `Primeras ${EDGE_ROWS} y últimas ${EDGE_ROWS} de ${rows.length.toLocaleString("es-CO")}.`
              : `Las ${rows.length} filas generadas.`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">#</TableHead>
                  <TableHead>created_at</TableHead>
                  <TableHead className="text-right">field1</TableHead>
                  <TableHead className="text-right">field2</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {head.map((row) => (
                  <PreviewRow key={row.sequence} row={row} />
                ))}
                {tail.length > 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={5}
                      className="text-muted-foreground text-center text-xs"
                    >
                      … {(rows.length - EDGE_ROWS * 2).toLocaleString("es-CO")}{" "}
                      filas omitidas …
                    </TableCell>
                  </TableRow>
                ) : null}
                {tail.map((row) => (
                  <PreviewRow key={row.sequence} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function PreviewRow({ row }: { row: GeneratedMeasurement }) {
  return (
    <TableRow>
      <TableCell className="text-muted-foreground tabular-nums">
        {row.sequence}
      </TableCell>
      <TableCell className="font-mono text-xs">{row.createdAt}</TableCell>
      <TableCell className="text-right tabular-nums">
        {row.temperature}
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.humidity}</TableCell>
      <TableCell>
        {row.anomaly ? (
          <Badge variant="outline" className="gap-1">
            <TriangleAlertIcon className="size-3" />
            anomalía
          </Badge>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground text-sm font-normal">
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}

function StatsCard({
  title,
  stats,
  decimals,
}: {
  title: string;
  stats: ReturnType<typeof describeSeries>;
  decimals: number;
}) {
  const entries: [string, number][] = [
    ["Mínimo", stats.min],
    ["Máximo", stats.max],
    ["Promedio", stats.mean],
    ["Mediana", stats.median],
    ["Desviación estándar", stats.stdDev],
    ["Percentil 25", stats.p25],
    ["Percentil 75", stats.p75],
    ["Rango", stats.range],
  ];

  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-1.5 text-sm sm:grid-cols-2">
          {entries.map(([label, value]) => (
            <div key={label} className="flex justify-between gap-4">
              <dt className="text-muted-foreground">{label}</dt>
              <dd className="font-medium tabular-nums">
                {Number.isFinite(value) ? value.toFixed(decimals) : "—"}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
