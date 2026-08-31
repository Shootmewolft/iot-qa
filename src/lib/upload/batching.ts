/**
 * Bulk-write limits for a free ThingSpeak account.
 *
 * Both numbers are enforced by ThingSpeak, not chosen by us: 960 messages per
 * bulk request, and at least 15 seconds between sequential bulk updates.
 * A paid account raises the batch size to 14,400, which is why this lives in
 * one place rather than scattered through the upload code.
 */
export const MAX_MESSAGES_PER_BATCH = 960;
export const MIN_SECONDS_BETWEEN_BATCHES = 15;

/**
 * How long to keep waiting for ThingSpeak to WRITE a bulk update.
 *
 * `bulk_update.json` answers HTTP 202 with `{"success": true}`: the rows are
 * queued, not stored. Measured against the live API on 2026-08-30, the same
 * 5-row payload took 74 seconds once and between 3.5 and 5 minutes another
 * time. The latency is variable, so this is a CEILING to give up at, never an
 * amount to sleep blindly — poll and stop as soon as the rows are readable.
 *
 * Nothing is lost while waiting; it simply is not readable yet. This is why a
 * batch cannot be verified right after sending it.
 */
export const BULK_SETTLE_TIMEOUT_SECONDS = 480;

/** How often to re-read the channel while waiting for the queue to drain. */
export const BULK_SETTLE_POLL_SECONDS = 30;

export type BatchPlan = {
  totalRows: number;
  batchSize: number;
  totalBatches: number;
  /**
   * Lower bound on wall-clock time, in seconds. Only the gaps BETWEEN batches
   * are counted: the requests themselves are not throttled, so N batches wait
   * N-1 times. Network time is excluded, which is why this is a floor and not
   * an estimate.
   */
  minimumDurationSeconds: number;
};

export function planBatches(
  totalRows: number,
  batchSize = MAX_MESSAGES_PER_BATCH,
): BatchPlan {
  const safeBatchSize = Math.max(
    1,
    Math.min(batchSize, MAX_MESSAGES_PER_BATCH),
  );
  const totalBatches = Math.ceil(Math.max(0, totalRows) / safeBatchSize);

  return {
    totalRows,
    batchSize: safeBatchSize,
    totalBatches,
    minimumDurationSeconds:
      Math.max(0, totalBatches - 1) * MIN_SECONDS_BETWEEN_BATCHES,
  };
}

/** Human-readable duration, e.g. "2 min 45 s". */
export function formatDuration(seconds: number): string {
  if (seconds <= 0) return "inmediato";

  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;

  const parts: string[] = [];
  if (hours > 0) parts.push(`${hours} h`);
  if (minutes > 0) parts.push(`${minutes} min`);
  if (rest > 0) parts.push(`${rest} s`);

  return parts.join(" ");
}
