import {
  ArrowLeftIcon,
  CalendarRangeIcon,
  TriangleAlertIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { ScatterPlot } from "@/components/dashboard/scatter-chart";
import { SeriesChart } from "@/components/dashboard/series-chart";
import { StatsPanel } from "@/components/dashboard/stats-panel";
import { ReportNotes } from "@/components/reports/report-notes";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { API_ERRORS } from "@/lib/api/errors";
import { formatDateTime, formatMeasurement } from "@/lib/format";
import { getReportCompletenessNotice } from "@/lib/reports/completeness";
import {
  DEFAULT_RANGE,
  isRangePreset,
  planWindows,
  RANGE_PRESETS,
  resolvePreset,
} from "@/lib/statistics/ranges";
import { summarizeReadings } from "@/lib/statistics/summary";
import { fetchFeedWindows } from "@/lib/thingspeak/client";

export const metadata: Metadata = {
  title: "Informe de resultados · ThingSpeak QA",
};

export default async function ReportsPage(props: {
  searchParams: Promise<{ rango?: string | string[] }>;
}) {
  const { rango } = await props.searchParams;
  const rawRange = Array.isArray(rango) ? rango[0] : rango;
  const preset = rawRange && isRangePreset(rawRange) ? rawRange : DEFAULT_RANGE;
  const range = resolvePreset(preset);
  const { windows, split } = planWindows(range);
  const feed = await fetchFeedWindows(windows);

  if (!feed.ok) {
    return (
      <>
        <ReportHeader preset={preset} />
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>No se pudo preparar el informe</AlertTitle>
          <AlertDescription>{API_ERRORS[feed.code].message}</AlertDescription>
        </Alert>
      </>
    );
  }

  const { channel, readings, truncated } = feed.data;
  const summary = summarizeReadings(readings);
  const generatedAt = new Date().toISOString();
  const rangeLabel = RANGE_PRESETS.find((item) => item.id === preset)?.label;
  const anomalyRows = readings.filter((reading) =>
    summary.anomalousEntryIds.has(reading.entryId),
  );
  const completenessNotice = getReportCompletenessNotice(truncated);

  return (
    <article className="qa-report grid gap-4">
      <ReportHeader preset={preset} />

      <header className="border-b pb-4">
        <p className="text-muted-foreground text-sm">ThingSpeak QA</p>
        <h1 className="text-2xl font-semibold tracking-tight">
          Informe de resultados
        </h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Canal {channel.id}: {channel.name}
        </p>
      </header>

      {completenessNotice ? (
        <Alert variant="destructive">
          <TriangleAlertIcon />
          <AlertTitle>{completenessNotice.title}</AlertTitle>
          <AlertDescription>{completenessNotice.description}</AlertDescription>
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Identificación de la consulta</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <ReportDatum label="Rango" value={rangeLabel ?? preset} />
          <ReportDatum
            label="Desde"
            value={
              range.start ? formatDateTime(range.start) : "Primer registro"
            }
          />
          <ReportDatum
            label="Hasta"
            value={range.end ? formatDateTime(range.end) : "Último registro"}
          />
          <ReportDatum label="Generado" value={formatDateTime(generatedAt)} />
          <ReportDatum
            label="Mediciones"
            value={readings.length.toLocaleString("es-CO")}
          />
          <ReportDatum
            label="Consultas"
            value={split ? `${windows.length} ventanas` : "1 ventana"}
          />
          <ReportDatum
            label="Anomalías"
            value={summary.anomalousEntryIds.size.toLocaleString("es-CO")}
          />
          <ReportDatum
            label="Correlación"
            value={
              Number.isFinite(summary.correlation.r)
                ? summary.correlation.r.toFixed(4)
                : "No calculable"
            }
          />
        </CardContent>
      </Card>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Series de temperatura y humedad</CardTitle>
          <CardDescription>
            Las marcas rojas identifican valores anómalos sobre la serie
            completa.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <SeriesChart readings={readings} kind="both" height={300} />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Temperatura</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart readings={readings} kind="temperature" />
          </CardContent>
        </Card>
        <Card className="break-inside-avoid">
          <CardHeader>
            <CardTitle>Humedad</CardTitle>
          </CardHeader>
          <CardContent>
            <SeriesChart readings={readings} kind="humidity" />
          </CardContent>
        </Card>
      </div>

      <Card className="break-inside-avoid">
        <CardHeader>
          <CardTitle>Dispersión temperatura–humedad</CardTitle>
          <CardDescription>
            {summary.correlation.interpretation} Se usaron{" "}
            {summary.correlation.pairs.toLocaleString("es-CO")} pares.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScatterPlot readings={readings} />
        </CardContent>
      </Card>

      <StatsPanel
        temperature={summary.temperature}
        humidity={summary.humidity}
        correlation={summary.correlation}
      />

      <Card className="report-anomalies break-inside-avoid">
        <CardHeader>
          <CardTitle>Anomalías detectadas</CardTitle>
          <CardDescription>
            Valores señalados por desviación robusta respecto a la mediana.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>entry_id</TableHead>
                  <TableHead>Fecha y hora</TableHead>
                  <TableHead className="text-right">Temperatura</TableHead>
                  <TableHead className="text-right">Humedad</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {anomalyRows.map((reading) => (
                  <TableRow key={reading.entryId}>
                    <TableCell>{reading.entryId}</TableCell>
                    <TableCell>{formatDateTime(reading.createdAt)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMeasurement(reading.temperature, "°C")}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatMeasurement(reading.humidity, "%")}
                    </TableCell>
                  </TableRow>
                ))}
                {anomalyRows.length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={4}
                      className="text-muted-foreground text-center"
                    >
                      No se detectaron anomalías en este rango.
                    </TableCell>
                  </TableRow>
                ) : null}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Evaluación de QA</CardTitle>
          <CardDescription>
            Las notas se conservan en este navegador hasta que guardes el PDF.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ReportNotes />
        </CardContent>
      </Card>
    </article>
  );
}

function ReportHeader({ preset }: { preset: string }) {
  return (
    <div className="print:hidden flex flex-wrap items-center justify-between gap-2">
      <Button variant="outline" asChild>
        <Link href={`/dashboard?rango=${preset}`}>
          <ArrowLeftIcon />
          Volver al dashboard
        </Link>
      </Button>
      <span className="text-muted-foreground flex items-center gap-2 text-sm">
        <CalendarRangeIcon className="size-4" />
        El informe usa el mismo rango del dashboard
      </span>
    </div>
  );
}

function ReportDatum({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
