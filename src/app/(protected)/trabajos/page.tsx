import type { Metadata } from "next";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { JobMonitor } from "@/components/uploads/job-monitor";

export const metadata: Metadata = {
  title: "Trabajos · ThingSpeak QA",
};

export default function TrabajosPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Trabajos</h1>
        <p className="text-muted-foreground text-sm">
          Cargas masivas hacia ThingSpeak. El progreso se guarda tras cada lote.
        </p>
      </div>

      <Alert>
        <AlertTitle>Enviado no es lo mismo que guardado</AlertTitle>
        <AlertDescription>
          ThingSpeak responde <code>202 Accepted</code> y escribe las filas
          minutos después. Por eso hay dos contadores: <em>encoladas</em> es lo
          que aceptó, y <em>confirmadas</em> es lo que ya se puede leer en el
          canal. Al terminar de enviar, la aplicación sondea el canal hasta
          verlas.
        </AlertDescription>
      </Alert>

      <Alert>
        <AlertTitle>La pestaña debe permanecer abierta</AlertTitle>
        <AlertDescription>
          El navegador controla la espera de 15 segundos entre lotes, así que el
          envío se detiene tanto al cerrar la pestaña como al salir de esta
          pantalla. Al volver, «Reanudar» continúa desde el último lote enviado,
          sin repetir ninguno.
        </AlertDescription>
      </Alert>

      <JobMonitor />
    </>
  );
}
