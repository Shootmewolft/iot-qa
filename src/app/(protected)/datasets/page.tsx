import { UploadIcon, Wand2Icon } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

import { DatasetList } from "@/components/datasets/dataset-list";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Datasets · ThingSpeak QA",
};

export default function DatasetsPage() {
  // Read on the server: the channel id is configuration, not a client secret,
  // but it still has no business being duplicated into the bundle.
  const channelId = process.env.THINGSPEAK_CHANNEL_ID ?? "";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Datasets</h1>
          <p className="text-muted-foreground text-sm">
            Conjuntos guardados en este navegador, listos para cargar a
            ThingSpeak.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link href="/datasets/importar">
              <UploadIcon />
              Importar
            </Link>
          </Button>
          <Button asChild>
            <Link href="/datasets/generar">
              <Wand2Icon />
              Generar
            </Link>
          </Button>
        </div>
      </div>

      <DatasetList channelId={channelId} />
    </>
  );
}
