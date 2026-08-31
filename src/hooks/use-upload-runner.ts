"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { getMeasurements } from "@/db/datasets";
import {
  getBatches,
  getJob,
  queueBatch,
  reconcileJob,
  recordConfirmedRows,
  repairQueuedTotal,
  setBatchStatus,
  setJobStatus,
} from "@/db/upload-jobs";
import {
  BULK_SETTLE_POLL_SECONDS,
  BULK_SETTLE_TIMEOUT_SECONDS,
  MAX_MESSAGES_PER_BATCH,
  MIN_SECONDS_BETWEEN_BATCHES,
} from "@/lib/upload/batching";
import {
  type BatchOutcome,
  decideAfterVerification,
  decideNextAction,
  MAX_AUTOMATIC_ATTEMPTS,
} from "@/lib/upload/policy";

/**
 * Browser-side upload orchestrator (MVP spec, section 15.4).
 *
 * The browser owns the schedule, not the server: a Vercel function must
 * return promptly, so it cannot sit through the mandatory 15-second gap
 * between bulk writes. Each request sends exactly one batch; this hook waits,
 * persists progress and decides what happens next.
 */

export type RunnerPhase =
  | "idle"
  | "sending"
  | "waiting"
  | "verifying"
  | "paused"
  /** Waiting for ThingSpeak to drain its queue before reading back. */
  | "settling"
  | "completed"
  | "failed"
  | "blocked";

export type RunnerState = {
  phase: RunnerPhase;
  jobId: string | null;
  /** Accepted by ThingSpeak but not yet readable. */
  queuedRows: number;
  /** Read back from the channel. The only number that is proof. */
  confirmedRows: number;
  totalRows: number;
  currentBatch: number;
  totalBatches: number;
  /** Seconds left before the next batch may be sent. */
  countdown: number;
  message: string | null;
  /** Set when a human must intervene; the runner will not continue. */
  blockedReason: string | null;
};

const INITIAL: RunnerState = {
  phase: "idle",
  jobId: null,
  queuedRows: 0,
  confirmedRows: 0,
  totalRows: 0,
  currentBatch: 0,
  totalBatches: 0,
  countdown: 0,
  message: null,
  blockedReason: null,
};

type ApiEnvelope<T> =
  | { ok: true; data: T; requestId: string }
  | { ok: false; error: { code: string; message: string }; requestId: string };

export function useUploadRunner() {
  const [state, setState] = useState<RunnerState>(INITIAL);

  // Refs rather than state: the loop reads these on every tick and must see
  // the current value, not the one captured when the render closed over it.
  const stopRequested = useRef(false);
  const running = useRef(false);

  useEffect(() => {
    return () => {
      stopRequested.current = true;
    };
  }, []);

  const patch = useCallback((changes: Partial<RunnerState>) => {
    setState((current) => ({ ...current, ...changes }));
  }, []);

  /** Interruptible wait that ticks the visible countdown once per second. */
  const waitSeconds = useCallback(
    async (seconds: number) => {
      for (let remaining = seconds; remaining > 0; remaining--) {
        if (stopRequested.current) return;
        patch({ phase: "waiting", countdown: remaining });
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
      patch({ countdown: 0 });
    },
    [patch],
  );

  const pause = useCallback(() => {
    stopRequested.current = true;
  }, []);

  const run = useCallback(
    async (jobId: string) => {
      if (running.current) return;
      running.current = true;
      stopRequested.current = false;

      try {
        /*
         * Web Locks stop two tabs of the SAME browser from running one
         * job at once, which would double-send every batch and get the
         * second copy rejected for duplicate timestamps (spec 15.9).
         *
         * It cannot reach another machine. That is why the MVP also
         * carries the one-active-operator rule.
         */
        if (typeof navigator !== "undefined" && "locks" in navigator) {
          const acquired = await navigator.locks.request(
            `upload-job:${jobId}`,
            { ifAvailable: true },
            async (lock) => {
              if (!lock) return false;
              await runJob(jobId, { patch, waitSeconds, stopRequested });
              return true;
            },
          );

          if (!acquired) {
            patch({
              phase: "blocked",
              blockedReason:
                "Otra pestaña de este navegador ya está ejecutando este trabajo.",
            });
          }
        } else {
          await runJob(jobId, { patch, waitSeconds, stopRequested });
        }
      } finally {
        running.current = false;
      }
    },
    [patch, waitSeconds],
  );

  /**
   * Re-checks a job against the channel without sending anything.
   *
   * The recovery path for a job whose rows are already stored but whose
   * verification was cut short. Re-running the upload instead would hit
   * duplicate timestamps and be rejected wholesale.
   */
  const verify = useCallback(
    async (jobId: string) => {
      if (running.current) return;
      running.current = true;
      stopRequested.current = false;

      try {
        const job = await getJob(jobId);
        if (!job) return;

        const rows = await getMeasurements(job.datasetId);

        patch({
          jobId,
          totalRows: job.totalRows,
          totalBatches: job.totalBatches,
          queuedRows: job.queuedRows,
          confirmedRows: job.confirmedRows,
          blockedReason: null,
        });

        await settleAndReconcile(jobId, job.totalRows, rows, {
          patch,
          waitSeconds,
          stopRequested,
        });
      } finally {
        running.current = false;
      }
    },
    [patch, waitSeconds],
  );

  return { state, run, verify, pause, reset: () => setState(INITIAL) };
}

/**
 * Each transport failure is its own union member with a single literal
 * discriminant. Collapsing them into `"offline" | "timeout"` would stop
 * TypeScript narrowing away the member when checking one of the two.
 */
type PostResult<T> =
  | { transport: "ok"; envelope: ApiEnvelope<T>; status: number }
  | { transport: "offline" }
  | { transport: "timeout" };

async function postJson<T>(url: string, body: unknown): Promise<PostResult<T>> {
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    return { transport: "offline" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });

    return {
      transport: "ok",
      envelope: (await response.json()) as ApiEnvelope<T>,
      status: response.status,
    };
  } catch {
    return { transport: "timeout" };
  }
}

async function runJob(
  jobId: string,
  ctx: {
    patch: (changes: Partial<RunnerState>) => void;
    waitSeconds: (seconds: number) => Promise<void>;
    stopRequested: { current: boolean };
  },
) {
  const { patch, waitSeconds, stopRequested } = ctx;

  const job = await getJob(jobId);
  if (!job) {
    patch({ phase: "failed", message: "El trabajo no existe." });
    return;
  }

  // Heal a total left inconsistent by an earlier run before showing progress.
  const queuedRows = await repairQueuedTotal(jobId);

  const rows = await getMeasurements(job.datasetId);
  const batches = await getBatches(jobId);

  patch({
    jobId,
    totalRows: job.totalRows,
    totalBatches: job.totalBatches,
    queuedRows,
    confirmedRows: job.confirmedRows,
    blockedReason: null,
    message: null,
  });

  await setJobStatus(jobId, "running");

  let sentThisRun = 0;

  for (const batch of batches) {
    /*
     * "queued" counts as already sent, not as pending.
     *
     * A batch reaches "confirmed" only during the final reconciliation, so
     * skipping just that state made a resumed job re-send every batch from
     * zero: the same timestamps went out again and `queuedRows` doubled.
     */
    if (batch.status === "queued" || batch.status === "confirmed") continue;

    if (stopRequested.current) {
      await setJobStatus(jobId, "paused");
      patch({ phase: "paused", message: "Trabajo pausado." });
      return;
    }

    // Batches after the first must respect the mandatory gap. This runs
    // before the send, so a resumed job also waits rather than firing
    // immediately after a batch the previous session had just sent.
    /*
     * The gap applies between OUR sends, not to the first one of a run. A
     * resumed job has already waited far longer than 15 seconds while it was
     * paused; making it wait again only delays the operator.
     */
    if (sentThisRun > 0) {
      await waitSeconds(MIN_SECONDS_BETWEEN_BATCHES);
      if (stopRequested.current) {
        await setJobStatus(jobId, "paused");
        patch({ phase: "paused", message: "Trabajo pausado." });
        return;
      }
    }

    const slice = rows
      .filter(
        (row) =>
          row.sequence >= batch.firstSequence &&
          row.sequence <= batch.lastSequence,
      )
      .map((row) => ({
        createdAt: row.createdAt,
        temperature: row.temperature,
        humidity: row.humidity,
      }));

    patch({
      phase: "sending",
      currentBatch: batch.batchIndex + 1,
      countdown: 0,
    });
    await setBatchStatus(jobId, batch.batchIndex, "sending");

    let attempt = 0;
    let settled = false;

    while (!settled && attempt < MAX_AUTOMATIC_ATTEMPTS) {
      const response = await postJson("/api/thingspeak/bulk", {
        jobId,
        batchIndex: batch.batchIndex,
        measurements: slice,
      });

      // Written as explicit branches rather than nested ternaries so that
      // TypeScript narrows the transport union before `envelope` is touched.
      let outcome: BatchOutcome;
      if (response.transport === "offline") {
        outcome = { kind: "offline" };
      } else if (response.transport === "timeout") {
        outcome = { kind: "timeout" };
      } else if (response.envelope.ok) {
        outcome = { kind: "ok" };
      } else {
        outcome = { kind: "http", status: response.status };
      }

      let decision = decideNextAction(outcome, attempt);

      if (decision.action === "verify") {
        patch({ phase: "verifying", message: decision.reason });
        await setBatchStatus(jobId, batch.batchIndex, "unknown");
        await setJobStatus(jobId, "verifying");

        const verification = await postJson<{
          outcome: "none" | "all" | "partial";
        }>("/api/thingspeak/verify-batch", {
          timestamps: slice.map((row) => row.createdAt),
        });

        if (verification.transport !== "ok" || !verification.envelope.ok) {
          await setJobStatus(jobId, "paused");
          patch({
            phase: "blocked",
            blockedReason:
              "No se pudo verificar el lote incierto. Reintentar a ciegas podría duplicar datos.",
          });
          return;
        }

        const verified = verification.envelope.data.outcome;

        /*
         * Reported success plus "nothing landed" is the silent
         * duplicate rejection. Retrying the identical bytes would
         * loop forever, so it stops and says what actually happened.
         */
        if (outcome.kind === "ok" && verified === "none") {
          await setBatchStatus(jobId, batch.batchIndex, "failed");
          await setJobStatus(jobId, "failed", {
            code: "BATCH_REJECTED",
            message:
              "ThingSpeak aceptó la solicitud pero no guardó ninguna fila. La causa habitual es que esos timestamps ya existen en el canal.",
            retryable: false,
          });
          patch({
            phase: "failed",
            message:
              "ThingSpeak aceptó la solicitud pero no guardó nada. Revisa si esos timestamps ya existen en el canal.",
          });
          return;
        }

        decision = decideAfterVerification(verified);
      }

      switch (decision.action) {
        case "confirm": {
          /*
           * HTTP 202 means queued, not written. The rows are counted
           * as queued and the cursor advances so the next batch can
           * go out; `reconcileJob` at the end is what turns them
           * into confirmed, after ThingSpeak has drained its queue.
           */
          await queueBatch(jobId, batch.batchIndex, slice.length);
          sentThisRun++;
          patch({
            queuedRows: await repairQueuedTotal(jobId),
            message: null,
          });
          settled = true;
          break;
        }
        case "wait": {
          await setBatchStatus(jobId, batch.batchIndex, "pending");
          await waitSeconds(decision.seconds);
          attempt++;
          break;
        }
        case "stop": {
          await setJobStatus(jobId, "paused", {
            code: "BATCH_STATUS_UNKNOWN",
            message: decision.reason,
            retryable: false,
          });
          patch({ phase: "blocked", blockedReason: decision.reason });
          return;
        }
        case "fail": {
          await setBatchStatus(jobId, batch.batchIndex, "failed");
          await setJobStatus(jobId, "failed", {
            code: "BATCH_REJECTED",
            message: decision.reason,
            retryable: false,
          });
          patch({ phase: "failed", message: decision.reason });
          return;
        }
      }
    }

    if (!settled) {
      await setJobStatus(jobId, "paused");
      patch({
        phase: "blocked",
        blockedReason: `El lote ${batch.batchIndex + 1} no se resolvió tras ${MAX_AUTOMATIC_ATTEMPTS} intentos.`,
      });
      return;
    }
  }

  await settleAndReconcile(jobId, job.totalRows, rows, ctx);
}

/**
 * Waits for ThingSpeak's queue to drain and reads the range back.
 *
 * Separated from the send loop so it can be run on its own: a job whose rows
 * are already in the channel needs verifying, not re-sending, and re-sending
 * would get every timestamp rejected as a duplicate.
 */
async function settleAndReconcile(
  jobId: string,
  totalRows: number,
  rows: { createdAt: string }[],
  ctx: {
    patch: (changes: Partial<RunnerState>) => void;
    waitSeconds: (seconds: number) => Promise<void>;
    stopRequested: { current: boolean };
  },
) {
  const { patch, waitSeconds, stopRequested } = ctx;

  await setJobStatus(jobId, "verifying");
  patch({
    phase: "settling",
    message:
      "Comprobando en el canal. ThingSpeak escribe unos segundos o minutos después de aceptar.",
  });

  /*
   * Poll instead of sleeping a fixed amount: the queue drained in 11 seconds
   * on one measured run and took minutes on another, so a fixed wait is
   * either wrong or wasteful. This stops the moment every row is readable.
   */
  let confirmed: number | null = await countConfirmedRows(rows);
  if (confirmed !== null) await recordConfirmedRows(jobId, confirmed);

  let waited = 0;

  while (
    waited < BULK_SETTLE_TIMEOUT_SECONDS &&
    (confirmed === null || confirmed < totalRows)
  ) {
    await waitSeconds(BULK_SETTLE_POLL_SECONDS);
    waited += BULK_SETTLE_POLL_SECONDS;

    if (stopRequested.current) {
      await setJobStatus(jobId, "paused");
      patch({ phase: "paused", message: "Comprobación pospuesta." });
      return;
    }

    confirmed = await countConfirmedRows(rows);

    // Persisted on every poll, not just at the end: an interrupted check must
    // not leave the job claiming zero rows for a channel that holds them all.
    if (confirmed !== null) await recordConfirmedRows(jobId, confirmed);

    patch({
      confirmedRows: confirmed ?? 0,
      message: `Comprobando en el canal: ${confirmed ?? 0} de ${totalRows} filas visibles tras ${waited} s.`,
    });
  }

  /*
   * A channel we could not read is NOT a channel that lost the rows. Saying
   * so would push the operator toward a resend that would then be rejected
   * for duplicate timestamps.
   */
  if (confirmed === null) {
    await setJobStatus(jobId, "paused");
    patch({
      phase: "blocked",
      countdown: 0,
      blockedReason:
        "No se pudo leer el canal para comprobar la carga. Los datos pueden estar perfectamente: vuelve a comprobar antes de reenviar nada.",
    });
    return;
  }

  await reconcileJob(jobId, confirmed);

  if (confirmed >= totalRows) {
    patch({
      phase: "completed",
      confirmedRows: confirmed,
      countdown: 0,
      message: `Carga completada y verificada: ${confirmed} filas en el canal.`,
    });
    return;
  }

  patch({
    phase: "blocked",
    confirmedRows: confirmed,
    countdown: 0,
    blockedReason: `Solo ${confirmed} de ${totalRows} filas son visibles tras ${BULK_SETTLE_TIMEOUT_SECONDS} s. ThingSpeak puede seguir procesando: usa «Comprobar» más tarde, nunca reenviar, o los timestamps se rechazarán por duplicados.`,
  });
}

/**
 * Counts how many of the dataset's rows are actually readable in the channel.
 *
 * Asks in windows of at most one batch so the request stays inside the API's
 * 8,000-result ceiling. Returns null if the channel could not be read, which
 * is NOT the same as "the rows are missing".
 */
async function countConfirmedRows(
  rows: { createdAt: string }[],
): Promise<number | null> {
  let confirmed = 0;

  for (let offset = 0; offset < rows.length; offset += MAX_MESSAGES_PER_BATCH) {
    const window = rows
      .slice(offset, offset + MAX_MESSAGES_PER_BATCH)
      .map((row) => row.createdAt);

    const response = await postJson<{ found: number }>(
      "/api/thingspeak/verify-batch",
      { timestamps: window },
    );

    if (response.transport !== "ok" || !response.envelope.ok) return null;
    confirmed += response.envelope.data.found;
  }

  return confirmed;
}
