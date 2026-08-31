"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  CircleAlertIcon,
  CircleCheckIcon,
  PauseIcon,
  PlayIcon,
  SearchCheckIcon,
  Trash2Icon,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { IconButton } from "@/components/common/icon-button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import type { UploadJob, UploadJobStatus } from "@/db/client-db";
import { deleteJob, listJobs } from "@/db/upload-jobs";
import { useUploadRunner } from "@/hooks/use-upload-runner";
import { formatDateTime } from "@/lib/format";
import { formatDuration } from "@/lib/upload/batching";

const STATUS_LABELS: Record<UploadJobStatus, string> = {
  draft: "Borrador",
  ready: "Listo",
  running: "Enviando",
  waiting: "Esperando",
  paused: "Pausado",
  verifying: "Verificando",
  completed: "Completado",
  failed: "Fallido",
  cancelled: "Cancelado",
};

export function JobMonitor() {
  const jobs = useLiveQuery(() => listJobs(), []);
  const { state, run, verify, pause } = useUploadRunner();
  const [pendingDelete, setPendingDelete] = useState<string | null>(null);

  if (jobs === undefined) {
    return <Skeleton className="h-40 w-full" />;
  }

  if (jobs.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Sin trabajos</CardTitle>
          <CardDescription>
            Crea uno desde la lista de datasets, con el botón Cargar.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  async function onDelete(id: string) {
    setPendingDelete(id);
    try {
      await deleteJob(id);
      toast.success("Trabajo eliminado.");
    } finally {
      setPendingDelete(null);
    }
  }

  return (
    <div className="grid gap-4">
      {state.blockedReason ? (
        <Alert variant="destructive">
          <CircleAlertIcon />
          <AlertTitle>Requiere intervención</AlertTitle>
          <AlertDescription>{state.blockedReason}</AlertDescription>
        </Alert>
      ) : null}

      {jobs.map((job) => (
        <JobCard
          key={job.id}
          job={job}
          isActive={state.jobId === job.id}
          runnerPhase={state.phase}
          countdown={state.countdown}
          message={state.message}
          onRun={() => run(job.id)}
          onVerify={() => verify(job.id)}
          onPause={pause}
          liveConfirmedRows={
            state.jobId === job.id ? state.confirmedRows : null
          }
          onDelete={() => onDelete(job.id)}
          deleting={pendingDelete === job.id}
        />
      ))}
    </div>
  );
}

function JobCard({
  job,
  isActive,
  runnerPhase,
  countdown,
  message,
  onRun,
  onVerify,
  onPause,
  onDelete,
  deleting,
  liveConfirmedRows,
}: {
  job: UploadJob;
  isActive: boolean;
  runnerPhase: string;
  countdown: number;
  message: string | null;
  onRun: () => void;
  onVerify: () => void;
  onPause: () => void;
  onDelete: () => void;
  deleting: boolean;
  /** Live count while a check is running; the stored one is behind. */
  liveConfirmedRows: number | null;
}) {
  // Two numbers, deliberately. A 202 from ThingSpeak means "queued", and the
  // rows only become readable minutes later. Showing queued as if it were
  // done would tell the operator the upload finished over an empty channel.
  /*
   * Prefer the live count while a check is running. The stored value is only
   * written between polls, so reading it alone made the card sit at 0 for
   * minutes on a channel that already held every row.
   */
  const confirmedRows =
    liveConfirmedRows !== null && liveConfirmedRows > job.confirmedRows
      ? liveConfirmedRows
      : job.confirmedRows;

  const queuedPercent =
    job.totalRows === 0
      ? 0
      : Math.round((job.queuedRows / job.totalRows) * 100);
  const confirmedPercent =
    job.totalRows === 0 ? 0 : Math.round((confirmedRows / job.totalRows) * 100);

  const isRunning =
    isActive &&
    ["sending", "waiting", "verifying", "settling"].includes(runnerPhase);

  const remainingBatches = job.totalBatches - job.nextBatchIndex;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-sm">{job.id}</span>
          <Badge
            variant={job.status === "completed" ? "default" : "outline"}
            className="gap-1"
          >
            {job.status === "completed" ? (
              <CircleCheckIcon className="size-3" />
            ) : null}
            {STATUS_LABELS[job.status]}
          </Badge>
          <span className="ml-auto flex gap-1">
            {job.status === "completed" ? null : isRunning ? (
              <IconButton
                variant="outline"
                label="Pausar el envío tras el lote actual"
                onClick={onPause}
              >
                <PauseIcon />
              </IconButton>
            ) : (
              <IconButton
                variant="outline"
                label={
                  job.confirmedRows > 0
                    ? "Reanudar desde el siguiente lote"
                    : "Iniciar el envío"
                }
                onClick={onRun}
              >
                <PlayIcon />
              </IconButton>
            )}
            {job.queuedRows > 0 && !isRunning ? (
              <IconButton
                variant="outline"
                label="Comprobar en el canal sin reenviar nada"
                onClick={onVerify}
              >
                <SearchCheckIcon />
              </IconButton>
            ) : null}
            <IconButton
              variant="ghost"
              label="Eliminar el trabajo de este navegador"
              disabled={isRunning || deleting}
              onClick={onDelete}
            >
              <Trash2Icon className="text-destructive" />
            </IconButton>
          </span>
        </CardTitle>
        <CardDescription>
          Canal {job.channelId} · creado {formatDateTime(job.createdAt)}
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-3">
        <Progress value={confirmedPercent} />

        <div className="text-muted-foreground grid gap-1 text-sm sm:grid-cols-2">
          <span>
            <strong>{confirmedRows.toLocaleString("es-CO")}</strong> de{" "}
            {job.totalRows.toLocaleString("es-CO")} filas confirmadas en el
            canal ({confirmedPercent} %)
          </span>
          <span className="sm:text-right">
            {job.queuedRows.toLocaleString("es-CO")} enviadas y encoladas (
            {queuedPercent} %)
          </span>
          <span className="sm:text-right">
            Lote {Math.min(job.nextBatchIndex + 1, job.totalBatches)} de{" "}
            {job.totalBatches}
          </span>
          {remainingBatches > 0 ? (
            <span>
              Faltan al menos{" "}
              {formatDuration(Math.max(0, remainingBatches - 1) * 15)}
            </span>
          ) : null}
          {isActive && countdown > 0 ? (
            <span className="sm:text-right">Próximo lote en {countdown} s</span>
          ) : null}
        </div>

        {isActive && message ? (
          <p className="text-muted-foreground text-sm">{message}</p>
        ) : null}

        {job.lastError ? (
          <Alert variant="destructive">
            <CircleAlertIcon />
            <AlertTitle>{job.lastError.code}</AlertTitle>
            <AlertDescription>{job.lastError.message}</AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
