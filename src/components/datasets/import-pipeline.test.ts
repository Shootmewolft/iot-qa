/**
 * End-to-end import pipeline, from a real File through parsing, mapping and
 * validation into IndexedDB. Runs in jsdom because every one of these steps
 * happens in the operator's browser.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client-db";
import { getMeasurements, saveDataset } from "@/db/datasets";
import { parseCsv } from "@/lib/csv/parse";
import { parseXlsx, readSheetNames } from "@/lib/excel/parse";
import { buildDataWorkbook, buildTemplateWorkbook } from "@/lib/excel/workbook";
import { detectMapping, isMappingComplete } from "@/lib/import/mapping";
import { type RawRow, validateRows } from "@/lib/validation/measurement";

function csvFile(content: string, name = "datos.csv"): File {
  return new File([content], name, { type: "text/csv" });
}

async function blobToFile(blob: Blob, name: string): Promise<File> {
  return new File([await blob.arrayBuffer()], name, { type: blob.type });
}

function toRawRows(
  rows: Record<string, string>[],
  mapping: ReturnType<typeof detectMapping>,
): RawRow[] {
  return rows.map((record) => ({
    createdAt: String(record[mapping.createdAt ?? ""] ?? ""),
    temperature: String(record[mapping.temperature ?? ""] ?? ""),
    humidity: String(record[mapping.humidity ?? ""] ?? ""),
  }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("CSV import", () => {
  it("parses, maps, validates and stores a comma-separated file", async () => {
    const file = csvFile(
      [
        "created_at,field1,field2",
        "2026-08-01T13:00:00Z,26.4,72.1",
        "2026-08-01T13:00:20Z,26.5,71.8",
        "2026-08-01T13:00:40Z,26.6,71.5",
      ].join("\n"),
    );

    const table = await parseCsv(file);
    expect(table.delimiter).toBe(",");
    expect(table.rows).toHaveLength(3);

    const mapping = detectMapping(table.headers);
    expect(isMappingComplete(mapping)).toBe(true);

    const result = validateRows(toRawRows(table.rows, mapping));
    expect(result.issues).toHaveLength(0);
    expect(result.valid).toHaveLength(3);

    const dataset = await saveDataset({
      name: "CSV",
      source: "csv",
      rows: result.valid,
    });

    const stored = await getMeasurements(dataset.id);
    expect(stored).toHaveLength(3);
    expect(stored[0].temperature).toBe(26.4);
  });

  it("auto-detects a semicolon delimiter, as Spanish Excel exports", async () => {
    const file = csvFile(
      [
        "created_at;field1;field2",
        "2026-08-01T13:00:00Z;26,4;72,1",
        "2026-08-01T13:00:20Z;26,5;71,8",
      ].join("\n"),
    );

    const table = await parseCsv(file);
    expect(table.delimiter).toBe(";");

    const mapping = detectMapping(table.headers);
    const result = validateRows(toRawRows(table.rows, mapping));

    // Comma decimals must survive too, or the whole file would fail.
    expect(result.issues).toHaveLength(0);
    expect(result.valid[0].temperature).toBe(26.4);
  });

  it("maps Spanish headers without manual intervention", async () => {
    const file = csvFile(
      ["Fecha,Temperatura,Humedad", "2026-08-01T13:00:00Z,26.4,72.1"].join(
        "\n",
      ),
    );

    const table = await parseCsv(file);
    const mapping = detectMapping(table.headers);

    expect(isMappingComplete(mapping)).toBe(true);
    expect(validateRows(toRawRows(table.rows, mapping)).valid).toHaveLength(1);
  });

  it("reports bad rows and still keeps the good ones", async () => {
    const file = csvFile(
      [
        "created_at,field1,field2",
        "2026-08-01T13:00:00Z,26.4,72.1",
        "no-es-fecha,26.5,71.8",
        "2026-08-01T13:00:40Z,999,71.5",
        "2026-08-01T13:00:00Z,26.7,71.0",
        "",
        "2026-08-01T13:01:00Z,26.8,70.9",
      ].join("\n"),
    );

    const table = await parseCsv(file);
    const result = validateRows(
      toRawRows(table.rows, detectMapping(table.headers)),
    );

    const codes = result.issues.map((issue) => issue.code);
    expect(codes).toContain("TIMESTAMP_INVALID");
    expect(codes).toContain("TEMPERATURE_OUT_OF_RANGE");
    expect(codes).toContain("TIMESTAMP_DUPLICATED");
    expect(result.valid).toHaveLength(2);
  });
});

describe("XLSX import", () => {
  it("round-trips a workbook this app generated", async () => {
    const blob = await buildDataWorkbook(
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

    const file = await blobToFile(blob, "datos.xlsx");

    const { sheetNames } = await readSheetNames(file);
    expect(sheetNames).toEqual(["DATOS", "INSTRUCCIONES"]);

    const table = await parseXlsx(file, "DATOS");
    expect(table.headers).toEqual(["created_at", "field1", "field2"]);

    const result = validateRows(
      toRawRows(table.rows, detectMapping(table.headers)),
    );
    expect(result.issues).toHaveLength(0);
    expect(result.valid).toHaveLength(2);
    expect(result.valid[0].temperature).toBe(26.4);
  }, 30_000);

  it("reads the shipped template without errors", async () => {
    const file = await blobToFile(
      await buildTemplateWorkbook(),
      "plantilla.xlsx",
    );

    const table = await parseXlsx(file, "DATOS");
    const result = validateRows(
      toRawRows(table.rows, detectMapping(table.headers)),
    );

    expect(result.valid).toHaveLength(2);
  }, 30_000);

  it("fails loudly on a sheet that does not exist", async () => {
    const file = await blobToFile(await buildTemplateWorkbook(), "p.xlsx");

    await expect(parseXlsx(file, "NO_EXISTE")).rejects.toThrow(/no existe/);
  }, 30_000);
});
