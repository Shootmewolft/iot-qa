"use client";

import {
  CartesianGrid,
  Scatter,
  ScatterChart,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";

import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import { formatMeasurementTick } from "@/lib/statistics/chart-format";
import type { ChannelReading } from "@/lib/thingspeak/types";

/**
 * Temperature against humidity (spec section 18).
 *
 * Capped at 3,000 points: beyond that a scatter plot is a solid blob that
 * shows less, not more, while costing far more to render. The sample is
 * evenly spaced so the shape of the cloud is preserved.
 */
const MAX_POINTS = 3000;

const chartConfig = {
  pair: { label: "Medición", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface ScatterPoint {
  temperature: number;
  humidity: number;
}

interface PairedReading extends ChannelReading {
  temperature: number;
  humidity: number;
}

export function buildScatterData(
  readings: ChannelReading[],
  maxPoints = MAX_POINTS,
): ScatterPoint[] {
  const paired = readings.filter(
    (reading): reading is PairedReading =>
      reading.temperature !== null && reading.humidity !== null,
  );

  const stride = Math.max(1, Math.ceil(paired.length / maxPoints));

  return paired
    .filter((_, index) => index % stride === 0)
    .map((reading) => ({
      temperature: reading.temperature,
      humidity: reading.humidity,
    }));
}

export function ScatterPlot({
  readings,
  height = 320,
}: {
  readings: ChannelReading[];
  height?: number;
}) {
  const data = buildScatterData(readings);

  if (data.length === 0) {
    return (
      <p className="text-muted-foreground py-12 text-center text-sm">
        No hay mediciones con ambos campos en este rango.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="w-full" style={{ height }}>
      <ScatterChart margin={{ left: 4, right: 12, top: 8, bottom: 8 }}>
        <CartesianGrid />
        <XAxis
          type="number"
          dataKey="temperature"
          name="Temperatura"
          unit=" °C"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMeasurementTick}
          domain={["dataMin - 0.5", "dataMax + 0.5"]}
        />
        <YAxis
          type="number"
          dataKey="humidity"
          name="Humedad"
          unit=" %"
          tickLine={false}
          axisLine={false}
          tickFormatter={formatMeasurementTick}
          width={56}
          domain={["dataMin - 1", "dataMax + 1"]}
        />
        <ZAxis range={[16, 16]} />
        <ChartTooltip content={<ChartTooltipContent hideLabel />} />
        <Scatter
          data={data}
          dataKey="humidity"
          fill="var(--color-pair)"
          fillOpacity={0.45}
          isAnimationActive={false}
        />
      </ScatterChart>
    </ChartContainer>
  );
}
