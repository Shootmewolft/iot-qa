import {
  type Dataset,
  type DatasetSource,
  db,
  type StoredMeasurement,
} from "@/db/client-db";
import type { GeneratorConfig } from "@/lib/generator/types";

/**
 * Rows written per transaction chunk.
 *
 * Dexie can take all 10,000 at once, but a single giant `bulkAdd` blocks the
 * main thread long enough to freeze the progress indicator. Chunking keeps
 * the UI responsive and lets us report progress honestly (spec section 23).
 */
const WRITE_CHUNK_SIZE = 1000;

export type MeasurementInput = {
  sequence: number;
  createdAt: string;
  temperature: number;
  humidity: number;
};

/**
 * FNV-1a over the measurement content.
 *
 * Not cryptographic and not meant to be: it exists to tell "the operator
 * imported the same file twice" from "these are two different datasets".
 */
export function checksumMeasurements(rows: MeasurementInput[]): string {
  let hash = 0x811c9dc5;

  for (const row of rows) {
    const text = `${row.createdAt}|${row.temperature}|${row.humidity}`;
    for (let i = 0; i < text.length; i++) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  }

  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function newDatasetId(): string {
  return `ds_${crypto.randomUUID().slice(0, 12)}`;
}

export type SaveDatasetInput = {
  name: string;
  source: DatasetSource;
  rows: MeasurementInput[];
  generatorConfig?: GeneratorConfig;
  note?: string;
  onProgress?: (written: number, total: number) => void;
};

export async function saveDataset(input: SaveDatasetInput): Promise<Dataset> {
  const now = new Date().toISOString();
  const id = newDatasetId();

  const dataset: Dataset = {
    id,
    name: input.name,
    source: input.source,
    rowCount: input.rows.length,
    validationStatus: input.rows.length > 0 ? "valid" : "invalid",
    createdAt: now,
    updatedAt: now,
    generatorConfig: input.generatorConfig,
    checksum: checksumMeasurements(input.rows),
    note: input.note,
  };

  await db.datasets.add(dataset);

  for (let offset = 0; offset < input.rows.length; offset += WRITE_CHUNK_SIZE) {
    const chunk: StoredMeasurement[] = input.rows
      .slice(offset, offset + WRITE_CHUNK_SIZE)
      .map((row) => ({ ...row, datasetId: id }));

    await db.measurements.bulkAdd(chunk);
    input.onProgress?.(
      Math.min(offset + WRITE_CHUNK_SIZE, input.rows.length),
      input.rows.length,
    );
  }

  return dataset;
}

export function listDatasets(): Promise<Dataset[]> {
  return db.datasets.orderBy("createdAt").reverse().toArray();
}

export function getDataset(id: string): Promise<Dataset | undefined> {
  return db.datasets.get(id);
}

/** Measurements in sequence order. Pass a range to page through a big set. */
export function getMeasurements(
  datasetId: string,
  options: { offset?: number; limit?: number } = {},
): Promise<StoredMeasurement[]> {
  let collection = db.measurements
    .where("[datasetId+sequence]")
    .between([datasetId, -Infinity], [datasetId, Infinity]);

  if (options.offset) collection = collection.offset(options.offset);
  if (options.limit) collection = collection.limit(options.limit);

  return collection.toArray();
}

/**
 * Deletes a dataset and its measurements atomically. Without the transaction
 * a failure halfway would leave orphaned rows that nothing ever reclaims.
 */
export async function deleteDataset(id: string): Promise<void> {
  await db.transaction("rw", db.datasets, db.measurements, async () => {
    await db.measurements.where("datasetId").equals(id).delete();
    await db.datasets.delete(id);
  });
}

export async function renameDataset(id: string, name: string): Promise<void> {
  await db.datasets.update(id, { name, updatedAt: new Date().toISOString() });
}

export async function duplicateDataset(id: string): Promise<Dataset | null> {
  const source = await getDataset(id);
  if (!source) return null;

  const rows = await getMeasurements(id);

  return saveDataset({
    name: `${source.name} (copia)`,
    source: source.source,
    generatorConfig: source.generatorConfig,
    note: source.note,
    rows: rows.map((row) => ({
      sequence: row.sequence,
      createdAt: row.createdAt,
      temperature: row.temperature,
      humidity: row.humidity,
    })),
  });
}

/** Total measurements held locally, for the storage warning on the list. */
export function countAllMeasurements(): Promise<number> {
  return db.measurements.count();
}
