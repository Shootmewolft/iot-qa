import { PlugIcon, TriangleAlertIcon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { MaintenanceWorkbench } from "@/components/maintenance/maintenance-workbench";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { API_ERRORS } from "@/lib/api/errors";
import { configurationReport } from "@/lib/env";
import { fetchChannelStatus } from "@/lib/thingspeak/client";

export const metadata: Metadata = {
  title: "Mantenimiento · ThingSpeak QA",
};

export default async function MantenimientoPage() {
  const status = await fetchChannelStatus();
  const configuration = configurationReport();

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Mantenimiento</h1>
        <p className="text-muted-foreground text-sm">
          Respaldo, vaciado y restauración del canal. Operaciones irreversibles.
        </p>
      </div>

      <Alert variant="destructive">
        <TriangleAlertIcon />
        <AlertTitle>Detén los escritores antes de empezar</AlertTitle>
        <AlertDescription>
          Si el ESP32, la simulación de Wokwi o una carga en curso siguen
          escribiendo mientras vacías o restauras, el canal quedará con datos
          mezclados y el respaldo dejará de coincidir.
        </AlertDescription>
      </Alert>

      {!configuration.thingSpeakUserApiKey ? (
        <Alert>
          <TriangleAlertIcon />
          <AlertTitle>Falta THINGSPEAK_USER_API_KEY</AlertTitle>
          <AlertDescription>
            Vaciar el canal exige la User API Key de la cuenta, no la del canal.
            Sin ella puedes respaldar, pero no vaciar. Revisa la{" "}
            <Link href="/configuracion" className="underline">
              configuración
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : null}

      {status.ok ? (
        <MaintenanceWorkbench
          channelId={status.data.channel.id}
          channelName={status.data.channel.name}
          entryCount={status.data.channel.lastEntryId}
        />
      ) : (
        <Alert variant="destructive">
          <PlugIcon />
          <AlertTitle>Sin conexión con el canal</AlertTitle>
          <AlertDescription>
            {API_ERRORS[status.code].message} No se puede operar sin leerlo
            primero.
          </AlertDescription>
        </Alert>
      )}
    </>
  );
}
