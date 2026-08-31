import Dexie, { type EntityTable } from "dexie";

import type { GeneratorConfig } from "@/lib/generator/types";

/**
 * Local persistence (MVP spec, section 10.4).
 *
 * IndexedDB is the only durable store in the MVP: Vercel functions are
 * ephemeral, so a dataset and the progress of its upload live in the
 * operator's browser. ThingSpeak remains the definitive home of the
 * measurements themselves.
 */

export type DatasetSource = "generated" | "csv" | "xlsx" | "backup";
export type DatasetValidationStatus = "pending" | "valid" | "invalid";

export type Dataset = {
  id: string;
  name: string;
  source: DatasetSource;
  rowCount: number;
  validationStatus: DatasetValidationStatus;
  createdAt: string;
  updatedAt: string;
  generatorConfig?: GeneratorConfig;
  /** Content hash, so a duplicate import is recognisable. */
  checksum?: string;
  /** Free-text note, e.g. the source filename. */
  note?: string;
};

export type StoredMeasurement = {
  id?: number;
  datasetId: string;
  sequence: number;
  createdAt: string;
  temperature: number;
  humidity: number;
};

export type UploadJobStatus =
  | "draft"
  | "ready"
  | "running"
  | "waiting"
  | "paused"
  | "verifying"
  | "completed"
  | "failed"
  | "cancelled";

export type UploadJob = {
  id: string;
  datasetId: string;
  channelId: string;
  status: UploadJobStatus;
  totalRows: number;
  batchSize: number;
  totalBatches: number;
  nextBatchIndex: number;
  /** Rows ThingSpeak accepted for processing but that are not yet readable. */
  queuedRows: number;
  /** Rows read back from the channel. The only number that is proof. */
  confirmedRows: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  completedAt?: string;
  lastError?: { code: string; message: string; retryable: boolean };
};

export type UploadBatchStatus =
  | "pending"
  | "sending"
  /** Accepted with HTTP 202 and waiting in ThingSpeak's queue. */
  | "queued"
  | "confirmed"
  | "unknown"
  | "failed";

export type UploadBatch = {
  id: string;
  jobId: string;
  batchIndex: number;
  status: UploadBatchStatus;
  firstSequence: number;
  lastSequence: number;
  rowCount: number;
  updatedAt: string;
};

const db = new Dexie("thingspeak-qa") as Dexie & {
  datasets: EntityTable<Dataset, "id">;
  measurements: EntityTable<StoredMeasurement, "id">;
  uploadJobs: EntityTable<UploadJob, "id">;
  uploadBatches: EntityTable<UploadBatch, "id">;
};

db.version(1).stores({
  datasets: "id,source,validationStatus,createdAt,updatedAt",
  measurements: "++id,datasetId,[datasetId+sequence],[datasetId+createdAt]",
  uploadJobs: "id,datasetId,channelId,status,createdAt,updatedAt",
  uploadBatches: "id,jobId,[jobId+batchIndex],status,updatedAt",
});

export { db };
