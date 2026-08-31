"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceDot,
  XAxis,
  YAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { DISPLAY_TIME_ZONE, formatDateTime } from "@/lib/format";
import { detectAnomalies } from "@/lib/statistics/anomalies";
import { formatMeasurementTick } from "@/lib/statistics/chart-format";
import { downsampleExtremes } from "@/lib/statistics/downsample";
import type { ChannelReading } from "@/lib/thingspeak/types";

/**
 * Points drawn after downsampling. The spec asks for 1,000–2,000; 1,200 keeps
 * the line readable without making the browser redraw tens of thousands of
 * nodes on every hover.
 */
const CHART_POINTS = 1200;

export type SeriesKind = "temperature" | "humidity" | "both";

const CONFIGS: Record<SeriesKind, ChartConfig> = {
  temperature: {
    temperature: { label: "Temperatura (°C)", color: "var(--chart-1)" },
  },
  humidity: {
    humidity: { label: "Humedad (%)", color: "var(--chart-2)" },
  },
  both: {
    temperature: { label: "Temperatura (°C)", color: "var(--chart-1)" },
    humidity: { label: "Humedad (%)", color: "var(--chart-2)" },
  },
};

function formatTick(value: number, spanMs: number): string {
  const date = new Date(value);
  // Below two days the date adds noise; above it, the hour alone is ambiguous.
  return spanMs > 2 * 86_400_000
    ? date.toLocaleDateString("es-CO", {
        timeZone: DISPLAY_TIME_ZONE,
        day: "2-digit",
        month: "short",
      })
    : date.toLocaleTimeString("es-CO", {
        timeZone: DISPLAY_TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
      });
}

export function SeriesChart({
  readings,
  kind,
  highlightAnomalies = true,
  height = 280,
}: {
  readings: ChannelReading[];
  kind: SeriesKind;
  highlightAnomalies?: boolean;
  height?: number;
}) {
  const primary = kind === "humidity" ? "humidity" : "temperature";

  const data = downsampleExtremes(
    readings,
    CHART_POINTS,
    (reading) => reading[primary],
  ).map((reading) => ({
    time: new Date(reading.createdAt).getTime(),
    temperature: reading.temperature,
    humidity: reading.humidity,
  }));

  let anomalies: { time: number; value: number }[] = [];
  if (highlightAnomalies) {
    // Detected over the FULL series, not the downsampled one: a spike that
    // survived downsampling must still be marked, and one that did not
    // survive should not be invented.
    const drawn = new Set(data.map((point) => point.time));
    anomalies = detectAnomalies(readings, (reading) => reading[primary])
      .map((anomaly) => ({
        time: new Date(anomaly.item.createdAt).getTime(),
        value: anomaly.value,
      }))
      .filter((anomaly) => drawn.has(anomaly.time));
  }

  const spanMs =
    data.length > 1 ? data[data.length - 1].time - data[0].time : 0;

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No hay mediciones en este rango.
      </p>
    );
  }

  return (
    <ChartContainer
      config={CONFIGS[kind]}
      className="w-full"
      style={{ height }}
    >
      <LineChart data={data} margin={{ left: 4, right: 12, top: 8 }}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="time"
          type="number"
          domain={["dataMin", "dataMax"]}
          scale="time"
          tickLine={false}
          axisLine={false}
          tickMargin={8}
          minTickGap={56}
          tickFormatter={(value) => formatTick(value, spanMs)}
        />
        <YAxis
          yAxisId="left"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMeasurementTick}
          width={56}
          domain={["dataMin - 1", "dataMax + 1"]}
        />
        {kind === "both" ? (
          <YAxis
            yAxisId="right"
            orientation="right"
            tickLine={false}
            axisLine={false}
            tickFormatter={formatMeasurementTick}
            width={56}
            domain={["dataMin - 2", "dataMax + 2"]}
          />
        ) : null}

        <ChartTooltip
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) =>
                formatDateTime(
                  new Date(payload?.[0]?.payload?.time ?? 0).toISOString(),
                )
              }
            />
          }
        />
        {kind === "both" ? (
          <ChartLegend content={<ChartLegendContent />} />
        ) : null}

        {kind !== "humidity" ? (
          <Line
            yAxisId="left"
            dataKey="temperature"
            type="monotone"
            stroke="var(--color-temperature)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}

        {kind !== "temperature" ? (
          <Line
            yAxisId={kind === "both" ? "right" : "left"}
            dataKey="humidity"
            type="monotone"
            stroke="var(--color-humidity)"
            strokeWidth={1.5}
            dot={false}
            isAnimationActive={false}
          />
        ) : null}

        {anomalies.map((anomaly) => (
          <ReferenceDot
            key={anomaly.time}
            yAxisId="left"
            x={anomaly.time}
            y={anomaly.value}
            r={4}
            fill="var(--destructive)"
            stroke="var(--background)"
            strokeWidth={1.5}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
