/**
 * Reduces a series for plotting.
 *
 * Plain stride sampling ("keep every Nth point") is rejected on purpose: it
 * drops whichever points fall between strides, and an injected anomaly is
 * exactly one such point. Bucketing and keeping each bucket's minimum and
 * maximum guarantees every spike survives, at the cost of a slightly jagged
 * line — which is the honest picture (spec sections 18 and 23).
 */
export function downsampleExtremes<T>(
  items: T[],
  targetPoints: number,
  getValue: (item: T) => number | null,
): T[] {
  if (targetPoints < 4 || items.length <= targetPoints) return items;

  const bucketCount = Math.floor(targetPoints / 2);
  const bucketSize = items.length / bucketCount;

  const keep = new Set<number>([0, items.length - 1]);

  for (let bucket = 0; bucket < bucketCount; bucket++) {
    const start = Math.floor(bucket * bucketSize);
    const end = Math.min(Math.floor((bucket + 1) * bucketSize), items.length);

    let minIndex = -1;
    let maxIndex = -1;
    let minValue = Number.POSITIVE_INFINITY;
    let maxValue = Number.NEGATIVE_INFINITY;

    for (let i = start; i < end; i++) {
      const value = getValue(items[i]);
      if (value === null || !Number.isFinite(value)) continue;

      if (value < minValue) {
        minValue = value;
        minIndex = i;
      }
      if (value > maxValue) {
        maxValue = value;
        maxIndex = i;
      }
    }

    if (minIndex >= 0) keep.add(minIndex);
    if (maxIndex >= 0) keep.add(maxIndex);
  }

  // Sorting restores chronological order, which the extremes pass destroys.
  return [...keep].sort((a, b) => a - b).map((index) => items[index]);
}
