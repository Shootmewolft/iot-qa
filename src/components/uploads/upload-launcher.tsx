"use client";

import { CircleAlertIcon, LoaderCircleIcon, UploadIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { Dataset } from "@/db/client-db";
import { getMeasurements } from "@/db/datasets";
import { createJob } from "@/db/upload-jobs";
import { formatDuration, planBatches } from "@/lib/upload/batching";
import {
  buildPreflightReport,
  type PreflightReport,
} from "@/lib/upload/preflight";

/**
 * Pre-flight before an upload.
 *
 * The check the spec did not have: a dataset whose timestamps already exist
 * in the channel gets its FIRST batch rejected in full, 960 rows at a time,
 * with nothing to act on mid-upload. Reading the channel's range first turns
 * that into a decision made before anything is sent.
 */
export function UploadLauncher({
  dataset,
  channelId,
}: {
  dataset: Dataset;
  channelId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [report, setReport] = useState<PreflightReport | null>(null);
  const [error, setError] = useState<string | null>(null);

  const plan = planBatches(dataset.rowCount);

  async function onOpen() {
    setOpen(true);
    setReport(null);
    setError(null);
    setChecking(true);

    try {
      const rows = await getMeasurements(dataset.id);
      const timestamps = rows.map((row) => row.createdAt).sort();

      const params = new URLSearchParams({
        start: timestamps[0],
        end: timestamps[timestamps.length - 1],
        results: "8000",
      });

      const response = await fetch(`/api/thingspeak/data?${params}`);
      const envelope = await response.json();

      if (!envelope.ok) {
        setError(envelope.error.message);
        return;
      }

      setReport(
        buildPreflightReport(
          timestamps,
          envelope.data.readings.map(
            (reading: { createdAt: string }) => reading.createdAt,
          ),
        ),
      );
    } catch {
      setError("No se pudo consultar el canal para comprobar colisiones.");
    } finally {
      setChecking(false);
    }
  }

  async function onStart() {
    try {
      const job = await createJob({
        datasetId: dataset.id,
        channelId,
        totalRows: dataset.rowCount,
      });

      setOpen(false);
      toast.success("Trabajo creado.");
      router.push(`/trabajos?job=${job.id}`);
    } catch {
      toast.error("No se pudo crear el trabajo.");
    }
  }

  const blocked = report !== null && report.collisions.length > 0;

  return (
    <>
      <Button variant="outline" size="sm" onClick={onOpen}>
        <UploadIcon />
        Cargar
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Cargar a ThingSpeak</DialogTitle>
            <DialogDescription>
              {dataset.rowCount.toLocaleString("es-CO")} mediciones ·{" "}
              {plan.totalBatches} lote{plan.totalBatches === 1 ? "" : "s"} ·
              duración mínima {formatDuration(plan.minimumDurationSeconds)}.
            </DialogDescription>
          </DialogHeader>

          {checking ? (
            <p className="text-muted-foreground flex items-center gap-2 text-sm">
              <LoaderCircleIcon className="size-4 animate-spin" />
              Comprobando si el canal ya tiene estos timestamps…
            </p>
          ) : null}

          {error ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>No se pudo comprobar</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {report && blocked ? (
            <Alert variant="destructive">
              <CircleAlertIcon />
              <AlertTitle>
                {report.collisions.length.toLocaleString("es-CO")} timestamps ya
                existen en el canal
              </AlertTitle>
              <AlertDescription>
                ThingSpeak rechaza el lote COMPLETO ante un solo duplicado, así
                que la carga fallaría desde el primer lote. Cambia la fecha de
                inicio del dataset o vacía el canal antes de continuar.
                <br />
                <span className="font-mono text-xs">
                  Primero: {report.collisions[0]}
                </span>
              </AlertDescription>
            </Alert>
          ) : null}

          {report && !blocked ? (
            <Alert>
              <AlertTitle>Sin colisiones</AlertTitle>
              <AlertDescription>
                Ninguno de los {report.datasetRows.toLocaleString("es-CO")}{" "}
                timestamps existe en el canal.
                {report.truncated
                  ? " Aviso: la lectura del canal llegó al tope de 8.000 entradas, así que la comprobación no es exhaustiva."
                  : null}
              </AlertDescription>
            </Alert>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={onStart} disabled={checking || blocked}>
              Crear trabajo
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
