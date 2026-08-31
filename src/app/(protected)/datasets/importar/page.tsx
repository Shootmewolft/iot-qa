import type { Metadata } from "next";

import { ImportWizard } from "@/components/datasets/import-wizard";
import { TemplateDownloads } from "@/components/datasets/template-downloads";

export const metadata: Metadata = {
  title: "Importar · ThingSpeak QA",
};

export default function ImportarPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Importar archivo
        </h1>
        <p className="text-muted-foreground text-sm">
          CSV o XLSX. Cada fila es una medición; los errores se reportan antes
          de guardar nada.
        </p>
      </div>

      <TemplateDownloads />
      <ImportWizard />
    </>
  );
}
