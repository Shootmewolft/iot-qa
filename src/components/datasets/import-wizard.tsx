"use client";

import {
  ArrowUpDownIcon,
  CheckIcon,
  CircleAlertIcon,
  DownloadIcon,
  FileUpIcon,
  LoaderCircleIcon,
  SaveIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { saveDataset } from "@/db/datasets";
import { type ParsedTable, parseCsv } from "@/lib/csv/parse";
import { downloadText } from "@/lib/download";
import { parseXlsx, readSheetNames } from "@/lib/excel/parse";
import {
  type ColumnMapping,
  detectMapping,
  isMappingComplete,
  type MappedField,
} from "@/lib/import/mapping";
import {
  issuesToCsv,
  type RawRow,
  type ValidationResult,
  validateRows,
} from "@/lib/validation/measurement";

const FIELD_LABELS: Record<MappedField, string> = {
  createdAt: "created_at (fecha y hora)",
  temperature: "field1 (temperatura)",
  humidity: "field2 (humedad)",
};

const MAX_ISSUES_SHOWN = 50;

type FileKind = "csv" | "xlsx";

export function ImportWizard() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<FileKind | null>(null);
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [sheet, setSheet] = useState<string | null>(null);
  const [table, setTable] = useState<ParsedTable | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [result, setResult] = useState<ValidationResult | null>(null);
  const [sorted, setSorted] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  function reset() {
    setFile(null);
    setKind(null);
    setSheetNames([]);
    setSheet(null);
    setTable(null);
    setMapping(null);
    setResult(null);
    setSorted(false);
    setName("");
  }

  async function onFile(selected: File) {
    reset();
    setBusy("Leyendo el archivo…");

    try {
      const isXlsx = /\.xlsx$/i.test(selected.name);
      setFile(selected);
      setName(selected.name.replace(/\.(csv|xlsx)$/i, ""));
      setKind(isXlsx ? "xlsx" : "csv");

      if (isXlsx) {
        const { sheetNames: names } = await readSheetNames(selected);
        setSheetNames(names);

        // A single-sheet workbook needs no choice; skip straight past it.
        if (names.length === 1) {
          await loadTable(selected, names[0]);
        } else {
          // A template we generated puts the data in DATOS.
          const preferred = names.includes("DATOS") ? "DATOS" : names[0];
          setSheet(preferred);
        }
      } else {
        await loadTable(selected, null);
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "No se pudo leer el archivo.",
      );
      reset();
    } finally {
      setBusy(null);
    }
  }

  async function loadTable(target: File, sheetName: string | null) {
    setBusy("Analizando columnas…");
    try {
      const parsed = sheetName
        ? await parseXlsx(target, sheetName)
        : await parseCsv(target);

      setTable(parsed);
      setSheet(sheetName);
      setMapping(detectMapping(parsed.headers));
      setResult(null);
      setSorted(false);
    } finally {
      setBusy(null);
    }
  }

  function buildRawRows(
    parsed: ParsedTable,
    columns: ColumnMapping,
    sortByTimestamp: boolean,
  ): RawRow[] {
    const rows = parsed.rows.map((record) => ({
      createdAt: String(record[columns.createdAt ?? ""] ?? ""),
      temperature: String(record[columns.temperature ?? ""] ?? ""),
      humidity: String(record[columns.humidity ?? ""] ?? ""),
    }));

    if (!sortByTimestamp) return rows;

    /*
     * ThingSpeak does not require ascending order, so sorting is offered as a
     * correction rather than forced: it rescues a file whose only problem is
     * ordering, without silently rewriting one the operator meant to review.
     */
    return [...rows].sort((a, b) => {
      const left = new Date(a.createdAt).getTime();
      const right = new Date(b.createdAt).getTime();
      if (Number.isNaN(left) || Number.isNaN(right)) return 0;
      return left - right;
    });
  }

  function onValidate(sortByTimestamp = false) {
    if (!table || !mapping || !isMappingComplete(mapping)) return;

    setBusy("Validando filas…");
    // Deferred so the browser paints the busy state before the work starts.
    setTimeout(() => {
      try {
        setResult(validateRows(buildRawRows(table, mapping, sortByTimestamp)));
        setSorted(sortByTimestamp);
      } finally {
        setBusy(null);
      }
    }, 0);
  }

  async function onSave() {
    if (!result || result.valid.length === 0 || !kind) return;

    setBusy("Guardando en IndexedDB…");
    try {
      await saveDataset({
        name: name.trim() || "Importado",
        source: kind,
        rows: result.valid,
        note: `${file?.name ?? "archivo"}${sheet ? ` · hoja ${sheet}` : ""}${sorted ? " · reordenado" : ""}`,
      });

      toast.success(
        `${result.valid.length.toLocaleString("es-CO")} mediciones guardadas.`,
      );
      router.push("/datasets");
    } catch {
      toast.error("No se pudo guardar el dataset.");
    } finally {
      setBusy(null);
    }
  }

  const outOfOrderOnly =
    result !== null &&
    result.issues.length > 0 &&
    result.issues.every((issue) => issue.code === "TIMESTAMP_OUT_OF_ORDER");

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>1. Archivo</CardTitle>
          <CardDescription>
            CSV o XLSX, máximo 10.000 filas con datos. Nada se envía al
            servidor: el archivo se lee en este navegador.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-3">
          <Label htmlFor="import-file">Archivo CSV o XLSX</Label>
          <Input
            id="import-file"
            type="file"
            accept=".csv,.xlsx,text/csv"
            onChange={(event) => {
              const selected = event.target.files?.[0];
              if (selected) onFile(selected);
            }}
          />
          {file ? (
            <p className="text-muted-foreground text-sm">
              <FileUpIcon className="mr-1 inline size-3.5" />
              {file.name} · {(file.size / 1024).toFixed(0)} KB
              {table?.delimiter
                ? ` · delimitador detectado "${table.delimiter}"`
                : null}
            </p>
          ) : null}
        </CardContent>
      </Card>

      {sheetNames.length > 1 && file ? (
        <Card>
          <CardHeader>
            <CardTitle>2. Hoja</CardTitle>
            <CardDescription>
              El libro tiene {sheetNames.length} hojas.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Select
              value={sheet ?? undefined}
              onValueChange={(value) => loadTable(file, value)}
            >
              <SelectTrigger className="max-w-sm">
                <SelectValue placeholder="Elige una hoja" />
              </SelectTrigger>
              <SelectContent>
                {sheetNames.map((sheetName) => (
                  <SelectItem key={sheetName} value={sheetName}>
                    {sheetName}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>
      ) : null}

      {table && mapping ? (
        <Card>
          <CardHeader>
            <CardTitle>{sheetNames.length > 1 ? "3" : "2"}. Mapeo</CardTitle>
            <CardDescription>
              {table.rows.length.toLocaleString("es-CO")} filas leídas.
              Comprueba que cada campo apunte a la columna correcta.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-3">
              {(Object.keys(FIELD_LABELS) as MappedField[]).map((field) => (
                <div key={field} className="grid gap-2">
                  <Label>{FIELD_LABELS[field]}</Label>
                  <Select
                    value={mapping[field] ?? undefined}
                    onValueChange={(value) => {
                      setMapping({ ...mapping, [field]: value });
                      setResult(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Sin asignar" />
                    </SelectTrigger>
                    <SelectContent>
                      {table.headers.map((header) => (
                        <SelectItem key={header} value={header}>
                          {header}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              ))}
            </div>

            {table.warnings.length > 0 ? (
              <Alert>
                <CircleAlertIcon />
                <AlertTitle>Avisos del lector</AlertTitle>
                <AlertDescription>
                  <ul className="list-disc pl-4">
                    {table.warnings.slice(0, 5).map((warning) => (
                      <li key={warning}>{warning}</li>
                    ))}
                  </ul>
                </AlertDescription>
              </Alert>
            ) : null}

            <Button
              onClick={() => onValidate(false)}
              disabled={!isMappingComplete(mapping) || busy !== null}
            >
              {busy ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <CheckIcon />
              )}
              Validar
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {result ? (
        <ValidationReport
          result={result}
          sorted={sorted}
          outOfOrderOnly={outOfOrderOnly}
          onSort={() => onValidate(true)}
          busy={busy !== null}
        />
      ) : null}

      {result && result.valid.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>Guardar</CardTitle>
            <CardDescription>
              Se guardarán las {result.valid.length.toLocaleString("es-CO")}{" "}
              filas válidas. Las filas con error quedan fuera.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:max-w-md">
            <div className="grid gap-2">
              <Label htmlFor="dataset-name">Nombre del dataset</Label>
              <Input
                id="dataset-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <Button onClick={onSave} disabled={busy !== null}>
              {busy ? (
                <LoaderCircleIcon className="animate-spin" />
              ) : (
                <SaveIcon />
              )}
              Guardar dataset
            </Button>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function ValidationReport({
  result,
  sorted,
  outOfOrderOnly,
  onSort,
  busy,
}: {
  result: ValidationResult;
  sorted: boolean;
  outOfOrderOnly: boolean;
  onSort: () => void;
  busy: boolean;
}) {
  const shown = result.issues.slice(0, MAX_ISSUES_SHOWN);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validación</CardTitle>
        <CardDescription>
          {result.totalRows.toLocaleString("es-CO")} filas leídas ·{" "}
          {result.valid.length.toLocaleString("es-CO")} válidas ·{" "}
          {result.issues.length.toLocaleString("es-CO")} problemas
          {result.skippedBlankRows > 0
            ? ` · ${result.skippedBlankRows} filas vacías omitidas`
            : null}
          {sorted ? " · reordenado por fecha" : null}
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {result.issues.length === 0 ? (
          <Alert>
            <CheckIcon />
            <AlertTitle>Sin errores</AlertTitle>
            <AlertDescription>
              Todas las filas con datos pasaron la validación.
            </AlertDescription>
          </Alert>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() =>
                  downloadText(
                    issuesToCsv(result.issues),
                    "errores-importacion.csv",
                  )
                }
              >
                <DownloadIcon />
                Descargar informe de errores
              </Button>
              {outOfOrderOnly && !sorted ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={onSort}
                  disabled={busy}
                >
                  <ArrowUpDownIcon />
                  Ordenar por fecha y revalidar
                </Button>
              ) : null}
            </div>

            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Fila</TableHead>
                    <TableHead className="w-28">Columna</TableHead>
                    <TableHead>Valor</TableHead>
                    <TableHead>Motivo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {shown.map((issue) => (
                    <TableRow
                      key={`${issue.row}-${issue.column}-${issue.code}`}
                    >
                      <TableCell className="tabular-nums">
                        {issue.row}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-xs">
                          {issue.column}
                        </Badge>
                      </TableCell>
                      <TableCell className="max-w-48 truncate font-mono text-xs">
                        {issue.value || "(vacío)"}
                      </TableCell>
                      <TableCell className="text-sm">{issue.message}</TableCell>
                    </TableRow>
                  ))}
                  {result.issues.length > MAX_ISSUES_SHOWN ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-muted-foreground text-center text-xs"
                      >
                        …{" "}
                        {(
                          result.issues.length - MAX_ISSUES_SHOWN
                        ).toLocaleString("es-CO")}{" "}
                        problemas más. Descarga el informe completo.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
