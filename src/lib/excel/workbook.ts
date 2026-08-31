import type { Row, Workbook } from "exceljs";

import type { CsvRow } from "@/lib/csv/serialize";

/**
 * XLSX generation.
 *
 * ExcelJS is imported dynamically so its ~1 MB of code never reaches a
 * browser that only wanted the dashboard (spec section 23). The `import type`
 * above is erased at compile time, so it costs nothing at runtime.
 *
 * SheetJS CE was the alternative the spec left open; it is ruled out because
 * its npm package has been frozen at 0.18.5 since March 2022.
 */

const DATA_SHEET = "DATOS";
const INSTRUCTIONS_SHEET = "INSTRUCCIONES";

const HEADER_BACKGROUND = "FF1F2937";

const INSTRUCTIONS: [string, string][] = [
  ["Columna", "Qué debe contener"],
  [
    "created_at",
    "Fecha y hora en formato ISO 8601, por ejemplo 2026-08-01T13:00:00Z. Debe ser única en todo el archivo.",
  ],
  ["field1", "Temperatura en grados Celsius. Entre -40 y 80."],
  ["field2", "Humedad relativa en porcentaje. Entre 0 y 100."],
  ["", ""],
  ["Regla", "Detalle"],
  [
    "Filas",
    "Máximo 10.000 por archivo. Una medición por fila, nunca por columna.",
  ],
  [
    "Timestamps",
    "Únicos y en orden ascendente. ThingSpeak rechaza el lote COMPLETO si detecta uno duplicado.",
  ],
  ["Decimales", "Usa punto como separador decimal, no coma."],
  ["Vacíos", "Deja la celda vacía si no hay lectura. No escribas 0 ni N/A."],
  ["Hoja", "Los datos se leen únicamente de la hoja DATOS."],
];

function styleHeaderRow(row: Row): void {
  row.font = { bold: true, color: { argb: "FFFFFFFF" } };
  row.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: HEADER_BACKGROUND },
  };
  row.height = 20;
  row.commit();
}

async function newWorkbook(): Promise<Workbook> {
  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "ThingSpeak QA";
  workbook.created = new Date();
  return workbook;
}

function addInstructionsSheet(workbook: Workbook): void {
  const sheet = workbook.addWorksheet(INSTRUCTIONS_SHEET);
  sheet.columns = [{ width: 22 }, { width: 90 }];

  for (const [left, right] of INSTRUCTIONS) {
    const row = sheet.addRow([left, right]);
    if (right === "Qué debe contener" || right === "Detalle") {
      row.font = { bold: true };
    }
  }

  styleHeaderRow(sheet.getRow(1));
}

export async function buildDataWorkbook(
  rows: CsvRow[],
  decimals = 2,
): Promise<Blob> {
  const workbook = await newWorkbook();

  const sheet = workbook.addWorksheet(DATA_SHEET);
  sheet.columns = [
    { header: "created_at", key: "createdAt", width: 26 },
    { header: "field1", key: "temperature", width: 12 },
    { header: "field2", key: "humidity", width: 12 },
  ];

  styleHeaderRow(sheet.getRow(1));

  const numberFormat = decimals > 0 ? `0.${"0".repeat(decimals)}` : "0";

  for (const row of rows) {
    const added = sheet.addRow({
      createdAt: row.createdAt,
      temperature: row.temperature,
      humidity: row.humidity,
    });
    added.getCell("temperature").numFmt = numberFormat;
    added.getCell("humidity").numFmt = numberFormat;
  }

  addInstructionsSheet(workbook);

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

export async function buildTemplateWorkbook(): Promise<Blob> {
  return buildDataWorkbook(
    [
      {
        createdAt: "2026-08-01T13:00:00.000Z",
        temperature: 26.4,
        humidity: 72.1,
      },
      {
        createdAt: "2026-08-01T13:00:20.000Z",
        temperature: 26.5,
        humidity: 71.8,
      },
    ],
    1,
  );
}
