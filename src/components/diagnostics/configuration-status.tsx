import { CircleCheckIcon, CircleXIcon } from "lucide-react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { ConfigurationReport } from "@/lib/env";

const LABELS: Record<keyof ConfigurationReport, string> = {
  appPassword: "APP_PASSWORD",
  sessionSecret: "SESSION_SECRET",
  appOrigin: "APP_ORIGIN",
  thingSpeakChannelId: "THINGSPEAK_CHANNEL_ID",
  thingSpeakReadApiKey: "THINGSPEAK_READ_API_KEY",
  thingSpeakWriteApiKey: "THINGSPEAK_WRITE_API_KEY",
  thingSpeakUserApiKey: "THINGSPEAK_USER_API_KEY",
};

/** Variables the application can run without. */
const OPTIONAL = new Set<keyof ConfigurationReport>([
  "appOrigin",
  "thingSpeakReadApiKey",
]);

export function ConfigurationStatus({
  configuration,
}: {
  configuration: ConfigurationReport;
}) {
  const entries = Object.entries(configuration) as [
    keyof ConfigurationReport,
    boolean,
  ][];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Configuración</CardTitle>
        <CardDescription>
          Solo se indica si cada variable está presente. Su valor nunca sale del
          servidor.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2">
          {entries.map(([key, present]) => (
            <div
              key={key}
              className="flex items-center justify-between gap-4 text-sm"
            >
              <dt className="font-mono text-xs">{LABELS[key]}</dt>
              <dd className="flex items-center gap-1.5">
                {present ? (
                  <>
                    <CircleCheckIcon className="size-4 text-emerald-600 dark:text-emerald-500" />
                    <span className="text-muted-foreground">Configurada</span>
                  </>
                ) : (
                  <>
                    <CircleXIcon
                      className={
                        OPTIONAL.has(key)
                          ? "text-muted-foreground size-4"
                          : "text-destructive size-4"
                      }
                    />
                    <span className="text-muted-foreground">
                      {OPTIONAL.has(key)
                        ? "Sin definir (opcional)"
                        : "Faltante"}
                    </span>
                  </>
                )}
              </dd>
            </div>
          ))}
        </dl>
      </CardContent>
    </Card>
  );
}
