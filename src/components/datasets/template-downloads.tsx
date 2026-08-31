"use client";

import { FileDownIcon, FileSpreadsheetIcon } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { csvTemplate } from "@/lib/csv/serialize";
import { downloadBlob, downloadText } from "@/lib/download";

export function TemplateDownloads() {
  const [isBuilding, setIsBuilding] = useState(false);

  async function onXlsx() {
    setIsBuilding(true);
    try {
      const { buildTemplateWorkbook } = await import("@/lib/excel/workbook");
      downloadBlob(await buildTemplateWorkbook(), "plantilla-thingspeak.xlsx");
    } catch {
      toast.error("No se pudo construir la plantilla XLSX.");
    } finally {
      setIsBuilding(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Plantillas</CardTitle>
        <CardDescription>
          Descárgalas para preparar datos a mano y luego importarlos. La
          plantilla XLSX incluye una hoja INSTRUCCIONES con las reglas.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          onClick={() =>
            downloadText(csvTemplate(), "plantilla-thingspeak.csv")
          }
        >
          <FileDownIcon />
          Plantilla CSV
        </Button>
        <Button variant="outline" onClick={onXlsx} disabled={isBuilding}>
          <FileSpreadsheetIcon />
          {isBuilding ? "Generando…" : "Plantilla XLSX"}
        </Button>
      </CardContent>
    </Card>
  );
}
