/**
 * Runs in the jsdom project on purpose: these exports execute in the
 * operator's browser, not on the server, and ExcelJS is the dependency most
 * likely to assume a Node runtime.
 */
import { describe, expect, it } from "vitest";

import { serializeCsv } from "@/lib/csv/serialize";
import { buildDataWorkbook, buildTemplateWorkbook } from "@/lib/excel/workbook";
import { generateMeasurements } from "@/lib/generator/generate";
import type { GeneratorConfig } from "@/lib/generator/types";

const config: GeneratorConfig = {
  count: 250,
  startAt: "2026-08-01T00:00:00.000Z",
  intervalSeconds: 20,
  seed: "export",
  temperature: {
    min: 22,
    max: 32,
    base: 26.5,
    dailyAmplitude: 2.5,
    noise: 0.35,
  },
  humidity: { min: 45, max: 85, base: 68, dailyAmplitude: 6, noise: 1.2 },
  correlation: 0.55,
  anomalyRate: 0.004,
  anomalyMagnitude: 6,
  decimals: 1,
};

async function isZip(blob: Blob): Promise<boolean> {
  const header = new Uint8Array(await blob.slice(0, 2).arrayBuffer());
  // Every .xlsx is a ZIP container, so it must start with "PK".
  return header[0] === 0x50 && header[1] === 0x4b;
}

describe("browser exports", () => {
  it("serializes a generated dataset to CSV", () => {
    const rows = generateMeasurements(config);
    const csv = serializeCsv(rows, { decimals: 1, withBom: false });
    const lines = csv.trimEnd().split("\r\n");

    expect(lines).toHaveLength(rows.length + 1);
    expect(lines[1]).toMatch(/^2026-08-01T00:00:00\.000Z,-?\d+\.\d,\d+\.\d$/);
  });

  it("builds a real XLSX workbook in a browser-like environment", async () => {
    const rows = generateMeasurements(config).map((row) => ({
      createdAt: row.createdAt,
      temperature: row.temperature,
      humidity: row.humidity,
    }));

    const blob = await buildDataWorkbook(rows, 1);

    expect(blob.size).toBeGreaterThan(1000);
    expect(await isZip(blob)).toBe(true);
  }, 30_000);

  it("builds the template workbook", async () => {
    const blob = await buildTemplateWorkbook();

    expect(await isZip(blob)).toBe(true);
  }, 30_000);
});
