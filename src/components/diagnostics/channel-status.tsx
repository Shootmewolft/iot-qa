import { HashIcon, PlugIcon, PlugZapIcon } from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { API_ERRORS, type ApiErrorCode } from "@/lib/api/errors";
import { formatDateTime } from "@/lib/format";
import type { ChannelInfo } from "@/lib/thingspeak/types";

type ChannelStatusProps = {
  channel: ChannelInfo | null;
  errorCode: ApiErrorCode | null;
};

export function ChannelStatus({ channel, errorCode }: ChannelStatusProps) {
  if (!channel) {
    return (
      <Alert variant="destructive">
        <PlugIcon />
        <AlertTitle>Sin conexión con el canal</AlertTitle>
        <AlertDescription>
          {errorCode
            ? `${API_ERRORS[errorCode].message} (${errorCode})`
            : "No se pudo leer el canal."}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PlugZapIcon className="size-4 text-emerald-600 dark:text-emerald-500" />
          {channel.name}
          <Badge variant="outline" className="ml-auto font-mono">
            <HashIcon className="size-3" />
            {channel.id}
          </Badge>
        </CardTitle>
        <CardDescription>
          {channel.description ?? "El canal no tiene descripción."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-2 text-sm sm:grid-cols-2">
          <Row label="Etiqueta de field1" value={channel.temperatureLabel} />
          <Row label="Etiqueta de field2" value={channel.humidityLabel} />
          <Row label="Último entry_id" value={channel.lastEntryId} />
          <Row label="Creado" value={formatDateTime(channel.createdAt)} />
          <Row
            label="Última actualización"
            value={formatDateTime(channel.updatedAt)}
          />
        </dl>
      </CardContent>
    </Card>
  );
}

function Row({
  label,
  value,
}: {
  label: string;
  value: string | number | null;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium">{value ?? "—"}</dd>
    </div>
  );
}
