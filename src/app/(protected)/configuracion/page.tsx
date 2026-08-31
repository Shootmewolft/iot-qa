import type { Metadata } from "next";

import { ChannelStatus } from "@/components/diagnostics/channel-status";
import { ConfigurationStatus } from "@/components/diagnostics/configuration-status";
import { RefreshButton } from "@/components/diagnostics/refresh-button";
import { configurationReport } from "@/lib/env";
import { fetchChannelStatus } from "@/lib/thingspeak/client";

export const metadata: Metadata = {
  title: "Configuración · ThingSpeak QA",
};

export default async function ConfiguracionPage() {
  const status = await fetchChannelStatus();

  return (
    <>
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Configuración
          </h1>
          <p className="text-muted-foreground text-sm">
            Diagnóstico de variables de entorno y conectividad con ThingSpeak.
          </p>
        </div>
        <RefreshButton />
      </div>

      <ChannelStatus
        channel={status.ok ? status.data.channel : null}
        errorCode={status.ok ? null : status.code}
      />

      <ConfigurationStatus configuration={configurationReport()} />
    </>
  );
}
