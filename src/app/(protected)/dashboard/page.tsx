import {
  ClockIcon,
  DropletsIcon,
  PlugIcon,
  PlugZapIcon,
  ThermometerIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";

import { RangeFilter } from "@/components/dashboard/range-filter";
import { ReadingsTable } from "@/components/dashboard/readings-table";
import { ScatterPlot } from "@/components/dashboard/scatter-chart";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { RefreshButton } from "@/components/diagnostics/refresh-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { API_ERRORS } from "@/lib/api/errors";
import { formatDateTime, formatMeasurement } from "@/lib/format";
import {
  DEFAULT_RANGE,
  isRangePreset,
  planWindows,
  resolvePreset,
} from "@/lib/statistics/ranges";
import { summarizeReadings } from "@/lib/statistics/summary";
import { fetchFeedWindows } from "@/lib/thingspeak/client";

export const metadata: Metadata = {
  title: "Dashboard · ThingSpeak QA",
};

export default async function DashboardPage(props: {
  searchParams: Promise<{ rango?: string }>;
}) {
  const { rango } = await props.searchParams;
  const preset = rango && isRangePreset(rango) ? rango : DEFAULT_RANGE;

  const { windows, split } = planWindows(resolvePreset(preset));
  const feed = await fetchFeedWindows(windows);

  if (!feed.ok) {
    return (
      <>
        <Header preset={preset} />
        <Alert variant="destructive">
          <PlugIcon />
          <AlertTitle>Sin conexión con ThingSpeak</AlertTitle>
          <AlertDescription>
            {API_ERRORS[feed.code].message} Revisa el{" "}
            <Link href="/configuracion" className="underline">
              diagnóstico de configuración
            </Link>
            .
          </AlertDescription>
        </Alert>
      </>
    );
  }

  const { readings, channel, truncated } = feed.data;
  const last = readings.at(-1) ?? null;

  const summary = summarizeReadings(readings);

  return (
    <>
      <Header preset={preset} channelName={channel.name} />

      {truncated ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Lectura incompleta</AlertTitle>
          <AlertDescription>
            Alguna ventana devolvió el máximo de 8.000 entradas, así que puede
            faltar información. Reduce el rango para verlo completo.
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={
            <PlugZapIcon className="size-4 text-emerald-600 dark:text-emerald-500" />
          }
          label="Registros del rango"
          value={readings.length.toLocaleString("es-CO")}
          hint={split ? `${windows.length} ventanas consultadas` : undefined}
        />
        <StatCard
          icon={<ThermometerIcon className="size-4" />}
          label="Última temperatura"
          value={formatMeasurement(last?.temperature, "°C")}
          hint={`Promedio ${formatMeasurement(summary.temperature.mean, "°C")}`}
        />
        <StatCard
          icon={<DropletsIcon className="size-4" />}
          label="Última humedad"
          value={formatMeasurement(last?.humidity, "%")}
          hint={`Promedio ${formatMeasurement(summary.humidity.mean, "%")}`}
        />
        <StatCard
          icon={<ClockIcon className="size-4" />}
          label="Última actualización"
          value={formatDateTime(last?.createdAt)}
          hint={
            summary.anomalousEntryIds.size > 0
              ? `${summary.anomalousEntryIds.size} anomalías`
              : "Sin anomalías"
          }
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Series temporales</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="both">
            <TabsList>
              <TabsTrigger value="both">Combinada</TabsTrigger>
              <TabsTrigger value="temperature">Temperatura</TabsTrigger>
              <TabsTrigger value="humidity">Humedad</TabsTrigger>
              <TabsTrigger value="scatter">Dispersión</TabsTrigger>
            </TabsList>
            <TabsContent value="both">
              <SeriesChart readings={readings} kind="both" />
            </TabsContent>
            <TabsContent value="temperature">
              <SeriesChart readings={readings} kind="temperature" />
            </TabsContent>
            <TabsContent value="humidity">
              <SeriesChart readings={readings} kind="humidity" />
            </TabsContent>
            <TabsContent value="scatter">
              <ScatterPlot readings={readings} />
            </TabsContent>
          </Tabs>
          <p className="text-muted-foreground mt-2 text-xs">
            Los puntos rojos marcan mediciones anómalas. Las gráficas dibujan
            una muestra que conserva máximos y mínimos; las estadísticas usan
            todas las mediciones.
          </p>
        </CardContent>
      </Card>

      <StatsPanel
        temperature={summary.temperature}
        humidity={summary.humidity}
        correlation={summary.correlation}
      />

      <ReadingsTable readings={readings} />

      <div className="flex justify-end">
        <Link
          href={`/reportes?rango=${preset}`}
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-lg px-4 text-sm font-medium"
        >
          Preparar informe
        </Link>
      </div>
    </>
  );
}

function Header({
  preset,
  channelName,
}: {
  preset: Parameters<typeof RangeFilter>[0]["active"];
  channelName?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">
          {channelName ?? "Canal de ThingSpeak"}
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <RangeFilter active={preset} />
        <RefreshButton />
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-muted-foreground flex items-center gap-2 text-sm font-normal">
          {icon}
          {label}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-xl font-semibold tabular-nums">{value}</p>
        {hint ? (
          <p className="text-muted-foreground mt-0.5 text-xs">{hint}</p>
        ) : null}
      </CardContent>
    </Card>
  );
}
