import type { Metadata } from "next";

import { GeneratorWorkbench } from "@/components/datasets/generator-workbench";
import { TemplateDownloads } from "@/components/datasets/template-downloads";

export const metadata: Metadata = {
  title: "Generar datos · ThingSpeak QA",
};

export default function GenerarPage() {
  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Generar datos</h1>
        <p className="text-muted-foreground text-sm">
          Hasta 10.000 mediciones realistas y reproducibles, sin mantener la
          simulación de Wokwi corriendo.
        </p>
      </div>

      <TemplateDownloads />
      <GeneratorWorkbench />
    </>
  );
}
