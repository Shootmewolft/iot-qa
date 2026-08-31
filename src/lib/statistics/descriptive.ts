export type DescriptiveStats = {
  count: number;
  min: number;
  max: number;
  mean: number;
  median: number;
  stdDev: number;
  p25: number;
  p75: number;
  range: number;
};

/**
 * Linear-interpolated percentile over an already-sorted ascending array.
 * Matches the conventional definition used by spreadsheets, so a QA operator
 * checking our numbers in Excel gets the same answer.
 */
export function percentile(sorted: number[], fraction: number): number {
  if (sorted.length === 0) return Number.NaN;
  if (sorted.length === 1) return sorted[0];

  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);

  if (lower === upper) return sorted[lower];

  return sorted[lower] + (sorted[upper] - sorted[lower]) * (position - lower);
}

/**
 * Descriptive statistics over a series (spec section 18).
 *
 * Null readings are dropped rather than treated as zero: an entry with no
 * value for a field is not a measurement of zero, and averaging it in would
 * silently drag every result toward the origin.
 */
export function describeSeries(
  values: (number | null | undefined)[],
): DescriptiveStats {
  const clean = values.filter(
    (value): value is number =>
      typeof value === "number" && Number.isFinite(value),
  );

  if (clean.length === 0) {
    return {
      count: 0,
      min: Number.NaN,
      max: Number.NaN,
      mean: Number.NaN,
      median: Number.NaN,
      stdDev: Number.NaN,
      p25: Number.NaN,
      p75: Number.NaN,
      range: Number.NaN,
    };
  }

  const sorted = [...clean].sort((a, b) => a - b);
  const mean = clean.reduce((sum, value) => sum + value, 0) / clean.length;

  // Population standard deviation: we hold the entire dataset, not a sample.
  const variance =
    clean.reduce((sum, value) => sum + (value - mean) ** 2, 0) / clean.length;

  return {
    count: clean.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    mean,
    median: percentile(sorted, 0.5),
    stdDev: Math.sqrt(variance),
    p25: percentile(sorted, 0.25),
    p75: percentile(sorted, 0.75),
    range: sorted[sorted.length - 1] - sorted[0],
  };
}
