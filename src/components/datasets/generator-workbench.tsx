"use client";

import {
  DownloadIcon,
  FileSpreadsheetIcon,
  SaveIcon,
  TriangleAlertIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { GeneratorForm } from "@/components/datasets/generator-form";
import { GeneratorPreview } from "@/components/datasets/generator-preview";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { saveDataset } from "@/db/datasets";
import { serializeCsv } from "@/lib/csv/serialize";
import { downloadBlob, downloadText, timestampedName } from "@/lib/download";

import { generateMeasurements } from "@/lib/generator/generate";
import { collectWarnings, type GeneratorWarning } from "@/lib/generator/schema";
import type {
  GeneratedMeasurement,
  GeneratorConfig,
} from "@/lib/generator/types";

export function GeneratorWorkbench() {
  const router = useRouter();
  const [rows, setRows] = useState<GeneratedMeasurement[]>([]);
  const [config, setConfig] = useState<GeneratorConfig | null>(null);
  const [warnings, setWarnings] = useState<GeneratorWarning[]>([]);
  const [isGenerating, startGenerating] = useTransition();
  const [isExporting, setIsExporting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  function onGenerate(nextConfig: GeneratorConfig) {
    startGenerating(() => {
      try {
        const generated = generateMeasurements(nextConfig);
        setRows(generated);
        setConfig(nextConfig);
        setWarnings(collectWarnings(nextConfig));
        toast.success(
          `${generated.length.toLocaleString("es-CO")} mediciones generadas.`,
        );
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "No se pudo generar.",
        );
      }
    });
  }

  const csvRows = rows.map((row) => ({
    createdAt: row.createdAt,
    temperature: row.temperature,
    humidity: row.humidity,
  }));

  function onDownloadCsv() {
    downloadText(
      serializeCsv(csvRows, { decimals: config?.decimals ?? 2 }),
      `${timestampedName("dataset")}.csv`,
    );
  }

  async function onSaveDataset() {
    if (rows.length === 0 || !config) return;

    setIsSaving(true);
    try {
      await saveDataset({
        name: `Generado ${config.count} filas · semilla ${config.seed}`,
        source: "generated",
        rows: rows.map((row) => ({
          sequence: row.sequence,
          createdAt: row.createdAt,
          temperature: row.temperature,
          humidity: row.humidity,
        })),
        // Storing the config is what makes the dataset reproducible later.
        generatorConfig: config,
      });

      toast.success("Dataset guardado en este navegador.");
      router.push("/datasets");
    } catch {
      toast.error("No se pudo guardar el dataset.");
    } finally {
      setIsSaving(false);
    }
  }

  async function onDownloadXlsx() {
    setIsExporting(true);
    try {
      // ExcelJS is ~1 MB, so it is only fetched when actually requested.
      const { buildDataWorkbook } = await import("@/lib/excel/workbook");
      const blob = await buildDataWorkbook(csvRows, config?.decimals ?? 2);
      downloadBlob(blob, `${timestampedName("dataset")}.xlsx`);
    } catch {
      toast.error("No se pudo construir el archivo XLSX.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="grid gap-4">
      <GeneratorForm onGenerate={onGenerate} isGenerating={isGenerating} />

      {warnings.map((warning) => (
        <Alert key={warning.code}>
          <TriangleAlertIcon />
          <AlertTitle>Revisa antes de enviar</AlertTitle>
          <AlertDescription>{warning.message}</AlertDescription>
        </Alert>
      ))}

      {rows.length > 0 ? (
        <>
          <div className="flex flex-wrap gap-2">
            <Button onClick={onSaveDataset} disabled={isSaving}>
              <SaveIcon />
              {isSaving ? "Guardando…" : "Guardar dataset"}
            </Button>
            <Button variant="outline" onClick={onDownloadCsv}>
              <DownloadIcon />
              Descargar CSV
            </Button>
            <Button
              variant="outline"
              onClick={onDownloadXlsx}
              disabled={isExporting}
            >
              <FileSpreadsheetIcon />
              {isExporting ? "Generando XLSX…" : "Descargar XLSX"}
            </Button>
          </div>

          <GeneratorPreview rows={rows} />
        </>
      ) : null}
    </div>
  );
}
