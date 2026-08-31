import "fake-indexeddb/auto";

import { beforeEach, describe, expect, it } from "vitest";

import { db } from "@/db/client-db";
import {
  createJob,
  deleteJob,
  findResumableJobs,
  getBatches,
  getJob,
  queueBatch,
  reconcileJob,
  recordConfirmedRows,
  repairQueuedTotal,
  setBatchStatus,
  setJobStatus,
  updateJob,
} from "@/db/upload-jobs";
import { MAX_MESSAGES_PER_BATCH } from "@/lib/upload/batching";

beforeEach(async () => {
  await db.delete();
  await db.open();
});

const base = { datasetId: "ds_1", channelId: "3474649" };

describe("createJob", () => {
  it("splits 10,000 rows into 11 batches, matching the spec's own example", async () => {
    const job = await createJob({ ...base, totalRows: 10_000 });

    expect(job.totalBatches).toBe(11);
    expect(job.batchSize).toBe(MAX_MESSAGES_PER_BATCH);
    expect(job.nextBatchIndex).toBe(0);
    expect(job.confirmedRows).toBe(0);
    expect(job.status).toBe("ready");
  });

  it("creates one batch record per batch, covering every row exactly once", async () => {
    const job = await createJob({ ...base, totalRows: 2500 });
    const batches = await getBatches(job.id);

    expect(batches).toHaveLength(3);
    expect(batches.map((b) => b.rowCount).reduce((a, b) => a + b, 0)).toBe(
      2500,
    );

    // No gaps and no overlaps between consecutive batches.
    for (let i = 1; i < batches.length; i++) {
      expect(batches[i].firstSequence).toBe(batches[i - 1].lastSequence + 1);
    }
    expect(batches[0].firstSequence).toBe(0);
    expect(batches[2].lastSequence).toBe(2499);
  });

  it("never exceeds the free-account batch ceiling", async () => {
    const job = await createJob({ ...base, totalRows: 5000, batchSize: 5000 });
    expect(job.batchSize).toBe(MAX_MESSAGES_PER_BATCH);
  });

  it("returns batches in index order", async () => {
    const job = await createJob({ ...base, totalRows: 5000 });
    const batches = await getBatches(job.id);

    expect(batches.map((b) => b.batchIndex)).toEqual([0, 1, 2, 3, 4, 5]);
  });
});

describe("queueBatch", () => {
  it("advances the cursor and the queued count together", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });

    await queueBatch(job.id, 0, 960);
    const after = await getJob(job.id);

    expect(after?.nextBatchIndex).toBe(1);
    expect(after?.queuedRows).toBe(960);
    // A 202 is not proof: nothing may be counted as confirmed yet.
    expect(after?.confirmedRows).toBe(0);

    const batches = await getBatches(job.id);
    expect(batches[0].status).toBe("queued");
  });

  it("accumulates across batches", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });

    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 960);
    await queueBatch(job.id, 2, 80);

    const after = await getJob(job.id);
    expect(after?.queuedRows).toBe(2000);
    expect(after?.nextBatchIndex).toBe(3);
  });

  it("never moves the cursor backwards", async () => {
    const job = await createJob({ ...base, totalRows: 3000 });

    await queueBatch(job.id, 1, 960);
    await queueBatch(job.id, 0, 960);

    // Confirming an earlier batch out of order must not rewind the cursor,
    // which would resend batch 1 on resume and duplicate its timestamps.
    expect((await getJob(job.id))?.nextBatchIndex).toBe(2);
  });

  it("ignores a job that no longer exists rather than throwing", async () => {
    await expect(queueBatch("job_nope", 0, 10)).resolves.toBeUndefined();
  });
});

describe("resumption", () => {
  it("finds an interrupted job and reports where it stopped", async () => {
    const job = await createJob({ ...base, totalRows: 3000 });

    await setJobStatus(job.id, "running");
    await queueBatch(job.id, 0, 960);
    // Simulates the tab closing mid-upload.
    await setJobStatus(job.id, "paused");

    const resumable = await findResumableJobs();
    expect(resumable.map((j) => j.id)).toContain(job.id);

    const found = resumable.find((j) => j.id === job.id);
    expect(found?.nextBatchIndex).toBe(1);
    expect(found?.queuedRows).toBe(960);
  });

  it("does not offer a completed job for resumption", async () => {
    const job = await createJob({ ...base, totalRows: 500 });
    await setJobStatus(job.id, "completed");

    expect((await findResumableJobs()).map((j) => j.id)).not.toContain(job.id);
  });

  it("does not offer a failed job for automatic resumption", async () => {
    const job = await createJob({ ...base, totalRows: 500 });
    await setJobStatus(job.id, "failed");

    expect((await findResumableJobs()).map((j) => j.id)).not.toContain(job.id);
  });

  it("keeps an uncertain batch marked so it is verified, not resent", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });
    await setBatchStatus(job.id, 1, "unknown");

    const batches = await getBatches(job.id);
    expect(batches[1].status).toBe("unknown");
    // The cursor must NOT have advanced past an unverified batch.
    expect((await getJob(job.id))?.nextBatchIndex).toBe(0);
  });

  it("records the error that stopped a job", async () => {
    const job = await createJob({ ...base, totalRows: 500 });

    await setJobStatus(job.id, "failed", {
      code: "THINGSPEAK_UNAUTHORIZED",
      message: "Write API Key rechazada.",
      retryable: false,
    });

    expect((await getJob(job.id))?.lastError?.code).toBe(
      "THINGSPEAK_UNAUTHORIZED",
    );
  });
});

describe("deleteJob", () => {
  it("removes the job and leaves no orphan batches", async () => {
    const doomed = await createJob({ ...base, totalRows: 3000 });
    const kept = await createJob({ ...base, totalRows: 1000 });

    await deleteJob(doomed.id);

    expect(await getJob(doomed.id)).toBeUndefined();
    expect(await getBatches(doomed.id)).toHaveLength(0);
    expect(await getBatches(kept.id)).toHaveLength(2);
  });
});

/**
 * Regression: resuming a job used to re-send every batch from zero.
 *
 * `queueBatch` marks a sent batch as "queued"; batches only become
 * "confirmed" during the final reconciliation. The runner skipped only
 * "confirmed", so on resume nothing matched and the whole job went out
 * again — doubling `queuedRows` and re-sending timestamps ThingSpeak had
 * already stored.
 */
describe("resume must not re-send what was already sent", () => {
  it("marks a sent batch as queued, not pending", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });
    await queueBatch(job.id, 0, 960);

    const batches = await getBatches(job.id);
    expect(batches[0].status).toBe("queued");
  });

  it("leaves only the unsent batches to do", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 960);

    const batches = await getBatches(job.id);

    // What the runner must skip on resume.
    const alreadySent = batches.filter(
      (batch) => batch.status === "queued" || batch.status === "confirmed",
    );
    const pending = batches.filter(
      (batch) => batch.status !== "queued" && batch.status !== "confirmed",
    );

    expect(alreadySent).toHaveLength(2);
    expect(pending).toHaveLength(1);
    expect(pending[0].batchIndex).toBe(2);
  });

  it("does not double count queued rows when a job is reopened", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 960);

    const reopened = await getJob(job.id);

    expect(reopened?.queuedRows).toBe(1920);
    expect(reopened?.nextBatchIndex).toBe(2);
  });

  it("reports a fully queued job as having nothing left to send", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 40);

    const batches = await getBatches(job.id);
    const remaining = batches.filter(
      (batch) => batch.status !== "queued" && batch.status !== "confirmed",
    );

    // Resuming here must go straight to verification, not resend anything.
    expect(remaining).toHaveLength(0);
    expect((await getJob(job.id))?.queuedRows).toBe(1000);
  });
});

describe("repairQueuedTotal", () => {
  it("recomputes a total that drifted from re-sending", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 960);

    // Simulates the drift the old resume produced: a total larger than the
    // dataset, reported to the operator as progress.
    await updateJob(job.id, { queuedRows: 4000 });
    expect((await getJob(job.id))?.queuedRows).toBe(4000);

    const repaired = await repairQueuedTotal(job.id);

    expect(repaired).toBe(1920);
    expect((await getJob(job.id))?.queuedRows).toBe(1920);
  });

  it("is idempotent", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);

    const first = await repairQueuedTotal(job.id);
    const second = await repairQueuedTotal(job.id);

    expect(second).toBe(first);
  });

  it("never counts a batch that was never sent", async () => {
    const job = await createJob({ ...base, totalRows: 3000 });
    await queueBatch(job.id, 0, 960);

    expect(await repairQueuedTotal(job.id)).toBe(960);
  });

  it("queueing the same batch twice does not double the total", async () => {
    const job = await createJob({ ...base, totalRows: 2000 });

    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 0, 960);

    expect((await getJob(job.id))?.queuedRows).toBe(960);
  });
});

/**
 * Regression: a job whose rows were already stored reported 0 confirmed.
 *
 * `confirmedRows` was only written once, at the end of the settling phase. An
 * interrupted check — a navigation, a closed tab, a timeout — left the number
 * at zero for a channel that held every row, and the only apparent way out
 * was re-sending, which ThingSpeak rejects as duplicates.
 */
describe("confirmation progress survives an interruption", () => {
  it("persists a partial count without touching the job status", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 40);
    await setJobStatus(job.id, "verifying");

    await recordConfirmedRows(job.id, 640);

    const midFlight = await getJob(job.id);
    expect(midFlight?.confirmedRows).toBe(640);
    // Still verifying: a partial count is progress, not an outcome.
    expect(midFlight?.status).toBe("verifying");
  });

  it("keeps the recorded count when the check is cut short", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);
    await recordConfirmedRows(job.id, 500);

    // Simulates the operator navigating away mid-check.
    await setJobStatus(job.id, "paused");

    expect((await getJob(job.id))?.confirmedRows).toBe(500);
  });

  it("completes the job once every row is readable", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);
    await queueBatch(job.id, 1, 40);

    await reconcileJob(job.id, 1000);

    const done = await getJob(job.id);
    expect(done?.confirmedRows).toBe(1000);
    expect(done?.status).toBe("completed");
    expect(
      (await getBatches(job.id)).every((b) => b.status === "confirmed"),
    ).toBe(true);
  });

  it("does not complete a job that is only partly readable", async () => {
    const job = await createJob({ ...base, totalRows: 1000 });
    await queueBatch(job.id, 0, 960);

    await reconcileJob(job.id, 640);

    const partial = await getJob(job.id);
    expect(partial?.confirmedRows).toBe(640);
    expect(partial?.status).toBe("paused");
    // Batches stay unconfirmed so a later check can still resolve them.
    expect(
      (await getBatches(job.id)).some((b) => b.status === "confirmed"),
    ).toBe(false);
  });
});
