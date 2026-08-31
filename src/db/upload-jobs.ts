import {
  db,
  type UploadBatch,
  type UploadBatchStatus,
  type UploadJob,
  type UploadJobStatus,
} from "@/db/client-db";
import { MAX_MESSAGES_PER_BATCH } from "@/lib/upload/batching";

/**
 * Upload job persistence (MVP spec, sections 10.3 and 15.8).
 *
 * Progress is written to IndexedDB after every batch so a closed tab, a
 * reload or a crash never loses more than the batch in flight. The job is the
 * only record of what has already been sent: ThingSpeak cannot tell us which
 * batch a partial upload reached.
 */

export function newJobId(): string {
  return `job_${crypto.randomUUID().slice(0, 12)}`;
}

export async function createJob(options: {
  datasetId: string;
  channelId: string;
  totalRows: number;
  batchSize?: number;
}): Promise<UploadJob> {
  const now = new Date().toISOString();
  const batchSize = Math.min(
    options.batchSize ?? MAX_MESSAGES_PER_BATCH,
    MAX_MESSAGES_PER_BATCH,
  );
  const totalBatches = Math.ceil(options.totalRows / batchSize);
  const id = newJobId();

  const job: UploadJob = {
    id,
    datasetId: options.datasetId,
    channelId: options.channelId,
    status: "ready",
    totalRows: options.totalRows,
    batchSize,
    totalBatches,
    nextBatchIndex: 0,
    queuedRows: 0,
    confirmedRows: 0,
    createdAt: now,
    updatedAt: now,
  };

  const batches: UploadBatch[] = Array.from(
    { length: totalBatches },
    (_, index) => {
      const firstSequence = index * batchSize;
      const lastSequence = Math.min(
        firstSequence + batchSize - 1,
        options.totalRows - 1,
      );

      return {
        id: `${id}_${index}`,
        jobId: id,
        batchIndex: index,
        status: "pending" as UploadBatchStatus,
        firstSequence,
        lastSequence,
        rowCount: lastSequence - firstSequence + 1,
        updatedAt: now,
      };
    },
  );

  await db.transaction("rw", db.uploadJobs, db.uploadBatches, async () => {
    await db.uploadJobs.add(job);
    await db.uploadBatches.bulkAdd(batches);
  });

  return job;
}

export function listJobs(): Promise<UploadJob[]> {
  return db.uploadJobs.orderBy("createdAt").reverse().toArray();
}

export function getJob(id: string): Promise<UploadJob | undefined> {
  return db.uploadJobs.get(id);
}

export function getBatches(jobId: string): Promise<UploadBatch[]> {
  return db.uploadBatches
    .where("[jobId+batchIndex]")
    .between([jobId, -Infinity], [jobId, Infinity])
    .toArray();
}

export async function updateJob(
  id: string,
  changes: Partial<Omit<UploadJob, "id">>,
): Promise<void> {
  await db.uploadJobs.update(id, {
    ...changes,
    updatedAt: new Date().toISOString(),
  });
}

export async function setJobStatus(
  id: string,
  status: UploadJobStatus,
  lastError?: UploadJob["lastError"],
): Promise<void> {
  await updateJob(id, {
    status,
    lastError,
    ...(status === "running" ? { startedAt: new Date().toISOString() } : {}),
    ...(status === "completed"
      ? { completedAt: new Date().toISOString() }
      : {}),
  });
}

export async function setBatchStatus(
  jobId: string,
  batchIndex: number,
  status: UploadBatchStatus,
): Promise<void> {
  await db.uploadBatches.update(`${jobId}_${batchIndex}`, {
    status,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Records a batch that ThingSpeak accepted for processing.
 *
 * This is NOT a confirmation. `bulk_update` answers 202 and writes minutes
 * later, so the rows are counted as queued and the cursor advances so the
 * next batch can go out. Only `reconcileJob` may move them to confirmed.
 *
 * Both writes must land together: a queued batch with a stale cursor would be
 * resent on resume, and an advanced cursor with an untracked batch would
 * silently skip rows.
 */
export async function queueBatch(
  jobId: string,
  batchIndex: number,
  rowCount: number,
): Promise<void> {
  await db.transaction("rw", db.uploadJobs, db.uploadBatches, async () => {
    const job = await db.uploadJobs.get(jobId);
    if (!job) return;

    await db.uploadBatches.update(`${jobId}_${batchIndex}`, {
      status: "queued",
      updatedAt: new Date().toISOString(),
    });

    /*
     * Derived from the batches, never incremented.
     *
     * A running total drifts: a resumed job that re-sent a batch counted its
     * rows twice and reported more sent than the dataset contains. Recomputing
     * makes the write idempotent and repairs a job whose total already drifted.
     */
    const batches = await db.uploadBatches
      .where("jobId")
      .equals(jobId)
      .toArray();

    const queuedRows = batches
      .filter(
        (batch) => batch.status === "queued" || batch.status === "confirmed",
      )
      .reduce((sum, batch) => sum + batch.rowCount, 0);

    await db.uploadJobs.update(jobId, {
      nextBatchIndex: Math.max(job.nextBatchIndex, batchIndex + 1),
      queuedRows,
      updatedAt: new Date().toISOString(),
    });
  });
}

/**
 * Persists a confirmation count mid-flight.
 *
 * The settling phase can take minutes and may be interrupted by a navigation
 * or a closed tab. Writing only at the end left the card reporting 0 rows
 * confirmed for a channel that already held every one of them, with no way
 * back short of re-sending. Each poll is recorded so progress is visible and
 * survives the interruption.
 */
export async function recordConfirmedRows(
  jobId: string,
  confirmedRows: number,
): Promise<void> {
  await db.uploadJobs.update(jobId, {
    confirmedRows,
    updatedAt: new Date().toISOString(),
  });
}

/**
 * Recomputes the queued total from the batch records.
 *
 * Called when a job is reopened so a total left inconsistent by an earlier
 * run is corrected before the operator is shown a progress number.
 */
export async function repairQueuedTotal(jobId: string): Promise<number> {
  const batches = await getBatches(jobId);
  const queuedRows = batches
    .filter(
      (batch) => batch.status === "queued" || batch.status === "confirmed",
    )
    .reduce((sum, batch) => sum + batch.rowCount, 0);

  await db.uploadJobs.update(jobId, { queuedRows });
  return queuedRows;
}

/**
 * Records the outcome of reading the channel back: the only evidence that
 * rows were actually stored.
 */
export async function reconcileJob(
  jobId: string,
  confirmedRows: number,
): Promise<void> {
  await db.transaction("rw", db.uploadJobs, db.uploadBatches, async () => {
    const job = await db.uploadJobs.get(jobId);
    if (!job) return;

    const complete = confirmedRows >= job.totalRows;
    const now = new Date().toISOString();

    if (complete) {
      const batches = await db.uploadBatches
        .where("jobId")
        .equals(jobId)
        .toArray();

      await db.uploadBatches.bulkPut(
        batches.map((batch) => ({
          ...batch,
          status: "confirmed" as const,
          updatedAt: now,
        })),
      );
    }

    await db.uploadJobs.update(jobId, {
      confirmedRows,
      status: complete ? "completed" : "paused",
      ...(complete ? { completedAt: now } : {}),
      updatedAt: now,
    });
  });
}

/** Jobs that were interrupted and can be resumed (spec section 15.8). */
export async function findResumableJobs(): Promise<UploadJob[]> {
  const jobs = await db.uploadJobs.toArray();
  return jobs.filter((job) =>
    ["running", "waiting", "paused", "verifying"].includes(job.status),
  );
}

export async function deleteJob(id: string): Promise<void> {
  await db.transaction("rw", db.uploadJobs, db.uploadBatches, async () => {
    await db.uploadBatches.where("jobId").equals(id).delete();
    await db.uploadJobs.delete(id);
  });
}
