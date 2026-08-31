import { describeSeries } from "@/lib/statistics/descriptive";

/**
 * Basic anomaly detection (spec section 18).
 *
 * Uses the modified Z-score, which is built on the median and the median
 * absolute deviation instead of the mean and standard deviation. The reason
 * is practical: a handful of extreme readings inflate the standard deviation
 * enough to hide themselves, so a plain Z-score is worst exactly when it
 * matters most.
 */

/** 0.6745 is the 75th percentile of the standard normal, which puts the
 * modified Z-score on the same scale as an ordinary one. */
const MAD_SCALE = 0.6745;

/** Above this, a reading is reported. 3.5 is the conventional cutoff. */
export const DEFAULT_ANOMALY_THRESHOLD = 3.5;

export type AnomalyPoint<T> = {
  item: T;
  value: number;
  score: number;
};

function median(sorted: number[]): number {
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

export function detectAnomalies<T>(
  items: T[],
  getValue: (item: T) => number | null | undefined,
  threshold = DEFAULT_ANOMALY_THRESHOLD,
): AnomalyPoint<T>[] {
  const values = items
    .map(getValue)
    .filter((v): v is number => typeof v === "number" && Number.isFinite(v));

  // Too few points to say anything about what is unusual.
  if (values.length < 5) return [];

  const sorted = [...values].sort((a, b) => a - b);
  const center = median(sorted);

  const deviations = values
    .map((value) => Math.abs(value - center))
    .sort((a, b) => a - b);
  const mad = median(deviations);

  /*
   * A zero MAD means over half the readings are identical. Falling back to
   * the standard deviation keeps a genuine spike detectable in an otherwise
   * flat series, instead of dividing by zero and flagging everything.
   */
  const spread = mad > 0 ? mad / MAD_SCALE : describeSeries(values).stdDev;
  if (!Number.isFinite(spread) || spread === 0) return [];

  const anomalies: AnomalyPoint<T>[] = [];

  for (const item of items) {
    const value = getValue(item);
    if (typeof value !== "number" || !Number.isFinite(value)) continue;

    const score = Math.abs(value - center) / spread;
    if (score > threshold) anomalies.push({ item, value, score });
  }

  return anomalies;
}
