"use client";

import {
  ChevronLeftIcon,
  ChevronRightIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useState } from "react";

import { IconButton } from "@/components/common/icon-button";
import { Badge } from "@/components/ui/badge";
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
import { formatDateTime, formatMeasurement } from "@/lib/format";
import { detectAnomalies } from "@/lib/statistics/anomalies";
import type { ChannelReading } from "@/lib/thingspeak/types";

const PAGE_SIZE = 50;

/**
 * Paged rather than virtualized.
 *
 * With a 50-row page the DOM never grows, which is the same property
 * virtualization buys, and paging additionally gives the operator a stable
 * position to cite in a report. Virtualization becomes worthwhile only if
 * continuous scrolling over the whole range is ever needed.
 */
export function ReadingsTable({ readings }: { readings: ChannelReading[] }) {
  const [page, setPage] = useState(0);

  const anomalousIds = new Set<number>();
  for (const found of detectAnomalies(readings, (r) => r.temperature)) {
    anomalousIds.add(found.item.entryId);
  }
  for (const found of detectAnomalies(readings, (r) => r.humidity)) {
    anomalousIds.add(found.item.entryId);
  }

  const totalPages = Math.max(1, Math.ceil(readings.length / PAGE_SIZE));
  const current = Math.min(page, totalPages - 1);
  const rows = readings.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          Mediciones
          <span className="ml-auto flex items-center gap-2 text-sm font-normal">
            <IconButton
              variant="outline"
              size="icon-sm"
              label="Página anterior"
              disabled={current === 0}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeftIcon />
            </IconButton>
            <span className="text-muted-foreground tabular-nums">
              {current + 1} / {totalPages}
            </span>
            <IconButton
              variant="outline"
              size="icon-sm"
              label="Página siguiente"
              disabled={current >= totalPages - 1}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRightIcon />
            </IconButton>
          </span>
        </CardTitle>
        <CardDescription>
          {readings.length.toLocaleString("es-CO")} mediciones en el rango
          {anomalousIds.size > 0
            ? ` · ${anomalousIds.size} marcadas como anómalas`
            : null}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-24">entry_id</TableHead>
                <TableHead>Fecha y hora</TableHead>
                <TableHead className="text-right">Temperatura</TableHead>
                <TableHead className="text-right">Humedad</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((reading) => (
                <TableRow key={reading.entryId}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {reading.entryId}
                  </TableCell>
                  <TableCell>{formatDateTime(reading.createdAt)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMeasurement(reading.temperature, "°C")}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatMeasurement(reading.humidity, "%")}
                  </TableCell>
                  <TableCell>
                    {anomalousIds.has(reading.entryId) ? (
                      <Badge variant="outline" className="gap-1">
                        <TriangleAlertIcon className="size-3" />
                        anómala
                      </Badge>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={5}
                    className="text-muted-foreground text-center"
                  >
                    No hay mediciones en este rango.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
