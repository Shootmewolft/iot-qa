import { MAX_RESULTS_PER_READ } from "@/lib/thingspeak/query";

/**
 * Pre-flight collision check.
 *
 * ThingSpeak rejects an ENTIRE bulk batch when a single timestamp already
 * exists in the channel. Validating a dataset against itself is not enough:
 * the ESP32 has been writing every 20 seconds, so a historical dataset that
 * overlaps that window fails on its first batch with nothing to act on.
 *
 * Catching it here turns a mid-upload failure into a decision the operator
 * makes before anything is sent.
 */

export type PreflightReport = {
  /** Timestamps the dataset shares with the channel. */
  collisions: string[];
  datasetRows: number;
  existingInRange: number;
  range: { start: string; end: string } | null;
  /**
   * True when the channel read hit ThingSpeak's 8,000-entry ceiling, so
   * unseen entries may exist and the check cannot be called exhaustive.
   */
  truncated: boolean;
};

export function buildPreflightReport(
  datasetTimestamps: string[],
  channelTimestamps: string[],
): PreflightReport {
  if (datasetTimestamps.length === 0) {
    return {
      collisions: [],
      datasetRows: 0,
      existingInRange: channelTimestamps.length,
      range: null,
      truncated: false,
    };
  }

  const sorted = [...datasetTimestamps].sort();
  const existing = new Set(channelTimestamps);

  return {
    collisions: sorted.filter((timestamp) => existing.has(timestamp)),
    datasetRows: datasetTimestamps.length,
    existingInRange: channelTimestamps.length,
    range: { start: sorted[0], end: sorted[sorted.length - 1] },
    truncated: channelTimestamps.length >= MAX_RESULTS_PER_READ,
  };
}

/** Splits rows into batches of at most `size`, preserving order. */
export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    batches.push(items.slice(offset, offset + size));
  }
  return batches;
}
