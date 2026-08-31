"use client";

import { useLiveQuery } from "dexie-react-hooks";
import {
  CopyIcon,
  DatabaseIcon,
  DownloadIcon,
  FileSpreadsheetIcon,
  InboxIcon,
  Trash2Icon,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { IconButton } from "@/components/common/icon-button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { UploadLauncher } from "@/components/uploads/upload-launcher";
import type { Dataset, DatasetSource } from "@/db/client-db";
import {
  countAllMeasurements,
  deleteDataset,
  duplicateDataset,
  getMeasurements,
  listDatasets,
} from "@/db/datasets";
import { serializeCsv } from "@/lib/csv/serialize";
import { downloadBlob, downloadText } from "@/lib/download";
import { formatDateTime } from "@/lib/format";

const SOURCE_LABELS: Record<DatasetSource, string> = {
  generated: "Generado",
  csv: "CSV",
  xlsx: "XLSX",
  backup: "Respaldo",
};

export function DatasetList({ channelId }: { channelId: string }) {
  const datasets = useLiveQuery(() => listDatasets(), []);
  const totalRows = useLiveQuery(() => countAllMeasurements(), []);
  const [pendingDelete, setPendingDelete] = useState<Dataset | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  if (datasets === undefined) {
    return (
      <Card>
        <CardContent className="grid gap-2 pt-6">
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (datasets.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <InboxIcon className="size-4" />
            Todavía no hay datasets
          </CardTitle>
          <CardDescription>
            Genera uno o importa un archivo CSV o XLSX. Se guardan en este
            navegador, no en el servidor.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/datasets/generar">Generar datos</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/datasets/importar">Importar archivo</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  async function onExportCsv(dataset: Dataset) {
    setBusyId(dataset.id);
    try {
      const rows = await getMeasurements(dataset.id);
      downloadText(
        serializeCsv(rows, { decimals: 2 }),
        `${dataset.name.replace(/\s+/g, "-").toLowerCase()}.csv`,
      );
    } finally {
      setBusyId(null);
    }
  }

  async function onExportXlsx(dataset: Dataset) {
    setBusyId(dataset.id);
    try {
      const rows = await getMeasurements(dataset.id);
      const { buildDataWorkbook } = await import("@/lib/excel/workbook");
      downloadBlob(
        await buildDataWorkbook(rows, 2),
        `${dataset.name.replace(/\s+/g, "-").toLowerCase()}.xlsx`,
      );
    } catch {
      toast.error("No se pudo construir el archivo XLSX.");
    } finally {
      setBusyId(null);
    }
  }

  async function onDuplicate(dataset: Dataset) {
    setBusyId(dataset.id);
    try {
      await duplicateDataset(dataset.id);
      toast.success("Dataset duplicado.");
    } catch {
      toast.error("No se pudo duplicar el dataset.");
    } finally {
      setBusyId(null);
    }
  }

  async function onConfirmDelete() {
    if (!pendingDelete) return;
    const target = pendingDelete;
    setPendingDelete(null);

    try {
      await deleteDataset(target.id);
      toast.success(`"${target.name}" eliminado de este navegador.`);
    } catch {
      toast.error("No se pudo eliminar el dataset.");
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DatabaseIcon className="size-4" />
            Datasets locales
          </CardTitle>
          <CardDescription>
            {datasets.length} dataset{datasets.length === 1 ? "" : "s"} y{" "}
            {(totalRows ?? 0).toLocaleString("es-CO")} mediciones guardadas en
            IndexedDB. Borrar los datos del navegador los elimina.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Origen</TableHead>
                  <TableHead className="text-right">Filas</TableHead>
                  <TableHead>Creado</TableHead>
                  <TableHead className="w-40" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {datasets.map((dataset) => (
                  <TableRow key={dataset.id}>
                    <TableCell>
                      <div className="font-medium">{dataset.name}</div>
                      {dataset.note ? (
                        <div className="text-muted-foreground text-xs">
                          {dataset.note}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {SOURCE_LABELS[dataset.source]}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {dataset.rowCount.toLocaleString("es-CO")}
                    </TableCell>
                    <TableCell className="text-muted-foreground text-xs">
                      {formatDateTime(dataset.createdAt)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        <UploadLauncher
                          dataset={dataset}
                          channelId={channelId}
                        />
                        <IconButton
                          variant="ghost"
                          label="Exportar a CSV"
                          disabled={busyId === dataset.id}
                          onClick={() => onExportCsv(dataset)}
                        >
                          <DownloadIcon />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          label="Exportar a XLSX"
                          disabled={busyId === dataset.id}
                          onClick={() => onExportXlsx(dataset)}
                        >
                          <FileSpreadsheetIcon />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          label="Duplicar dataset"
                          disabled={busyId === dataset.id}
                          onClick={() => onDuplicate(dataset)}
                        >
                          <CopyIcon />
                        </IconButton>
                        <IconButton
                          variant="ghost"
                          label="Eliminar dataset"
                          onClick={() => setPendingDelete(dataset)}
                        >
                          <Trash2Icon className="text-destructive" />
                        </IconButton>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <AlertDialog
        open={pendingDelete !== null}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Eliminar dataset</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminarán{" "}
              <strong>
                {pendingDelete?.rowCount.toLocaleString("es-CO")} mediciones
              </strong>{" "}
              de &ldquo;{pendingDelete?.name}&rdquo; de este navegador. No
              afecta a lo que ya esté cargado en ThingSpeak, y no se puede
              deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={onConfirmDelete}>
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
