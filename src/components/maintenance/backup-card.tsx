"use client";

import { DownloadIcon, LoaderCircleIcon, ShieldCheckIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { serializeBackup } from "@/lib/backup/serialize";
import { downloadText, timestampedName } from "@/lib/download";
import { formatDateTime } from "@/lib/format";
import type { ChannelReading } from "@/lib/thingspeak/types";

export type BackupResult = {
  rows: number;
  takenAt: string;
  truncated: boolean;
};

/**
 * Channel backup (spec section 20.2).
 *
 * The download is what makes clearing survivable, so this component owns the
 * proof: it reports how many rows it actually captured and whether the read
 * was complete, and hands that receipt to the destructive card.
 */
export function BackupCard({
  channelId,
  channelName,
  onBackup,
  lastBackup,
}: {
  channelId: number;
  channelName: string;
  onBackup: (result: BackupResult) => void;
  lastBackup: BackupResult | null;
}) {
  const [busy, setBusy] = useState(false);

  async function download() {
    setBusy(true);
    try {
      const response = await fetch("/api/thingspeak/data?results=8000");
      const envelope = await response.json();

      if (!envelope.ok) {
        toast.error(envelope.error.message);
        return;
      }

      const readings: ChannelReading[] = envelope.data.readings;
      const takenAt = new Date().toISOString();
      const truncated: boolean = envelope.data.truncated;

      downloadText(
        serializeBackup(readings, {
          channelId,
          channelName,
          exportedAt: takenAt,
          rowCount: readings.length,
          truncated,
        }),
        `${timestampedName(`respaldo-canal-${channelId}`)}.csv`,
      );

      onBackup({ rows: readings.length, takenAt, truncated });

      if (truncated) {
        toast.warning(
          "El respaldo llegó al límite de 8.000 entradas y puede estar incompleto.",
        );
      } else {
        toast.success(`${readings.length} mediciones respaldadas.`);
      }
    } catch {
      toast.error("No se pudo descargar el respaldo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheckIcon className="size-4" />
          1. Respaldo
        </CardTitle>
        <CardDescription>
          Descarga todas las mediciones del canal antes de tocar nada. Al
          vaciar, este archivo será la única copia que quede: guárdalo donde no
          se pierda.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <Button onClick={download} disabled={busy}>
          {busy ? (
            <LoaderCircleIcon className="animate-spin" />
          ) : (
            <DownloadIcon />
          )}
          Descargar respaldo CSV
        </Button>

        {lastBackup ? (
          <Alert variant={lastBackup.truncated ? "destructive" : "default"}>
            <AlertTitle>
              {lastBackup.truncated
                ? "Respaldo posiblemente incompleto"
                : "Respaldo descargado"}
            </AlertTitle>
            <AlertDescription>
              {lastBackup.rows.toLocaleString("es-CO")} mediciones ·{" "}
              {formatDateTime(lastBackup.takenAt)}
              {lastBackup.truncated
                ? ". La lectura alcanzó el tope de 8.000 entradas, así que puede faltar información. No vacíes el canal con este respaldo."
                : null}
            </AlertDescription>
          </Alert>
        ) : null}
      </CardContent>
    </Card>
  );
}
