"use client";

import { FlameIcon, LoaderCircleIcon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import type { BackupResult } from "@/components/maintenance/backup-card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

/**
 * Clearing the channel (spec section 20.3).
 *
 * Two gates, not four. A usable backup must exist — that is the one that
 * makes a mistake recoverable, and the server enforces it independently — and
 * a final dialog that states how many rows are about to go. The typed phrase
 * and the writers checkbox were dropped as friction for an operator who
 * clears a test channel repeatedly.
 */
export function ClearChannelCard({
  channelId,
  entryCount,
  backup,
}: {
  channelId: number;
  entryCount: number | null;
  backup: BackupResult | null;
}) {
  const router = useRouter();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const hasUsableBackup = backup !== null && !backup.truncated;

  async function clear() {
    setDialogOpen(false);
    setBusy(true);

    try {
      const response = await fetch("/api/thingspeak/channel", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ backupRows: backup?.rows ?? 0 }),
      });

      const envelope = await response.json();

      if (!envelope.ok) {
        toast.error(envelope.error.message);
        return;
      }

      const { verifiedEmpty, lastEntryIdBefore } = envelope.data;

      if (verifiedEmpty === false) {
        toast.warning(
          "ThingSpeak aceptó la orden pero el canal todavía devuelve datos. Compruébalo antes de seguir.",
        );
      } else {
        toast.success(
          `Canal vaciado. Tenía ${lastEntryIdBefore ?? "?"} entradas.`,
        );
      }

      router.refresh();
    } catch {
      toast.error("No se pudo contactar con el servidor.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-destructive/40">
      <CardHeader>
        <CardTitle className="text-destructive flex items-center gap-2">
          <FlameIcon className="size-4" />
          2. Vaciar el canal
        </CardTitle>
        <CardDescription>
          Borra <strong>todas</strong> las mediciones del canal {channelId}
          {entryCount !== null
            ? ` (${entryCount.toLocaleString("es-CO")} actualmente)`
            : null}
          . ThingSpeak no permite deshacerlo ni borrar registros sueltos.
        </CardDescription>
      </CardHeader>

      <CardContent className="grid gap-4">
        {!hasUsableBackup ? (
          <Alert>
            <AlertTitle>Falta el respaldo</AlertTitle>
            <AlertDescription>
              {backup?.truncated
                ? "El último respaldo quedó truncado en 8.000 entradas. Respalda por rangos antes de vaciar."
                : "Descarga primero el respaldo del paso 1."}
            </AlertDescription>
          </Alert>
        ) : null}

        <Button
          variant="destructive"
          disabled={!hasUsableBackup || busy}
          onClick={() => setDialogOpen(true)}
        >
          {busy ? <LoaderCircleIcon className="animate-spin" /> : <FlameIcon />}
          Vaciar el canal
        </Button>
      </CardContent>

      <AlertDialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Vaciar el canal {channelId}</AlertDialogTitle>
            <AlertDialogDescription>
              Se borrarán{" "}
              <strong>
                {entryCount !== null
                  ? `${entryCount.toLocaleString("es-CO")} mediciones`
                  : "todas las mediciones"}
              </strong>
              . Tu respaldo tiene {backup?.rows.toLocaleString("es-CO") ?? 0}{" "}
              filas y será la única copia. Comprueba que el ESP32, Wokwi y
              cualquier carga en curso estén detenidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={clear}>
              Sí, vaciar el canal
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
