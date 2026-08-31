/**
 * Runs in the jsdom project against fake-indexeddb, so these exercise the
 * real Dexie query paths rather than a stub.
 */
import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client-db";
import {
  checksumMeasurements,
  countAllMeasurements,
  deleteDataset,
  duplicateDataset,
  getDataset,
  getMeasurements,
  listDatasets,
  type MeasurementInput,
  renameDataset,
  saveDataset,
} from "@/db/datasets";

function rows(count: number, offsetSeconds = 0): MeasurementInput[] {
  return Array.from({ length: count }, (_, i) => ({
    sequence: i,
    createdAt: new Date(
      Date.UTC(2026, 7, 1) + (i + offsetSeconds) * 20_000,
    ).toISOString(),
    temperature: 26 + (i % 5) * 0.1,
    humidity: 70 - (i % 5) * 0.2,
  }));
}

beforeEach(async () => {
  await db.delete();
  await db.open();
});

describe("checksumMeasurements", () => {
  it("is stable for identical content", () => {
    expect(checksumMeasurements(rows(50))).toBe(checksumMeasurements(rows(50)));
  });

  it("changes when the content changes", () => {
    expect(checksumMeasurements(rows(50))).not.toBe(
      checksumMeasurements(rows(50, 1)),
    );
  });

  it("is eight hex characters", () => {
    expect(checksumMeasurements(rows(10))).toMatch(/^[0-9a-f]{8}$/);
  });
});

describe("saveDataset", () => {
  it("stores the dataset and all its measurements", async () => {
    const dataset = await saveDataset({
      name: "Prueba",
      source: "generated",
      rows: rows(2500),
    });

    expect(dataset.rowCount).toBe(2500);
    expect(dataset.validationStatus).toBe("valid");
    expect(await getMeasurements(dataset.id)).toHaveLength(2500);
  });

  it("reports progress while writing in chunks", async () => {
    const seen: number[] = [];

    await saveDataset({
      name: "Progreso",
      source: "generated",
      rows: rows(2500),
      onProgress: (written) => seen.push(written),
    });

    expect(seen).toEqual([1000, 2000, 2500]);
  });

  it("returns measurements in sequence order", async () => {
    const dataset = await saveDataset({
      name: "Orden",
      source: "csv",
      rows: rows(100),
    });

    const stored = await getMeasurements(dataset.id);
    expect(stored.map((row) => row.sequence)).toEqual(
      Array.from({ length: 100 }, (_, i) => i),
    );
  });

  it("supports paging through a dataset", async () => {
    const dataset = await saveDataset({
      name: "Paginado",
      source: "csv",
      rows: rows(500),
    });

    const page = await getMeasurements(dataset.id, { offset: 100, limit: 50 });

    expect(page).toHaveLength(50);
    expect(page[0].sequence).toBe(100);
  });

  it("keeps datasets isolated from each other", async () => {
    const a = await saveDataset({ name: "A", source: "csv", rows: rows(10) });
    const b = await saveDataset({ name: "B", source: "xlsx", rows: rows(20) });

    expect(await getMeasurements(a.id)).toHaveLength(10);
    expect(await getMeasurements(b.id)).toHaveLength(20);
    expect(await countAllMeasurements()).toBe(30);
  });
});

describe("listDatasets", () => {
  it("returns the newest first", async () => {
    await saveDataset({ name: "Primero", source: "csv", rows: rows(1) });
    await new Promise((resolve) => setTimeout(resolve, 5));
    await saveDataset({ name: "Segundo", source: "csv", rows: rows(1) });

    const list = await listDatasets();
    expect(list[0].name).toBe("Segundo");
  });
});

describe("deleteDataset", () => {
  it("removes the dataset and leaves no orphan measurements", async () => {
    const doomed = await saveDataset({
      name: "Borrar",
      source: "csv",
      rows: rows(300),
    });
    const kept = await saveDataset({
      name: "Conservar",
      source: "csv",
      rows: rows(50),
    });

    await deleteDataset(doomed.id);

    expect(await getDataset(doomed.id)).toBeUndefined();
    expect(await getMeasurements(doomed.id)).toHaveLength(0);
    expect(await countAllMeasurements()).toBe(50);
    expect(await getDataset(kept.id)).toBeDefined();
  });
});

describe("duplicateDataset", () => {
  it("copies the rows into an independent dataset", async () => {
    const original = await saveDataset({
      name: "Original",
      source: "generated",
      rows: rows(120),
    });

    const copy = await duplicateDataset(original.id);

    expect(copy).not.toBeNull();
    if (!copy) return;

    expect(copy.id).not.toBe(original.id);
    expect(copy.name).toBe("Original (copia)");
    expect(copy.checksum).toBe(original.checksum);
    expect(await getMeasurements(copy.id)).toHaveLength(120);

    // Deleting the copy must not touch the original.
    await deleteDataset(copy.id);
    expect(await getMeasurements(original.id)).toHaveLength(120);
  });

  it("returns null for a dataset that does not exist", async () => {
    expect(await duplicateDataset("ds_nope")).toBeNull();
  });
});

describe("renameDataset", () => {
  it("changes the name and bumps updatedAt", async () => {
    const dataset = await saveDataset({
      name: "Viejo",
      source: "csv",
      rows: rows(5),
    });

    await new Promise((resolve) => setTimeout(resolve, 5));
    await renameDataset(dataset.id, "Nuevo");

    const updated = await getDataset(dataset.id);
    expect(updated?.name).toBe("Nuevo");
    expect(updated?.updatedAt).not.toBe(dataset.updatedAt);
  });
});
