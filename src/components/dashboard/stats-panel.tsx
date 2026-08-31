import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { CorrelationResult } from "@/lib/statistics/correlation";
import type { DescriptiveStats } from "@/lib/statistics/descriptive";

const ROWS: { label: string; key: keyof DescriptiveStats }[] = [
  { label: "Cantidad", key: "count" },
  { label: "Mínimo", key: "min" },
  { label: "Máximo", key: "max" },
  { label: "Promedio", key: "mean" },
  { label: "Mediana", key: "median" },
  { label: "Desviación estándar", key: "stdDev" },
  { label: "Percentil 25", key: "p25" },
  { label: "Percentil 75", key: "p75" },
  { label: "Rango", key: "range" },
];

function show(value: number, key: keyof DescriptiveStats): string {
  if (!Number.isFinite(value)) return "—";
  return key === "count" ? value.toLocaleString("es-CO") : value.toFixed(2);
}

export function StatsPanel({
  temperature,
  humidity,
  correlation,
}: {
  temperature: DescriptiveStats;
  humidity: DescriptiveStats;
  correlation: CorrelationResult;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Estadísticas descriptivas</CardTitle>
        <CardDescription>
          Calculadas sobre todas las mediciones del rango, no sobre la muestra
          que dibuja la gráfica.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Medida</TableHead>
                <TableHead className="text-right">Temperatura (°C)</TableHead>
                <TableHead className="text-right">Humedad (%)</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ROWS.map(({ label, key }) => (
                <TableRow key={key}>
                  <TableCell className="text-muted-foreground">
                    {label}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {show(temperature[key], key)}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {show(humidity[key], key)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="bg-muted/40 grid gap-1 rounded-lg p-3 text-sm">
          <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">
              Correlación de Pearson (temperatura vs. humedad)
            </span>
            <span className="font-semibold tabular-nums">
              {Number.isFinite(correlation.r) ? correlation.r.toFixed(4) : "—"}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {correlation.interpretation} Calculada sobre{" "}
            {correlation.pairs.toLocaleString("es-CO")} pares con ambos campos.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
